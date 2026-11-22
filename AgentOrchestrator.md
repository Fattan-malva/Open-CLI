# OpenCLI Orchestrator — Implementation Report

Date: 2026-11-20

## 1. Implemented capabilities

- Agent/Orchestrator is a left-side mode switch; Browser is a separate toggle for a resizable right-side panel, plus a full Browser page under Workspace. The group list is resizable too. Terminal remains focused on terminals and native Agent CLI sessions.
- App-launched Agent CLI sessions are tagged with `agentId`; agent registry syncs live PTY busy state.
- Chat-driven run creation with browser page context and attachment names.
- Planner protocol: coordinator native CLI writes `plan.json`; orchestrator validates schema, DAG, dependencies, scope overlap, acceptance criteria and risk.
- Bounded scheduler with global concurrency limit, retry limit, capability check, per-task workspace ownership and dependency unblocking.
- Real PTY dispatch of prompts into tagged native Agent CLI sessions; no simulated agent output.
- SQLite persistence and recovery for runs, tasks, agents, workspaces, assignments, approvals, messages and events.
- Git worktree isolation, status/diff collection, patch-based controlled integration with conflict reporting.
- Evidence-based validation (summary, acceptance checklist, command exit codes, changed files) and final report artifact.
- Cancellation propagation from UI into run/task states and dispatch loop.
- Explicit per-tab/per-agent browser bridge token with authenticated loopback JSON tools, generated agent instructions, expiry and revocation.
- Browser overlays keep a last-frame snapshot while native webviews are temporarily hidden, so dialogs and tooltips remain readable without blank panes.
- Retry, integrate and revoke controls are wired to real native commands/state transitions.

## 2. Architecture and files changed

### New frontend modules

- `src/features/orchestrator/types.ts`
- `src/features/orchestrator/state-machines.ts`
- `src/features/orchestrator/dag.ts`
- `src/features/orchestrator/events.ts`
- `src/features/orchestrator/api.ts`
- `src/features/orchestrator/scheduler.ts`
- `src/features/orchestrator/context.ts`
- `src/features/orchestrator/planner.ts`
- `src/features/orchestrator/validation.ts`
- `src/features/orchestrator/engine.ts`
- `src/features/orchestrator/store.ts`
- `src/features/orchestrator/components/mode-switch.tsx`
- `src/features/orchestrator/components/orchestrator-dock.tsx`
- `src/features/orchestrator/components/browser-controls.tsx`
- Tests: `dag.test.ts`, `state-machines.test.ts`, `events.test.ts`, `scheduler.test.ts`, `planner.test.ts`, `validation.test.ts`, `components/orchestrator-dock.test.tsx`.

### Modified frontend files

- `src/features/terminal/store.ts`: `TerminalTab.agentId` and `add()` option.
- `src/features/terminal/index.tsx`: launcher tags sessions and terminal-only keyboard shortcuts.
- `src/features/agent-groups/index.tsx`: Agent, Browser and Orchestrator tabs with bridge grant visibility.
- `src/features/browser/index.tsx`: Share with Agent, snapshot placeholder and revoke controls in the existing toolbar.
- `src/features/browser/bridge-controls.tsx`: agent picker, token reveal/copy, generated agent instructions and revocation.

### New native modules

- `src-tauri/src/orchestrator/store.rs`
- `src-tauri/src/orchestrator/git.rs`
- `src-tauri/src/orchestrator/browser_bridge.rs`
- `src-tauri/src/orchestrator/commands.rs`
- `src-tauri/src/orchestrator/mod.rs`

### Modified native files

- `src-tauri/Cargo.toml`: added `rusqlite` with `bundled` (the only new dependency).
- `src-tauri/Cargo.lock`: updated by Cargo.
- `src-tauri/src/lib.rs`: exposed PTY write helper, registered all `orchestrator_*` commands, startup recovery init.

### Documentation

- `docs/orchestrator.md`

