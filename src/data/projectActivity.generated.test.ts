import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const generated = 'src/data/projectActivity.ts'

function git(args: string[]): { ok: boolean; output: string } {
  try {
    return { ok: true, output: execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string }
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() }
  }
}

describe('generated project activity data', () => {
  const inRepo = existsSync(join(root, '.git'))

  it.runIf(inRepo)('is not tracked in git, so pretest/prebuild never dirty the working tree', () => {
    const tracked = git(['ls-files', '--error-unmatch', generated])
    expect(
      tracked.ok,
      `${generated}는 predev/prebuild/pretest 가 로컬 ~/.hermes 와 파일 mtime 으로 매번 다시 쓰는 파일이다. ` +
        `추적 상태로 두면 테스트를 돌리기만 해도 워킹트리가 더러워지고 머신 고유 활동 기록이 커밋된다.`,
    ).toBe(false)
  })

  it.runIf(inRepo)('is ignored by git', () => {
    expect(git(['check-ignore', generated]).ok, `${generated} 가 .gitignore 에 없다`).toBe(true)
  })
})
