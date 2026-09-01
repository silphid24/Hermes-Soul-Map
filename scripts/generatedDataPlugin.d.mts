/**
 * 구조적(structural) 타입으로 선언한다.
 *
 * `vitest/config` 는 자기 자신이 번들한 vite(rollup 기반) 타입을, 프로젝트는 vite 8(rolldown 기반)
 * 타입을 쓴다. 둘의 `Plugin` 은 `PluginContextMeta` 가 달라 서로 호환되지 않으므로,
 * 어느 한쪽의 `Plugin` 을 import 하면 나머지 config 가 타입 에러를 낸다.
 */
export interface EnsureGeneratedDataPlugin {
  name: string
  enforce: 'pre'
  buildStart(): void
}

/** 생성 산출물 `src/data/projectActivity.ts` 의 존재와 신선도를 보장하는 vite/vitest 플러그인 */
export function ensureGeneratedData(): EnsureGeneratedDataPlugin
