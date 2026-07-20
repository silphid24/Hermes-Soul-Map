---
title: Live Export v2 — HermesExport 계약 확장 + Source Health 패널
status: approved
approvals:
  backend: approved
  frontend: approved
  security: approved
  designer: approved
required_approvals: [backend, frontend, security, designer]
---

# Design — Live Export v2

> orchestrator가 backend/frontend 관점을 종합해 초안 작성. spec approved 후 진행.
> backend, frontend, security, designer 모두 approved 되어야 구현으로.

## 개요

`src/data/hermesExport.ts` 한 파일에 v2 계약(신규 optional 필드 4개)과 매핑 함수
3개(evolution/requests/roadmap) + Source Health helper 1개를 추가한다. UI 계약
(`SoulMapData`)과 공개 함수 시그니처(`mapHermesExportToSoulMap → SoulMapData`)는 그대로
유지한다. Source Health는 `SoulMapData`에 넣지 않고 별도 타입/헬퍼로 분리해 UI가 import
경로에서만 소비한다. `App.tsx`는 import 시 health를 상태로 받아 새 미니 패널로 렌더하고,
기존 "데이터 소스" Metric을 seed/imported 모드 배지로 통합한다.

## 아키텍처

```
HermesExport(JSON) ──validateHermesExport──▶ (ok) ─┬─ mapHermesExportToSoulMap ─▶ SoulMapData ─▶ UI 패널들
                                                   └─ deriveSourceHealth ───────▶ SourceHealth ─▶ SourceHealthPanel
seed(정적) ──────────────────────────────────────────────────────────────────▶ SoulMapData (health=null → "미확인")
```

- 순수 함수 파이프라인, 부수효과 없음. 매핑은 `exportedAt` 기반 결정론 유지.
- 신규 매핑 함수는 기존 헬퍼(`clamp`, `toTime`, `normalizeSource`) 스타일을 그대로 계승.

## 데이터 모델 / 스키마

### 1) Raw export 신규 타입 (hermesExport.ts)

```ts
export interface HermesEvolutionSnapshot {
  agentId?: string
  profileId?: string     // agentId 없을 때 fallback 원천
  date?: string
  level?: number
  stage?: string
  memoryCount?: number
  skillCount?: number
  autonomy?: number
}

export interface HermesRequest {
  id?: string
  fromAgentId?: string
  toAgentId?: string
  capability?: string
  summary?: string
  status?: string        // 신뢰 불가 → normalize
  priority?: string      // 신뢰 불가 → normalize
  createdAt?: string
}

export interface HermesRoadmapItem {
  id?: string
  phase?: string         // 신뢰 불가 → normalize
  title?: string
  description?: string
  done?: unknown         // 신뢰 불가 → strict boolean
}

export interface HermesSourceChannelInput {
  status?: string
  count?: number
  note?: string
}

export interface HermesSourceHealthInput {
  sessions?: HermesSourceChannelInput
  memories?: HermesSourceChannelInput
  skills?: HermesSourceChannelInput
  cron?: HermesSourceChannelInput
  flowLogs?: HermesSourceChannelInput
}

export interface HermesExport {
  exportedAt: string
  profiles: HermesProfile[]
  sessions?: HermesSession[]
  cronJobs?: HermesCronJob[]
  flowLogs?: HermesFlowLog[]
  // v2 (optional, 하위호환)
  evolutionSnapshots?: HermesEvolutionSnapshot[]
  requests?: HermesRequest[]
  roadmap?: HermesRoadmapItem[]
  sourceHealth?: HermesSourceHealthInput
}
```

### 2) Source Health 출력 타입 (UI 소비용, hermesExport.ts에서 export)

```ts
export type SourceChannelKey = 'sessions' | 'memories' | 'skills' | 'cron' | 'flowLogs'
export type SourceChannelStatus = 'live' | 'partial' | 'empty' | 'error' | 'unknown'

export interface SourceChannelHealth {
  key: SourceChannelKey
  label: string          // 한국어: 세션/기억/스킬/크론/플로우로그
  status: SourceChannelStatus
  count: number
  note: string           // 비고(제외 건수 등), 없으면 ''
}

export interface SourceHealth {
  reportedAt: string     // exportedAt
  channels: SourceChannelHealth[]  // 항상 5개, 고정 순서
}
```

