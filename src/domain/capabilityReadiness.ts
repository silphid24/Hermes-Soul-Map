// Capability Readiness Matrix — 각 에이전트가 특정 능력을 맡을 준비가 얼마나
// 됐는지를 파생 계산한다.
//
// 순수 함수. 새 코어 스키마 없이 기존 Agent/Skill/LogEvent/InterAgentRequest 를
// 조합만 한다. UI 셀 값(status/score)은 여기서만 파생하며 어디에도 하드코딩하지
// 않는다. risk 규칙은 `agent-activity-blackbox` / `delegation-graph-replay`
// KB(activity.ts / delegationReplay.ts)와 동일하게 유지한다.

import type { Agent, EventSource, InterAgentRequest, LogEvent } from '../types'

export type CapabilityKey =
  | 'observe_logs'
  | 'document_minutes'
  | 'code_build_test'
  | 'automation_cron'
  | 'workspace_ops'
  | 'external_send'

export type ReadinessStatus = 'ready' | 'partial' | 'blocked' | 'idle' | 'approval_gated'

export interface CapabilityReadinessCell {
  agentId: string
  agentName: string
  capability: CapabilityKey
  status: ReadinessStatus
  /** 0–100 */
  score: number
  /** 파생 근거 (사람이 읽는 짧은 신호) */
  reasons: string[]
}

export interface CapabilityReadinessMatrix {
  capabilities: CapabilityKey[]
  agents: string[]
  cells: CapabilityReadinessCell[]
  /** status ready, score 내림차순 */
  topReady: CapabilityReadinessCell[]
  /** status approval_gated */
  gated: CapabilityReadinessCell[]
}

interface CapDef {
  key: CapabilityKey
  label: string
  /** skill(name+id) / specialty·description·values / event summary 에 부분일치 (lowercase) */
  keywords: string[]
  /** 이 source 의 이벤트는 (키워드 무관) 해당 능력 활동으로 인정 */
  sources?: EventSource[]
  /** 외부 발송/production mutation → approval gate 대상 */
  external?: boolean
}

// capability 정의 — 규칙만 선언한다. 셀 값은 실제 데이터에서 파생된다.
const CAP_DEFS: CapDef[] = [
  {
    key: 'observe_logs',
    label: 'Observe / Logs',
    keywords: [
      '관측', '로그', 'log', 'monitor', '모니터', '감시', '점검', '트렌드', 'trend',
      '브리핑', 'radar', '레이더', 'status', '상태', 'heartbeat', 'triage', '오케스트',
    ],
    sources: ['cron'],
  },
  {
    key: 'document_minutes',
    label: 'Document / Minutes',
    keywords: [
      '회의록', 'minutes', '문서', 'document', 'doc', 'notion', '업로드', '자료',
      '보고서', '기록', '문서화', '회의',
    ],
  },
  {
    key: 'code_build_test',
    label: 'Code / Build / Test',
    keywords: [
      '코드', 'code', 'build', '빌드', 'test', '테스트', 'lint', '구현', '리팩터',
      'refactor', 'npm', 'tsc', 'react', 'typescript', 'vitest', '개발', 'diff',
    ],
    sources: ['claude-code', 'codex'],
  },
  {
    key: 'automation_cron',
    label: 'Automation / Cron',
    keywords: [
      'cron', 'automation', '자동화', 'workflow', '워크플로', '스크립트', 'script',
      '파이프라인', 'pipeline', '정례', 'mcp', 'n8n',
    ],
    sources: ['cron', 'n8n'],
  },
  {
    key: 'workspace_ops',
    label: 'Workspace Ops',
    keywords: [
      'drive', 'sheets', 'docs', 'calendar', '캘린더', 'gmail', 'm365', 'teams',
      'outlook', 'workspace', '파일', '폴더', '스프레드', 'notion', '업무', 'oauth',
    ],
    sources: ['google-workspace'],
  },
  {
    key: 'external_send',
    label: 'External Send',
    external: true,
    keywords: [
      '발송', 'send', '게시', 'publish', 'mail', '메일', 'tweet', '트윗', '외부',
      'mutation', 'activate', 'deactivate', 'gmail', 'outlook', 'teams', 'telegram',
      'twitter', 'social', '소셜',
    ],
  },
]

export const CAPABILITY_ORDER: CapabilityKey[] = CAP_DEFS.map((d) => d.key)

export const capabilityLabels: Record<CapabilityKey, string> = CAP_DEFS.reduce(
  (acc, def) => {
    acc[def.key] = def.label
    return acc
  },
  {} as Record<CapabilityKey, string>,
)

// timeout / 실패 / 에러 / 리뷰 반려를 리스크로 본다. 'fail'은 'failed'를 포함한다.
// 'lint 0 errors' 같은 clean 신호가 오탐되지 않도록 먼저 제거한다.
const RISK_KEYWORDS = ['timeout', 'timed out', 'fail', 'error', 'changes_requested']

