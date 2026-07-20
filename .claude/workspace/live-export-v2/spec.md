---
title: Live Export v2 — HermesExport 계약 확장 + Source Health 패널
status: approved
approvals:
  designer: approved
  security: approved
  qa: approved
required_approvals: [designer, security, qa]
---

# Spec — Live Export v2 (HermesExport 계약 확장 + Source Health)

> orchestrator 작성. design/implementation 진입 전 designer/security/qa 모두 approved 필요.

## 배경 / 문제

현재 `HermesExport` 가져오기 어댑터(`src/data/hermesExport.ts`)는 profiles / sessions /
cronJobs / flowLogs 만 `SoulMapData`로 매핑한다. 그 결과 실제 export를 가져와도
`evolution`, `requests`, `roadmap`은 항상 빈 배열이 되어 진화·요청·로드맵 패널이 seed에서만
살아있다. 또한 사용자는 지금 보는 화면이 **정적 seed인지 실제 import인지**, 그리고 import된
데이터의 **각 채널(sessions/memories/skills/cron/flowLogs)이 실제로 채워졌는지**를 한눈에
구분할 수 없다. README가 예고한 다음 단계(evolution/roadmap 원천, live data readiness)를
가져오기 계약 수준에서 강화하는 것이 목표다. 단, 이번 사이클은 **import 계약 강화까지**이며
실제 Hermes memory/session DB를 읽는 백엔드는 만들지 않는다.

## 목표 (Goals)

- G1: `HermesExport`에 optional `evolutionSnapshots`, `requests`, `roadmap`, `sourceHealth`
  4개 필드를 추가하되, **기존 v1 import JSON은 100% 그대로 동작**한다(하위 호환).
- G2: 세 배열을 `SoulMapData.evolution / requests / roadmap`으로 안전 매핑한다 —
  잘못된 status/priority/phase/done 값은 예외 없이 안전한 fallback으로 수렴한다.
- G3: import 시 각 데이터 채널의 상태를 계산하는 Source Health 정보를 제공하고,
  대시보드 상단에 "Live Readiness / Source Health" 미니 패널로 노출한다.
- G4: 화면이 **seed mode**인지 **imported mode**인지 명확히 표시한다.
- G5: 검증 3종(`npm test -- --run`, `npm run lint`, `npm run build`)이 모두 통과한다.

## 비목표 (Non-goals)

- 실제 Hermes memory/session DB 직접 읽기, export 자동 생성기/브릿지 서버 구현.
- 백엔드 서버 추가(frontend-only 유지).
- 외부 전송/배포.
- 요청 랩의 상태 전이를 실제 에이전트 호출과 연결(여전히 in-memory mock).
- 새 라우팅/멀티 페이지 도입, 상태 영속화(localStorage 등).

## 사용자 시나리오

1. **v1 사용자(하위 호환)**: 기존 `hermes-export.sample.json`(v1)을 붙여넣어도 이전과
   동일하게 에이전트/이벤트가 뜨고, Source Health 패널은 각 채널을 데이터 기반으로
   자동 판정(예: 세션 "활성", 크론 "없음")한다.
2. **v2 사용자**: `evolutionSnapshots / requests / roadmap / sourceHealth`가 포함된
   export를 붙여넣으면 진화·요청·로드맵 패널이 실제 import 데이터로 채워지고, Source
   Health 패널이 채널별 상태·건수를 표시한다.
3. **불완전 데이터**: status가 `"weird"`, phase가 `"someday"`, done이 `"yes"`(문자열),
   `autonomy: "high"`, `level: "x"`인 깨진 export를 붙여넣어도 크래시 없이
   fallback(`queued` / `future` / `false` / `0` / `1`)으로 렌더된다.
4. **seed 사용자**: import 전에는 상단에 "정적 seed" 배지와 함께 Source Health 패널이
   각 채널 "미확인 · 데이터 미제공"으로 안전하게 표시된다.

## 요구사항

### 기능 요구사항

- FR-1: `HermesExport`에 optional `evolutionSnapshots?`, `requests?`, `roadmap?`,
  `sourceHealth?`를 추가한다. 셋 다 없으면 v1과 동일 결과. **잘못된 타입으로 존재하는
  경우(배열이어야 할 필드가 문자열·객체·null 등)도 `Array.isArray` 가드로 빈 배열/기본값에
  수렴한다.** `evolutionSnapshots: []`(빈 배열)이면 `evolution: []`이 되어야 한다.
- FR-2: `evolutionSnapshots` → `SoulMapData.evolution`.
  - **skip 조건**: 사용 가능한 agentId가 없거나(`agentId`·`profileId` 모두 부재) 또는
    `date`가 없으면 해당 항목을 skip한다. agentId는 `agentId` 우선, 없으면 `profileId`.
  - **값 필드 fallback**: `level`(비-number → 1), `stage`(fallback '미정'),
    `memoryCount/skillCount`(비-number → 0, 음수는 0으로), `autonomy`(number로 강제 후
    0–100 clamp, 비-number → 0). 예: `autonomy:"high"` → 0, `level:"x"` → 1.
