---
title: Request Protocol Execution Layer
status: approved
approval_basis: gstack self-review (독립 리뷰어 세션 없음 — Reviews 섹션에 근거 기록)
approvals:
  designer: self_reviewed
  security: self_reviewed
  qa: self_reviewed
required_approvals: [designer, security, qa]
---

# Spec — Request Protocol Execution Layer (T07)

## 목표

Soul Map은 지금까지 관측·판단·거버넌스를 문서화해 왔다.

| 기존 레이어 | 답하는 질문 |
|---|---|
| Agent Activity Blackbox | 이 에이전트가 **무슨 일을 했는가** |
| Soul Diff / Identity Drift | 이 에이전트는 **누구인가 / 어떻게 변했는가** |
| Delegation Graph Replay | 일이 **어떻게 위임되어 흘렀는가** |
| Capability Readiness Matrix | **누가 무엇을 맡을 수 있는가** |
| Agent Runbook | 이 에이전트를 **어떻게 운영해야 하는가** |

T07이 답할 질문은 그 다음이다.

> **"이 요청을 지금 실행하면 정확히 무엇이 어디로 나가고, 누구 승인이 필요하고, 무엇이 감사 로그에 남는가?"**

즉 Runbook이 *운영 규칙(operating contract)* 을 선언한다면, Execution Layer는 그 규칙을 **요청 단위로 집행(enforce)** 하고 그 집행 자체를 감사 가능한 기록으로 남긴다.

## 배경 / KB 조회 결과 (선행 단계)

`/kb` 대상 = `.claude/knowledge/*.md`. 관련 문서를 먼저 읽고 재사용 결정을 정리했다.

- `agent-runbook-operating-manual.md`
  - 후속 항목에 **"T07에서 Runbook의 승인 게이트를 실제 dry-run/approval/audit log 실행 계층과 연결한다"** 가 명시돼 있다. 이번 작업의 직접적 근거다.
  - 게이트 fail-safe 목록(메일 / 외부 게시 / n8n workflow mutation / 자동화 파이프라인 / GitHub push·release / destructive local ops / production 데이터 쓰기)을 **그대로 승계**한다. 새로 만들지 않는다.
  - **결정: Execution Layer는 승인 게이트를 재발명하지 않고 `buildAgentRunbook()` 의 `approvalRequired` 를 소비한다.** 세 패널(Readiness / Runbook / Execution)이 서로 모순되면 안 된다.
- `capability-readiness-matrix.md`
  - `external_send` 는 affinity만 있으면 trust/autonomy와 무관하게 `approval_gated`. Runbook을 경유해 이 규칙이 자동 승계된다.
- `agent-activity-blackbox.md` / `agent-activity-blackbox-live-updates.md`
  - risk 파싱 규칙(`timeout` / `fail`·`error` / `changes_requested`, `0 errors` 는 clean) 재사용.
  - **evidence 없으면 지어내지 않는다** — simulated 결과도 난수가 아니라 관측 신호에서 파생해야 한다.
- `delegation-graph-replay.md`
  - `handoff` 타입 이벤트만 replay step이 된다. audit → LogEvent 변환 시 `type: 'handoff'` 여야 replay/status에 반영된다.
  - risk step은 summary 키워드로 판정된다 → 실패/timeout audit의 summary에 해당 키워드가 들어가야 한다.
- `hermes-export-v2-contract.md` / `live-hermes-export-generator.md`
  - 실데이터(`examples/*.local.json`)는 커밋 금지, redaction 유지.

## 범위 (In Scope)

1. 실행 대상 추상화 (`ExecutionTarget`) + 행동 분류 (`ExecutionAction`)
2. 실행 계획 파생 (`planRequestExecution`) — target / action / 위험도 / 승인 필요 여부 / 게이트 근거 / 예상 audit event / 예상 결과
3. **dry-run 모드** — 요청을 실행하기 전 preview. 상태를 바꾸지 않는다.
4. **approval-gated simulated execution** — 승인 없는 mutation/publish/workflow_mutation/destructive/GitHub push는 실행 불가(`blocked_approval`)
5. **audit log** — execution id / request id / target / action / mode / status / reason / createdAt
6. audit → `LogEvent` 변환으로 Activity Blackbox · Timeline · Delegation Graph Replay에 반영
7. simulated failure / timeout 이 risk event로 replay·status에 나타남
8. UI: `Request Execution Protocol` 패널 (Request Lab 인접)
9. 문서: README, `.claude/knowledge/request-protocol-execution-layer.md`, `task.md`

