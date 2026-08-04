// Agent Runbook / Operating Manual — 각 에이전트를 "실제로 어떻게 쓰는가"를 파생한다.
//
// Capability Readiness Matrix가 *가능성*(누가 무엇을 할 수 있는가)을 답한다면,
// Runbook은 *운영 계약*(무엇을 마음대로 시켜도 되고, 무엇은 승인이 필요하고,
// 무엇은 절대 시키면 안 되는가)을 답한다.
//
// 규칙:
//   - 순수 함수. 절대 throw 하지 않는다.
//   - readiness를 다시 계산하지 않고 `buildCapabilityReadiness` 출력을 소비한다
//     (두 패널이 서로 모순되면 안 된다).
//   - 신호가 없으면 항목을 만들지 않는다. 합성 신호(가짜 heartbeat 등) 금지.
//   - export가 runbook을 제공해도 `approvalRequired` / `forbiddenActions` 의 파생
//     항목은 절대 제거되지 않는다(합집합). import JSON은 신뢰 경계 밖이다.

import type { Agent, InterAgentRequest, LogEvent, RunbookOverride } from '../types'
import { summarizeAgentActivity, type AgentActivitySummary } from './activity'
import {
  buildCapabilityReadiness,
  capabilityLabels,
  type CapabilityKey,
  type CapabilityReadinessCell,
} from './capabilityReadiness'

export type RunbookPosture = 'delegate' | 'supervise' | 'hold'
export type RunbookProvenance = 'derived' | 'merged'
export type RunbookTone = 'go' | 'gate' | 'stop' | 'info'

export type RunbookSectionKey =
  | 'delegateWhen'
  | 'allowedActions'
  | 'approvalRequired'
  | 'forbiddenActions'
  | 'constraints'
  | 'verification'
  | 'stopConditions'

export interface RunbookItem {
  /** 섹션 내 안정적 키 (React key / 테스트 앵커) */
  id: string
  label: string
  /** 이 항목이 나온 파생 근거 — 하드코딩이 아님을 증명한다 */
  evidence: string
  /** export override에서 온 항목 */
  fromExport?: boolean
}

export interface AgentRunbook {
  agentId: string
  agentName: string
  emoji: string
  accent: string
  posture: RunbookPosture
  headline: string
  provenance: RunbookProvenance
  delegateWhen: RunbookItem[]
  allowedActions: RunbookItem[]
  approvalRequired: RunbookItem[]
  forbiddenActions: RunbookItem[]
  constraints: RunbookItem[]
  verification: RunbookItem[]
  stopConditions: RunbookItem[]
}

export interface RunbookSection {
  key: RunbookSectionKey
  label: string
  tone: RunbookTone
}

export const RUNBOOK_SECTIONS: RunbookSection[] = [
  { key: 'delegateWhen', label: '추천 위임 상황', tone: 'go' },
  { key: 'allowedActions', label: '승인 없이 가능', tone: 'go' },
  { key: 'approvalRequired', label: '사람 승인 필요', tone: 'gate' },
  { key: 'forbiddenActions', label: '금지', tone: 'stop' },
  { key: 'constraints', label: '운영 제약', tone: 'info' },
  { key: 'verification', label: '검증 체크리스트', tone: 'info' },
  { key: 'stopConditions', label: '에스컬레이션 / 중단 조건', tone: 'stop' },
]

export const postureLabels: Record<RunbookPosture, string> = {
  delegate: '위임 가능',
  supervise: '감독 필요',
  hold: '위임 보류',
}

/** export override가 축소할 수 없는 안전 섹션 (합집합으로만 병합). */
const SAFETY_SECTIONS: RunbookSectionKey[] = ['approvalRequired', 'forbiddenActions']

const MAX_DELEGATE_ITEMS = 6

// ─────────────────────────────────────────────────────────────
// 텍스트 신호
// ─────────────────────────────────────────────────────────────

const MAIL_KEYWORDS = ['gmail', 'mail', '메일', 'outlook', '이메일']
const PUBLISH_KEYWORDS = ['발송', '게시', 'publish', 'tweet', '트윗', 'social', '소셜', 'telegram', '텔레그램', 'sns']
const WORKFLOW_KEYWORDS = ['n8n', 'workflow', '워크플로']
const AUTOMATION_KEYWORDS = ['automation', '자동화', 'mcp', '파이프라인', 'pipeline']
const READONLY_KEYWORDS = ['읽기 전용', 'read-only', 'readonly']
const BOUNDARY_KEYWORDS = ['격리', '분리', '경계']
const CODE_KEYWORDS = [
  '코드', 'code', 'build', '빌드', 'test', '테스트', 'lint', '구현', '리팩터',
  'refactor', 'npm', 'react', 'typescript', 'vitest', '개발',
]

