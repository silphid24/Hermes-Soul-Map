import { describe, it, expect } from 'vitest'
import {
  buildAgentRunbook,
  buildRunbooks,
  RUNBOOK_SECTIONS,
  type AgentRunbook,
  type RunbookItem,
} from './runbook'
import { seed } from '../data/seed'
import type { Agent, InterAgentRequest, LogEvent, RunbookOverride, Skill } from '../types'

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
    trust: 88,
    autonomy: 76,
    emoji: '🤖',
    accent: '#fff',
    soul: { identity: '', values: [], tone: '', mood: '', coherence: 85 },
    memory: { longTerm: 4, recentGrowth: 2, lastConsolidated: '2026-07-16T00:00:00Z' },
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

const NO_EVENTS: LogEvent[] = []
const NO_REQ: InterAgentRequest[] = []

function labels(items: RunbookItem[]): string {
  return items.map((item) => item.label).join(' | ')
}

function one(a: Agent, events: LogEvent[] = NO_EVENTS, requests: InterAgentRequest[] = NO_REQ): AgentRunbook {
  return buildAgentRunbook(a, events, requests)
}

// ─── shape / determinism ────────────────────────────────────
describe('buildRunbooks — shape', () => {
  it('빈 입력이면 빈 배열이고 throw 하지 않는다', () => {
    expect(buildRunbooks([], NO_EVENTS, NO_REQ)).toEqual([])
  })

  it('에이전트마다 하나의 runbook을 만들고 7개 섹션을 모두 가진다', () => {
    const books = buildRunbooks([agent({ id: 'a' }), agent({ id: 'b', name: 'B' })], NO_EVENTS, NO_REQ)
    expect(books).toHaveLength(2)
    expect(books.map((b) => b.agentId)).toEqual(['a', 'b'])
    for (const book of books) {
      for (const section of RUNBOOK_SECTIONS) {
        expect(Array.isArray(book[section.key])).toBe(true)
      }
    }
  })

  it('RUNBOOK_SECTIONS는 7개 섹션을 정의한다', () => {
    expect(RUNBOOK_SECTIONS.map((s) => s.key)).toEqual([
      'delegateWhen',
      'allowedActions',
      'approvalRequired',
      'forbiddenActions',
      'constraints',
      'verification',
      'stopConditions',
    ])
  })

  it('모든 항목은 파생 근거(evidence)를 가진다', () => {
    const book = one(
      agent({ specialty: 'Gmail/Drive 문서 운영', skills: [skill('gmail', 'Gmail API')] }),
      [evt({ summary: '메일 초안 작성, Drive 문서 정리' })],
    )
    const all = RUNBOOK_SECTIONS.flatMap((s) => book[s.key])
    expect(all.length).toBeGreaterThan(0)
    for (const item of all) {
      expect(item.evidence.trim().length).toBeGreaterThan(0)
      expect(item.id.trim().length).toBeGreaterThan(0)
    }
  })
})

