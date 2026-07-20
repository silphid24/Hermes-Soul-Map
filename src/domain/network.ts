import type { Agent } from '../types'

export interface GraphNode {
  agent: Agent
  /** 0–1 정규화 좌표 (원형 배치) */
  x: number
  y: number
}

export interface GraphEdge {
  from: string
  to: string
  /** 양방향 연결이면 true */
  mutual: boolean
}

/**
 * 에이전트 목록을 별자리(방사형) 그래프로 배치한다.
 * `default` 종류의 에이전트는 항상 중앙(0.5, 0.5)에 두고,
 * 나머지는 바깥 원 위에 균등 배치한다.
 */
export function buildConstellation(agents: Agent[]): GraphNode[] {
  const core = agents.filter((a) => a.kind === 'default')
  const orbit = agents.filter((a) => a.kind !== 'default')

  const nodes: GraphNode[] = core.map((agent) => ({
    agent,
    x: 0.5,
    y: 0.5,
  }))

  // Keep enough padding for the 164px cards so edge nodes do not clip.
  const radius = 0.34
  orbit.forEach((agent, i) => {
    // 12시 방향에서 시작해 시계방향으로 균등 분배
    const angle = (i / orbit.length) * Math.PI * 2 - Math.PI / 2
    nodes.push({
      agent,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
    })
  })

  return nodes
}

/**
 * connections 필드에서 중복 없는 간선 목록을 만든다.
 * A→B, B→A가 모두 있으면 하나의 mutual 간선으로 합친다.
 * 존재하지 않는 에이전트를 가리키는 연결은 버린다.
 */
export function buildEdges(agents: Agent[]): GraphEdge[] {
  const ids = new Set(agents.map((a) => a.id))
  const seen = new Map<string, GraphEdge>()

  for (const agent of agents) {
    for (const target of agent.connections) {
      if (!ids.has(target) || target === agent.id) continue
      const key = [agent.id, target].sort().join('::')
      const existing = seen.get(key)
      if (existing) {
        existing.mutual = true
      } else {
        seen.set(key, { from: agent.id, to: target, mutual: false })
      }
    }
  }

  return [...seen.values()]
}
