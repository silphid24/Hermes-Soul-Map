# Claude Code Task — 3번 Delegation Graph Replay

한국어 사용자 요청: "이제 다음 3번으로 개발 진행해줘. 클로드 코드를 통해서 개발해봐"

## Feature

Implement item 3: **Delegation Graph Replay** for the Hermes Agent Soul Map dashboard.

Goal: the user should be able to see how one agent delegates/requests work to another over time, not just a static request queue. Build a timeline/replay-oriented card from existing `events` and `requests` data.

## Project rules

- Follow project AGENTS/CLAUDE rules.
- Korean UI/documentation text preferred.
- Use strict TDD:
  1. Write failing test first.
  2. Run targeted test and confirm RED.
  3. Implement minimal code.
  4. Run targeted test and full verification.
- Maintain `.claude/workspace/<slug>/spec.md`, `design.md`, `implementation.md` with approved frontmatter.
- Do not delete existing .claude kit.
- No git commit; this directory is not a git repo.

## Expected implementation shape

Suggested domain file: `src/domain/delegationReplay.ts`

Input:
- `agents: Agent[]`
- `events: LogEvent[]`
- `requests: InterAgentRequest[]`

Output should include:
- replay steps sorted chronologically
- each step has source agent, target agent if known, kind (`request | handoff | completion | risk | signal` or similar), timestamp, title/summary, status/priority/importance
- derived edges between agents with counts and latest timestamp
- replay health/status: `idle | flowing | blocked | complete`
- risk detection when handoff event mentions timeout/failure/error/changes_requested or request declined

UI:
- Add a `Delegation Graph Replay` panel/card to the dashboard.
- Show latest delegation path/edges and chronological replay steps.
- Must be useful for current seed data: `izera365 → doc-auto-agent`, `hermes-default → ai-trend-radar`, `pistachio → social-media`, `hermes-default → claude-code`.

Data/import:
- Existing request seed should produce visible replay steps.
- If needed, add/adjust seed events minimally.
- Keep HermesExport mapping backwards-compatible.

Docs:
- README update.
- `.claude/knowledge/delegation-graph-replay.md` with the reusable decision.

Verification commands:

```bash
npm test -- --run
npm run lint
npm run build
```

Return a concise summary of changed files and verification output.