- FR-3: `requests` → `SoulMapData.requests`. `id` 필수(없으면 skip). `status`가
  RequestStatus(`queued|accepted|in_progress|completed|declined`)가 아니면 `queued`,
  `priority`가 Importance(`low|medium|high|critical`)가 아니면 `medium`.
  `fromAgentId`/`toAgentId` 없으면 **빈 문자열 `''`**, `capability/summary` 없으면 빈 문자열,
  `createdAt` 없으면 `exportedAt`.
- FR-4: `roadmap` → `SoulMapData.roadmap`. `id` 필수(없으면 skip). `phase`가 mvp/next/future가
  아니면 `future`. **`done`은 값이 실제 boolean `true`일 때만 `true`, 그 외(문자열 `"yes"`,
  숫자, undefined, null 등) 전부 `false`로 안전 변환한다**(strict boolean fallback).
  `title/description` 없으면 빈 문자열.
- FR-5: Source Health는 `SoulMapData`에 억지로 넣지 않고 **별도 export helper**
  (예: `deriveSourceHealth(input)`)로 제공한다. 채널 5종(내부 key 영어 / 화면 한국어 라벨):
  `sessions`(세션) / `memories`(기억) / `skills`(스킬) / `cron`(크론) / `flowLogs`(플로우로그).
  각 채널은 상태·건수·비고를 가진다.
  - **상태 enum(5종)과 한국어 라벨**: `live`(활성) / `partial`(부분) / `empty`(없음) /
    `error`(오류) / `unknown`(미확인).
  - **자동 판정 규칙(sourceHealth 미제공 시)**: 실제 데이터 건수 `count > 0` → `live`,
    `count === 0` → `empty`. (자동 판정에서는 `partial/error`를 만들지 않는다.)
  - **export가 `sourceHealth` 제공 시**: 제공된 status 문자열도 위 enum 화이트리스트로
    clamp하여 미지값은 `unknown`으로 수렴시킨다(임의 라벨 렌더 금지). `count`가 있으면
    사용, 없으면 자동 판정 건수 사용. `note`(비고)가 있으면 노출.
  - **비고(note) 용도**: 채널에서 유효하지 않아 제외된 항목이 있으면 "N건 제외"처럼
    사유를 노출해 조용한 skip으로 인한 건수 불일치 혼란을 방지한다.
- FR-6: metrics-row 아래에 "Live Readiness / Source Health" 미니 패널을 추가한다.
  각 채널을 한국어 라벨 + 상태 라벨(텍스트) + 건수로 표시한다. seed거나 데이터가 없는
  채널은 "미확인 · 데이터 미제공"으로 표시한다.
- FR-7: seed mode vs imported mode를 배지로 명확히 구분한다. 기존 header의 "데이터 소스"
  Metric(App.tsx `sourceLabel`)과 **중복되지 않도록**, 해당 Metric을 seed/imported 모드
  배지로 통합한다(문구 톤: 상태 서술형 — "정적 seed" / "가져온 export").
- FR-8: `examples/hermes-export.sample.json`을 v2(신규 4필드 포함)로 확장하고 README에 반영.

### 비기능 요구사항 (성능 / 보안 / 접근성)

- NFR-1(보안/안정성): 모든 매핑 함수는 **절대 throw 하지 않는다**. 신뢰할 수 없는 붙여넣기
  JSON을 방어적으로 정규화한다(기존 어댑터 규칙 계승).
- NFR-2(호환성): 기존 테스트/타입/공개 API 시그니처를 깨지 않는다.
  `mapHermesExportToSoulMap`의 반환 타입은 `SoulMapData`로 유지.
- NFR-3(TDD): 신규 매핑·fallback은 코드보다 테스트를 먼저 작성한다.
- NFR-4(디자인): 한국어 UI 우선, 기존 Linear-style dark UI 톤·간격·색과 정합.
- NFR-5(접근성): 상태 배지는 색만이 아니라 텍스트 라벨로도 구분 가능해야 한다.

## 제약 / 가정

- 프로젝트 KB(`.claude/knowledge/`)는 현재 비어 있어 참고할 기존 결정 없음 →
  이번에 확정되는 v2 계약을 사이클 종료 시 KB에 기록한다.
- 기존 어댑터 규칙(부분 데이터 안전, unknown kind→specialist, 7일 recentGrowth 등)을 계승.
- `Date.now()`/`new Date()` 사용은 UI 이벤트 핸들러 한정(기존 RequestLab 패턴 유지),
  매핑 로직은 `exportedAt` 기반 결정론 유지.
- git 저장소 아님 → 커밋 금지, task-sized 변경만.
- **보안(security 리뷰 반영, 모두 design에서 준수)**:
  - 신뢰 불가 객체를 `{...raw}` 스프레드하거나 동적 키 대입(`obj[k]=`)으로 옮기지 않고,
    필요한 필드만 명시적으로 추출(allowlist)한다 — `__proto__/constructor` 키 유입 차단.
  - 신규 배열 필드는 `Array.isArray` 가드 후에만 순회한다.
  - 제공된 sourceHealth status는 enum 화이트리스트로 clamp(미지값 → `unknown`).
  - 렌더는 React 기본 이스케이프에만 의존하고 `dangerouslySetInnerHTML`을 쓰지 않는다.

