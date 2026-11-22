# OpenCLI — Claude Code Project Instructions

## Project Scope

This workspace is dedicated exclusively to the **OpenCLI** project.

- GitHub repository: https://github.com/Fattan-malva/Open-CLI.git
- Product: AI-powered multi-agent coding desktop application
- Platform: Desktop application
- Primary development platform: Windows
- Primary branch: `master`
- Development environment: Windows desktop development

Do not apply assumptions, code, architecture, configuration, or changes from unrelated projects unless the user explicitly requests them.

---

# PATENT PROJECT GOALS

These goals are the permanent foundation of OpenCLI. Every implementation, architectural decision, feature, optimization, and UI change must align with them.

## 1. Lightweight

OpenCLI must remain lightweight.

- Minimize CPU, RAM, disk, and background resource consumption.
- Avoid unnecessary processes, services, dependencies, abstractions, and duplicated runtimes.
- Do not introduce heavy frameworks or dependencies without a clear justification.
- Optimize application startup, idle usage, agent startup, terminal responsiveness, and UI rendering.
- Avoid memory leaks, unnecessary polling, redundant event listeners, and uncontrolled background tasks.
- Keep the application responsive even when multiple coding agents are running.

## 2. Fast

Performance and speed are core product features, not optional optimizations.

- Minimize application startup time.
- Minimize UI interaction latency.
- Minimize orchestration overhead.
- Minimize agent activation and switching delays.
- Minimize task dispatch and communication latency.
- Use event-driven communication instead of unnecessary polling wherever practical.
- Avoid blocking the UI thread with heavy work.
- Perform operations concurrently when safe and beneficial.
- Avoid unnecessary serialization, filesystem scans, and repeated computations.
- Keep terminal output and event streaming responsive in real time.

Every new feature must be evaluated for its performance impact.

## 3. Functional

Every feature must be genuinely functional and fully integrated.

- Implement real functionality, not UI-only mockups.
- Buttons, actions, menus, controls, settings, and workflows must work as intended.
- Avoid fake progress, simulated agent execution, static production data, and placeholder results.
- Ensure frontend, backend, adapter, runtime, events, and state management are properly connected.
- Handle success, failure, cancellation, timeouts, retries, and unexpected agent termination appropriately.
- Ensure state transitions are valid and predictable.
- Do not consider a feature complete merely because it compiles or looks correct.

## 4. Consistent

OpenCLI must behave consistently across the entire application.

- Maintain consistent UI/UX, terminology, state behavior, events, controls, and interactions.
- Use shared implementations where appropriate instead of duplicating logic.
- Maintain consistent adapter interfaces and execution contracts across supported coding agents.
- Ensure the same action produces predictable behavior across different sessions.
- Avoid conflicting states between the UI, terminal, orchestrator, adapters, and background runtime.
- Maintain a single reliable source of truth for shared state wherever practical.
- Preserve existing design conventions and behavior.

## 5. Compatible

OpenCLI must be compatible with supported environments, tools, and agent CLIs.

- Prioritize Windows compatibility and native desktop development.
- Maintain compatibility with supported Windows versions and system configurations.
- Ensure compatibility with installed coding agent CLIs and their available versions.
- Detect supported agents, versions, paths, executables, capabilities, and runtime availability dynamically.
- Do not assume every user has identical hardware, software, permissions, terminal configuration, or installed agents.
- Handle missing CLIs, incompatible versions, missing dependencies, restricted permissions, and environment differences gracefully.
- Avoid hardcoding machine-specific paths or assumptions.
- Maintain cross-platform compatibility when the existing architecture supports or intends to support it.
- Do not sacrifice Windows stability to implement cross-platform abstractions unnecessarily.

## 6. Equal Performance Across Specifications

OpenCLI must deliver a consistent experience across different hardware specifications, not just high-end computers.

The objective is to make the application perform as consistently as possible on both lower-specification and higher-specification machines.

- Avoid designs that unnecessarily depend on high CPU, RAM, GPU, or disk performance.
- Use adaptive resource management when appropriate.
- Avoid spawning unnecessary concurrent processes.
- Manage agent concurrency according to system resources and workload.
- Ensure lower-specification devices remain usable and responsive.
- Prevent resource exhaustion when multiple agents, terminals, or projects are active.
- Prefer efficient algorithms, incremental processing, streaming, and lazy loading.
- Avoid unnecessary rendering and state updates.
- Optimize for predictable performance instead of peak performance on high-end hardware.
- Do not introduce resource-heavy features that degrade the entire application when activated.

