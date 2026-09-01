import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { summarizeAgentActivity } from '../domain/activity'
import { seed } from './seed'

const HERMES_STALE_CUTOFF = new Date('2026-07-16T23:59:59Z').getTime()

function summaryFor(agentId: string) {
  const agent = seed.agents.find((item) => item.id === agentId)
  expect(agent).toBeTruthy()
  if (!agent) throw new Error(`missing agent ${agentId}`)
  return summarizeAgentActivity(agent, seed.events)
}

describe('seed project activity freshness', () => {
  it('does not stamp every visible agent with one shared heartbeat timestamp', () => {
    const timestamps = seed.agents
      .filter((agent) => agent.status !== 'planned')
      .map((agent) => summarizeAgentActivity(agent, seed.events).lastActivityAt)

    expect(new Set(timestamps).size).toBeGreaterThan(3)
  })

  // 원래 이 테스트는 무조건 "최신"을 요구했다. 그러면 `~/.hermes` 가 없는 CI 러너나 새 클론에서
  // 생성기가 seed snapshot 으로 폴백하는 순간 빨간불이 된다 — 작성자 머신에서만 통과하는 테스트다.
  // 진짜 불변식은 "타임스탬프가 evidence 와 일치한다"이다: evidence 가 있으면 최신이어야 하고,
  // 없으면 stale 인 채로 폴백이라고 밝혀야 한다. 어느 쪽이든 현재 활동을 지어내면 실패한다.
  it('derives each profile-backed agent timestamp from its evidence, fresh or fallback', () => {
    for (const agentId of ['hermes-default', 'izera365', 'doc-auto-agent', 'ai-trend-radar', 'claude-code']) {
      const summary = summaryFor(agentId)
      const newest = summary.latestSummaries[0]
      const at = new Date(summary.lastActivityAt).getTime()

      if (/Fallback activity for/.test(newest)) {
        expect(newest, `${agentId}: 폴백이면 근거 부재를 밝혀야 한다`).toContain('preserving seed snapshot')
        expect(at, `${agentId}: evidence 없이 최신으로 보이면 안 된다`).toBeLessThanOrEqual(HERMES_STALE_CUTOFF)
      } else {
        expect(newest, `${agentId}: 알 수 없는 activity 출처`).toMatch(
          /Observed activity|Project artifact updated/,
        )
        expect(at, `${agentId}: source-derived 인데 stale`).toBeGreaterThan(HERMES_STALE_CUTOFF)
      }
    }
  })

  it('keeps inactive or stale agents stale instead of fabricating same-day operation', () => {
    const social = summaryFor('social-media')
    expect(new Date(social.lastActivityAt).getTime()).toBeLessThanOrEqual(HERMES_STALE_CUTOFF)
    expect(social.latestSummaries[0]).not.toContain('Operational heartbeat')
  })

  it('can generate deterministic fallback events when HERMES_HOME is missing', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'soul-map-missing-hermes-'))
    const outPath = join(tempDir, 'projectActivity.ts')

    const output = execFileSync('node', ['scripts/generate-project-activity.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        HERMES_HOME: join(tempDir, 'missing-home'),
        PROJECT_ACTIVITY_OUT: outPath,
      },
    })

    const generated = readFileSync(outPath, 'utf8')
    expect(output).toContain('source-derived activity events')
    expect(generated).toContain('Fallback activity for izera365 M365 profile')
    expect(generated).toContain('preserving seed snapshot')
    expect(generated).not.toContain('Operational heartbeat')
  })
})
