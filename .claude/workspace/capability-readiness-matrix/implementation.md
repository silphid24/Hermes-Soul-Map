---
title: Capability Readiness Matrix — Implementation
status: approved
approvals:
  qa: approved
required_approvals: [qa]
---

# Implementation — Capability Readiness Matrix (T04)

## Claude Code 실행 기록

- 사용자 요청: “4번 진행해줘”
- 구현 주체: Claude Code 2.1.214 + Hermes 최종 검증/문서 보강
- Claude Code print-mode 실행은 Hermes terminal 600s timeout으로 종료됐지만, 실제 코드/테스트/UI 산출물이 파일에 남았다.
- Hermes가 산출물을 검사하고 전체 검증, README/task/KB/implementation 문서 갱신을 완료했다.

## 구현 요약

### Domain

- 추가: `src/domain/capabilityReadiness.ts`
- 공개 함수:

```ts
buildCapabilityReadiness(agents, events, requests)
```

- 출력:
  - `capabilities`
  - `agents`
  - `cells`
  - `topReady`
  - `gated`

### Capability axes

- `observe_logs`
- `document_minutes`
- `code_build_test`
- `automation_cron`
- `workspace_ops`
- `external_send`

### Status

- `ready`
- `partial`
- `blocked`
- `idle`
- `approval_gated`

### Derivation rules

셀 값은 하드코딩하지 않고 다음 신호에서 파생한다.

- skill name/id keyword + proficiency
- specialty/description/soul.values text hit
- agent-matched events and source signals
- trust/autonomy/coherence
- memory longTerm/recentGrowth
- risk keywords: `timeout`, `timed out`, `fail`, `error`, `changes_requested` with `0 errors` removed before scan
- governance: external send / production mutation affinity가 있으면 `approval_gated`

### UI

- `src/App.tsx`
  - `CapabilityReadinessMatrixPanel` 추가
  - dashboard grid에서 Delegation Replay 이후 표시
  - topReady/gated summary strip + capability × agent matrix
- `src/App.css`
  - matrix table, status badges, responsive horizontal scroll 스타일 추가

## TDD / 검증

Claude Code가 `src/domain/capabilityReadiness.test.ts`를 작성하고 21개 테스트를 추가했다.

커버:

- matrix shape / determinism
- tool/dev agent code readiness
- integration workspace readiness
- n8n/cron automation readiness
- document/minutes readiness
- approval-gated external operations
- risk/status damping
- seed variety checks

## 최종 검증 결과

```bash
npm test -- --run
# 10 files passed, 120 tests passed

npm run lint
# 0 warnings, 0 errors

npm run build
# build passed
```

## 변경 파일

- `src/domain/capabilityReadiness.ts`
- `src/domain/capabilityReadiness.test.ts`
- `src/App.tsx`
- `src/App.css`
- `README.md`
- `task.md`
- `.claude/workspace/capability-readiness-matrix/spec.md`
- `.claude/workspace/capability-readiness-matrix/design.md`
- `.claude/workspace/capability-readiness-matrix/implementation.md`
- `.claude/knowledge/capability-readiness-matrix.md`
