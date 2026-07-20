import type { InterAgentRequest, RequestStatus } from '../types'

/** 요청 생애주기: 상태별 다음 허용 상태 전이. */
const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  queued: ['accepted', 'declined'],
  accepted: ['in_progress', 'declined'],
  in_progress: ['completed'],
  completed: [],
  declined: [],
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * 요청 상태를 전이한다. 허용되지 않는 전이는 예외를 던진다.
 * (실제 프로토콜 연동 시 이 함수가 유일한 상태 변경 지점이 되도록.)
 */
export function transition(
  request: InterAgentRequest,
  to: RequestStatus,
): InterAgentRequest {
  if (!canTransition(request.status, to)) {
    throw new Error(`잘못된 상태 전이: ${request.status} → ${to}`)
  }
  return { ...request, status: to }
}

/** 아직 처리 중인(완료/거절되지 않은) 요청. */
export function activeRequests(requests: InterAgentRequest[]): InterAgentRequest[] {
  return requests.filter(
    (r) => r.status !== 'completed' && r.status !== 'declined',
  )
}

const PRIORITY_WEIGHT = { critical: 3, high: 2, medium: 1, low: 0 } as const

/** 우선순위 높은 순 → 같으면 오래된 것 먼저(먼저 온 순). */
export function prioritize(requests: InterAgentRequest[]): InterAgentRequest[] {
  return [...requests].sort((a, b) => {
    const w = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
    if (w !== 0) return w
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

/** 상태별 건수 집계. */
export function countByStatus(
  requests: InterAgentRequest[],
): Record<RequestStatus, number> {
  const base: Record<RequestStatus, number> = {
    queued: 0,
    accepted: 0,
    in_progress: 0,
    completed: 0,
    declined: 0,
  }
  for (const r of requests) base[r.status] += 1
  return base
}
