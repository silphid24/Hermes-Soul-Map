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

  it('keeps actually active profile-backed agents fresh from profile/session/cron evidence', () => {
    for (const agentId of ['hermes-default', 'izera365', 'doc-auto-agent', 'ai-trend-radar', 'claude-code']) {
      const summary = summaryFor(agentId)
      expect(new Date(summary.lastActivityAt).getTime()).toBeGreaterThan(HERMES_STALE_CUTOFF)
      expect(summary.latestSummaries[0]).toMatch(/Observed activity|Project artifact updated/)
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
