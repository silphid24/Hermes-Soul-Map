You are implementing an MVP web platform in this Vite React TypeScript project.

USER VISION (Korean user): "Visualize the Hermes agents I use, their logs/conversations, identity/soul, and how they evolve over time. Because agents have different specialties, build a platform that can later support inter-agent communication and requests."

STRICT REQUIREMENTS:
1. Follow TDD as much as practical in this fresh Vite app:
   - Add Vitest + React Testing Library if needed.
   - Write tests for core data model/logic before or alongside implementation.
   - Run tests and build before finishing.
2. Implement a polished MVP dashboard, Linear-style dark UI.
3. Include at least these sections in the UI:
   - Agent constellation/network map: nodes for Hermes default, izera365, Claude Code, Codex/OpenCode-ready, Google Workspace, n8n/automation, future specialist agents.
   - Agent detail panel with specialty, status, trust level, memory/identity/soul signals.
   - Conversation/log timeline: recent messages/events, source labels, importance, emotional/identity signal.
   - Evolution view: levels/stages over time, memory growth, skills learned, autonomy trend.
   - Inter-agent request flow: mock request queue or protocol showing how one agent asks another for help.
   - Platform roadmap: current MVP vs next high-grade features.
4. Make it feel like a real product prototype, not a generic template.
5. Use static seed data now, but structure it so real Hermes session logs/memory/cron/skills can be connected later.
6. Add README explaining concept, architecture, run/test commands, and future integration points.
7. Do not need backend yet. Frontend-only MVP is okay.
8. Preserve .claude kit; do not delete project config.

PREFERRED DESIGN:
- Linear-like dark surface: #08090a, #0f1011, subtle borders, violet accent.
- Korean copy is okay/preferred for visible UI labels.
- Clean MECE product sections.

DELIVERABLE:
- Working React app.
- Tests pass.
- npm run build passes.
- Report changed files and commands run.