// ─── approval gates (핵심 안전 규칙) ─────────────────────────
describe('buildRunbooks — 승인 게이트', () => {
  it('메일 신호가 있으면 메일 발송을 승인 게이트로 표시한다', () => {
    const book = one(agent({ specialty: 'Gmail · Calendar · Drive', skills: [skill('gmail', 'Gmail API')] }))
    expect(labels(book.approvalRequired)).toContain('메일 발송')
  })

  it('n8n/workflow 신호가 있으면 workflow mutation을 승인 게이트로 표시한다', () => {
    const book = one(agent({ specialty: 'n8n MCP workflow 실행', skills: [skill('n8n', 'local n8n automation')] }))
    expect(labels(book.approvalRequired)).toContain('n8n workflow')
  })

  it('코드 능력이 있으면 GitHub push/release와 destructive local ops를 승인 게이트로 표시한다', () => {
    const book = one(
      agent({
        id: 'dev',
        specialty: '코드 구현 · 테스트 실행',
        skills: [skill('react-ts', 'React/TypeScript')],
      }),
      [evt({ agentId: 'dev', source: 'claude-code', summary: 'src/App.tsx 수정, npm test passed' })],
    )
    const gates = labels(book.approvalRequired)
    expect(gates).toContain('GitHub push')
    expect(gates).toContain('destructive local ops')
  })

  it('소셜 게시 신호가 있으면 외부 게시를 승인 게이트로 표시한다', () => {
    const book = one(agent({ specialty: '소셜 미디어 게시', skills: [skill('xurl', 'X/Twitter via xurl')] }))
    expect(labels(book.approvalRequired)).toContain('외부 게시')
  })

  it('integration kind는 production 데이터 쓰기를 승인 게이트로 표시한다', () => {
    const book = one(agent({ kind: 'integration', specialty: 'Drive/Sheets 연동' }))
    expect(labels(book.approvalRequired)).toContain('production 데이터 쓰기')
  })

  it('브리핑만 하는 에이전트에는 메일/푸시 게이트를 만들지 않는다 (오탐 방지)', () => {
    const book = one(
      agent({ id: 'radar', specialty: '매일 AI 뉴스 브리핑', skills: [skill('research', 'AI trend research')] }),
      [evt({ agentId: 'radar', summary: '오늘의 AI 트렌드 브리핑 준비' })],
    )
    const gates = labels(book.approvalRequired)
    expect(gates).not.toContain('메일 발송')
    expect(gates).not.toContain('GitHub push')
    expect(gates).not.toContain('destructive local ops')
  })

  it('승인 게이트 대상 능력은 allowedActions에 중복 노출하지 않는다', () => {
    const book = one(
      agent({ specialty: '소셜 미디어 게시/발송', skills: [skill('xurl', 'X/Twitter via xurl')] }),
      [evt({ summary: '소셜 게시 준비' })],
    )
    expect(labels(book.allowedActions)).not.toContain('External Send')
  })

  it('승인 게이트가 있으면 승인 없는 자동 실행을 금지 항목으로 남긴다', () => {
    const book = one(agent({ specialty: 'Gmail 메일 운영' }))
    expect(labels(book.forbiddenActions)).toContain('승인 없는 자동 실행 금지')
  })
})

// ─── delegate / allowed ─────────────────────────────────────
describe('buildRunbooks — 위임/허용', () => {
  it('readiness ready 능력은 추천 위임 상황과 허용 행동에 나타난다', () => {
    const book = one(
      agent({
        id: 'dev',
        trust: 92,
        autonomy: 84,
        specialty: '코드 구현 · 빌드 · 테스트',
        skills: [skill('react-ts', 'React/TypeScript', 90), skill('vitest', 'Vitest 테스트', 88)],
      }),
      [
        evt({ id: 'x1', agentId: 'dev', source: 'claude-code', summary: 'npm test passed, build passed' }),
        evt({ id: 'x2', agentId: 'dev', source: 'claude-code', summary: 'src/App.tsx 리팩터' }),
      ],
    )
    expect(labels(book.delegateWhen)).toContain('Code / Build / Test')
    expect(labels(book.allowedActions)).toContain('Code / Build / Test')
  })

  it('수신 요청이 있으면 정례 위임 상황으로 표시한다', () => {
    const requests: InterAgentRequest[] = [
      {
        id: 'r1',
        fromAgentId: 'boss',
        toAgentId: 'a',
        capability: 'meetingdocs.monday_brief',
        summary: '정례 확인',
        status: 'in_progress',
        priority: 'high',
        createdAt: '2026-07-10T09:00:00Z',
      },
    ]
    const book = one(agent({ specialty: '회의록 자동 작성' }), NO_EVENTS, requests)
    expect(labels(book.delegateWhen)).toContain('meetingdocs.monday_brief')
  })
})

