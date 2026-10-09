// Export to Word (.docx) and to PDF (through a print-ready page), right-to-left throughout.
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { chapterLabel } from '@/hooks/useBook'
import { escapeHtml } from '@/lib/text'

export const EXPORT_FONTS = {
  david: { name: 'David', css: "'David Libre', 'David', serif" },
  frank: { name: 'Frank Ruehl', css: "'Frank Ruhl Libre', 'Frank Ruehl CLM', serif" },
  arial: { name: 'Arial', css: "Arial, 'Assistant', sans-serif" },
}

/** Which chapters and scenes go out: skips deleted and "unused" items. */
export function collectContent(bk, chapterIds = null) {
  return bk.flatChapters
    .filter((c) => !c.unused && (!chapterIds || chapterIds.includes(c.id)))
    .map((c) => ({ chapter: c, title: chapterLabel(c), scenes: c.scenes.filter((s) => !s.unused) }))
}

function runsFromNode(node, style, font, sizeHalf) {
  const out = []
  node.childNodes.forEach((ch) => {
    if (ch.nodeType === 3) {
      if (ch.nodeValue) out.push(new TextRun({ text: ch.nodeValue, rightToLeft: true, bold: style.bold, italics: style.italic, boldComplexScript: style.bold, italicsComplexScript: style.italic, font, size: sizeHalf, sizeComplexScript: sizeHalf }))
    } else if (ch.nodeType === 1) {
      const tag = ch.tagName.toLowerCase()
      if (tag === 'br') { out.push(new TextRun({ break: 1, rightToLeft: true })); return }
      const next = { ...style, bold: style.bold || tag === 'strong' || tag === 'b', italic: style.italic || tag === 'em' || tag === 'i' }
      out.push(...runsFromNode(ch, next, font, sizeHalf))
    }
  })
  return out
}

function separator(font, sizeHalf) {
  return new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun({ text: '* * *', rightToLeft: true, font, size: sizeHalf, sizeComplexScript: sizeHalf })] })
}

/** Convert one scene's HTML into Word paragraphs. */
export function sceneParagraphs(html, { font, sizeHalf, spacing, indent }) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html')
  const paras = []
  let first = true
  doc.body.childNodes.forEach((el) => {
    if (el.nodeType !== 1) return
    const tag = el.tagName.toLowerCase()
    if (tag === 'hr') { paras.push(separator(font, sizeHalf)); first = true; return }
    if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll('li').forEach((li, i) => paras.push(new Paragraph({ bidirectional: true, spacing, children: [new TextRun({ text: tag === 'ol' ? `${i + 1}. ` : '• ', rightToLeft: true, font, size: sizeHalf, sizeComplexScript: sizeHalf }), ...runsFromNode(li, {}, font, sizeHalf)] })))
      return
    }
    const heading = tag === 'h2' ? HeadingLevel.HEADING_2 : tag === 'h3' ? HeadingLevel.HEADING_3 : undefined
    paras.push(new Paragraph({
      bidirectional: true,
      heading,
      alignment: heading ? AlignmentType.CENTER : AlignmentType.BOTH,
      spacing,
      indent: tag === 'blockquote' ? { start: 720, end: 720 } : (!heading && !first && indent ? { firstLine: indent } : undefined),
      children: runsFromNode(el, {}, font, sizeHalf),
    }))
    first = !!heading
  })
  return paras
}

/**
 * @param format 'manuscript' (12pt, double spaced, indented) or 'book' (tighter, for reading)
 */
