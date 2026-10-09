import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileUp, ClipboardPaste, Scissors, EyeOff, Eye, Undo2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { db } from '@/api/db'
import { detect, buildStructure, blocksToHtml, structureStats, textToBlocks, DEFAULT_RULES, suggestRules } from '@/lib/importer'
import { wordsInHtml, formatNumber } from '@/lib/text'
import { Button, inputClass } from '@/components/ui'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

const TYPE_LABEL = { part: 'חלק', chapter: 'פרק', scene: 'סצנה' }
const TYPE_COLOR = { part: 'bg-[#9466d4]', chapter: 'bg-accent', scene: 'bg-[#34a061]' }

// Is a text node bold? The nearest element that says so decides. Google Docs marks bold with
// font-weight:700 on a span, and wraps the whole paste in <b style="font-weight:normal">.
function nodeIsBold(node, root) {
  for (let el = node.parentElement; el && el !== root.parentElement; el = el.parentElement) {
    const w = el.style?.fontWeight
    if (w) return w === 'bold' || w === 'bolder' || Number(w) >= 600
    if (/^(STRONG|B|H[1-6])$/.test(el.tagName)) return true
  }
  return false
}
function isAllBold(el) {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let any = false
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue
    if (!nodeIsBold(n, el)) return false
    any = true
  }
  return any
}

/** HTML (from Word through mammoth, or pasted from Google Docs) → flat blocks. */
function htmlToBlocks(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const footnotes = {}
  doc.querySelectorAll('li[id^="footnote"]').forEach((li) => { footnotes[li.id] = li.textContent.replace(/↑\s*$/, '').trim() })
  doc.querySelectorAll('ol').forEach((ol) => { if (ol.querySelector('li[id^="footnote"]')) ol.remove() })
  let images = 0
  doc.querySelectorAll('img').forEach((img) => { images++; img.remove() })
  const blocks = []
  const push = (el, tagOverride) => {
    const tag = tagOverride || el.tagName.toLowerCase()
    // Footnote references become note markers the commit step turns into scene notes.
    const refs = []
    el.querySelectorAll('a[href^="#footnote"]').forEach((a) => { const id = a.getAttribute('href').slice(1); if (footnotes[id]) refs.push(footnotes[id]); a.closest('sup')?.remove(); a.remove() })
    el.querySelectorAll('[dir]').forEach((x) => x.removeAttribute('dir'))
    const text = el.textContent || ''
    const bold = isAllBold(el)
    // Keep bold and italic, drop the source document's fonts, sizes and colours.
    if (!/^h[1-6]$/.test(tag)) {
      el.querySelectorAll('span[style]').forEach((sp) => {
        const w = sp.style.fontWeight
        const b = w === 'bold' || Number(w) >= 600
        const i = sp.style.fontStyle === 'italic'
        if (!b && !i) return
        let inner = sp.innerHTML
        if (i) inner = `<em>${inner}</em>`
        if (b && !bold) inner = `<strong>${inner}</strong>`
        sp.innerHTML = inner
      })
    }
    el.removeAttribute?.('style')
    el.querySelectorAll('[style]').forEach((x) => x.removeAttribute('style'))
    el.querySelectorAll('span').forEach((sp) => sp.replaceWith(...sp.childNodes))
    const html = tag === 'title' ? `<p>${el.innerHTML}</p>` : /^h[1-6]$/.test(tag) ? `<h2>${el.innerHTML}</h2>` : el.outerHTML.replace(/^<(\w+)[^>]*>/, `<${el.tagName.toLowerCase()}>`)
    blocks.push({ tag, text, html: html.replace(/<br>$/, ''), bold, footnotes: refs })
  }
  const walk = (node) => {
    for (const el of node.children) {
      const t = el.tagName.toLowerCase()
      if (t === 'h1' && el.classList.contains('doc-title')) push(el, 'title')
      else if (['h1', 'h2', 'h3'].includes(t)) push(el)
      else if (['h4', 'h5', 'h6'].includes(t)) push(el, 'h3')
      else if (['p', 'blockquote', 'ul', 'ol'].includes(t)) push(el)
      else if (t === 'div' || t === 'section' || t === 'b' || t === 'span') walk(el)
      else if (t === 'table') { el.querySelectorAll('p, td').forEach((x) => push(x, 'p')) }
    }
  }
  walk(doc.body)
  return { blocks, images, footnoteCount: Object.keys(footnotes).length }
}

