import type { SoulMapData } from '../types'
import { seed } from './seed'

/**
 * UI가 데이터를 얻는 유일한 통로.
 *
 * 지금은 정적 seed를 반환하지만, 실제 Hermes 연동 시에는
 * 이 인터페이스를 구현하는 어댑터(예: 세션 로그 파일 리더,
 * memory 디렉터리 스캐너, cron/skills API 클라이언트)를 갈아끼우면
 * UI 코드는 한 줄도 바꿀 필요가 없다.
 */
export interface SoulMapSource {
  load(): Promise<SoulMapData>
}

export const staticSource: SoulMapSource = {
  load: async () => seed,
}

/** 동기 접근이 필요한 초기 렌더용. */
export function loadSeed(): SoulMapData {
  return seed
}
