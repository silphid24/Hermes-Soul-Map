---
status: review
approvals:
  qa: pending
required_approvals: [qa]
---

# Implementation — 생성 산출물 상시 보장

## 프로세스 이탈 (정직하게 기록)

이 슬러그는 spec → design 게이트를 거치지 않았다. `main` 머지 직후 `npx vitest`가
25개 중 12개 파일에서 깨지는 회귀를 급히 막으려고 `ad76198`을 바로 커밋했기 때문이다.
그 커밋은 **회귀를 막았지만 새 결함 여러 개를 들여왔고**, 이어진 `/code-review max`가
15건을 지적했다. 이 문서는 그 15건에 대한 사후 처리 기록이다.

교훈: 핫픽스라도 "무엇을 보장하는가"를 한 문단이라도 적었다면 `tsc -b`가 다섯 개
트리거를 전부 빠져나간다는 사실을 커밋 전에 알았을 것이다.

## 보장 범위 (Contract)

`src/data/projectActivity.ts`는 gitignore 대상이며, 다음 경로에서 **존재하고 신선하다**.

| 진입점 | 보장 주체 | 검증 |
|---|---|---|
| `npx vite`, `npm run dev` | 플러그인 | 파일 삭제 후 dev 서버 → `/src/data/seed.ts` 200 |
| `npx vitest`, `npm test`, `npm run test:watch` | 플러그인 | 파일 삭제 후 26 files / 255 tests |
| `npm run build` | 플러그인 + `prebuild` | 파일 삭제 후 build 성공 |
| `npm run typecheck` | `pretypecheck` | 파일 삭제 후 `tsc -b` 성공 |
| `npm install` 직후 편집기 tsserver | `prepare` | — |
| **`npm install` 없는 생짜 `npx tsc -b`** | **없음 (알려진 구멍)** | README에 명시 |

## 리뷰 15건 처리

| # | 지적 | 처리 |
|---|---|---|
| 1 | `postinstall`이 `src/` 부재 시 ENOENT로 install 중단 | `mkdirSync(dirname, {recursive:true})` — RED 재현 후 수정 |
| 2 | `~/.hermes` 없는 머신에서 자체 테스트가 실패 | 테스트 불변식을 "evidence와 일치"로 재정의. 양쪽 상태 모두 검증 |
| 3 | 플러그인이 `PROJECT_ACTIVITY_OUT`을 무시해 엉뚱한 경로를 지킴 | 생성기의 `resolveOutputPath()`를 공유 |
| 4 | `tsc -b`가 어떤 트리거로도 안 덮임 | `pretypecheck`+`typecheck` 추가. 남는 구멍은 README에 명시 (은폐하지 않음) |
| 5 | `stdio:'inherit'`이 `--reporter=json` 출력 오염 | spawn 제거, 함수 호출. JSON 파싱 검증 통과 |
| 6 | try/catch·사후 검증 없음 | 컨텍스트 포함 재throw + `eventCount === 0` 방어 |
| 7 | `existsSync` 단축으로 데이터가 설치 시점에 동결 | 5분 신선도 기준 |
| 8 | `execFileSync` 타임아웃 없음 (잠긴 sqlite에 무한 블록) | python3 호출에 `timeout` + `killSignal` |
| 9 | 플러그인이 생성기 상수를 중복 계산 | 생성기를 `generateProjectActivity()` 로 export, 상수 단일화 |
| 10 | 트리거 5개, 소유자 없음 | 소유자 2개(플러그인 / tsc 훅)로 정리, `predev`·`pretest` 제거 |
| 11 | `vitest.config.ts`가 어떤 tsconfig에도 없어 타입체크 안 됨 | `tsconfig.node.json` include에 추가 → **실제로 vite/vitest `Plugin` 타입 충돌을 잡아냄** |
| 12 | `postinstall`은 prod install·`npm i -D` 마다 실행 | `prepare`로 교체 |
| 13 | `import.meta.dirname` (Node ≥20.11) 하한 미선언 | `engines.node` 선언 + `fileURLToPath` 폴백 |
| 14 | 0바이트 파일이 `existsSync`를 통과해 자가치유 불가 | 임시 파일 + `renameSync`, 크기 기준 판정 |
| 15 | 테스트·문서·워크스페이스 없음 | 이 문서 + 신규 테스트 13종 + README + `.claude/knowledge/generated-data-entry-points.md` |

리뷰가 놓친 것 하나를 추가로 발견: `vitest/config`의 vite(rollup)와 프로젝트 vite 8(rolldown)의
`Plugin` 타입이 `PluginContextMeta.rolldownVersion` 때문에 서로 assignable하지 않다.
`.d.mts`를 구조적 타입으로 선언해 해결.

## 검증

파일을 매번 삭제한 뒤 실행.

```
npx vitest run --reporter=json | JSON.parse   JSON OK
npx vitest run                                26 files / 255 tests passed
npm run build                                 passed
npm run typecheck                             passed
npm run lint                                  0 warnings / 0 errors
npx vite (dev)                                /src/data/seed.ts → 200, 파일 재생성 확인
```
