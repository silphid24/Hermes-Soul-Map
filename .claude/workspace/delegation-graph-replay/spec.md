---
title: Delegation Graph Replay
status: approved
approvals:
  designer: approved
  security: approved
  qa: approved
required_approvals: [designer, security, qa]
---

# Spec — Delegation Graph Replay

## 목표

Soul Map을 "정적 요청 큐"에서 한 단계 끌어올려, **에이전트가 시간에 따라 어떻게 서로에게 일을 위임/요청했는지**를 리플레이(재생)처럼 보여준다. 사용자는 "지금 이 요청들이 걸려 있다"가 아니라 "izera365가 doc-auto-agent에게 넘겼고, 그 handoff에서 timeout 리스크가 있었다" 같은 **흐름(flow)**을 읽을 수 있어야 한다.

기존 `Inter-Agent 요청 랩`은 현재 상태(큐) 중심이다. 이 기능은 그 위에 **시간축 + 방향성 그래프** 관점을 얹는다.

## 배경 / KB 조회 결과

- `.claude/knowledge/agent-activity-blackbox.md`: 리스크 파싱 규칙(timeout / failure·error / changes_requested)과 "실행 버튼보다 관찰"이라는 방향을 재사용한다.
- `src/domain/requests.ts`: 요청 생애주기(queued→accepted→in_progress→completed / declined)와 우선순위 가중치가 이미 있다. 중복 정의하지 않고 재사용/일관 유지한다.
- `src/types.ts`: `LogEvent.type = 'handoff'`, `InterAgentRequest`가 이미 존재. 새 타입 추가 없이 조합만으로 구현 가능.
- 현재 seed 요청 흐름: `izera365 → doc-auto-agent`, `hermes-default → ai-trend-radar`, `pistachio → social-media`, `hermes-default → claude-code`.

## 요구사항

입력: `agents: Agent[]`, `events: LogEvent[]`, `requests: InterAgentRequest[]`

### 1. Replay steps (시간순 스텝)

- 모든 요청과 handoff 성격의 이벤트를 하나의 **시간순 스텝 목록**으로 합친다.
- 각 스텝:
  - `id`
  - `timestamp` (ISO)
  - `kind`: `request | handoff | completion | risk | signal`
  - `sourceAgentId` (필수), `sourceName`
  - `targetAgentId?` (알 수 있으면), `targetName?`
  - `title` (짧은 라벨), `summary` (한 줄 설명)
  - `importance: Importance`
  - `status?: RequestStatus` (요청에서 파생된 스텝일 때)
  - `risk: boolean` (리스크 감지 여부)
- 오래된 → 최신 순으로 정렬(리플레이는 앞에서부터 재생).

### 2. Edges (파생 간선)

- 스텝들에서 `source → target` 방향 간선을 집계한다.
- 각 간선: `from`, `to`, `fromName`, `toName`, `count`(횟수), `lastTimestamp`(가장 최근), `hasRisk`(간선 위 리스크 스텝 존재 여부).
- target을 모르는 스텝(자기 자신 신호 등)은 간선을 만들지 않는다.

### 3. Replay health / status

- 전체 흐름 상태: `idle | flowing | blocked | complete`
  - `idle`: 스텝이 하나도 없음.
  - `blocked`: 리스크 스텝이 있거나 declined 요청이 있음 → 개입 필요.
  - `complete`: 모든 요청이 completed/declined 로 끝나 활성 흐름이 없음(리스크 없음).
  - `flowing`: 그 외, 진행 중인 위임 흐름이 있음.

### 4. 리스크 감지

- handoff 이벤트 summary에 `timeout / timed out / fail / failed / error / changes_requested` 가 있으면 risk.
- 요청 status가 `declined` 면 risk.
- 리스크 스텝은 `kind: 'risk'` 로 승격하고 `risk: true`.
- lint clean의 "0 errors"가 error 오탐이 되지 않도록 `agent-activity-blackbox` 파싱 규칙과 동일하게 `0 errors` 제거 후 검사.

### 5. 대표 경로 (latest path)

- 가장 최근 스텝이 속한 간선을 "최근 위임 경로"로 강조 표시할 수 있게 요약에 포함한다.

