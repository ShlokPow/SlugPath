export type TokenType =
  | 'course'
  | 'and'
  | 'or'
  | 'comma'
  | 'semicolon'
  | 'period'
  | 'lparen'
  | 'rparen'
  | 'concurrent'
  | 'gradePre'
  | 'gradePost'
  | 'orEquivalent'
  | 'permission'
  | 'other'

export interface Token {
  type: TokenType
  /** normalized course code for 'course' tokens; grade letter (e.g. "C-") for 'gradePre'/'gradePost' */
  value?: string
}

// Priority-ordered token matchers. Order matters: multi-word phrases must be
// tried before the plain 'and'/'or' keyword matchers they contain.
const MATCHERS: { type: TokenType; re: RegExp; captureValue?: boolean }[] = [
  { type: 'lparen', re: /\(/y },
  { type: 'rparen', re: /\)/y },
  {
    type: 'concurrent',
    re: /(?:previous or concurrent enrollment in|concurrent enrollment in|must be taken concurrently with|taken concurrently with)/iy,
  },
  { type: 'gradePre', re: /([A-D][+-]?)\s+or\s+better\s+in\b/iy, captureValue: true },
  { type: 'gradePost', re: /with\s+(?:a\s+)?(?:grade\s+of\s+)?([A-D][+-]?)\s+or\s+better\b/iy, captureValue: true },
  { type: 'orEquivalent', re: /\(?or\s+equivalent(?:\/\w+)?\)?/iy },
  // "instructor permission" and its many phrasings — a very common non-course
  // alternative branch ("MATH 3 or by permission of the instructor").
  {
    type: 'permission',
    re: /by\s+(?:permission|consent)\s+of\s+(?:the\s+)?instructor|by\s+instructor\s+(?:permission|consent)|consent\s+of\s+(?:the\s+)?instructor|permission\s+of\s+(?:the\s+)?instructor|instructor\s+(?:permission|consent)/iy,
  },
  // course code: 2-6 uppercase letters, optional space, 1-4 digits, optional 1-2 uppercase letter suffix
  { type: 'course', re: /[A-Z]{2,6}\s?\d{1,4}[A-Z]{0,2}\b/y, captureValue: true },
  { type: 'and', re: /and\b/iy },
  { type: 'or', re: /or\b/iy },
  { type: 'comma', re: /,/y },
  { type: 'semicolon', re: /;/y },
  { type: 'period', re: /\./y },
]

const WHITESPACE = /\s+/y
// A run of "other" text: anything that isn't whitespace or one of the punctuation
// characters we tokenize specially. Swallowed as an opaque, ignorable chunk.
const OTHER = /[^\s(),;.]+/y

function normalizeCourseCode(raw: string): string {
  const m = /^([A-Z]{2,6})\s*(\d{1,4}[A-Z]{0,2})$/.exec(raw)
  if (!m) return raw.replace(/\s+/g, ' ').trim()
  return `${m[1]} ${m[2]}`
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let pos = 0
  while (pos < text.length) {
    WHITESPACE.lastIndex = pos
    const ws = WHITESPACE.exec(text)
    if (ws && ws.index === pos) {
      pos = WHITESPACE.lastIndex
      continue
    }

    let matched = false
    for (const matcher of MATCHERS) {
      matcher.re.lastIndex = pos
      const m = matcher.re.exec(text)
      if (m && m.index === pos) {
        if (matcher.type === 'course') {
          tokens.push({ type: 'course', value: normalizeCourseCode(m[0]) })
        } else if (matcher.captureValue) {
          tokens.push({ type: matcher.type, value: (m[1] ?? '').toUpperCase() })
        } else {
          tokens.push({ type: matcher.type })
        }
        pos = matcher.re.lastIndex
        matched = true
        break
      }
    }
    if (matched) continue

    OTHER.lastIndex = pos
    const other = OTHER.exec(text)
    if (other && other.index === pos) {
      tokens.push({ type: 'other', value: other[0].toLowerCase() })
      pos = OTHER.lastIndex
      continue
    }

    // Stray single character (unmatched punctuation like ' or :) — skip it.
    pos += 1
  }
  return tokens
}
