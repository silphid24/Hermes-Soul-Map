import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { loadSeed } from './data/source'
import {
  deriveSourceHealth,
  mapHermesExportToSoulMap,
  validateHermesExport,
  type HermesExport,
  type SourceChannelStatus,
  type SourceHealth,
} from './data/hermesExport'
import { buildConstellation, buildEdges } from './domain/network'
import { connectionPath } from './domain/constellationGeometry'
import type { Box } from './domain/constellationGeometry'
import {
  currentLevel,
  memoryGrowth,
  snapshotsForAgent,
  autonomyTrend,
  evolutionNarrative,
} from './domain/evolution'
import {
  activeRequests,
  canTransition,
  countByStatus,
  prioritize,
  transition,
} from './domain/requests'
import { requestActivityEvents, summarizeAgentActivity, type AgentActivitySummary } from './domain/activity'
import {
  buildDelegationReplay,
  type DelegationStepKind,
  type ReplayStatus,
} from './domain/delegationReplay'
import { identityDrift, type IdentityDriftSummary } from './domain/identityDrift'
import {
  buildCapabilityReadiness,
  CAPABILITY_ORDER,
  capabilityLabels,
  type CapabilityReadinessCell,
  type ReadinessStatus,
} from './domain/capabilityReadiness'
import {
  buildAgentRunbook,
  postureLabels,
  RUNBOOK_SECTIONS,
  type AgentRunbook,
} from './domain/runbook'
import {
  auditLogToEvent,
  buildDryRun,
  simulateExecution,
  type ExecutionAuditLog,
  type ExecutionDryRun,
} from './domain/requestExecution'
import { filterEvents, groupByDay, type TimelineFilter } from './domain/timeline'
import {
  intelligenceScore,
  memoryVelocity,
  memoryVelocityLabel,
  riskSignals,
  skillCoverage,
} from './domain/intelligence'
import type {
  Agent,
  EventType,
  Importance,
  InterAgentRequest,
  RequestStatus,
  SoulMapData,
} from './types'

const importanceLabel: Record<Importance, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
  critical: '핵심',
}

const statusLabel: Record<RequestStatus, string> = {
  queued: '대기',
  accepted: '수락',
  in_progress: '진행',
  completed: '완료',
  declined: '거절',
}

const flowStatusLabel: Record<ReplayStatus, string> = {
  idle: '대기',
  flowing: '흐름 중',
  blocked: '막힘',
  complete: '완료',
}

const stepKindLabel: Record<DelegationStepKind, string> = {
  request: '요청',
  handoff: '위임',
  completion: '완료',
  risk: '리스크',
  signal: '신호',
}

const readinessLabel: Record<ReadinessStatus, string> = {
  ready: '준비됨',
  partial: '부분',
  blocked: '막힘',
  idle: '해당없음',
  approval_gated: '승인필요',
}

const runbookPostureClass: Record<AgentRunbook['posture'], string> = {
  delegate: 'ready',
  supervise: 'approval_gated',
  hold: 'blocked',
}

const executionStatusLabel: Record<ExecutionAuditLog['status'], string> = {
  preview: 'preview',
  approved: 'approved',
  approval_required: 'approval required',
  blocked: 'blocked',
  success: 'success',
  failure: 'failure',
  timeout: 'timeout',
}

const executionActionLabel: Record<ExecutionDryRun['target']['action'], string> = {
  observe: 'observe',
  draft: 'draft',
  mutate: 'mutate',
  publish: 'publish',
  code_change: 'code change',
  destructive: 'destructive',
  workflow_mutation: 'workflow mutation',
}

const typeLabel: Record<EventType, string> = {
  message: '대화',
  action: '실행',
  memory: '기억',
  decision: '결정',
  skill: '스킬',
  handoff: '위임',
}

const TYPE_FILTERS: (EventType | 'all')[] = [
  'all',
  'message',
  'action',
  'memory',
  'decision',
  'skill',
  'handoff',
]

const IMPORTANCE_ORDER: Importance[] = ['low', 'medium', 'high', 'critical']



const driftStatusLabel: Record<IdentityDriftSummary['status'], string> = {
  emerging: '형성 중',
  stable: '안정',
  growing: '성장',
  regressing: '후퇴 신호',
  unknown: '데이터 없음',
}

const activityStatusLabel: Record<AgentActivitySummary['status'], string> = {
  active: '활동 중',
  quiet: '조용함',
  warning: '주의 필요',
  idle: '기록 없음',
}

const healthStatusLabel: Record<SourceChannelStatus, string> = {
  live: '활성',
  partial: '부분',
  empty: '없음',
  error: '오류',
  unknown: '미확인',
}

const fallbackHealthChannels: SourceHealth['channels'] = [
  { key: 'sessions', label: '세션', status: 'unknown', count: 0, note: '데이터 미제공' },
  { key: 'memories', label: '기억', status: 'unknown', count: 0, note: '데이터 미제공' },
  { key: 'skills', label: '스킬', status: 'unknown', count: 0, note: '데이터 미제공' },
  { key: 'cron', label: '크론', status: 'unknown', count: 0, note: '데이터 미제공' },
  { key: 'flowLogs', label: '플로우로그', status: 'unknown', count: 0, note: '데이터 미제공' },
]

