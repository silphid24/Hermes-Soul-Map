---
title: Live Hermes Export Generator — 설계
status: approved
approvals:
  backend: approved
  frontend: approved
  security: approved
  designer: approved
required_approvals: [backend, security, designer]
---

# Design — Live Hermes Export Generator (T05)

> spec approved 이후 작성. backend/security/designer 검토 반영.

## 아키텍처 개요

두 파일로 분리한다. **보안·조립 로직은 순수 함수로 격리해 단위 테스트**하고, disk/sqlite
같은 부작용은 얇은 IO 셸에 가둔다. (`generate-project-activity.mjs`와 동일한 python3 sqlite
패턴 재사용.)

```
scripts/
  hermesExportCore.mjs        # 순수: redaction + 조립 + sourceHealth  (테스트 대상)
  hermesExportCore.test.ts    # vitest: redaction/조립/계약 라운드트립
  generate-hermes-export.mjs  # IO 셸: ~/.hermes 수집 → 코어 호출 → JSON write
```

데이터 흐름:

```
~/.hermes (실제 아티팩트)
   │  (generate-hermes-export.mjs, 채널별 try/catch)
   ▼
raw = { exportedAt, profiles, sessions, cronJobs, flowLogs, channels }
   │  (buildHermesExport → 정규화 + redactDeep)
   ▼
HermesExport JSON  ──▶  validateHermesExport / mapHermesExportToSoulMap (브라우저)
```

## 코어 API (`hermesExportCore.mjs`)

```js
export const REDACTED = '‹redacted›'

// 문자열 하나에서 시크릿/PII 토큰 제거 (idempotent, 안전한 값은 무변경)
export function redactSecrets(value): string

// 객체/배열/문자열을 재귀적으로 훑어 모든 문자열에 redactSecrets 적용
export function redactDeep(value): value

// 채널 메타(있으면 status/note override) + 파생 count → 5채널 sourceHealth
export function buildSourceHealth(channels, { profiles, sessions, cronJobs, flowLogs }): object

// raw 아티팩트 → 정규화된, redaction된 HermesExport (never throws)
export function buildHermesExport(raw, opts?): HermesExport
```

### Redaction 규칙 (순서 중요)

1. `KEY=VALUE` 시크릿: 키 이름에 SECRET/TOKEN/PASSWORD/APIKEY/ACCESS_KEY/PRIVATE_KEY/
   CLIENT_SECRET/REFRESH_TOKEN 포함 → 값만 `‹redacted›`, 키는 보존.
2. 프로바이더 키/토큰: `sk|rk|pk-…`, `AIza…`, `xox[baprs]-…`, `gh[pousr]_…` → `‹token›`.
3. JWT: `eyJ….….…` → `‹jwt›`.
4. 이메일 → `‹email›`.
5. 절대 홈 경로 `/Users/<user>` · `/home/<user>` → `~` (OS 사용자명 제거).
6. 긴 opaque blob: hex ≥32 → `‹hex›`, 순수 alnum ≥40 → `‹secret›`.

안전성: ISO 타임스탬프(`2026-07-20T16:03:18Z`), 짧은 cron/세션 id(`bb87053632a3`)는
어떤 규칙에도 걸리지 않아 무변경(테스트로 고정).

### sourceHealth 판정

- channels[key].status가 있으면 그대로(예: IO에서 읽기 실패 시 `error`).
- 없으면 파생 count>0 → `live`, 아니면 `empty`.
- count는 channels 제공값 우선, 없으면 파생값. note는 제공값(예: truncate 안내).

## IO 셸 (`generate-hermes-export.mjs`)

- `hermesHome = process.env.HERMES_HOME || join(homedir(), '.hermes')`.
- `outputPath = argv --out= | positional | process.env.HERMES_EXPORT_OUT |
   examples/hermes-export.local.json`.
- 프로필 수집: 기본(root) + `profiles/*`. description=`profile.yaml`, 기억=`memories/MEMORY.md`
  ·`USER.md`의 bullet/heading 라인(캡 25), 스킬=`skills/*` 디렉터리(캡 30, proficiency 기본값),
  세션=`state.db` 최근 메시지(python3, 캡 20), 각 채널 실패 시 `channels[key]={status:'error',note}`.
- cron: `cron/jobs.json` → `{id,name,schedule(display/expr),lastRunAt(last_run_at),summary(prompt 첫 줄)}`.
- flowLogs: 프로젝트 루트 `.claude/logs/flow.jsonl` 최근 40줄.
- 마지막에 `buildHermesExport(raw)` → `writeFileSync(outputPath, JSON)` → 요약 로그.

## 보안 검토 (security)

- 개인 데이터 유출 방지: (1) 채널별 redaction은 코어에서 강제, (2) 최종 `redactDeep`로 전수
  훑기, (3) 실데이터 출력 파일은 `examples/*.local.json`으로 gitignore.
- python3 호출은 파일 경로를 `JSON.stringify`로만 주입(기존 스크립트와 동일), 셸 인젝션 없음.

## 테스트 계획 (qa)

1. RED: 코어 미구현 → import 실패.
2. redactSecrets: 토큰/이메일/홈경로/KEY=VALUE redaction, ISO·짧은id 무변경.
3. buildHermesExport: redaction된 export가 `validateHermesExport` 통과 + `map…` 매핑,
   sources 누락 시 resilient, 5채널 sourceHealth, IO의 `error` status 존중.
4. 회귀: `examples/hermes-export.sample.json`이 계속 validate + map 통과.

## 대안 검토

- 코어를 `src/`에 두면 `tsc -b`(build)가 node 의존을 타입체크하려다 실패. → `scripts/` .mjs로 격리.
- sqlite를 순수 JS로 읽기: 의존성 추가 부담 → 기존 python3 패턴 재사용.
