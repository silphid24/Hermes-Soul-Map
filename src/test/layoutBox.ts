import { afterEach, beforeEach } from 'vitest'

/**
 * jsdom에는 레이아웃 엔진이 없어 모든 엘리먼트가 0x0으로 측정된다.
 * 픽셀 좌표를 계산하는 컴포넌트를 테스트하려면 실제 렌더 박스를 주입해야 한다.
 */
export function useFakeElementBox(sizes: Record<string, { width: number; height: number }>) {
  let original: typeof HTMLElement.prototype.getBoundingClientRect

  beforeEach(() => {
    original = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const matched = Object.keys(sizes).find((className) => this.classList.contains(className))
      const size = matched ? sizes[matched] : { width: 0, height: 0 }
      return {
        x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height,
        width: size.width, height: size.height, toJSON: () => ({}),
      } as DOMRect
    }
  })

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = original
  })
}
