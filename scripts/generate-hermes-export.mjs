// Live Hermes Export Generator (T05).
//
// Reads real Hermes local artifacts under HERMES_HOME (default ~/.hermes) —
// profiles, memory/profile facts, skills, cron jobs/output, and the project's
// Claude flow logs — and emits a browser-importable HermesExport JSON.
//
// Every source is read behind its own try/catch so a missing/unreadable channel
// degrades to sourceHealth.status='error'|'empty' instead of crashing. All text
// is redacted by hermesExportCore before it is written. See
// .claude/workspace/live-hermes-export-generator/{spec,design}.md.
//
// Usage:
//   node scripts/generate-hermes-export.mjs [outputPath] [--out=path]
//   HERMES_HOME=/path HERMES_EXPORT_OUT=out.json node scripts/generate-hermes-export.mjs
//
// The output default (examples/hermes-export.local.json) is gitignored — real
// personal data must never be committed.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { buildHermesExport } from './hermesExportCore.mjs'

const root = resolve(import.meta.dirname, '..')
const hermesHome = process.env.HERMES_HOME || join(homedir(), '.hermes')

function resolveOutputPath() {
  const flag = process.argv.slice(2).find((a) => a.startsWith('--out='))
  if (flag) return resolve(flag.slice('--out='.length))
  const positional = process.argv.slice(2).find((a) => !a.startsWith('-'))
  if (positional) return resolve(positional)
  if (process.env.HERMES_EXPORT_OUT) return resolve(process.env.HERMES_EXPORT_OUT)
  return resolve(root, 'examples/hermes-export.local.json')
}

const outputPath = resolveOutputPath()

// Caps keep the export human-sized; truncation is surfaced in sourceHealth.note.
const MAX_MEMORIES = 25
const MAX_SKILLS = 30
const MAX_MESSAGES = 20
const MAX_FLOW_LOGS = 40

// Map real profile directory names → stable soul-map agent ids/kinds/emoji.
const PROFILE_META = {
  default: { id: 'default', name: 'Hermes Default', kind: 'default', emoji: '🪽', accent: '#8b7cff' },
  izera365: { id: 'izera365', name: 'izera365', kind: 'specialist', emoji: '🏢', accent: '#4dd4ac' },
  meetingdocs: { id: 'doc-auto-agent', name: 'Doc Auto Agent', kind: 'specialist', emoji: '📝', accent: '#6ea8fe' },
  'ai-trend-radar': { id: 'ai-trend-radar', name: 'AI Trend Radar', kind: 'specialist', emoji: '📡', accent: '#f0883e' },
  pistachio: { id: 'pistachio', name: 'Pistachio', kind: 'specialist', emoji: '🥑', accent: '#4dd4ac' },
  'social-media': { id: 'social-media', name: 'Social Media', kind: 'specialist', emoji: '📣', accent: '#e879f9' },
}

function safeStat(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

function isoFromMs(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ''
}

function profileRoot(dir) {
  return dir === 'default' ? hermesHome : resolve(hermesHome, 'profiles', dir)
}

function listProfileDirs() {
  const dirs = ['default']
  const profilesRoot = resolve(hermesHome, 'profiles')
  if (existsSync(profilesRoot)) {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(entry.name)
    }
  }
  return dirs
}

function readDescription(pRoot) {
  const path = resolve(pRoot, 'profile.yaml')
  if (!existsSync(path)) return ''
  try {
    const text = readFileSync(path, 'utf8')
    const match = text.match(/description:\s*(?:'([^']*)'|"([^"]*)"|(.+))/)
    return (match ? match[1] ?? match[2] ?? match[3] : '').trim()
  } catch {
    return ''
  }
}

// A profile's SOUL.md often holds only the comment template; extract the first
// real (non-comment, non-heading) line as an identity signal if present.
function readIdentity(pRoot) {
  const path = resolve(pRoot, 'SOUL.md')
  if (!existsSync(path)) return ''
  try {
    const lines = readFileSync(path, 'utf8').split('\n')
    let inComment = false
    for (const raw of lines) {
      const line = raw.trim()
      if (line.startsWith('<!--')) inComment = true
      if (inComment) {
        if (line.includes('-->')) inComment = false
        continue
      }
      if (!line || line.startsWith('#') || line.startsWith('-')) continue
      return line
    }
  } catch {
    /* ignore */
  }
  return ''
}

