// Detecting the structure of an existing manuscript (chapters, scenes, parts).
// Works on a flat list of blocks so the preview can be edited block by block.
// block: { tag: 'h1'|'h2'|'h3'|'p'|'ul'|'ol'|'blockquote'|'title', text, html, bold }
// boundary: { type: 'part'|'chapter'|'scene', title, consume, reason, confidence }
import { parseHebrewNumeral, parseOrdinal, normalizeHebrew } from './text.js'

export const DEFAULT_RULES = { headings: true, chapterWords: true, separators: true, blankLines: false, boldLines: false }

const NUM = String.raw`(\d{1,3}|[IVXLC]{1,6}|[א-ת]{1,3}["״][א-ת]|[א-ת]{1,4}['׳"״]?|[א-ת]{3,8})`
const CHAPTER_RE = new RegExp(String.raw`^\s*(פרק|chapter)\s+${NUM}\s*(?:[:.\-–—]\s*(.*))?$`, 'i')
const PART_RE = new RegExp(String.raw`^\s*(חלק|part)\s+${NUM}\s*(?:[:.\-–—]\s*(.*))?$`, 'i')
const PROLOGUE_RE = /^\s*(פרולוג|הקדמה|prologue)\s*[:.\-–—]?\s*(.*)$/i
const EPILOGUE_RE = /^\s*(אפילוג|אחרית דבר|epilogue)\s*[:.\-–—]?\s*(.*)$/i
const SEPARATOR_RE = /^\s*(\*\s*){3,}\s*$|^\s*(#|\*|~|§|•|◆|❖|⁂|-\s*-\s*-|_{3,}|\*\*\*)\s*$/

function isNumeral(token) {
  if (/^\d+$/.test(token) || /^[IVXLC]+$/i.test(token)) return true
  return parseHebrewNumeral(token) != null || parseOrdinal(token) != null
}

/** "פרק א׳: הבית" → { kind: 'chapter', title: 'הבית' }. Returns null if the line is not a chapter title. */
export function matchChapterLine(text) {
  const t = normalizeHebrew(text).trim()
  if (!t || t.length > 80) return null
  let m = t.match(PART_RE)
  if (m && isNumeral(m[2])) return { kind: 'part', title: (m[3] || '').trim() }
  m = t.match(CHAPTER_RE)
  if (m && isNumeral(m[2])) return { kind: 'chapter', title: (m[3] || '').trim() }
  m = t.match(PROLOGUE_RE)
  if (m && t.length < 40) return { kind: 'chapter', sub: 'prologue', title: (m[2] || '').trim() }
  m = t.match(EPILOGUE_RE)
  if (m && t.length < 40) return { kind: 'chapter', sub: 'epilogue', title: (m[2] || '').trim() }
  return null
}

/** A table of contents near the start: a run of short "פרק 3 ...... 45" lines. Returns block indexes to skip. */
export function detectToc(blocks) {
  const limit = Math.max(20, Math.floor(blocks.length * 0.15))
  const out = new Set()
  let run = []
  const flush = () => { if (run.length >= 3) run.forEach((i) => out.add(i)); run = [] }
  for (let i = 0; i < Math.min(blocks.length, limit); i++) {
    const t = blocks[i].text.trim()
    const looksToc = t.length < 90 && (/(\.{3,}|…|\t)\s*\d+\s*$/.test(t) || (matchChapterLine(t.replace(/\s*\d+\s*$/, '')) && /\d+\s*$/.test(t) && blocks[i + 1] && matchChapterLine(blocks[i + 1].text.replace(/\s*\d+\s*$/, ''))))
    if (looksToc) run.push(i); else if (t) flush()
  }
  flush()
  if (out.size) {
    const first = [...out][0]
    if (first > 0 && /^(תוכן\s+(ה)?עניינים|תוכן|contents)$/i.test(blocks[first - 1]?.text.trim())) out.add(first - 1)
  }
  return out
}

/** Find boundaries according to the rules. Returns { boundaries: Map(index → boundary), ignored: Set, title }. */
/**
 * Pick the rules that fit this document. A document with no heading styles and no "פרק" lines,
 * but with several bold lines that stand alone, uses those bold lines as chapter titles.
 */
export function suggestRules(blocks) {
  const hasHeadings = blocks.some((b) => /^h[1-3]$/.test(b.tag) && b.text.trim())
  const hasChapterWords = blocks.some((b) => matchChapterLine(b.text.trim()))
  const boldLines = blocks.filter((b) => b.bold && b.text.trim() && b.text.trim().length <= 80).length
  return { ...DEFAULT_RULES, boldLines: !hasHeadings && !hasChapterWords && boldLines >= 2 }
}

export function detect(blocks, rules = DEFAULT_RULES) {
  const boundaries = new Map()
  const ignored = detectToc(blocks)
  let title = null
  const firstIdx = blocks.findIndex((b) => b.text.trim())
  if (firstIdx >= 0 && blocks[firstIdx].tag === 'title') { title = blocks[firstIdx].text.trim(); ignored.add(firstIdx) }

  // Which heading levels exist decides what they mean.
  const levels = [...new Set(blocks.filter((b, i) => !ignored.has(i) && /^h[1-3]$/.test(b.tag) && b.text.trim()).map((b) => b.tag))].sort()
  const headingType = {}
  if (levels.length >= 3) { headingType[levels[0]] = 'part'; headingType[levels[1]] = 'chapter'; headingType[levels[2]] = 'scene' }
  else if (levels.length === 2) { headingType[levels[0]] = 'chapter'; headingType[levels[1]] = 'scene' }
  else if (levels.length === 1) headingType[levels[0]] = 'chapter'

  let empties = 0
  blocks.forEach((b, i) => {
    if (ignored.has(i)) return
    const text = b.text.trim()
    if (!text) { empties++; return }
    const afterBlank = empties
    empties = 0
    const line = matchChapterLine(text)
    if (rules.headings && headingType[b.tag]) {
      let type = headingType[b.tag]
      if (line?.kind === 'part') type = 'part'
      const t = line ? line.title : normalizeHebrew(text)
      boundaries.set(i, { type, title: t, sub: line?.sub, consume: true, reason: 'סגנון כותרת', confidence: 'high' })
      return
    }
    if (rules.chapterWords && line) {
      boundaries.set(i, { type: line.kind, title: line.title, sub: line.sub, consume: true, reason: line.kind === 'part' ? 'המילה "חלק"' : line.sub ? 'פרולוג/אפילוג' : 'המילה "פרק"', confidence: 'high' })
      return
    }
    if (rules.separators && SEPARATOR_RE.test(text)) {
      boundaries.set(i, { type: 'scene', title: '', consume: true, reason: 'מפריד סצנה', confidence: 'high' })
      return
    }
    if (rules.blankLines && afterBlank >= 2 && i > 0) {
      boundaries.set(i, { type: 'scene', title: '', consume: false, reason: 'שורות ריקות', confidence: 'medium' })
      return
    }
    if (rules.boldLines && b.bold && text.length <= 80 && !/[,:;]$/.test(text)) {
      boundaries.set(i, { type: 'chapter', title: normalizeHebrew(text), consume: true, reason: 'שורה מודגשת', confidence: 'medium' })
    }
  })
  return { boundaries, ignored, title }
}

/** Build the book structure from blocks + boundaries. */
export function buildStructure(blocks, boundaries, ignored) {
  const parts = []
  let part = { title: null, chapters: [] }
  let chapter = null
  let scene = null
  const newChapter = (b, i) => {
    chapter = { title: b?.title || '', kind: b?.sub || 'chapter', reason: b?.reason, confidence: b?.confidence, start: i, scenes: [] }
    part.chapters.push(chapter)
    scene = { title: '', blocks: [], start: i }
    chapter.scenes.push(scene)
  }
  blocks.forEach((blk, i) => {
    if (ignored.has(i)) return
    const b = boundaries.get(i)
    if (b?.type === 'part') {
      if (part.chapters.length || part.title !== null) parts.push(part)
      part = { title: b.title || '', chapters: [], start: i }
      chapter = null
      if (!b.consume) newChapter(null, i)
    } else if (b?.type === 'chapter') {
      newChapter(b, i)
    } else if (b?.type === 'scene') {
      if (!chapter) newChapter(null, i)
      else if (scene.blocks.some((x) => x.text.trim()) || scene.title) {
        scene = { title: b.title || '', blocks: [], start: i }
        chapter.scenes.push(scene)
      } else if (b.title) scene.title = b.title
    }
    if (b?.consume) return
    if (!chapter) {
      if (!blk.text.trim()) return
      newChapter({ title: '', reason: 'תחילת הקובץ', confidence: 'low' }, i)
    }
    scene.blocks.push(blk)
  })
  parts.push(part)
  // Drop empty trailing scenes; keep at least one scene per chapter.
  for (const p of parts) for (const c of p.chapters) {
    c.scenes = c.scenes.filter((s, k) => k === 0 || s.blocks.some((x) => x.text.trim()) || s.title)
  }
  return parts.filter((p) => p.chapters.length || p.title)
}

/** Clean HTML for one scene: Hebrew normalisation in text, no empty paragraphs at the edges. */
export function blocksToHtml(blocks) {
  const list = [...blocks]
  while (list.length && !list[0].text.trim()) list.shift()
  while (list.length && !list[list.length - 1].text.trim()) list.pop()
  return list.filter((b) => b.text.trim()).map((b) => b.html.replace(/>([^<]+)</g, (m, t) => `>${normalizeHebrew(t)}<`)).join('')
}

export function structureStats(parts) {
  const chapters = parts.flatMap((p) => p.chapters)
  return { parts: parts.filter((p) => p.title !== null).length, chapters: chapters.length, scenes: chapters.reduce((n, c) => n + c.scenes.length, 0) }
}

/** Plain pasted text → blocks (one paragraph per line). */
export function textToBlocks(text) {
  return String(text).split(/\r?\n/).map((line) => ({ tag: 'p', text: line, html: line.trim() ? `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : '<p></p>', bold: false }))
}
