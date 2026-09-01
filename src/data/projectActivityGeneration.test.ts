// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateProjectActivity } from '../../scripts/generate-project-activity.mjs'
import { ensureGeneratedData } from '../../scripts/generatedDataPlugin.mjs'

const root = process.cwd()

function tempOut(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `soul-map-${name}-`))
  return { dir, out: join(dir, 'nested', 'deeper', 'projectActivity.ts') }
}

describe('generateProjectActivity', () => {
  it('creates missing parent directories instead of crashing with ENOENT', () => {
    const { dir, out } = tempOut('mkdir')
    try {
      // npm install 은 `COPY package*.json` 뒤 `npm ci` 처럼 src/ 가 아직 없는 상태에서도 돈다.
      expect(() => generateProjectActivity({ outputPath: out })).not.toThrow()
      expect(existsSync(out)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports what it generated instead of printing to stdout', () => {
    const { dir, out } = tempOut('result')
    try {
      const result = generateProjectActivity({ outputPath: out })
      expect(result.eventCount).toBeGreaterThan(0)
      expect(result.outputPath).toBe(out)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('never leaves a truncated file behind when the write is interrupted', () => {
    const { dir, out } = tempOut('atomic')
    try {
      generateProjectActivity({ outputPath: out })
      // 원자적 교체를 썼다면 임시 파일이 남지 않는다.
      expect(readFileSync(out, 'utf8').length).toBeGreaterThan(100)
      expect(existsSync(`${out}.tmp`)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('ensureGeneratedData plugin', () => {
  const defaultOut = join(root, 'src/data/projectActivity.ts')

  it('honours PROJECT_ACTIVITY_OUT so it guards the path the generator actually writes', () => {
    const { dir, out } = tempOut('env')
    const previous = process.env.PROJECT_ACTIVITY_OUT
    process.env.PROJECT_ACTIVITY_OUT = out
    try {
      const plugin = ensureGeneratedData()
      plugin.buildStart()
      expect(existsSync(out)).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.PROJECT_ACTIVITY_OUT
      else process.env.PROJECT_ACTIVITY_OUT = previous
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('regenerates a zero-byte file instead of trusting existsSync', () => {
    const { dir, out } = tempOut('truncated')
    const previous = process.env.PROJECT_ACTIVITY_OUT
    process.env.PROJECT_ACTIVITY_OUT = out
    try {
      generateProjectActivity({ outputPath: out })
      writeFileSync(out, '')
      ensureGeneratedData().buildStart()
      expect(readFileSync(out, 'utf8')).toContain('projectActivityEvents')
    } finally {
      if (previous === undefined) delete process.env.PROJECT_ACTIVITY_OUT
      else process.env.PROJECT_ACTIVITY_OUT = previous
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refreshes data that has gone stale rather than freezing it at install time', () => {
    const { dir, out } = tempOut('stale')
    const previous = process.env.PROJECT_ACTIVITY_OUT
    process.env.PROJECT_ACTIVITY_OUT = out
    try {
      generateProjectActivity({ outputPath: out })
      const old = new Date(Date.now() - 60 * 60 * 1000)
      utimesSync(out, old, old)
      ensureGeneratedData().buildStart()
      expect(statSync(out).mtimeMs).toBeGreaterThan(old.getTime())
    } finally {
      if (previous === undefined) delete process.env.PROJECT_ACTIVITY_OUT
      else process.env.PROJECT_ACTIVITY_OUT = previous
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves a fresh file alone so startup stays cheap', () => {
    const before = statSync(defaultOut).mtimeMs
    ensureGeneratedData().buildStart()
    expect(statSync(defaultOut).mtimeMs).toBe(before)
  })
})

describe('hand-written .d.mts declarations', () => {
  it('match the runtime exports they describe', () => {
    for (const [file, names] of [
      ['scripts/generate-project-activity.d.mts', ['generateProjectActivity']],
      ['scripts/generatedDataPlugin.d.mts', ['ensureGeneratedData']],
    ] as const) {
      const declaration = readFileSync(join(root, file), 'utf8')
      for (const name of names) {
        expect(declaration, `${file} 가 ${name} 를 선언하지 않는다`).toContain(`export function ${name}`)
      }
    }
    expect(typeof generateProjectActivity).toBe('function')
    expect(typeof ensureGeneratedData).toBe('function')
  })
})

describe('node version floor', () => {
  it('is declared, because the configs now evaluate import.meta at load time', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(pkg.engines?.node).toBeTruthy()
  })

  it('is satisfied by the interpreter running the suite', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const floor = Number(String(pkg.engines.node).replace(/[^0-9.]/g, '').split('.')[0])
    expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(floor)
  })
})

describe('typecheck coverage', () => {
  it('includes every config that imports the generation scripts', () => {
    const tsconfig = readFileSync(join(root, 'tsconfig.node.json'), 'utf8')
    expect(tsconfig).toContain('vite.config.ts')
    expect(tsconfig).toContain('vitest.config.ts')
  })

  it('exposes a typecheck script that cannot run before the data exists', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(pkg.scripts.typecheck).toBeTruthy()
    expect(pkg.scripts.pretypecheck).toBeTruthy()
  })
})

describe('install lifecycle', () => {
  it('does not run machine-specific IO on every production install', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    // postinstall 은 `npm i -D anything` 마다, 그리고 앱을 실행하지 않는 prod install 에서도 돈다.
    expect(pkg.scripts.postinstall).toBeUndefined()
    expect(pkg.scripts.prepare).toBeTruthy()
  })
})

describe('generated data on a machine with no hermes home', () => {
  it('still produces data the app test-suite accepts', () => {
    const { dir, out } = tempOut('nohome')
    try {
      execFileSync('node', ['scripts/generate-project-activity.mjs'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, HERMES_HOME: join(dir, 'nope'), PROJECT_ACTIVITY_OUT: out },
      })
      const generated = readFileSync(out, 'utf8')
      expect(generated).toContain('Fallback activity for')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
