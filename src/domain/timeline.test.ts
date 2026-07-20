import { describe, it, expect } from 'vitest'
import {
  sortByRecency,
  eventsForAgent,
  filterByImportance,
  groupByDay,
  filterEvents,
} from './timeline'
import type { LogEvent } from '../types'

function ev(id: string, timestamp: string, extra: Partial<LogEvent> = {}): LogEvent {
  return {
    id,
    agentId: 'hermes',
    source: 'hermes',
    type: 'message',
    timestamp,
    summary: id,
    importance: 'medium',
    ...extra,
  }
}

describe('sortByRecency', () => {
  it('최신 이벤트를 앞에 둔다', () => {
    const out = sortByRecency([
      ev('old', '2026-01-01T00:00:00Z'),
      ev('new', '2026-06-01T00:00:00Z'),
      ev('mid', '2026-03-01T00:00:00Z'),
    ])
    expect(out.map((e) => e.id)).toEqual(['new', 'mid', 'old'])
  })

  it('입력 배열을 변형하지 않는다', () => {
    const input = [ev('a', '2026-01-01T00:00:00Z'), ev('b', '2026-02-01T00:00:00Z')]
    sortByRecency(input)
    expect(input.map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('eventsForAgent', () => {
  it('해당 에이전트 이벤트만 최신순으로 반환한다', () => {
    const out = eventsForAgent(
      [
        ev('a', '2026-01-01T00:00:00Z', { agentId: 'hermes' }),
        ev('b', '2026-02-01T00:00:00Z', { agentId: 'izera365' }),
        ev('c', '2026-03-01T00:00:00Z', { agentId: 'hermes' }),
      ],
      'hermes',
    )
    expect(out.map((e) => e.id)).toEqual(['c', 'a'])
  })
})

describe('filterByImportance', () => {
  const events = [
    ev('lo', '2026-01-01T00:00:00Z', { importance: 'low' }),
    ev('me', '2026-01-01T00:00:00Z', { importance: 'medium' }),
    ev('hi', '2026-01-01T00:00:00Z', { importance: 'high' }),
    ev('cr', '2026-01-01T00:00:00Z', { importance: 'critical' }),
  ]

  it('high 이상만 남긴다', () => {
    expect(filterByImportance(events, 'high').map((e) => e.id)).toEqual(['hi', 'cr'])
  })

  it('low 임계값은 전부 통과시킨다', () => {
    expect(filterByImportance(events, 'low')).toHaveLength(4)
  })
})

describe('groupByDay', () => {
  it('날짜별로 묶고 최신 날짜 그룹을 먼저 둔다', () => {
    const groups = groupByDay([
      ev('a', '2026-01-01T10:00:00Z'),
      ev('b', '2026-01-02T09:00:00Z'),
      ev('c', '2026-01-01T12:00:00Z'),
    ])
    expect(groups.map((g) => g.day)).toEqual(['2026-01-02', '2026-01-01'])
    // 같은 날 그룹 내부도 최신순
    expect(groups[1].events.map((e) => e.id)).toEqual(['c', 'a'])
  })
})

describe('filterEvents', () => {
  const events: LogEvent[] = [
    ev('a', '2026-01-01T00:00:00Z', {
      agentId: 'hermes',
      source: 'hermes',
      type: 'message',
      importance: 'low',
      summary: 'Google 연동 확인',
    }),
    ev('b', '2026-02-01T00:00:00Z', {
      agentId: 'izera365',
      source: 'google-workspace',
      type: 'action',
      importance: 'high',
      summary: '캘린더 일정 등록',
      emotion: '성취감',
    }),
    ev('c', '2026-03-01T00:00:00Z', {
      agentId: 'hermes',
      source: 'cron',
      type: 'memory',
      importance: 'medium',
      summary: '야간 기억 통합',
      identityShift: '자기 서사 연속성 강화',
    }),
  ]

  it('빈 필터는 최신순 전체를 반환한다', () => {
    expect(filterEvents(events, {}).map((e) => e.id)).toEqual(['c', 'b', 'a'])
  })

  it('query는 summary를 대소문자 무시하고 검색한다', () => {
    expect(filterEvents(events, { query: 'google' }).map((e) => e.id)).toEqual(['a'])
  })

  it('query는 emotion과 identityShift도 검색한다', () => {
    expect(filterEvents(events, { query: '성취감' }).map((e) => e.id)).toEqual(['b'])
    expect(filterEvents(events, { query: '서사' }).map((e) => e.id)).toEqual(['c'])
  })

  it('agentId로 정확히 거른다', () => {
    expect(filterEvents(events, { agentId: 'hermes' }).map((e) => e.id)).toEqual(['c', 'a'])
  })

  it('source all은 전체를 통과시킨다', () => {
    expect(filterEvents(events, { source: 'all' })).toHaveLength(3)
    expect(filterEvents(events, { source: 'cron' }).map((e) => e.id)).toEqual(['c'])
  })

  it('type으로 거른다', () => {
    expect(filterEvents(events, { type: 'action' }).map((e) => e.id)).toEqual(['b'])
    expect(filterEvents(events, { type: 'all' })).toHaveLength(3)
  })

  it('minImportance는 임계값 이상만 남긴다', () => {
    expect(filterEvents(events, { minImportance: 'medium' }).map((e) => e.id)).toEqual(['c', 'b'])
  })

  it('여러 조건을 조합한다', () => {
    const out = filterEvents(events, {
      agentId: 'hermes',
      minImportance: 'medium',
      type: 'all',
    })
    expect(out.map((e) => e.id)).toEqual(['c'])
  })

  it('조건에 맞는 게 없으면 빈 배열', () => {
    expect(filterEvents(events, { query: '없는단어' })).toEqual([])
  })
})
