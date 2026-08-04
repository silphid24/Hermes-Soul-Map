import type { Agent, EventSource, Importance, InterAgentRequest, LogEvent } from '../types'

export type ExecutionTargetKind =
  | 'hermes'
  | 'claude-code'
  | 'n8n'
  | 'google-workspace'
  | 'github'
  | 'local'
  | 'manual'

export type ExecutionActionKind =
  | 'observe'
  | 'draft'
  | 'mutate'
  | 'publish'
  | 'code_change'
  | 'destructive'
  | 'workflow_mutation'

export type ExecutionMode = 'dry_run' | 'simulated'
export type ExecutionStatus = 'preview' | 'approved' | 'approval_required' | 'blocked' | 'success' | 'failure' | 'timeout'

export interface ExecutionTarget {
  kind: ExecutionTargetKind
  action: ExecutionActionKind
  agentId: string
  label: string
}

export interface ExecutionAuditLog {
  id: string
  requestId: string
  target: ExecutionTargetKind
  action: ExecutionActionKind
  mode: ExecutionMode
  status: ExecutionStatus
  reason: string
  createdAt: string
  agentId: string
  externalMutationPerformed: false
}

export interface ExecutionDryRun {
  id: string
  requestId: string
  target: ExecutionTarget
  mode: 'dry_run'
  approvalRequired: boolean
  executableWithoutApproval: boolean
  reasons: string[]
  expectedAudit: ExecutionAuditLog
}

const DANGEROUS_ACTIONS = new Set<ExecutionActionKind>([
  'mutate',
  'publish',
  'destructive',
  'workflow_mutation',
])

function textOf(request: InterAgentRequest): string {
  return `${request.capability} ${request.summary}`.toLowerCase()
}

function agentFor(request: InterAgentRequest, agents: Agent[]): Agent | undefined {
  return agents.find((agent) => agent.id === request.toAgentId)
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word))
}

function targetKind(request: InterAgentRequest, agents: Agent[]): ExecutionTargetKind {
  const text = textOf(request)
  const agent = agentFor(request, agents)
  if (hasAny(text, ['github', 'push', 'release'])) return 'github'
  if (hasAny(text, ['rm -rf', 'reset --hard', 'force push', 'delete local', 'destructive'])) return 'local'
  if (request.toAgentId.includes('n8n') || agent?.name.toLowerCase().includes('n8n')) return 'n8n'
  if (request.toAgentId.includes('google') || agent?.name.toLowerCase().includes('google')) return 'google-workspace'
  if (request.toAgentId.includes('claude') || agent?.name.toLowerCase().includes('claude')) return 'claude-code'
  if (request.toAgentId.includes('hermes') || agent?.name.toLowerCase().includes('hermes')) return 'hermes'
  return 'manual'
}

function actionKind(request: InterAgentRequest, kind: ExecutionTargetKind): ExecutionActionKind {
  const text = textOf(request)
  if (hasAny(text, ['rm -rf', 'reset --hard', 'force push', 'destructive', 'delete'])) return 'destructive'
  if (kind === 'n8n' && hasAny(text, ['workflow', 'mutate', 'activate', 'deactivate', 'update'])) return 'workflow_mutation'
  if (kind === 'github' && hasAny(text, ['push', 'release', 'deploy', 'publish'])) return 'publish'
  if (hasAny(text, ['send', '발송', 'publish', 'post', 'external'])) return 'publish'
  if (hasAny(text, ['draft', '초안'])) return 'draft'
  if (kind === 'claude-code' || hasAny(text, ['code', 'build', 'test', 'lint'])) return 'code_change'
  if (hasAny(text, ['write', 'update', 'create', 'mutate'])) return 'mutate'
  return 'observe'
}

function targetLabel(kind: ExecutionTargetKind, action: ExecutionActionKind): string {
  const labels: Record<ExecutionTargetKind, string> = {
    hermes: 'Hermes orchestration',
    'claude-code': 'Claude Code local dev cell',
    n8n: 'n8n automation workflow',
    'google-workspace': 'Google Workspace API',
    github: 'GitHub remote operation',
    local: 'Local filesystem / git operation',
    manual: 'Manual handoff',
  }
  return `${labels[kind]} · ${action}`
}

function runbookApprovalReasons(agent: Agent | undefined): string[] {
  return agent?.runbook?.approvalRequired?.map((item) => `runbook approval gate: ${item}`) ?? []
}

export function inferExecutionTarget(request: InterAgentRequest, agents: Agent[]): ExecutionTarget {
  const kind = targetKind(request, agents)
  const action = actionKind(request, kind)
  return {
    kind,
    action,
    agentId: request.toAgentId,
    label: targetLabel(kind, action),
  }
}

