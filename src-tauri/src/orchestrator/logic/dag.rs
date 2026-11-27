use super::state::TaskState;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Risk {
    Low,
    #[default]
    Medium,
    High,
}

impl Risk {
    fn weight(self) -> u32 {
        match self {
            Risk::Low => 1,
            Risk::Medium => 2,
            Risk::High => 3,
        }
    }

    fn rank(self) -> u8 {
        match self {
            Risk::High => 2,
            Risk::Medium => 1,
            Risk::Low => 0,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Scope {
    pub allowed_paths: Vec<String>,
    pub forbidden_paths: Vec<String>,
    pub interfaces: Vec<String>,
}

/// A task as seen by the DAG logic. `status` is `None` for plan drafts that
/// have not been persisted yet, mirroring `TaskDraft` vs `Task` in TypeScript.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DagTask {
    pub id: String,
    pub dependencies: Vec<String>,
    pub acceptance: Vec<String>,
    pub scope: Scope,
    pub risk: Risk,
    pub status: Option<TaskState>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueCode {
    DuplicateId,
    UnknownDependency,
    Cycle,
    EmptyTasks,
    EmptyAcceptance,
    ScopeOverlap,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DagIssue {
    pub code: IssueCode,
    pub message: String,
    pub task_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DagValidation {
    pub ok: bool,
    pub issues: Vec<DagIssue>,
    pub order: Vec<String>,
    pub critical_path: Vec<String>,
}

fn normalized(path: &str) -> String {
    let replaced = path.replace('\\', "/");
    let trimmed = replaced.strip_prefix("./").unwrap_or(&replaced);
    trimmed.trim_end_matches('/').to_string()
}

fn path_touches(path: &str, candidate: &str) -> bool {
    let a = normalized(path);
    let b = normalized(candidate);
    if a == b {
        return true;
    }
    if a.is_empty() || b.is_empty() {
        return false;
    }
    a.starts_with(&format!("{}/", b)) || b.starts_with(&format!("{}/", a))
}

fn scope_overlaps(a: &Scope, b: &Scope) -> bool {
    for left in &a.allowed_paths {
        if b.allowed_paths.iter().any(|right| path_touches(left, right)) {
            return true;
        }
        if b.forbidden_paths.iter().any(|right| path_touches(left, right)) {
            return true;
        }
    }
    for right in &b.allowed_paths {
        if a.forbidden_paths.iter().any(|left| path_touches(left, right)) {
            return true;
        }
    }
    false
}

pub fn detect_scope_conflicts(tasks: &[DagTask]) -> Vec<DagIssue> {
    let mut issues = Vec::new();
    for i in 0..tasks.len() {
        for j in (i + 1)..tasks.len() {
            let left = &tasks[i];
            let right = &tasks[j];
            let contracts_shared = left
                .scope
                .interfaces
                .iter()
                .any(|item| right.scope.interfaces.contains(item));
            let ordered = left.dependencies.contains(&right.id) || right.dependencies.contains(&left.id);
            if contracts_shared || ordered {
                continue;
            }
            if scope_overlaps(&left.scope, &right.scope) {
                issues.push(DagIssue {
                    code: IssueCode::ScopeOverlap,
                    message: format!(
                        "Scopes of {} and {} overlap without a contract or dependency",
                        left.id, right.id
                    ),
                    task_ids: vec![left.id.clone(), right.id.clone()],
                });
            }
        }
    }
    issues
}

/// Kahn's algorithm. Ties are broken by the smallest id, matching the sorted queue in TypeScript.
pub fn topological_order(tasks: &[DagTask]) -> Option<Vec<String>> {
    let ids: HashSet<&str> = tasks.iter().map(|task| task.id.as_str()).collect();
    let mut indegree: HashMap<&str, usize> = HashMap::new();
    let mut children: HashMap<&str, Vec<&str>> = HashMap::new();
    for task in tasks {
        indegree.insert(task.id.as_str(), 0);
        children.insert(task.id.as_str(), Vec::new());
    }
    for task in tasks {
        let deps: Vec<&str> = task
            .dependencies
            .iter()
            .filter(|dep| ids.contains(dep.as_str()))
            .map(String::as_str)
            .collect();
        indegree.insert(task.id.as_str(), deps.len());
        for dep in deps {
            children.entry(dep).or_default().push(task.id.as_str());
        }
    }
    let mut queue: BTreeSet<&str> = indegree
        .iter()
        .filter(|(_, degree)| **degree == 0)
        .map(|(id, _)| *id)
        .collect();
    let mut order = Vec::with_capacity(tasks.len());
    while let Some(id) = queue.iter().next().copied() {
        queue.remove(id);
        order.push(id.to_string());
        for child in children.get(id).cloned().unwrap_or_default() {
            let degree = indegree.get(child).copied().unwrap_or(0).saturating_sub(1);
            indegree.insert(child, degree);
            if degree == 0 {
                queue.insert(child);
            }
        }
    }
    (order.len() == tasks.len()).then_some(order)
}

pub fn critical_path(tasks: &[DagTask]) -> Vec<String> {
    let order = match topological_order(tasks) {
        Some(order) => order,
        None => return Vec::new(),
    };
    let by_id: HashMap<&str, &DagTask> = tasks.iter().map(|task| (task.id.as_str(), task)).collect();
    let mut best: HashMap<String, u32> = HashMap::new();
    let mut best_order: Vec<String> = Vec::new();
    let mut next: HashMap<String, Option<String>> = HashMap::new();
    for id in &order {
        let Some(task) = by_id.get(id.as_str()) else { continue };
        let mut best_dep: Option<String> = None;
        let mut best_value: u32 = 0;
        for dep in &task.dependencies {
            let value = best.get(dep).copied().unwrap_or(0);
            let better = value > best_value
                || (value == best_value && best_dep.as_ref().map_or(true, |current| dep < current));
            if better {
                best_value = value;
                best_dep = Some(dep.clone());
            }
        }
        best.insert(id.clone(), best_value + task.risk.weight());
        best_order.push(id.clone());
        next.insert(id.clone(), best_dep);
    }
    let mut current: Option<String> = None;
    let mut max = 0u32;
    for id in &best_order {
        let value = best[id];
        if value > max {
            max = value;
            current = Some(id.clone());
        }
    }
    let mut path = Vec::new();
    while let Some(id) = current {
        current = next.get(&id).cloned().flatten();
        path.insert(0, id);
    }
    path
}

pub fn validate_dag(tasks: &[DagTask]) -> DagValidation {
    let mut issues = Vec::new();
    if tasks.is_empty() {
        issues.push(DagIssue {
            code: IssueCode::EmptyTasks,
            message: "Plan contains no tasks".into(),
            task_ids: vec![],
        });
    }
    let mut seen: HashSet<&str> = HashSet::new();
    for task in tasks {
        if !seen.insert(task.id.as_str()) {
            issues.push(DagIssue {
                code: IssueCode::DuplicateId,
                message: format!("Duplicate task id {}", task.id),
                task_ids: vec![task.id.clone()],
            });
        }
        if task.acceptance.is_empty() {
            issues.push(DagIssue {
                code: IssueCode::EmptyAcceptance,
                message: format!("Task {} has no acceptance criteria", task.id),
                task_ids: vec![task.id.clone()],
            });
        }
    }
    for task in tasks {
        for dep in &task.dependencies {
            if !seen.contains(dep.as_str()) {
                issues.push(DagIssue {
                    code: IssueCode::UnknownDependency,
                    message: format!("Task {} depends on unknown task {}", task.id, dep),
                    task_ids: vec![task.id.clone(), dep.clone()],
                });
            }
            if dep == &task.id {
                issues.push(DagIssue {
                    code: IssueCode::Cycle,
                    message: format!("Task {} depends on itself", task.id),
                    task_ids: vec![task.id.clone()],
                });
            }
        }
    }
    let order = topological_order(tasks);
    if order.is_none() {
        issues.push(DagIssue {
            code: IssueCode::Cycle,
            message: "Task graph contains a dependency cycle".into(),
            task_ids: tasks.iter().map(|task| task.id.clone()).collect(),
        });
    }
    issues.extend(detect_scope_conflicts(tasks));
    DagValidation {
        ok: issues.is_empty(),
        issues,
        order: order.unwrap_or_default(),
        critical_path: critical_path(tasks),
    }
}

/// A task is ready when every dependency exists and has completed.
pub fn is_ready(tasks: &[DagTask], task: &DagTask) -> bool {
    task.dependencies.iter().all(|dep| {
        tasks
            .iter()
            .find(|item| &item.id == dep)
            .map_or(false, |parent| parent.status == Some(TaskState::Completed))
    })
}

/// Orders tasks by critical-path membership, then risk (high first), then id.
pub fn rank_by_priority(tasks: &[DagTask], path: &[String]) -> Vec<DagTask> {
    let total = path.len();
    let path_rank: HashMap<&str, usize> = path
        .iter()
        .enumerate()
        .map(|(index, id)| (id.as_str(), total - index))
        .collect();
    let mut ranked: Vec<DagTask> = tasks.to_vec();
    ranked.sort_by(|a, b| {
        let a_rank = path_rank.get(a.id.as_str()).copied().unwrap_or(0);
        let b_rank = path_rank.get(b.id.as_str()).copied().unwrap_or(0);
        b_rank
            .cmp(&a_rank)
            .then_with(|| b.risk.rank().cmp(&a.risk.rank()))
            .then_with(|| a.id.cmp(&b.id))
    });
    ranked
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str, deps: &[&str]) -> DagTask {
        DagTask {
            id: id.into(),
            dependencies: deps.iter().map(|d| d.to_string()).collect(),
            acceptance: vec!["done".into()],
            ..Default::default()
        }
    }

    #[test]
    fn orders_tasks_topologically() {
        let tasks = vec![task("c", &["a", "b"]), task("a", &[]), task("b", &["a"])];
        assert_eq!(topological_order(&tasks), Some(vec!["a".into(), "b".into(), "c".into()]));
    }

    #[test]
    fn detects_cycles() {
        let tasks = vec![task("a", &["b"]), task("b", &["a"])];
        let result = validate_dag(&tasks);
        assert!(!result.ok);
        assert!(result.issues.iter().any(|issue| issue.code == IssueCode::Cycle));
    }

    #[test]
    fn reports_missing_acceptance_and_unknown_dependencies() {
        let mut bad = task("a", &["ghost"]);
        bad.acceptance.clear();
        let result = validate_dag(&[bad]);
        let codes: Vec<IssueCode> = result.issues.iter().map(|issue| issue.code.clone()).collect();
        assert!(codes.contains(&IssueCode::EmptyAcceptance));
        assert!(codes.contains(&IssueCode::UnknownDependency));
    }

    #[test]
    fn flags_overlapping_scopes_without_dependency() {
        let mut a = task("a", &[]);
        a.scope.allowed_paths = vec!["src/ui".into()];
        let mut b = task("b", &[]);
        b.scope.allowed_paths = vec!["src/ui/button.tsx".into()];
        let result = validate_dag(&[a.clone(), b.clone()]);
        assert!(result.issues.iter().any(|issue| issue.code == IssueCode::ScopeOverlap));

        b.dependencies = vec!["a".into()];
        assert!(!validate_dag(&[a, b]).issues.iter().any(|issue| issue.code == IssueCode::ScopeOverlap));
    }

    #[test]
    fn critical_path_follows_heaviest_chain() {
        let mut a = task("a", &[]);
        a.risk = Risk::High;
        let b = task("b", &["a"]);
        let c = task("c", &[]);
        assert_eq!(critical_path(&[a, b, c]), vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn readiness_requires_completed_dependencies() {
        let mut parent = task("a", &[]);
        parent.status = Some(TaskState::Running);
        let child = task("b", &["a"]);
        assert!(!is_ready(&[parent.clone(), child.clone()], &child));
        parent.status = Some(TaskState::Completed);
        assert!(is_ready(&[parent, child.clone()], &child));
    }
}
