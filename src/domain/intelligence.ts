// Derived agent-intelligence metrics.
//
// Scorecards must be *computed*, not hand-typed per agent, so that imported
// Hermes data produces the same readouts as the seed. Every function here is a
// pure derivation from an `Agent`.

import type { Agent } from '../types'

export type MemoryVelocity = 'cold' | 'steady' | 'growing' | 'surging'

/** 스킬 숙련도 평균 (0–100). 스킬이 없으면 0. */
export function skillCoverage(agent: Agent): number {
  if (agent.skills.length === 0) return 0
  const sum = agent.skills.reduce((acc, s) => acc + s.proficiency, 0)
  return Math.round(sum / agent.skills.length)
}

/** 최근 7일 기억 증가량으로 성장 속도를 라벨링한다. */
export function memoryVelocity(agent: Agent): MemoryVelocity {
  const growth = agent.memory.recentGrowth
  if (growth <= 0) return 'cold'
  if (growth <= 5) return 'steady'
  if (growth <= 20) return 'growing'
  return 'surging'
}

/** 개입이 필요할 수 있는 위험 신호를 사람이 읽는 문장으로 모은다. */
export function riskSignals(agent: Agent): string[] {
  const signals: string[] = []
  if (agent.status === 'planned') signals.push('아직 합류하지 않은 예정 상태')
  if (agent.status === 'dormant') signals.push('오래 활동이 없는 휴면 상태')
  if (agent.autonomy > agent.trust) signals.push('신뢰보다 자율성이 높음 — 위임 범위 재검토 필요')
  if (agent.soul.coherence < 70) signals.push('자기 일관성(coherence) 70 미만')
  if (agent.skills.length === 0) signals.push('보유 스킬 없음')
  return signals
}

const WEIGHTS = { trust: 0.3, autonomy: 0.25, coherence: 0.25, skill: 0.2 } as const

/**
 * 종합 지능/준비도 점수 (0–100, 정수).
 * trust 30% · autonomy 25% · coherence 25% · skill coverage 20%.
 */
export function intelligenceScore(agent: Agent): number {
  const raw =
    WEIGHTS.trust * agent.trust +
    WEIGHTS.autonomy * agent.autonomy +
    WEIGHTS.coherence * agent.soul.coherence +
    WEIGHTS.skill * skillCoverage(agent)
  return Math.max(0, Math.min(100, Math.round(raw)))
}

export const memoryVelocityLabel: Record<MemoryVelocity, string> = {
  cold: '정체',
  steady: '꾸준',
  growing: '성장',
  surging: '급성장',
}