function approvalReasons(request: InterAgentRequest, target: ExecutionTarget, agents: Agent[]): string[] {
  const agent = agentFor(request, agents)
  const reasons: string[] = []
  if (DANGEROUS_ACTIONS.has(target.action)) reasons.push(`approval required for ${target.action}`)
  if (target.kind === 'github') reasons.push('approval required for GitHub push/release')
  if (target.kind === 'n8n' && target.action === 'workflow_mutation') reasons.push('approval required for n8n workflow mutation')
  if (target.kind === 'google-workspace' && target.action === 'publish') reasons.push('approval required for external email/calendar publishing')
  if (target.kind === 'local' && target.action === 'destructive') reasons.push('approval required for destructive local ops')
  // T06 runbook gates are safety constraints for mutation/publish/destructive execution.
  // Draft/observe dry-runs must remain executable so “draft only, no send” stays useful.
  if (DANGEROUS_ACTIONS.has(target.action)) reasons.push(...runbookApprovalReasons(agent))
  return [...new Set(reasons)]
}

function auditId(mode: ExecutionMode, requestId: string, status: ExecutionStatus): string {
  return `exec:${mode}:${requestId}:${status}`
}

export function buildDryRun(request: InterAgentRequest, agents: Agent[], now = request.createdAt): ExecutionDryRun {
  const target = inferExecutionTarget(request, agents)
  const gateReasons = approvalReasons(request, target, agents)
  const approvalRequired = gateReasons.length > 0
  const reasons = approvalRequired
    ? gateReasons
    : [`safe dry-run: ${target.action} can be simulated without external mutation`]
  const status: ExecutionStatus = approvalRequired ? 'approval_required' : 'preview'

  return {
    id: `dry:${request.id}`,
    requestId: request.id,
    target,
    mode: 'dry_run',
    approvalRequired,
    executableWithoutApproval: !approvalRequired,
    reasons,
    expectedAudit: {
      id: auditId('dry_run', request.id, status),
      requestId: request.id,
      target: target.kind,
      action: target.action,
      mode: 'dry_run',
      status,
      reason: reasons.join(' · '),
      createdAt: now,
      agentId: request.toAgentId,
      externalMutationPerformed: false,
    },
  }
}

export function simulateExecution(
  plan: ExecutionDryRun,
  options: { approved?: boolean; outcome?: 'success' | 'failure' | 'timeout'; now?: string } = {},
): ExecutionAuditLog {
  const now = options.now ?? new Date().toISOString()
  if (plan.approvalRequired && !options.approved) {
    return {
      id: auditId('simulated', plan.requestId, 'blocked'),
      requestId: plan.requestId,
      target: plan.target.kind,
      action: plan.target.action,
      mode: 'simulated',
      status: 'blocked',
      reason: `approval blocked: ${plan.reasons.join(' · ')}`,
      createdAt: now,
      agentId: plan.target.agentId,
      externalMutationPerformed: false,
    }
  }

  const status = options.outcome ?? 'success'
  return {
    id: auditId('simulated', plan.requestId, status),
    requestId: plan.requestId,
    target: plan.target.kind,
    action: plan.target.action,
    mode: 'simulated',
    status,
    reason: status === 'success'
      ? `simulated execution complete: ${plan.target.label}`
      : `simulated execution ${status}: ${plan.target.label}`,
    createdAt: now,
    agentId: plan.target.agentId,
    externalMutationPerformed: false,
  }
}

function sourceFor(target: ExecutionTargetKind): EventSource {
  if (target === 'claude-code') return 'claude-code'
  if (target === 'n8n') return 'n8n'
  if (target === 'google-workspace') return 'google-workspace'
  if (target === 'hermes') return 'hermes'
  return 'hermes'
}

function importanceFor(status: ExecutionStatus): Importance {
  if (status === 'failure' || status === 'timeout' || status === 'blocked') return 'critical'
  if (status === 'approval_required') return 'high'
  return 'medium'
}

export function auditLogToEvent(log: ExecutionAuditLog): LogEvent {
  return {
    id: `audit:${log.id}`,
    agentId: log.agentId,
    source: sourceFor(log.target),
    type: 'handoff',
    timestamp: log.createdAt,
    summary: `Request protocol ${log.status}: ${log.target}/${log.action} for ${log.requestId}. ${log.reason}. external mutation performed: false`,
    importance: importanceFor(log.status),
    emotion: log.status === 'success' ? '검증됨' : '주의',
    identityShift: log.status === 'failure' || log.status === 'timeout' || log.status === 'blocked'
      ? 'execution risk surfaced'
      : 'execution protocol audited',
  }
}

export function buildAuditEvents(logs: ExecutionAuditLog[]): LogEvent[] {
  return logs.map(auditLogToEvent)
}
