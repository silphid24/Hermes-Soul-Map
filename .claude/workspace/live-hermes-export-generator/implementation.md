---
title: Live Hermes Export Generator — 구현 기록
status: approved
approvals:
  qa: approved
required_approvals: [qa]
---

# Implementation — Live Hermes Export Generator (T05)

> spec/design approved 이후 TDD(RED→GREEN)로 구현.

## 변경 파일

- `scripts/hermesExportCore.mjs` (신규) — 순수 redaction + 조립 코어.
- `scripts/hermesExportCore.test.ts` (신규) — 17 tests. RED→GREEN.
- `scripts/generate-hermes-export.mjs` (신규) — 실제 `~/.hermes` 수집 IO 셸 + CLI.
- `package.json` — `generate:hermes-export` 스크립트 추가.
- `.gitignore` — `examples/*.local.json` 무시(실데이터 유출 방지).
- `README.md` — 생성기 사용법/redaction 문서화.
- `.claude/knowledge/live-hermes-export-generator.md` (신규) — 결정 기록.
- `task.md` — T05 status/evidence 갱신.

## TDD 로그

1. RED: `npx vitest run scripts/hermesExportCore.test.ts`
   → `Failed to resolve import "./hermesExportCore.mjs"`.
2. GREEN: 코어 구현 후 17/17 pass.
3. 전체: `npm test -- --run` → 142 passed (12 files).

## 실데이터 검증 (redaction)

`node scripts/generate-hermes-export.mjs` → `examples/hermes-export.local.json`:

- profiles=6 sessions=6 cron=3 flowLogs=40, sourceHealth 전 채널 live.
- 유출 스캔 0건: `bluenote_macmini`(0), `/Users/`(0), 이메일(0), `sk-/AIza/xox`(0).
- redaction 적용: `‹email›`×5, `‹hex›`×2.

## 견고성 검증

`HERMES_HOME=/tmp/does-not-exist node scripts/generate-hermes-export.mjs --out=/tmp/x.json`
→ 크래시 없이 유효 export, `sourceHealth.sessions=empty`.

## 최종 검증

- `npm test -- --run` → 142 passed
- `npm run lint` → 0 errors
- `npm run build` → tsc + vite build 성공

## 후속 (out of scope)

- 브릿지 HTTP 서버(`GET /api/hermes-export`), 실시간 스트리밍 — 후속 태스크로 이월.
