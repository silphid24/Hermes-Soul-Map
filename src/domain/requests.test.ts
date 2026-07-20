import { describe, it, expect } from 'vitest'
import {
  canTransition,
  transition,
  activeRequests,
  prioritize,
  countByStatus,
} from './requests'
import type { InterAgentRequest } from '../types'

function req(extra: Partial<InterAgentRequest> = {}): InterAgentRequest {
  return {
    id: 'r1',
    fromAgentId: 'hermes',
    toAgentId: 'izera365',
    capability: 'summarize',
    summary: '',
    status: 'queued',
    priority: 'medium',
    createdAt: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

describe('canTransition', () => {
  it('queued → accepted 는 허용', () => {
    expect(canTransition('queued', 'accepted')).toBe(true)
  })
  it('completed 에서는 어떤 전이도 불가', () => {
    expect(canTransition('completed', 'in_progress')).toBe(false)
  })
  it('queued → completed 는 건너뛰기라 불가', () => {
    expect(canTransition('queued', 'completed')).toBe(false)
  })
})

describe('transition', () => {
  it('허용된 전이는 새 객체를 반환한다', () => {
    const r = req({ status: 'queued' })
    const next = transition(r, 'accepted')
    expect(next.status).toBe('accepted')
    expect(r.status).toBe('queued') // 원본 불변
  })
  it('잘못된 전이는 예외', () => {
    expect(() => transition(req({ status: 'completed' }), 'queued')).toThrow()
  })
})

describe('activeRequests', () => {
  it('완료/거절을 제외한다', () => {
    const out = activeRequests([
      req({ id: 'a', status: 'queued' }),
      req({ id: 'b', status: 'completed' }),
      req({ id: 'c', status: 'in_progress' }),
      req({ id: 'd', status: 'declined' }),
    ])
    expect(out.map((r) => r.id)).toEqual(['a', 'c'])
  })
})

describe('prioritize', () => {
  it('우선순위 높은 순, 같으면 먼저 온 순', () => {
    const out = prioritize([
      req({ id: 'a', priority: 'medium', createdAt: '2026-01-01T00:00:00Z' }),
      req({ id: 'b', priority: 'critical', createdAt: '2026-01-03T00:00:00Z' }),
      req({ id: 'c', priority: 'critical', createdAt: '2026-01-02T00:00:00Z' }),
    ])
    expect(out.map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('countByStatus', () => {
  it('상태별로 센다', () => {
    const counts = countByStatus([
      req({ status: 'queued' }),
      req({ status: 'queued' }),
      req({ status: 'completed' }),
    ])
    expect(counts.queued).toBe(2)
    expect(counts.completed).toBe(1)
    expect(counts.declined).toBe(0)
  })
})