function detectRisk(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/0 errors/g, '')
  return RISK_KEYWORDS.some((keyword) => cleaned.includes(keyword))
}

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((k) => haystack.includes(k))
}

const READY_THRESHOLD = 68

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n))
}

interface CellSignals {
  affinity: boolean
  score: number
  skillProf: number
  topSkillName?: string
  textHit: boolean
  activityCount: number
  riskInCapability: boolean
}

function deriveSignals(agent: Agent, events: LogEvent[], def: CapDef): CellSignals {
  const relevantSkills = agent.skills.filter((s) =>
    matchesAny(`${s.name} ${s.id}`.toLowerCase(), def.keywords),
  )
  const best = relevantSkills.reduce<typeof relevantSkills[number] | undefined>(
    (top, s) => (!top || s.proficiency > top.proficiency ? s : top),
    undefined,
  )
  const skillProf = best?.proficiency ?? 0

  const textHaystack = `${agent.specialty} ${agent.description} ${agent.soul.values.join(' ')}`.toLowerCase()
  const textHit = matchesAny(textHaystack, def.keywords)

  const capEvents = events.filter((e) => {
    if (e.agentId !== agent.id && e.source !== agent.id) return false
    if (def.sources?.includes(e.source)) return true
    return matchesAny(e.summary.toLowerCase(), def.keywords)
  })
  const activityCount = capEvents.length
  const riskInCapability = capEvents.some((e) => detectRisk(e.summary))

  const affinity = relevantSkills.length > 0 || textHit || activityCount > 0

  let score = 0
  if (relevantSkills.length > 0) score += 20 + skillProf * 0.3
  if (textHit) score += 12
  score += Math.min(activityCount, 3) * 6
  score += agent.trust * 0.12
  score += agent.autonomy * 0.06
  score += agent.soul.coherence * 0.06
  score += Math.min(agent.memory.longTerm, 5) + Math.min(agent.memory.recentGrowth * 2, 3)

  return {
    affinity,
    score: affinity ? Math.round(clamp(score)) : 0,
    skillProf,
    topSkillName: best?.name,
    textHit,
    activityCount,
    riskInCapability,
  }
}

function buildReasons(agent: Agent, def: CapDef, s: CellSignals, status: ReadinessStatus): string[] {
  const reasons: string[] = []
  if (status === 'idle') return ['해당 능력 신호 없음']
  if (status === 'approval_gated') reasons.push('외부 발송/변경 승인 게이트')
  if ((agent.status === 'dormant' || agent.status === 'planned') && !def.external) {
    reasons.push(`${agent.status} 상태 — 지금은 위임 불가`)
  }
  if (s.riskInCapability) reasons.push('risk 신호(리스크) 감지')
  if (s.topSkillName) reasons.push(`스킬 ${s.topSkillName} ${s.skillProf}%`)
  if (s.activityCount > 0) reasons.push(`관련 활동 ${s.activityCount}건`)
  if (reasons.length < 4) reasons.push(`신뢰 ${agent.trust} · 자율 ${agent.autonomy}`)
  return reasons.slice(0, 4)
}

function deriveStatus(agent: Agent, def: CapDef, s: CellSignals): ReadinessStatus {
  if (!s.affinity) return 'idle'
  if (agent.status === 'dormant' || agent.status === 'planned') return 'blocked'
  if (def.external) return 'approval_gated'
  if (s.riskInCapability) return 'blocked'
  // affinity가 있고 risk/status 문제가 없으면 최소 partial — 'blocked'는
  // 실제로 막힌 경우(risk/dormant/planned)에만 쓴다.
  if (s.score >= READY_THRESHOLD) return 'ready'
  return 'partial'
}

export function buildCapabilityReadiness(
  agents: Agent[],
  events: LogEvent[],
  _requests: InterAgentRequest[],
): CapabilityReadinessMatrix {
  const cells: CapabilityReadinessCell[] = []

  for (const agent of agents) {
    for (const def of CAP_DEFS) {
      const signals = deriveSignals(agent, events, def)
      const status = deriveStatus(agent, def, signals)
      cells.push({
        agentId: agent.id,
        agentName: agent.name,
        capability: def.key,
        status,
        score: signals.score,
        reasons: buildReasons(agent, def, signals, status),
      })
    }
  }

  const byScoreDesc = (a: CapabilityReadinessCell, b: CapabilityReadinessCell): number => {
    if (b.score !== a.score) return b.score - a.score
    if (a.agentId !== b.agentId) return a.agentId.localeCompare(b.agentId)
    return CAPABILITY_ORDER.indexOf(a.capability) - CAPABILITY_ORDER.indexOf(b.capability)
  }

  const topReady = cells.filter((c) => c.status === 'ready').sort(byScoreDesc)
  const gated = cells.filter((c) => c.status === 'approval_gated').sort(byScoreDesc)

  return {
    capabilities: [...CAPABILITY_ORDER],
    agents: agents.map((a) => a.id),
    cells,
    topReady,
    gated,
  }
}
