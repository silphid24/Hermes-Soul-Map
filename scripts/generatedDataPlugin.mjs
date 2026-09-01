import { statSync } from 'node:fs'
import { generateProjectActivity, resolveOutputPath } from './generate-project-activity.mjs'

/**
 * 데이터가 이보다 오래되면 다시 만든다.
 *
 * `existsSync` 만 보고 넘어가면 `prepare` 가 설치 시점에 한 번 쓴 파일이 영원히 굳는다 —
 * `npx vite`, `npm run test:watch` 처럼 npm 훅을 안 거치는 경로에서는 대시보드가
 * "마지막 cron 출력 = 설치일"을 계속 보여주게 된다. 이 기능의 존재 이유가 신선도라서,
 * 존재 여부가 아니라 신선도를 기준으로 판단한다.
 */
const MAX_AGE_MS = 5 * 60 * 1000

function needsRegeneration(output) {
  let stat
  try {
    stat = statSync(output)
  } catch {
    return true
  }
  // writeFileSync 가 중간에 끊겨 0바이트로 남은 파일은 existsSync 를 통과하지만
  // import 는 깨진다. 크기를 봐야 자가 치유된다.
  if (stat.size === 0) return true
  return Date.now() - stat.mtimeMs > MAX_AGE_MS
}

/**
 * `src/data/projectActivity.ts` 는 생성 산출물이라 git 에 추적되지 않는다.
 * npm 라이프사이클 훅만으로는 `npx vitest` 처럼 훅을 거치지 않는 실행 경로에서
 * 파일이 없어 import 가 깨진다. vite/vitest 가 시작될 때 존재와 신선도를 함께 보장한다.
 *
 * 경로는 생성기와 같은 `resolveOutputPath()` 로 구한다 — 따로 계산하면
 * `PROJECT_ACTIVITY_OUT` 이 설정된 환경에서 플러그인이 엉뚱한 경로를 지키게 된다.
 */
export function ensureGeneratedData() {
  return {
    name: 'ensure-generated-project-activity',
    enforce: 'pre',
    buildStart() {
      const output = resolveOutputPath()
      if (!needsRegeneration(output)) return

      let result
      try {
        result = generateProjectActivity({ outputPath: output })
      } catch (error) {
        throw new Error(
          `[ensure-generated-project-activity] ${output} 생성 실패. ` +
            `\`node scripts/generate-project-activity.mjs\` 를 직접 실행해 원인을 확인하세요.`,
          { cause: error },
        )
      }

      // 0을 반환했다면 생성기는 성공했지만 쓸 내용이 없었다는 뜻이다. 조용히 넘기면 안 된다.
      if (result.eventCount === 0) {
        throw new Error(
          `[ensure-generated-project-activity] ${output} 를 썼지만 이벤트가 0건입니다 ` +
            `(HERMES_HOME=${result.hermesHome}).`,
        )
      }
    },
  }
}