/** 다음 합법 상태 제안 (queued → accepted → in_progress → completed). */
const NEXT_STATUS: Partial<Record<RequestStatus, RequestStatus>> = {
  queued: 'accepted',
  accepted: 'in_progress',
  in_progress: 'completed',
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  )
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="bar" aria-label={`${value}%`}>
      <i style={{ width: `${value}%`, background: color }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Import panel (Task 3)
// ─────────────────────────────────────────────────────────────

const SAMPLE_SCHEMA: HermesExport = {
  exportedAt: '2026-07-11T00:00:00+09:00',
  profiles: [
    {
      id: 'default',
      name: 'Hermes Default',
      kind: 'default',
      specialty: '오케스트레이터',
      trust: 96,
      autonomy: 82,
      coherence: 91,
      emoji: '🪽',
      identity: '나는 연결하는 자다.',
      values: ['맥락 보존', '정직한 위임'],
      memories: [{ id: 'm1', content: 'User prefers MECE', createdAt: '2026-07-10T00:00:00+09:00' }],
      skills: [{ id: 'route', name: '의도 라우팅', proficiency: 92 }],
      connections: ['izera365'],
    },
    {
      id: 'izera365',
      name: 'izera365',
      kind: 'specialist',
      specialty: '아이제라 · M365',
      trust: 88,
      autonomy: 71,
      memories: [],
      skills: [{ id: 'cal', name: '전사 캘린더', proficiency: 90 }],
      connections: ['default'],
    },
  ],
  sessions: [
    {
      id: 's1',
      profileId: 'default',
      title: 'Google 연동',
      messages: [
        { id: 'msg1', role: 'user', content: '이번 주 킥오프 잡아줘', timestamp: '2026-07-11T01:00:00+09:00' },
      ],
    },
  ],
  cronJobs: [
    {
      id: 'c1',
      name: '야간 기억 통합',
      profileId: 'default',
      schedule: '0 2 * * *',
      lastRunAt: '2026-07-11T02:00:00+09:00',
    },
  ],
  flowLogs: [],
}

function ImportPanel({
  onApply,
  onReset,
}: {
  onApply: (data: SoulMapData, meta: { agents: number; events: number; health: SourceHealth }) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [success, setSuccess] = useState<string | null>(null)

  function apply() {
    setSuccess(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setErrors(['JSON 파싱 실패: 올바른 JSON 형식이 아닙니다.'])
      return
    }
    const result = validateHermesExport(parsed)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    const mapped = mapHermesExportToSoulMap(result.data)
    setErrors([])
    setSuccess(`가져오기 완료: 에이전트 ${mapped.agents.length}명 / 이벤트 ${mapped.events.length}건`)
    onApply(mapped, { agents: mapped.agents.length, events: mapped.events.length, health: deriveSourceHealth(result.data) })
  }

  return (
    <section className="import-panel">
      <div className="import-head">
        <button type="button" className="import-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? '가져오기 닫기' : 'Import Hermes JSON'}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setText('')
            setErrors([])
            setSuccess(null)
            onReset()
          }}
        >
          Reset to seed
        </button>
      </div>
      {open && (
        <div className="import-body">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hermes export JSON을 붙여넣으세요…"
            spellCheck={false}
          />
          <div className="import-actions">
            <button type="button" className="ghost" onClick={() => setText(JSON.stringify(SAMPLE_SCHEMA, null, 2))}>
              Load sample schema
            </button>
            <button type="button" className="primary" onClick={apply}>
              Apply import
            </button>
          </div>
          {errors.length > 0 && (
            <ul className="import-errors">
              {errors.map((err) => (
                <li key={err}>⚠ {err}</li>
              ))}
            </ul>
          )}
          {success && <p className="import-success">✓ {success}</p>}
        </div>
      )}
    </section>
  )
}


function SourceHealthPanel({ health }: { health: SourceHealth | null }) {
  const channels = health?.channels ?? fallbackHealthChannels
  return (
    <section className="source-health" aria-label="Live Readiness Source Health">
      <div>
        <span>Live Readiness</span>
        <strong>Source Health</strong>
        <small>{health ? `reported ${health.reportedAt}` : '정적 seed · 데이터 미제공'}</small>
      </div>
      <div className="health-grid">
        {channels.map((channel) => (
          <article key={channel.key} className={`health-card ${channel.status}`}>
            <b>{channel.label}</b>
            <span>{healthStatusLabel[channel.status]} · {channel.count}건</span>
            <small>{channel.note || (channel.status === 'empty' ? '데이터 없음' : '계약 준비됨')}</small>
          </article>
        ))}
      </div>
    </section>
  )
}

function useMeasuredBox<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [box, setBox] = useState<Box>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      setBox((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, box }
}