## 해결된 질문 (리뷰 라운드 1 반영)

- Q1(해결): 상태 enum = live(활성) / partial(부분) / empty(없음) / error(오류) /
  unknown(미확인) 5종. 자동 판정은 live/empty만 생성, partial/error/unknown은 제공된
  sourceHealth 또는 clamp 결과로만 발생. empty(구조 있으나 0건) vs unknown(제공 자체 없음/seed)
  체감 차이는 화면 라벨로 구분(FR-6).
- Q2(해결): sourceHealth는 ImportPanel `onApply` 메타로 App에 전달, seed면 null →
  패널은 "미확인 · 데이터 미제공" 표시.
- Q3(해결): skip vs fallback 경계 — 식별자(evolution: agentId·date / requests·roadmap: id)가
  없으면 항목 skip, 값 필드는 fallback(FR-2~FR-4에 명시).

## 미해결 질문

- 없음(라운드 1에서 모두 해소).

## Reviews

> 각 리뷰어는 아래 형식으로 블록을 추가합니다. 자기 작성 문서 승인 금지.

### security — 2026-07-16 (라운드 1)
**결정**: approved
**이유**: NFR-1(절대 throw 금지, 방어적 정규화)과 기존 allowlist/clamp 패턴 계승이 명시되어
신뢰 불가 입력 처리 원칙이 충분. 비목표(실 DB 미접근·백엔드 없음·외부전송 없음)로 공격 표면
경계가 명확. 로컬 자기 데이터만 자기에게 표시하므로 유출 경로 없음.
**변경 요청(권고, non-blocking → spec 제약에 반영 완료)**:
- Array.isArray 가드 / allowlist 추출(스프레드·동적키 금지) / status enum clamp /
  dangerouslySetInnerHTML 금지 → "제약·보안" 절에 명문화함.

### designer — 2026-07-16 (라운드 1)
**결정**: changes_requested → 라운드 2에서 반영 확인 요청
**이유**: 방향은 타당하나 한국어 라벨 규칙·상태 표현 공백·중복 UI(데이터 소스 Metric)·seed 문구
불일치가 spec 수준에서 확정 필요.
**변경 요청(반영 완료)**:
- 채널 한국어 라벨(세션/기억/스킬/크론/플로우로그) 명시 → FR-5.
- 상태 enum 한국어 라벨(활성/부분/없음/오류/미확인) 명시 → FR-5, Q1.
- skip 시 note "N건 제외" 노출 요구화 → FR-5.
- 데이터 소스 Metric 중복 제거(모드 배지로 통합), 패널 배치(metrics-row 아래) → FR-6, FR-7.
- seed 문구 톤 통일(상태 서술형) → 시나리오 4, FR-7.

### qa — 2026-07-16 (라운드 1)
**결정**: changes_requested → 라운드 2에서 반영 확인 요청
**이유**: 대부분 검증 가능하나 done 규칙 모순 1건 + 미정 값 2건으로 TDD 기대값 확정 불가.
**변경 요청(반영 완료)**:
- (모순) done: `Boolean()` vs `"yes"→false` → **실제 boolean true만 true** 로 확정(FR-4, 시나리오 3).
- from/to 없을 때 값: **`''`** 로 확정(FR-3).
- FR-2 skip "둘 다"의 의미 명확화(agentId·profileId 모두 부재 또는 date 부재) → FR-2.
- 숫자 오염(level/autonomy/memoryCount/skillCount 비-number) fallback 규칙 + 시나리오 추가 → FR-2, 시나리오 3.
- 빈 배열 vs undefined: `evolutionSnapshots:[]` → `evolution:[]` 명시 → FR-1.
- FR-5 자동판정 임계값(count 0→empty, >0→live) 고정 → FR-5.

### designer — 2026-07-16 (라운드 2)
**결정**: approved
**이유**: 라운드 1 지적 5개 항목이 모두 spec 수준에서 실행 가능하게 확정. 접근성(색+텍스트
병행)·Linear dark 정합·empty/unknown 구분 명문화 확인.
**변경 요청**: 없음 (비차단 노트: FR-6 문구를 "seed/미제공→미확인, imported 0건→없음"으로
분리 서술 권장 → design에 반영함)

### qa — 2026-07-16 (라운드 2)
**결정**: approved
**이유**: done strict boolean, from/to '', skip 경계, 숫자 오염 fallback, 빈 배열, 자동판정
임계값이 모두 검증 가능한 구체 기대값으로 확정 → TDD 즉시 작성 가능. 방어적 엣지 커버리지 충분.
**변경 요청**: 없음 (implementation 리뷰 시 skip/strict-boolean/enum clamp 케이스를 게이트로 확인 예정)
