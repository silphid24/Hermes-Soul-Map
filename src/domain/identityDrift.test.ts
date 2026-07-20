import { describe, expect, it } from 'vitest'
import { identityDrift } from './identityDrift'
import type { Agent, EvolutionSnapshot } from '../types'

const agent: Agent = {
  id: 'hermes-default',
  name: 'Hermes Default',
  kind: 'default',
  status: 'active',
  specialty: '오케스트레이터',
  description: '',
  trust: 94,
  autonomy: 76,
  emoji: '🪽',
  accent: '#8b7cff',
  soul: {
    identity: '나는 동한의 개인 AI 운영체제다.',
    values: ['속도', '정확도'],
    tone: '짧고 선명한',
    mood: '집중',
    coherence: 90,
  },
  memory: { longTerm: 8, recentGrowth: 2, lastConsolidated: '2026-07-16T00:00:00Z' },
  skills: [
    { id: 'a', name: 'A', proficiency: 80, acquiredAt: '2026-01-01' },
    { id: 'b', name: 'B', proficiency: 85, acquiredAt: '2026-01-02' },
    { id: 'c', name: 'C', proficiency: 90, acquiredAt: '2026-01-03' },
  ],
  connections: [],
}

const snapshots: EvolutionSnapshot[] = [
  { agentId: 'hermes-default', date: '2026-06-01', level: 1, stage: '도구 사용자', memoryCount: 2, skillCount: 1, autonomy: 40 },
  { agentId: 'hermes-default', date: '2026-07-01', level: 3, stage: '오케스트레이터', memoryCount: 6, skillCount: 2, autonomy: 70 },
]

describe('identityDrift', () => {
  it('summarizes growth deltas from baseline snapshot to current agent', () => {
    const summary = identityDrift(agent, snapshots)
    expect(summary.status).toBe('growing')
    expect(summary.delta).toEqual({ autonomy: 36, memory: 6, skill: 2, level: 2 })
    expect(summary.identity).toBe('나는 동한의 개인 AI 운영체제다.')
    expect(summary.badges).toEqual(['autonomy +36', 'memory +6', 'skill +2', 'level +2'])
    expect(summary.narrative).toContain('정체성이 성장 중')
  })

  it('marks regressing when current autonomy is below baseline', () => {
    const summary = identityDrift({ ...agent, autonomy: 30 }, snapshots)
    expect(summary.status).toBe('regressing')
    expect(summary.badges).toContain('autonomy -10')
  })

  it('uses emerging status with a single snapshot', () => {
    const summary = identityDrift(agent, [snapshots[0]])
    expect(summary.status).toBe('emerging')
    expect(summary.baselineStage).toBe('도구 사용자')
  })

  it('computes soul text/value drift from historical soul snapshots', () => {
    const summary = identityDrift(agent, snapshots, [
      {
        agentId: 'hermes-default',
        date: '2026-06-01',
        identity: '나는 도구를 호출하는 비서다.',
        values: ['정확도', '수동 실행'],
        tone: '설명형',
        mood: '대기',
        coherence: 76,
      },
    ])
    expect(summary.soulDelta).toEqual({
      identityChanged: true,
      valuesAdded: ['속도'],
      valuesRemoved: ['수동 실행'],
      toneChanged: true,
      moodChanged: true,
      coherence: 14,
    })
    expect(summary.badges).toContain('identity changed')
    expect(summary.badges).toContain('values +1/-1')
    expect(summary.narrative).toContain('identity 문장이 바뀌었고')
  })

  it('returns unknown safely without snapshots', () => {
    const summary = identityDrift(agent, [])
    expect(summary.status).toBe('unknown')
    expect(summary.delta).toEqual({ autonomy: 0, memory: 0, skill: 0, level: 0 })
    expect(summary.soulDelta.identityChanged).toBe(false)
    expect(summary.badges).toEqual([])
  })
})