// Memory facts come from markdown bullets / short lines in memories/*.md.
function readMemories(pRoot) {
  const dir = resolve(pRoot, 'memories')
  if (!existsSync(dir)) return { memories: [], status: 'empty' }
  const memories = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const path = resolve(dir, entry.name)
      const stat = safeStat(path)
      const createdAt = stat ? isoFromMs(stat.mtimeMs) : ''
      const text = readFileSync(path, 'utf8')
      for (const raw of text.split('\n')) {
        const line = raw.replace(/^[-*]\s+/, '').trim()
        if (line.length < 8 || line.startsWith('#') || line.startsWith('<!--')) continue
        memories.push({ id: `${entry.name}:${memories.length}`, content: line, createdAt })
        if (memories.length >= MAX_MEMORIES) break
      }
      if (memories.length >= MAX_MEMORIES) break
    }
  } catch {
    return { memories, status: 'error', note: 'memories read failed' }
  }
  return { memories, status: memories.length ? 'live' : 'empty' }
}

function readSkills(pRoot) {
  const dir = resolve(pRoot, 'skills')
  if (!existsSync(dir)) return { skills: [], status: 'empty' }
  const skills = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const stat = safeStat(resolve(dir, entry.name))
      skills.push({
        id: entry.name,
        name: entry.name.replace(/[-_]/g, ' '),
        proficiency: 60,
        acquiredAt: stat ? isoFromMs(stat.mtimeMs).slice(0, 10) : '',
      })
      if (skills.length >= MAX_SKILLS) break
    }
  } catch {
    return { skills, status: 'error', note: 'skills read failed' }
  }
  return { skills, status: skills.length ? 'live' : 'empty' }
}

// Recent user/assistant messages from the profile's sqlite state.db, via python3
// (same dependency the existing generate-project-activity.mjs relies on).
function readSessionMessages(pRoot, profileId) {
  const dbPath = resolve(pRoot, 'state.db')
  if (!existsSync(dbPath)) return { session: null, status: 'empty' }
  try {
    const out = execFileSync(
      'python3',
      [
        '-c',
        `
import sqlite3, json, sys
con = sqlite3.connect(${JSON.stringify(dbPath)})
rows = con.execute(
  "select id, role, content, timestamp from messages "
  "where role in ('user','assistant') and content is not null and content != '' "
  "order by timestamp desc limit ${MAX_MESSAGES}"
).fetchall()
con.close()
print(json.dumps([
  {"id": str(r[0]), "role": r[1], "content": (r[2] or "")[:600], "timestamp": r[3]}
  for r in rows
]))
`,
      ],
      { encoding: 'utf8' },
    )
    const rows = JSON.parse(out || '[]')
    const messages = rows
      .reverse()
      .map((r) => ({
        id: `${profileId}:${r.id}`,
        role: r.role,
        content: r.content,
        timestamp: typeof r.timestamp === 'number' ? new Date(r.timestamp * 1000).toISOString() : String(r.timestamp ?? ''),
      }))
    if (messages.length === 0) return { session: null, status: 'empty' }
    return {
      session: { id: `session-${profileId}`, profileId, title: '최근 세션', messages },
      status: 'live',
    }
  } catch {
    return { session: null, status: 'error', note: 'state.db unreadable (python3/sqlite)' }
  }
}

function readCronJobs() {
  const path = resolve(hermesHome, 'cron', 'jobs.json')
  if (!existsSync(path)) return { cronJobs: [], status: 'empty' }
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    const jobs = Array.isArray(data.jobs) ? data.jobs : []
    const cronJobs = jobs.map((job) => {
      const schedule = job.schedule_display || job.schedule?.display || job.schedule?.expr || ''
      const lastRunSec = typeof job.last_run_at === 'number' ? job.last_run_at : Number(job.last_run_at)
      const firstPromptLine = typeof job.prompt === 'string' ? job.prompt.split('\n').find((l) => l.trim()) : ''
      return {
        id: String(job.id ?? ''),
        name: String(job.name ?? ''),
        schedule: typeof schedule === 'string' ? schedule : String(schedule),
        lastRunAt: Number.isFinite(lastRunSec) && lastRunSec > 0 ? new Date(lastRunSec * 1000).toISOString() : '',
        summary: `${job.enabled ? '활성' : '비활성'} · ${job.last_status ?? '상태미상'}${firstPromptLine ? ` · ${firstPromptLine.slice(0, 120)}` : ''}`,
      }
    })
    return { cronJobs, status: cronJobs.length ? 'live' : 'empty' }
  } catch {
    return { cronJobs: [], status: 'error', note: 'cron/jobs.json unreadable' }
  }
}