function AgentConstellation({ agents, selectedId, onSelect }: { agents: Agent[]; selectedId: string; onSelect: (id: string) => void }) {
  const { ref: boxRef, box } = useMeasuredBox<HTMLDivElement>()
  const nodes = buildConstellation(agents)
  const edges = buildEdges(agents)
  const byId = new Map(nodes.map((node) => [node.agent.id, node]))

  return (
    <section className="panel constellation-panel" aria-label="Agent Constellation">
      <div className="section-heading">
        <p>Agent Constellation</p>
        <h2>내 에이전트 별자리</h2>
      </div>
      <div className="constellation" ref={boxRef}>
        <svg className="edges" aria-hidden="true">
          <defs>
            <marker id="agent-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 8 4 L 0 8 z" className="edge-arrowhead" />
            </marker>
            <marker id="agent-arrowhead-start" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse" markerUnits="strokeWidth">
              <path d="M 0 0 L 8 4 L 0 8 z" className="edge-arrowhead" />
            </marker>
          </defs>
          {(box.width > 0 && box.height > 0 ? edges : []).map((edge) => {
            const from = byId.get(edge.from)
            const to = byId.get(edge.to)
            if (!from || !to) return null
            const d = connectionPath(from, to, box)
            if (!d) return null
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                data-testid="agent-connection"
                d={d}
                markerEnd="url(#agent-arrowhead)"
                markerStart={edge.mutual ? 'url(#agent-arrowhead-start)' : undefined}
                className={[
                  edge.mutual ? 'mutual' : '',
                  edge.from === selectedId || edge.to === selectedId ? 'focused' : 'faded',
                ].filter(Boolean).join(' ')}
              />
            )
          })}
        </svg>
        {nodes.map(({ agent, x, y }) => (
          <button
            key={agent.id}
            type="button"
            className={`agent-node ${agent.id === selectedId ? 'selected' : ''} ${agent.status}`}
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, '--accent': agent.accent } as React.CSSProperties}
            onClick={() => onSelect(agent.id)}
          >
            <span>{agent.emoji}</span>
            <b>{agent.name}</b>
            <small>{agent.specialty}</small>
          </button>
        ))}
      </div>
    </section>
  )
}



function SoulDiffCard({ drift }: { drift: IdentityDriftSummary }) {
  return (
    <div className={`soul-diff ${drift.status}`}>
      <div className="soul-diff-head">
        <div>
          <h3>{driftStatusLabel[drift.status]}</h3>
        </div>
        <b>{drift.baselineStage || 'baseline 없음'} → {drift.latestStage || 'current'}</b>
      </div>
      <p>{drift.identity}</p>
      <div className="drift-grid">
        <div><span>Autonomy Δ</span><strong>{drift.delta.autonomy > 0 ? '+' : ''}{drift.delta.autonomy}</strong></div>
        <div><span>Memory Δ</span><strong>{drift.delta.memory > 0 ? '+' : ''}{drift.delta.memory}</strong></div>
        <div><span>Skill Δ</span><strong>{drift.delta.skill > 0 ? '+' : ''}{drift.delta.skill}</strong></div>
        <div><span>Level Δ</span><strong>{drift.delta.level > 0 ? '+' : ''}{drift.delta.level}</strong></div>
      </div>
      <div className="drift-chips">
        {drift.badges.length === 0 ? <i>변화 신호 없음</i> : drift.badges.map((badge) => <i key={badge}>{badge}</i>)}
      </div>
      <div className="soul-text-diff">
        <span>Identity text diff</span>
        <div>{drift.soulDelta.identityChanged ? 'identity changed' : 'identity stable'}</div>
        <div>values +{drift.soulDelta.valuesAdded.length} / -{drift.soulDelta.valuesRemoved.length}</div>
        <div>coherence {drift.soulDelta.coherence > 0 ? '+' : ''}{drift.soulDelta.coherence}</div>
      </div>
      <small>{drift.narrative}</small>
    </div>
  )
}

function ActivityBlackbox({ summary }: { summary: AgentActivitySummary }) {
  return (
    <div className={`activity-blackbox ${summary.status}`}>
      <div className="blackbox-head">
        <div>
          <h3>{activityStatusLabel[summary.status]}</h3>
        </div>
        <b>{summary.recentEventCount} events</b>
      </div>
      <div className="blackbox-grid">
        <div><span>마지막 활동</span><strong>{summary.lastActivityAt || '기록 없음'}</strong></div>
        <div><span>변경 파일</span><strong>{summary.changedFiles.length}</strong></div>
      </div>
      <div className="blackbox-chips">
        {summary.validationSignals.length === 0 && summary.operationSignals.length === 0
          ? <i className="muted">활동 신호 없음</i>
          : [...summary.validationSignals, ...summary.operationSignals].map((signal) => <i key={signal} className="ok">{signal}</i>)}
        {summary.riskSignals.map((signal) => <i key={signal} className="warn">{signal}</i>)}
      </div>
      {summary.changedFiles.length > 0 && (
        <div className="file-strip">
          {summary.changedFiles.slice(0, 5).map((file) => <code key={file}>{file}</code>)}
        </div>
      )}
      {summary.latestSummaries.length > 0 && (
        <ol className="blackbox-events">
          {summary.latestSummaries.map((item) => <li key={item}>{item}</li>)}
        </ol>
      )}
    </div>
  )
}

function DetailDisclosure({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string
  summary: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="detail-disclosure" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <small>{summary}</small>
      </summary>
      <div className="detail-disclosure-body">{children}</div>
    </details>
  )
}