// ─── forbidden ──────────────────────────────────────────────
describe('buildRunbooks — 금지', () => {
  it('읽기 전용 신호가 있으면 쓰기/변경 금지를 명시한다', () => {
    const book = one(agent({ soul: { identity: '', values: ['monday.com 읽기 전용 점검'], tone: '', mood: '', coherence: 85 } }))
    expect(labels(book.forbiddenActions)).toContain('쓰기·변경 금지')
  })

  it('계정/맥락 경계 신호가 있으면 경계 초과를 금지한다', () => {
    const book = one(agent({ soul: { identity: '', values: ['업무/개인 분리', '회사 계정 격리'], tone: '', mood: '', coherence: 85 } }))
    expect(labels(book.forbiddenActions)).toContain('경계')
  })

  it('planned 상태 에이전트는 실행 위임 자체를 금지한다', () => {
    const book = one(agent({ kind: 'future', status: 'planned', specialty: '코드 구현' }))
    expect(labels(book.forbiddenActions)).toContain('실행 위임 금지')
  })

  it('파일 변경 신호가 있으면 시크릿 원문 기록을 금지한다', () => {
    const book = one(
      agent({ id: 'dev', specialty: '코드 구현' }),
      [evt({ agentId: 'dev', source: 'claude-code', summary: 'src/App.tsx 와 README.md 수정' })],
    )
    expect(labels(book.forbiddenActions)).toContain('시크릿')
  })
})

// ─── posture ────────────────────────────────────────────────
describe('buildRunbooks — posture', () => {
  it('고신뢰 + 리스크 없음 + ready 능력이면 delegate', () => {
    const book = one(
      agent({
        id: 'dev',
        trust: 92,
        autonomy: 84,
        specialty: '코드 구현 · 빌드 · 테스트',
        skills: [skill('react-ts', 'React/TypeScript', 92)],
      }),
      [
        evt({ id: 'x1', agentId: 'dev', source: 'claude-code', summary: 'npm test passed' }),
        evt({ id: 'x2', agentId: 'dev', source: 'claude-code', summary: 'build passed' }),
      ],
    )
    expect(book.posture).toBe('delegate')
  })

  it('리스크 신호가 있으면 supervise', () => {
    const book = one(
      agent({
        id: 'dev',
        trust: 92,
        autonomy: 84,
        specialty: '코드 구현',
        skills: [skill('react-ts', 'React/TypeScript', 92)],
      }),
      [evt({ agentId: 'dev', source: 'claude-code', summary: '최근 실행은 timeout 기록 있음' })],
    )
    expect(book.posture).toBe('supervise')
  })

  it('planned 상태면 hold', () => {
    const book = one(agent({ kind: 'future', status: 'planned', trust: 95, autonomy: 90, specialty: '코드 구현' }))
    expect(book.posture).toBe('hold')
  })
})

// ─── constraints / verification / stop ──────────────────────
describe('buildRunbooks — 제약·검증·중단', () => {
  it('coherence가 낮으면 근거 요구 제약을 남긴다', () => {
    const book = one(agent({ soul: { identity: '', values: [], tone: '', mood: '', coherence: 72 } }))
    expect(labels(book.constraints)).toContain('일관성')
  })

  it('최근 기억 성장이 없으면 맥락 명시 제약을 남긴다', () => {
    const book = one(agent({ memory: { longTerm: 3, recentGrowth: 0, lastConsolidated: '' } }))
    expect(labels(book.constraints)).toContain('맥락')
  })

  it('integration kind는 오케스트레이터 경유 제약을 남긴다', () => {
    const book = one(agent({ kind: 'integration' }))
    expect(labels(book.constraints)).toContain('오케스트레이터')
  })

  it('코드 능력이 있으면 검증 체크리스트에 테스트/빌드 명령이 들어간다', () => {
    const book = one(
      agent({ id: 'dev', specialty: '코드 구현 · 테스트', skills: [skill('vitest', 'Vitest 테스트')] }),
      [evt({ agentId: 'dev', source: 'claude-code', summary: 'npm test passed' })],
    )
    expect(labels(book.verification)).toContain('npm test')
  })

  it('검증 체크리스트는 항상 Activity Blackbox 재확인으로 닫는다', () => {
    const book = one(agent())
    expect(labels(book.verification)).toContain('Activity Blackbox')
  })

  it('리스크 신호가 있으면 에스컬레이션 중단 조건을 남긴다', () => {
    const book = one(
      agent({ id: 'dev' }),
      [evt({ agentId: 'dev', summary: 'ask_doc_auto_agent 스크립트 timeout 발생' })],
    )
    expect(labels(book.stopConditions)).toContain('에스컬레이션')
  })

  it('중단 조건에는 항상 반복 실패 규칙이 있다', () => {
    const book = one(agent())
    expect(labels(book.stopConditions)).toContain('2회 연속')
  })
})

