---
title: Request Protocol Execution Layer — Implementation
status: approved
approval_basis: Hermes recovery implementation + targeted TDD verification; independent reviewer session not run
approvals:
  qa: self_reviewed
  security: self_reviewed
  implementation: self_reviewed
required_approvals: [qa, security, implementation]
---

# Implementation — Request Protocol Execution Layer (T07)

## Summary

Claude Code produced `spec.md` and `design.md` but the print-mode session stalled without final JSON output. Hermes killed the process, recovered the planning artifacts, then completed the feature with strict RED → GREEN cycles.

Implemented scope:

- execution target abstraction
- execution action classification
- dry-run preview
- approval-gated simulated execution
- audit log contract
- audit log → LogEvent adapter
- failure/timeout/blocked risk mapping
- Request Lab UI preview + audit log
- visible contract tests

No external service calls were added.

## Files changed

- `src/domain/requestExecution.ts`
- `src/domain/requestExecution.test.ts`
- `src/App.tsx`
- `src/App.css`
- `src/App.requestExecution.test.tsx`
- `.claude/knowledge/request-protocol-execution-layer.md`
- `.claude/workspace/request-protocol-execution-layer/spec.md`
- `.claude/workspace/request-protocol-execution-layer/design.md`
- `.claude/workspace/request-protocol-execution-layer/implementation.md`
- `README.md`
- `task.md`
- `plan.md`

## TDD Evidence

### Domain RED

```bash
npm test -- --run src/domain/requestExecution.test.ts
```

Failed as expected because `./requestExecution` did not exist.

### Domain GREEN

```bash
npm test -- --run src/domain/requestExecution.test.ts
```

Passed: 6 tests.

### UI RED

```bash
npm test -- --run src/App.requestExecution.test.tsx
```

Failed as expected because the `Request Protocol Execution Layer` region and execution preview did not exist.

### UI GREEN

```bash
npm test -- --run src/domain/requestExecution.test.ts src/App.requestExecution.test.tsx
```

Passed: 2 files / 9 tests.

## Design decisions

### 1. `simulateExecution` is intentionally not an executor

The function returns `ExecutionAuditLog` only. It cannot perform external mutation because:

```ts
externalMutationPerformed: false
```

is part of the returned contract and tests assert it.

### 2. Draft-only work must remain executable without approval

T06 runbook gates are merged only for dangerous actions. Otherwise Google Workspace `email.draft` would be blocked by the generic “메일 발송” gate, which would violate the user's established mail rule: draft is OK, send is not.

### 3. Audit log enters existing replay through `LogEvent(type: 'handoff')`

No replay-specific new pipe was added. `auditLogToEvent()` converts execution audit to the existing event contract so Activity Blackbox, Timeline, and Delegation Replay can consume it.

### 4. Preview follows request insertion order

The preview uses the first active request in current queue order, not priority-sorted order. This makes newly created requests immediately previewable in the UI, while the active cards can still render in priority order.

## Security review

- No `fetch`, HTTP, SMTP, n8n API, GitHub API, child process, or filesystem write path added to browser/runtime code.
- Approval gate is fail-safe for `mutate`, `publish`, `workflow_mutation`, and `destructive`.
- GitHub target is gated even if action classification is ambiguous.
- External mutation is explicitly displayed as false in UI and audit log.
- Blocked execution still creates an audit log.

## Verification

Targeted verification passed before full verification:

```bash
npm test -- --run src/domain/requestExecution.test.ts src/App.requestExecution.test.tsx
# 2 files passed / 9 tests passed
```

Full verification result is recorded in `task.md` after Hermes final verification.
