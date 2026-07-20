// Pure, side-effect-free helpers for the Live Hermes Export Generator (T05).
//
// The IO shell (generate-hermes-export.mjs) reads real artifacts out of
// ~/.hermes and hands already-parsed values to these functions. Keeping the
// security-critical assembly + redaction pure makes it unit-testable without
// touching the real (personal) Hermes tree — see
// .claude/workspace/live-hermes-export-generator/design.md.
//
// Rules:
//   - Never throw. Missing/garbage fields fall back to safe defaults.
//   - Every string that leaves this module is passed through redactSecrets.
//   - Output satisfies the HermesExport v2 contract (src/data/hermesExport.ts).

export const REDACTED = '‹redacted›'

// ─────────────────────────────────────────────────────────────
// Redaction
// ─────────────────────────────────────────────────────────────

// KEY=VALUE / KEY: VALUE where the key name looks sensitive → keep the key,
// redact the value only. Runs first so the raw value can't leak via later rules.
const ENV_SECRET_RE =
  /\b([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|REFRESH[_-]?TOKEN)[A-Za-z0-9_]*)(\s*[=:]\s*)("?)([^\s"']+)\3/gi

// Provider keys / bearer tokens.
const TOKEN_RULES = [
  { re: /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g, to: '‹token›' },
  { re: /\bAIza[0-9A-Za-z_-]{20,}\b/g, to: '‹token›' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, to: '‹token›' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, to: '‹token›' },
]

// JWT (header.payload.signature).
const JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\b/g
// Emails.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// Absolute home paths → ~ (strips the OS username).
const USER_PATH_RE = /(?:\/Users|\/home)\/[^/\s"']+/g
// Long opaque blobs that look like secrets.
const HEX_BLOB_RE = /\b[A-Fa-f0-9]{32,}\b/g
const ALNUM_BLOB_RE = /\b[A-Za-z0-9]{40,}\b/g

/** Redact secrets / PII-like tokens from a single string. Safe values pass through unchanged. */
export function redactSecrets(value) {
  if (typeof value !== 'string' || value.length === 0) return value
  let out = value
  out = out.replace(ENV_SECRET_RE, (_m, key, sep) => `${key}${sep}${REDACTED}`)
  out = out.replace(JWT_RE, '‹jwt›')
  for (const { re, to } of TOKEN_RULES) out = out.replace(re, to)
  out = out.replace(EMAIL_RE, '‹email›')
  out = out.replace(USER_PATH_RE, '~')
  out = out.replace(HEX_BLOB_RE, '‹hex›')
  out = out.replace(ALNUM_BLOB_RE, '‹secret›')
  return out
}

/** Recursively redact every string in an object/array. Defense-in-depth net. */
export function redactDeep(value) {
  if (typeof value === 'string') return redactSecrets(value)
  if (Array.isArray(value)) return value.map(redactDeep)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v)
    return out
  }
  return value
}

// ─────────────────────────────────────────────────────────────
// Normalization helpers
// ─────────────────────────────────────────────────────────────