async function readDocx(file) {
  const { default: mammoth } = await import('mammoth/mammoth.browser.js')
  const arrayBuffer = await file.arrayBuffer()
  const res = await mammoth.convertToHtml({ arrayBuffer }, {
    ignoreEmptyParagraphs: false,
    styleMap: [
      "p[style-name='Title'] => h1.doc-title:fresh",
      "p[style-name='כותרת'] => h1.doc-title:fresh",
      "p[style-name='כותרת 1'] => h1:fresh",
      "p[style-name='כותרת 2'] => h2:fresh",
      "p[style-name='כותרת 3'] => h3:fresh",
      "p[style-name='Subtitle'] => p:fresh",
    ],
  })
  const comments = res.messages.filter((m) => /comment/i.test(m.message)).length
  return { html: res.value, comments }
}

export default function ImportPage() {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const [stage, setStage] = useState('pick')
  const [blocks, setBlocks] = useState([])
  const [report, setReport] = useState({})
  const [rules, setRules] = useState(DEFAULT_RULES)
  const [boundaries, setBoundaries] = useState(new Map())
  const [ignored, setIgnored] = useState(new Set())
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const pastedHtml = useRef(null)
  const fileName = useRef('')

  const load = (list, rep, fname) => {
    const r = suggestRules(list)
    setRules(r)
    const d = detect(list, r)
    setBlocks(list); setReport(rep); setBoundaries(d.boundaries); setIgnored(d.ignored)
    setTitle(d.title || fname || '')
    setStage('preview')
  }
  const onFile = async (file) => {
    if (!file) return
    if (!/\.docx$/i.test(file.name)) { toast('אפשר לייבא קובץ וורד (.docx). מגוגל דוקס: קובץ ← הורדה ← Microsoft Word.'); return }
    setBusy(true)
    try {
      fileName.current = file.name.replace(/\.docx$/i, '')
      const { html, comments } = await readDocx(file)
      const { blocks: list, images, footnoteCount } = htmlToBlocks(html)
      load(list, { images, footnotes: footnoteCount, comments, source: file.name }, fileName.current)
    } catch (e) { toast('לא הצלחנו לקרוא את הקובץ: ' + e.message) }
    setBusy(false)
  }
  const onPasteGo = () => {
    if (pastedHtml.current) { const { blocks: list, images, footnoteCount } = htmlToBlocks(pastedHtml.current); load(list, { images, footnotes: footnoteCount, source: 'הדבקה' }) }
    else load(textToBlocks(pasteText), { source: 'הדבקה' })
  }
  const rerun = (next) => {
    setRules(next)
    const d = detect(blocks, next)
    setBoundaries(d.boundaries); setIgnored(d.ignored)
  }

  const parts = useMemo(() => buildStructure(blocks, boundaries, ignored), [blocks, boundaries, ignored])
  const stats = structureStats(parts)
  const totalWords = useMemo(() => parts.flatMap((p) => p.chapters).flatMap((c) => c.scenes).reduce((n, s) => n + wordsInHtml(blocksToHtml(s.blocks)), 0), [parts])

  const setB = (i, b) => setBoundaries((m) => { const n = new Map(m); if (b) n.set(i, b); else n.delete(i); return n })
  const toggleIgnore = (i) => setIgnored((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const commit = async () => {
    setBusy(true)
    try {
      let targetId = bookId
      let created = { chapters: [], parts: [], scenes: [] }
      if (!targetId) {
        const b = await db.Book.create({ title: title.trim() || 'ספר מיובא', use_parts: stats.parts > 0, archived: false, deleted: false })
        targetId = b.id
        created.book = b.id
      } else if (stats.parts > 0) await db.Book.update(targetId, { use_parts: true })
      const existing = bookId ? await db.Chapter.filter({ book_id: targetId }) : []
      let order = existing.filter((c) => !c.deleted).length
      for (const [pi, p] of parts.entries()) {
        let partId = null
        if (p.title !== null) {
          const pr = await db.Part.create({ book_id: targetId, title: p.title || `חלק ${pi + 1}`, order: pi, deleted: false })
          partId = pr.id; created.parts.push(pr.id)
        }
        for (const c of p.chapters) {
          const ch = await db.Chapter.create({ book_id: targetId, part_id: partId, title: c.title || '', kind: c.kind || 'chapter', order: order++, deleted: false })
          created.chapters.push(ch.id)
          const sceneRows = c.scenes.map((s, k) => {
            const html = blocksToHtml(s.blocks)
            return { book_id: targetId, chapter_id: ch.id, title: s.title || '', content: html, word_count: wordsInHtml(html), status: html ? 'draft' : 'idea', order: k, deleted: false }
          })
          const scenes = await db.Scene.bulkCreate(sceneRows)
          created.scenes.push(...scenes.map((x) => x.id))
          // Footnotes are kept as notes on the scene, not thrown away.
          const notes = []
          c.scenes.forEach((s, k) => s.blocks.forEach((b) => (b.footnotes || []).forEach((f) => notes.push({ book_id: targetId, scene_id: scenes[k].id, type: 'check', text: `הערת שוליים: ${f}`, quote: b.text.slice(0, 80), done: false, anchored: false }))))
          if (notes.length) await db.Note.bulkCreate(notes)
        }
      }
      localStorage.setItem('maktub_last_import', JSON.stringify({ bookId: targetId, ...created, at: Date.now() }))
      setResult({ bookId: targetId, created })
      setStage('done')
    } catch (e) { toast('הייבוא נכשל: ' + e.message) }
    setBusy(false)
  }

  const undoImport = async () => {
    const r = result
    if (!r) return
    setBusy(true)
    if (r.created.book) await db.Book.update(r.created.book, { deleted: true, deleted_at: new Date().toISOString() })
    for (const id of r.created.chapters) await db.Chapter.update(id, { deleted: true, deleted_at: new Date().toISOString() })
    for (const id of r.created.parts) await db.Part.update(id, { deleted: true })
    setBusy(false)
    toast('הייבוא בוטל')
    navigate(r.created.book ? '/' : `/book/${r.bookId}`)
  }

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="px-5 sm:px-8 py-5 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-[26px] leading-tight font-black tracking-tight">{bookId ? 'ייבוא לתוך הספר' : 'ייבוא ספר קיים'}</h1>
            <p className="text-sm text-muted mt-1">מוורד או מגוגל דוקס. רואים את החלוקה לפרקים לפני שמשהו נשמר.</p>
          </div>
          <ol className="flex items-center gap-2 text-[13px]" aria-label="שלבים">
            {[['pick', 'בחירה'], ['preview', 'בדיקת החלוקה'], ['done', 'סיום']].map(([k, l], i) => {
              const idx = ['pick', 'preview', 'done'].indexOf(stage)
              return (
                <li key={k} className={cn('flex items-center gap-2', i > idx ? 'text-faint' : 'text-fg')}>
                  {i > 0 && <span className="w-6 h-px bg-line" aria-hidden />}
                  <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black', i < idx ? 'bg-accent text-accent-fg' : i === idx ? 'border-2 border-fg' : 'border border-line')}>{i + 1}</span>
                  <span className={i === idx ? 'font-black' : ''}>{l}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </header>

      {stage === 'pick' && (
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-8 grid gap-5 md:grid-cols-2">
            <label className={cn('rounded-xl border-2 border-dashed border-line-strong bg-surface p-8 flex flex-col items-center justify-center gap-3 text-center cursor-pointer hover:border-fg', busy && 'opacity-60')}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}>
              <FileUp size={32} />
              <div className="font-black">קובץ וורד</div>
              <div className="text-sm text-muted">גוררים לכאן או לוחצים לבחירה. מגוגל דוקס: קובץ ← הורדה ← Microsoft Word.</div>
              <input type="file" accept=".docx" className="sr-only" onChange={(e) => onFile(e.target.files[0])} data-testid="import-file" />
              {busy && <div className="text-sm">קורא את הקובץ…</div>}
            </label>
            <div className="rounded-xl border border-line bg-surface shadow-[var(--shadow-sm)] p-6 flex flex-col gap-3">
              <div className="flex items-center gap-2 font-black"><ClipboardPaste size={20} />הדבקה מגוגל דוקס</div>
              <div className="text-sm text-muted">מעתיקים מגוגל דוקס ומדביקים כאן. הכותרות נשמרות.</div>
              <textarea className={cn(inputClass, 'h-40 py-2')} value={pasteText} onChange={(e) => { setPasteText(e.target.value); if (!e.target.value) pastedHtml.current = null }}
                onPaste={(e) => { const h = e.clipboardData.getData('text/html'); pastedHtml.current = h || null }} placeholder="הדביקו כאן" data-testid="import-paste" />
              <Button variant="primary" onClick={onPasteGo} disabled={!pasteText.trim()}>המשך</Button>
            </div>
          </div>
        </main>
      )}

      {stage === 'preview' && (
        <main className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <aside className="lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-e border-line bg-surface overflow-y-auto p-4 flex flex-col gap-4">
            <div className="rounded-xl bg-surface border border-line p-3 text-sm" data-testid="import-stats">
              <div className="font-semibold mb-1">זוהו {stats.chapters} פרקים ו־{stats.scenes} סצנות{stats.parts ? `, ב־${stats.parts} חלקים` : ''}</div>
              <div className="text-muted">{formatNumber(totalWords)} מילים · עוד שום דבר לא נשמר</div>
            </div>
            {!bookId && (
              <label className="flex flex-col gap-1.5 text-sm"><span className="text-muted">שם הספר</span><input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="import-title" /></label>
            )}
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="font-semibold">איך לזהות את החלוקה</div>
              {[['headings', 'סגנונות כותרת (כותרת 1, 2, 3)'], ['chapterWords', 'שורות כמו "פרק א׳", "פרק 3", "פרק ראשון"'], ['separators', 'מפרידי סצנה: * * *, #, §'], ['blankLines', 'שתי שורות ריקות או יותר = סצנה חדשה'], ['boldLines', 'שורה מודגשת שעומדת לבד = פרק']].map(([k, l]) => (
                <label key={k} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={rules[k]} onChange={(e) => rerun({ ...rules, [k]: e.target.checked })} />{l}</label>
              ))}
            </div>
            {(report.images > 0 || report.footnotes > 0 || report.comments > 0) && (
              <div className="rounded-xl bg-surface border border-line p-3 text-sm flex flex-col gap-1">
                <div className="font-semibold flex items-center gap-1"><AlertTriangle size={15} className="text-warn" />מה לא ייכנס כמו שהוא</div>
                {report.footnotes > 0 && <div>{report.footnotes} הערות שוליים יישמרו כפתקים על הסצנות.</div>}
                {report.images > 0 && <div>{report.images} תמונות לא ייובאו.</div>}
                {report.comments > 0 && <div>תגובות של וורד לא ייובאו.</div>}
                <div className="text-muted">שינויים במעקב נקלטים כפי שהם מופיעים במסמך.</div>
              </div>
            )}
            <div className="flex flex-col gap-1 text-sm">
              <div className="font-semibold">המבנה</div>
              {parts.map((p, pi) => (
                <div key={pi}>
                  {p.title !== null && <div className="text-xs text-muted mt-1">חלק: {p.title || 'ללא שם'}</div>}
                  {p.chapters.map((c, ci) => (
                    <div key={ci} className="ps-2">
                      <div className="truncate">• {c.kind === 'prologue' ? 'פרולוג' : c.kind === 'epilogue' ? 'אפילוג' : 'פרק'}{c.title ? `: ${c.title}` : ''} <span className="text-muted text-xs">({c.scenes.length} סצנות)</span></div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex gap-2 sticky bottom-0 bg-sunk py-2">
              <Button variant="primary" className="flex-1" onClick={commit} disabled={busy || !stats.chapters} data-testid="import-commit">{busy ? 'מייבא…' : bookId ? 'הוסף לסוף הספר' : 'צור את הספר'}</Button>
              <Button variant="ghost" onClick={() => setStage('pick')}>קובץ אחר</Button>
            </div>
          </aside>
          <section className="flex-1 min-h-0 overflow-y-auto p-4" data-testid="import-blocks">
            <p className="text-sm text-muted mb-3 max-w-3xl">כל שורה צבעונית היא מקום שבו מכתוב מפצל. אפשר לשנות סוג, לשנות שם, לבטל פיצול, או להוסיף פיצול ליד כל פסקה. שום דבר לא נשמר עד שלוחצים על הכפתור.</p>
            <div className="max-w-3xl flex flex-col">
              {blocks.map((b, i) => {
                const bd = boundaries.get(i)
                const ign = ignored.has(i)
                if (!b.text.trim() && !bd) return null
                return (
                  <div key={i} className="group">
                    {bd && (
                      <div className="flex flex-wrap items-center gap-2 mt-3 mb-1 rounded-lg bg-surface border border-line p-2 text-sm" data-testid="boundary">
                        <span className={cn('text-white text-xs rounded px-1.5 py-0.5', TYPE_COLOR[bd.type])}>{TYPE_LABEL[bd.type]}</span>
                        <select className="h-8 rounded-md border border-line bg-bg px-1" value={bd.type} onChange={(e) => setB(i, e.target.value ? { ...bd, type: e.target.value } : null)} aria-label="סוג">
                          <option value="part">חלק</option><option value="chapter">פרק</option><option value="scene">סצנה</option><option value="">בטל פיצול (מזג עם הקודם)</option>
                        </select>
                        <input className="h-8 flex-1 min-w-[8rem] rounded-md border border-line bg-bg px-2" value={bd.title} onChange={(e) => setB(i, { ...bd, title: e.target.value })} placeholder="שם (לא חובה)" aria-label="שם" />
                        <span className={cn('text-xs', bd.confidence === 'low' ? 'text-warn' : 'text-muted')}>{bd.reason}</span>
                      </div>
                    )}
                    {!(bd?.consume) && (
                      <div className={cn('relative flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-sunk', ign && 'opacity-40 line-through')}>
                        <div className="flex-1 min-w-0 text-[15px] leading-7 line-clamp-3">{b.text}</div>
                        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex gap-1 shrink-0">
                          {!bd && <button className="h-7 px-2 rounded-md border border-line bg-surface text-xs inline-flex items-center gap-1" onClick={() => setB(i, { type: 'chapter', title: '', consume: false, reason: 'פיצול ידני', confidence: 'high' })}><Scissors size={12} />פרק חדש כאן</button>}
                          {!bd && <button className="h-7 px-2 rounded-md border border-line bg-surface text-xs inline-flex items-center gap-1" onClick={() => setB(i, { type: 'scene', title: '', consume: false, reason: 'פיצול ידני', confidence: 'high' })}><Scissors size={12} />סצנה חדשה כאן</button>}
                          <button className="h-7 px-2 rounded-md border border-line bg-surface text-xs inline-flex items-center gap-1" onClick={() => toggleIgnore(i)}>{ign ? <Eye size={12} /> : <EyeOff size={12} />}{ign ? 'כלול' : 'התעלם'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </main>
      )}

      {stage === 'done' && result && (
        <main className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <CheckCircle2 size={40} className="text-ok" />
          <div className="text-lg">הייבוא הסתיים: {stats.chapters} פרקים ו־{stats.scenes} סצנות.</div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => navigate(`/book/${result.bookId}`)} data-testid="import-open">פתח את הספר</Button>
            <Button onClick={undoImport} disabled={busy}><Undo2 size={16} />בטל ייבוא</Button>
          </div>
        </main>
      )}
    </div>
  )
}
