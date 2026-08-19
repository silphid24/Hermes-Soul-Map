import type { Plugin } from 'vite'

/** 생성 산출물 `src/data/projectActivity.ts` 가 항상 존재하도록 보장하는 vite 플러그인 */
export function ensureGeneratedData(): Plugin