function arr(value) {
  return Array.isArray(value) ? value : []
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeProfile(p) {
  const src = p && typeof p === 'object' ? p : {}
  const profile = {
    id: str(src.id),
    name: str(src.name) || str(src.id),
  }
  if (src.kind !== undefined) profile.kind = str(src.kind)
  if (src.status !== undefined) profile.status = str(src.status)
  if (src.specialty !== undefined) profile.specialty = str(src.specialty)
  if (src.description !== undefined) profile.description = str(src.description)
  if (src.identity !== undefined) profile.identity = str(src.identity)
  if (Array.isArray(src.connections)) profile.connections = src.connections.map((c) => str(c))
  profile.memories = arr(src.memories).map((m) => ({
    id: str(m?.id),
    content: str(m?.content),
    createdAt: str(m?.createdAt),
  }))
  profile.skills = arr(src.skills).map((s) => ({
    id: str(s?.id),
    name: str(s?.name) || str(s?.id),
    proficiency: num(s?.proficiency, 60),
    ...(s?.acquiredAt !== undefined ? { acquiredAt: str(s.acquiredAt) } : {}),
  }))
  return profile
}

function normalizeSession(s) {
  const src = s && typeof s === 'object' ? s : {}
  if (!src.id) return null
  return {
    id: str(src.id),
    profileId: str(src.profileId),
    title: str(src.title),
    messages: arr(src.messages).map((m) => ({
      id: str(m?.id),
      role: str(m?.role, 'assistant'),
      content: str(m?.content),
      timestamp: str(m?.timestamp),
      ...(m?.importance !== undefined ? { importance: str(m.importance) } : {}),
    })),
  }
}

function normalizeCronJob(job) {
  const src = job && typeof job === 'object' ? job : {}
  if (!src.id) return null
  const out = { id: str(src.id) }
  if (src.name !== undefined) out.name = str(src.name)
  if (src.profileId !== undefined) out.profileId = str(src.profileId)
  if (src.schedule !== undefined) out.schedule = str(src.schedule)
  if (src.lastRunAt !== undefined) out.lastRunAt = str(src.lastRunAt)
  if (src.summary !== undefined) out.summary = str(src.summary)
  return out
}

function normalizeFlowLog(log) {
  const src = log && typeof log === 'object' ? log : {}
  if (!src.id) return null
  const out = { id: str(src.id) }
  if (src.agentId !== undefined) out.agentId = str(src.agentId)
  if (src.event !== undefined) out.event = str(src.event)
  if (src.timestamp !== undefined) out.timestamp = str(src.timestamp)
  if (src.summary !== undefined) out.summary = str(src.summary)
  return out
}

// ─────────────────────────────────────────────────────────────
// Source health
// ─────────────────────────────────────────────────────────────

const CHANNEL_KEYS = ['sessions', 'memories', 'skills', 'cron', 'flowLogs']

function countMessages(sessions) {
  return arr(sessions).reduce((sum, s) => sum + arr(s?.messages).length, 0)
}

function countFromProfiles(profiles, field) {
  return arr(profiles).reduce((sum, p) => sum + arr(p?.[field]).length, 0)
}

/**
 * Build the 5-channel sourceHealth object.
 * `channels[key].status` (from the IO layer, e.g. 'error' on read failure) wins;
 * otherwise status is auto-derived: count > 0 → 'live', else 'empty'.
 */
export function buildSourceHealth(channels, derived = {}) {
  const provided = channels && typeof channels === 'object' ? channels : {}
  const counts = {
    sessions: countMessages(derived.sessions),
    memories: countFromProfiles(derived.profiles, 'memories'),
    skills: countFromProfiles(derived.profiles, 'skills'),
    cron: arr(derived.cronJobs).length,
    flowLogs: arr(derived.flowLogs).length,
  }
  const result = {}
  for (const key of CHANNEL_KEYS) {
    const meta = provided[key] && typeof provided[key] === 'object' ? provided[key] : {}
    const count = num(meta.count, counts[key])
    const status = str(meta.status) || (count > 0 ? 'live' : 'empty')
    result[key] = { status, count, note: str(meta.note) }
  }
  return result
}

// ─────────────────────────────────────────────────────────────
// Public assembly
// ─────────────────────────────────────────────────────────────

/**
 * Assemble raw Hermes artifacts into a redacted, browser-importable HermesExport.
 * Never throws. All emitted text is scrubbed via redactDeep.
 */
export function buildHermesExport(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const profiles = arr(src.profiles).map(normalizeProfile).filter((p) => p.id)
  const sessions = arr(src.sessions).map(normalizeSession).filter(Boolean)
  const cronJobs = arr(src.cronJobs).map(normalizeCronJob).filter(Boolean)
  const flowLogs = arr(src.flowLogs).map(normalizeFlowLog).filter(Boolean)

  const out = {
    exportedAt: str(src.exportedAt),
    profiles,
    sessions,
    cronJobs,
    flowLogs,
  }
  if (Array.isArray(src.evolutionSnapshots)) out.evolutionSnapshots = src.evolutionSnapshots
  if (Array.isArray(src.soulSnapshots)) out.soulSnapshots = src.soulSnapshots
  if (Array.isArray(src.requests)) out.requests = src.requests
  if (Array.isArray(src.roadmap)) out.roadmap = src.roadmap

  out.sourceHealth = buildSourceHealth(src.channels, { profiles, sessions, cronJobs, flowLogs })

  return redactDeep(out)
}
