import { describe, it, expect } from 'vitest'
import {
  deriveSourceHealth,
  mapHermesExportToSoulMap,
  validateHermesExport,
  type HermesExport,
} from './hermesExport'

const sample: HermesExport = {
  exportedAt: '2026-07-11T00:00:00+09:00',
  profiles: [
    {
      id: 'default',
      name: 'Hermes Default',
      kind: 'default',
      memories: [
        { id: 'm1', content: 'User prefers MECE', createdAt: '2026-07-10T00:00:00+09:00' },
      ],
      skills: [{ id: 'google-workspace', name: 'Google Workspace', proficiency: 80 }],
    },
  ],
  sessions: [
    {
      id: 's1',
      profileId: 'default',
      title: 'Google 연동',
      messages: [
        { id: 'msg1', role: 'user', content: '확인해줘', timestamp: '2026-07-11T01:00:00+09:00' },
      ],
    },
  ],
  cronJobs: [],
  flowLogs: [],
}

describe('mapHermesExportToSoulMap', () => {
  it('maps profiles into agents', () => {
    const data = mapHermesExportToSoulMap(sample)
    expect(data.agents).toHaveLength(1)
    const agent = data.agents[0]
    expect(agent.id).toBe('default')
    expect(agent.name).toBe('Hermes Default')
    expect(agent.kind).toBe('default')
  })

  it('maps memory entries into memory stats', () => {
    const data = mapHermesExportToSoulMap(sample)
    const agent = data.agents[0]
    expect(agent.memory.longTerm).toBe(1)
    // 2026-07-10 is within 7 days of exportedAt 2026-07-11
    expect(agent.memory.recentGrowth).toBe(1)
    expect(agent.memory.lastConsolidated).toBe('2026-07-10T00:00:00+09:00')
  })

  it('only counts memories within last 7 days of exportedAt as recent growth', () => {
    const data = mapHermesExportToSoulMap({
      ...sample,
      profiles: [
        {
          id: 'default',
          name: 'Hermes Default',
          memories: [
            { id: 'a', content: 'old', createdAt: '2026-06-01T00:00:00+09:00' },
            { id: 'b', content: 'new', createdAt: '2026-07-09T00:00:00+09:00' },
          ],
        },
      ],
    })
    expect(data.agents[0].memory.longTerm).toBe(2)
    expect(data.agents[0].memory.recentGrowth).toBe(1)
  })

  it('maps session messages into log events', () => {
    const data = mapHermesExportToSoulMap(sample)
    expect(data.events).toHaveLength(1)
    const event = data.events[0]
    expect(event.agentId).toBe('default')
    expect(event.type).toBe('message')
    expect(event.importance).toBe('medium')
    expect(event.summary).toContain('확인해줘')
  })

  it('maps skills into agent skills', () => {
    const data = mapHermesExportToSoulMap(sample)
    const skill = data.agents[0].skills[0]
    expect(skill.id).toBe('google-workspace')
    expect(skill.name).toBe('Google Workspace')
    expect(skill.proficiency).toBe(80)
  })

  it('falls back safely for missing optional fields', () => {
    const data = mapHermesExportToSoulMap({
      exportedAt: '2026-07-11T00:00:00+09:00',
      profiles: [{ id: 'mystery', name: '미지의 에이전트' }],
    })
    const agent = data.agents[0]
    // unknown/absent kind → specialist
    expect(agent.kind).toBe('specialist')
    expect(agent.skills).toEqual([])
    expect(agent.memory.longTerm).toBe(0)
    expect(agent.memory.recentGrowth).toBe(0)
    expect(agent.connections).toEqual([])
    expect(data.events).toEqual([])
  })

  it('coerces unknown kind values to specialist', () => {
    const data = mapHermesExportToSoulMap({
      exportedAt: '2026-07-11T00:00:00+09:00',
      profiles: [{ id: 'x', name: 'X', kind: 'wizard' }],
    })
    expect(data.agents[0].kind).toBe('specialist')
  })

  it('maps cron jobs and flow logs into events', () => {
    const data = mapHermesExportToSoulMap({
      exportedAt: '2026-07-11T00:00:00+09:00',
      profiles: [{ id: 'default', name: 'Hermes' }],
      cronJobs: [
        {
          id: 'c1',
          name: '야간 기억 통합',
          profileId: 'default',
          schedule: '0 2 * * *',
          lastRunAt: '2026-07-11T02:00:00+09:00',
        },
      ],
      flowLogs: [
        {
          id: 'f1',
          agentId: 'default',
          event: 'PostToolUse',
          timestamp: '2026-07-11T03:00:00+09:00',
          summary: 'Write src/App.tsx',
        },
      ],
    })
    const types = data.events.map((e) => e.type)
    expect(types).toContain('action')
    expect(data.events.some((e) => e.source === 'cron')).toBe(true)
  })


  it('maps v2 evolution snapshots, requests, and roadmap', () => {
    const data = mapHermesExportToSoulMap({
      ...sample,
      evolutionSnapshots: [
        { profileId: 'default', date: '2026-07-11', level: 3, stage: '통합기', memoryCount: 12, skillCount: 4, autonomy: 88 },
      ],
      requests: [
        { id: 'r1', fromAgentId: 'default', toAgentId: 'izera365', capability: 'calendar.create', summary: '회의 생성', status: 'accepted', priority: 'high' },
      ],
      roadmap: [
        { id: 'rm1', phase: 'next', title: 'Bridge', description: '로컬 export bridge', done: true },
      ],
    })

    expect(data.evolution[0]).toMatchObject({ agentId: 'default', level: 3, stage: '통합기', autonomy: 88 })
    expect(data.requests[0]).toMatchObject({ id: 'r1', status: 'accepted', priority: 'high' })
    expect(data.roadmap[0]).toMatchObject({ id: 'rm1', phase: 'next', done: true })
  })

  it('maps v3 soul snapshots into soulHistory', () => {
    const data = mapHermesExportToSoulMap({
      ...sample,
      soulSnapshots: [
        {
          agentId: 'default',
          date: '2026-06-01',
          identity: '나는 비서다.',
          values: ['정확도'],
          tone: '설명형',
          mood: '대기',
          coherence: 76,
        },
      ],
    })
    expect(data.soulHistory).toEqual([
      expect.objectContaining({ agentId: 'default', identity: '나는 비서다.', values: ['정확도'], coherence: 76 }),
    ])
  })

  it('falls back safely for malformed v2 fields', () => {
    const data = mapHermesExportToSoulMap({
      ...sample,
      evolutionSnapshots: [
        { agentId: 'default', date: '2026-07-11', level: 'x' as unknown as number, memoryCount: -2, skillCount: 'many' as unknown as number, autonomy: 'high' as unknown as number },
        { agentId: 'default', level: 9 },
      ],
      requests: [
        { id: 'r1', status: 'weird', priority: 'urgent' },
        { status: 'accepted' },
      ],
      roadmap: [
        { id: 'rm1', phase: 'someday', done: 'yes', title: 'Maybe' },
        { phase: 'next', title: 'No id' },
      ],
    })

    expect(data.evolution).toHaveLength(1)
    expect(data.evolution[0]).toMatchObject({ level: 1, memoryCount: 0, skillCount: 0, autonomy: 0 })
    expect(data.requests).toEqual([
      expect.objectContaining({ id: 'r1', fromAgentId: '', toAgentId: '', status: 'queued', priority: 'medium', createdAt: sample.exportedAt }),
    ])
    expect(data.roadmap).toEqual([
      expect.objectContaining({ id: 'rm1', phase: 'future', done: false }),
    ])
  })

  it('treats non-array v2 optional fields as empty for backwards-compatible imports', () => {
    const data = mapHermesExportToSoulMap({
      ...sample,
      evolutionSnapshots: 'bad' as unknown as HermesExport['evolutionSnapshots'],
      requests: null as unknown as HermesExport['requests'],
      roadmap: { id: 'bad' } as unknown as HermesExport['roadmap'],
    })
    expect(data.evolution).toEqual([])
    expect(data.requests).toEqual([])
    expect(data.roadmap).toEqual([])
  })
})

