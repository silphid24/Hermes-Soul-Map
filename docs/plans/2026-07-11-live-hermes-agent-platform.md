# Live Hermes Agent Platform Implementation Plan

> **For Hermes:** Use Claude Code print mode to implement this plan task-by-task. Keep TDD discipline: write/extend tests for every domain/data behavior, then implement UI.

**Goal:** Turn the current static Soul Map MVP into a practical local platform that can ingest real Hermes artifacts, inspect agent identity/evolution, and simulate inter-agent requests.

**Architecture:** Keep frontend-only for now, but introduce a clean adapter boundary. Real Hermes data will be imported from local JSON exports first, then later connected to session DB/memory/cron/n8n via backend or CLI bridge. UI should remain a dashboard, not a CRUD admin panel.

**Tech Stack:** Vite + React + TypeScript + Vitest + CSS. No backend yet. No new heavy visualization dependency unless necessary.

---

## Product Scope

### V1 target for this development cycle

Build **offline-first local intelligence dashboard**:

1. **Data source switcher**
   - Static seed mode
   - Imported Hermes export JSON mode
   - Clear validation/errors if imported data is malformed

2. **Real-data-ready import contract**
   - Define `HermesExport` type representing profiles, memories, sessions, skills, cron jobs, flow logs.
   - Add adapter that maps `HermesExport` → `SoulMapData`.
   - Keep `SoulMapData` as UI contract.

3. **Agent Intelligence Scorecards**
   - Each agent should show: identity, trust, autonomy, coherence, memory growth, skill coverage, risk signals.
   - Add derived metrics instead of hardcoding every display value.

4. **Conversation / log explorer**
   - Search query
   - Filter by agent/source/type/importance
   - Group by day
   - Empty states

5. **Inter-agent request lab**
   - Create a local mock request in UI
   - Validate transition rules already in `requests.ts`
   - Show state transitions visually: queued → accepted → in_progress → completed
   - No persistence yet; in-memory only.

6. **Evolution narrative**
   - Generate readable Korean narrative from snapshots: “이 에이전트는 최근 기억이 늘고 자율성이 상승 중…”
   - Test domain function.

7. **Developer docs**
   - Update README with data import format and next backend integration plan.

### Out of scope for this cycle

- Real SQLite session DB reader inside browser
- Writing to Hermes memory
- Actual cross-agent execution or Telegram/Discord sending
- Authentication/user accounts
- Remote deployment

---

## Existing codebase notes

Current relevant files:

```text
src/types.ts
src/data.ts
src/data/seed.ts
src/data/source.ts
src/domain/network.ts
src/domain/timeline.ts
src/domain/evolution.ts
src/domain/requests.ts
src/App.tsx
src/App.css
README.md
```

Current verified baseline:

```bash
npm test -- --run  # 28 passed
npm run build      # passed
npm run lint       # 0 errors
```

---

## Task 1: Add Hermes export adapter contract

**Objective:** Define the shape of real Hermes export data and map it to `SoulMapData`.

**Files:**
- Create: `src/data/hermesExport.ts`
- Test: `src/data/hermesExport.test.ts`

**Step 1: Write failing tests**

Test cases:

- `maps profiles into agents`
- `maps memory entries into memory stats`
- `maps session messages into log events`
- `maps skills into agent skills`
- `falls back safely for missing optional fields`

Expected test input should be minimal:

```ts
const exportData = {
  exportedAt: '2026-07-11T00:00:00+09:00',
  profiles: [
    {
      id: 'default',
      name: 'Hermes Default',
      kind: 'default',
      memories: [{ id: 'm1', content: 'User prefers MECE', createdAt: '2026-07-10T00:00:00+09:00' }],
      skills: [{ id: 'google-workspace', name: 'Google Workspace', proficiency: 80 }],
    },
  ],
  sessions: [
    {
      id: 's1',
      profileId: 'default',
      title: 'Google 연동',
      messages: [{ id: 'msg1', role: 'user', content: '확인해줘', timestamp: '2026-07-11T01:00:00+09:00' }],
    },
  ],
  cronJobs: [],
  flowLogs: [],
}
```

