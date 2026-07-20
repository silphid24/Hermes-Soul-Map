# Agent Activity Blackbox

확정일: 2026-07-18  
수정일: 2026-07-19

## 결정

Agent Activity Blackbox는 정적 `data.events`만 보지 않는다. 사용자가 대시보드에서 생성/전이하는 inter-agent request도 activity event로 변환해 Blackbox와 Timeline에 반영한다.

## 원인 분석 — 2026-07-19 버그

증상: 1번 Blackbox가 이후 작업/요청 상태 변화에 따라 지속 업데이트되지 않음.

Root cause:

- `ActivityBlackbox`는 `summarizeAgentActivity(agent, events)`를 사용했다.
- `events` prop은 `data.events`만 전달됐다.
- Request Lab의 `requests` state는 계속 변하지만, 이 변화가 `LogEvent[]`로 들어가지 않았다.
- 따라서 요청 생성/상태 전이/위임 흐름이 Blackbox에는 반영되지 않았다.

## 수정

- `requestActivityEvents(requests)` 추가.
- 각 `InterAgentRequest`를 from/to 양쪽 에이전트의 `handoff` LogEvent로 변환.
- App에서 `activityEvents = data.events + requestActivityEvents(requests) + runtimeEvents`로 계산.
- Agent Detail Blackbox와 Timeline은 `activityEvents`를 사용.
- Request 상태 전이 시 `runtimeEvents`에 현재 시각 기반 activity event를 추가해 마지막 활동 시각이 갱신되도록 함.

## 검증

- `activity.test.ts`에 request queue → blackbox activity regression test 추가.
- 전체 검증: 125 tests passed, lint 0, build passed.

## 추가 수정 — 2026-07-20

7/16 seed 이벤트에 멈추는 문제를 해결하기 위해 `scripts/generate-project-activity.mjs`를 추가했다. `predev`/`pretest`/`prebuild`에서 로컬 project artifact mtime을 읽어 `src/data/projectActivity.ts`를 생성하고, seed events 앞에 합친다. Hermes Default Blackbox는 이제 최근 `task.md`, `README.md`, `.claude/knowledge/*`, `src/domain/*`, `src/App.tsx` 변경을 activity로 표시한다.

## 추가 수정 — 2026-07-20 non-Hermes agents

Hermes Default만 최신화되고 izera365, Doc Auto Agent, AI Trend Radar, Pistachio, Social Media, Claude Code, Google Workspace, n8n MCP가 7/16에 남는 문제가 확인됐다. 원인은 `generate-project-activity.mjs`가 Hermes Default artifact events만 생성한 것. 해결: active non-Hermes agents 8개에 대해 `operational-heartbeat-*` 이벤트를 생성하고 seed events 앞에 합친다. Regression test는 모든 visible agent의 latest activity가 2026-07-16 이후인지, non-Hermes latest summary가 `Operational heartbeat`인지 검증한다.

## 추가 수정 — 2026-07-20 source-derived activity

모든 에이전트에 같은 timestamp의 synthetic `Operational heartbeat`를 찍는 방식은 실제 작동/미작동 상태를 왜곡한다. `generate-project-activity.mjs`를 source-derived 방식으로 변경했다: profile-backed agents는 해당 `~/.hermes` profile의 `state.db` message timestamp와 non-empty cron output mtime 중 최신 evidence를 사용하고, project/dev activity는 실제 project artifact mtime을 사용한다. evidence가 없는 integration/stale agent는 기존 seed timestamp를 유지한다. Regression tests: visible agent timestamps가 하나로 통일되지 않아야 하고, active profile-backed agents만 7/16 이후여야 하며, stale social-media는 7/16 상태를 유지해야 한다.

## 추가 수정 — 2026-07-20 HERMES_HOME fallback

Claude Code QA에서 T01 리스크로 지적한 절대경로/비-hermetic 테스트 문제를 처리했다. `generate-project-activity.mjs`는 이제 `process.env.HERMES_HOME || os.homedir()+/.hermes`를 사용하고, `PROJECT_ACTIVITY_OUT`으로 테스트용 출력 경로를 오버라이드할 수 있다. profile evidence가 없으면 current heartbeat를 조작하지 않고 seed snapshot timestamp를 fallback event로 보존한다. Regression test는 임시 missing HERMES_HOME에서 generator를 실행해 fallback event와 `Operational heartbeat` 미사용을 검증한다.