## API / 인터페이스

| 함수 | 시그니처 | 비고 |
|---|---|---|
| mapHermesExportToSoulMap | `(input: HermesExport) => SoulMapData` | 기존 유지 + evolution/requests/roadmap 채움 |
| deriveSourceHealth | `(input: HermesExport) => SourceHealth` | 신규 export, 절대 throw 금지 |
| validateHermesExport | `(input: unknown) => ValidateResult` | v2 필드는 optional 검증(타입 틀리면 경고, 차단은 안 함) |

### 매핑 규칙 상세 (spec FR-2~FR-5 구현)

- **evolution**: `Array.isArray(input.evolutionSnapshots)` 가드 → 각 항목:
  `const agentId = s.agentId ?? s.profileId`; `if (!agentId || !s.date) return skip`.
  `level = intOr(s.level, 1)`, `stage = s.stage ?? '미정'`,
  `memoryCount = nonNegInt(s.memoryCount, 0)`, `skillCount = nonNegInt(s.skillCount, 0)`,
  `autonomy = clamp(s.autonomy, 0)`.
- **requests**: 가드 → `if (!r.id) skip`; `status = normalizeRequestStatus(r.status)`(미지→queued),
  `priority = normalizeImportance(r.priority)`(미지→medium), from/to `?? ''`, cap/summary `?? ''`,
  `createdAt = r.createdAt ?? exportedAt`.
- **roadmap**: 가드 → `if (!i.id) skip`; `phase = normalizeRoadmapPhase(i.phase)`(미지→future),
  `done = i.done === true`, title/desc `?? ''`.
- **deriveSourceHealth**: 채널별 자동 건수 계산 →
  sessions = Σ session.messages.length, memories = Σ profile.memories.length,
  skills = Σ profile.skills.length, cron = cronJobs.length, flowLogs = flowLogs.length.
  provided(`input.sourceHealth[key]`)가 있으면 status=clampStatus(provided.status ?? 자동),
  count=provided.count ?? 자동, note=provided.note ?? ''. 없으면 status=(count>0?live:empty),
  note=''. **단, seed 경로는 애초에 이 함수를 호출하지 않고 health=null 전달** → UI가 unknown 표시.

신규 내부 헬퍼: `intOr`, `nonNegInt`, `normalizeRequestStatus`, `normalizeImportance`,
`normalizeRoadmapPhase`, `clampStatus`, `channelCount`. 모두 순수·throw 없음. 기존 `clamp`
(0–100)는 autonomy에 재사용.

## 프론트엔드 / UX

- **App 상태 추가**: `const [sourceHealth, setSourceHealth] = useState<SourceHealth | null>(null)`.
  ImportPanel `onApply(next, meta, health)` 시그니처에 health 추가 → import 시 set, reset 시 null.
- **모드 배지(FR-7)**: 기존 `metrics-row`의 "데이터 소스" Metric을 제거하고, hero nav 우측
  `<span>` 배지(`정적 seed` / `가져온 export`)로 통합. `sourceLabel` state는 배지 텍스트로 유지.