function agentText(agent: Agent): string {
  const skills = agent.skills.map((s) => `${s.name} ${s.id}`).join(' ')
  return `${agent.specialty} ${agent.description} ${agent.soul.identity} ${agent.soul.values.join(' ')} ${skills}`.toLowerCase()
}

function firstHit(text: string, keywords: string[]): string | undefined {
  return keywords.find((keyword) => text.includes(keyword))
}

// ─────────────────────────────────────────────────────────────
// 파생 컨텍스트
// ─────────────────────────────────────────────────────────────

interface RunbookContext {
  agent: Agent
  text: string
  cells: Map<CapabilityKey, CapabilityReadinessCell>
  activity: AgentActivitySummary
  incoming: InterAgentRequest[]
  /** 실제 코드 실행 주체인가 — push/destructive 게이트의 근거 */
  codeOwnership?: string
}

/**
 * 코드 소유권 신호.
 *
 * readiness `code_build_test` 만으로 판단하지 않는다. 그 축은 이벤트 요약의 느슨한
 * 부분일치(예: "latest" 안의 "test")로도 partial이 될 수 있어서, 브리핑 전용
 * 에이전트에까지 GitHub push 게이트를 붙이는 오탐이 난다. 게이트는 스킬/정체성
 * 텍스트 또는 dev 도구 소스 이벤트처럼 **명시적** 신호가 있을 때만 만든다.
 */
function deriveCodeOwnership(agent: Agent, text: string, events: LogEvent[]): string | undefined {
  const skill = agent.skills.find((s) => firstHit(`${s.name} ${s.id}`.toLowerCase(), CODE_KEYWORDS))
  if (skill) return `코드 스킬 '${skill.name}'`

  const identityHit = firstHit(
    `${agent.specialty} ${agent.description} ${agent.soul.identity} ${agent.soul.values.join(' ')}`.toLowerCase(),
    CODE_KEYWORDS,
  )
  if (identityHit) return `정체성 텍스트 신호 '${identityHit}'`

  const devEvent = events.find(
    (event) =>
      (event.agentId === agent.id || event.source === agent.id) &&
      (event.source === 'claude-code' || event.source === 'codex'),
  )
  if (devEvent) return `dev 도구 이벤트 source '${devEvent.source}'`

  return text.includes('claude code') ? "정체성 텍스트 신호 'claude code'" : undefined
}

function cellOf(ctx: RunbookContext, key: CapabilityKey): CapabilityReadinessCell | undefined {
  return ctx.cells.get(key)
}

/** 해당 능력에 신호가 하나라도 있는가 (readiness idle이 아님). */
function hasAffinity(ctx: RunbookContext, key: CapabilityKey): boolean {
  const cell = cellOf(ctx, key)
  return cell !== undefined && cell.status !== 'idle'
}

function cellsByStatus(ctx: RunbookContext, status: CapabilityReadinessCell['status']): CapabilityReadinessCell[] {
  return [...ctx.cells.values()].filter((cell) => cell.status === status).sort((a, b) => b.score - a.score)
}

function item(id: string, label: string, evidence: string): RunbookItem {
  return { id, label, evidence }
}

// ─────────────────────────────────────────────────────────────
// 승인 게이트
// ─────────────────────────────────────────────────────────────

interface GateDef {
  id: string
  label: string
  /** 발동 근거를 반환하면 게이트가 켜진다. */
  evidence: (ctx: RunbookContext) => string | undefined
}