## 범위 밖 (Out of Scope) — **하드 금지**

- **실제 외부 호출 일체 금지**: 메일 발송, n8n workflow mutation/activate, GitHub push·release, 실제 Claude/Hermes command 실행, HTTP fetch.
  - 이번 계층의 `execute`는 **외부 호출이 아니라 감사되는 상태 전이(simulated/audited state transition)** 만 수행한다.
- 승인자 신원/인증(누가 승인했는가의 검증) — 브라우저 로컬 UI 범위 밖
- audit log 영속화(서버 저장) — 메모리 상태만 사용, seed 불변
- 실행 결과의 롤백/보상 트랜잭션

## 사용자 시나리오

동한이 `Request Execution Protocol` 패널에서:

1. `req-dev` (hermes-default → Claude Code / `dashboard.visualize_profiles`) 를 선택한다.
   - target `claude-code`, action `code_change`, 승인 불필요(로컬 코드 작업은 Runbook상 allowed)
   - **Dry-run** → "실행 시 남을 audit event" preview
   - **Simulated 실행** → status `executed`, audit log 1건 추가 → Blackbox/Timeline에 반영
2. `req-social` (pistachio → Social Media / `social.publish_monitor`) 를 선택한다.
   - target `hermes`, action `publish`, **승인 필요** 마커 표시 + 게이트 근거("외부 게시/발송 — 공개 전 사람 승인")
   - 승인 없이 **Simulated 실행** → status `blocked_approval`, 실행되지 않음
   - **승인 체크** 후 실행 → status `executed`
3. `req-doc-auto-brief` (izera365 → Doc Auto Agent) 를 선택한다.
   - 경로상 관측된 timeout 신호 때문에 예상 결과가 `timeout`
   - 실행 시 audit status `timeout` → risk LogEvent → Delegation Graph Replay가 `막힘`으로 표시

agent class별로 눈에 띄게 달라야 한다: Claude Code(코드) / Google Workspace(메일·문서) / n8n(workflow mutation) / 미연결 프로필(manual).

## 요구사항

### 기능 요구사항

- FR-1: `ExecutionTarget` = `hermes | claude-code | n8n | google-workspace | github | local | manual`
- FR-2: `ExecutionAction` = `observe | draft | mutate | publish | code_change | destructive | workflow_mutation`
- FR-3: target/action은 요청 텍스트 + 대상 에이전트 신호에서 **파생**한다. 하드코딩 금지.
- FR-4: `dryRunRequest()` 는 `mode: 'dry_run'`, `status: 'preview'` audit entry를 만들고 요청 객체를 변경하지 않는다.
- FR-5: `executeRequest()` 는 `mode: 'simulated'`. 승인 게이트 대상인데 `approved !== true` 면 `status: 'blocked_approval'`.
- FR-6: audit entry는 `id / requestId / target / action / mode / status / reason / createdAt` 를 모두 갖는다.
- FR-7: `auditToLogEvents()` 는 `type: 'handoff'` LogEvent를 만들어 기존 Blackbox/Replay 파이프라인에 흘려보낸다.
- FR-8: `timeout` / `failed` audit은 risk로 판정되는 summary를 만들어야 한다.
- FR-9: UI 패널에서 요청 선택 → dry-run → (필요 시) 승인 → simulated 실행 → audit log 표시.

### 비기능 요구사항

- NFR-1: 모든 도메인 함수는 순수 함수. throw 금지. 난수/현재시각 내부 사용 금지(주입).
- NFR-2: 같은 입력 → 같은 출력(결정론). 테스트로 고정한다.
- NFR-3: 네트워크·파일 IO 없음. import한 모듈에 fetch/child_process 없음.
- NFR-4: 접근성 — 패널은 `region` 랜드마크, 승인 마커는 텍스트로 읽힌다.

## 제약 / 가정

- `InterAgentRequest` 코어 스키마는 바꾸지 않는다 (T03/T04/T06가 모두 소비 중).
- audit log는 App 메모리 상태. 새로고침하면 사라진다 (seed 불변 원칙).
- 승인은 UI 체크박스 = "사람이 이 실행을 통과시켰다"는 로컬 선언. 인증이 아니다 — 문구로 명시한다.

## 안전 규칙 (Security-critical)

