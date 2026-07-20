import type { EvolutionSnapshot } from '../types'

export type Trend = 'rising' | 'falling' | 'flat'

/** 스냅샷을 날짜 오름차순으로 정렬한 새 배열. */
export function sortByDate(snapshots: EvolutionSnapshot[]): EvolutionSnapshot[] {
  return [...snapshots].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )
}

export function snapshotsForAgent(
  snapshots: EvolutionSnapshot[],
  agentId: string,
): EvolutionSnapshot[] {
  return sortByDate(snapshots.filter((s) => s.agentId === agentId))
}

/**
 * 자율성 추세: 처음 대비 마지막 스냅샷의 방향.
 * 스냅샷이 2개 미만이면 'flat'.
 */
export function autonomyTrend(snapshots: EvolutionSnapshot[]): Trend {
  const sorted = sortByDate(snapshots)
  if (sorted.length < 2) return 'flat'
  const delta = sorted[sorted.length - 1].autonomy - sorted[0].autonomy
  if (delta > 0) return 'rising'
  if (delta < 0) return 'falling'
  return 'flat'
}

/** 첫 스냅샷 대비 마지막 스냅샷의 기억 증가량. 데이터가 없으면 0. */
export function memoryGrowth(snapshots: EvolutionSnapshot[]): number {
  const sorted = sortByDate(snapshots)
  if (sorted.length === 0) return 0
  return sorted[sorted.length - 1].memoryCount - sorted[0].memoryCount
}

/** 가장 최근 스냅샷의 레벨. 데이터 없으면 0. */
export function currentLevel(snapshots: EvolutionSnapshot[]): number {
  const sorted = sortByDate(snapshots)
  return sorted.length ? sorted[sorted.length - 1].level : 0
}

/**
 * 스냅샷 추세를 사람이 읽는 한국어 서사로 변환한다.
 * "이 에이전트는 최근 기억이 늘고 자율성이 상승 중…" 같은 문장.
 */
export function evolutionNarrative(snapshots: EvolutionSnapshot[]): string {
  const sorted = sortByDate(snapshots)
  if (sorted.length === 0) return '아직 진화 데이터가 없습니다.'

  const latest = sorted[sorted.length - 1]
  const trend = autonomyTrend(sorted)
  const growth = memoryGrowth(sorted)
  const parts: string[] = [`현재 Lv.${latest.level} '${latest.stage}' 단계.`]

  if (trend === 'rising' && growth > 0) {
    parts.push('자율성과 기억이 함께 성장 중이라 위임 범위를 넓혀도 좋은 국면입니다.')
  } else if (trend === 'rising') {
    parts.push('자율성이 상승하고 있습니다.')
  } else if (trend === 'flat') {
    parts.push('자율성은 안정적으로 유지되고 있습니다.')
  } else {
    parts.push('자율성이 하락해 개입이 필요한 신호가 보입니다.')
  }

  if (growth > 0) {
    parts.push(`첫 스냅샷 대비 기억이 ${growth}건 늘었습니다.`)
  } else if (growth === 0) {
    parts.push('기억 축적은 정체 상태입니다.')
  }

  return parts.join(' ')
}
