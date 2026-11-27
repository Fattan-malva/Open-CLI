use super::dag::{validate_dag, DagTask, DagValidation, Risk, Scope};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PlanTask {
    pub id: String,
    pub title: String,
    pub objective: String,
    pub description: String,
    pub acceptance: Vec<String>,
    pub dependencies: Vec<String>,
    pub scope: Scope,
    pub complexity: Risk,
    pub risk: Risk,
    pub required_capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Plan {
    pub rationale: String,
    pub risks: Vec<String>,
    pub tasks: Vec<PlanTask>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPlan {
    pub plan: Plan,
    pub validation: DagValidation,
}

/// Returns the outermost `{...}` span, so planners that add prose around the JSON still parse.
pub fn extract_json(raw: &str) -> &str {
    let trimmed = raw.trim();
    match (trimmed.find('{'), trimmed.rfind('}')) {
        (Some(start), Some(end)) if end > start => &trimmed[start..=end],
        _ => trimmed,
    }
}

fn valid_id(id: &str) -> bool {
    let mut chars = id.chars();
    match chars.next() {
        Some(first) if first.is_ascii_lowercase() || first.is_ascii_digit() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// Parses planner output, enforces the schema rules, and validates the DAG.
pub fn parse_plan(raw: &str) -> Result<ParsedPlan, String> {
    let plan: Plan = serde_json::from_str(extract_json(raw))
        .map_err(|error| format!("Planner output failed schema validation: {}", error))?;
    if plan.tasks.is_empty() {
        return Err("Planner output failed schema validation: plan needs at least one task".into());
    }
    for task in &plan.tasks {
        if !valid_id(&task.id) {
            return Err(format!(
                "Planner output failed schema validation: invalid task id \"{}\"",
                task.id
            ));
        }
        if task.title.trim().is_empty() || task.objective.trim().is_empty() {
            return Err(format!(
                "Planner output failed schema validation: task {} needs a title and objective",
                task.id
            ));
        }
    }
    let dag_tasks: Vec<DagTask> = plan.tasks.iter().map(to_dag_task).collect();
    let validation = validate_dag(&dag_tasks);
    if !validation.ok {
        let messages: Vec<String> = validation.issues.iter().map(|issue| issue.message.clone()).collect();
        return Err(format!(
            "Planner output failed DAG validation: {}",
            messages.join("; ")
        ));
    }
    Ok(ParsedPlan { plan, validation })
}

pub fn to_dag_task(task: &PlanTask) -> DagTask {
    DagTask {
        id: task.id.clone(),
        dependencies: task.dependencies.clone(),
        acceptance: task.acceptance.clone(),
        scope: task.scope.clone(),
        risk: task.risk,
        status: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = r#"Here is the plan:
    {"rationale":"r","risks":[],"tasks":[
      {"id":"landing","title":"Landing","objective":"Build it","acceptance":["renders"],
       "scope":{"allowedPaths":["src"]}}
    ]}"#;

    #[test]
    fn parses_plan_wrapped_in_prose() {
        let parsed = parse_plan(VALID).expect("valid plan");
        assert_eq!(parsed.plan.tasks.len(), 1);
        assert!(parsed.validation.ok);
    }

    #[test]
    fn rejects_invalid_ids_and_cycles() {
        let bad_id = VALID.replace("\"landing\"", "\"Bad Id\"");
        assert!(parse_plan(&bad_id).is_err());
        let cyclic = r#"{"tasks":[
          {"id":"a","title":"A","objective":"o","acceptance":["x"],"dependencies":["b"]},
          {"id":"b","title":"B","objective":"o","acceptance":["x"],"dependencies":["a"]}]}"#;
        let error = parse_plan(cyclic).unwrap_err();
        assert!(error.contains("DAG validation"));
    }

    #[test]
    fn rejects_empty_plan() {
        assert!(parse_plan(r#"{"tasks":[]}"#).is_err());
    }
}