const GATE_DEFS: GateDef[] = [
  {
    id: 'gate:mail',
    label: '메일 발송 — 초안까지만 자동, 발송은 사람 승인',
    evidence: (ctx) => {
      const hit = firstHit(ctx.text, MAIL_KEYWORDS)
      return hit ? `메일 신호 '${hit}'` : undefined
    },
  },
  {
    id: 'gate:publish',
    label: '외부 게시/발송 — 공개 전 사람 승인',
    evidence: (ctx) => {
      const hit = firstHit(ctx.text, PUBLISH_KEYWORDS)
      return hit ? `외부 채널 신호 '${hit}'` : undefined
    },
  },
  {
    id: 'gate:workflow',
    label: 'n8n workflow activate/deactivate 등 production mutation',
    evidence: (ctx) => {
      const hit = firstHit(ctx.text, WORKFLOW_KEYWORDS)
      return hit ? `workflow 신호 '${hit}'` : undefined
    },
  },
  {
    id: 'gate:automation',
    label: '자동화 파이프라인 변경·재실행 — production 영향 시 승인',
    evidence: (ctx) => {
      const hit = firstHit(ctx.text, AUTOMATION_KEYWORDS)
      if (!hit || !hasAffinity(ctx, 'automation_cron')) return undefined
      return `자동화 신호 '${hit}' + automation_cron 능력`
    },
  },
  {
    id: 'gate:code_push',
    label: 'GitHub push / release / 배포',
    evidence: (ctx) => ctx.codeOwnership,
  },
  {
    id: 'gate:destructive',
    label: 'destructive local ops (rm -rf, git reset --hard, force push, 대량 삭제)',
    evidence: (ctx) => {
      if (ctx.activity.changedFiles.length > 0) {
        return `로컬 파일 변경 관측 ${ctx.activity.changedFiles.length}건`
      }
      return ctx.codeOwnership ? `로컬 코드 실행 능력 — ${ctx.codeOwnership}` : undefined
    },
  },
  {
    id: 'gate:integration_write',
    label: 'production 데이터 쓰기 API 호출',
    evidence: (ctx) => (ctx.agent.kind === 'integration' ? 'integration 계층 — 외부 시스템 직접 변경' : undefined),
  },
]

function deriveGates(ctx: RunbookContext): RunbookItem[] {
  const gates: RunbookItem[] = []

  for (const def of GATE_DEFS) {
    const evidence = def.evidence(ctx)
    if (evidence) gates.push(item(def.id, def.label, evidence))
  }

  // Readiness Matrix가 이미 승인 게이트로 판정한 능력을 그대로 승계한다.
  for (const cell of cellsByStatus(ctx, 'approval_gated')) {
    gates.push(
      item(
        `gate:cap:${cell.capability}`,
        `${capabilityLabels[cell.capability]} 실행 — Readiness 승인 게이트`,
        cell.reasons[0] ?? `readiness approval_gated (${cell.score})`,
      ),
    )
  }

  return gates
}

// ─────────────────────────────────────────────────────────────
// 섹션 파생
// ─────────────────────────────────────────────────────────────

function deriveDelegateWhen(ctx: RunbookContext): RunbookItem[] {
  const ready = cellsByStatus(ctx, 'ready').map((cell) =>
    item(
      `delegate:${cell.capability}`,
      `${capabilityLabels[cell.capability]} — 지금 바로 위임 가능`,
      cell.reasons.join(' · '),
    ),
  )

  const fromRequests = ctx.incoming.map((request) =>
    item(
      `delegate:req:${request.id}`,
      `정례 요청 수신 중: ${request.capability}`,
      `${request.fromAgentId} → ${request.toAgentId} (${request.status})`,
    ),
  )

  const partial = cellsByStatus(ctx, 'partial').map((cell) =>
    item(
      `delegate:${cell.capability}`,
      `${capabilityLabels[cell.capability]} — 검토 병행 위임`,
      cell.reasons.join(' · '),
    ),
  )

  return [...ready, ...fromRequests, ...partial].slice(0, MAX_DELEGATE_ITEMS)
}

function deriveAllowed(ctx: RunbookContext): RunbookItem[] {
  // 승인 게이트 대상(external/approval_gated)은 여기 오지 않는다 — 중복 노출 금지.
  return [...cellsByStatus(ctx, 'ready'), ...cellsByStatus(ctx, 'partial')].map((cell) =>
    item(
      `allow:${cell.capability}`,
      cell.status === 'ready'
        ? `${capabilityLabels[cell.capability]} 실행 — 사전 승인 불필요`
        : `${capabilityLabels[cell.capability]} 보조 작업 — 결과 확인 전제`,
      cell.reasons[0] ?? `readiness ${cell.status} (${cell.score})`,
    ),
  )
}

