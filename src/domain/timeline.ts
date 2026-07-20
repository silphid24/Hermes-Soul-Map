import type { EventSource, EventType, Importance, LogEvent } from '../types'

const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

/** 이벤트를 최신순(내림차순)으로 정렬한 새 배열을 돌려준다. */
export function sortByRecency(events: LogEvent[]): LogEvent[] {
  return [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
}

/** 주어진 에이전트의 이벤트만 최신순으로 추린다. */
export function eventsForAgent(events: LogEvent[], agentId: string): LogEvent[] {
  return sortByRecency(events.filter((e) => e.agentId === agentId))
}

/** 중요도가 임계값 이상인 이벤트만 남긴다. */
export function filterByImportance(
  events: LogEvent[],
  min: Importance,
): LogEvent[] {
  const threshold = IMPORTANCE_WEIGHT[min]
  return events.filter((e) => IMPORTANCE_WEIGHT[e.importance] >= threshold)
}

/** YYYY-MM-DD 기준으로 이벤트를 묶는다. 각 그룹 내부는 최신순. */
export function groupByDay(events: LogEvent[]): { day: string; events: LogEvent[] }[] {
  const buckets = new Map<string, LogEvent[]>()
  for (const e of sortByRecency(events)) {
    const day = e.timestamp.slice(0, 10)
    const list = buckets.get(day)
    if (list) list.push(e)
    else buckets.set(day, [e])
  }
  // Map 삽입 순서 = 최신 그룹 우선 (sortByRecency 덕분)
  return [...buckets.entries()].map(([day, evs]) => ({ day, events: evs }))
}

/** 로그 탐색기 필터 조건. 모든 필드는 선택적. */
export interface TimelineFilter {
  /** summary/emotion/identityShift를 대소문자 무시하고 검색 */
  query?: string
  /** 특정 에이전트 id로 정확 매칭 */
  agentId?: string
  source?: EventSource | 'all'
  type?: EventType | 'all'
  /** 이 중요도 이상만 통과 */
  minImportance?: Importance
}

/**
 * 여러 조건으로 이벤트를 거른 뒤 최신순으로 정렬해 반환한다.
 * UI 로그 탐색기의 단일 진입점 — 필터 로직을 UI 밖에서 테스트할 수 있게 한다.
 */
export function filterEvents(events: LogEvent[], filter: TimelineFilter): LogEvent[] {
  const q = filter.query?.trim().toLowerCase()
  const threshold =
    filter.minImportance !== undefined ? IMPORTANCE_WEIGHT[filter.minImportance] : 0

  const filtered = events.filter((e) => {
    if (filter.agentId && e.agentId !== filter.agentId) return false
    if (filter.source && filter.source !== 'all' && e.source !== filter.source) return false
    if (filter.type && filter.type !== 'all' && e.type !== filter.type) return false
    if (IMPORTANCE_WEIGHT[e.importance] < threshold) return false
    if (q) {
      const haystack = [e.summary, e.emotion, e.identityShift]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  return sortByRecency(filtered)
}
