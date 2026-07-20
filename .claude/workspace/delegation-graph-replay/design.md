---
title: Delegation Graph Replay — Design
status: approved
approvals:
  backend: approved
  frontend: approved
  security: approved
  designer: approved
required_approvals: [backend, frontend, security, designer]
---

# Design — Delegation Graph Replay

spec 승인본(`spec.md`) 기준. 새 스키마/백엔드 없이 순수 파생 도메인 함수 1개 + UI 패널 1개.

## 1. 도메인 모듈 — `src/domain/delegationReplay.ts`

### 타입

```ts
export type DelegationStepKind = 'request' | 'handoff' | 'completion' | 'risk' | 'signal'
export type ReplayStatus = 'idle' | 'flowing' | 'blocked' | 'complete'

export interface DelegationStep {
  id: string
  timestamp: string            // ISO
  kind: DelegationStepKind
  sourceAgentId: string
  sourceName: string
  targetAgentId?: string
  targetName?: string
  title: string
  summary: string
  importance: Importance
  status?: RequestStatus       // 요청 파생 스텝일 때만
  risk: boolean
}

export interface DelegationEdge {
  from: string
  to: string
  fromName: string
  toName: string
  count: number
  lastTimestamp: string
  hasRisk: boolean
}

export interface DelegationReplay {
  steps: DelegationStep[]      // 오래된 → 최신
  edges: DelegationEdge[]      // count 내림차순, 동률이면 lastTimestamp 최신 우선
  status: ReplayStatus
  riskCount: number
  latestPath?: { from: string; to: string; fromName: string; toName: string }
}

export function buildDelegationReplay(
  agents: Agent[],
  events: LogEvent[],
  requests: InterAgentRequest[],
): DelegationReplay
```

### 스텝 생성 규칙

**요청(request) → 스텝:** 모든 `InterAgentRequest`가 스텝 1개.
- `kind`: `completed` → `completion`, `declined` → `risk`, 그 외 → `request`.
- `risk`: `status === 'declined'`.
- `sourceAgentId = fromAgentId`, `targetAgentId = toAgentId`.
- `title = capability`, `summary`, `importance = priority`, `status`.
- `timestamp = createdAt`.
- `id = 'req:' + request.id`.

