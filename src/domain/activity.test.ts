import { describe, expect, it } from 'vitest'
import { requestActivityEvents, summarizeAgentActivity } from './activity'
import type { Agent, InterAgentRequest, LogEvent } from '../types'

const claude: Agent = {
  id: 'claude-code',
  name: 'Claude Code',
  kind: 'tool',
  status: 'active',
  specialty: '개발',
  description: '',
  trust: 90,
  autonomy: 80,
  emoji: '⌨️',
  accent: '#f0883e',
  soul: { identity: '나는 만든다.', values: [], tone: 'technical', mood: 'focused', coherence: 88 },
  memory: { longTerm: 4, recentGrowth: 1, lastConsolidated: '2026-07-16T00:00:00+09:00' },
  skills: [],
  connections: [],
}

const events: LogEvent[] = [
  {
    id: 'older',
    agentId: 'claude-code',
    source: 'claude-code',
    type: 'action',
    timestamp: '2026-07-16T01:00:00+09:00',
    summary: 'Write src/data/hermesExport.ts and README.md',
    importance: 'medium',
  },
  {
    id: 'newer',
    agentId: 'claude-code',
    source: 'claude-code',
    type: 'action',
    timestamp: '2026-07-16T02:00:00+09:00',
    summary: 'npm test passed, npm run lint 0 errors, build passed',
    importance: 'high',
  },
  {
    id: 'risk',
    agentId: 'claude-code',
    source: 'claude-code',
    type: 'action',
    timestamp: '2026-07-16T01:30:00+09:00',
    summary: 'Claude Code command timeout while editing .claude/workspace/live-export-v2/design.md',
    importance: 'medium',
  },
  {
    id: 'other',
    agentId: 'default',
    source: 'hermes',
    type: 'message',
    timestamp: '2026-07-16T03:00:00+09:00',
    summary: '다른 에이전트 이벤트',
    importance: 'low',
  },
]

describe('summarizeAgentActivity', () => {
  it('summarizes recent events latest first for one agent', () => {
    const summary = summarizeAgentActivity(claude, events)
    expect(summary.status).toBe('warning')
    expect(summary.recentEventCount).toBe(3)
    expect(summary.lastActivityAt).toBe('2026-07-16T02:00:00+09:00')
    expect(summary.latestSummaries[0]).toContain('npm test passed')
  })

  it('extracts changed files from activity summaries', () => {
    const summary = summarizeAgentActivity(claude, events)
    expect(summary.changedFiles).toEqual([
      '.claude/workspace/live-export-v2/design.md',
      'README.md',
      'src/data/hermesExport.ts',
    ])
  })

  it('extracts validation and risk signals', () => {
    const summary = summarizeAgentActivity(claude, events)
    expect(summary.validationSignals).toEqual(['test passed', 'lint clean', 'build passed'])
    expect(summary.riskSignals).toEqual(['timeout detected'])
  })

  it('extracts non-dev operation signals for other agent types', () => {
    const docAgent = { ...claude, id: 'doc-auto-agent', name: 'Doc Auto Agent' }
    const summary = summarizeAgentActivity(docAgent, [
      {
        id: 'doc-cron',
        agentId: 'doc-auto-agent',
        source: 'cron',
        type: 'action',
        timestamp: '2026-07-16T04:00:00+09:00',
        summary: 'Google Drive 회의 폴더 감시 cron 실행, Notion 업로드 완료',
        importance: 'high',
      },
      {
        id: 'doc-memory',
        agentId: 'doc-auto-agent',
        source: 'hermes',
        type: 'memory',
        timestamp: '2026-07-16T03:00:00+09:00',
        summary: '새 회의록 처리 규칙 memory 업데이트',
        importance: 'medium',
      },
    ])
    expect(summary.status).toBe('active')
    expect(summary.operationSignals).toEqual(['cron activity', 'memory updated', 'high importance'])
  })

  it('converts live request queue changes into blackbox activity events for both agents', () => {
    const requests: InterAgentRequest[] = [
      {
        id: 'local-1',
        fromAgentId: 'hermes-default',
        toAgentId: 'claude-code',
        capability: 'code_build_test',
        summary: 'Capability Readiness Matrix UI 보강 요청',
        status: 'in_progress',
        priority: 'high',
        createdAt: '2026-07-19T09:00:00+09:00',
      },
    ]

    const generated = requestActivityEvents(requests)
    expect(generated).toHaveLength(2)
    expect(generated.map((event) => event.agentId)).toEqual(['hermes-default', 'claude-code'])

    const summary = summarizeAgentActivity(claude, [...events, ...generated])
    expect(summary.lastActivityAt).toBe('2026-07-19T09:00:00+09:00')
    expect(summary.latestSummaries[0]).toContain('in_progress')
    expect(summary.operationSignals).toContain('handoff routed')
    expect(summary.operationSignals).toContain('high importance')
  })

  it('returns idle summary when there are no matching events', () => {
    const summary = summarizeAgentActivity({ ...claude, id: 'codex' }, events)
    expect(summary.status).toBe('idle')
    expect(summary.recentEventCount).toBe(0)
    expect(summary.changedFiles).toEqual([])
    expect(summary.operationSignals).toEqual([])
    expect(summary.latestSummaries).toEqual([])
  })
})
