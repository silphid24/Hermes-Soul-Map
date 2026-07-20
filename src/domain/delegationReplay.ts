// Delegation Graph Replay — 에이전트 간 위임/요청 흐름을 시간순 리플레이로 파생한다.
//
// 순수 함수. 새 스키마/백엔드 없이 기존 agents/events/requests 를 조합만 한다.
// 리스크 파싱 규칙은 `agent-activity-blackbox` KB(activity.ts)와 일관되게 유지한다.

import type { Agent, Importance, InterAgentRequest, LogEvent, RequestStatus } from '../types'
import { activeRequests } from './requests'

export type DelegationStepKind = 'request' | 'handoff' | 'completion' | 'risk' | 'signal'
export type ReplayStatus = 'idle' | 'flowing' | 'blocked' | 'complete'

export interface DelegationStep {
  id: string
  /** ISO 8601 */
  timestamp: string
  kind: DelegationStepKind
  sourceAgentId: string
  sourceName: string
  targetAgentId?: string
  targetName?: string
  /** 짧은 라벨 */
  title: string
  /** 한 줄 설명 */
  summary: string
  importance: Importance
  /** 요청에서 파생된 스텝일 때만 */
  status?: RequestStatus
  risk: boolean
}

export interface DelegationEdge {
  from: string
  to: string
  fromName: string
  toName: string
  /** 이 방향으로 관측된 스텝 수 */
  count: number
  /** 가장 최근 스텝 시각 */
  lastTimestamp: string
  /** 간선 위 리스크 스텝 존재 여부 */
  hasRisk: boolean
}

export interface DelegationReplay {
  /** 오래된 → 최신 */
  steps: DelegationStep[]
  edges: DelegationEdge[]
  status: ReplayStatus
  riskCount: number
  /** 가장 최근 target 있는 스텝의 방향 */
  latestPath?: { from: string; to: string; fromName: string; toName: string }
}

// timeout / 실패 / 에러 / 리뷰 반려를 리스크로 본다. 'fail'은 'failed'를 포함한다.
const RISK_KEYWORDS = ['timeout', 'timed out', 'fail', 'error', 'changes_requested']

/**
 * 리스크 키워드 감지. 대소문자 무관.
 * 'lint 0 errors' 같은 clean 신호가 'error' 오탐이 되지 않도록 먼저 제거한다.
 * 주의: 부분일치라 'terror' 같은 단어도 걸릴 수 있으나 현재 도메인 데이터엔 없다
 * (activity.ts / agent-activity-blackbox KB와 동일한 한계).
 */
function detectRisk(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/0 errors/g, '')
  return RISK_KEYWORDS.some((keyword) => cleaned.includes(keyword))
}

function toTime(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

function requestKind(status: RequestStatus): DelegationStepKind {
  if (status === 'completed') return 'completion'
  if (status === 'declined') return 'risk'
  return 'request'
}

/** agents 배열 순서로 summary(소문자)에 id/name이 부분일치하는 첫 에이전트. 자기 자신 제외. */
function inferTarget(sourceId: string, summary: string, agents: Agent[]): Agent | undefined {
  const haystack = summary.toLowerCase()
  return agents.find(
    (a) =>
      a.id !== sourceId &&
      (haystack.includes(a.id.toLowerCase()) || haystack.includes(a.name.toLowerCase())),
  )
}

export function buildDelegationReplay(
  agents: Agent[],
  events: LogEvent[],
  requests: InterAgentRequest[],
): DelegationReplay {
  const nameOf = (id: string): string => agents.find((a) => a.id === id)?.name ?? id

  const steps: DelegationStep[] = []

  // 1) 요청 → 스텝
  for (const request of requests) {
    const risk = request.status === 'declined'
    steps.push({
      id: `req:${request.id}`,
      timestamp: request.createdAt,
      kind: requestKind(request.status),
      sourceAgentId: request.fromAgentId,
      sourceName: nameOf(request.fromAgentId),
      targetAgentId: request.toAgentId,
      targetName: nameOf(request.toAgentId),
      title: request.capability,
      summary: request.summary,
      importance: request.priority,
      status: request.status,
      risk,
    })
  }

  // 2) handoff 이벤트 → 스텝 (다른 type은 제외)
  for (const event of events) {
    if (event.type !== 'handoff') continue
    const risk = detectRisk(event.summary)
    const target = inferTarget(event.agentId, event.summary, agents)
    const kind: DelegationStepKind = risk ? 'risk' : target ? 'handoff' : 'signal'
    steps.push({
      id: `evt:${event.id}`,
      timestamp: event.timestamp,
      kind,
      sourceAgentId: event.agentId,
      sourceName: nameOf(event.agentId),
      targetAgentId: target?.id,
      targetName: target?.name,
      title: '위임',
      summary: event.summary,
      importance: event.importance,
      risk,
    })
  }

  // 시간순 정렬 (동률이면 id 사전순 → 결정론)
  steps.sort((a, b) => {
    const dt = toTime(a.timestamp) - toTime(b.timestamp)
    if (dt !== 0) return dt
    return a.id.localeCompare(b.id)
  })

  const riskCount = steps.filter((s) => s.risk).length

  // 간선 집계 (target 있는 스텝만)
  const edgeMap = new Map<string, DelegationEdge>()
  for (const step of steps) {
    if (!step.targetAgentId) continue
    const key = `${step.sourceAgentId}→${step.targetAgentId}`
    const existing = edgeMap.get(key)
    if (existing) {
      existing.count += 1
      if (toTime(step.timestamp) >= toTime(existing.lastTimestamp)) {
        existing.lastTimestamp = step.timestamp
      }
      existing.hasRisk = existing.hasRisk || step.risk
    } else {
      edgeMap.set(key, {
        from: step.sourceAgentId,
        to: step.targetAgentId,
        fromName: step.sourceName,
        toName: step.targetName ?? step.targetAgentId,
        count: 1,
        lastTimestamp: step.timestamp,
        hasRisk: step.risk,
      })
    }
  }

  const edges = [...edgeMap.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    const dt = toTime(b.lastTimestamp) - toTime(a.lastTimestamp)
    if (dt !== 0) return dt
    return `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`)
  })

  // 최근 위임 경로: target 있는 스텝 중 가장 마지막(steps는 이미 결정론적 정렬)
  let latestPath: DelegationReplay['latestPath']
  for (const step of steps) {
    if (step.targetAgentId) {
      latestPath = {
        from: step.sourceAgentId,
        to: step.targetAgentId,
        fromName: step.sourceName,
        toName: step.targetName ?? step.targetAgentId,
      }
    }
  }

  // 상태 판정 (우선순위 순서 중요: idle → blocked → flowing → complete)
  let status: ReplayStatus
  if (steps.length === 0) status = 'idle'
  else if (riskCount > 0) status = 'blocked'
  else if (activeRequests(requests).length > 0) status = 'flowing'
  else status = 'complete'

  return { steps, edges, status, riskCount, latestPath }
}
