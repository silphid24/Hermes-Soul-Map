import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const generator = resolve(root, 'scripts/generate-project-activity.mjs')
const output = resolve(root, 'src/data/projectActivity.ts')

/**
 * `src/data/projectActivity.ts`는 생성 산출물이라 git에 추적되지 않는다.
 * npm 라이프사이클 훅(predev/prebuild/pretest)만으로는 `npx vitest` 처럼
 * 훅을 거치지 않는 실행 경로에서 파일이 없어 import 가 깨진다.
 * vite/vitest 가 시작될 때 항상 존재하도록 보장한다.
 */
export function ensureGeneratedData() {
  return {
    name: 'ensure-generated-project-activity',
    enforce: 'pre',
    buildStart() {
      if (existsSync(output)) return
      execFileSync(process.execPath, [generator], { cwd: root, stdio: 'inherit' })
    },
  }
}
