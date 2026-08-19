# Hermes Agent Soul Map

동한이 사용하는 Hermes 계열 에이전트들을 **하나의 살아있는 운영체제처럼 시각화**하는 프론트엔드 MVP입니다.

## 핵심 컨셉

이 플랫폼은 단순한 로그 뷰어가 아니라, 에이전트별로 다음을 추적하는 **Agent Identity Platform**입니다.

| 축 | 설명 |
|---|---|
| Agent Constellation | Hermes default, izera365, Claude Code, Google Workspace, n8n, future coding lane의 관계망 |
| Identity / Soul | 각 에이전트의 자기 정의, 가치, 말투, 무드, 일관성 |
| Logs / Conversations | 대화·작업·기억·결정·handoff 이벤트 타임라인 |
| Evolution | 기억 수, 스킬 수, 자율성, 성장 단계 변화 |
| Inter-Agent Request | 에이전트 간 요청 큐와 상태 전이 프로토콜 |
| Roadmap | MVP → 실제 Hermes 로그 연동 → 자율 진화 엔진까지의 고도화 계획 |

## 현재 상태

- Frontend-only, offline-first 로컬 인텔리전스 대시보드
- 정적 seed로 시작 → 실제 Hermes export JSON 가져오기 지원
- React + TypeScript + Vite
- 도메인/데이터/스크립트/UI 로직 TDD 테스트 포함 (232개)

## 이번 사이클에서 바뀐 것

- **데이터 소스 스위처**: 정적 seed ↔ 가져온 Hermes export JSON. 잘못된 JSON은 크래시 없이 검증 오류 표시.
- **Import adapter v2 계약**: `HermesExport` 타입과 `mapHermesExportToSoulMap()` / `validateHermesExport()` / `deriveSourceHealth()` (`src/data/hermesExport.ts`).
- **Agent Activity Blackbox**: 선택 에이전트의 최근 활동, 변경 파일, 검증 신호, 리스크 신호를 로그에서 파생 계산 (`src/domain/activity.ts`).
  - `predev`/`pretest`/`prebuild`에서 `scripts/generate-project-activity.mjs`가 `HERMES_HOME`(기본 `~/.hermes`)의 profile/session/cron evidence와 로컬 프로젝트 산출물 mtime을 `src/data/projectActivity.ts`로 생성한다. 이 파일은 머신마다 내용이 달라지므로 gitignore 대상이다 — 커밋하지 않는다. evidence가 없으면 seed snapshot을 보존해 stale agent를 억지로 최신화하지 않는다.
- **Soul Diff / Identity Drift**: 현재 에이전트 정체성·자율성·기억·스킬·레벨과 identity/tone/mood/values/coherence를 과거 스냅샷 대비 diff로 표시 (`src/domain/identityDrift.ts`).
- **Delegation Graph Replay**: 요청 큐와 handoff 이벤트를 시간순 리플레이/간선 그래프로 파생해 위임 흐름과 리스크를 표시 (`src/domain/delegationReplay.ts`).
- **Capability Readiness Matrix**: Agent/Skill/Event/Risk/Soul 신호에서 능력별 readiness를 파생해 “누구에게 무엇을 맡길 수 있는가”를 표시 (`src/domain/capabilityReadiness.ts`).
- **Live Hermes Export Generator**: `HERMES_HOME`(기본 `~/.hermes`)의 profile/session DB, memory, skills, cron, Claude flow log를 redaction 후 browser-importable `HermesExport` JSON으로 생성 (`scripts/generate-hermes-export.mjs`).
- **Agent Runbook / Operating Manual**: 선택 에이전트별 추천 위임 상황, 승인 없이 가능한 행동, 승인 필요 항목, 금지 행동, 운영 제약, 검증 체크리스트, 중단 조건을 capability/activity/risk 신호에서 파생 (`src/domain/runbook.ts`).
- **Request Protocol Execution Layer**: Request Lab 요청을 실제 외부 호출 없이 dry-run preview, approval gate, simulated audit log, replay/activity event로 연결 (`src/domain/requestExecution.ts`).
- **시각 계약 테스트 재설계**: `App.css` 원문 정규식 대신 CSS 캐스케이드를 계산해 "실제로 적용되는 값"을 검증한다 (`src/test/cssModel.ts`). 선택자 매칭은 jsdom에 맡기고 특이도·소스 순서만 직접 계산한다. 특이도에 밀려 죽은 선언, 효과 없는 `@media` 오버라이드, 사장된 중복 선언을 잡는다.
- **연결선 기하 재작성**: SVG `viewBox` 정규화 공간을 버리고 컨테이너를 측정해 픽셀 좌표로 계산한다. 끝점은 노드 카드 경계에 붙고, 자리가 없는 짧은 간선은 바깥쪽으로 우회하는 호로 그린다 (`src/domain/constellationGeometry.ts`). 선택과 무관한 간선은 감추지 않고 흐리게 둔다.
- **Agent Soul Map Terminal theme**: `dashboard_design.md`의 다크 트레이딩 터미널 콘셉트는 레이아웃/미학 참고로만 사용하고, 제품 타이틀은 `Agent Soul Map`으로 유지. fixed header, 실행 기록 sidebar, pipeline layer strip, 접이식 agent detail, 방향성 connection arrow, CRT scanline, blue/cyan/green terminal palette를 적용 (`src/App.tsx`, `src/App.css`).
- **Agent Intelligence Scorecard**: 지능 점수·스킬 커버리지·기억 속도·리스크 신호를 파생 계산 (`src/domain/intelligence.ts`).
- **로그 탐색기**: 검색어·타입·최소 중요도·선택 에이전트 필터, 날짜별 그룹, 빈 상태 (`filterEvents`).
- **에이전트 간 요청 랩**: UI에서 mock 요청 생성 후 `queued → accepted → in_progress → completed` 상태 전이. 메모리 상태만 사용, seed 불변.
- **진화 서사**: 스냅샷에서 한국어 서사 생성 (`evolutionNarrative`).

