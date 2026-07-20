// Core domain model for the Hermes Agent Soul Map.
//
// These types are the contract between the (currently static) data layer and
// the UI. When real Hermes session logs / memory / cron / skills are connected
// later, the adapter only needs to produce values that satisfy these shapes —
// no UI changes required. See `src/data/source.ts`.

export type AgentKind =
  | 'default' // Hermes 기본 인격
  | 'specialist' // 특화 전문 에이전트
  | 'tool' // Claude Code, Codex 등 도구형
  | 'integration' // Google Workspace, n8n 등 외부 연동
  | 'future' // 아직 합류하지 않은 예정 에이전트

export type AgentStatus =
  | 'active' // 지금 살아 움직이는 중
  | 'idle' // 연결됐지만 대기
  | 'dormant' // 연결됐으나 오래 활동 없음
  | 'planned' // 로드맵상 예정, 아직 미연결

export type EventSource =
  | 'hermes'
  | 'izera365'
  | 'claude-code'
  | 'codex'
  | 'google-workspace'
  | 'n8n'
  | 'discord'
  | 'cron'

export type EventType =
  | 'message' // 대화
  | 'action' // 실행/작업
  | 'memory' // 기억 형성
  | 'decision' // 판단/결정
  | 'skill' // 스킬 습득/사용
  | 'handoff' // 에이전트 간 위임

export type Importance = 'low' | 'medium' | 'high' | 'critical'

/** 정체성/영혼 신호 — 에이전트가 "누구인지"를 나타내는 정성 데이터. */
export interface SoulSignals {
  /** 한 줄 자기 정의 */
  identity: string
  /** 핵심 가치 (에이전트가 판단할 때 우선하는 것) */
  values: string[]
  /** 말투/성격 톤 */
  tone: string
  /** 감정 상태 라벨 (최근 로그에서 집계 가능) */
  mood: string
  /** 0–100, 자기 일관성(같은 상황에서 같은 판단을 하는 정도) */
  coherence: number
}

/** 기억 성장 지표. 실제로는 memory 파일 수/토큰으로 채워질 슬롯. */
export interface MemoryStats {
  /** 저장된 기억(장기) 수 */
  longTerm: number
  /** 최근 7일 신규 기억 수 */
  recentGrowth: number
  /** 마지막 기억 형성 ISO 시각 */
  lastConsolidated: string
}

export interface Skill {
  id: string
  name: string
  /** 0–100 숙련도 */
  proficiency: number
  /** 이 스킬을 습득한 ISO 날짜 */
  acquiredAt: string
}

export interface Agent {
  id: string
  /** 화면에 표시되는 이름 */
  name: string
  kind: AgentKind
  status: AgentStatus
  /** 전문 분야 한 줄 요약 */
  specialty: string
  /** 상세 설명 */
  description: string
  /** 0–100, 이 에이전트에게 얼마나 위임/신뢰하는가 */
  trust: number
  /** 0–100, 사람 개입 없이 스스로 처리하는 비율 */
  autonomy: number
  emoji: string
  /** 시각적 강조 색 (hex) */
  accent: string
  soul: SoulSignals
  memory: MemoryStats
  skills: Skill[]
  /** 이 에이전트가 협업/의존하는 다른 에이전트 id들 */
  connections: string[]
}

export interface LogEvent {
  id: string
  agentId: string
  source: EventSource
  type: EventType
  /** ISO 8601 */
  timestamp: string
  /** 사람이 읽는 요약 */
  summary: string
  importance: Importance
  /** 감정 신호 라벨 (예: "집중", "불안", "성취감") */
  emotion?: string
  /** 정체성 신호 — 이 이벤트가 에이전트의 자아에 미친 영향 */
  identityShift?: string
}

/** 시간에 따른 성장 스냅샷 — 진화 뷰의 원천 데이터. */
export interface EvolutionSnapshot {
  agentId: string
  /** ISO 날짜 (해당 시점) */
  date: string
  /** 성장 단계 레벨 (1부터) */
  level: number
  /** 단계 이름 (예: "탐색기", "숙련기") */
  stage: string
  memoryCount: number
  skillCount: number
  /** 0–100 */
  autonomy: number
}

/** 시간에 따른 정체성/영혼 스냅샷 — identity text diff의 원천 데이터. */
export interface SoulSnapshot {
  agentId: string
  date: string
  identity: string
  values: string[]
  tone: string
  mood: string
  coherence: number
}

export type RequestStatus =
  | 'queued'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'declined'

/** 에이전트 간 요청/협업 프로토콜의 한 건. */
export interface InterAgentRequest {
  id: string
  fromAgentId: string
  toAgentId: string
  /** 요청하는 능력/의도 */
  capability: string
  /** 요청 내용 요약 */
  summary: string
  status: RequestStatus
  priority: Importance
  /** ISO 8601 */
  createdAt: string
}

export type RoadmapPhase = 'mvp' | 'next' | 'future'

export interface RoadmapItem {
  id: string
  phase: RoadmapPhase
  title: string
  description: string
  /** 완료 여부 (mvp 항목 체크용) */
  done: boolean
}

/** UI가 소비하는 전체 스냅샷. */
export interface SoulMapData {
  agents: Agent[]
  events: LogEvent[]
  evolution: EvolutionSnapshot[]
  soulHistory: SoulSnapshot[]
  requests: InterAgentRequest[]
  roadmap: RoadmapItem[]
}