function deriveForbidden(ctx: RunbookContext, gates: RunbookItem[]): RunbookItem[] {
  const items: RunbookItem[] = []

  if (gates.length > 0) {
    items.push(
      item(
        'forbid:auto-gate',
        '승인 없는 자동 실행 금지 (승인 게이트 항목 전부)',
        `승인 게이트 ${gates.length}건`,
      ),
    )
  }

  if (ctx.agent.status === 'dormant' || ctx.agent.status === 'planned') {
    items.push(
      item('forbid:not-connected', '실행 위임 금지 — 미연결 상태', `agent status ${ctx.agent.status}`),
    )
  }

  for (const cell of cellsByStatus(ctx, 'blocked')) {
    items.push(
      item(
        `forbid:blocked:${cell.capability}`,
        `${capabilityLabels[cell.capability]} 위임 금지 — 현재 blocked`,
        cell.reasons.join(' · '),
      ),
    )
  }

  const readonlyHit = firstHit(ctx.text, READONLY_KEYWORDS)
  if (readonlyHit) {
    items.push(
      item('forbid:readonly', `'${readonlyHit}' 대상의 쓰기·변경 금지`, `읽기 전용 신호 '${readonlyHit}'`),
    )
  }

  const boundaryHit = firstHit(ctx.text, BOUNDARY_KEYWORDS)
  if (boundaryHit) {
    items.push(
      item(
        'forbid:boundary',
        '계정·맥락 경계 초과 금지 (개인/회사/조직 데이터 혼합)',
        `경계 신호 '${boundaryHit}'`,
      ),
    )
  }

  if (ctx.activity.changedFiles.length > 0) {
    items.push(
      item(
        'forbid:secrets',
        '시크릿·개인정보 원문을 로그/export에 남기기 금지',
        `로컬 파일 변경 관측 ${ctx.activity.changedFiles.length}건`,
      ),
    )
  }

  return items
}

function deriveConstraints(ctx: RunbookContext): RunbookItem[] {
  const { agent, activity } = ctx
  const items: RunbookItem[] = []

  items.push(
    agent.trust >= 85 && agent.autonomy >= 75
      ? item(
          'constraint:trust',
          '결과 요약 확인만으로 위임 가능',
          `신뢰 ${agent.trust} · 자율 ${agent.autonomy}`,
        )
      : item(
          'constraint:trust',
          '단계별 확인 필요 — 중간 산출물을 함께 본다',
          `신뢰 ${agent.trust} · 자율 ${agent.autonomy}`,
        ),
  )

  if (agent.soul.coherence < 80) {
    items.push(
      item(
        'constraint:coherence',
        `판단 일관성 ${agent.soul.coherence}% — 결정 근거를 함께 요구`,
        `soul.coherence ${agent.soul.coherence}`,
      ),
    )
  }

  if (agent.memory.recentGrowth === 0) {
    items.push(
      item(
        'constraint:memory',
        '최근 신규 기억 없음 — 작업 맥락을 프롬프트에 명시',
        `recentGrowth ${agent.memory.recentGrowth} · longTerm ${agent.memory.longTerm}`,
      ),
    )
  }

  if (agent.kind === 'integration') {
    items.push(
      item('constraint:integration', '도구 계층 — 오케스트레이터를 경유해 호출', `kind ${agent.kind}`),
    )
  }

  if (agent.status === 'idle' || agent.status === 'dormant') {
    items.push(item('constraint:status', `상태 ${agent.status} — 응답 지연을 가정`, `agent status ${agent.status}`))
  }

  if (activity.riskSignals.length > 0) {
    items.push(
      item('constraint:risk', `최근 리스크 신호: ${activity.riskSignals.join(', ')}`, `관측 이벤트 ${activity.recentEventCount}건`),
    )
  }

  if (activity.lastActivityAt) {
    items.push(item('constraint:last', `마지막 관측 활동 ${activity.lastActivityAt}`, `관측 이벤트 ${activity.recentEventCount}건`))
  }

  return items
}