// ─── export override 병합 ───────────────────────────────────
describe('buildRunbooks — export override 병합', () => {
  const override: RunbookOverride = {
    headline: 'export가 제공한 운영 요약',
    delegateWhen: ['export 위임 상황'],
    approvalRequired: ['export 승인 항목'],
  }

  it('안전하지 않은 섹션은 export 값으로 대체하고 출처를 표시한다', () => {
    const book = one(agent({ runbook: override }))
    expect(book.headline).toBe('export가 제공한 운영 요약')
    expect(labels(book.delegateWhen)).toBe('export 위임 상황')
    expect(book.delegateWhen[0].fromExport).toBe(true)
    expect(book.provenance).toBe('merged')
  })

  it('override가 없으면 provenance는 derived', () => {
    expect(one(agent()).provenance).toBe('derived')
  })

  it('승인 게이트/금지는 축소할 수 없다 — 파생 항목을 유지하고 export 항목을 더한다', () => {
    const derived = one(agent({ specialty: 'Gmail 메일 운영' }))
    const merged = one(agent({
      specialty: 'Gmail 메일 운영',
      runbook: { approvalRequired: ['export 승인 항목'], forbiddenActions: [] },
    }))
    expect(labels(merged.approvalRequired)).toContain('메일 발송')
    expect(labels(merged.approvalRequired)).toContain('export 승인 항목')
    expect(merged.approvalRequired.length).toBe(derived.approvalRequired.length + 1)
    expect(labels(merged.forbiddenActions)).toBe(labels(derived.forbiddenActions))
  })

  it('빈 배열/잘못된 타입 override는 무시하고 파생을 유지한다', () => {
    const derived = one(agent({ specialty: '회의록 자동 작성' }))
    const weird = one(agent({
      specialty: '회의록 자동 작성',
      runbook: {
        delegateWhen: [],
        allowedActions: [123 as unknown as string, '  '],
        constraints: undefined,
      },
    }))
    expect(labels(weird.delegateWhen)).toBe(labels(derived.delegateWhen))
    expect(labels(weird.allowedActions)).toBe(labels(derived.allowedActions))
    expect(labels(weird.constraints)).toBe(labels(derived.constraints))
  })
})

// ─── seed 다양성 (가짜 신호 없이 에이전트별 차이) ────────────
describe('buildRunbooks — seed 다양성', () => {
  const books = buildRunbooks(seed.agents, seed.events, seed.requests)

  it('seed의 모든 에이전트에 runbook이 있다', () => {
    expect(books).toHaveLength(seed.agents.length)
  })

  it('승인 게이트 조합이 에이전트마다 다르다', () => {
    const signatures = new Set(books.map((b) => b.approvalRequired.map((i) => i.id).sort().join(',')))
    expect(signatures.size).toBeGreaterThanOrEqual(3)
  })

  it('Google Workspace는 메일 발송 승인 게이트를 가진다', () => {
    const gws = books.find((b) => b.agentId === 'google-workspace')!
    expect(labels(gws.approvalRequired)).toContain('메일 발송')
  })

  it('n8n MCP는 workflow mutation 승인 게이트를 가진다', () => {
    const n8n = books.find((b) => b.agentId === 'n8n-mcp')!
    expect(labels(n8n.approvalRequired)).toContain('n8n workflow')
  })

  it('Claude Code Dev Cell은 GitHub push와 destructive local ops 게이트를 가진다', () => {
    const dev = books.find((b) => b.agentId === 'claude-code')!
    expect(labels(dev.approvalRequired)).toContain('GitHub push')
    expect(labels(dev.approvalRequired)).toContain('destructive local ops')
  })

  it('AI Trend Radar에는 메일/푸시 게이트가 없다', () => {
    const radar = books.find((b) => b.agentId === 'ai-trend-radar')!
    expect(labels(radar.approvalRequired)).not.toContain('메일 발송')
    expect(labels(radar.approvalRequired)).not.toContain('GitHub push')
  })

  it('추천 위임 상황이 에이전트마다 동일하지 않다', () => {
    const signatures = new Set(books.map((b) => labels(b.delegateWhen)))
    expect(signatures.size).toBeGreaterThanOrEqual(4)
  })
})
