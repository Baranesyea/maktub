import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detect, buildStructure, matchChapterLine, detectToc, DEFAULT_RULES, blocksToHtml, suggestRules } from '../../src/lib/importer.js'

const P = (text, tag = 'p') => ({ tag, text, html: `<${tag === 'title' ? 'h1' : tag}>${text}</${tag === 'title' ? 'h1' : tag}>`, bold: false })

test('recognises Hebrew chapter lines', () => {
  assert.deepEqual(matchChapterLine('פרק א׳: הבית'), { kind: 'chapter', title: 'הבית' })
  assert.equal(matchChapterLine('פרק 12').kind, 'chapter')
  assert.equal(matchChapterLine('פרק ראשון').kind, 'chapter')
  assert.equal(matchChapterLine('פרק ט"ו - הים').title, 'הים')
  assert.equal(matchChapterLine('חלק שני').kind, 'part')
  assert.equal(matchChapterLine('פרולוג').sub, 'prologue')
  assert.equal(matchChapterLine('פרק בחיים שלי היה קשה מאוד'), null)
  assert.equal(matchChapterLine('Chapter 3: Home').kind, 'chapter')
})

test('single-level headings become chapters (the user\'s Google Doc)', () => {
  const blocks = [P('הקיץ שעברנו', 'title'), P('הבית', 'h1'), P('שורה ראשונה'), P('שורה שנייה'), P('המטבח', 'h1'), P('עוד טקסט')]
  const { boundaries, ignored, title } = detect(blocks)
  assert.equal(title, 'הקיץ שעברנו')
  const parts = buildStructure(blocks, boundaries, ignored)
  assert.equal(parts.length, 1)
  assert.equal(parts[0].chapters.length, 2)
  assert.equal(parts[0].chapters[0].title, 'הבית')
  assert.equal(parts[0].chapters[0].scenes.length, 1)
  assert.equal(parts[0].chapters[0].scenes[0].blocks.length, 2)
})

test('two heading levels: chapters and scenes', () => {
  const blocks = [P('פרק 1', 'h1'), P('בוקר', 'h2'), P('א'), P('ערב', 'h2'), P('ב'), P('פרק 2', 'h1'), P('ג')]
  const { boundaries, ignored } = detect(blocks)
  const [part] = buildStructure(blocks, boundaries, ignored)
  assert.equal(part.chapters.length, 2)
  assert.equal(part.chapters[0].scenes.length, 2)
  assert.equal(part.chapters[0].scenes[1].title, 'ערב')
})

test('chapter words and separators without heading styles', () => {
  const blocks = [P('פרק א׳'), P('טקסט'), P('* * *'), P('עוד'), P('פרק ב׳: הים'), P('סוף')]
  const { boundaries, ignored } = detect(blocks)
  const [part] = buildStructure(blocks, boundaries, ignored)
  assert.equal(part.chapters.length, 2)
  assert.equal(part.chapters[0].scenes.length, 2)
  assert.equal(part.chapters[1].title, 'הים')
})

test('text before the first chapter is kept', () => {
  const blocks = [P('הקדשה לאמא'), P('פרק 1'), P('טקסט')]
  const { boundaries, ignored } = detect(blocks)
  const [part] = buildStructure(blocks, boundaries, ignored)
  assert.equal(part.chapters.length, 2)
})

test('table of contents is ignored', () => {
  const blocks = [P('תוכן עניינים'), P('פרק 1 ........ 3'), P('פרק 2 ........ 9'), P('פרק 3 ........ 15'), P('פרק 1'), P('טקסט'), P('פרק 2'), P('טקסט'), P('פרק 3'), P('טקסט')]
  const toc = detectToc(blocks)
  assert.ok(toc.has(0) && toc.has(1) && toc.has(3))
  const { boundaries, ignored } = detect(blocks)
  const [part] = buildStructure(blocks, boundaries, ignored)
  assert.equal(part.chapters.length, 3)
})

test('parts with three heading levels', () => {
  const blocks = [P('חלק ראשון', 'h1'), P('פרק 1', 'h2'), P('סצנה', 'h3'), P('א'), P('חלק שני', 'h1'), P('פרק 2', 'h2'), P('ב')]
  const { boundaries, ignored } = detect(blocks)
  const parts = buildStructure(blocks, boundaries, ignored)
  assert.equal(parts.length, 2)
  assert.equal(parts[1].chapters.length, 1)
})

test('blocksToHtml normalises gershayim and trims empties', () => {
  assert.equal(blocksToHtml([P(''), P('צה"ל'), P('')]), '<p>צה״ל</p>')
})

test('bold lines that stand alone become chapters when there are no heading styles', () => {
  const b = (text, bold = false) => ({ tag: 'p', text, html: `<p>${text}</p>`, bold })
  const blocks = [b('סוף סוף פיליפינים', true), b('איכס.'), b('מנילה נראית כמו אור יהודה.'), b(''), b('מחר כבר פה, יום מסריח.', true), b('אני עדיין ער.')]
  const rules = suggestRules(blocks)
  assert.equal(rules.boldLines, true)
  const { boundaries } = detect(blocks, rules)
  assert.deepEqual([...boundaries.values()].map((x) => x.title), ['סוף סוף פיליפינים', 'מחר כבר פה, יום מסריח.'])
  // With real heading styles, bold lines are left alone.
  assert.equal(suggestRules([{ tag: 'h1', text: 'פרק', html: '', bold: true }, ...blocks]).boldLines, false)
})
