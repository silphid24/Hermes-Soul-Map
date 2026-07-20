// Hermes export → SoulMap adapter contract.
//
// This is the explicit boundary between *real* Hermes artifacts (exported as a
// local JSON file for now) and the UI contract (`SoulMapData`). The UI never
// touches this shape directly — it only ever consumes `SoulMapData`. When a
// live backend/CLI bridge lands, it just needs to emit `HermesExport` JSON.
//
// Design rules (see plan Task 1):
//   - Never throw on partial data. Missing optional fields fall back safely.
//   - Unknown/absent `kind` becomes 'specialist'.
//   - Memory stats derive from the memory array + a 7-day window off exportedAt.
//   - Messages become `LogEvent` (type 'message', importance 'medium').

import type {
  Agent,
  AgentKind,
  AgentStatus,
  EventSource,
  EvolutionSnapshot,
  Importance,
  InterAgentRequest,
  LogEvent,
  MemoryStats,
  RequestStatus,
  RoadmapItem,
  RoadmapPhase,
  Skill,
  SoulMapData,
  SoulSignals,
  SoulSnapshot,
} from '../types'

// ─────────────────────────────────────────────────────────────
// Raw export shapes (what a Hermes export file contains)
// ─────────────────────────────────────────────────────────────

export interface HermesMemory {
  id: string
  content: string
  createdAt: string
}

export interface HermesSkill {
  id: string
  name: string
  proficiency: number
  acquiredAt?: string
}

export interface HermesProfile {
  id: string
  name: string
  kind?: string
  status?: string
  specialty?: string
  description?: string
  trust?: number
  autonomy?: number
  emoji?: string
  accent?: string
  identity?: string
  values?: string[]
  tone?: string
  mood?: string
  coherence?: number
  memories?: HermesMemory[]
  skills?: HermesSkill[]
  connections?: string[]
}

export interface HermesMessage {
  id: string
  role: string
  content: string
  timestamp: string
  importance?: Importance
}

export interface HermesSession {
  id: string
  profileId: string
  title?: string
  messages?: HermesMessage[]
}

export interface HermesCronJob {
  id: string
  name?: string
  profileId?: string
  schedule?: string
  lastRunAt?: string
  summary?: string
}

export interface HermesFlowLog {
  id: string
  agentId?: string
  profileId?: string
  event?: string
  timestamp?: string
  summary?: string
}

export interface HermesEvolutionSnapshot {
  agentId?: string
  profileId?: string
  date?: string
  level?: number
  stage?: string
  memoryCount?: number
  skillCount?: number
  autonomy?: number
}

export interface HermesSoulSnapshot {
  agentId?: string
  profileId?: string
  date?: string
  identity?: string
  values?: string[]
  tone?: string
  mood?: string
  coherence?: number
}

export interface HermesRequest {
  id?: string
  fromAgentId?: string
  toAgentId?: string
  capability?: string
  summary?: string
  status?: string
  priority?: string
  createdAt?: string
}

export interface HermesRoadmapItem {
  id?: string
  phase?: string
  title?: string
  description?: string
  done?: unknown
}

export interface HermesSourceChannelInput {
  status?: string
  count?: number
  note?: string
}

export interface HermesSourceHealthInput {
  sessions?: HermesSourceChannelInput
  memories?: HermesSourceChannelInput
  skills?: HermesSourceChannelInput
  cron?: HermesSourceChannelInput
  flowLogs?: HermesSourceChannelInput
}

export interface HermesExport {
  exportedAt: string
  profiles: HermesProfile[]
  sessions?: HermesSession[]
  cronJobs?: HermesCronJob[]
  flowLogs?: HermesFlowLog[]
  evolutionSnapshots?: HermesEvolutionSnapshot[]
  soulSnapshots?: HermesSoulSnapshot[]
  requests?: HermesRequest[]
  roadmap?: HermesRoadmapItem[]
  sourceHealth?: HermesSourceHealthInput
}

export type SourceChannelKey = 'sessions' | 'memories' | 'skills' | 'cron' | 'flowLogs'
export type SourceChannelStatus = 'live' | 'partial' | 'empty' | 'error' | 'unknown'

export interface SourceChannelHealth {
  key: SourceChannelKey
  label: string
  status: SourceChannelStatus
  count: number
  note: string
}

export interface SourceHealth {
  reportedAt: string
  channels: SourceChannelHealth[]
}

// ─────────────────────────────────────────────────────────────
// Constants / helpers
// ─────────────────────────────────────────────────────────────