- **SourceHealthPanel(FR-6)**: `metrics-row` 아래 새 `<section className="source-health">`.
  - health=null(seed): 5개 채널 카드 모두 "미확인 · 데이터 미제공" 회색 표시.
  - health 있음: 채널별 카드 = 한국어 라벨 + 상태 라벨(활성/부분/없음/오류/미확인) + `{count}건` + note.
  - 상태별 색: live=green(#34d399), partial=amber(#eab308), empty=muted, error=red(#f87171),
    unknown=muted. **색과 무관하게 상태 라벨 텍스트 병기(NFR-5 접근성)**.
- 기존 Linear dark 톤(패널 배경·border·radius·간격)을 App.css 기존 변수/클래스와 맞춤.
  텍스트 전부 한국어. `dangerouslySetInnerHTML` 미사용(React 이스케이프).

### 상태 라벨 매핑(프론트 상수)

```ts
const channelLabel = { sessions:'세션', memories:'기억', skills:'스킬', cron:'크론', flowLogs:'플로우로그' }
const healthStatusLabel = { live:'활성', partial:'부분', empty:'없음', error:'오류', unknown:'미확인' }
```

## 보안 고려사항

- 신뢰 불가 JSON: 모든 신규 매핑 throw 금지. `Array.isArray` 가드 후 순회.
- allowlist 추출만 사용 — `{...raw}` 스프레드/동적 키 대입 금지 → prototype pollution 차단.
- 제공 status는 enum 화이트리스트 clamp(미지→unknown).
- 렌더는 React 기본 이스케이프. `note/summary/title` 등 사용자 텍스트도 JSX 텍스트 노드로만.
- 비밀정보 없음(로컬 자기 데이터 자기 표시). 외부 전송/네트워크 호출 없음.

## 대안 및 트레이드오프

- **A. Source Health를 SoulMapData에 포함** vs **B. 별도 타입/헬퍼(채택)**: spec "과설계 금지" +
  UI 계약 오염 방지 위해 B. UI는 import 경로에서만 health를 다룸.
- **done을 `Boolean()` 강제변환** vs **strict `=== true`(채택)**: task 지시("boolean fallback")와
  시나리오 3(`"yes"→false`) 일치 위해 strict. 사용자가 명시적으로 true를 준 경우만 완료.
- **자동 판정에 partial 도입** vs **live/empty만(채택)**: 자동으로 부분 상태를 추론하면
  임계값 논쟁 발생. partial/error는 export 제공자가 명시할 때만.

## 영향 범위 / 마이그레이션

- 변경: `src/data/hermesExport.ts`(추가), `src/data/hermesExport.test.ts`(테스트 추가),
  `src/App.tsx`(패널/배지), `src/App.css`(스타일), `examples/hermes-export.sample.json`, `README.md`.
- 기존 공개 API/타입 시그니처 불변 → 기존 테스트·seed·UI 회귀 없음.
- 롤백: 신규 필드/함수/패널 제거로 원복 가능(순수 additive).

## 테스트 전략 (요약)

- **단위(hermesExport.test.ts, TDD 선작성)**:
  - v1 하위호환: 기존 8+4 테스트 그대로 통과.
  - evolution: 정상 매핑 / profileId fallback / date 없음 skip / autonomy·level 오염 fallback.
  - requests: 정상 / 미지 status→queued / 미지 priority→medium / id 없음 skip / from·to 없음 '' / createdAt fallback.
  - roadmap: 정상 / 미지 phase→future / done "yes"→false / done true→true / id 없음 skip.
  - deriveSourceHealth: 자동 판정(count>0 live, 0 empty) / provided status clamp(미지→unknown) /
    provided count·note 우선 / 잘못된 타입 필드 안전.
  - FR-1: 신규 필드가 배열 아닌 타입일 때 빈 결과 수렴 / `evolutionSnapshots:[]` → `evolution:[]`.
- **빌드/타입/lint**: `npm test -- --run`, `npm run lint`, `npm run build` 3종 통과(G5).
- UI는 수동 렌더 확인(빌드 통과 + 컴포넌트 순수성). E2E 미도입(비목표).

## Reviews

> backend, frontend, security, designer가 각자 블록 추가. 자기 승인 금지(초안은 orchestrator 작성).

### backend — 2026-07-16
**결정**: pending
**이유**:
**변경 요청**:
-

### frontend — 2026-07-16
**결정**: pending
**이유**:
**변경 요청**:
-

### security — 2026-07-16
**결정**: pending
**이유**:
**변경 요청**:
-

### designer — 2026-07-16
**결정**: pending
**이유**:
**변경 요청**:
-
