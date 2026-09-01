import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

// import.meta.dirname 은 Node 20.11+ 에서만 있고, 이 모듈이 vite/vitest 변환 파이프라인을
// 거쳐 로드될 때는 import.meta.url 이 file: 스킴이 아닐 수도 있다. 양쪽 모두에서 동작해야 한다.
function detectProjectRoot() {
  try {
    return resolve(dirname(fileURLToPath(import.meta.url)), '..')
  } catch {
    return process.cwd()
  }
}

export const projectRoot = detectProjectRoot()

/** 생성 산출물의 기본 경로. 플러그인과 CLI가 같은 값을 보도록 한 곳에서만 계산한다. */
export function resolveOutputPath(env = process.env) {
  return env.PROJECT_ACTIVITY_OUT || resolve(projectRoot, 'src/data/projectActivity.ts')
}

/** `~/.hermes` 위치. 테스트는 HERMES_HOME 으로 갈아끼운다. */
export function resolveHermesHome(env = process.env) {
  return env.HERMES_HOME || join(homedir(), '.hermes')
}

// state.db 가 실행 중인 에이전트에 잠겨 있으면 python3 가 무한정 블록된다.
// dev 서버/테스트 시작 경로에 있으므로 반드시 상한을 둔다.
const SQLITE_TIMEOUT_MS = 5000

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

function profileRoot(hermesHome, profile) {
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
`], { encoding: 'utf8', timeout: SQLITE_TIMEOUT_MS, killSignal: 'SIGKILL' }).trim()
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

function profileActivityEvent(config, hermesHome) {
  const pRoot = profileRoot(hermesHome, config.profile)
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

function projectArtifactEvents(root) {
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

/**
 * `src/data/projectActivity.ts` 를 로컬 evidence 로부터 생성한다.
 *
 * 프로세스를 새로 띄우지 않고 vite/vitest 플러그인이 직접 호출할 수 있도록 함수로 노출한다.
 * 예전처럼 자식 프로세스를 spawn 하면 (a) 두 곳에서 경로를 따로 계산해 PROJECT_ACTIVITY_OUT
 * 이 어긋나고 (b) 생성기의 로그가 `--reporter=json` 출력에 섞인다.
 *
 * @returns {{ outputPath: string, eventCount: number, profileCount: number, artifactCount: number, hermesHome: string, message: string }}
 */
export function generateProjectActivity(options = {}) {
  const env = options.env ?? process.env
  const hermesHome = options.hermesHome ?? resolveHermesHome(env)
  const outputPath = options.outputPath ?? resolveOutputPath(env)
  const root = options.root ?? projectRoot

  const profileEvents = profileSources.map((config) => profileActivityEvent(config, hermesHome))
  const artifactEvents = projectArtifactEvents(root)
  const events = [...profileEvents, ...artifactEvents]

  const out = `// Auto-generated by scripts/generate-project-activity.mjs. Do not edit manually.\nimport type { LogEvent } from '../types'\n\nexport const projectActivityEvents: LogEvent[] = ${JSON.stringify(events, null, 2)}\n`

  // `npm ci` 는 `COPY package*.json` 뒤, src/ 가 아직 없는 상태에서도 돌 수 있다.
  mkdirSync(dirname(outputPath), { recursive: true })

  // writeFileSync 는 원자적이지 않다. 중간에 끊기면 0바이트 파일이 남고,
  // 그 파일은 existsSync 를 통과해 버려서 어떤 재생성 경로로도 자가 치유되지 않는다.
  const temporary = `${outputPath}.${process.pid}.tmp`
  try {
    writeFileSync(temporary, out)
    renameSync(temporary, outputPath)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }

  return {
    outputPath,
    hermesHome,
    eventCount: events.length,
    profileCount: profileEvents.length,
    artifactCount: artifactEvents.length,
    message: `generated ${events.length} source-derived activity events (${profileEvents.length} profiles, ${artifactEvents.length} artifacts) from HERMES_HOME=${hermesHome}`,
  }
}

// CLI 로 직접 실행됐을 때만 로그를 남긴다.
function isDirectCliRun() {
  try {
    return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (isDirectCliRun()) {
  console.log(generateProjectActivity().message)
}
