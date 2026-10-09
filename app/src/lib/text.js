// Text helpers for Hebrew writing: word counts, plain text, Hebrew numerals.

/** Strip tags and decode basic entities. Works without a DOM so it runs in tests. */
export function htmlToText(html = '') {
  return String(html)
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Count words the way Word does: a run of letters/digits separated by whitespace is one word.
 * "וכשהלכתי" is one word. Punctuation-only tokens and nikud do not create words.
 */
export function countWords(text = '') {
  const tokens = String(text).split(/\s+/)
  let n = 0
  for (const t of tokens) if (/[\p{L}\p{N}]/u.test(t)) n++
  return n
}

export const wordsInHtml = (html) => countWords(htmlToText(html))

/** Rough page estimate for a printed book page. */
export const pagesFor = (words) => Math.max(0, Math.round(words / 250))

export const formatNumber = (n) => new Intl.NumberFormat('he-IL').format(n || 0)

const HEB_VALUES = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90, ק: 100, ר: 200, ש: 300, ת: 400 }

/** Parse a Hebrew numeral like א׳, י״א, ט״ו, ט"ז into a number. Returns null if not a numeral. */
export function parseHebrewNumeral(s = '') {
  const clean = String(s).replace(/["'׳״]/g, '')
  if (!clean || clean.length > 4) return null
  let total = 0
  let prev = Infinity
  const chars = [...clean]
  for (let i = 0; i < chars.length; i++) {
    const v = HEB_VALUES[chars[i]]
    if (!v) return null
    // Numerals are written from the largest value down; ט״ו and ט״ז are the only exceptions.
    const isTetException = chars[i - 1] === 'ט' && (chars[i] === 'ו' || chars[i] === 'ז') && i === chars.length - 1
    if (v > prev && !isTetException) return null
    if (/[ךםןףץ]/.test(chars[i]) && i !== chars.length - 1) return null
    prev = v
    total += v
  }
  return total
}

const ORDINALS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני', 'תשיעי', 'עשירי']
const ORDINALS_F = ['ראשונה', 'שנייה', 'שלישית', 'רביעית', 'חמישית', 'שישית', 'שביעית', 'שמינית', 'תשיעית', 'עשירית']

export function parseOrdinal(word = '') {
  const w = word.trim()
  let i = ORDINALS.indexOf(w)
  if (i >= 0) return i + 1
  i = ORDINALS_F.indexOf(w)
  if (i >= 0) return i + 1
  if (w === 'שניה') return 2
  return null
}

/** Turn ASCII quote look-alikes into geresh/gershayim inside Hebrew numerals and abbreviations. */
export function normalizeHebrew(s = '') {
  return String(s)
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/([א-ת])"([א-ת])/g, '$1״$2')
    .replace(/(^|[\s(])([א-ת])'(?=[\s.,:;)\-–]|$)/g, '$1$2׳')
}

/** Format a number as a Hebrew numeral (1 → א׳, 15 → ט״ו). Used for parts. */
export function toHebrewNumeral(n) {
  if (!n || n < 1 || n > 999) return String(n)
  const parts = []
  let rest = n
  for (const [v, ch] of [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק']]) while (rest >= v) { parts.push(ch); rest -= v }
  if (rest === 15) { parts.push('ט', 'ו'); rest = 0 }
  if (rest === 16) { parts.push('ט', 'ז'); rest = 0 }
  for (const [v, ch] of [[90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']]) {
    while (rest >= v) { parts.push(ch); rest -= v }
  }
  if (parts.length === 1) return parts[0] + '׳'
  return parts.slice(0, -1).join('') + '״' + parts[parts.length - 1]
}

export function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Simple stable hash for change detection (sync). */
export function hashString(s = '') {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export const SCENE_STATUS = {
  idea: { label: 'רעיון', color: 'var(--status-idea, #c9cace)' },
  draft: { label: 'טיוטה', color: 'var(--status-draft, #8d9098)' },
  editing: { label: 'בעריכה', color: 'var(--status-editing, #55585f)' },
  done: { label: 'גמור', color: 'var(--fg)' },
}

export const NOTE_TYPES = {
  fix: { label: 'לתקן', color: 'var(--note-fix)' },
  check: { label: 'לבדוק', color: 'var(--note-check)' },
  idea: { label: 'רעיון', color: 'var(--note-idea)' },
  question: { label: 'שאלה', color: 'var(--note-question)' },
}