**Step 2: Run RED**

```bash
npm test -- src/data/hermesExport.test.ts --run
```

Expected: fail because file/function does not exist.

**Step 3: Implement**

Create:

```ts
export interface HermesExport { ... }
export function mapHermesExportToSoulMap(input: HermesExport): SoulMapData { ... }
export function validateHermesExport(input: unknown): { ok: true; data: HermesExport } | { ok: false; errors: string[] }
```

Rules:

- Do not throw on partial data.
- Unknown profiles become `kind: 'specialist'` unless explicitly default/integration/tool/future.
- Memory stats derive from memory array length and memories within last 7 days from `exportedAt`.
- Messages become `LogEvent` with `type: 'message'`, `importance: 'medium'` by default.

**Step 4: Run GREEN**

```bash
npm test -- src/data/hermesExport.test.ts --run
npm test -- --run
```

---

## Task 2: Replace direct seed import with source state

**Objective:** App should load from `loadSeed()` initially, but support replacing data with imported mapped data.

**Files:**
- Modify: `src/App.tsx`
- Modify/Create tests if UI tests exist. If not, keep domain/data tests only.

**Implementation details:**

- Import `loadSeed` from `src/data/source.ts` instead of direct `soulMapData` from `src/data.ts`.
- Store `SoulMapData` in React state.
- Preserve selected agent when possible; if imported data lacks selected id, select first agent.
- Remove or stop using duplicate `src/data.ts` if it conflicts with `src/data/seed.ts`.

**Verification:**

```bash
npm test -- --run
npm run build
```

---

## Task 3: Add import panel

**Objective:** User can paste Hermes export JSON into the app and switch dashboard data.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**UI requirements:**

Add a top-right or hero-level panel:

- Button: `Import Hermes JSON`
- Textarea or modal-like inline panel
- Buttons:
  - `Load sample schema`
  - `Apply import`
  - `Reset to seed`
- Error area showing validation messages
- Success indicator: “Imported N agents / M events”

**Behavior:**

- `Apply import` parses JSON, validates with `validateHermesExport`, maps to `SoulMapData`.
- Do not crash on invalid JSON.
- Reset uses `loadSeed()`.

**Verification:**

Manual browser check plus:

```bash
npm run build
npm run lint
```

---

## Task 4: Add timeline search/filter domain logic

**Objective:** Search/filter logic should be testable outside UI.

**Files:**
- Modify: `src/domain/timeline.ts`
- Modify: `src/domain/timeline.test.ts`

**Functions:**

```ts
export interface TimelineFilter {
  query?: string
  agentId?: string
  source?: EventSource | 'all'
  type?: EventType | 'all'
  minImportance?: Importance
}

export function filterEvents(events: LogEvent[], filter: TimelineFilter): LogEvent[]
```

Rules:

- Query searches `summary`, `emotion`, `identityShift` case-insensitively.
- `agentId` filters exact agent.
- `source` / `type` support `'all'`.
- `minImportance` reuses existing importance weights.
- Return latest first.

**TDD:**

Write tests for all filter dimensions and combined filter.

---

## Task 5: Add log explorer controls to UI

**Objective:** Timeline panel becomes a real explorer.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**UI:**

- Search input
- Type filter buttons: all/message/action/memory/decision/skill/handoff
- Importance minimum selector
- Toggle: selected agent only / all agents
- Empty state: “조건에 맞는 로그가 없습니다.”

**Implementation:**

Use `filterEvents()` from Task 4.

**Verification:**

- Browser: search “Google”, “기억”, “없는단어”
- Build/lint pass.

---

## Task 6: Add intelligence score domain metrics

**Objective:** Scorecards should be derived consistently.

