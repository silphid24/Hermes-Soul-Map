---
title: Capability Readiness Matrix — Design
status: approved
approvals:
  backend: approved
  frontend: approved
  security: approved
  designer: approved
required_approvals: [backend, frontend, security, designer]
---

# Design — Capability Readiness Matrix

## 1. 도메인 (backend)

### 파일

- `src/domain/capabilityReadiness.ts`
- `src/domain/capabilityReadiness.test.ts`

### 공개 API

```ts
export function buildCapabilityReadiness(
  agents: Agent[],
  events: LogEvent[],
  requests: InterAgentRequest[],
): CapabilityReadinessMatrix
```

`requests` 는 향후 요청 큐 기반 신호(예: 특정 capability 요청이 declined) 확장을 위해 시그니처에 포함하되, 1차 구현은 agent/skill/event 신호를 우선한다.

### capability 정의 테이블 (하드코딩 금지 원칙과의 관계)

각 capability는 **키워드/소스 규칙**만 선언한다. 셀 값(status/score)은 규칙 + 실제 agent/event 데이터에서 파생된다. 즉 "izera365의 document_minutes는 ready" 같은 값은 어디에도 적지 않는다.

```ts
interface CapDef {
  key: CapabilityKey
  label: string
  keywords: string[]      // skill/text/event summary 매칭 (lowercase, 부분일치)
  sources?: EventSource[] // 이 source의 이벤트는 활동으로 인정
  external?: boolean       // 외부 발송/mutation → approval gate 대상
}
```

### 파생 파이프라인 (agent × capability)

1. `relevantSkills` = skill(name+id)이 keyword에 매칭되는 것 → `skillProf = max(proficiency)`
2. `textHit` = specialty+description+values 합친 haystack이 keyword에 매칭
3. `capEvents` = 이 agent의 이벤트(`agentId===id || source===id`) 중 summary 키워드 매칭 **또는** source가 `def.sources`
4. `activityCount = capEvents.length`, `riskInCapability = capEvents 중 risk 키워드`
5. `affinity = relevantSkills.length>0 || textHit || activityCount>0`
6. `score` (affinity 있을 때만, 0–100 clamp):
   - skill: `20 + skillProf*0.3` (스킬 있을 때)
   - text: `+12`
   - activity: `+min(activityCount,3)*6`
   - trust: `+trust*0.12`, autonomy: `+autonomy*0.06`, coherence: `+coherence*0.06`
   - memory: `+min(longTerm,5) + min(recentGrowth*2, 3)`
7. `status` (우선순위):
   - `!affinity` → `idle` (score 0)
   - `status ∈ {dormant, planned}` → `blocked`
   - `def.external` → `approval_gated`
   - `riskInCapability` → `blocked`
   - `score ≥ 68` → `ready`, else → `partial`
   - (`blocked`는 실제로 막힌 경우 — risk 또는 dormant/planned — 에만 쓴다)
8. `reasons` — 최대 4개 짧은 근거 문자열.

### risk 규칙 (재사용)

`activity.ts` / `delegationReplay.ts` 와 동일: `timeout|timed out|fail|error|changes_requested`, 단 `0 errors` 는 제거 후 검사.

### 집계

- `cells`: agent 입력 순서 × capability 고정 순서 (결정론)
- `topReady`: status `ready`, score 내림차순 → agentId → capability 순
- `gated`: status `approval_gated`, 동일 정렬

## 2. UI (frontend)

### 컴포넌트

`CapabilityReadinessMatrix` 패널 (`src/App.tsx`), 대시보드 grid에 추가. `roadmap` 처럼 `grid-column: 1 / -1` 로 풀폭.

### 레이아웃

- 헤더: `Capability Readiness Matrix` / `누가 무엇을 맡을 준비가 됐는가`
- 요약 스트립: `지금 맡길 수 있음(topReady)` 칩 + `승인 게이트(gated)` 칩
- 매트릭스 테이블:
  - 행 = capability, 열 = agent (emoji + 이름)
  - 각 셀 = status 배지 (색/라벨) + score, `title`/`aria-label`에 reasons
- 범례: 5개 status 색상 의미

### 색 규칙 (status)

- ready → green (`#34d399`)
- partial → amber (`#eab308`)
- approval_gated → violet (accent, 자물쇠 뉘앙스)
- blocked → red/pink (`#f472b6`)
- idle → muted gray (약하게)

셀 색은 domain status에서만 파생 — 하드코딩된 agent별 색 없음.

### 반응형

- 좁은 화면(<980px)에서 가로 스크롤 허용(`overflow-x:auto`) — 매트릭스 컬럼 유지.

## 3. 보안 (security)

- 파생은 read-only 순수 함수. 외부 호출 없음.
- external_send governance gate가 score/trust보다 우선 → 외부 발송이 실수로 `ready`로 표시될 수 없음.

## Reviews

- **backend (approved):** 기존 타입 재사용, 새 코어 타입 없음. risk 규칙 일관. 시그니처에 requests 포함 좋음. 승인.
- **frontend (approved):** 테이블 + 요약 스트립 구조 명확. 셀은 status/score/reasons만 소비하므로 하드코딩 없음. 승인.
- **security (approved):** governance gate 우선순위 확인. read-only. 승인.
- **designer (approved):** status 색 5종, idle 약화, topReady 우선 노출 방향 동의. 승인.
