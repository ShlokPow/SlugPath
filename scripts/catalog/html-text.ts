import { Parser } from 'htmlparser2'

/**
 * Strips tags and decodes HTML entities from an HTML fragment, collapsing
 * whitespace down to single spaces. Used to turn things like
 * `<a class='sc-courselink' href='...'>CSE 12</a> or MATH 3` into
 * `CSE 12 or MATH 3` without losing entity-encoded characters (&amp;, etc.)
 * that a naive tag-stripping regex would leave mangled.
 */
export function htmlToText(fragment: string): string {
  let text = ''
  const parser = new Parser({
    ontext(data) {
      text += data
    },
  })
  parser.end(fragment)
  return text.replace(/\s+/g, ' ').trim()
}