<text weight="medium">Performance consistency is more important than adding unnecessary complexity or maximizing concurrency.</text>

---

# Core Working Rules

1. Before making changes, inspect the repository structure, current branch, working-tree status, relevant files, architecture, and existing implementation.
2. Always synchronize and verify the latest GitHub commit before starting implementation.
3. Understand how the current implementation works before modifying it. Avoid unnecessary rewrites or unrelated refactoring.
4. Preserve existing features, UI/UX, architecture, conventions, and working behavior unless the requested task explicitly requires changes.
5. Implement requested work end-to-end. Do not leave placeholder implementations, TODO-only solutions, fake production data, or unfinished wiring.
6. Prefer focused, maintainable changes. Avoid adding dependencies unless they provide clear value and meet OpenCLI performance goals.
7. Never overwrite or discard the user's existing uncommitted work. Review diffs before staging, reverting, merging, or rebasing.
8. If requirements are ambiguous or a risky/destructive action is involved, ask the user before proceeding.
9. Do not redesign existing interfaces or change unrelated functionality as a side effect of implementing a feature.
10. Prioritize real functionality, stability, performance, compatibility, and correctness over unnecessary visual changes or architectural complexity.

---

# Git Synchronization & Latest Commit Protection

This section is mandatory for every implementation task.

## Before Starting Any Work

1. Check the current branch and working-tree status.
2. Fetch the latest updates from the GitHub remote.
3. Check the latest commit on the remote `master` branch.
4. Compare the local branch HEAD against the remote `master` HEAD.
5. Review recent commit history to understand what has changed since the local version.
6. Ensure the local working environment is based on the latest code before implementing anything.

## Synchronization Rules

- Never begin implementation using an outdated local commit when newer commits exist on GitHub.
- Always use the latest `master` as the baseline for new implementation work.
- If the local repository is behind, update it safely before starting.
- Prefer fast-forward synchronization whenever possible.
- Do not force-push, reset hard, overwrite local work, or discard changes as a shortcut to synchronization.
- If uncommitted local changes exist, inspect and protect them before pulling, rebasing, merging, or switching branches.
- If local and remote histories have diverged, inspect the commits and differences before deciding how to reconcile them.
- Do not blindly merge or rebase if doing so could overwrite existing user work.
- If synchronization cannot be completed safely, stop and explain the situation before implementation.
- Never assume that the local `master` branch is the latest version just because it exists.

## Latest Commit Verification

Before implementation, confirm:

- [ ] Remote changes have been fetched.
- [ ] The latest remote `master` commit has been identified.
- [ ] The local baseline matches the latest remote `master`, or divergence has been safely resolved.
- [ ] Recent commits have been reviewed.
- [ ] Existing uncommitted changes have been preserved.

The purpose is to prevent outdated code, duplicate implementations, merge conflicts, regressions, and unnecessary rework.

---

# GitHub and Git Workflow

Use the available **GitHub plugin/integration** to inspect and work with this repository whenever it is available.

Prefer the integration for:

- Repository inspection.
- Commit history.
- Branches.
- Pull requests.
- Issues.
- Remote changes.
- Other supported GitHub operations.

If the integration is unavailable, use the local Git repository and clearly report the limitation when relevant.

## Branch and Push Requirements

- The final target branch is always `master`.
- When the user asks to implement, fix, update, or complete work that is intended to be delivered, ensure the finished changes are committed and pushed to `master`, unless the user explicitly says otherwise.
- Do not silently deliver work only on another branch.
- Before pushing, fetch and check remote changes again to ensure `master` has not moved during implementation.
- If new commits have appeared during implementation, integrate them safely and rerun relevant checks.
- Verify that the final commit is based on the latest remote history.
- Review the final diff before pushing.
- Check for secrets, accidental files, unwanted generated artifacts, and unrelated changes.
- Do not force-push, rewrite history, or delete branches unless explicitly authorized.
- Do not commit secrets, credentials, private keys, tokens, local environment files, build artifacts, or generated files that should not be tracked.
- If a push fails, diagnose and report the actual reason. Never claim it was pushed if it was not.

## Required Git Workflow

Fetch → Verify Latest Commit → Inspect Changes → Synchronize Safely → Implement → Test → Review Diff → Fetch Again → Reconcile if Needed → Commit → Push to `master` → Verify Remote Commit

---

# Desktop Development & Windows Verification

OpenCLI is a desktop application. Desktop functionality and Windows compatibility are the primary acceptance criteria.

## Windows Development Requirements