**Files:**
- Create: `src/domain/intelligence.ts`
- Create: `src/domain/intelligence.test.ts`

**Functions:**

```ts
export function skillCoverage(agent: Agent): number
export function memoryVelocity(agent: Agent): 'cold' | 'steady' | 'growing' | 'surging'
export function riskSignals(agent: Agent): string[]
export function intelligenceScore(agent: Agent): number
```

Rules:

- `skillCoverage` = average skill proficiency, 0 if no skills.
- `memoryVelocity` based on `recentGrowth`: 0 cold, 1-5 steady, 6-20 growing, >20 surging.
- `riskSignals` examples:
  - planned or dormant status
  - autonomy > trust
  - coherence < 70
  - no skills
- `intelligenceScore` weighted: trust 30%, autonomy 25%, coherence 25%, skill coverage 20%.

---

## Task 7: Show intelligence scorecards in Agent Detail

**Objective:** Agent detail panel should expose practical readiness/risk.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**UI:**

Add below existing Trust/Autonomy/Coherence:

- Intelligence score
- Skill coverage
- Memory velocity badge
- Risk signal chips

Empty risk state: “리스크 신호 없음”.

---

## Task 8: Add evolution narrative domain function

**Objective:** Explain evolution in Korean from snapshots.

**Files:**
- Modify: `src/domain/evolution.ts`
- Modify: `src/domain/evolution.test.ts`

**Function:**

```ts
export function evolutionNarrative(snapshots: EvolutionSnapshot[]): string
```

Rules:

- No snapshots → “아직 진화 데이터가 없습니다.”
- Rising autonomy + positive memory growth → mention “자율성과 기억이 함께 성장”
- Flat autonomy → mention “안정적으로 유지”
- Falling autonomy → mention “개입이 필요한 신호”

---

## Task 9: Show evolution narrative in UI

**Objective:** Evolution panel should feel like “soul evolution”, not only chart.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**UI:**

- Add narrative card under metrics.
- Add “next inflection” text based on latest level/stage.

---

## Task 10: Add inter-agent request lab interactions

**Objective:** User can create and advance a mock request locally.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Optional: add `src/domain/requests.ts` helper tests if new logic added.

**UI:**

- From agent select
- To agent select
- Capability input
- Summary input
- Priority select
- Create request button
- For each active request: button to advance to next legal state

**Rules:**

- Use existing `canTransition` / `transition`.
- Suggested next state:
  - queued → accepted
  - accepted → in_progress
  - in_progress → completed
- Do not mutate seed arrays directly; use component state.

---

## Task 11: Add sample export file

**Objective:** Make import testing easy.

**Files:**
- Create: `examples/hermes-export.sample.json`
- Update: `README.md`

**Content:**

Include at least:

- default profile
- izera365 profile
- Claude Code tool profile
- memory entries
- sessions/messages
- one cron job
- one flow log

---

## Task 12: Final verification and docs

**Objective:** Prove artifact works.

**Commands:**

```bash
npm test -- --run
npm run lint
npm run build
```

Then run dev server if not running:

```bash
npm run dev -- --host 127.0.0.1 --port 5177
```

Manual browser checks:

- Dashboard loads.
- Import invalid JSON shows error.
- Import sample JSON works.
- Search/filter affects timeline.
- Request lab can create and advance request.
- Reset returns to seed.

Update README with:

- What changed
- Import JSON schema
- Commands
- Next backend integration path

---

## Acceptance Criteria

- `npm test -- --run` passes.
- `npm run lint` has 0 errors.
- `npm run build` passes.
- UI remains polished dark dashboard.
- No direct dependency on real Hermes files yet; import contract is explicit.
- Real Hermes connection path is documented.

## Implementation instruction for Claude Code

Use this plan as source of truth. Implement in small commits if git is initialized; if not, still keep changes task-sized. Do not delete `.claude/` or multi-agent kit files. Prefer modifying existing files over creating unnecessary abstractions. Keep visible UI Korean-first.