function deriveVerification(ctx: RunbookContext, gates: RunbookItem[]): RunbookItem[] {
  const items: RunbookItem[] = []
  const { activity } = ctx

  if (hasAffinity(ctx, 'code_build_test')) {
    items.push(
      item(
        'verify:code',
        '실행 후 npm test -- --run · npm run lint · npm run build 결과 확인',
        activity.validationSignals.length > 0
          ? `관측된 검증 신호: ${activity.validationSignals.join(', ')}`
          : '코드 실행 능력 보유 — 검증 신호 미관측',
      ),
    )
  }

  if (hasAffinity(ctx, 'document_minutes')) {
    items.push(item('verify:document', '생성 문서의 원문 보존과 업로드 링크 확인', 'document_minutes 능력 보유'))
  }

  if (hasAffinity(ctx, 'automation_cron')) {
    items.push(item('verify:automation', '마지막 실행 시각과 실패 로그 확인', 'automation_cron 능력 보유'))
  }

  if (hasAffinity(ctx, 'workspace_ops')) {
    items.push(item('verify:workspace', '대상 파일·폴더와 권한 범위 확인', 'workspace_ops 능력 보유'))
  }

  if (hasAffinity(ctx, 'observe_logs')) {
    items.push(item('verify:observe', '보고 내용의 출처 링크와 관측 시각 확인', 'observe_logs 능력 보유'))
  }

  if (gates.length > 0) {
    items.push(
      item(
        'verify:gate',
        '발송·변경 전 수신자/본문/draft 상태를 사람이 직접 확인',
        `승인 게이트 ${gates.length}건`,
      ),
    )
  }

  items.push(
    item(
      'verify:blackbox',
      '실행 결과를 Agent Activity Blackbox에서 재확인',
      `관측 이벤트 ${activity.recentEventCount}건 · 변경 파일 ${activity.changedFiles.length}건`,
    ),
  )

  return items
}

function deriveStopConditions(ctx: RunbookContext, gates: RunbookItem[]): RunbookItem[] {
  const items: RunbookItem[] = []
  const { agent, activity } = ctx

  if (activity.riskSignals.length > 0) {
    items.push(
      item(
        'stop:risk',
        '리스크 신호 재발 시 즉시 중단하고 오케스트레이터에 에스컬레이션',
        `현재 리스크: ${activity.riskSignals.join(', ')}`,
      ),
    )
  }

  const blocked = cellsByStatus(ctx, 'blocked')
  if (blocked.length > 0) {
    items.push(
      item(
        'stop:blocked',
        `blocked 능력 강행 금지 — ${blocked.map((cell) => capabilityLabels[cell.capability]).join(', ')}`,
        `blocked ${blocked.length}건`,
      ),
    )
  }

  if (agent.status === 'dormant' || agent.status === 'planned') {
    items.push(item('stop:not-connected', '연결 상태 회복 전 실행 중단', `agent status ${agent.status}`))
  }

  if (gates.length > 0) {
    items.push(item('stop:approval', '승인 응답이 없으면 보류 — 자동 진행 금지', `승인 게이트 ${gates.length}건`))
  }

  if (agent.soul.coherence < 80) {
    items.push(
      item(
        'stop:coherence',
        '근거가 불명확하면 중단하고 사람 판단을 요청',
        `soul.coherence ${agent.soul.coherence}`,
      ),
    )
  }

  items.push(
    item(
      'stop:repeat',
      '동일 작업 2회 연속 실패·timeout이면 중단하고 사람에게 보고',
      '공통 운영 규칙 (activity risk 파싱 기준과 동일)',
    ),
  )

  return items
}

function derivePosture(ctx: RunbookContext): RunbookPosture {
  const { agent, activity } = ctx
  const ready = cellsByStatus(ctx, 'ready')
  const usable = ready.length + cellsByStatus(ctx, 'partial').length

  if (agent.status === 'dormant' || agent.status === 'planned' || usable === 0) return 'hold'
  if (activity.riskSignals.length > 0) return 'supervise'
  if (agent.trust < 80 || agent.autonomy < 65 || ready.length === 0) return 'supervise'
  return 'delegate'
}

function deriveHeadline(ctx: RunbookContext, posture: RunbookPosture, gates: RunbookItem[]): string {
  const { agent } = ctx
  const top = cellsByStatus(ctx, 'ready')[0] ?? cellsByStatus(ctx, 'partial')[0]
  const gateNote = gates.length > 0 ? ` 승인 게이트 ${gates.length}건은 사람이 통과시킨다.` : ' 별도 승인 게이트 신호는 없다.'

  if (posture === 'hold') {
    return `${agent.name}은(는) 지금 실행 위임 대상이 아니다 (상태 ${agent.status}).${gateNote}`
  }
  if (!top) {
    return `${agent.name}에게 맡길 수 있는 능력 신호가 아직 약하다.${gateNote}`
  }
  if (posture === 'supervise') {
    return `${agent.name}에게는 ${capabilityLabels[top.capability]}를 감독 하에 맡긴다.${gateNote}`
  }
  return `${agent.name}에게는 ${capabilityLabels[top.capability]} 중심으로 위임한다.${gateNote}`
}

