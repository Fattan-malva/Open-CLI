//! Port of coordinator/coordinator-dag-convergence.ts.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DagConvergence {
    Empty,
    AllDone,
    Active,
}

pub struct TaskStatusRow {
    pub status: String,
}

pub fn evaluate_dag_convergence(tasks: &[TaskStatusRow], on_log: &mut dyn FnMut(String)) -> DagConvergence {
    if tasks.is_empty() {
        return DagConvergence::Empty;
    }
    let all_done = tasks.iter().all(|t| t.status == "completed" || t.status == "failed");
    if all_done {
        return DagConvergence::AllDone;
    }
    // With no active task, blocked dependencies can never be satisfied.
    let active = tasks.iter().filter(|t| matches!(t.status.as_str(), "ready" | "dispatched" | "pending")).count();
    let blocked = tasks.iter().filter(|t| t.status == "blocked").count();
    if active == 0 && blocked > 0 {
        on_log(format!("Stuck: {blocked} tasks blocked with no active tasks. Resolve decision gates to continue."));
    }
    DagConvergence::Active
}
