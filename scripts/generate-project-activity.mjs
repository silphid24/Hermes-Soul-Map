import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const hermesHome = process.env.HERMES_HOME || join(homedir(), '.hermes')
const outputPath = process.env.PROJECT_ACTIVITY_OUT || resolve(root, 'src/data/projectActivity.ts')

const projectCandidates = [
  'task.md',
  'plan.md',
  'README.md',
  '.claude/knowledge/agent-activity-blackbox-live-updates.md',
  '.claude/knowledge/capability-readiness-matrix.md',
  '.claude/workspace/capability-readiness-matrix/implementation.md',
  '.claude/workspace/delegation-graph-replay/implementation.md',
  'src/domain/activity.ts',
  'src/domain/capabilityReadiness.ts',
  'src/App.tsx',
]

const profileSources = [
  {
    agentId: 'hermes-default',
    profile: 'default',
    source: 'hermes',
    label: 'Hermes Default profile',
    fallbackTimestamp: '2026-07-16T08:55:00Z',
  },
  {
    agentId: 'izera365',
    profile: 'izera365',
    source: 'cron',
    label: 'izera365 M365 profile',
    fallbackTimestamp: '2026-07-16T08:48:00Z',
  },
  {
    agentId: 'doc-auto-agent',
    profile: 'meetingdocs',
    source: 'cron',
    label: 'meetingdocs Doc Auto Agent profile',
    fallbackTimestamp: '2026-07-16T08:46:00Z',
  },
  {
    agentId: 'ai-trend-radar',
    profile: 'ai-trend-radar',
    source: 'cron',
    label: 'AI Trend Radar profile',
    fallbackTimestamp: '2026-07-16T08:30:00Z',
  },
  {
    agentId: 'pistachio',
    profile: 'pistachio',
    source: 'hermes',
    label: 'Pistachio profile',
    fallbackTimestamp: '2026-07-16T08:20:00Z',
  },
  {
    agentId: 'social-media',
    profile: 'social-media',
    source: 'hermes',
    label: 'Social Media profile',
    fallbackTimestamp: '2026-07-16T08:16:00Z',
  },
]

function iso(ms) {
  return new Date(ms).toISOString()
}

function safeStat(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

function profileRoot(profile) {
  return profile === 'default' ? hermesHome : resolve(hermesHome, 'profiles', profile)
}

function sqliteMaxTimestamp(dbPath) {
  if (!existsSync(dbPath)) return null
  try {
    const out = execFileSync('python3', ['-c', `
import sqlite3
con = sqlite3.connect(${JSON.stringify(dbPath)})
cur = con.cursor()
row = cur.execute("select max(timestamp) from messages where role in ('user','assistant','tool')").fetchone()
print(row[0] or '')
con.close()
`], { encoding: 'utf8' }).trim()
    if (!out) return null
    const seconds = Number(out)
    return Number.isFinite(seconds) ? seconds * 1000 : null
  } catch {
    return null
  }
}

function newestCronOutputMs(rootPath) {
  const outputRoot = resolve(rootPath, 'cron', 'output')
  if (!existsSync(outputRoot)) return null
  const stack = [outputRoot]
  let newest = null
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(path)
        continue
      }
      const stat = safeStat(path)
      if (!stat) continue
      // Empty cron output means the watchdog had nothing user-visible to report.
      // Count non-empty outputs as real operation, not mere scheduler heartbeat.
      if (stat.size > 0 && (newest === null || stat.mtimeMs > newest)) newest = stat.mtimeMs
    }
  }
  return newest
}

function profileActivityEvent(config) {
  const pRoot = profileRoot(config.profile)
  const stateMs = sqliteMaxTimestamp(resolve(pRoot, 'state.db'))
  const cronMs = newestCronOutputMs(pRoot)
  const candidates = [
    cronMs === null ? null : { ms: cronMs, kind: 'cron output', evidence: 'source-derived' },
    stateMs === null ? null : { ms: stateMs, kind: 'session message', evidence: 'source-derived' },
  ].filter(Boolean).sort((a, b) => b.ms - a.ms)

  const best = candidates[0] ?? {
    ms: Date.parse(config.fallbackTimestamp),
    kind: 'seed snapshot',
    evidence: 'fallback',
  }

  return {
    id: `observed-${config.agentId}`,
    agentId: config.agentId,
    source: config.source,
    type: best.kind === 'cron output' ? 'action' : 'message',
    timestamp: iso(best.ms),
    summary:
      best.evidence === 'source-derived'
        ? `Observed activity from ${config.label}: latest ${best.kind} at ${iso(best.ms)}. This is source-derived, not a synthetic shared heartbeat.`
        : `Fallback activity for ${config.label}: no readable profile/session/cron evidence under ${hermesHome}; preserving seed snapshot at ${iso(best.ms)} instead of fabricating current activity.`,
    importance: best.ms > Date.parse('2026-07-19T00:00:00Z') ? 'high' : 'medium',
    emotion: best.evidence === 'source-derived' ? '관측' : '보존',
    identityShift:
      best.evidence === 'source-derived'
        ? '실제 profile/session/cron evidence 기준으로 마지막 활동 산정'
        : '실제 evidence 부재 시 seed snapshot으로 stale 상태 보존',
  }
}

function projectArtifactEvents() {
  return projectCandidates
    .map((path) => ({ path, stat: safeStat(resolve(root, path)) }))
    .filter((item) => item.stat)
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .slice(0, 6)
    .map((item, index) => ({
      id: `project-activity-${index + 1}`,
      agentId: index === 0 ? 'hermes-default' : 'claude-code',
      source: index === 0 ? 'hermes' : 'claude-code',
      type: index === 0 ? 'decision' : 'action',
      timestamp: iso(item.stat.mtimeMs),
      summary: `Project artifact updated: ${item.path}. Soul Map dashboard activity feed regenerated from local project artifacts.`,
      importance: index < 3 ? 'high' : 'medium',
      emotion: '운영',
      identityShift: '정적 seed를 프로젝트 산출물 기반 최신 activity로 보강',
    }))
}

const profileEvents = profileSources.map(profileActivityEvent)
const artifactEvents = projectArtifactEvents()
const events = [...profileEvents, ...artifactEvents]

const out = `// Auto-generated by scripts/generate-project-activity.mjs. Do not edit manually.\nimport type { LogEvent } from '../types'\n\nexport const projectActivityEvents: LogEvent[] = ${JSON.stringify(events, null, 2)}\n`

writeFileSync(outputPath, out)
console.log(`generated ${events.length} source-derived activity events (${profileEvents.length} profiles, ${artifactEvents.length} artifacts) from HERMES_HOME=${hermesHome}`)