When implementing, fixing, or modifying desktop features:

1. Inspect the existing desktop framework, runtime, build system, and Windows integration.
2. Use the project's existing desktop development workflow.
3. Ensure the desktop application can start in the Windows development environment.
4. Verify actual desktop behavior, not only the browser version or isolated frontend.
5. Test native desktop integrations when affected.
6. Check terminal, process management, filesystem access, IPC/bridge, permissions, and OS-specific behavior when relevant to the change.
7. Ensure the desktop application remains responsive and does not freeze during background operations.
8. Check for startup errors, runtime exceptions, broken IPC, missing assets, or failed native modules.
9. Confirm that the feature works in the actual desktop environment before considering it complete.

## Desktop Development Acceptance

<text weight="medium">If OpenCLI successfully runs in its Windows desktop development environment and the requested functionality works correctly in that environment, the development verification is considered successful.</text>

The following are separate validation levels and must not be confused:

- **Code validation:** lint, type checks, unit tests, static checks.
- **Build validation:** desktop application compiles or bundles successfully.
- **Desktop runtime validation:** desktop application launches and runs successfully on Windows.
- **Feature validation:** the requested feature actually works in the desktop environment.
- **Release validation:** packaged installer or distributable is verified, when a release is requested.

A packaged installer, production release, or deployment is not mandatory for every task.

If the task only requires desktop development verification, a successful Windows desktop development run with the requested feature functioning is sufficient. Do not add unnecessary packaging or release steps.

## Windows Compatibility

- Prioritize Windows-specific functionality and behavior.
- Use Windows-compatible commands, paths, process handling, terminal integration, and filesystem behavior.
- Avoid Unix-only assumptions in application code or scripts.
- Validate PowerShell, Windows Terminal, CMD, shell spawning, process lifecycle, environment variables, and filesystem behavior where relevant.
- Ensure application behavior is reliable across different Windows configurations.
- Do not assume the user's machine has the same CLI installations, paths, permissions, or shell configuration as the development environment.

---

# Performance & Resource Management

Performance is a mandatory consideration for every implementation.

Before introducing a feature or dependency, evaluate:

- CPU overhead.
- Memory consumption.
- Startup time.
- Idle resource consumption.
- Disk I/O.
- UI rendering cost.
- Background task frequency.
- Process count.
- Agent concurrency.
- Event and IPC overhead.
- Impact on low-specification devices.

## Performance Rules

- Prefer event-driven architecture over excessive polling.
- Avoid unnecessary loops and background watchers.
- Avoid duplicated processes and runtimes.
- Reuse existing services and infrastructure when appropriate.
- Use lazy loading for features that do not need to run immediately.
- Avoid loading large data sets into memory unnecessarily.
- Optimize expensive UI updates.
- Use streaming for long-running operations whenever practical.
- Ensure background tasks have proper cancellation and lifecycle handling.
- Avoid unnecessary CPU usage while the application is idle.
- Prevent memory leaks and runaway processes.
- Keep performance predictable when multiple agents execute simultaneously.

Do not optimize prematurely in ways that reduce reliability, readability, or correctness. Performance improvements must be measurable or have a clear technical justification.

---

# Agent & Orchestrator Reliability

OpenCLI is designed to coordinate multiple AI coding agents. Agent orchestration must not introduce conflicts, instability, or unnecessary resource usage.

- Maintain reliable adapter isolation.
- Avoid uncontrolled simultaneous writes to the same files.
- Respect task dependencies.
- Prevent conflicting execution between agents.
- Ensure agent lifecycle and process ownership are tracked.
- Avoid duplicate agent launches.
- Track execution state accurately.
- Handle interrupted, failed, cancelled, or disconnected agents.
- Keep terminal sessions and their associated agents correctly mapped.
- Ensure communication, events, task states, and execution results remain consistent.
- Prefer safe parallel execution only when tasks can genuinely run independently.
- Avoid parallelizing tasks with shared file dependencies unless a safe coordination strategy exists.
- Ensure agent output streams remain responsive.
- Prevent one agent's failure from unnecessarily destabilizing the entire application.

The orchestrator must prioritize correctness, conflict prevention, coordination, and fast execution.

---

# Dependencies & Architecture

- Follow the existing project architecture and technology stack.
- Prefer existing modules, utilities, services, and interfaces.
- Do not introduce duplicate infrastructure.
- Avoid unnecessary abstractions and architectural complexity.
- Do not replace a working technology without a concrete technical reason.
- Evaluate dependency size, compatibility, maintenance, security, and resource usage before adding new dependencies.
- Ensure all dependencies support the project's intended Windows desktop environment.
- Keep adapters modular and consistent.
- Keep application state and communication predictable.
- Ensure new code fits into the existing architecture rather than creating isolated parallel systems.

