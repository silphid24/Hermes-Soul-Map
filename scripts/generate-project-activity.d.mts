export interface GenerateProjectActivityOptions {
  /** `~/.hermes` 위치. 미지정 시 `HERMES_HOME` 또는 홈 디렉터리 기준. */
  hermesHome?: string
  /** 생성 파일 경로. 미지정 시 `PROJECT_ACTIVITY_OUT` 또는 `src/data/projectActivity.ts`. */
  outputPath?: string
  /** 프로젝트 산출물 mtime 을 읽을 루트. */
  root?: string
  env?: NodeJS.ProcessEnv
}

export interface GenerateProjectActivityResult {
  outputPath: string
  hermesHome: string
  eventCount: number
  profileCount: number
  artifactCount: number
  message: string
}

export declare const projectRoot: string
export function resolveOutputPath(env?: NodeJS.ProcessEnv): string
export function resolveHermesHome(env?: NodeJS.ProcessEnv): string
export function generateProjectActivity(
  options?: GenerateProjectActivityOptions,
): GenerateProjectActivityResult