function readFlowLogs() {
  const path = resolve(root, '.claude/logs/flow.jsonl')
  if (!existsSync(path)) return { flowLogs: [], status: 'empty' }
  try {
    const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim())
    const recent = lines.slice(-MAX_FLOW_LOGS)
    const flowLogs = recent.flatMap((line, i) => {
      try {
        const entry = JSON.parse(line)
        return [
          {
            id: `flow:${entry.session_id ?? 'x'}:${i}`,
            agentId: 'claude-code',
            event: String(entry.event ?? ''),
            timestamp: String(entry.ts ?? ''),
            summary: `${entry.event ?? 'event'}${entry.tool ? ` ${entry.tool}` : ''}${entry.path ? ` ${entry.path}` : ''}`.trim(),
          },
        ]
      } catch {
        return []
      }
    })
    return { flowLogs, status: flowLogs.length ? 'live' : 'empty' }
  } catch {
    return { flowLogs: [], status: 'error', note: 'flow.jsonl unreadable' }
  }
}

function channelMeta(status, note) {
  return note ? { status, note } : { status }
}

function main() {
  const profileDirs = listProfileDirs()
  const profiles = []
  const sessions = []
  const channelState = {
    sessions: { status: 'empty', notes: [] },
    memories: { status: 'empty', notes: [] },
    skills: { status: 'empty', notes: [] },
  }

  const rank = { live: 3, partial: 2, error: 1, empty: 0, unknown: 0 }
  function raise(channel, status, note) {
    if (note) channelState[channel].notes.push(note)
    if ((rank[status] ?? 0) > (rank[channelState[channel].status] ?? 0)) channelState[channel].status = status
  }

  for (const dir of profileDirs) {
    const pRoot = profileRoot(dir)
    const meta = PROFILE_META[dir] ?? { id: dir, name: dir, kind: 'specialist' }
    const { memories, status: memStatus, note: memNote } = readMemories(pRoot)
    const { skills, status: skillStatus, note: skillNote } = readSkills(pRoot)
    const { session, status: sessStatus, note: sessNote } = readSessionMessages(pRoot, meta.id)

    raise('memories', memStatus, memNote)
    raise('skills', skillStatus, skillNote)
    raise('sessions', sessStatus, sessNote)

    if (session) sessions.push(session)

    profiles.push({
      id: meta.id,
      name: meta.name,
      kind: meta.kind,
      emoji: meta.emoji,
      accent: meta.accent,
      description: readDescription(pRoot),
      identity: readIdentity(pRoot),
      memories,
      skills,
    })
  }

  const cron = readCronJobs()
  const flow = readFlowLogs()

  const raw = {
    exportedAt: new Date().toISOString(),
    profiles,
    sessions,
    cronJobs: cron.cronJobs,
    flowLogs: flow.flowLogs,
    channels: {
      sessions: channelMeta(channelState.sessions.status, channelState.sessions.notes.join('; ')),
      memories: channelMeta(channelState.memories.status, channelState.memories.notes.join('; ')),
      skills: channelMeta(channelState.skills.status, channelState.skills.notes.join('; ')),
      cron: channelMeta(cron.status, cron.note),
      flowLogs: channelMeta(flow.status, flow.note),
    },
  }

  const exportJson = buildHermesExport(raw)
  writeFileSync(outputPath, `${JSON.stringify(exportJson, null, 2)}\n`)

  const health = exportJson.sourceHealth
  console.log(`Wrote HermesExport → ${outputPath}`)
  console.log(`  HERMES_HOME=${hermesHome}`)
  console.log(`  profiles=${profiles.length} sessions=${sessions.length} cron=${raw.cronJobs.length} flowLogs=${raw.flowLogs.length}`)
  console.log(
    `  sourceHealth: ${['sessions', 'memories', 'skills', 'cron', 'flowLogs']
      .map((k) => `${k}=${health[k].status}(${health[k].count})`)
      .join(' ')}`,
  )
}

main()