1. **execute ≠ 외부 호출.** 이 계층의 실행은 감사되는 상태 전이일 뿐이다. 코드에 외부 IO를 넣지 않는다.
2. **게이트는 축소 불가.** 승인 판정은 Runbook `approvalRequired` (∪ action 위험도 규칙)의 합집합이다. 어느 쪽이든 게이트를 걸면 게이트된다.
3. **fail-safe 방향.** 신호가 애매하면 `allowed` 가 아니라 `approvalRequired`. target을 못 정하면 `manual`(사람이 직접) 로 떨어뜨린다.
4. **지어내기 금지.** simulated 실패/timeout은 난수가 아니라 **관측된 risk 신호**에서 파생한다. 신호가 없으면 `executed`.
5. import JSON(신뢰 경계 밖)이 게이트를 무력화할 수 없다 — Runbook의 합집합 규칙을 그대로 상속한다.

## Acceptance Criteria

- [x] execution target abstraction (`hermes|claude-code|n8n|google-workspace|github|local|manual`)
- [x] action 분류 (`observe|draft|mutate|publish|code_change|destructive|workflow_mutation`)
- [x] dry-run mode: target/action/승인 필요/예상 audit event preview
- [x] approval-gated mutation: Runbook `approvalRequired` + action 위험도 반영, 승인 없이 실행 불가
- [x] audit log: execution id, request id, target, action, mode, status, reason, createdAt
- [x] audit → LogEvent → Activity Blackbox / Delegation Graph Replay 반영
- [x] simulated failure/timeout → risk event → replay/status 반영
- [x] UI: Request Execution Protocol 패널, 선택 → dry-run → approval marker → simulated 실행 + audit log
- [x] seed 상태에서 agent class별 차이 (Claude Code / Google Workspace / n8n / 미연결)
- [x] TDD RED → GREEN, 도메인 + UI visible contract 테스트
- [x] `npm test -- --run`, `npm run lint`, `npm run build`
- [x] README / KB / task.md 갱신

## 미해결 질문

- audit log 영속화 위치(브라우저 localStorage vs 서버)는 T05 bridge와 함께 결정한다. 이번엔 메모리.
- 실제 실행 연결(T07 후속)은 별도 bridge 서버가 생긴 뒤 승인 토큰과 함께 설계한다.

## Reviews

독립 리뷰어 세션이 없으므로 아래는 **gstack 관점 self-review** 기록이다. 승인 상태는 `self_reviewed` 로 표기했고 타인 승인으로 위조하지 않았다.

### `/spec` 관점 (product)

- 질문: "Runbook이 이미 승인 필요를 보여주는데 Execution Layer는 중복 아닌가?"
  - 답: Runbook은 **에이전트 단위 선언**, Execution은 **요청 단위 집행 + 기록**. 중복을 피하려고 Execution은 Runbook 출력을 소비하고 게이트를 재정의하지 않는다.
- 질문: "MVP 최소 단위는?"
  - 답: dry-run + 게이트 차단 + audit log. 이 셋이 없으면 나머지는 의미가 없다. replay 반영은 audit→LogEvent 변환 한 함수로 거의 공짜로 나온다.

### `/plan-ceo-review` 관점 (scope)

- 실제 외부 호출을 이번에 붙이면 되돌릴 수 없는 부작용(메일 발송, workflow 변경)이 생기고 검증 비용이 급증한다 → **simulated/audited 상태 전이로 한정**. plan.md 원칙 1("실행 버튼보다 관측 계층 우선")과 일치.
- 제품 가치: "실행 전에 무엇이 나가는지 보여주는" preview가 곧 신뢰 계층이다. 외부 호출 없이도 데모 가치가 성립한다.

### `/cso` 관점 (security)

- 최대 리스크: 이 패널이 **실제 실행처럼 보이는데 실제로는 아니거나, 반대로 진짜 실행이 되는 것**. → UI/audit 문구에 `dry_run` / `simulated` 를 항상 표기하고, 코드에 외부 IO를 넣지 않는다. 테스트로 mode 표기를 고정한다.
- 두 번째 리스크: 게이트 우회. → 승인 판정은 Runbook 합집합이고, `executeRequest` 는 게이트 판정을 재계산해서 자체적으로 차단한다(UI가 버튼을 잘못 노출해도 도메인에서 막힌다). 테스트로 고정.
- 세 번째 리스크: 감사 흔적 없는 실행. → 모든 경로(preview/blocked/executed/failed/timeout)가 audit entry를 만든다. 차단도 기록된다.

### `/qa` 관점

- seed 5개 요청이 서로 다른 target/action을 내는지, 게이트 요청이 승인 없이 실행되지 않는지, timeout audit이 replay를 `막힘`으로 바꾸는지 → 도메인 테스트 + jsdom UI 테스트로 검증한다.
