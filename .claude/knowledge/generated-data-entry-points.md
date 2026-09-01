# 생성 산출물을 "항상 존재하게" 만드는 법 — 트리거가 아니라 소유자를 정한다

`src/data/projectActivity.ts`는 로컬 `~/.hermes`에서 생성되는 gitignore 대상 파일이다.
이 파일이 없으면 `src/data/seed.ts`의 import가 깨져 앱과 테스트가 전부 죽는다.

## 처음에 한 실수: 트리거를 하나씩 덧붙이기

깨진 경로를 발견할 때마다 훅을 하나씩 붙였다 — `predev`, `pretest`, `prebuild`,
그다음 `postinstall`, 그다음 vite/vitest 플러그인. 다섯 개의 트리거가 각각 다른 의미를
가졌다: npm 훅은 무조건 재생성, 플러그인은 없을 때만 생성, `postinstall`은 `~/.hermes`가
아예 없는 환경에서도 실행. 그리고 `tsc -b`는 다섯 개 전부를 빠져나갔다.

**교훈: 진입점마다 특례를 붙이면 여섯 번째 진입점이 또 뚫린다.** 진입점을 세는 대신
"누가 이 파일을 책임지는가"를 정해야 한다.

## 지금 구조 — 두 소유자

| 소유자 | 덮는 범위 | 판단 기준 |
|---|---|---|
| `scripts/generatedDataPlugin.mjs` | vite / vitest로 들어오는 모든 경로 | 파일 없음 · 0바이트 · 5분 초과 |
| `prepare` / `prebuild` / `pretypecheck` | TypeScript 컴파일러 경로 | 무조건 재생성 |

플러그인은 **자식 프로세스를 띄우지 않고 생성기를 함수로 호출한다**. 이게 핵심이다.

## spawn을 걷어내자 같이 사라진 버그들

`execFileSync(node, [generator])` 로 생성기를 부르면 다음이 전부 따라온다.

- **경로 분기** — 플러그인이 출력 경로를 따로 계산하면 `PROJECT_ACTIVITY_OUT`이 설정된
  환경에서 생성기는 A에 쓰고 플러그인은 B를 확인한다. 성공을 보고하면서 파일은 없다.
- **stdout 오염** — `stdio: 'inherit'`은 생성기의 `console.log`를 부모의 stdout에 섞는다.
  `vitest --reporter=json | jq` 가 첫 실행에서 깨진다.
- **불투명한 실패** — 생성기가 non-zero로 죽으면 `Error: Command failed`만 남는다.
- **프로세스 비용** — vite가 `[PLUGIN_TIMINGS]` 경고를 찍을 만큼.

생성기를 `export function generateProjectActivity(options)` 로 만들고 CLI는 얇은 꼬리로
남기면 네 개가 한 번에 없어진다. **스크립트는 함수 + CLI 꼬리로 쓴다.**

## 파일 생성 자체의 함정

- `writeFileSync`는 원자적이지 않다. 중간에 끊기면 0바이트 파일이 남고, 그 파일은
  `existsSync`를 통과해 모든 재생성 경로를 무력화한다. → 임시 파일 + `renameSync`,
  그리고 존재가 아니라 **크기**를 확인한다.
- `writeFileSync`는 부모 디렉터리를 만들지 않는다. `npm ci`는 `COPY package*.json` 뒤,
  `src/`가 아직 없는 상태에서도 돈다. → `mkdirSync(dirname, { recursive: true })`.
- 외부 프로세스(`python3` sqlite 조회)는 dev 서버 시작 경로에 있다. 실행 중인 에이전트가
  `state.db`를 잠그면 무한정 블록된다. → `timeout` + `killSignal` 필수.

## `postinstall` 대신 `prepare`

`postinstall`은 `npm i -D anything` 마다, 그리고 앱을 실행하지 않는 prod install에서도
돈다. 머신 고유 I/O(홈 디렉터리 읽기, python3 6회 spawn)를 거기 두면 안 된다.
`prepare`는 dev 설치 의미를 갖는다. 다만 둘 다 `--ignore-scripts`에서는 안 돈다 —
그래서 `prepare`를 유일한 보증으로 삼을 수 없고, 플러그인이 실제 보증을 맡는다.

## 테스트는 작성자 머신에서만 통과하면 안 된다

`projectActivity.test.ts`는 profile 기반 에이전트가 "무조건 최신"이길 요구했다.
`~/.hermes`가 없는 CI 러너나 새 클론에서는 생성기가 seed snapshot으로 폴백하므로
그 순간 빨간불이 된다.

진짜 불변식은 **"타임스탬프가 evidence와 일치한다"**이다 — evidence가 있으면 최신,
없으면 stale인 채로 폴백이라고 밝힌다. 어느 쪽이든 현재 활동을 지어내면 실패한다.
이게 원래 막으려던 회귀(공유 heartbeat 조작)를 그대로 막으면서 머신 독립적이다.

## `vitest/config`와 vite 8의 `Plugin` 타입은 호환되지 않는다

`vitest`는 자기가 번들한 vite(rollup 기반) 타입을, 프로젝트는 vite 8(rolldown 기반)
타입을 쓴다. `PluginContextMeta`의 `rolldownVersion` 때문에 서로 assignable하지 않다.
플러그인 선언에서 어느 한쪽의 `Plugin`을 import하면 나머지 config가 타입 에러를 낸다.
→ **구조적 타입**(`{ name, enforce, buildStart }`)으로 선언하면 양쪽 모두에 맞는다.

`vitest.config.ts`는 어느 tsconfig의 `include`에도 없어서 아예 타입체크되지 않고 있었다.
`tsconfig.node.json`에 넣어야 이 종류의 드리프트가 잡힌다.