const KNOWN_KINDS: AgentKind[] = ['default', 'specialist', 'tool', 'integration', 'future']
const KNOWN_STATUSES: AgentStatus[] = ['active', 'idle', 'dormant', 'planned']
const KNOWN_REQUEST_STATUSES: RequestStatus[] = ['queued', 'accepted', 'in_progress', 'completed', 'declined']
const KNOWN_ROADMAP_PHASES: RoadmapPhase[] = ['mvp', 'next', 'future']
const KNOWN_HEALTH_STATUSES: SourceChannelStatus[] = ['live', 'partial', 'empty', 'error', 'unknown']

const CHANNELS: { key: SourceChannelKey; label: string }[] = [
  { key: 'sessions', label: '세션' },
  { key: 'memories', label: '기억' },
  { key: 'skills', label: '스킬' },
  { key: 'cron', label: '크론' },
  { key: 'flowLogs', label: '플로우로그' },
]

const KNOWN_SOURCES: EventSource[] = [
  'hermes',
  'izera365',
  'claude-code',
  'codex',
  'google-workspace',
  'n8n',
  'discord',
  'cron',
]

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const FALLBACK_ACCENTS = ['#8b7cff', '#4dd4ac', '#f0883e', '#6ea8fe', '#eab308', '#e879f9']

function normalizeKind(kind: string | undefined): AgentKind {
  return KNOWN_KINDS.includes(kind as AgentKind) ? (kind as AgentKind) : 'specialist'
}

function normalizeStatus(status: string | undefined, kind: AgentKind): AgentStatus {
  if (KNOWN_STATUSES.includes(status as AgentStatus)) return status as AgentStatus
  // Sensible default: future agents are 'planned', everyone else 'active'.
  return kind === 'future' ? 'planned' : 'active'
}

function normalizeSource(candidate: string | undefined): EventSource {
  return KNOWN_SOURCES.includes(candidate as EventSource) ? (candidate as EventSource) : 'hermes'
}

function clamp(n: number | undefined, fallback: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return fallback
  return Math.max(0, Math.min(100, n))
}

function intOr(n: number | undefined, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : fallback
}

function nonNegInt(n: number | undefined, fallback: number): number {
  return Math.max(0, intOr(n, fallback))
}

function normalizeRequestStatus(status: string | undefined): RequestStatus {
  return KNOWN_REQUEST_STATUSES.includes(status as RequestStatus) ? (status as RequestStatus) : 'queued'
}

function normalizeImportance(importance: string | undefined, fallback: Importance): Importance {
  const values: Importance[] = ['low', 'medium', 'high', 'critical']
  return values.includes(importance as Importance) ? (importance as Importance) : fallback
}

function normalizeRoadmapPhase(phase: string | undefined): RoadmapPhase {
  return KNOWN_ROADMAP_PHASES.includes(phase as RoadmapPhase) ? (phase as RoadmapPhase) : 'future'
}

function normalizeHealthStatus(status: string | undefined): SourceChannelStatus {
  return KNOWN_HEALTH_STATUSES.includes(status as SourceChannelStatus) ? (status as SourceChannelStatus) : 'unknown'
}

function safeArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function toTime(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

function deriveMemoryStats(memories: HermesMemory[], exportedAt: string): MemoryStats {
  if (memories.length === 0) {
    return { longTerm: 0, recentGrowth: 0, lastConsolidated: '' }
  }
  const exportTime = toTime(exportedAt)
  const recentGrowth = exportTime
    ? memories.filter((m) => exportTime - toTime(m.createdAt) <= SEVEN_DAYS_MS && toTime(m.createdAt) <= exportTime).length
    : 0
  const lastConsolidated = memories
    .map((m) => m.createdAt)
    .filter(Boolean)
    .sort((a, b) => toTime(b) - toTime(a))[0] ?? ''
  return { longTerm: memories.length, recentGrowth, lastConsolidated }
}

function mapSkills(skills: HermesSkill[], exportedAt: string): Skill[] {
  const acquiredFallback = exportedAt.slice(0, 10)
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    proficiency: clamp(s.proficiency, 0),
    acquiredAt: s.acquiredAt ?? acquiredFallback,
  }))
}

function buildSoul(profile: HermesProfile): SoulSignals {
  return {
    identity: profile.identity ?? profile.description ?? '(아직 형성되지 않음)',
    values: profile.values ?? [],
    tone: profile.tone ?? '미정',
    mood: profile.mood ?? '대기',
    coherence: clamp(profile.coherence, 70),
  }
}

