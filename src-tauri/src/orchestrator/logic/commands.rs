use super::context::{build_plan_prompt, build_task_prompt, clamp, PlanPromptInput, TaskPromptInput};
use super::dag::{validate_dag, DagTask, DagValidation};
use super::planner::{parse_plan, ParsedPlan};
use super::scheduler::{select_dispatchable, should_unblock, DispatchDecision, SchedulerInput};
use super::state::{
    can_transition_agent, can_transition_run, can_transition_task, AgentState, RunState, TaskState,
};
use super::validation::{build_report, validate_evidence, Evidence, FinalReport, ReportInput, ValidationResult};

#[tauri::command]
pub fn orchestrator_validate_dag(tasks: Vec<DagTask>) -> DagValidation {
    validate_dag(&tasks)
}

#[tauri::command]
pub fn orchestrator_should_unblock(tasks: Vec<DagTask>, completed_id: String) -> Vec<String> {
    should_unblock(&tasks, &completed_id)
        .into_iter()
        .map(|task| task.id)
        .collect()
}

#[tauri::command]
pub fn orchestrator_select_dispatchable(input: SchedulerInput) -> Vec<DispatchDecision> {
    select_dispatchable(&input)
}

#[tauri::command]
pub fn orchestrator_validate_evidence(
    acceptance: Vec<String>,
    evidence: Option<Evidence>,
) -> ValidationResult {
    validate_evidence(&acceptance, evidence.as_ref())
}

#[tauri::command]
pub fn orchestrator_build_report(input: ReportInput) -> FinalReport {
    build_report(&input)
}

#[tauri::command]
pub fn orchestrator_can_transition_run(from: RunState, to: RunState) -> bool {
    can_transition_run(from, to)
}

#[tauri::command]
pub fn orchestrator_can_transition_task(from: TaskState, to: TaskState) -> bool {
    can_transition_task(from, to)
}

#[tauri::command]
pub fn orchestrator_can_transition_agent(from: AgentState, to: AgentState) -> bool {
    can_transition_agent(from, to)
}

#[tauri::command]
pub fn orchestrator_build_plan_prompt(input: PlanPromptInput) -> String {
    build_plan_prompt(&input)
}

#[tauri::command]
pub fn orchestrator_build_task_prompt(input: TaskPromptInput) -> String {
    build_task_prompt(&input)
}

#[tauri::command]
pub fn orchestrator_parse_plan(raw: String) -> Result<ParsedPlan, String> {
    parse_plan(&raw)
}

#[tauri::command]
pub fn orchestrator_clamp(text: String, max: usize) -> String {
    clamp(&text, max)
}