Any architectural change must provide a clear benefit to performance, stability, compatibility, maintainability, or functionality.

---

# Security & Data Handling

- Never hardcode secrets, credentials, tokens, or private keys.
- Protect local configuration and sensitive environment variables.
- Avoid exposing sensitive information through logs, terminal output, events, UI, or error messages.
- Validate external input and agent output where appropriate.
- Avoid unnecessarily broad filesystem or process permissions.
- Do not introduce destructive file operations without explicit authorization.
- Do not delete user projects, files, folders, terminal data, configuration, or agent work as a cleanup shortcut.
- Treat user workspace data as important and potentially irreplaceable.
- Avoid destructive migrations or irreversible changes without approval and a clear recovery strategy.

---

# Project Quality

- Follow the existing stack, patterns, and file organization unless there is a concrete reason to change them.
- Keep performance, accessibility, responsiveness, stability, and maintainability in mind.
- Test the actual affected flows, not only compilation.
- Ensure new features work with existing features.
- Avoid regressions.
- Update documentation when a change alters setup, configuration, behavior, or user-facing functionality.
- Do not change UI/UX unless it is part of the request or required for functional correctness.
- Ensure the application remains lightweight as features are added.

---

# Implementation Workflow

Every implementation task should follow this sequence:

### Phase 1 — Inspect

- Inspect repository structure.
- Inspect current branch and Git status.
- Fetch remote updates.
- Verify latest remote `master` commit.
- Review recent commits.
- Inspect affected implementation and related dependencies.
- Identify existing functionality that must be preserved.

### Phase 2 — Plan

- Identify root cause or implementation requirements.
- Determine the smallest appropriate change.
- Identify affected modules and dependencies.
- Evaluate Windows compatibility.
- Evaluate performance and resource impact.
- Identify potential agent conflicts or shared-file risks.
- Define how the implementation will be verified.

For complex or high-impact work, present the plan before implementation.

### Phase 3 — Implement

- Implement the actual functionality.
- Keep changes focused.
- Preserve existing behavior.
- Avoid unnecessary refactoring.
- Avoid introducing additional dependencies unless justified.
- Ensure proper error handling and lifecycle management.

### Phase 4 — Verify

Run relevant checks depending on the scope of the change:

- Lint.
- Type checking.
- Unit tests.
- Integration tests.
- Build.
- Windows desktop development startup.
- Actual feature testing.
- Resource or performance checks when relevant.

Do not claim a test passed if it was not executed.

### Phase 5 — Review

- Inspect the complete diff.
- Check for regressions.
- Check for accidental modifications.
- Check for secrets.
- Check for unnecessary dependencies.
- Check performance implications.
- Check Windows compatibility.
- Ensure the requested feature is completely implemented.

### Phase 6 — Synchronize & Deliver

- Fetch remote `master` again.
- Check for new remote commits.
- Reconcile changes safely if required.
- Re-run affected checks if reconciliation changes the implementation.
- Commit changes.
- Push to `master`, unless the user explicitly requests otherwise.
- Verify the pushed commit on the remote.

---

# Completion Report

At the end of each implementation task, provide a concise report containing:

- **Changes:** What was implemented or fixed.
- **Goal alignment:** Lightweight, Fast, Functional, Consistent, Compatible, and performance consistency.
- **Tests:** What was tested and actual results.
- **Build:** Actual build result.
- **Windows Desktop:** Whether the application successfully ran in the Windows development environment.
- **Feature verification:** Whether the requested feature works in the actual desktop application.
- **Git baseline:** Confirmation that work started from the latest verified remote commit.
- **Commit:** Commit hash, if created.
- **Push:** Push status and target branch (`master`).
- **Issues:** Remaining problems, limitations, or follow-up work.

Do not report a desktop runtime as successful if only a browser preview was tested.

Do not report implementation, testing, build, commit, or push as successful unless it was actually completed and verified.

---

# Final Product Principle

Every decision must protect the core identity of OpenCLI:

**Lightweight. Fast. Functional. Consistent. Compatible.**

OpenCLI should deliver the best possible coding-agent workflow while maintaining consistent, reliable, and efficient performance across different hardware specifications.

Do not sacrifice these permanent goals for unnecessary features, heavy dependencies, complexity, visual changes, or uncontrolled concurrency.