function mapProfileToAgent(profile: HermesProfile, index: number, exportedAt: string): Agent {
  const kind = normalizeKind(profile.kind)
  const memories = profile.memories ?? []
  const skills = profile.skills ?? []
  return {
    id: profile.id,
    name: profile.name,
    kind,
    status: normalizeStatus(profile.status, kind),
    specialty: profile.specialty ?? '',
    description: profile.description ?? '',
    trust: clamp(profile.trust, 50),
    autonomy: clamp(profile.autonomy, 50),
    emoji: profile.emoji ?? '🤖',
    accent: profile.accent ?? FALLBACK_ACCENTS[index % FALLBACK_ACCENTS.length],
    soul: buildSoul(profile),
    memory: deriveMemoryStats(memories, exportedAt),
    skills: mapSkills(skills, exportedAt),
    connections: profile.connections ?? [],
  }
}

function mapSessionsToEvents(sessions: HermesSession[]): LogEvent[] {
  const events: LogEvent[] = []
  for (const session of sessions) {
    for (const message of session.messages ?? []) {
      const roleLabel = message.role === 'user' ? '사용자' : message.role === 'assistant' ? '에이전트' : message.role
      const title = session.title ? `[${session.title}] ` : ''
      events.push({
        id: `${session.id}:${message.id}`,
        agentId: session.profileId,
        source: normalizeSource(session.profileId),
        type: 'message',
        timestamp: message.timestamp,
        summary: `${title}${roleLabel}: ${message.content}`,
        importance: message.importance ?? 'medium',
      })
    }
  }
  return events
}

function mapCronJobsToEvents(cronJobs: HermesCronJob[]): LogEvent[] {
  return cronJobs
    .filter((job) => job.lastRunAt)
    .map((job) => ({
      id: `cron:${job.id}`,
      agentId: job.profileId ?? 'hermes',
      source: 'cron' as EventSource,
      type: 'action' as const,
      timestamp: job.lastRunAt as string,
      summary: job.summary ?? `크론 작업 실행: ${job.name ?? job.id}${job.schedule ? ` (${job.schedule})` : ''}`,
      importance: 'low' as Importance,
    }))
}

function mapFlowLogsToEvents(flowLogs: HermesFlowLog[]): LogEvent[] {
  return flowLogs
    .filter((log) => log.timestamp)
    .map((log) => ({
      id: `flow:${log.id}`,
      agentId: log.agentId ?? log.profileId ?? 'claude-code',
      source: normalizeSource(log.agentId ?? log.profileId),
      type: 'action' as const,
      timestamp: log.timestamp as string,
      summary: log.summary ?? log.event ?? `flow event: ${log.id}`,
      importance: 'low' as Importance,
    }))
}

function mapEvolutionSnapshots(snapshots: HermesEvolutionSnapshot[]): EvolutionSnapshot[] {
  return snapshots.flatMap((snapshot) => {
    const agentId = snapshot.agentId ?? snapshot.profileId ?? ''
    if (!agentId || !snapshot.date) return []
    return [{
      agentId,
      date: snapshot.date,
      level: intOr(snapshot.level, 1),
      stage: snapshot.stage ?? '미정',
      memoryCount: nonNegInt(snapshot.memoryCount, 0),
      skillCount: nonNegInt(snapshot.skillCount, 0),
      autonomy: clamp(snapshot.autonomy, 0),
    }]
  })
}

function mapSoulSnapshots(snapshots: HermesSoulSnapshot[]): SoulSnapshot[] {
  return snapshots.flatMap((snapshot) => {
    const agentId = snapshot.agentId ?? snapshot.profileId ?? ''
    if (!agentId || !snapshot.date) return []
    return [{
      agentId,
      date: snapshot.date,
      identity: snapshot.identity ?? '',
      values: Array.isArray(snapshot.values) ? snapshot.values : [],
      tone: snapshot.tone ?? '',
      mood: snapshot.mood ?? '',
      coherence: clamp(snapshot.coherence, 0),
    }]
  })
}

function mapRequests(requests: HermesRequest[], exportedAt: string): InterAgentRequest[] {
  return requests.flatMap((request) => {
    if (!request.id) return []
    return [{
      id: request.id,
      fromAgentId: request.fromAgentId ?? '',
      toAgentId: request.toAgentId ?? '',
      capability: request.capability ?? '',
      summary: request.summary ?? '',
      status: normalizeRequestStatus(request.status),
      priority: normalizeImportance(request.priority, 'medium'),
      createdAt: request.createdAt ?? exportedAt,
    }]
  })
}

