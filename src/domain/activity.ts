import type { Agent, InterAgentRequest, LogEvent } from '../types'

export type AgentActivityStatus = 'active' | 'quiet' | 'warning' | 'idle'

export interface AgentActivitySummary {
  status: AgentActivityStatus
  lastActivityAt: string
  recentEventCount: number
  changedFiles: string[]
  validationSignals: string[]
  operationSignals: string[]
  riskSignals: string[]
  latestSummaries: string[]
}

const FILE_PATTERN = /(?:\.claude|\.codex|src|docs|examples|dist)\/[\w./-]+|README\.md|plan\.md|task\.md|package(?:-lock)?\.json|tsconfig(?:\.app|\.node)?\.json|vite\.config\.ts|vitest\.config\.ts/g

function byNewest(a: LogEvent, b: LogEvent): number {
  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function matchingEvents(agent: Agent, events: LogEvent[]): LogEvent[] {
  return events
    .filter((event) => event.agentId === agent.id || event.source === agent.id)
    .sort(byNewest)
}

function extractChangedFiles(events: LogEvent[]): string[] {
  return uniqueSorted(events.flatMap((event) => event.summary.match(FILE_PATTERN) ?? []))
}

function extractValidationSignals(events: LogEvent[]): string[] {
  const text = events.map((event) => event.summary.toLowerCase()).join('\n')
  const signals: string[] = []
  if (/test[^\n]*(passed|pass)|passed[^\n]*test/.test(text)) signals.push('test passed')
  if (/lint[^\n]*(0 errors|clean|passed|pass)/.test(text)) signals.push('lint clean')
  if (/build[^\n]*(passed|pass|built|success)|✓ built/.test(text)) signals.push('build passed')
  return signals
}

function extractOperationSignals(events: LogEvent[]): string[] {
  const signals: string[] = []
  if (events.some((event) => event.source === 'cron')) signals.push('cron activity')
  if (events.some((event) => event.type === 'handoff')) signals.push('handoff routed')
  if (events.some((event) => event.type === 'memory')) signals.push('memory updated')
  if (events.some((event) => event.type === 'skill')) signals.push('skill signal')
  if (events.some((event) => event.type === 'decision')) signals.push('decision logged')
  if (events.some((event) => event.importance === 'critical' || event.importance === 'high')) signals.push('high importance')
  return signals
}

function extractRiskSignals(events: LogEvent[]): string[] {
  const text = events.map((event) => event.summary.toLowerCase()).join('\n')
  const signals: string[] = []
  if (text.includes('timeout') || text.includes('timed out')) signals.push('timeout detected')
  const textWithoutCleanLint = text.replace(/0 errors/g, '')
  if (/fail|failed|error/.test(textWithoutCleanLint)) signals.push('failure/error mentioned')
  if (text.includes('changes_requested')) signals.push('changes requested')
  return signals
}

function activityStatus(
  eventCount: number,
  riskSignals: string[],
  validationSignals: string[],
  operationSignals: string[],
): AgentActivityStatus {
  if (eventCount === 0) return 'idle'
  if (riskSignals.length > 0) return 'warning'
  if (validationSignals.length > 0 || operationSignals.length > 0 || eventCount >= 3) return 'active'
  return 'quiet'
}

export function requestActivityEvents(requests: InterAgentRequest[]): LogEvent[] {
  return requests.flatMap((request) => {
    const base = {
      source: 'hermes' as const,
      type: 'handoff' as const,
      timestamp: request.createdAt,
      importance: request.priority,
    }
    const summary = `Inter-agent request ${request.status}: ${request.fromAgentId} → ${request.toAgentId} / ${request.capability}. ${request.summary}`
    return [
      {
        ...base,
        id: `request:${request.id}:from`,
        agentId: request.fromAgentId,
        summary,
        identityShift: `위임 요청 상태 ${request.status}`,
      },
      {
        ...base,
        id: `request:${request.id}:to`,
        agentId: request.toAgentId,
        summary,
        identityShift: `수신 요청 상태 ${request.status}`,
      },
    ]
  })
}

export function summarizeAgentActivity(agent: Agent, events: LogEvent[]): AgentActivitySummary {
  const recent = matchingEvents(agent, events)
  const validationSignals = extractValidationSignals(recent)
  const operationSignals = extractOperationSignals(recent)
  const riskSignals = extractRiskSignals(recent)

  return {
    status: activityStatus(recent.length, riskSignals, validationSignals, operationSignals),
    lastActivityAt: recent[0]?.timestamp ?? '',
    recentEventCount: recent.length,
    changedFiles: extractChangedFiles(recent),
    validationSignals,
    operationSignals,
    riskSignals,
    latestSummaries: recent.slice(0, 3).map((event) => event.summary),
  }
}
