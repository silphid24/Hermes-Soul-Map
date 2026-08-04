import { describe, expect, it } from 'vitest'
import {
  auditLogToEvent,
  buildAuditEvents,
  buildDryRun,
  inferExecutionTarget,
  simulateExecution,
} from './requestExecution'
import type { Agent, InterAgentRequest } from '../types'

const agents: Agent[] = [
  {
    id: 'hermes',
    name: 'Hermes Default',
    kind: 'default',
    status: 'active',
    specialty: '오케스트레이터',
    description: 'routes work',
    trust: 95,
    autonomy: 80,
    emoji: '🪽',
    accent: '#818cf8',
    soul: { identity: 'router', values: ['safety'], tone: 'precise', mood: 'focused', coherence: 92 },
    memory: { longTerm: 10, recentGrowth: 2, lastConsolidated: '2026-08-01T00:00:00Z' },
    skills: [],
    connections: ['claude-code', 'google-workspace', 'n8n'],
  },
  {
    id: 'claude-code',
    name: 'Claude Code Dev Cell',
    kind: 'tool',
    status: 'active',
    specialty: '코딩 셀',
    description: 'code/test/build',
    trust: 88,
    autonomy: 74,
    emoji: '🛠️',
    accent: '#34d399',
    soul: { identity: 'builder', values: ['tests'], tone: 'direct', mood: 'building', coherence: 88 },
    memory: { longTerm: 4, recentGrowth: 1, lastConsolidated: '2026-08-01T00:00:00Z' },
    skills: [],
    connections: ['hermes'],
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace API',
    kind: 'integration',
    status: 'active',
    specialty: '메일/캘린더',
    description: 'workspace ops',
    trust: 82,
    autonomy: 60,
    emoji: '📬',
    accent: '#f59e0b',
    soul: { identity: 'workspace', values: ['approval'], tone: 'formal', mood: 'ready', coherence: 86 },
    memory: { longTerm: 4, recentGrowth: 1, lastConsolidated: '2026-08-01T00:00:00Z' },
    skills: [],
    connections: ['hermes'],
    runbook: { approvalRequired: ['메일 발송'] },
  },
  {
    id: 'n8n',
    name: 'n8n Automation Core',
    kind: 'integration',
    status: 'active',
    specialty: '워크플로 자동화',
    description: 'workflow mutation',
    trust: 79,
    autonomy: 70,
    emoji: '🔁',
    accent: '#ef4444',
    soul: { identity: 'automation', values: ['guardrails'], tone: 'systematic', mood: 'watchful', coherence: 84 },
    memory: { longTerm: 5, recentGrowth: 1, lastConsolidated: '2026-08-01T00:00:00Z' },
    skills: [],
    connections: ['hermes'],
    runbook: { approvalRequired: ['n8n workflow mutation'] },
  },
]

function req(extra: Partial<InterAgentRequest> = {}): InterAgentRequest {
  return {
    id: 'req-1',
    fromAgentId: 'hermes',
    toAgentId: 'claude-code',
    capability: 'code.build.test',
    summary: 'Add tests and build the dashboard',
    status: 'accepted',
    priority: 'high',
    createdAt: '2026-08-04T10:00:00Z',
    ...extra,
  }
}

describe('Request Protocol Execution Layer', () => {
  it('infers execution target/action from request capability and target agent', () => {
    expect(inferExecutionTarget(req({ toAgentId: 'claude-code', capability: 'code.build.test' }), agents)).toMatchObject({
      kind: 'claude-code',
      action: 'code_change',
    })
    expect(inferExecutionTarget(req({ toAgentId: 'n8n', capability: 'workflow.mutate' }), agents)).toMatchObject({
      kind: 'n8n',
      action: 'workflow_mutation',
    })
  })

  it('dry-run previews approval gate for n8n workflow mutation before any execution', () => {
    const plan = buildDryRun(req({ toAgentId: 'n8n', capability: 'workflow.mutate', summary: 'Update n8n production workflow' }), agents)
    expect(plan.mode).toBe('dry_run')
    expect(plan.approvalRequired).toBe(true)
    expect(plan.executableWithoutApproval).toBe(false)
    expect(plan.reasons.join(' ')).toMatch(/approval|승인|workflow/i)
    expect(plan.expectedAudit.status).toBe('approval_required')
  })

  it('allows draft-only workspace work but gates real publishing/sending', () => {
    const draft = buildDryRun(req({ toAgentId: 'google-workspace', capability: 'email.draft', summary: '메일 초안 작성' }), agents)
    expect(draft.target.action).toBe('draft')
    expect(draft.executableWithoutApproval).toBe(true)

    const send = buildDryRun(req({ toAgentId: 'google-workspace', capability: 'email.send', summary: '고객에게 메일 발송' }), agents)
    expect(send.target.action).toBe('publish')
    expect(send.approvalRequired).toBe(true)
    expect(send.executableWithoutApproval).toBe(false)
  })

  it('simulated execution never performs external mutation and records approval blocks', () => {
    const plan = buildDryRun(req({ toAgentId: 'n8n', capability: 'workflow.mutate' }), agents)
    const log = simulateExecution(plan, { approved: false })
    expect(log.mode).toBe('simulated')
    expect(log.status).toBe('blocked')
    expect(log.externalMutationPerformed).toBe(false)
    expect(log.reason).toMatch(/approval/i)
  })

  it('failure and timeout audit logs become risk handoff events for replay/activity', () => {
    const plan = buildDryRun(req({ toAgentId: 'claude-code', capability: 'code.build.test' }), agents)
    const failed = simulateExecution(plan, { approved: true, outcome: 'failure', now: '2026-08-04T10:02:00Z' })
    const timedOut = simulateExecution(plan, { approved: true, outcome: 'timeout', now: '2026-08-04T10:03:00Z' })
    const events = buildAuditEvents([failed, timedOut])
    expect(events).toHaveLength(2)
    expect(events.every((event) => event.type === 'handoff')).toBe(true)
    expect(events.every((event) => event.importance === 'critical')).toBe(true)
    expect(events.map((event) => event.summary).join(' ')).toMatch(/failure|timeout/i)
  })

  it('auditLogToEvent maps target to safe existing event source enum', () => {
    const plan = buildDryRun(req({ toAgentId: 'github', capability: 'github.push', summary: 'GitHub push' }), agents)
    const event = auditLogToEvent(simulateExecution(plan, { approved: false }))
    expect(event.source).toBe('hermes')
    expect(event.summary).toMatch(/GitHub|approval/i)
  })
})
