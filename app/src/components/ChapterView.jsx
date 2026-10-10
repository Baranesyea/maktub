import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Pin, Plus } from 'lucide-react'
import SceneEditor from '@/components/editor/SceneEditor'
import { NOTE_TYPES, SCENE_STATUS } from '@/lib/text'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings'

/**
 * The chapter's name above its text, editable in place: "פרק 3:" stays, the name after it is typed.
 * Enter or clicking away keeps it; Escape puts the old name back.
 */
function ChapterTitle({ bk, chapter, editable }) {
  const ref = useRef(null)
  const [focused, setFocused] = useState(false)
  const [hasText, setHasText] = useState(!!chapter.title)
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) { ref.current.textContent = chapter.title || ''; setHasText(!!chapter.title) } }, [chapter.id, chapter.title])
  const numbered = !!chapter.number
  const fallback = chapter.kind === 'prologue' ? 'פרולוג' : chapter.kind === 'epilogue' ? 'אפילוג' : 'שם לפרק'
  const save = () => {
    const v = (ref.current?.textContent || '').replace(/\s+/g, ' ').trim()
    if (v !== (chapter.title || '')) bk.update('chapters', chapter.id, { title: v })
  }
  return (
    <h1 className="text-center font-write font-black mb-8 text-fg" style={{ fontSize: 'calc(var(--write-size) * 1.45)' }} data-testid="chapter-title">
      {numbered && <span>פרק {chapter.number}{(hasText || focused) ? ': ' : ''}</span>}
      <span
        ref={ref}
        contentEditable={editable ? 'plaintext-only' : false}
        suppressContentEditableWarning
        role="textbox"
        aria-label="שם הפרק"
        title={editable ? 'לחצו כדי לשנות את שם הפרק' : undefined}
        data-placeholder={numbered && !focused ? '' : fallback}
        className={cn('chapter-title-edit outline-none rounded-md px-1 -mx-1 cursor-text', editable && 'hover:bg-sunk focus:bg-sunk')}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); save() }}
        onInput={(e) => setHasText(!!e.currentTarget.textContent.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
          if (e.key === 'Escape') { e.currentTarget.textContent = chapter.title || ''; setHasText(!!chapter.title); e.currentTarget.blur() }
        }}
        data-testid="chapter-title-input"
      />
    </h1>
  )
}

/**
 * A chapter shown as one continuous page made of its scenes.
 * Draws note markers in the margin and on a strip next to the scrollbar.
 */
