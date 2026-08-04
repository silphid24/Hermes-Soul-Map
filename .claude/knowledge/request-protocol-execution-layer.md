# Request Protocol Execution Layer

확정일: 2026-08-04

## 결정

T07은 Request Lab의 mock queue를 실제 외부 호출로 연결하지 않고, 먼저 **dry-run / approval gate / audit log / replay 반영** 계층으로 확장한다.

핵심 원칙:

- 실행은 `simulated` 상태 전이만 수행한다.
- 메일 발송, n8n workflow mutation, GitHub push/release, destructive local ops, 외부 게시/발송은 승인 없이 실행 불가로 표시한다.
- 어떤 경로에서도 외부 서비스 호출, command execution, network mutation을 수행하지 않는다.
- audit log는 `LogEvent(type: 'handoff')` 로 변환되어 Activity Blackbox / Timeline / Delegation Graph Replay에 흘러간다.

## 구현 파일

- `src/domain/requestExecution.ts`
  - `ExecutionTargetKind`
  - `ExecutionActionKind`
  - `buildDryRun()`
  - `simulateExecution()`
  - `auditLogToEvent()`
  - `buildAuditEvents()`
- `src/domain/requestExecution.test.ts`
  - target/action inference
  - approval gate
  - draft-only safe path
  - blocked simulated execution
  - failure/timeout risk event mapping
- `src/App.requestExecution.test.tsx`
  - Request Protocol Execution Layer visible contract
  - dry-run preview
  - approval marker
  - simulated audit log
- `src/App.tsx`
  - Request Lab 안에 Execution Preview / Audit Log UI 추가
  - audit log를 runtime activity stream에 반영
  - Delegation Replay / Capability Matrix가 runtime activity stream을 소비
- `src/App.css`
  - execution preview / audit log 스타일

## 도메인 계약

### Execution Target

```ts
type ExecutionTargetKind =
  | 'hermes'
  | 'claude-code'
  | 'n8n'
  | 'google-workspace'
  | 'github'
  | 'local'
  | 'manual'
```

### Execution Action

```ts
type ExecutionActionKind =
  | 'observe'
  | 'draft'
  | 'mutate'
  | 'publish'
  | 'code_change'
  | 'destructive'
  | 'workflow_mutation'
```

### Audit status

```ts
type ExecutionStatus =
  | 'preview'
  | 'approved'
  | 'approval_required'
  | 'blocked'
  | 'success'
  | 'failure'
  | 'timeout'
```

## 안전 규칙

1. `buildDryRun()`은 요청 객체를 변경하지 않고 preview/audit expectation만 만든다.
2. `simulateExecution()`은 실제 실행이 아니라 `ExecutionAuditLog` 1건을 만든다.
3. `externalMutationPerformed`는 항상 `false`로 고정한다.
4. 위험 action은 기본 approval gate:
   - `mutate`
   - `publish`
   - `workflow_mutation`
   - `destructive`
5. target별 추가 gate:
   - `github`: push/release approval
   - `n8n + workflow_mutation`: n8n workflow mutation approval
   - `google-workspace + publish`: external email/calendar publishing approval
   - `local + destructive`: destructive local ops approval
6. T06 Runbook의 approvalRequired는 위험 action에서만 합집합으로 병합한다.
   - draft-only / observe 요청은 승인 게이트를 과대 적용하지 않는다.

## UI contract

Request Lab 영역은 `aria-label="Request Protocol Execution Layer"` region이다.

Seed 상태에서 보이는 것:

- `Execution Preview`
- `dry-run`
- target/action label
- `approval required` 또는 `approval not required`
- `external mutation performed: false`
- `simulate execution` 버튼
- 실행 후 `Audit Log`

## Replay / Activity 반영

`auditLogToEvent()`는 audit log를 다음 형태로 변환한다.

- `type: 'handoff'`
- `source`: target에 맞는 기존 EventSource로 clamp
- `importance`: failure/timeout/blocked는 `critical`
- summary에는 `failure` / `timeout` / `blocked` 키워드를 포함해 기존 Delegation Replay risk parser가 감지 가능하게 한다.

## 검증 결과

Targeted RED/GREEN:

```bash
npm test -- --run src/domain/requestExecution.test.ts
# RED: requestExecution module missing
# GREEN: 6 passed

npm test -- --run src/App.requestExecution.test.tsx
# RED: Request Protocol Execution Layer region missing
# GREEN via combined targeted run: 9 passed
```

Full verification은 Hermes 최종 검증 단계에서 최신 결과를 기록한다.

## 후속 작업

- T07 후속: audit log persistence(localStorage 또는 bridge server)
- T07 후속: 실제 execution bridge 설계 — 별도 approval token / server boundary 필요
- T08: Design Polish + Shareable Narrative
