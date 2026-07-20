import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error — pure JS helper, no type declarations needed for tests.
import { redactSecrets, redactDeep, buildHermesExport, buildSourceHealth } from './hermesExportCore.mjs'
import { validateHermesExport, mapHermesExportToSoulMap } from '../src/data/hermesExport'

describe('redactSecrets', () => {
  it('redacts provider API keys / bearer tokens', () => {
    const token = 'sk-abcdefghijklmnopqrstuvwxyz1234567890'
    const out = redactSecrets(`use ${token} to auth`)
    expect(out).not.toContain(token)
    expect(out).toContain('‹token›')
  })

  it('redacts Google/Slack/GitHub tokens', () => {
    const google = 'AIzaSyA1234567890abcdefghijklmnopqrstuv'
    const slack = `xox${'b'}-1234567890-abcdefghijklmnop`
    const github = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890'
    expect(redactSecrets(google)).not.toContain(google)
    expect(redactSecrets(slack)).not.toContain(slack)
    expect(redactSecrets(github)).not.toContain(github)
    expect(redactSecrets(`${google} ${slack} ${github}`)).toContain('‹token›')
  })

  it('redacts JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const out = redactSecrets(`bearer ${jwt}`)
    expect(out).not.toContain(jwt)
    expect(out).toContain('‹jwt›')
  })

  it('redacts emails', () => {
    expect(redactSecrets('reach me at user@example.com today')).toContain('‹email›')
    expect(redactSecrets('reach me at user@example.com today')).not.toContain('user@example.com')
  })

  it('strips the OS username from absolute home paths', () => {
    const out = redactSecrets('watch /Users/example_user/Library/CloudStorage/x')
    expect(out).not.toContain('example_user')
    expect(out).toContain('~/Library/CloudStorage/x')
  })

  it('redacts KEY=VALUE secrets but keeps the key name', () => {
    const out = redactSecrets('OPENAI_API_KEY=verysecretvalue1234567890abcdef')
    expect(out).toContain('OPENAI_API_KEY=')
    expect(out).toContain('‹redacted›')
    expect(out).not.toContain('verysecretvalue')
  })

  it('leaves ISO timestamps and short ids intact', () => {
    expect(redactSecrets('2026-07-20T16:03:18Z bb87053632a3')).toBe('2026-07-20T16:03:18Z bb87053632a3')
  })

  it('leaves non-strings untouched', () => {
    expect(redactSecrets(42 as unknown as string)).toBe(42)
  })
})

describe('redactDeep', () => {
  it('walks nested objects/arrays and redacts every string', () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz1234567890'
    const out = redactDeep({
      a: secret,
      b: ['ok', { c: 'mail user@example.com' }],
      n: 7,
    })
    expect(JSON.stringify(out)).not.toContain(secret)
    expect(JSON.stringify(out)).not.toContain('user@example.com')
    expect(out.n).toBe(7)
  })
})

describe('buildSourceHealth', () => {
  it('fills all five channels, auto live/empty from counts', () => {
    const health = buildSourceHealth(
      {},
      {
        profiles: [{ memories: [{ id: 'm' }], skills: [{ id: 's' }] }],
        sessions: [{ messages: [{ id: 'g' }] }],
        cronJobs: [{ id: 'c' }],
        flowLogs: [],
      },
    )
    expect(Object.keys(health).sort()).toEqual(['cron', 'flowLogs', 'memories', 'sessions', 'skills'])
    expect(health.sessions.status).toBe('live')
    expect(health.flowLogs.status).toBe('empty')
  })

  it('honors explicit channel status/note from the IO layer', () => {
    const health = buildSourceHealth(
      { sessions: { status: 'error', note: 'state.db unreadable' } },
      { profiles: [], sessions: [], cronJobs: [], flowLogs: [] },
    )
    expect(health.sessions.status).toBe('error')
    expect(health.sessions.note).toContain('unreadable')
  })
})

describe('buildHermesExport', () => {
  const raw = {
    exportedAt: '2026-07-20T00:00:00Z',
    profiles: [
      {
        id: 'izera365',
        name: 'izera365',
        kind: 'specialist',
        description: 'M365 assistant, contact user@example.com',
        memories: [{ id: 'mm1', content: 'token sk-ABCDEFGHIJKLMNOP1234567890', createdAt: '2026-07-19T00:00:00Z' }],
        skills: [{ id: 'email', name: 'email', proficiency: 70 }],
      },
    ],
    sessions: [
      {
        id: 's1',
        profileId: 'izera365',
        title: 'work',
        messages: [{ id: 'g1', role: 'user', content: 'scan /Users/example_user/Drive', timestamp: '2026-07-19T01:00:00Z' }],
      },
    ],
    cronJobs: [{ id: 'c1', name: 'watch', schedule: 'every 10m', lastRunAt: '2026-07-20T09:00:00Z', summary: 'scan folder' }],
    flowLogs: [{ id: 'f1', agentId: 'claude-code', event: 'PostToolUse', timestamp: '2026-07-20T08:00:00Z', summary: 'Write src/x' }],
  }

  it('produces a redacted, browser-importable export', () => {
    const out = buildHermesExport(raw)
    const json = JSON.stringify(out)
    expect(json).not.toContain('user@example.com')
    expect(json).not.toMatch(/\bsk-/)
    expect(json).not.toContain('example_user')

    const res = validateHermesExport(out)
    expect(res.ok).toBe(true)

    const data = mapHermesExportToSoulMap(out)
    expect(data.agents).toHaveLength(1)
    expect(data.events.length).toBeGreaterThan(0)
  })

  it('is resilient when sources are missing', () => {
    const out = buildHermesExport({ exportedAt: '2026-07-20T00:00:00Z', profiles: [{ id: 'x', name: 'X' }] })
    expect(validateHermesExport(out).ok).toBe(true)
    expect(out.sessions).toEqual([])
    expect(out.cronJobs).toEqual([])
    expect(out.sourceHealth.sessions.status).toBe('empty')
  })

  it('never throws on garbage input', () => {
    expect(() => buildHermesExport(undefined)).not.toThrow()
    expect(() => buildHermesExport({ profiles: 'bad' } as unknown as Record<string, unknown>)).not.toThrow()
  })

  it('fills all five source health channels', () => {
    const out = buildHermesExport(raw)
    for (const k of ['sessions', 'memories', 'skills', 'cron', 'flowLogs']) {
      expect(out.sourceHealth[k]).toBeDefined()
    }
    expect(out.sourceHealth.memories.status).toBe('live')
  })

  it('honors IO-provided channel error status', () => {
    const out = buildHermesExport({ ...raw, channels: { sessions: { status: 'error', note: 'state.db unreadable' } } })
    expect(out.sourceHealth.sessions.status).toBe('error')
  })
})

describe('committed importable sample', () => {
  it('examples/hermes-export.sample.json validates and maps', () => {
    const path = resolve(import.meta.dirname, '../examples/hermes-export.sample.json')
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    expect(validateHermesExport(parsed).ok).toBe(true)
    const data = mapHermesExportToSoulMap(parsed)
    expect(data.agents.length).toBeGreaterThan(0)
  })
})