**handoff 이벤트 → 스텝:** `events.filter(e => e.type === 'handoff')` 만. (다른 type은 제외 — QA required #3.)
- target 추론: 이벤트에는 target 필드가 없으므로 아래 순서로 시도.
  1. summary(소문자화) 안에 다른 agent의 `id` 또는 `name`(소문자화)이 등장하면 그 agent를 target으로 채택. 대소문자 무관 부분일치, **agents 배열 순서로 첫 매칭**(결정론), 자기 자신 제외.
  2. 없으면 target 미지정 → `kind: 'signal'`, edge 미생성(QA required #4).
- `risk`: summary 리스크 감지(아래) → true 면 `kind: 'risk'`. 아니고 target 있으면 `kind: 'handoff'`, target 없으면 `kind: 'signal'`.
- `sourceAgentId = event.agentId`, `title = '위임'`(handoff) 또는 감지된 라벨, `summary = event.summary`, `importance = event.importance`.
- `id = 'evt:' + event.id`.

### 리스크 감지 (security 권고 반영 — 정규식 대신 includes)

```ts
const RISK_KEYWORDS = ['timeout', 'timed out', 'fail', 'error', 'changes_requested']
function detectRisk(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/0 errors/g, '') // lint clean 오탐 방지
  return RISK_KEYWORDS.some((kw) => cleaned.includes(kw))
}
```
- `fail` 은 `failed` 를 포함(부분일치)하므로 별도 등록 불필요.
- 대소문자 무관(소문자화). (QA required #6, #7.)

### 정렬 & 결정론 (QA required #2)

- steps: `timestamp` 오름차순. 동률이면 `id` 사전순 tie-break → 결정론 보장.
- edges: `count` 내림차순, 동률이면 `lastTimestamp` 최신, 그래도 동률이면 `from+to` 사전순.
- `latestPath`: target 있는 스텝 중 timestamp 최대(동률이면 위 정렬 규칙의 마지막) → 그 스텝의 from/to.

### status 판정 (QA required #1, #8 — 우선순위 순서 중요)

```
if steps.length === 0            → 'idle'
else if riskCount > 0            → 'blocked'   // 리스크 or declined
else if activeRequests().length  → 'flowing'   // 진행 중 요청 존재
else                             → 'complete'
```
- `blocked` 가 `complete` 보다 먼저 판정되므로, 모두 종료됐어도 declined(=risk)가 있으면 `blocked`. (required #1.)
- `flowing` 은 **오직 `activeRequests()` 기준**(backend 리뷰 반영). handoff 이벤트는 과거 시점이므로 flowing 판정에 넣지 않는다 — 그래야 요청이 모두 종료되고 리스크가 없으면 `complete`에 도달한다(spec의 "활성 흐름 없음" 정의와 일치).

### 이름 fallback

`nameOf(id)`: agents에서 찾으면 `name`, 없으면 `id` 그대로. (unknown agentId 안전.)

## 2. UI — `src/App.tsx` 에 `DelegationReplayPanel` 추가

- 위치: `RequestLab` 다음, `Roadmap` 앞. `useMemo(() => buildDelegationReplay(agents, events, requests), [...])`.
- 구조(기존 `.panel` / `.section-heading` 컨벤션 준수):

```
<section className="panel delegation-replay">
  <div className="section-heading">
    <p>Delegation Graph Replay</p>
    <h2>위임 흐름 리플레이</h2>
  </div>
  <p className="panel-note">누적 위임 경로(과거 흐름) 기준. 현재 큐는 요청 랩 참조.</p>
  <div className="replay-status">
    <span className={`flow-badge ${status}`} aria-label="...">{flowStatusLabel[status]}</span>
    <span>스텝 {steps.length}</span>
    <span>리스크 {riskCount}</span>
    {latestPath && <span className="latest-path">최근: {from} → {to}</span>}
  </div>
  <div className="replay-edges"> A → B ×n · 마지막 · ⚠리스크 </div>
  <ol className="replay-steps"> 각 스텝 카드 </ol>
</section>
```

### 라벨 맵 (designer refinement 반영)

- `flowStatusLabel`: `idle: '대기'`, `flowing: '흐름 중'`, `blocked: '막힘'`, `complete: '완료'`.
- kind 라벨: `request: '요청'`, `handoff: '위임'`, `completion: '완료'`, `risk: '리스크'`, `signal: '신호'`.
- 기존 `importanceLabel` 재사용. request 파생 스텝의 status는 기존 `statusLabel` 재사용.

### 접근성 (designer refinement #3)

- 리스크 스텝: 색상뿐 아니라 `⚠` 아이콘 + "리스크" 텍스트 병기.
- flow-badge / 리스크 edge에 `aria-label` 부여.
- `blocked` 배지는 빨강 계열, `flowing`은 accent, `complete`는 초록, `idle`은 muted — 단 텍스트 라벨 항상 표시.

## 3. 데이터 — seed 보강 (최소)

현재 seed로도 동작하지만 리플레이가 풍부해지도록 **최소 handoff 이벤트만** 점검:
- 기존 `doc-auto-bridge-1`(izera365 handoff, "timeout" 포함) → risk 스텝으로 잡힘. target `doc-auto-agent`가 summary("Doc Auto Agent")에 등장 → edge 생성.
- 기존 `pistachio-2`(Pistachio → Social Media handoff, "queued"): agent name은 실제 "Social Media Agent"(id `social-media`)라 summary "Social Media"에 부분일치하지 않음 → 이 edge는 **requests 폴백(요청 #4 pistachio→social-media)** 으로 보장됨(handoff 이름-매칭 아님). 문서 정정(backend 리뷰 반영).
- 추가 불필요할 수 있으나, target 매칭이 이름 문자열 의존이므로 **매칭 실패 시** 각 handoff 이벤트에 명시적 target 신호가 없어도 requests 쪽 4개 흐름(izera365→doc-auto-agent, hermes-default→ai-trend-radar, pistachio→social-media, hermes-default→claude-code)이 edge를 보장한다. → seed 변경 없이도 4개 대표 경로 렌더 확정.
- 결론: **seed 이벤트 추가는 하지 않는다**(요청 4건이 이미 4개 대표 경로를 만든다). 변경 최소화.

## 4. HermesExport 호환

- `buildDelegationReplay` 는 이미 매핑된 `SoulMapData`(agents/events/requests)만 소비 → HermesExport 매핑 코드 변경 없음. Backward-compatible. (types.ts 무변경.)

## 5. 테스트 계획 (`src/domain/delegationReplay.test.ts`)

QA required 8종 전부 + 기본 케이스:
1. 빈 입력 → status idle, steps [].
2. seed-유사 4요청 → edges 4, latestPath 정의됨.
3. declined 요청 → risk 스텝 + blocked (모두 종료여도 blocked 우선).
4. 동일 timestamp tie-break 결정론(id 사전순).
5. 비-handoff 이벤트는 스텝 제외.
6. target 없는 handoff → signal, edge 미생성.
7. edge 집계(count/lastTimestamp/hasRisk).
8. 리스크 키워드 대소문자 무관.
9. `0 errors` 오탐 방지.
10. unknown agentId 이름 fallback.
11. 모두 completed(declined 없음) → complete.

## 6. 파일 변경 목록

- 신규: `src/domain/delegationReplay.ts`, `src/domain/delegationReplay.test.ts`
- 수정: `src/App.tsx`(패널+라벨+import), `src/App.css`(패널 스타일)
- 문서: `README.md`, `.claude/knowledge/delegation-graph-replay.md`
- seed: 변경 없음(대표 경로는 기존 requests 4건이 보장)

## Reviews

### backend — approved (2026-07-18)
알고리즘 결정론·타입 정합 확인. 반영한 변경: (1) `flowing`을 `activeRequests()` 기준으로만 판정(handoff step 조건 제거) — 그래야 모두 종료 시 `complete` 도달. (2) target 이름-매칭은 대소문자 무관 부분일치 + agents 배열 순 첫 매칭(결정론). (3) Section 3의 Social Media edge는 name-match 아니라 requests 폴백으로 보장됨을 문서 정정. `error`가 'terror' 등 부분일치 가능하나 현재 데이터엔 없음 — 한계는 KB/README에 한 줄 명시.

### frontend — approved (2026-07-18)
`.panel`/`.section-heading`/`dashboard-grid` 정합, 신규 클래스명 충돌 없음, 라벨 맵 재사용 일관, 접근성 충족. 반영: (1) useMemo는 App의 **라이브 `requests` state**를 소비, deps `[data.agents, data.events, requests]`. (2) steps/edges 비면 기존 컨벤션대로 `<p className="empty-state">` 렌더.

### security — approved (2026-07-18)
XSS/injection/ReDoS/DoS/비밀노출 표면 없음. 순수 O(n) 파생 뷰, 고정 키워드 includes.

### designer — approved (2026-07-18)
4개 refinement 모두 반영(eyebrow+한국어 h2, 라벨 재사용, 색상 비의존 리스크 표기, 구분 카피). 정보 위계 타당. (비차단) completed 요청 카드에서 kind '완료'와 status '완료' 중복 표기 시 한쪽 생략 고려 — 구현에서 status만 표기해 중복 회피.
