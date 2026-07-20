# Live Hermes Export Generator

확정일: 2026-07-20

## 결정

`plan.md` 5번(Live Hermes Export Bridge)의 첫 단계 = **로컬 생성기**. 실제 `~/.hermes`
아티팩트를 읽어 브라우저가 가져올 수 있는 `HermesExport` JSON을 만든다. 이번 범위는
생성기 + redaction + 가져오기 가능한 샘플까지. 브릿지 HTTP 서버는 후속.

## 구조 (보안 로직 격리)

- `scripts/hermesExportCore.mjs` — **순수** 함수. redaction + 조립 + sourceHealth.
  단위 테스트(`scripts/hermesExportCore.test.ts`)로 고정. 절대 throw 안 함.
- `scripts/generate-hermes-export.mjs` — disk/sqlite 부작용을 가둔 IO 셸.
- 코어를 `src/`에 두지 않는 이유: `tsc -b`(build)가 node 의존을 타입체크하다 실패. `scripts/` .mjs로 격리.

## 소스 매핑

| 채널 | 소스 |
|---|---|
| profiles | `HERMES_HOME`(default) + `profiles/*`, description=`profile.yaml`, identity=`SOUL.md` |
| memories | `profiles/*/memories/*.md` bullet/line (cap 25) |
| skills | `profiles/*/skills/*` 디렉터리 (cap 30, proficiency 기본 60) |
| sessions | `profiles/*/state.db` 최근 메시지 (python3 sqlite, cap 20) |
| cron | `cron/jobs.json` |
| flowLogs | 프로젝트 `.claude/logs/flow.jsonl` (최근 40) |

## Redaction 규칙 (`redactSecrets`, 순서 중요)

1. `KEY=VALUE` 시크릿(키 이름에 SECRET/TOKEN/PASSWORD/APIKEY/…) → 값만 `‹redacted›`.
2. JWT `eyJ….….` → `‹jwt›`.
3. 프로바이더 키 `sk|rk|pk-`, `AIza`, `xox[baprs]-`, `gh[pousr]_` → `‹token›`.
4. 이메일 → `‹email›`.
5. 절대 홈경로 `/Users|/home/<user>` → `~` (OS 사용자명 제거).
6. 긴 blob: hex≥32 → `‹hex›`, alnum≥40 → `‹secret›`.

최종적으로 export 전체를 `redactDeep`로 재귀 훑기(defense-in-depth). ISO 타임스탬프·짧은
cron/세션 id는 어떤 규칙에도 안 걸려 무변경(테스트로 고정).

## 안전 규칙

- 실데이터 출력은 `examples/*.local.json` → **gitignore**. 절대 커밋 금지.
- 커밋되는 가져오기 샘플은 손으로 큐레이션한 `examples/hermes-export.sample.json` (테스트로 validate+map 고정).
- 소스가 없거나 읽기 실패해도 크래시 금지 → 채널 `error`/`empty`로 표기하고 계속.

## 사용법

```bash
npm run generate:hermes-export                 # → examples/hermes-export.local.json
HERMES_HOME=/path node scripts/generate-hermes-export.mjs --out=out.json
```

관련: [[hermes-export-v2-contract]], [[capability-readiness-matrix]]