// ─────────────────────────────────────────────────────────────
// export override 병합
// ─────────────────────────────────────────────────────────────

/** 문자열 배열만 남긴다. 비어 있으면 undefined = "제공하지 않음"으로 본다. */
function sanitizeList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const cleaned = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  return cleaned.length > 0 ? cleaned : undefined
}

function exportItems(section: RunbookSectionKey, labels: string[]): RunbookItem[] {
  return labels.map((label, index) => ({
    id: `export:${section}:${index}`,
    label,
    evidence: 'export가 제공한 runbook',
    fromExport: true,
  }))
}

function mergeOverride(
  derived: Record<RunbookSectionKey, RunbookItem[]>,
  override: RunbookOverride | undefined,
): { sections: Record<RunbookSectionKey, RunbookItem[]>; headline?: string; changed: boolean } {
  if (!override || typeof override !== 'object') return { sections: derived, changed: false }

  const sections = { ...derived }
  let changed = false

  for (const section of RUNBOOK_SECTIONS) {
    const provided = sanitizeList((override as Record<string, unknown>)[section.key])
    if (!provided) continue
    changed = true
    const mapped = exportItems(section.key, provided)
    // 안전 섹션은 축소 불가 — 파생 항목을 유지하고 export 항목을 더한다.
    sections[section.key] = SAFETY_SECTIONS.includes(section.key)
      ? [...derived[section.key], ...mapped]
      : mapped
  }

  const headline = typeof override.headline === 'string' && override.headline.trim().length > 0
    ? override.headline.trim()
    : undefined
  if (headline) changed = true

  return { sections, headline, changed }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

function buildFromCells(
  agent: Agent,
  cells: CapabilityReadinessCell[],
  events: LogEvent[],
  requests: InterAgentRequest[],
): AgentRunbook {
  const text = agentText(agent)
  const ctx: RunbookContext = {
    agent,
    text,
    cells: new Map(cells.map((cell) => [cell.capability, cell])),
    activity: summarizeAgentActivity(agent, events),
    incoming: requests.filter((request) => request.toAgentId === agent.id),
    codeOwnership: deriveCodeOwnership(agent, text, events),
  }

  const gates = deriveGates(ctx)
  const posture = derivePosture(ctx)
  const derived: Record<RunbookSectionKey, RunbookItem[]> = {
    delegateWhen: deriveDelegateWhen(ctx),
    allowedActions: deriveAllowed(ctx),
    approvalRequired: gates,
    forbiddenActions: deriveForbidden(ctx, gates),
    constraints: deriveConstraints(ctx),
    verification: deriveVerification(ctx, gates),
    stopConditions: deriveStopConditions(ctx, gates),
  }

  const merged = mergeOverride(derived, agent.runbook)

  return {
    agentId: agent.id,
    agentName: agent.name,
    emoji: agent.emoji,
    accent: agent.accent,
    posture,
    headline: merged.headline ?? deriveHeadline(ctx, posture, gates),
    provenance: merged.changed ? 'merged' : 'derived',
    ...merged.sections,
  }
}

/** 전체 에이전트의 runbook. readiness는 한 번만 계산해 공유한다. */
export function buildRunbooks(
  agents: Agent[],
  events: LogEvent[],
  requests: InterAgentRequest[],
): AgentRunbook[] {
  const matrix = buildCapabilityReadiness(agents, events, requests)
  return agents.map((agent) =>
    buildFromCells(
      agent,
      matrix.cells.filter((cell) => cell.agentId === agent.id),
      events,
      requests,
    ),
  )
}

/** 단일 에이전트 runbook (readiness는 해당 에이전트 기준으로 계산). */
export function buildAgentRunbook(
  agent: Agent,
  events: LogEvent[],
  requests: InterAgentRequest[],
): AgentRunbook {
  const matrix = buildCapabilityReadiness([agent], events, requests)
  return buildFromCells(agent, matrix.cells, events, requests)
}