const ChapterView = forwardRef(function ChapterView({ bk, chapter, activeSceneId, notes, onSceneFocus, onEditorReady, onSceneChange, onAnchorClick, onFirstEdit, onContextMenu, editable = true, maxWidth = '68ch' }, ref) {
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const { settings } = useSettings()
  const [markers, setMarkers] = useState([])
  const [strip, setStrip] = useState([])

  const measure = useCallback(() => {
    const sc = scrollRef.current, ct = contentRef.current
    if (!sc || !ct) return
    const base = ct.getBoundingClientRect()
    const anchors = [...ct.querySelectorAll('[data-note-id]')]
    const seen = new Set()
    const m = []
    for (const el of anchors) {
      const id = el.getAttribute('data-note-id')
      if (seen.has(id)) continue
      seen.add(id)
      const note = notes.find((n) => n.id === id)
      if (!note || note.done) continue
      const r = el.getBoundingClientRect()
      m.push({ id, top: r.top - base.top, type: note.type || 'fix' })
    }
    setMarkers(m)
    const total = sc.scrollHeight || 1
    const offset = ct.offsetTop
    setStrip(m.map((x) => ({ ...x, pct: ((x.top + offset) / total) * 100 })))
  }, [notes])

  useLayoutEffect(() => { measure() }, [measure, chapter?.scenes?.length])
  useEffect(() => {
    const ro = new ResizeObserver(() => measure())
    if (contentRef.current) ro.observe(contentRef.current)
    const t = setInterval(measure, 1500)
    return () => { ro.disconnect(); clearInterval(t) }
  }, [measure])

  useImperativeHandle(ref, () => ({
    scroller: () => scrollRef.current,
    scrollToScene(sceneId, behavior = 'smooth') {
      const el = contentRef.current?.querySelector(`[data-scene-block="${sceneId}"]`)
      if (el) scrollRef.current.scrollTo({ top: el.offsetTop - 24, behavior })
    },
    scrollToNote(noteId, behavior = 'smooth') {
      const el = contentRef.current?.querySelector(`[data-note-id="${noteId}"]`)
      if (!el) return false
      const top = el.getBoundingClientRect().top - scrollRef.current.getBoundingClientRect().top + scrollRef.current.scrollTop
      scrollRef.current.scrollTo({ top: Math.max(0, top - scrollRef.current.clientHeight / 3), behavior })
      contentRef.current.querySelectorAll('.note-anchor.is-active').forEach((x) => x.classList.remove('is-active'))
      contentRef.current.querySelectorAll(`[data-note-id="${noteId}"]`).forEach((x) => x.classList.add('is-active'))
      return true
    },
    measure,
  }), [measure])

  if (!chapter) return <div className="flex-1" />
  const multi = chapter.scenes.length > 1

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto" data-testid="editor-scroll" onScroll={() => {}}>
        <div className="mx-auto px-5 sm:px-10 pt-10 pb-[40vh]" style={{ maxWidth: `calc(${maxWidth} + 96px)` }}>
          <ChapterTitle bk={bk} chapter={chapter} editable={editable} />
          <div ref={contentRef} className="relative">
            {chapter.scenes.map((s, i) => (
              <section key={s.id} data-scene-block={s.id} className={cn('relative', s.unused && 'opacity-60')}>
                {i > 0 && <div className="text-center text-muted tracking-[0.4em] my-8 select-none" aria-hidden>* * *</div>}
                {multi && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-muted font-ui select-none">
                    <span className="w-2 h-2 rounded-full" style={{ background: (SCENE_STATUS[s.status] || SCENE_STATUS.idea).color }} />
                    <span className={cn(s.id === activeSceneId && 'text-accent')}>{s.title || `סצנה ${i + 1}`}</span>
                    {s.unused && <span>· לא בשימוש</span>}
                  </div>
                )}
                <SceneEditor
                  scene={s}
                  paragraphStyle={settings.paragraph_style}
                  editable={editable}
                  onFocus={onSceneFocus}
                  onReady={onEditorReady}
                  onChange={onSceneChange}
                  onAnchorClick={onAnchorClick}
                  onContextMenu={onContextMenu}
                  onFirstEdit={onFirstEdit}
                  placeholder={i === 0 ? 'כאן כותבים. הכול נשמר לבד.' : 'המשך כאן…'}
                />
              </section>
            ))}
            {/* Margin markers for notes (left side, opposite the text start in RTL). */}
            <div className="absolute top-0 -left-9 w-7 h-full pointer-events-none" aria-hidden={markers.length === 0}>
              {markers.map((m) => (
                <button
                  key={m.id}
                  className="absolute pointer-events-auto w-7 h-7 rounded-full flex items-center justify-center bg-surface border border-line shadow-sm"
                  style={{ top: m.top - 2, color: NOTE_TYPES[m.type]?.color }}
                  onClick={() => onAnchorClick(m.id)}
                  aria-label="פתח פתק"
                  data-testid={`margin-note-${m.id}`}
                >
                  <Pin size={14} />
                </button>
              ))}
            </div>
          </div>
          {editable && (
            <div className="mt-10 flex justify-center">
              <button className="hit inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg rounded-lg px-3" onClick={() => bk.addScene(chapter.id)}>
                <Plus size={15} />סצנה חדשה בפרק
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Note markers next to the scrollbar: see at a glance where notes are. */}
      <div className="note-strip" data-testid="note-strip">
        {strip.map((m) => (
          <button key={m.id} style={{ top: `calc(${m.pct}% )`, background: NOTE_TYPES[m.type]?.color }} onClick={() => onAnchorClick(m.id)} aria-label="קפוץ לפתק" />
        ))}
      </div>
    </div>
  )
})

export default ChapterView
