/**
 * Pinyin initials for Chinese stock names without any extra dependency.
 *
 * The browser's Chinese collation orders Han characters by pinyin, so binary
 * searching a character against one anchor per initial yields its first letter.
 * A tiny override table fixes the common polyphonic characters used in stock
 * names (行/长/厦), where collation prefers another reading.
 */

const ANCHORS: Array<[string, string]> = [
  ['a', '阿'],
  ['b', '八'],
  ['c', '擦'],
  ['d', '搭'],
  ['e', '鹅'],
  ['f', '发'],
  ['g', '噶'],
  ['h', '哈'],
  ['j', '击'],
  ['k', '喀'],
  ['l', '拉'],
  ['m', '妈'],
  ['n', '拿'],
  ['o', '哦'],
  ['p', '趴'],
  ['q', '七'],
  ['r', '然'],
  ['s', '撒'],
  ['t', '他'],
  ['w', '挖'],
  ['x', '西'],
  ['y', '压'],
  ['z', '匝'],
]

const INITIAL_OVERRIDES: Record<string, string> = {
  行: 'h',
  长: 'c',
  厦: 'x',
}

const hanPattern = /\p{Script=Han}/u
const letterPattern = /[a-z0-9]/i
const collator = new Intl.Collator('zh-Hans-u-co-pinyin', { sensitivity: 'base' })
const charCache = new Map<string, string>()
const nameCache = new Map<string, string>()

function initialOf(char: string): string {
  if (!hanPattern.test(char)) return letterPattern.test(char) ? char.toLowerCase() : ''

  const override = INITIAL_OVERRIDES[char]
  if (override) return override

  let low = 0
  let high = ANCHORS.length - 1
  let found = ''
  while (low <= high) {
    const mid = (low + high) >> 1
    if (collator.compare(ANCHORS[mid][1], char) <= 0) {
      found = ANCHORS[mid][0]
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

/** Returns e.g. 工商银行 → gsyh; Latin/digit characters are kept as-is. */
export function pinyinInitials(text: string): string {
  const cached = nameCache.get(text)
  if (cached !== undefined) return cached

  let result = ''
  for (const char of text) {
    let initial = charCache.get(char)
    if (initial === undefined) {
      initial = initialOf(char)
      charCache.set(char, initial)
    }
    result += initial
  }
  nameCache.set(text, result)
  return result
}
