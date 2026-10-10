import { useCallback, useEffect, useRef, useState } from 'react'
import { Loading } from '@/components/AppShell'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { X, List, Pin } from 'lucide-react'
import { useBook, chapterLabel } from '@/hooks/useBook'
import { useSettings } from '@/lib/settings'
import { TextSizeControl } from '@/components/WorkspaceBits'
import { Menu, MenuItem } from '@/components/ui'
import { FONTS } from '@/lib/fonts'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

/**
 * Reading mode: only the text, centred, chapter after chapter like a book.
 * The text is locked; select words to leave a "fix" note without leaving the reading.
 */
export default function Reading() {
  const { bookId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const bk = useBook(bookId)
  const { settings, update } = useSettings()
  const scrollRef = useRef(null)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [progress, setProgress] = useState(0)
  const [currentCh, setCurrentCh] = useState(params.get('ch'))
  const [sel, setSel] = useState(null) // { x, y, sceneId, range }
  const hideTimer = useRef(null)
  const startCh = params.get('ch')

  const chapters = bk.flatChapters.filter((c) => !c.unused)

  // Start reading where the writer was.
  useEffect(() => {
    if (bk.loading || !startCh) return
    const t = setTimeout(() => {
      const el = scrollRef.current?.querySelector(`[data-chapter="${startCh}"]`)
      if (el) scrollRef.current.scrollTo({ top: el.offsetTop - 40 })
    }, 60)
    return () => clearTimeout(t)
  }, [bk.loading, startCh])

  const showChrome = useCallback(() => {
    setChromeVisible(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setChromeVisible(false), 2200)
  }, [])
  useEffect(() => { showChrome(); return () => clearTimeout(hideTimer.current) }, [showChrome])

  const exit = useCallback(() => navigate(`/book/${bookId}${currentCh ? `?ch=${currentCh}` : ''}`), [navigate, bookId, currentCh])

  const goChapter = (dir) => {
    const i = chapters.findIndex((c) => c.id === currentCh)
    const next = chapters[Math.max(0, Math.min(chapters.length - 1, (i < 0 ? 0 : i) + dir))]
    const el = next && scrollRef.current?.querySelector(`[data-chapter="${next.id}"]`)
    if (el) scrollRef.current.scrollTo({ top: el.offsetTop - 40, behavior: 'smooth' })
  }

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape') { e.preventDefault(); exit() }
      else if (e.key === 'ArrowLeft' && !mod) goChapter(1) // RTL: left is forward
      else if (e.key === 'ArrowRight' && !mod) goChapter(-1)
      else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); update({ read_size: Math.min(34, settings.read_size + 1) }) }
      else if (mod && e.key === '-') { e.preventDefault(); update({ read_size: Math.max(14, settings.read_size - 1) }) }
      else if (mod && e.key === '0') { e.preventDefault(); update({ read_size: 22 }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exit, settings.read_size, currentCh, chapters])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setProgress(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight))
    const secs = [...el.querySelectorAll('[data-chapter]')]
    let cur = secs[0]?.getAttribute('data-chapter')
    for (const s of secs) if (s.offsetTop - 120 <= el.scrollTop) cur = s.getAttribute('data-chapter')
    if (cur !== currentCh) setCurrentCh(cur)
    setSel((x) => (x && Math.abs(el.scrollTop - x.scrollTop) > 60 ? null : x))
  }

  // Selecting text shows a small "📌 לתקן" button.
  const onMouseUp = () => {
    const s = window.getSelection()
    if (!s || s.isCollapsed || !s.rangeCount) { setSel(null); return }
    const range = s.getRangeAt(0)
    const block = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
    const sceneEl = block?.closest?.('[data-scene]')
    if (!sceneEl) { setSel(null); return }
    const rect = range.getBoundingClientRect()
    setSel({ scrollTop: scrollRef.current.scrollTop, x: rect.left + rect.width / 2, y: rect.top, sceneId: sceneEl.getAttribute('data-scene'), range: range.cloneRange(), text: s.toString() })
  }

  const addNoteFromReading = async () => {
    if (!sel) return
    const note = await bk.createRecord('notes', { scene_id: sel.sceneId, type: 'fix', text: '', quote: sel.text.slice(0, 140), done: false, anchored: true })
    const sceneEl = scrollRef.current.querySelector(`[data-scene="${sel.sceneId}"]`)
    const span = document.createElement('span')
    span.className = 'note-anchor'
    span.setAttribute('data-note-id', note.id)
    span.setAttribute('data-note-type', 'fix')
    try { sel.range.surroundContents(span) } catch { span.appendChild(sel.range.extractContents()); sel.range.insertNode(span) }
    bk.setSceneContent(sel.sceneId, sceneEl.innerHTML)
    window.getSelection()?.removeAllRanges()
    setSel(null)
    toast('הפתק נשמר. אפשר לכתוב בו בחלונית הפתקים כשחוזרים לעורך.')
  }

  const openInEditor = (e) => {
    const sceneEl = e.target.closest?.('[data-scene]')
    if (!sceneEl) return
    const sid = sceneEl.getAttribute('data-scene')
    const ch = bk.flatChapters.find((c) => c.scenes.some((s) => s.id === sid))
    navigate(`/book/${bookId}?ch=${ch?.id || ''}&sc=${sid}`)
  }

  const theme = settings.reading_theme || 'paper'
  const cur = chapters.find((c) => c.id === currentCh)

  if (bk.loading) return <Loading />

  return (
    <div className={cn('reading fixed inset-0 flex flex-col', `theme-${theme}`)} onMouseMove={showChrome} onTouchStart={showChrome} data-testid="reading-mode">
      <div className="absolute top-0 inset-x-0 h-[3px] z-20"><div className="h-full bg-accent/70" style={{ width: `${progress * 100}%` }} /></div>
      <div className={cn('absolute top-0 inset-x-0 z-10 flex items-center gap-2 px-3 h-14 transition-opacity duration-300', chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none')} style={{ background: 'color-mix(in srgb, var(--rbg) 88%, transparent)' }}>
        <button className="hit inline-flex items-center gap-1 rounded-lg px-2 text-sm hover:bg-black/5" onClick={exit} data-testid="reading-exit"><X size={17} />יציאה (Esc)</button>
        <Menu trigger={<button className="hit inline-flex items-center gap-1 rounded-lg px-2 text-sm hover:bg-black/5" aria-label="תוכן עניינים"><List size={17} /><span className="hidden sm:inline">תוכן עניינים</span></button>} align="start">
          {chapters.map((c) => <MenuItem key={c.id} onSelect={() => { const el = scrollRef.current.querySelector(`[data-chapter="${c.id}"]`); scrollRef.current.scrollTo({ top: el.offsetTop - 40 }) }}>{chapterLabel(c)}</MenuItem>)}
        </Menu>
        <div className="flex-1 text-center text-sm opacity-70 truncate">{cur ? chapterLabel(cur) : ''}</div>
        <select className="h-9 rounded-lg border border-black/10 bg-transparent px-2 text-sm" value={theme} onChange={(e) => update({ reading_theme: e.target.value })} aria-label="ערכת צבע">
          <option value="light">בהיר</option><option value="paper">נייר</option><option value="dark">כהה</option>
        </select>
        <select className="hidden sm:block h-9 rounded-lg border border-black/10 bg-transparent px-2 text-sm max-w-[9rem]" value={settings.write_font} onChange={(e) => update({ write_font: e.target.value })} aria-label="גופן">
          {FONTS.filter((f) => f.write).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <TextSizeControl value={settings.read_size} onChange={(v) => update({ read_size: v })} min={14} max={34} />
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5" onScroll={onScroll} onMouseUp={onMouseUp} onTouchEnd={() => setTimeout(onMouseUp, 50)} onDoubleClick={openInEditor}>
        <div className="pt-20 pb-[30vh]">
          {chapters.map((c) => (
            <article key={c.id} data-chapter={c.id} className="mb-24">
              <h2 className="text-center mb-10" style={{ fontSize: '1.35em', fontWeight: 600 }}>{chapterLabel(c)}</h2>
              {c.scenes.filter((s) => !s.unused).map((s, i) => (
                <div key={s.id}>
                  {i > 0 && <p className="text-center opacity-50 my-8 tracking-[0.4em]" style={{ textIndent: 0 }}>* * *</p>}
                  <div data-scene={s.id} dangerouslySetInnerHTML={{ __html: s.content || '' }} />
                </div>
              ))}
            </article>
          ))}
          {chapters.length === 0 && <p className="text-center opacity-60">עוד אין מה לקרוא.</p>}
        </div>
      </div>
      {sel && (
        <button
          className="fixed z-30 -translate-x-1/2 -translate-y-full rounded-full bg-fg text-bg px-3 h-9 text-sm shadow-[var(--shadow)] inline-flex items-center gap-1"
          style={{ left: sel.x, top: sel.y - 8 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={addNoteFromReading}
          data-testid="reading-add-note"
        ><Pin size={14} />לתקן</button>
      )}
      <style>{`.reading .note-anchor{background:none;border:0}`}</style>
    </div>
  )
}