export async function buildDocx(bk, { chapterIds = null, format = 'manuscript', fontKey = 'david', titlePage = true } = {}) {
  const font = EXPORT_FONTS[fontKey]?.name || 'David'
  const sizeHalf = 24 // 12pt
  const spacing = format === 'manuscript' ? { line: 480, after: 0 } : { line: 300, after: 120 }
  const indent = format === 'manuscript' ? 720 : 360
  const parts = collectContent(bk, chapterIds)
  const children = []
  if (titlePage && !chapterIds) {
    children.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { before: 3600, after: 400 }, children: [new TextRun({ text: bk.book.title || '', rightToLeft: true, bold: true, boldComplexScript: true, font, size: 48, sizeComplexScript: 48 })] }))
  }
  parts.forEach((p, i) => {
    children.push(new Paragraph({
      bidirectional: true,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      pageBreakBefore: i > 0 || (titlePage && !chapterIds),
      spacing: { before: 1200, after: 600 },
      children: [new TextRun({ text: p.title, rightToLeft: true, font, size: 32, sizeComplexScript: 32, bold: true, boldComplexScript: true })],
    }))
    p.scenes.forEach((s, j) => {
      if (j > 0) children.push(separator(font, sizeHalf))
      children.push(...sceneParagraphs(s.content, { font, sizeHalf, spacing, indent }))
    })
  })
  const doc = new Document({
    creator: 'מכתוב',
    title: bk.book.title,
    styles: { default: { document: { run: { font, size: sizeHalf, sizeComplexScript: sizeHalf, rightToLeft: true }, paragraph: { bidirectional: true } } } },
    sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }],
  })
  return Packer.toBlob(doc)
}

export { downloadBlob } from '@/lib/download'

export function exportFileName(bk, chapterIds, ext) {
  const base = (bk.book.title || 'ספר').replace(/[\\/:*?"<>|]/g, '')
  if (chapterIds?.length === 1) {
    const c = bk.flatChapters.find((x) => x.id === chapterIds[0])
    return `${base} - ${chapterLabel(c).replace(/[\\/:*?"<>|]/g, '')}.${ext}`
  }
  if (chapterIds?.length) return `${base} - ${chapterIds.length} פרקים.${ext}`
  return `${base}.${ext}`
}

/** A print-ready HTML document. The browser's print dialog turns it into a PDF with correct Hebrew. */
export function buildPrintHtml(bk, { chapterIds = null, fontKey = 'frank', pageSize = 'A5', sizePt = 12 } = {}) {
  const parts = collectContent(bk, chapterIds)
  const fontCss = EXPORT_FONTS[fontKey]?.css || EXPORT_FONTS.frank.css
  const body = parts.map((p, i) => `
    <section class="chapter${i === 0 ? ' first' : ''}">
      <h1>${escapeHtml(p.title)}</h1>
      ${p.scenes.map((s, j) => `${j > 0 ? '<p class="sep">* * *</p>' : ''}<div class="scene">${(s.content || '').replace(/<span class="note-anchor"[^>]*>/g, '<span>')}</div>`).join('')}
    </section>`).join('')
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(bk.book.title || '')}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700&family=David+Libre:wght@400;700&family=Assistant:wght@400;700&display=swap">
<style>
@page { size: ${pageSize}; margin: 18mm 16mm 20mm; }
html, body { margin: 0; background: #fff; color: #111; }
body { font-family: ${fontCss}; font-size: ${sizePt}pt; line-height: 1.55; }
.title { text-align: center; font-size: 2em; margin-top: 35%; page-break-after: always; }
.chapter { page-break-before: always; }
.chapter.first { page-break-before: ${chapterIds ? 'auto' : 'always'}; }
h1 { text-align: center; font-size: 1.5em; font-weight: 700; margin: 2.5em 0 1.5em; }
h2, h3 { text-align: center; }
p { margin: 0; text-align: justify; }
.scene p + p { text-indent: 1.5em; }
.sep, hr { text-align: center; margin: 1em 0; border: 0; }
hr::after { content: '* * *'; }
blockquote { margin: 0.5em 2em; }
@media screen { body { max-width: 160mm; margin: 0 auto; padding: 16px; } .hint { position: sticky; top: 0; background: #f5f6f8; padding: 10px; text-align: center; font-family: Assistant, sans-serif; } }
@media print { .hint { display: none; } }
</style></head><body>
<div class="hint">בחלון ההדפסה בחרו "שמור כ־PDF".</div>
${chapterIds ? '' : `<div class="title">${escapeHtml(bk.book.title || '')}</div>`}
${body}
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 400))</script>
</body></html>`
}

export function openPrintWindow(html) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  return true
}