function AgentRunbookPanel({ runbook }: { runbook: AgentRunbook }) {
  return (
    <section className="runbook-panel" aria-label="Agent Runbook Operating Manual">
      <div className="runbook-head">
        <div>
          <h3>{runbook.agentName}</h3>
        </div>
        <b className={`runbook-posture ${runbookPostureClass[runbook.posture]}`} data-testid="runbook-posture">
          {postureLabels[runbook.posture]}
        </b>
      </div>
      <p className="runbook-headline">{runbook.headline}</p>
      <small className="runbook-provenance">
        {runbook.provenance === 'merged' ? 'export runbook + derived safety gates' : 'derived from capability/activity/risk signals'}
      </small>
      <div className="runbook-grid">
        {RUNBOOK_SECTIONS.map((section) => {
          const items = runbook[section.key]
          return (
            <div key={section.key} className={`runbook-section ${section.tone}`}>
              <h4>{section.label}</h4>
              {items.length === 0 ? (
                <p className="runbook-empty">신호 없음</p>
              ) : (
                <ul>
                  {items.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <b>{item.label}</b>
                      <small className="runbook-evidence">
                        {item.fromExport ? 'export · ' : ''}{item.evidence}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function AgentDetail({
  agent,
  events,
  evolution,
  soulHistory,
  requests,
}: {
  agent: Agent
  events: SoulMapData['events']
  evolution: SoulMapData['evolution']
  soulHistory: SoulMapData['soulHistory']
  requests: InterAgentRequest[]
}) {
  const score = intelligenceScore(agent)
  const coverage = skillCoverage(agent)
  const velocity = memoryVelocity(agent)
  const risks = riskSignals(agent)
  const activity = summarizeAgentActivity(agent, events)
  const drift = identityDrift(agent, evolution, soulHistory)
  const runbook = buildAgentRunbook(agent, events, requests)

  return (
    <section className="panel agent-detail" aria-label="Selected Agent Detail">
      <div className="agent-title">
        <div className="avatar" style={{ color: agent.accent }}>{agent.emoji}</div>
        <div>
          <p>{agent.kind} · {agent.status}</p>
          <h2>{agent.name}</h2>
        </div>
      </div>
      <p className="description">{agent.description || agent.specialty}</p>
      <div className="signal-grid">
        <div><span>Trust</span><strong>{agent.trust}%</strong><Bar value={agent.trust} color={agent.accent} /></div>
        <div><span>Autonomy</span><strong>{agent.autonomy}%</strong><Bar value={agent.autonomy} color="#34d399" /></div>
        <div><span>Coherence</span><strong>{agent.soul.coherence}%</strong><Bar value={agent.soul.coherence} color="#f472b6" /></div>
      </div>

      <div className="scorecard">
        <div className="scorecard-head">
          <span>Intelligence Scorecard</span>
          <div className={`velocity ${velocity}`}>기억 {memoryVelocityLabel[velocity]}</div>
        </div>
        <div className="scorecard-metrics">
          <div><span>지능 점수</span><strong style={{ color: agent.accent }}>{score}</strong></div>
          <div><span>스킬 커버리지</span><strong>{coverage}%</strong></div>
          <div><span>최근 기억</span><strong>+{agent.memory.recentGrowth}</strong></div>
        </div>
        <div className="risk-chips">
          {risks.length === 0 ? (
            <i className="ok">리스크 신호 없음</i>
          ) : (
            risks.map((risk) => <i key={risk} className="warn">{risk}</i>)
          )}
        </div>
      </div>

      <div className="soul-box">
        <span>Soul / Identity</span>
        <h3>{agent.soul.identity}</h3>
        <p>톤: {agent.soul.tone} · 무드: {agent.soul.mood}</p>
        <div className="chips">{agent.soul.values.map((value) => <i key={value}>{value}</i>)}</div>
      </div>
      <DetailDisclosure title="Soul Diff / Identity Drift" summary={`${driftStatusLabel[drift.status]} · identity delta`} defaultOpen>
        <SoulDiffCard drift={drift} />
      </DetailDisclosure>
      <DetailDisclosure title="Agent Activity Blackbox" summary={`${activityStatusLabel[activity.status]} · ${activity.recentEventCount} events`}>
        <ActivityBlackbox summary={activity} />
      </DetailDisclosure>
      <DetailDisclosure title="Agent Runbook / Operating Manual" summary={`${postureLabels[runbook.posture]} · ${RUNBOOK_SECTIONS.length} sections`}>
        <AgentRunbookPanel runbook={runbook} />
      </DetailDisclosure>
      {agent.skills.length > 0 && (
        <div className="skills">
          {agent.skills.map((skill) => (
            <div key={skill.id}>
              <span>{skill.name}</span>
              <strong>{skill.proficiency}%</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Timeline explorer (Task 5)
// ─────────────────────────────────────────────────────────────

function Timeline({ events, selectedAgent }: { events: SoulMapData['events']; selectedAgent: Agent }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<EventType | 'all'>('all')
  const [minImportance, setMinImportance] = useState<Importance>('low')
  const [selectedOnly, setSelectedOnly] = useState(true)

  const filter: TimelineFilter = {
    query,
    type,
    minImportance,
    agentId: selectedOnly ? selectedAgent.id : undefined,
  }
  const filtered = filterEvents(events, filter)
  const groups = groupByDay(filtered)

  return (
    <section className="panel timeline">
      <div className="section-heading"><p>Conversation & Logs</p><h2>대화/행동 로그 탐색기</h2></div>

      <div className="explorer-controls">
        <input
          className="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="요약·감정·정체성 신호 검색…"
        />
        <div className="filter-row">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip-btn ${type === t ? 'on' : ''}`}
              onClick={() => setType(t)}
            >
              {t === 'all' ? '전체' : typeLabel[t]}
            </button>
          ))}
        </div>
        <div className="filter-row secondary">
          <label>
            최소 중요도
            <select value={minImportance} onChange={(e) => setMinImportance(e.target.value as Importance)}>
              {IMPORTANCE_ORDER.map((imp) => (
                <option key={imp} value={imp}>{importanceLabel[imp]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`chip-btn ${selectedOnly ? 'on' : ''}`}
            onClick={() => setSelectedOnly((v) => !v)}
          >
            {selectedOnly ? `${selectedAgent.name}만` : '전체 에이전트'}
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="empty-state">조건에 맞는 로그가 없습니다.</p>
      ) : (
        groups.map((group) => (
          <div className="day-group" key={group.day}>
            <span>{group.day}</span>
            {group.events.map((event) => (
              <article key={event.id} className={`event ${event.importance}`}>
                <div><b>{typeLabel[event.type]}</b><i>{importanceLabel[event.importance]}</i></div>
                <p>{event.summary}</p>
                {(event.emotion || event.identityShift) && (
                  <small>{[event.emotion, event.identityShift].filter(Boolean).join(' · ')}</small>
                )}
              </article>
            ))}
          </div>
        ))
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Evolution (Task 9)
// ─────────────────────────────────────────────────────────────

function Evolution({ evolution, agent }: { evolution: SoulMapData['evolution']; agent: Agent }) {
  const snapshots = snapshotsForAgent(evolution, agent.id)
  const trend = autonomyTrend(snapshots)
  const level = currentLevel(snapshots)
  const growth = memoryGrowth(snapshots)
  const narrative = evolutionNarrative(snapshots)
  const latest = snapshots.at(-1)
  const nextInflection = latest
    ? `다음 변곡점: Lv.${latest.level + 1} 진입까지 자율성 ${Math.max(0, 90 - latest.autonomy)}p 여유`
    : '스냅샷이 쌓이면 다음 변곡점을 예측합니다.'

  return (
    <section className="panel evolution">
      <div className="section-heading"><p>Evolution Engine</p><h2>영혼의 진화</h2></div>
      <div className="evolution-summary">
        <Metric label="현재 레벨" value={`Lv.${level}`} hint={latest?.stage ?? '데이터 대기'} />
        <Metric label="기억 성장" value={`+${growth}`} hint="첫 스냅샷 대비" />
        <Metric label="자율성 추세" value={trend === 'rising' ? '상승' : trend === 'falling' ? '하락' : '유지'} hint="autonomy delta" />
      </div>

      <div className="narrative-card">
        <span>진화 서사</span>
        <p>{narrative}</p>
        <small>{nextInflection}</small>
      </div>

      {snapshots.length > 0 && (
        <div className="evolution-rail">
          {snapshots.map((snapshot) => (
            <div key={`${snapshot.agentId}-${snapshot.date}`}>
              <div className="bar-track">
                <i style={{ height: `${Math.max(snapshot.autonomy, 18)}%`, background: agent.accent }} />
              </div>
              <b>{snapshot.stage}</b>
              <small>{snapshot.date.slice(5)} · M{snapshot.memoryCount} · S{snapshot.skillCount}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Inter-agent request lab (Task 10)
// ─────────────────────────────────────────────────────────────

function RequestLab({
  agents,
  requests,
  onCreate,
  onAdvance,
  onAudit,
  executionLogs,
}: {
  agents: Agent[]
  requests: InterAgentRequest[]
  onCreate: (req: InterAgentRequest) => void
  onAdvance: (id: string, to: RequestStatus) => void
  onAudit: (log: ExecutionAuditLog) => void
  executionLogs: ExecutionAuditLog[]
}) {
  const byId = new Map(agents.map((agent) => [agent.id, agent.name]))
  const [fromId, setFromId] = useState(agents[0]?.id ?? '')
  const [toId, setToId] = useState(agents[1]?.id ?? agents[0]?.id ?? '')
  const [capability, setCapability] = useState('')
  const [summary, setSummary] = useState('')
  const [priority, setPriority] = useState<Importance>('medium')

  const active = prioritize(activeRequests(requests))
  const status = countByStatus(requests)
  const previewRequest = activeRequests(requests)[0]
  const preview = previewRequest ? buildDryRun(previewRequest, agents) : null
  const latestLogs = executionLogs.slice(0, 5)

  function create() {
    if (!capability.trim() || !summary.trim() || !fromId || !toId) return
    onCreate({
      id: `local-${Date.now()}`,
      fromAgentId: fromId,
      toAgentId: toId,
      capability: capability.trim(),
      summary: summary.trim(),
      status: 'queued',
      priority,
      createdAt: new Date().toISOString(),
    })
    setCapability('')
    setSummary('')
  }

  return (
    <section className="panel request-flow" aria-label="Request Protocol Execution Layer">
      <div className="section-heading"><p>Inter-Agent Protocol</p><h2>에이전트 간 요청 랩</h2></div>
      <div className="status-row">
        {Object.entries(status).map(([key, value]) => (
          <span key={key}>{statusLabel[key as RequestStatus]} {value}</span>
        ))}
      </div>

      <div className="request-form">
        <div className="form-row">
          <label>
            From
            <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label>
            To
            <select value={toId} onChange={(e) => setToId(e.target.value)}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label>
            우선순위
            <select value={priority} onChange={(e) => setPriority(e.target.value as Importance)}>
              {IMPORTANCE_ORDER.map((imp) => <option key={imp} value={imp}>{importanceLabel[imp]}</option>)}
            </select>
          </label>
        </div>
        <input value={capability} onChange={(e) => setCapability(e.target.value)} placeholder="capability (예: calendar.create)" />
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="요청 요약" />
        <button type="button" className="primary" onClick={create}>요청 생성</button>
      </div>

      {preview && (
        <div className={`execution-preview ${preview.approvalRequired ? 'gated' : 'ready'}`}>
          <div className="execution-head">
            <div>
              <span>Execution Preview</span>
              <h3>dry-run · {preview.target.kind}</h3>
            </div>
            <b>{executionActionLabel[preview.target.action]}</b>
          </div>
          <p>{preview.target.label}</p>
          <div className="execution-flags">
            <span className={preview.approvalRequired ? 'warn' : 'ok'}>
              {preview.approvalRequired ? 'approval required' : 'approval not required'}
            </span>
            <span>external mutation performed: false</span>
          </div>
          <ul>
            {preview.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <button type="button" className="advance" onClick={() => onAudit(simulateExecution(preview, { approved: false }))}>
            simulate execution
          </button>
        </div>
      )}

      {latestLogs.length > 0 && (
        <div className="audit-log">
          <h3>Audit Log</h3>
          {latestLogs.map((log) => (
            <article key={log.id} className={`audit-row ${log.status}`}>
              <b>{executionStatusLabel[log.status]} · {log.target}/{log.action}</b>
              <p>{log.reason}</p>
              <small>{log.mode} · {log.createdAt} · external mutation performed: false</small>
            </article>
          ))}
        </div>
      )}

      {active.length === 0 ? (
        <p className="empty-state">진행 중인 요청이 없습니다.</p>
      ) : (
        active.map((request) => {
          const next = NEXT_STATUS[request.status]
          const canAdvance = next ? canTransition(request.status, next) : false
          return (
            <article key={request.id} className="request-card">
              <div><b>{byId.get(request.fromAgentId) ?? request.fromAgentId}</b><span>→</span><b>{byId.get(request.toAgentId) ?? request.toAgentId}</b></div>
              <h3>{request.capability}</h3>
              <p>{request.summary}</p>
              <div className="request-foot">
                <small>{statusLabel[request.status]} · {importanceLabel[request.priority]}</small>
                {canAdvance && next && (
                  <button type="button" className="advance" onClick={() => onAdvance(request.id, next)}>
                    → {statusLabel[next]}
                  </button>
                )}
              </div>
            </article>
          )
        })
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Delegation Graph Replay
// ─────────────────────────────────────────────────────────────

function DelegationReplayPanel({
  agents,
  events,
  requests,
}: {
  agents: Agent[]
  events: SoulMapData['events']
  requests: InterAgentRequest[]
}) {
  const replay = useMemo(
    () => buildDelegationReplay(agents, events, requests),
    [agents, events, requests],
  )
  const { steps, edges, status, riskCount, latestPath } = replay

  return (
    <section className="panel delegation-replay" aria-labelledby="delegation-replay-heading">
      <div className="section-heading">
        <p>Delegation Graph Replay</p>
        <h2 id="delegation-replay-heading">위임 흐름 리플레이</h2>
      </div>
      <p className="panel-note">누적 위임 경로(과거 흐름) 기준. 현재 큐는 요청 랩 참조.</p>

      <div className="replay-status">
        <span className={`flow-badge ${status}`} aria-label={`흐름 상태: ${flowStatusLabel[status]}`}>
          {flowStatusLabel[status]}
        </span>
        <span>스텝 {steps.length}</span>
        <span>리스크 {riskCount}</span>
        {latestPath && (
          <span className="latest-path">최근: {latestPath.fromName} → {latestPath.toName}</span>
        )}
      </div>

      {edges.length === 0 ? (
        <p className="empty-state">관측된 위임 경로가 없습니다.</p>
      ) : (
        <div className="replay-edges">
          {edges.map((edge) => (
            <span
              key={`${edge.from}-${edge.to}`}
              className={`replay-edge ${edge.hasRisk ? 'risk' : ''}`}
              aria-label={edge.hasRisk ? `${edge.fromName}에서 ${edge.toName}, 리스크 있음` : undefined}
            >
              {edge.fromName} → {edge.toName} ×{edge.count}
              {edge.hasRisk && <b> ⚠리스크</b>}
            </span>
          ))}
        </div>
      )}

      {steps.length === 0 ? (
        <p className="empty-state">리플레이할 위임 스텝이 없습니다.</p>
      ) : (
        <ol className="replay-steps">
          {steps.map((step) => (
            <li key={step.id} className={`replay-step ${step.kind} ${step.risk ? 'risk' : ''}`}>
              <div className="replay-step-head">
                <b>{step.sourceName}{step.targetName ? ` → ${step.targetName}` : ''}</b>
                <i>{step.risk ? '⚠ 리스크' : stepKindLabel[step.kind]}</i>
              </div>
              <p>{step.summary}</p>
              <small>
                {step.title} · {importanceLabel[step.importance]}
                {step.status ? ` · ${statusLabel[step.status]}` : ''}
              </small>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// Capability Readiness Matrix (Task 4)
// ─────────────────────────────────────────────────────────────

function ReadinessBadge({ cell }: { cell: CapabilityReadinessCell }) {
  const title = `${cell.agentName} · ${capabilityLabels[cell.capability]}\n${readinessLabel[cell.status]} (${cell.score})\n${cell.reasons.join('\n')}`
  return (
    <span
      className={`readiness-cell ${cell.status}`}
      title={title}
      aria-label={`${cell.agentName}, ${capabilityLabels[cell.capability]}: ${readinessLabel[cell.status]}, 점수 ${cell.score}`}
    >
      <b>{readinessLabel[cell.status]}</b>
      {cell.status !== 'idle' && <i>{cell.score}</i>}
    </span>
  )
}

function CapabilityReadinessMatrixPanel({
  agents,
  events,
  requests,
}: {
  agents: Agent[]
  events: SoulMapData['events']
  requests: InterAgentRequest[]
}) {
  const matrix = useMemo(
    () => buildCapabilityReadiness(agents, events, requests),
    [agents, events, requests],
  )
  const cellFor = (agentId: string, capability: (typeof CAPABILITY_ORDER)[number]) =>
    matrix.cells.find((c) => c.agentId === agentId && c.capability === capability)

  const readyCount = matrix.topReady.length
  const gatedCount = matrix.gated.length

  return (
    <section className="panel capability-matrix">
      <div className="section-heading">
        <p>Capability Readiness Matrix</p>
        <h2>누가 무엇을 맡을 준비가 됐는가</h2>
      </div>
      <p className="panel-note">
        셀은 Agent · Skill · Event · Activity · Risk · Soul 신호에서 파생됩니다 (하드코딩 없음).
        외부 발송/변경은 신뢰가 높아도 <b>승인 게이트</b>로 표시됩니다.
      </p>

      <div className="readiness-summary">
        <span className="ready">지금 맡길 수 있음 {readyCount}</span>
        <span className="approval_gated">승인 게이트 {gatedCount}</span>
        {matrix.topReady.slice(0, 4).map((c) => (
          <i key={`${c.agentId}-${c.capability}`} className="ready">
            {c.agentName} · {capabilityLabels[c.capability]}
          </i>
        ))}
      </div>

      {agents.length === 0 ? (
        <p className="empty-state">에이전트가 없어 매트릭스를 만들 수 없습니다.</p>
      ) : (
        <div className="matrix-scroll">
          <table className="readiness-table">
            <thead>
              <tr>
                <th scope="col">Capability</th>
                {agents.map((a) => (
                  <th key={a.id} scope="col" title={a.name}>
                    <span className="agent-col" style={{ color: a.accent }}>
                      {a.emoji}
                    </span>
                    <small>{a.name}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_ORDER.map((cap) => (
                <tr key={cap}>
                  <th scope="row">{capabilityLabels[cap]}</th>
                  {agents.map((a) => {
                    const cell = cellFor(a.id, cap)
                    return (
                      <td key={a.id}>{cell ? <ReadinessBadge cell={cell} /> : null}</td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="readiness-legend" aria-label="상태 범례">
        {(Object.keys(readinessLabel) as ReadinessStatus[]).map((s) => (
          <span key={s} className={`legend-dot ${s}`}>
            {readinessLabel[s]}
          </span>
        ))}
      </div>
    </section>
  )
}

function Roadmap({ roadmap }: { roadmap: SoulMapData['roadmap'] }) {
  if (roadmap.length === 0) return null
  return (
    <section className="panel roadmap">
      <div className="section-heading"><p>Platform Roadmap</p><h2>MVP에서 고도화까지</h2></div>
      <div className="roadmap-grid">
        {roadmap.map((item) => (
          <article key={item.id} className={item.phase}>
            <span>{item.done ? '완료' : item.phase}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

const tradingLayers = [
  { id: '0', label: '데이터 수집', mode: '⇉ 병렬', agents: ['Hermes Default', 'izera365'] },
  { id: '1a', label: '매크로·섹터 분석', mode: '⇉ 병렬', agents: ['Claude Code', 'Codex'] },
  { id: '1b', label: '기술 분석 순차', mode: '→ 순차', agents: ['n8n MCP', 'Google Workspace'] },
  { id: '2', label: '레짐·내러티브', mode: '→ 순차', agents: ['Soul Map'] },
  { id: '3', label: '시나리오·전략 초안', mode: '→ 순차', agents: ['Doc Auto Agent'] },
]

function TradingSidebar({ requests }: { requests: InterAgentRequest[] }) {
  return (
    <aside className="trading-sidebar" aria-label="실행 기록">
      <h2>📂 실행 기록</h2>
      <button className="archive-item live" type="button"><span />현재 실행 <b>LIVE</b></button>
      {requests.slice(0, 5).map((request, index) => (
        <div className="archive-item" key={request.id}>
          <span />
          <strong>ARC-{String(index + 1).padStart(2, '0')}</strong>
          <small>{request.status.toUpperCase()}</small>
        </div>
      ))}
      <p>ARCHIVE · 최신 요청 5개</p>
    </aside>
  )
}

function PipelineLayerStrip({ agents }: { agents: Agent[] }) {
  const agentNames = new Set(agents.map((agent) => agent.name))
  return (
    <section className="pipeline-strip panel" aria-label="Agent Soul Map Pipeline Layers">
      <div className="section-heading"><p>Agent Soul Map Pipeline</p><h2>레이어 기반 운영 흐름</h2></div>
      <div className="pipeline-scroll">
        {tradingLayers.map((layer) => (
          <article className="pipeline-layer" key={layer.id}>
            <div className="layer-badge">LAYER {layer.id}</div>
            <strong>{layer.label}</strong>
            <span>{layer.mode}</span>
            <div>
              {layer.agents.map((name) => (
                <i className={agentNames.has(name) ? 'online' : 'planned'} key={name}>{name}</i>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function App() {
  const [data, setData] = useState<SoulMapData>(() => loadSeed())
  const [requests, setRequests] = useState<InterAgentRequest[]>(() => loadSeed().requests)
  const [runtimeEvents, setRuntimeEvents] = useState<SoulMapData['events']>([])
  const [executionLogs, setExecutionLogs] = useState<ExecutionAuditLog[]>([])
  const [selectedId, setSelectedId] = useState(() => loadSeed().agents[0]?.id ?? '')
  const [sourceLabel, setSourceLabel] = useState('정적 seed')
  const [sourceHealth, setSourceHealth] = useState<SourceHealth | null>(null)

  // 데이터 소스가 바뀌면(가져오기/리셋) 요청 큐와 선택을 동기화한다.
  useEffect(() => {
    setRequests(data.requests)
    setRuntimeEvents([])
    setExecutionLogs([])
    setSelectedId((prev) => (data.agents.some((a) => a.id === prev) ? prev : data.agents[0]?.id ?? ''))
  }, [data])

  const executionEvents = useMemo(
    () => executionLogs.map(auditLogToEvent),
    [executionLogs],
  )

  const activityEvents = useMemo(
    () => [...data.events, ...requestActivityEvents(requests), ...runtimeEvents, ...executionEvents],
    [data.events, requests, runtimeEvents, executionEvents],
  )

  const selectedAgent = useMemo(
    () => data.agents.find((agent) => agent.id === selectedId) ?? data.agents[0],
    [data, selectedId],
  )

  const activeAgentCount = data.agents.filter((agent) => agent.status === 'active').length
  const totalMemory = data.agents.reduce((sum, agent) => sum + agent.memory.longTerm, 0)

  if (!selectedAgent) {
    return (
      <main className="app-shell">
        <p className="empty-state">가져온 데이터에 에이전트가 없습니다. seed로 되돌려 주세요.</p>
        <ImportPanel
          onApply={(next, meta) => { setData(next); setSourceLabel('가져온 export'); setSourceHealth(meta.health) }}
          onReset={() => { setData(loadSeed()); setSourceLabel('정적 seed'); setSourceHealth(null) }}
        />
      </main>
    )
  }

  const completedAgents = data.agents.filter((agent) => agent.status === 'active').length

  return (
    <main className="app-shell trading-room-shell" data-testid="trading-room-shell">
      <header className="hero-header trading-header" aria-label="Agent Soul Map Operations Room">
        <nav>
          <b className="maca-logo"><span>AGENT</span><span>SOUL MAP</span></b>
          <span>AGENT IDENTITY PIPELINE</span>
          <span className={`source-mode ${sourceHealth ? 'imported' : 'seed'}`}>{sourceLabel}</span>
          <span className="live-badge">● LIVE</span>
          <span className="complete-badge">{completedAgents}/{data.agents.length} COMPLETE</span>
        </nav>
        <div className="hero-copy">
          <p>동한의 AI 운영체제를 시각화하는 실험실</p>
          <h1>Agent Soul Map</h1>
          <h2>다크 터미널 미학으로 에이전트의 대화, 기억, 승인 게이트, 실행 로그를 한 화면에서 관제한다.</h2>
        </div>
        <ImportPanel
          onApply={(next, meta) => { setData(next); setSourceLabel('가져온 export'); setSourceHealth(meta.health) }}
          onReset={() => { setData(loadSeed()); setSourceLabel('정적 seed'); setSourceHealth(null) }}
        />
        <div className="metrics-row">
          <Metric label="에이전트" value={`${data.agents.length}`} hint={`${activeAgentCount} active`} />
          <Metric label="장기 기억" value={`${totalMemory}`} hint="profile memory signals" />
          <Metric label="요청 큐" value={`${activeRequests(requests).length}`} hint="inter-agent handoff" />
        </div>
        <SourceHealthPanel health={sourceHealth} />
      </header>

      <div className="trading-layout">
        <TradingSidebar requests={requests} />
        <div className="trading-workspace">
          <div className="pipeline-zone">
            <PipelineLayerStrip agents={data.agents} />
          </div>
          <div className="dashboard-grid trading-main">
            <AgentConstellation agents={data.agents} selectedId={selectedId} onSelect={setSelectedId} />
            <AgentDetail agent={selectedAgent} events={activityEvents} evolution={data.evolution} soulHistory={data.soulHistory} requests={requests} />
            <Timeline events={activityEvents} selectedAgent={selectedAgent} />
            <Evolution evolution={data.evolution} agent={selectedAgent} />
            <RequestLab
              agents={data.agents}
              requests={requests}
              onCreate={(req) => setRequests((prev) => [req, ...prev])}
              onAdvance={(id, to) =>
                setRequests((prev) => prev.map((r) => {
                  if (r.id !== id) return r
                  const next = transition(r, to)
                  setRuntimeEvents((events) => [
                    ...events,
                    ...requestActivityEvents([{ ...next, createdAt: new Date().toISOString() }]),
                  ])
                  return next
                }))
              }
              executionLogs={executionLogs}
              onAudit={(log) => {
                setExecutionLogs((logs) => [log, ...logs])
              }}
            />
            <DelegationReplayPanel agents={data.agents} events={activityEvents} requests={requests} />
            <CapabilityReadinessMatrixPanel agents={data.agents} events={activityEvents} requests={requests} />
            <Roadmap roadmap={data.roadmap} />
          </div>
        </div>
      </div>
    </main>
  )
}

export default App
