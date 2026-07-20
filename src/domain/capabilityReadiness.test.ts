import { describe, it, expect } from 'vitest'
import {
  buildCapabilityReadiness,
  CAPABILITY_ORDER,
  type CapabilityKey,
} from './capabilityReadiness'
import type { Agent, InterAgentRequest, LogEvent, Skill } from '../types'

// ─── fixtures ───────────────────────────────────────────────
function skill(id: string, name: string, proficiency = 80): Skill {
  return { id, name, proficiency, acquiredAt: '2026-07-01' }
}

function agent(extra: Partial<Agent> = {}): Agent {
  return {
    id: 'a',
    name: 'Agent',
    kind: 'specialist',
    status: 'active',
    specialty: '',
    description: '',
    trust: 70,
    autonomy: 60,
    emoji: '🤖',
    accent: '#fff',
    soul: { identity: '', values: [], tone: '', mood: '', coherence: 70 },
    memory: { longTerm: 2, recentGrowth: 1, lastConsolidated: '' },
    skills: [],
    connections: [],
    ...extra,
  }
}

function evt(extra: Partial<LogEvent> = {}): LogEvent {
  return {
    id: 'e1',
    agentId: 'a',
    source: 'hermes',
    type: 'action',
    timestamp: '2026-07-16T08:00:00Z',
    summary: '',
    importance: 'medium',
    ...extra,
  }
}

function cellOf(
  matrix: ReturnType<typeof buildCapabilityReadiness>,
  agentId: string,
  capability: CapabilityKey,
) {
  return matrix.cells.find((c) => c.agentId === agentId && c.capability === capability)
}

const NO_EVENTS: LogEvent[] = []
const NO_REQ: InterAgentRequest[] = []

// ─── shape / determinism ────────────────────────────────────
describe('buildCapabilityReadiness — shape', () => {
  it('빈 입력이면 빈 매트릭스', () => {
    const m = buildCapabilityReadiness([], NO_EVENTS, NO_REQ)
    expect(m.agents).toEqual([])
    expect(m.cells).toEqual([])
    expect(m.topReady).toEqual([])
    expect(m.gated).toEqual([])
    expect(m.capabilities).toEqual(CAPABILITY_ORDER)
  })

  it('agent 1개면 capability 수만큼 셀을 만든다 (agent-major)', () => {
    const m = buildCapabilityReadiness([agent()], NO_EVENTS, NO_REQ)
    expect(m.cells).toHaveLength(CAPABILITY_ORDER.length)
    expect(m.agents).toEqual(['a'])
    // 순서: capability 고정 순서
    expect(m.cells.map((c) => c.capability)).toEqual(CAPABILITY_ORDER)
  })

  it('결정론적 — 같은 입력이면 같은 출력', () => {
    const agents = [agent({ id: 'a' }), agent({ id: 'b', name: 'B' })]
    const a = buildCapabilityReadiness(agents, NO_EVENTS, NO_REQ)
    const b = buildCapabilityReadiness(agents, NO_EVENTS, NO_REQ)
    expect(a).toEqual(b)
  })
})

