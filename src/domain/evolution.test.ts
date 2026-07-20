import { describe, it, expect } from 'vitest'
import {
  sortByDate,
  snapshotsForAgent,
  autonomyTrend,
  memoryGrowth,
  currentLevel,
  evolutionNarrative,
} from './evolution'
import type { EvolutionSnapshot } from '../types'

function snap(
  date: string,
  extra: Partial<EvolutionSnapshot> = {},
): EvolutionSnapshot {
  return {
    agentId: 'hermes',
    date,
    level: 1,
    stage: 'seed',
    memoryCount: 0,
    skillCount: 0,
    autonomy: 50,
    ...extra,
  }
}

describe('sortByDate', () => {
  it('오름차순 정렬한다', () => {
    const out = sortByDate([snap('2026-03-01'), snap('2026-01-01'), snap('2026-02-01')])
    expect(out.map((s) => s.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })
})

describe('snapshotsForAgent', () => {
  it('에이전트별로 거르고 날짜순 정렬한다', () => {
    const out = snapshotsForAgent(
      [
        snap('2026-02-01', { agentId: 'a' }),
        snap('2026-01-01', { agentId: 'a' }),
        snap('2026-01-01', { agentId: 'b' }),
      ],
      'a',
    )
    expect(out).toHaveLength(2)
    expect(out[0].date).toBe('2026-01-01')
  })
})

describe('autonomyTrend', () => {
  it('증가하면 rising', () => {
    expect(
      autonomyTrend([snap('2026-01-01', { autonomy: 30 }), snap('2026-02-01', { autonomy: 70 })]),
    ).toBe('rising')
  })
  it('감소하면 falling', () => {
    expect(
      autonomyTrend([snap('2026-01-01', { autonomy: 80 }), snap('2026-02-01', { autonomy: 40 })]),
    ).toBe('falling')
  })
  it('스냅샷 1개면 flat', () => {
    expect(autonomyTrend([snap('2026-01-01')])).toBe('flat')
  })
})

describe('memoryGrowth', () => {
  it('첫 대비 마지막 기억 증가량', () => {
    expect(
      memoryGrowth([
        snap('2026-01-01', { memoryCount: 10 }),
        snap('2026-03-01', { memoryCount: 42 }),
      ]),
    ).toBe(32)
  })
  it('빈 배열이면 0', () => {
    expect(memoryGrowth([])).toBe(0)
  })
})

describe('currentLevel', () => {
  it('가장 최근 레벨을 반환한다', () => {
    expect(
      currentLevel([snap('2026-01-01', { level: 1 }), snap('2026-05-01', { level: 4 })]),
    ).toBe(4)
  })
})

describe('evolutionNarrative', () => {
  it('스냅샷이 없으면 안내 문구', () => {
    expect(evolutionNarrative([])).toBe('아직 진화 데이터가 없습니다.')
  })

  it('자율성 상승 + 기억 성장이면 함께 성장 언급', () => {
    const text = evolutionNarrative([
      snap('2026-01-01', { autonomy: 40, memoryCount: 100 }),
      snap('2026-03-01', { autonomy: 72, memoryCount: 240 }),
    ])
    expect(text).toContain('자율성과 기억이 함께 성장')
  })

  it('자율성이 평평하면 안정적으로 유지 언급', () => {
    const text = evolutionNarrative([
      snap('2026-01-01', { autonomy: 60, memoryCount: 100 }),
      snap('2026-03-01', { autonomy: 60, memoryCount: 120 }),
    ])
    expect(text).toContain('안정적으로 유지')
  })

  it('자율성이 하락하면 개입이 필요한 신호 언급', () => {
    const text = evolutionNarrative([
      snap('2026-01-01', { autonomy: 80, memoryCount: 100 }),
      snap('2026-03-01', { autonomy: 50, memoryCount: 110 }),
    ])
    expect(text).toContain('개입이 필요한 신호')
  })
})
