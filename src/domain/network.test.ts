import { describe, it, expect } from 'vitest'
import { buildConstellation, buildEdges } from './network'
import type { Agent } from '../types'

function makeAgent(id: string, kind: Agent['kind'], connections: string[] = []): Agent {
  return {
    id,
    name: id,
    kind,
    status: 'active',
    specialty: '',
    description: '',
    trust: 50,
    autonomy: 50,
    emoji: '🤖',
    accent: '#fff',
    soul: { identity: '', values: [], tone: '', mood: '', coherence: 50 },
    memory: { longTerm: 0, recentGrowth: 0, lastConsolidated: '' },
    skills: [],
    connections,
  }
}

describe('buildConstellation', () => {
  it('default 에이전트를 정중앙에 배치한다', () => {
    const nodes = buildConstellation([
      makeAgent('hermes', 'default'),
      makeAgent('a', 'specialist'),
      makeAgent('b', 'tool'),
    ])
    const core = nodes.find((n) => n.agent.id === 'hermes')
    expect(core).toBeDefined()
    expect(core!.x).toBe(0.5)
    expect(core!.y).toBe(0.5)
  })

  it('궤도 노드를 원 안(0..1 범위)에 배치한다', () => {
    const nodes = buildConstellation([
      makeAgent('hermes', 'default'),
      makeAgent('a', 'specialist'),
      makeAgent('b', 'tool'),
      makeAgent('c', 'integration'),
    ])
    const orbit = nodes.filter((n) => n.agent.id !== 'hermes')
    expect(orbit).toHaveLength(3)
    for (const n of orbit) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(1)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeLessThanOrEqual(1)
      // 중앙이 아니어야 한다
      expect(n.x === 0.5 && n.y === 0.5).toBe(false)
    }
  })

  it('빈 목록에도 안전하다', () => {
    expect(buildConstellation([])).toEqual([])
  })
})

describe('buildEdges', () => {
  it('단방향 연결을 mutual=false 간선으로 만든다', () => {
    const edges = buildEdges([
      makeAgent('a', 'default', ['b']),
      makeAgent('b', 'specialist', []),
    ])
    expect(edges).toHaveLength(1)
    expect(edges[0].mutual).toBe(false)
  })

  it('양방향 연결을 하나의 mutual 간선으로 합친다', () => {
    const edges = buildEdges([
      makeAgent('a', 'default', ['b']),
      makeAgent('b', 'specialist', ['a']),
    ])
    expect(edges).toHaveLength(1)
    expect(edges[0].mutual).toBe(true)
  })

  it('존재하지 않는 대상과 자기 연결은 버린다', () => {
    const edges = buildEdges([
      makeAgent('a', 'default', ['ghost', 'a', 'b']),
      makeAgent('b', 'specialist', []),
    ])
    expect(edges).toHaveLength(1)
    expect(edges[0].to).toBe('b')
  })
})