// ─── slice 1: dev/tool → code_build_test ready ──────────────
describe('code_build_test', () => {
  it('스킬/활동/신뢰가 강한 dev tool 은 ready (slice 1)', () => {
    const dev = agent({
      id: 'claude-code',
      name: 'Claude Code',
      kind: 'tool',
      status: 'active',
      specialty: '코드 구현 · 리팩터링 · 테스트 실행',
      description: '개발 실행 셀',
      trust: 88,
      autonomy: 78,
      soul: { identity: '', values: ['TDD', '빌드 통과'], tone: '', mood: '', coherence: 84 },
      skills: [skill('react-ts', 'React/TypeScript', 84), skill('vitest', 'Vitest TDD', 82)],
    })
    const events = [
      evt({ id: 'd1', agentId: 'claude-code', source: 'claude-code', summary: 'npm test passed, lint 0 errors, build passed' }),
    ]
    const m = buildCapabilityReadiness([dev], events, NO_REQ)
    const cell = cellOf(m, 'claude-code', 'code_build_test')
    expect(cell?.status).toBe('ready')
    expect(cell!.score).toBeGreaterThanOrEqual(68)
    expect(m.topReady.some((c) => c.agentId === 'claude-code' && c.capability === 'code_build_test')).toBe(true)
  })

  it("코드 신호가 없는 에이전트의 code_build_test 는 idle (slice 5)", () => {
    const pm = agent({
      id: 'izera365',
      specialty: 'M365 PM 비서',
      description: 'Outlook/Teams 업무',
      skills: [skill('m365', 'Microsoft 365')],
    })
    const m = buildCapabilityReadiness([pm], NO_EVENTS, NO_REQ)
    expect(cellOf(m, 'izera365', 'code_build_test')?.status).toBe('idle')
  })

  it("'0 errors' clean 신호는 risk 로 오탐하지 않는다", () => {
    const dev = agent({
      id: 'claude-code',
      kind: 'tool',
      skills: [skill('vitest', 'Vitest TDD', 82)],
      description: '코드 개발 셀',
    })
    const events = [evt({ id: 'd1', agentId: 'claude-code', source: 'claude-code', summary: 'build passed, lint 0 errors' })]
    const m = buildCapabilityReadiness([dev], events, NO_REQ)
    const cell = cellOf(m, 'claude-code', 'code_build_test')
    expect(cell?.status).not.toBe('blocked')
  })
})

// ─── slice 2: integration → external_send approval_gated ────
describe('external_send governance gate', () => {
  it('Gmail 발송 능력이 있으면 approval_gated (slice 2)', () => {
    const gw = agent({
      id: 'google-workspace',
      name: 'Google Workspace',
      kind: 'integration',
      trust: 95,
      autonomy: 90,
      specialty: 'Gmail · Calendar · Drive',
      description: '메일 발송 전 승인',
      soul: { identity: '', values: ['발송 전 승인'], tone: '', mood: '', coherence: 90 },
      skills: [skill('gmail', 'Gmail/Drive/Sheets API', 90)],
    })
    const m = buildCapabilityReadiness([gw], NO_EVENTS, NO_REQ)
    const cell = cellOf(m, 'google-workspace', 'external_send')
    expect(cell?.status).toBe('approval_gated')
    expect(m.gated.some((c) => c.agentId === 'google-workspace')).toBe(true)
  })

  it('높은 trust/autonomy 라도 external_send 는 ready 로 승격되지 않는다 (slice 2)', () => {
    const gw = agent({
      id: 'google-workspace',
      trust: 100,
      autonomy: 100,
      skills: [skill('gmail', 'Gmail send', 100)],
      description: '발송',
    })
    const cell = cellOf(buildCapabilityReadiness([gw], NO_EVENTS, NO_REQ), 'google-workspace', 'external_send')
    expect(cell?.status).toBe('approval_gated')
    expect(cell?.status).not.toBe('ready')
  })

  it('n8n workflow activate/mutation 은 external_send approval_gated (slice 2)', () => {
    const n8n = agent({
      id: 'n8n-mcp',
      kind: 'integration',
      skills: [skill('local-n8n', 'local n8n automation', 75)],
    })
    const events = [
      evt({ id: 'n1', agentId: 'n8n-mcp', source: 'n8n', type: 'decision', summary: 'production mutation 성격의 workflow activate/deactivate 는 승인 필요' }),
    ]
    const cell = cellOf(buildCapabilityReadiness([n8n], events, NO_REQ), 'n8n-mcp', 'external_send')
    expect(cell?.status).toBe('approval_gated')
  })

  it('외부 발송 신호가 전혀 없는 에이전트의 external_send 는 idle', () => {
    const doc = agent({
      id: 'doc-auto-agent',
      specialty: '회의록 자동화',
      description: '회의록 원문 보존, Notion 업로드, monday.com 읽기 전용 점검',
      skills: [skill('meeting-minutes', '회의록 자동 작성', 88)],
    })
    const cell = cellOf(buildCapabilityReadiness([doc], NO_EVENTS, NO_REQ), 'doc-auto-agent', 'external_send')
    expect(cell?.status).toBe('idle')
  })
})