describe('validateHermesExport', () => {
  it('accepts a well-formed export', () => {
    const result = validateHermesExport(sample)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.profiles).toHaveLength(1)
  })

  it('rejects a non-object', () => {
    const result = validateHermesExport('nope')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects missing profiles array', () => {
    const result = validateHermesExport({ exportedAt: '2026-07-11T00:00:00+09:00' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('profiles')
  })


  it('accepts malformed optional v2 arrays so mapper can safely ignore them', () => {
    const result = validateHermesExport({
      ...sample,
      evolutionSnapshots: 'bad',
      requests: null,
      roadmap: { id: 'bad' },
    })
    expect(result.ok).toBe(true)
  })

  it('rejects profiles without id or name', () => {
    const result = validateHermesExport({
      exportedAt: '2026-07-11T00:00:00+09:00',
      profiles: [{ name: 'no id' }],
    })
    expect(result.ok).toBe(false)
  })
})


describe('deriveSourceHealth', () => {
  it('derives live/empty channel status from export counts', () => {
    const health = deriveSourceHealth(sample)
    expect(health.reportedAt).toBe(sample.exportedAt)
    expect(health.channels.find((c) => c.key === 'sessions')).toMatchObject({ label: '세션', status: 'live', count: 1 })
    expect(health.channels.find((c) => c.key === 'memories')).toMatchObject({ status: 'live', count: 1 })
    expect(health.channels.find((c) => c.key === 'cron')).toMatchObject({ status: 'empty', count: 0 })
  })

  it('uses provided sourceHealth with enum clamp, count, and note', () => {
    const health = deriveSourceHealth({
      ...sample,
      sourceHealth: {
        sessions: { status: 'partial', count: 7, note: '2건 제외' },
        flowLogs: { status: 'mystery', count: 3 },
      },
    })
    expect(health.channels.find((c) => c.key === 'sessions')).toMatchObject({ status: 'partial', count: 7, note: '2건 제외' })
    expect(health.channels.find((c) => c.key === 'flowLogs')).toMatchObject({ status: 'unknown', count: 3 })
  })
})
