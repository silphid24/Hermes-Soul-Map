# Capability Readiness Matrix

확정일: 2026-07-19

## 결정

Soul Map의 4번 고도화 기능은 `Capability Readiness Matrix`다. 앞선 Activity / Soul Diff / Delegation Replay 다음 질문인 “그래서 지금 누구에게 무엇을 맡길 수 있는가?”를 답한다.

## 도메인 함수

```ts
buildCapabilityReadiness(agents, events, requests)
```

## Capability axes

- `observe_logs`
- `document_minutes`
- `code_build_test`
- `automation_cron`
- `workspace_ops`
- `external_send`

## Status

- `ready` — 지금 맡길 수 있음
- `partial` — 부분 가능
- `blocked` — risk/dormant/planned로 막힘
- `idle` — 신호 없음
- `approval_gated` — 가능성이 있어도 사람 승인 필요

## 파생 원칙

셀 값은 agent별로 하드코딩하지 않는다. 다음 신호에서 파생한다.

- skill name/id keyword + proficiency
- specialty / description / soul.values text match
- events matched by `agentId === id || source === id`
- capability-specific event source
- trust/autonomy/coherence
- memory longTerm/recentGrowth
- risk keyword

## Governance rule

`external_send`는 외부 발송/게시/production mutation 계열이다. affinity가 있으면 score/trust/autonomy와 무관하게 `approval_gated`를 우선한다.

이 규칙은 다음 안정장치다.

- 메일 발송은 draft-only / 명시 승인 전 발송 금지
- n8n activate/deactivate는 production mutation으로 취급
- social publish도 사람이 승인해야 한다

## UI

Dashboard grid에 `Capability Readiness Matrix` 패널을 추가한다.

- summary strip: topReady / approval gated
- matrix: capability rows × agent columns
- cell: status badge + score + reason tooltip
- idle은 약하게, gated는 violet, blocked는 red, ready는 green

## 검증

도메인 테스트 21개 포함, 전체 120 tests passed.