## 데이터 가져오기 (Hermes export JSON)

대시보드 상단 **Import Hermes JSON** → JSON 붙여넣기 → **Apply import**.
`Load sample schema`로 예시를 채우거나, `examples/hermes-export.sample.json`을 그대로 붙여넣을 수 있습니다.
`Reset to seed`로 정적 seed로 되돌립니다.

`npm run generate:hermes-export`로 실제 로컬 Hermes 데이터를 redaction된 import JSON으로 만들 수 있습니다. 기본 출력은 `examples/hermes-export.local.json`이며, 실데이터 파일은 gitignore되어 커밋되지 않습니다.

```bash
npm run generate:hermes-export
HERMES_HOME=/path/to/.hermes HERMES_EXPORT_OUT=/tmp/hermes-export.json npm run generate:hermes-export
node scripts/generate-hermes-export.mjs --out=/tmp/hermes-export.json
```

Redaction 대상: API key/JWT/GitHub·Google·Slack token, `KEY=VALUE` 시크릿, 이메일, `/Users/<name>`·`/home/<name>` 홈 경로, 긴 opaque blob.

스키마 (모든 optional 필드는 안전하게 fallback):

```jsonc
{
  "exportedAt": "2026-07-11T15:30:00+09:00",   // 필수
  "profiles": [                                 // 필수: id·name 필수
    {
      "id": "default",
      "name": "Hermes Default",
      "kind": "default",                        // default|specialist|tool|integration|future (미지 → specialist)
      "trust": 96, "autonomy": 82, "coherence": 91,
      "memories": [{ "id": "m1", "content": "…", "createdAt": "ISO" }],
      "skills": [{ "id": "route", "name": "의도 라우팅", "proficiency": 92 }],
      "runbook": {                              // optional v3: 안전 섹션은 축소 불가, 파생 게이트와 합집합
        "headline": "운영 요약",
        "delegateWhen": ["맥락 라우팅이 필요할 때"],
        "approvalRequired": ["외부 발송 전 사람 승인"]
      },
      "connections": ["izera365"]
    }
  ],
  "sessions": [                                 // optional: 메시지 → LogEvent(type: message)
    { "id": "s1", "profileId": "default", "title": "…",
      "messages": [{ "id": "msg1", "role": "user", "content": "…", "timestamp": "ISO" }] }
  ],
  "cronJobs": [],                               // optional: lastRunAt 있으면 action 이벤트
  "flowLogs": [],                               // optional: timestamp 있으면 action 이벤트
  "evolutionSnapshots": [],                     // optional v2: 진화 원천
  "requests": [],                               // optional v2: 에이전트 간 요청 원천
  "roadmap": [],                                // optional v2: 로드맵 원천
  "sourceHealth": {                             // optional v2: 채널별 수집 상태
    "sessions": { "status": "live", "count": 1, "note": "mapped" },
    "memories": { "status": "partial", "count": 3 },
    "skills": { "status": "live", "count": 5 },
    "cron": { "status": "empty", "count": 0 },
    "flowLogs": { "status": "unknown", "count": 0 }
  }
}
```

매핑 규칙:

- 기억 통계 = memories 개수 + `exportedAt` 기준 최근 7일 신규 수.
- 메시지는 `type: message`, `importance: medium` 기본.
- v2 `evolutionSnapshots` / `requests` / `roadmap`이 있으면 각각 진화·요청·로드맵 패널을 채움. 없으면 빈 배열 유지(없는 데이터를 지어내지 않음).
- `sourceHealth`는 세션·기억·스킬·크론·플로우로그 채널 상태를 `live|partial|empty|error|unknown`으로 표시. 미지 status는 `unknown`으로 clamp.
- `profiles[].runbook`이 있으면 7개 운영 섹션의 override로 사용. 단, `approvalRequired` / `forbiddenActions`는 import JSON이 기존 안전장치를 지우지 못하도록 파생 항목과 **합집합**으로만 병합.