// ─── slice 3: specialist → document_minutes ─────────────────
describe('document_minutes', () => {
  it('회의록/문서 자동화 에이전트는 ready 또는 partial (slice 3)', () => {
    const doc = agent({
      id: 'doc-auto-agent',
      name: 'Doc Auto Agent',
      status: 'active',
      trust: 88,
      autonomy: 82,
      specialty: '회의록/문서/monday 자동화',
      description: 'Google Drive 회의 폴더 감시, 회의록 생성, Notion 업로드',
      skills: [skill('meeting-minutes', '회의록 자동 작성', 88), skill('notion-upload', 'Notion 업로드 관리', 82)],
    })
    const events = [
      evt({ id: 'm1', agentId: 'doc-auto-agent', source: 'cron', summary: '회의록 생성 및 Notion 업로드 파이프라인 운영' }),
    ]
    const cell = cellOf(buildCapabilityReadiness([doc], events, NO_REQ), 'doc-auto-agent', 'document_minutes')
    expect(['ready', 'partial']).toContain(cell?.status)
  })
})

// ─── slice: automation_cron / n8n ───────────────────────────
describe('automation_cron', () => {
  it('cron/n8n 자동화 신호가 있으면 ready 또는 partial', () => {
    const n8n = agent({
      id: 'n8n-mcp',
      kind: 'integration',
      trust: 72,
      autonomy: 64,
      specialty: 'n8n MCP workflow 실행',
      description: '자동화 spine, workflow 로그',
      skills: [skill('local-n8n', 'local n8n automation', 75), skill('mcp', 'MCP workflow tools', 70)],
    })
    const events = [evt({ id: 'x1', agentId: 'n8n-mcp', source: 'n8n', summary: 'workflow 검색 및 실행 로그 확인' })]
    const cell = cellOf(buildCapabilityReadiness([n8n], events, NO_REQ), 'n8n-mcp', 'automation_cron')
    expect(['ready', 'partial']).toContain(cell?.status)
  })

  it('cron source 이벤트만으로도 automation 활동으로 인정한다', () => {
    const a = agent({ id: 'izera365', skills: [], description: 'M365 PM' })
    const events = [evt({ id: 'c1', agentId: 'izera365', source: 'cron', summary: '정례 상태 확인' })]
    const cell = cellOf(buildCapabilityReadiness([a], events, NO_REQ), 'izera365', 'automation_cron')
    expect(cell?.status).not.toBe('idle')
  })
})

// ─── slice: workspace_ops / integration ─────────────────────
describe('workspace_ops', () => {
  it('Drive/Sheets/Calendar 스킬이 있으면 workspace_ops 활성', () => {
    const gw = agent({
      id: 'google-workspace',
      kind: 'integration',
      specialty: 'Gmail · Calendar · Drive · Sheets · Docs',
      description: 'Drive/Sheets/Docs/Calendar OAuth 연결',
      skills: [skill('gmail', 'Gmail/Drive/Sheets API', 85), skill('calendar', 'Calendar integration', 78)],
    })
    const cell = cellOf(buildCapabilityReadiness([gw], NO_EVENTS, NO_REQ), 'google-workspace', 'workspace_ops')
    expect(cell?.status).not.toBe('idle')
    expect(['ready', 'partial']).toContain(cell?.status)
  })
})

