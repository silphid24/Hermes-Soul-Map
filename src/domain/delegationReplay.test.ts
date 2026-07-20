import { describe, it, expect } from 'vitest'
import { buildDelegationReplay } from './delegationReplay'
import type { Agent, InterAgentRequest, LogEvent } from '../types'

// ─── fixtures ───────────────────────────────────────────────
function agent(id: string, name = id): Agent {
  return {
    id,
    name,
    kind: 'specialist',
    status: 'active',
    specialty: '',
    description: '',
    trust: 50,
    autonomy: 50,
    emoji: '🤖',
    accent: '#fff',
    soul: { identity: '', values: [], tone: '', mood: '', coherence: 0 },
    memory: { longTerm: 0, recentGrowth: 0, lastConsolidated: '' },
    skills: [],
    connections: [],
  }
}

function req(extra: Partial<InterAgentRequest> = {}): InterAgentRequest {
  return {
    id: 'r1',
    fromAgentId: 'a',
    toAgentId: 'b',
    capability: 'cap',
    summary: 's',
    status: 'queued',
    priority: 'medium',
    createdAt: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

function evt(extra: Partial<LogEvent> = {}): LogEvent {
  return {
    id: 'e1',
    agentId: 'a',
    source: 'hermes',
    type: 'handoff',
    timestamp: '2026-01-01T00:00:00Z',
    summary: '',
    importance: 'medium',
    ...extra,
  }
}

const A = agent('a', 'Alpha')
const B = agent('b', 'Bravo')

// ─── tests ──────────────────────────────────────────────────
describe('buildDelegationReplay — status', () => {
  it('빈 입력이면 idle, 스텝 없음 (required #8)', () => {
    const out = buildDelegationReplay([], [], [])
    expect(out.status).toBe('idle')
    expect(out.steps).toEqual([])
    expect(out.edges).toEqual([])
    expect(out.riskCount).toBe(0)
    expect(out.latestPath).toBeUndefined()
  })

  it('agents는 있으나 스텝 0건이면 idle (required #8)', () => {
    const out = buildDelegationReplay([A, B], [evt({ type: 'action' })], [])
    expect(out.steps).toHaveLength(0)
    expect(out.status).toBe('idle')
  })

  it('진행 중 요청이 있으면 flowing', () => {
    const out = buildDelegationReplay([A, B], [], [req({ status: 'in_progress' })])
    expect(out.status).toBe('flowing')
  })

  it('모두 completed(declined 없음)면 complete (required #11)', () => {
    const out = buildDelegationReplay(
      [A, B],
      [],
      [req({ id: 'r1', status: 'completed' }), req({ id: 'r2', status: 'completed' })],
    )
    expect(out.status).toBe('complete')
  })

  it('declined 요청은 risk이고, 모두 종료돼도 complete가 아니라 blocked (required #1)', () => {
    const out = buildDelegationReplay(
      [A, B],
      [],
      [req({ id: 'r1', status: 'completed' }), req({ id: 'r2', status: 'declined' })],
    )
    expect(out.status).toBe('blocked')
    expect(out.riskCount).toBe(1)
    const declined = out.steps.find((s) => s.id === 'req:r2')
    expect(declined?.risk).toBe(true)
    expect(declined?.kind).toBe('risk')
  })
})

describe('buildDelegationReplay — steps & risk', () => {
  it('요청 스텝은 source/target/이름/상태를 채운다', () => {
    const out = buildDelegationReplay([A, B], [], [req({ id: 'r1' })])
    const step = out.steps[0]
    expect(step.sourceAgentId).toBe('a')
    expect(step.sourceName).toBe('Alpha')
    expect(step.targetAgentId).toBe('b')
    expect(step.targetName).toBe('Bravo')
    expect(step.kind).toBe('request')
    expect(step.status).toBe('queued')
  })

  it('handoff 이벤트만 스텝이 되고 다른 type은 제외 (required #3)', () => {
    const out = buildDelegationReplay(
      [A, B],
      [
        evt({ id: 'e1', type: 'handoff', summary: 'to Bravo now' }),
        evt({ id: 'e2', type: 'message', summary: 'to Bravo' }),
        evt({ id: 'e3', type: 'action', summary: 'to Bravo' }),
      ],
      [],
    )
    expect(out.steps.map((s) => s.id)).toEqual(['evt:e1'])
  })

  it('target을 못 찾은 handoff는 signal이고 edge를 만들지 않는다 (required #4)', () => {
    const out = buildDelegationReplay(
      [A, B],
      [evt({ id: 'e1', type: 'handoff', agentId: 'a', summary: '내부 정리 신호' })],
      [],
    )
    const step = out.steps[0]
    expect(step.kind).toBe('signal')
    expect(step.targetAgentId).toBeUndefined()
    expect(out.edges).toHaveLength(0)
  })

  it('handoff summary에 target 이름이 있으면 대소문자 무관으로 매칭한다', () => {
    const out = buildDelegationReplay(
      [A, B],
      [evt({ id: 'e1', type: 'handoff', agentId: 'a', summary: 'handing to BRAVO team' })],
      [],
    )
    const step = out.steps[0]
    expect(step.targetAgentId).toBe('b')
    expect(step.kind).toBe('handoff')
  })

  it('리스크 키워드는 대소문자 무관 (required #6)', () => {
    const out = buildDelegationReplay(
      [A, B],
      [evt({ id: 'e1', type: 'handoff', agentId: 'a', summary: 'Bravo run TIMEOUT after Failed ERROR' })],
      [],
    )
    const step = out.steps[0]
    expect(step.risk).toBe(true)
    expect(step.kind).toBe('risk')
    expect(out.status).toBe('blocked')
  })

  it("'0 errors' 같은 clean 신호는 risk가 아니다 (required #7)", () => {
    const out = buildDelegationReplay(
      [A, B],
      [evt({ id: 'e1', type: 'handoff', agentId: 'a', summary: 'Bravo build passed, lint 0 errors' })],
      [req({ status: 'in_progress' })],
    )
    const step = out.steps.find((s) => s.id === 'evt:e1')
    expect(step?.risk).toBe(false)
    expect(out.riskCount).toBe(0)
    expect(out.status).toBe('flowing')
  })
})

describe('buildDelegationReplay — edges', () => {
  it('동일 source→target 다건이면 count 누적, lastTimestamp 최댓값, 리스크 1건이면 hasRisk (required #5)', () => {
    const out = buildDelegationReplay(
      [A, B],
      [
        evt({ id: 'e1', type: 'handoff', agentId: 'a', timestamp: '2026-01-02T00:00:00Z', summary: 'to Bravo timeout' }),
        evt({ id: 'e2', type: 'handoff', agentId: 'a', timestamp: '2026-01-05T00:00:00Z', summary: 'to Bravo ok' }),
      ],
      [req({ id: 'r1', fromAgentId: 'a', toAgentId: 'b', createdAt: '2026-01-01T00:00:00Z' })],
    )
    const edge = out.edges.find((e) => e.from === 'a' && e.to === 'b')
    expect(edge).toBeDefined()
    expect(edge?.count).toBe(3)
    expect(edge?.lastTimestamp).toBe('2026-01-05T00:00:00Z')
    expect(edge?.hasRisk).toBe(true)
    expect(edge?.fromName).toBe('Alpha')
    expect(edge?.toName).toBe('Bravo')
  })

  it('seed-유사 4개 요청 흐름은 4개 edge와 latestPath를 만든다 (required #2)', () => {
    const agents = [
      agent('izera365'),
      agent('doc-auto-agent'),
      agent('hermes-default'),
      agent('ai-trend-radar'),
      agent('pistachio'),
      agent('social-media'),
      agent('claude-code'),
    ]
    const requests = [
      req({ id: 'q1', fromAgentId: 'izera365', toAgentId: 'doc-auto-agent', createdAt: '2026-07-10T09:00:00Z' }),
      req({ id: 'q2', fromAgentId: 'hermes-default', toAgentId: 'ai-trend-radar', createdAt: '2026-06-22T08:00:00Z' }),
      req({ id: 'q3', fromAgentId: 'pistachio', toAgentId: 'social-media', createdAt: '2026-07-08T16:00:00Z' }),
      req({ id: 'q4', fromAgentId: 'hermes-default', toAgentId: 'claude-code', createdAt: '2026-07-11T07:27:00Z' }),
    ]
    const out = buildDelegationReplay(agents, [], requests)
    expect(out.edges).toHaveLength(4)
    expect(out.latestPath).toEqual({
      from: 'hermes-default',
      to: 'claude-code',
      fromName: 'hermes-default',
      toName: 'claude-code',
    })
  })
})

describe('buildDelegationReplay — determinism & fallback', () => {
  it('동일 timestamp면 id 사전순으로 결정론적 정렬 (required #2)', () => {
    const out = buildDelegationReplay(
      [A, B],
      [],
      [
        req({ id: 'zzz', createdAt: '2026-01-01T00:00:00Z' }),
        req({ id: 'aaa', createdAt: '2026-01-01T00:00:00Z' }),
        req({ id: 'mmm', createdAt: '2026-01-01T00:00:00Z' }),
      ],
    )
    expect(out.steps.map((s) => s.id)).toEqual(['req:aaa', 'req:mmm', 'req:zzz'])
  })

  it('unknown agentId면 이름 대신 id로 fallback (required #10)', () => {
    const out = buildDelegationReplay(
      [A],
      [],
      [req({ id: 'r1', fromAgentId: 'a', toAgentId: 'ghost' })],
    )
    const step = out.steps[0]
    expect(step.sourceName).toBe('Alpha')
    expect(step.targetName).toBe('ghost')
  })
})
