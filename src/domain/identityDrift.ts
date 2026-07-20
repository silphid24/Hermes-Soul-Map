import type { Agent, EvolutionSnapshot, SoulSnapshot } from '../types'

export type IdentityDriftStatus = 'emerging' | 'stable' | 'growing' | 'regressing' | 'unknown'

export interface IdentityDriftDelta {
  autonomy: number
  memory: number
  skill: number
  level: number
}

export interface SoulDriftDelta {
  identityChanged: boolean
  valuesAdded: string[]
  valuesRemoved: string[]
  toneChanged: boolean
  moodChanged: boolean
  coherence: number
}

export interface IdentityDriftSummary {
  status: IdentityDriftStatus
  identity: string
  baselineStage: string
  latestStage: string
  delta: IdentityDriftDelta
  soulDelta: SoulDriftDelta
  badges: string[]
  narrative: string
}

function sortByDate(snapshots: EvolutionSnapshot[]): EvolutionSnapshot[] {
  return [...snapshots].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

function signed(label: string, value: number): string | null {
  if (value === 0) return null
  return `${label} ${value > 0 ? '+' : ''}${value}`
}

function emptySoulDelta(): SoulDriftDelta {
  return {
    identityChanged: false,
    valuesAdded: [],
    valuesRemoved: [],
    toneChanged: false,
    moodChanged: false,
    coherence: 0,
  }
}

function buildSoulDelta(agent: Agent, soulHistory: SoulSnapshot[]): SoulDriftDelta {
  const sorted = [...soulHistory]
    .filter((snapshot) => snapshot.agentId === agent.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const baseline = sorted[0]
  if (!baseline) return emptySoulDelta()
  return {
    identityChanged: baseline.identity !== agent.soul.identity,
    valuesAdded: agent.soul.values.filter((value) => !baseline.values.includes(value)),
    valuesRemoved: baseline.values.filter((value) => !agent.soul.values.includes(value)),
    toneChanged: baseline.tone !== agent.soul.tone,
    moodChanged: baseline.mood !== agent.soul.mood,
    coherence: agent.soul.coherence - baseline.coherence,
  }
}

function buildBadges(delta: IdentityDriftDelta, soulDelta: SoulDriftDelta): string[] {
  const badges = [
    signed('autonomy', delta.autonomy),
    signed('memory', delta.memory),
    signed('skill', delta.skill),
    signed('level', delta.level),
  ].filter((value): value is string => Boolean(value))
  if (soulDelta.identityChanged) badges.push('identity changed')
  if (soulDelta.valuesAdded.length > 0 || soulDelta.valuesRemoved.length > 0) {
    badges.push(`values +${soulDelta.valuesAdded.length}/-${soulDelta.valuesRemoved.length}`)
  }
  if (soulDelta.toneChanged) badges.push('tone changed')
  if (soulDelta.moodChanged) badges.push('mood changed')
  if (soulDelta.coherence !== 0) badges.push(`coherence ${soulDelta.coherence > 0 ? '+' : ''}${soulDelta.coherence}`)
  return badges
}

function statusFor(snapshotCount: number, delta: IdentityDriftDelta): IdentityDriftStatus {
  if (snapshotCount === 0) return 'unknown'
  if (delta.autonomy < 0) return 'regressing'
  if (snapshotCount === 1) return 'emerging'
  if (delta.autonomy > 0 || delta.memory > 0 || delta.skill > 0 || delta.level > 0) return 'growing'
  return 'stable'
}

function narrativeFor(status: IdentityDriftStatus, agent: Agent, delta: IdentityDriftDelta, soulDelta: SoulDriftDelta): string {
  if (status === 'unknown') return '아직 비교할 정체성 스냅샷이 없습니다.'
  if (status === 'regressing') return `${agent.name}의 자율성 신호가 기준점보다 낮아져 개입이 필요한 정체성 drift가 감지됩니다.`
  if (status === 'emerging') return `${agent.name}의 정체성이 첫 스냅샷을 기준으로 형성되는 중입니다.`
  if (status === 'growing') {
    const growth = [
      delta.autonomy > 0 ? `자율성 +${delta.autonomy}` : '',
      delta.memory > 0 ? `기억 +${delta.memory}` : '',
      delta.skill > 0 ? `스킬 +${delta.skill}` : '',
      delta.level > 0 ? `레벨 +${delta.level}` : '',
    ].filter(Boolean).join(' · ')
    const soulText = soulDelta.identityChanged ? ' identity 문장이 바뀌었고' : ''
    const valueText = soulDelta.valuesAdded.length || soulDelta.valuesRemoved.length
      ? ` 가치가 +${soulDelta.valuesAdded.length}/-${soulDelta.valuesRemoved.length} 변화했습니다.`
      : ''
    return `${agent.name}의 정체성이 성장 중입니다.${soulText} ${growth} 변화가 관측됩니다.${valueText}`
  }
  return `${agent.name}의 정체성은 기준점 대비 안정적으로 유지되고 있습니다.`
}

export function identityDrift(agent: Agent, snapshots: EvolutionSnapshot[], soulHistory: SoulSnapshot[] = []): IdentityDriftSummary {
  const sorted = sortByDate(snapshots.filter((snapshot) => snapshot.agentId === agent.id))
  const soulDelta = buildSoulDelta(agent, soulHistory)
  if (sorted.length === 0) {
    const delta = { autonomy: 0, memory: 0, skill: 0, level: 0 }
    return {
      status: 'unknown',
      identity: agent.soul.identity,
      baselineStage: '',
      latestStage: '',
      delta,
      soulDelta,
      badges: [],
      narrative: narrativeFor('unknown', agent, delta, soulDelta),
    }
  }

  const baseline = sorted[0]
  const latest = sorted[sorted.length - 1]
  const delta = {
    autonomy: agent.autonomy - baseline.autonomy,
    memory: agent.memory.longTerm - baseline.memoryCount,
    skill: agent.skills.length - baseline.skillCount,
    level: latest.level - baseline.level,
  }
  const status = statusFor(sorted.length, delta)
  return {
    status,
    identity: agent.soul.identity,
    baselineStage: baseline.stage,
    latestStage: latest.stage,
    delta,
    soulDelta,
    badges: buildBadges(delta, soulDelta),
    narrative: narrativeFor(status, agent, delta, soulDelta),
  }
}