// ─── slice 4: risk / status damping ─────────────────────────
describe('risk / status damping', () => {
  it('dormant 상태면 강한 스킬이어도 ready 가 아니라 blocked (slice 4)', () => {
    const dev = agent({
      id: 'claude-code',
      kind: 'tool',
      status: 'dormant',
      trust: 90,
      autonomy: 85,
      description: '코드 개발 셀',
      skills: [skill('react-ts', 'React/TypeScript', 90), skill('vitest', 'Vitest TDD', 88)],
    })
    const events = [evt({ id: 'd1', agentId: 'claude-code', source: 'claude-code', summary: 'build passed test passed' })]
    const cell = cellOf(buildCapabilityReadiness([dev], events, NO_REQ), 'claude-code', 'code_build_test')
    expect(cell?.status).toBe('blocked')
    expect(cell?.status).not.toBe('ready')
  })

  it('planned 상태면 blocked (slice 4)', () => {
    const future = agent({
      id: 'social-media',
      status: 'planned',
      description: '소셜 게시 준비',
      skills: [skill('social-monitoring', 'Social monitoring', 62)],
    })
    const cell = cellOf(buildCapabilityReadiness([future], NO_EVENTS, NO_REQ), 'social-media', 'observe_logs')
    expect(cell?.status).toBe('blocked')
  })

  it('해당 능력 이벤트에 timeout/fail/error 가 있으면 blocked (slice 4)', () => {
    const doc = agent({
      id: 'izera365',
      status: 'active',
      trust: 86,
      autonomy: 70,
      description: 'M365 PM, 정례 확인 스크립트',
      skills: [skill('doc-bridge', 'Doc Auto bridge', 65)],
    })
    const events = [
      evt({ id: 'r1', agentId: 'izera365', source: 'cron', summary: '정례 확인 요청 실행했으나 최근 timeout 기록 있음' }),
    ]
    const cell = cellOf(buildCapabilityReadiness([doc], events, NO_REQ), 'izera365', 'automation_cron')
    expect(cell?.status).toBe('blocked')
    expect(cell?.reasons.join(' ')).toMatch(/risk|timeout|리스크/i)
  })

  it('external_send 는 risk 보다 governance gate 가 우선한다', () => {
    const gw = agent({
      id: 'google-workspace',
      skills: [skill('gmail', 'Gmail send', 90)],
      description: '발송',
    })
    const events = [evt({ id: 'g1', agentId: 'google-workspace', source: 'google-workspace', summary: '발송 시도 중 error 발생' })]
    const cell = cellOf(buildCapabilityReadiness([gw], events, NO_REQ), 'google-workspace', 'external_send')
    expect(cell?.status).toBe('approval_gated')
  })
})

// ─── agent-class variety on seed ────────────────────────────
describe('seed variety', () => {
  it('seed 전체에서 5개 status 가 모두 관측된다', async () => {
    const { seed } = await import('../data/seed')
    const m = buildCapabilityReadiness(seed.agents, seed.events, seed.requests)
    const statuses = new Set(m.cells.map((c) => c.status))
    expect(statuses).toContain('ready')
    expect(statuses).toContain('partial')
    expect(statuses).toContain('idle')
    expect(statuses).toContain('approval_gated')
    expect(statuses).toContain('blocked')
  })

  it('seed 에서 서로 다른 agent class 가 서로 다른 readiness 프로필을 만든다', async () => {
    const { seed } = await import('../data/seed')
    const m = buildCapabilityReadiness(seed.agents, seed.events, seed.requests)
    const profile = (id: string) =>
      CAPABILITY_ORDER.map((cap) => cellOf(m, id, cap)?.status).join('|')
    expect(profile('claude-code')).not.toBe(profile('doc-auto-agent'))
    expect(profile('google-workspace')).not.toBe(profile('claude-code'))
  })

  it('seed 의 외부 발송 후보들은 external_send 가 approval_gated 다', async () => {
    const { seed } = await import('../data/seed')
    const m = buildCapabilityReadiness(seed.agents, seed.events, seed.requests)
    expect(cellOf(m, 'google-workspace', 'external_send')?.status).toBe('approval_gated')
    expect(cellOf(m, 'n8n-mcp', 'external_send')?.status).toBe('approval_gated')
  })
})
