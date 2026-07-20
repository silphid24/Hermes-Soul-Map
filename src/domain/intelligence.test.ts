import { describe, it, expect } from 'vitest'
import {
  skillCoverage,
  memoryVelocity,
  riskSignals,
  intelligenceScore,
} from './intelligence'
import type { Agent } from '../types'

function agent(extra: Partial<Agent> = {}): Agent {
  return {
    id: 'a',
    name: 'A',
    kind: 'specialist',
    status: 'active',
    specialty: '',
    description: '',
    trust: 80,
    autonomy: 60,
    emoji: '🤖',
    accent: '#fff',
    soul: { identity: '', values: [], tone: '', mood: '', coherence: 80 },
    memory: { longTerm: 100, recentGrowth: 10, lastConsolidated: '' },
    skills: [{ id: 's1', name: 'S1', proficiency: 80, acquiredAt: '2026-01-01' }],
    connections: [],
    ...extra,
  }
}

describe('skillCoverage', () => {
  it('스킬 숙련도 평균', () => {
    expect(
      skillCoverage(
        agent({
          skills: [
            { id: 'a', name: 'a', proficiency: 60, acquiredAt: '' },
            { id: 'b', name: 'b', proficiency: 80, acquiredAt: '' },
          ],
        }),
      ),
    ).toBe(70)
  })

  it('스킬이 없으면 0', () => {
    expect(skillCoverage(agent({ skills: [] }))).toBe(0)
  })
})

describe('memoryVelocity', () => {
  it('0이면 cold', () => {
    expect(memoryVelocity(agent({ memory: { longTerm: 1, recentGrowth: 0, lastConsolidated: '' } }))).toBe('cold')
  })
  it('1-5면 steady', () => {
    expect(memoryVelocity(agent({ memory: { longTerm: 1, recentGrowth: 3, lastConsolidated: '' } }))).toBe('steady')
  })
  it('6-20이면 growing', () => {
    expect(memoryVelocity(agent({ memory: { longTerm: 1, recentGrowth: 12, lastConsolidated: '' } }))).toBe('growing')
  })
  it('20 초과면 surging', () => {
    expect(memoryVelocity(agent({ memory: { longTerm: 1, recentGrowth: 47, lastConsolidated: '' } }))).toBe('surging')
  })
})

describe('riskSignals', () => {
  it('건강한 에이전트는 신호 없음', () => {
    expect(riskSignals(agent())).toEqual([])
  })
  it('planned/dormant 상태를 잡는다', () => {
    expect(riskSignals(agent({ status: 'planned' })).length).toBeGreaterThan(0)
    expect(riskSignals(agent({ status: 'dormant' })).length).toBeGreaterThan(0)
  })
  it('자율성이 신뢰보다 높으면 신호', () => {
    const signals = riskSignals(agent({ trust: 40, autonomy: 80 }))
    expect(signals.some((s) => s.includes('자율'))).toBe(true)
  })
  it('coherence 70 미만이면 신호', () => {
    const signals = riskSignals(agent({ soul: { identity: '', values: [], tone: '', mood: '', coherence: 55 } }))
    expect(signals.some((s) => s.includes('일관성'))).toBe(true)
  })
  it('스킬이 없으면 신호', () => {
    const signals = riskSignals(agent({ skills: [] }))
    expect(signals.some((s) => s.includes('스킬'))).toBe(true)
  })
})

describe('intelligenceScore', () => {
  it('가중 평균: trust30 autonomy25 coherence25 skill20', () => {
    // trust 100, autonomy 100, coherence 100, skillCoverage 100 → 100
    const full = agent({
      trust: 100,
      autonomy: 100,
      soul: { identity: '', values: [], tone: '', mood: '', coherence: 100 },
      skills: [{ id: 's', name: 's', proficiency: 100, acquiredAt: '' }],
    })
    expect(intelligenceScore(full)).toBe(100)
  })

  it('구성요소 가중을 반영한다', () => {
    const a = agent({
      trust: 80,
      autonomy: 60,
      soul: { identity: '', values: [], tone: '', mood: '', coherence: 80 },
      skills: [{ id: 's', name: 's', proficiency: 40, acquiredAt: '' }],
    })
    // 0.3*80 + 0.25*60 + 0.25*80 + 0.2*40 = 24 + 15 + 20 + 8 = 67
    expect(intelligenceScore(a)).toBe(67)
  })

  it('0-100 범위의 정수를 반환한다', () => {
    const score = intelligenceScore(agent())
    expect(Number.isInteger(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})
