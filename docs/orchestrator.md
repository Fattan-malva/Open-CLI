# OpenCLI Orchestrator

The Orchestrator workspace has an Agent/Orchestrator mode switch on the left. Browser is a separate toggle that opens a resizable right-side panel without changing the left mode, and a full Browser page is available under Workspace. The group list width is also resizable and persisted. Terminal remains focused on terminals and native Agent CLI sessions.

## Enabling and use

1. Open **Settings → Agent CLI** and enable at least one native Agent CLI.
2. Set the project root in the Agent CLI settings.
3. Launch the agent from the Agent Group workspace or the terminal launcher. Only app-launched sessions are eligible for orchestration.
4. Open **Agent AI → Orchestrator** to work with the grouped agents.
5. Switch the left layout to **Orchestrator** and describe the work in the chat. A run is created in `draft`.
6. Click **Browser** to open the resizable right panel. Select a running agent in the toolbar and use **Share with Agent** to grant a tab bridge token.
7. Copy the token or the generated agent instructions, then let the agent call `GET /tools` and `POST /call` on the loopback bridge. Revoke access from the toolbar when done.
8. In **Approve & run**, the coordinator CLI writes `plan.json` into the run artifact directory. The plan is schema- and DAG-validated, workspaces are prepared, and independent tasks are dispatched with bounded concurrency.
9. Review task evidence, retry failed tasks, and integrate completed work through the controlled queue.

Terminal sessions are never terminated or reset when switching the workspace mode or toggling the browser panel.

## Supported agents

Built-in entries from `src/features/agent-cli/data/agents.ts` are supported, along with user-defined CLI entries in `cli-agent.json`. Eligibility requires:

- an active entry in `cli-agent.json`,
- a tagged terminal session (`TerminalTab.agentId`),
- a live PTY session,
- an agent that is not `unavailable`, `failed`, or `stopped`.

Capabilities are currently advertised as `*` for tagged sessions because the local CLIs do not expose structured capability negotiation. A2A is not assumed.

## Architecture

- `src/features/orchestrator/types.ts`: zod schemas for runs, tasks, plans, evidence, events, approvals, browser context.
- `dag.ts`, `state-machines.ts`, `scheduler.ts`: DAG validation, transitions, bounded dispatch and dependency unblocking.
- `planner.ts`, `context.ts`: planner prompt/artifact protocol and sanitized context building.
- `engine.ts`: run lifecycle, artifact writes, workspace preparation, dispatch loop, validation and report generation.
- `api.ts`, `store.ts`, `events.ts`: native command wrappers, event bus and Zustand state.
- `src-tauri/src/orchestrator/*`: SQLite persistence, event projection, git worktree/status/diff/integration, PTY dispatch, recovery and loopback browser tool bridge.
- `src-tauri/src/lib.rs`: command registration, `PtyState` access and startup recovery.
- `src/features/orchestrator/components/*`: additive mode switch, run/task chat dock and browser controls.

Persistence lives in the app data directory under `orchestrator/orchestrator.sqlite`. Run artifacts are under `orchestrator/runs/<runId>/`.

## Browser safety

- A browser grant is explicit, per-tab, per-agent, tokenized, and expires after 30 minutes.
- The loopback JSON-RPC bridge binds only to `127.0.0.1`.
- Tools: navigate, read, click, type, scroll, waitFor, snapshot.
- Every request must send `Authorization: Bearer <token>` or `X-OpenCLI-Token: <token>`; unauthorized requests return 401.
- Grants are automatically removed when the tab closes or the 30-minute expiry passes, and can be revoked from the browser toolbar.

## Isolation and integration

- Git worktrees are created under `orchestrator/worktrees/` from the current `HEAD`.
- Dirty source repositories are flagged in the workspace record; the user must review before integration.
- Non-git or shared-mode workspaces are serialized by workspace ownership.
- Integration applies a generated patch with `git apply --3way`; conflicts are reported, never resolved arbitrarily.
- No task is marked complete without evidence (summary, acceptance checklist, command exit codes, changed files).

## Configuration

No new user-facing config file is required. Existing Agent CLI settings and project root are reused. The only new crate dependency is `rusqlite` with the `bundled` SQLite feature.

## Limitations

- Planner/agent output must be produced by a real native CLI session; no simulated output is generated.
- A2A capability negotiation is not implemented; local CLI capabilities are treated as `*`.
- Automatic test-command discovery is conservative; validation relies on evidence commands supplied by the executing agent and the run report.
- Browser grants are process-local and do not survive an app restart; startup recovery marks interrupted tasks truthfully.
- Worktree integration is patch-based and does not auto-commit on behalf of the user.
- Initial baseline test suite has pre-existing failures unrelated to Orchestrator (config drawer quoting and nested sidebar navigation).

## Development

```powershell
pnpm exec tsc -b --pretty false
pnpm exec vitest run src/features/orchestrator
pnpm lint
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```