function mapRoadmap(roadmap: HermesRoadmapItem[]): RoadmapItem[] {
  return roadmap.flatMap((item) => {
    if (!item.id) return []
    return [{
      id: item.id,
      phase: normalizeRoadmapPhase(item.phase),
      title: item.title ?? '',
      description: item.description ?? '',
      done: item.done === true,
    }]
  })
}

function channelCounts(input: HermesExport): Record<SourceChannelKey, number> {
  return {
    sessions: safeArray(input.sessions).reduce((sum, session) => sum + safeArray(session.messages).length, 0),
    memories: safeArray(input.profiles).reduce((sum, profile) => sum + safeArray(profile.memories).length, 0),
    skills: safeArray(input.profiles).reduce((sum, profile) => sum + safeArray(profile.skills).length, 0),
    cron: safeArray(input.cronJobs).length,
    flowLogs: safeArray(input.flowLogs).length,
  }
}

function providedSourceChannel(input: HermesSourceHealthInput | undefined, key: SourceChannelKey): HermesSourceChannelInput | undefined {
  if (!input || typeof input !== 'object') return undefined
  return input[key]
}

export function deriveSourceHealth(input: HermesExport): SourceHealth {
  const counts = channelCounts(input)
  return {
    reportedAt: input.exportedAt ?? '',
    channels: CHANNELS.map(({ key, label }) => {
      const provided = providedSourceChannel(input.sourceHealth, key)
      const autoStatus: SourceChannelStatus = counts[key] > 0 ? 'live' : 'empty'
      return {
        key,
        label,
        status: provided?.status ? normalizeHealthStatus(provided.status) : autoStatus,
        count: typeof provided?.count === 'number' && Number.isFinite(provided.count) ? Math.max(0, Math.trunc(provided.count)) : counts[key],
        note: typeof provided?.note === 'string' ? provided.note : '',
      }
    }),
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/** Real Hermes export JSON → the UI's `SoulMapData` contract. Never throws. */
export function mapHermesExportToSoulMap(input: HermesExport): SoulMapData {
  const exportedAt = input.exportedAt ?? ''
  const agents = (input.profiles ?? []).map((p, i) => mapProfileToAgent(p, i, exportedAt))
  const events = [
    ...mapSessionsToEvents(safeArray(input.sessions)),
    ...mapCronJobsToEvents(safeArray(input.cronJobs)),
    ...mapFlowLogsToEvents(safeArray(input.flowLogs)),
  ]
  return {
    agents,
    events,
    evolution: mapEvolutionSnapshots(safeArray(input.evolutionSnapshots)),
    soulHistory: mapSoulSnapshots(safeArray(input.soulSnapshots)),
    requests: mapRequests(safeArray(input.requests), exportedAt),
    roadmap: mapRoadmap(safeArray(input.roadmap)),
  }
}

export type ValidateResult =
  | { ok: true; data: HermesExport }
  | { ok: false; errors: string[] }

/** Structural validation for pasted/imported JSON. Collects all errors, never throws. */
export function validateHermesExport(input: unknown): ValidateResult {
  const errors: string[] = []

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['최상위 값이 객체가 아닙니다.'] }
  }

  const obj = input as Record<string, unknown>

  if (typeof obj.exportedAt !== 'string' || obj.exportedAt.length === 0) {
    errors.push('exportedAt(문자열)이 필요합니다.')
  }

  if (!Array.isArray(obj.profiles)) {
    errors.push('profiles 배열이 필요합니다.')
  } else {
    obj.profiles.forEach((p, i) => {
      if (typeof p !== 'object' || p === null) {
        errors.push(`profiles[${i}]가 객체가 아닙니다.`)
        return
      }
      const profile = p as Record<string, unknown>
      if (typeof profile.id !== 'string' || profile.id.length === 0) {
        errors.push(`profiles[${i}].id(문자열)가 필요합니다.`)
      }
      if (typeof profile.name !== 'string' || profile.name.length === 0) {
        errors.push(`profiles[${i}].name(문자열)가 필요합니다.`)
      }
    })
  }

  for (const key of ['sessions', 'cronJobs', 'flowLogs'] as const) {
    if (obj[key] !== undefined && !Array.isArray(obj[key])) {
      errors.push(`${key}는 배열이어야 합니다.`)
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: input as HermesExport }
}