## 실행

프로젝트 운영 문서:

- `plan.md` — 추천안 기반 장기 제품 방향과 우선순위
- `task.md` — 현재 작업 보드와 Claude Code 실행 프롬프트
- `.claude/CLAUDE.md` / `AGENTS.md` — Claude Code/Hermes가 plan/task를 먼저 읽도록 설정

```bash
cd ~/dev/hermes-agent-soul-map
npm install
npm run dev
```

## 검증

```bash
npm test -- --run
npm run lint
npm run build
```

현재 검증 결과:

- domain/data/script/UI tests: 232 passed
- lint: 0 errors
- build: passed

## 구조

```text
src/
├── App.tsx                  # 대시보드 UI (import 패널·로그 탐색기·요청 랩 포함)
├── App.css                  # Agent Soul Map dark terminal UI
├── types.ts                 # Agent / Soul / Log / Evolution / Request / Runbook contracts
├── data/
│   ├── seed.ts              # 정적 Hermes agent seed data
│   ├── source.ts            # loadSeed() — UI 데이터 진입점
│   └── hermesExport.ts      # HermesExport v2 → SoulMapData 어댑터 + 검증 + Source Health
├── domain/
│   ├── activity.ts          # Agent Activity Blackbox: 최근 활동·변경 파일·검증/리스크 신호
│   ├── identityDrift.ts     # Soul Diff: 정체성·자율성·기억·스킬 drift 계산
│   ├── network.ts           # constellation node/edge 계산
│   ├── constellationGeometry.ts # 연결선 픽셀 좌표 기하 (카드 경계 앵커·짧은 간선 우회)
│   ├── timeline.ts          # 정렬/그룹화 + filterEvents() 탐색기 로직
│   ├── evolution.ts         # 성장 추세 + evolutionNarrative()
│   ├── intelligence.ts      # 지능 점수·스킬 커버리지·기억 속도·리스크
│   ├── requests.ts          # inter-agent request 상태 전이
│   ├── runbook.ts           # Agent Runbook: 승인 게이트·금지·검증 체크리스트 파생
│   └── requestExecution.ts  # dry-run·approval gate·simulated audit log·replay adapter
└── test/
    ├── setup.ts
    ├── cssModel.ts          # CSS 캐스케이드 모델 (특이도·소스순서·스택 컨텍스트)
    └── layoutBox.ts         # jsdom 렌더 박스 주입 (레이아웃 엔진 부재 보완)

examples/
├── hermes-export.sample.json  # 가져오기 테스트용 예시 export
└── hermes-export.local.json   # generated real-data export (gitignored)

scripts/
├── generate-hermes-export.mjs # live Hermes artifacts → HermesExport JSON
├── hermesExportCore.mjs       # redaction/sourceHealth/export assembly
└── generate-project-activity.mjs
```

## 실제 Hermes 연동 포인트

이미 어댑터 경계가 있습니다: `src/data/hermesExport.ts`의 `mapHermesExportToSoulMap()`.
다음 단계는 이 함수에 넣을 `HermesExport` JSON을 **자동 생성**하는 것입니다.

| 실제 원천 | 연결 방식 |
|---|---|
| Hermes memory | `~/.hermes/memories` / profile memory 요약을 `SoulSignals`, `MemoryStats`로 변환 |
| session logs | Hermes session DB를 `LogEvent[]`로 변환 |
| skills | `skills_list` 결과를 `Agent.skills`로 변환 |
| cron jobs | 자동화/반복 작업을 `LogEvent` + `InterAgentRequest`로 변환 |
| n8n | workflow/execution API를 자동화 spine 이벤트로 변환 |
| Claude Code | `.claude/logs/flow.jsonl`을 개발 에이전트 activity로 ingest |

## 다음 백엔드 통합 경로

지금은 프론트엔드-only이고, 실제 Hermes 파일에 직접 의존하지 않습니다(가져오기 계약이 명시적 경계).
연결 순서 제안:

1. **Export 생성기 (CLI/스크립트)**: ✅ 완료. `npm run generate:hermes-export`가 Hermes session DB·memory·skills·cron·`.claude/logs/flow.jsonl`을 읽어 `HermesExport` JSON으로 덤프한다.
2. **로컬 브릿지 서버**: export를 파일 대신 `GET /api/hermes-export`로 제공 → 대시보드가 주기적으로 fetch.
3. **Evolution/roadmap 원천**: v2 계약은 준비됨. 다음은 실제 export generator가 스냅샷 히스토리와 roadmap 상태를 생성.
4. **Request protocol 실행**: ✅ dry-run/approval/audit/replay layer 완료. 다음 backend bridge 단계에서 실제 에이전트 호출과 연결.
5. **Live mode**: cron/n8n/webhook 이벤트를 WebSocket으로 실시간 반영.