## 3. Supported Agent CLIs and limitations

- Built-in and custom entries from the existing Agent CLI settings are supported when launched from OpenCLI terminal.
- Capabilities are conservatively advertised as `*`; structured A2A capability negotiation is not implemented and is never assumed.
- Browser capability is a local loopback bridge, not MCP/A2A. Tools: navigate, read, click, type, scroll, waitFor, snapshot. Requests require a bearer/token header.
- Worktree integration is patch-based (`git apply --3way`) and does not auto-commit or auto-push.
- Dirty repositories are flagged for review. Conflicts are surfaced, not resolved arbitrarily.
- Live end-to-end verification with a real external Agent CLI was not possible in this environment; protocol, commands, build and unit tests were verified.

## 4. Commands run and actual results

| Command | Result |
| --- | --- |
| `node --version` | `v22.12.0` |
| `pnpm --version` | `12.5.1` |
| `cargo --version` | `cargo 1.100.0` |
| `rustc --version` | `rustc 1.100.0` |
| `pnpm exec playwright install chromium` | succeeded |
| `pnpm exec tsc -b --pretty false` | passed, no diagnostics |
| `cargo check --manifest-path src-tauri/Cargo.toml` | passed, no errors |
| `pnpm exec vitest run src/features/orchestrator` | 7 files passed, 25 tests passed |
| `pnpm lint` | passed with 5 pre-existing warnings, 0 errors |
| `pnpm build` | passed, `✓ built` |
| `pnpm desktop:build` | passed; produced `src-tauri/target/release/bundle/nsis/Open CLI_1.2.0_x64-setup.exe` |
| `pnpm test` | 22 files passed, 127 tests passed; 2 files / 13 tests failed (pre-existing) |

### Pre-existing full-suite failures

These were present in the baseline before Orchestrator changes and remain unrelated to this work:

- `src/components/config-drawer.test.tsx`: 12 failures caused by cookie values being read with extra quotes (for example `'"light"'`).
- `src/context/search-provider.test.tsx`: 1 timeout waiting for `Settings Account` option.

### Preserved dirty files

Files dirty before the task were restored byte-for-byte and re-verified after builds:

- `src/routeTree.gen.ts` — SHA-256 `A55B415FA22019AC385FA3AD6586AC47C48702054C4FBE0F22819B4F407258D9`
- `src-tauri/gen/schemas/desktop-schema.json` — SHA-256 `4A946FE48FBB0C7C535EA53E6070BD8276F3F3D74F96EFBAA6D85BD7B53B0F05`
- `src-tauri/gen/schemas/windows-schema.json` — SHA-256 `4A946FE48FBB0C7C535EA53E6070BD8276F3F3D74F96EFBAA6D85BD7B53B0F05`

## 5. Acceptance criteria checklist

- [x] Terminal Only default, no mode switch destroys sessions.
- [x] Orchestrator mode requires an eligible app-launched native CLI session.
- [x] Chat supports request, attachments and browser context.
- [x] Planner produces a validated structured DAG.
- [x] Scheduler is bounded, event-driven and avoids duplicate dispatch.
- [x] Worktree isolation and dirty-state detection implemented.
- [x] Evidence-based validation and truthful task/run states implemented.
- [x] Recovery marks interrupted work as failed/needs input instead of claiming success.
- [x] Explicit browser sharing/revocation and element context implemented.
- [x] Integration queue reports conflicts instead of silently overwriting.
- [x] Final report artifact distinguishes integrated, partial, failed and unvalidated work.
- [x] Tests, lint, typecheck, web build and desktop build verified.
- [ ] Live multi-agent end-to-end run with a real external Agent CLI (environment limitation).

## 6. How to use

See `docs/orchestrator.md`. In short: enable and launch a native Agent CLI from Terminal, switch to Orchestrator, describe the task, optionally share a browser tab, approve the plan, review evidence, then integrate completed work.