## UI 요구사항

- 대시보드에 `Delegation Graph Replay` 패널을 추가한다(요청 랩과 로드맵 사이 또는 요청 랩 근처).
- 표시:
  - 상단: 흐름 상태 배지(`idle/flowing/blocked/complete`) + 스텝 수 + 리스크 수.
  - 최근 위임 경로(`A → B`) 강조.
  - 파생 간선 목록: `A → B ×n`, 마지막 시각, 리스크면 경고 표시.
  - 시간순 replay 스텝 리스트: 방향(source→target), kind 라벨, importance, 요약. 리스크 스텝은 시각적으로 구분.
- 한국어 라벨 사용.
- 현재 seed 데이터로 의미 있는 결과가 나와야 한다(빈 화면 금지).

## 비목표 (Non-goals)

- 실시간 애니메이션 재생(재생 버튼/타임슬라이더)은 이번 범위 밖. 시간순 정렬 리스트 + 그래프 요약까지.
- 새 퍼시스턴스/백엔드 없음. 순수 파생(derived) 뷰.
- `types.ts` 스키마 변경 없음(조합만). HermesExport 매핑은 backward-compatible 유지.

## 검증 가능성 (QA 관점)

- 순수 함수 `buildDelegationReplay(agents, events, requests)` 로 단위 테스트 100% 가능.
- 엣지 케이스: 빈 입력 → `idle`; 알 수 없는 agentId → 이름 fallback; timeout 이벤트 → `blocked` + risk 스텝; 모두 completed → `complete`.
- 리스크 오탐(‘0 errors’) 방지 케이스 포함.

## 보안 관점

- 외부 입력/발송 없음. import된 HermesExport로 들어온 신뢰 낮은 문자열을 **표시**만 하므로, summary/title은 React 기본 escape에 의존(HTML 주입 없음). `dangerouslySetInnerHTML` 사용 금지.
- 정규식은 사용자 제어 문자열이 아니라 고정 패턴만 사용(ReDoS 회피).

## Reviews

### designer — approved (2026-07-18)
정보구조 분화 타당(요청 랩=현재 큐/액션, 이 패널=시간순 리플레이+누적 방향 간선+리스크). seed로 blocked+risk+최근 경로 렌더 확인. design.md에서 반영할 refinement:
- eyebrow "Delegation Graph Replay" + h2 한국어 제목(예: "위임 흐름 리플레이").
- enum 한국어 라벨 확정. `handoff`는 기존 typeLabel '위임', status는 기존 statusLabel 재사용해 일관성 유지.
- 접근성: 리스크/blocked를 색상만으로 구분 금지 — 텍스트·아이콘 병기 + aria-label.
- 요청 랩(현재 큐)과 이 패널(누적 히스토리)을 구분하는 짧은 설명 카피.

### security — approved (2026-07-18)
순수 read-only 파생 뷰, 주입/ReDoS/비밀노출 없음. 권고(비차단): 리스크 감지는 정규식 대신 소문자화 후 `String.includes`로 처리해 ReDoS 여지 원천 제거, 무효 timestamp는 `toTime`(NaN→0) 방식으로 정렬 안정성 유지.

### qa — approved (2026-07-18)
순수 함수라 100% 단위 검증 가능. 아래 required 테스트를 구현 단계에서 반드시 포함:
1. blocked 우선순위: 모두 completed/declined이고 declined가 하나라도 있으면 `complete`가 아니라 `blocked`.
2. 동일 timestamp tie-break 결정론(정렬 안정성 + latest path 결정론).
3. 스텝 필터: `type: 'handoff'`가 아닌 이벤트는 replay 스텝에서 제외.
4. target 없는 스텝은 edge 미생성.
5. edge 집계: 동일 source→target 다건 시 count 누적, lastTimestamp=최댓값, 리스크 1건이라도 있으면 hasRisk.
6. 리스크 키워드 대소문자 무관(TIMEOUT/Failed/ERROR).
7. `0 errors` 오탐 방지(clean 스텝은 risk 아님).
8. idle 정의: agents는 있으나 스텝 0건 → idle.
