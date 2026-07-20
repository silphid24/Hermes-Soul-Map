---
title: Live Hermes Export Generator — 실제 ~/.hermes 아티팩트 → HermesExport JSON
status: approved
approvals:
  designer: approved
  security: approved
  qa: approved
required_approvals: [designer, security, qa]
---

# Spec — Live Hermes Export Generator (T05)

> orchestrator 작성. 이번 사이클은 T05(`task.md`)를 구현한다.
> 작성 전 KB 조회 완료: `.claude/knowledge/hermes-export-v2-contract.md`,
> `.claude/knowledge/capability-readiness-matrix.md`, `src/data/hermesExport.ts`,
> `scripts/generate-project-activity.mjs`.

## 배경 / 문제

지금까지(T01~T04) UI는 정적 seed 또는 손으로 만든 `examples/hermes-export.sample.json`으로만
살아난다. `plan.md` §4-1과 §1의 5번 항목(Live Hermes Export Bridge)은 **실제** Hermes 로컬
아티팩트(session DB, 기억/프로필 팩트, 스킬, cron 작업·출력, Claude flow 로그)를 읽어
브라우저가 그대로 가져올 수 있는 `HermesExport` JSON을 만드는 로컬 생성기를 요구한다.

정적 seed → 살아있는 운영체제로 전환하는 첫 단계이며, 이번 범위는 **로컬 생성기 + 안전한
redaction + 가져오기 가능한 샘플**까지다. 브릿지 서버/실시간 스트리밍은 비목표.

## 목표 (Goals)

- G1: `HERMES_HOME`(기본 `~/.hermes`)의 실제 아티팩트를 읽어 `HermesExport` JSON을 생성하는
  로컬 스크립트/CLI를 추가한다.
- G2: 출력 경로를 CLI 인자(positional / `--out=`) 또는 env(`HERMES_EXPORT_OUT`)로 지정할 수 있다.
- G3: 내보내는 모든 텍스트·경로에서 비밀정보/PII성 토큰(API key, bearer/JWT, 이메일, OS
  사용자명이 포함된 절대경로, `KEY=VALUE` 시크릿)을 **반드시 redaction**한다.
- G4: 5개 채널(sessions/memories/skills/cron/flowLogs)의 `sourceHealth`를 채운다. 읽기
  실패한 채널은 `error`, 비어있으면 `empty`, 있으면 `live`.
- G5: 소스가 없거나 읽기에 실패해도 **예외 없이** 유효한 export를 만든다(resilient).
- G6: 생성물이 `validateHermesExport()`를 통과하고 `mapHermesExportToSoulMap()`으로
  예외 없이 매핑되는 것을 테스트로 보장한다(가져오기 계약 검증).
- G7: 가져오기 가능한 샘플(`examples/hermes-export.sample.json`)이 계속 유효함을 테스트로 고정.
- G8: 검증 3종(`npm test -- --run`, `npm run lint`, `npm run build`) 통과.

## 비목표 (Non-goals)

- 브릿지 HTTP 서버(`GET /api/hermes-export`), WebSocket/SSE 실시간 갱신.
- 실제 개인정보가 담긴 로컬 export를 git에 커밋(=> `examples/*.local.json`은 gitignore).
- UI 변경(이미 import 경로는 존재).

## 사용자 시나리오

1. 동한이 로컬에서 `npm run generate:hermes-export`를 실행 → `examples/hermes-export.local.json`
   생성 → 대시보드 **Import Hermes JSON**에 붙여넣으면 실제(redaction된) 에이전트 상태가 뜬다.
2. CI/문서용으로 `HERMES_HOME=/tmp/none node scripts/generate-hermes-export.mjs --out=/tmp/x.json`
   처럼 소스가 없어도 크래시 없이 빈-채널 export가 나온다.

## 요구사항

### 기능 요구사항

- FR-1: 순수(부작용 없는) 조립·redaction 코어 모듈(`scripts/hermesExportCore.mjs`)을 둔다.
- FR-2: IO 셸(`scripts/generate-hermes-export.mjs`)이 disk에서 아티팩트를 수집(각 소스는
  try/catch로 격리)하고 코어에 넘겨 JSON을 쓴다.
- FR-3: profiles = 기본 프로필(HERMES_HOME 루트) + `profiles/*`. 각 프로필의 description은
  `profile.yaml`, 기억은 `memories/*.md`, 스킬은 `skills/*`, 세션 메시지는 `state.db`에서 파생.
- FR-4: cron = `cron/jobs.json`, flowLogs = 프로젝트 `.claude/logs/flow.jsonl`.
- FR-5: 각 채널을 상한(cap)으로 truncate하고 truncate 시 `sourceHealth.note`에 남긴다.

### 비기능 요구사항 (보안 / 견고성)

- NFR-1(보안): 최종 export 객체 전체를 재귀 redaction(`redactDeep`)으로 한 번 더 훑어
  누락 필드가 없도록 한다. (defense-in-depth)
- NFR-2: sqlite 접근(python3)이 없거나 실패해도 해당 채널만 `error`로 표시하고 계속 진행.
- NFR-3: 생성물은 하위호환 `HermesExport` v2 계약을 그대로 만족한다.

## 제약 / 가정

- `HermesExport` v2 계약(`.claude/knowledge/hermes-export-v2-contract.md`)을 준수한다.
- 실제 `~/.hermes`는 개인 데이터 → 생성된 실데이터 export는 절대 커밋하지 않는다.
- Node ESM 스크립트 컨벤션은 `scripts/generate-project-activity.mjs`를 따른다(python3 sqlite).

## 미해결 질문

- 없음(이번 범위 한정). 브릿지 서버는 후속 태스크(T07 근처)로 이월.
