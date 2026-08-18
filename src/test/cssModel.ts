/**
 * 스타일시트의 "누가 이기는가"를 실제로 계산하는 테스트 유틸리티.
 *
 * 선택자 매칭은 jsdom(nwsapi)의 Element.matches에 맡기고,
 * 특이도와 소스 순서만 직접 계산한다. CSS 원문을 정규식으로 훑는 방식과 달리
 * 선언 순서·포맷 변경에는 둔감하고 캐스케이드 회귀에는 민감하다.
 */

export interface CssRule {
  selector: string
  declarations: Record<string, string>
  /** @media 조건. 최상위 규칙이면 null */
  media: string | null
  order: number
}

const COMMENT = /\/\*[\s\S]*?\*\//g

function parseDeclarations(body: string): Record<string, string> {
  const declarations: Record<string, string> = {}
  for (const chunk of body.split(';')) {
    const index = chunk.indexOf(':')
    if (index === -1) continue
    const property = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (property && value) declarations[property] = value
  }
  return declarations
}

export function parseCssRules(cssText: string): CssRule[] {
  const source = cssText.replace(COMMENT, '')
  const rules: CssRule[] = []
  let order = 0
  let media: string | null = null
  let mediaEnd = -1
  let index = 0

  // 파일을 한 번만 훑으면서 실제 소스 순서 그대로 규칙을 모은다.
  // @media는 특이도를 더하지 않으므로, 안에 있든 밖에 있든 순서가 곧 우선순위다.
  while (index < source.length) {
    const brace = source.indexOf('{', index)
    if (brace === -1) break

    // @media 블록을 벗어났으면 최상위 문맥으로 되돌린다.
    if (mediaEnd !== -1 && brace > mediaEnd) {
      media = null
      mediaEnd = -1
    }

    // 직전 블록들의 닫는 중괄호는 선택자가 아니다.
    const prelude = source.slice(index, brace).replace(/\}/g, ' ').trim()

    if (prelude.startsWith('@media')) {
      media = prelude.slice('@media'.length).trim()
      let depth = 1
      let cursor = brace + 1
      while (cursor < source.length && depth > 0) {
        if (source[cursor] === '{') depth++
        else if (source[cursor] === '}') depth--
        cursor++
      }
      mediaEnd = cursor - 1
      index = brace + 1
      continue
    }

    const close = source.indexOf('}', brace)
    if (close === -1) break

    if (!prelude.startsWith('@')) {
      const declarations = parseDeclarations(source.slice(brace + 1, close))
      for (const selector of prelude.split(',')) {
        const trimmed = selector.trim()
        if (trimmed) rules.push({ selector: trimmed, declarations, media, order: order++ })
      }
    }

    index = close + 1
  }

  return rules
}

/** [id, class/attr/pseudo-class, type/pseudo-element] */
export function specificity(selector: string): [number, number, number] {
  const cleaned = selector.replace(/\s*[>+~]\s*/g, ' ').trim()
  const ids = cleaned.match(/#[\w-]+/g)?.length ?? 0
  const classes =
    (cleaned.match(/\.[\w-]+/g)?.length ?? 0) +
    (cleaned.match(/\[[^\]]+\]/g)?.length ?? 0) +
    (cleaned.match(/(?<!:):(?!:)(?!(?:before|after|first-line|first-letter)\b)[\w-]+/g)?.length ?? 0)
  const types =
    (cleaned.match(/(?:^|[\s])([a-zA-Z][\w-]*)/g)?.length ?? 0) +
    (cleaned.match(/::[\w-]+/g)?.length ?? 0)
  return [ids, classes, types]
}

function beats(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

export interface ResolveOptions {
  /** 이 폭에서 평가한다. 지정하면 (max-width)/(min-width) @media 규칙도 함께 적용된다. */
  viewportWidth?: number
}

function mediaApplies(media: string | null, viewportWidth?: number): boolean {
  if (media === null) return true
  if (viewportWidth === undefined) return false
  const max = media.match(/max-width:\s*(\d+)px/)
  const min = media.match(/min-width:\s*(\d+)px/)
  if (max && viewportWidth > Number(max[1])) return false
  if (min && viewportWidth < Number(min[1])) return false
  return Boolean(max || min)
}

/** 주어진 엘리먼트에 실제로 적용되는 선언 값을 캐스케이드 규칙으로 골라낸다. */
export function resolveDeclaredValue(
  element: Element,
  property: string,
  rules: CssRule[],
  options: ResolveOptions = {},
): string | undefined {
  let winner: { value: string; rank: [number, number, number]; order: number } | undefined

  for (const rule of rules) {
    if (!(property in rule.declarations)) continue
    if (!mediaApplies(rule.media, options.viewportWidth)) continue
    let matched = false
    try {
      matched = element.matches(rule.selector)
    } catch {
      continue
    }
    if (!matched) continue
    const rank = specificity(rule.selector)
    if (!winner || beats(rank, winner.rank) || (!beats(winner.rank, rank) && rule.order >= winner.order)) {
      winner = { value: rule.declarations[property], rank, order: rule.order }
    }
  }

  return winner?.value
}

/** 해당 엘리먼트에 그 속성을 선언하는 모든 규칙을 특이도 내림차순으로 돌려준다. (진단용) */
export function matchingRules(element: Element, property: string, rules: CssRule[], options: ResolveOptions = {}): CssRule[] {
  return rules
    .filter((rule) => property in rule.declarations && mediaApplies(rule.media, options.viewportWidth))
    .filter((rule) => {
      try {
        return element.matches(rule.selector)
      } catch {
        return false
      }
    })
    .sort((a, b) => (beats(specificity(b.selector), specificity(a.selector)) ? 1 : -1))
}

const STACKING_PROPERTIES = ['transform', 'filter', 'perspective', 'backdrop-filter', 'mix-blend-mode', 'will-change']

/** 이 엘리먼트가 새 스택 컨텍스트를 만드는가 (z-index 비교의 경계) */
export function establishesStackingContext(element: Element, rules: CssRule[]): boolean {
  const position = resolveDeclaredValue(element, 'position', rules)
  const zIndex = resolveDeclaredValue(element, 'z-index', rules)
  if (position && position !== 'static' && zIndex && zIndex !== 'auto') return true

  if (resolveDeclaredValue(element, 'isolation', rules) === 'isolate') return true

  const contain = resolveDeclaredValue(element, 'contain', rules)
  if (contain && /\b(paint|layout|strict|content)\b/.test(contain)) return true

  const opacity = resolveDeclaredValue(element, 'opacity', rules)
  if (opacity && parseFloat(opacity) < 1) return true

  return STACKING_PROPERTIES.some((property) => {
    const value = resolveDeclaredValue(element, property, rules)
    return Boolean(value) && value !== 'none' && value !== 'normal'
  })
}

/** z-index가 비교되는 경계 — 가장 가까운 스택 컨텍스트 조상. 루트면 null */
export function stackingContextOf(element: Element, rules: CssRule[]): Element | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (establishesStackingContext(node, rules)) return node
  }
  return null
}
