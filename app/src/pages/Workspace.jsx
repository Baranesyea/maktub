import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Menu as MenuIcon, PanelLeft, Maximize2, Minimize2, BookOpen, Search, MoreVertical, Home, LayoutGrid, FileText, Upload, Download, CalendarClock, Clock, Trash2, Settings, HelpCircle, Check, X, Layers } from 'lucide-react'
import { useBook } from '@/hooks/useBook'
import { useSettings } from '@/lib/settings'
import { useLayoutMode, useOnScreenKeyboard, keepCaretInView } from '@/hooks/useViewport'
import BookTree from '@/components/BookTree'
import ChapterView from '@/components/ChapterView'
import SidePanel from '@/components/SidePanel'
import BoardView from '@/components/BoardView'
import { SaveStatus, TextSizeControl, FormatBar, SprintButton, DriveBadge } from '@/components/WorkspaceBits'
import { VersionsDialog, TrashDialog, FindReplaceDialog } from '@/components/Dialogs'
import ExportDialog from '@/components/ExportDialog'
import { Menu, MenuItem, MenuSeparator, IconButton, Button } from '@/components/ui'
import { removeNoteAnchor, retypeNoteAnchor, splitAtCursor, ensureWordSelection } from '@/components/editor/extensions'
import { useToday } from '@/lib/stats'
import { useDriveState, markBookDirty } from '@/lib/drive'
import { db } from '@/api/db'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/text'
import { usePlanToday } from '@/hooks/usePlanToday'
import { startTour } from '@/components/Tour'

const SNAPSHOT_GAP_MS = 30 * 60 * 1000

export default function Workspace() {
  const { bookId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const bk = useBook(bookId)
  const { settings, update: updateSettings } = useSettings()
  const layout = useLayoutMode()
  const kb = useOnScreenKeyboard()
  const today = useToday()
  const drive = useDriveState(bookId)
  const plan = usePlanToday(bk)

  const [chapterId, setChapterId] = useState(params.get('ch'))
  const [sceneId, setSceneId] = useState(params.get('sc'))
  const [view, setView] = useState(params.get('view') === 'board' ? 'board' : 'write')
  const [sideTab, setSideTab] = useState('notes')
  const [sideOpen, setSideOpen] = useState(() => window.innerWidth >= 1180)
  const [treeOpen, setTreeOpen] = useState(() => window.innerWidth >= 760)
  const [focusMode, setFocusMode] = useState(false)
  const [typing, setTyping] = useState(false)
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [focusNoteId, setFocusNoteId] = useState(null)
  const [backPos, setBackPos] = useState(null)
  const [dialog, setDialog] = useState(null) // versions | trash | find | export
  const [exportChapters, setExportChapters] = useState(null)
  const editors = useRef(new Map())
  const [activeEditor, setActiveEditor] = useState(null)
  const chapterRef = useRef(null)
  const pendingScroll = useRef(null)
  const lastSnapshot = useRef(new Map())
  const typingTimer = useRef(null)

  // Default to the first chapter, or the one in the URL.
  useEffect(() => {
    if (bk.loading || !bk.flatChapters.length) return
    if (!chapterId || !bk.flatChapters.some((c) => c.id === chapterId)) {
      const sc = sceneId && bk.flatChapters.find((c) => c.scenes.some((s) => s.id === sceneId))
      setChapterId((sc || bk.flatChapters[0]).id)
    }
  }, [bk.loading, bk.flatChapters, chapterId, sceneId])

  useEffect(() => { if (bk.book) updateSettings({ last_book_id: bk.book.id }) }, [bk.book?.id])
  useEffect(() => {
    const p = {}
    if (chapterId) p.ch = chapterId
    if (sceneId) p.sc = sceneId
    if (view === 'board') p.view = 'board'
    setParams(p, { replace: true })
    if (chapterId) updateSettings({ last_position: { book_id: bookId, chapter_id: chapterId, scene_id: sceneId || null } })
  }, [chapterId, sceneId, view])

  useEffect(() => {
    if (layout === 'wide') { setSideOpen((x) => x); setTreeOpen(true) }
    if (layout === 'narrow') { setTreeOpen(false); setSideOpen(false) }
  }, [layout])

  const chapter = bk.flatChapters.find((c) => c.id === chapterId) || null
  const scene = bk.scenes.find((s) => s.id === sceneId) || chapter?.scenes[0] || null
  const noteCounts = useMemo(() => {
    const m = {}
    for (const n of bk.notes) if (!n.done) m[n.scene_id] = (m[n.scene_id] || 0) + 1
    return m
  }, [bk.notes])

  // After switching chapter, scroll to the requested scene or note once it has rendered.
  useEffect(() => {
    const p = pendingScroll.current
    if (!p || !chapterRef.current) return
    const t = setTimeout(() => {
      if (p.noteId && chapterRef.current.scrollToNote(p.noteId)) { /* done */ }
      else if (p.sceneId) chapterRef.current.scrollToScene(p.sceneId)
      else if (p.scrollTop != null) chapterRef.current.scroller()?.scrollTo({ top: p.scrollTop })
      pendingScroll.current = null
    }, 80)
    return () => clearTimeout(t)
  }, [chapterId, bk.notes, view])

  const closeDrawersIfNarrow = () => { if (layout !== 'wide') { if (layout === 'narrow') setTreeOpen(false); setSideOpen(false) } }

  const openChapter = useCallback((id) => {
    setView('write'); setChapterId(id); setSceneId(null)
    pendingScroll.current = { scrollTop: 0 }
    if (layout === 'narrow') setTreeOpen(false)
  }, [layout])

  const openScene = useCallback((id) => {
    const ch = bk.flatChapters.find((c) => c.scenes.some((s) => s.id === id)) || bk.flatChapters.find((c) => c.id === bk.scenes.find((s) => s.id === id)?.chapter_id)
    if (!ch) return
    setView('write'); setChapterId(ch.id); setSceneId(id)
    pendingScroll.current = { sceneId: id }
    if (ch.id === chapterId) setTimeout(() => chapterRef.current?.scrollToScene(id), 30)
    if (layout === 'narrow') setTreeOpen(false)
  }, [bk.flatChapters, bk.scenes, chapterId, layout])

  // ---------- Editing ----------
  const onSceneChange = useCallback((id, html, words) => {
    const s = bk.scenes.find((x) => x.id === id)
    const patch = { content: html, word_count: words }
    if (s && (!s.status || s.status === 'idea') && words > 0) patch.status = 'draft'
    bk.update('scenes', id, patch, { delay: 900 })
    markBookDirty(bookId)
    if (focusMode) {
      setTyping(true)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => setTyping(false), 1800)
    }
  }, [bk.scenes, bk.update, focusMode, bookId])

  const onFirstEdit = useCallback((id) => {
    const s = bk.scenes.find((x) => x.id === id)
    const last = lastSnapshot.current.get(id) || 0
    if (!s || !s.content || Date.now() - last < SNAPSHOT_GAP_MS) return
    lastSnapshot.current.set(id, Date.now())
    db.Snapshot.create({ book_id: bookId, scene_id: id, content: s.content, word_count: s.word_count || 0, reason: 'auto' }).catch(() => {})
  }, [bk.scenes, bookId])

  const onEditorReady = useCallback((id, ed) => {
    if (ed) editors.current.set(id, ed); else editors.current.delete(id)
  }, [])
  const onSceneFocus = useCallback((id, ed) => { setSceneId(id); setActiveEditor(ed) }, [])

  // Typewriter scrolling (focus mode, iPad keyboard mode).
  useEffect(() => {
    if (!activeEditor) return
    const fn = () => {
      if (!(focusMode && settings.typewriter) && !kb.open) return
      keepCaretInView(activeEditor, chapterRef.current?.scroller(), kb.open ? { ratio: 0.45, visibleTop: kb.top, visibleHeight: kb.height - 48 } : { ratio: 0.42 })
    }
    activeEditor.on('selectionUpdate', fn); activeEditor.on('update', fn)
    return () => { activeEditor.off('selectionUpdate', fn); activeEditor.off('update', fn) }
  }, [activeEditor, focusMode, settings.typewriter, kb.open, kb.top, kb.height])

  // ---------- Notes ----------
  const editorFor = (sid) => editors.current.get(sid)
  const addNote = useCallback(async () => {
    const ed = activeEditor
    if (!ed) { toast('לחצו קודם בתוך הטקסט'); return }
    const sid = [...editors.current.entries()].find(([, e]) => e === ed)?.[0]
    const quote = ensureWordSelection(ed)
    if (!quote) { toast('סמנו מילה או משפט כדי להדביק עליהם פתק'); return }
    const { from, to } = ed.state.selection
    const note = await bk.createRecord('notes', { scene_id: sid, type: 'fix', text: '', quote: quote.slice(0, 140), done: false, anchored: true })
    ed.chain().setTextSelection({ from, to }).setMark('noteAnchor', { noteId: note.id, noteType: 'fix' }).setTextSelection(to).run()
    ed.commands.blur()
    setActiveNoteId(note.id); setFocusNoteId(note.id); setSideTab('notes'); setSideOpen(true)
  }, [activeEditor, bk.createRecord])

  const addSceneNote = useCallback(async () => {
    if (!scene) return
    const note = await bk.createRecord('notes', { scene_id: scene.id, type: 'fix', text: '', quote: '', done: false, anchored: false })
    setActiveNoteId(note.id); setFocusNoteId(note.id)
  }, [scene, bk.createRecord])

  const stripAnchorFromHtml = (sid, noteId) => {
    const s = bk.scenes.find((x) => x.id === sid)
    if (!s?.content?.includes(noteId)) return
    const doc = new DOMParser().parseFromString(`<body>${s.content}</body>`, 'text/html')
    doc.querySelectorAll(`[data-note-id="${noteId}"]`).forEach((el) => el.replaceWith(...el.childNodes))
    bk.setSceneContent(sid, doc.body.innerHTML)
  }
  const removeAnchor = (n) => {
    const ed = editorFor(n.scene_id)
    if (ed) { if (removeNoteAnchor(ed, n.id)) return }
    stripAnchorFromHtml(n.scene_id, n.id)
  }
  const onNoteDone = (n, done) => {
    if (done) removeAnchor(n)
    bk.update('notes', n.id, { done, done_at: done ? new Date().toISOString() : null }, { delay: 200 })
  }
  const onNoteDelete = (n) => { removeAnchor(n); bk.removeRecord('notes', n.id) }
  const onNoteRetype = (n, type) => {
    bk.update('notes', n.id, { type }, { delay: 200 })
    const ed = editorFor(n.scene_id)
    if (ed) retypeNoteAnchor(ed, n.id, type)
  }

  const jumpToNote = useCallback((n) => {
    if (!backPos) setBackPos({ chapterId, sceneId, scrollTop: chapterRef.current?.scroller()?.scrollTop || 0 })
    setActiveNoteId(n.id)
    const ch = bk.flatChapters.find((c) => c.scenes.some((s) => s.id === n.scene_id))
    if (!ch) return
    setView('write')
    if (ch.id !== chapterId) {
      pendingScroll.current = { noteId: n.anchored ? n.id : null, sceneId: n.scene_id }
      setChapterId(ch.id)
    } else if (!(n.anchored && chapterRef.current?.scrollToNote(n.id))) {
      chapterRef.current?.scrollToScene(n.scene_id)
    }
    setSceneId(n.scene_id)
    if (layout === 'narrow') setSideOpen(false)
  }, [backPos, chapterId, sceneId, bk.flatChapters, layout])

  const goBack = () => {
    if (!backPos) return
    pendingScroll.current = { scrollTop: backPos.scrollTop }
    if (backPos.chapterId === chapterId) chapterRef.current?.scroller()?.scrollTo({ top: backPos.scrollTop, behavior: 'smooth' })
    setChapterId(backPos.chapterId); setSceneId(backPos.sceneId)
    setBackPos(null); setActiveNoteId(null)
  }

  const onAnchorClick = useCallback((noteId) => {
    setActiveNoteId(noteId); setSideTab('notes'); setSideOpen(true)
    setTimeout(() => document.querySelector(`[data-testid="note-card-${noteId}"]`)?.scrollIntoView({ block: 'nearest' }), 100)
  }, [])

  const splitHere = async () => {
    const ed = activeEditor
    const sid = [...editors.current.entries()].find(([, e]) => e === ed)?.[0]
    if (!ed || !sid) { toast('לחצו בתוך הטקסט במקום שבו רוצים לפצל'); return }
    const { before, after } = splitAtCursor(ed)
    const created = await bk.splitScene(sid, before, after)
    if (created) { setSceneId(created.id); toast('הסצנה פוצלה לשתיים') }
  }

  // ---------- Text size and shortcuts ----------
  const setSize = (v) => updateSettings(kb.open ? { ipad_size: v } : { write_size: v })
  const size = kb.open ? settings.ipad_size : settings.write_size
  useEffect(() => {
    if (kb.open) document.documentElement.style.setProperty('--write-size', `${settings.ipad_size}px`)
    else document.documentElement.style.setProperty('--write-size', `${settings.write_size}px`)
  }, [kb.open, settings.ipad_size, settings.write_size])

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setSize(Math.min(32, size + 1)) }
      else if (mod && e.key === '-') { e.preventDefault(); setSize(Math.max(13, size - 1)) }
      else if (mod && e.key === '0') { e.preventDefault(); setSize(19) }
      else if (mod && e.shiftKey && (e.key === 'M' || e.key === 'm')) { e.preventDefault(); addNote() }
      else if (mod && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); setFocusMode((x) => !x) }
      else if (mod && e.shiftKey && (e.key === 'H' || e.key === 'h')) { e.preventDefault(); setDialog('find') }
      else if (mod && e.shiftKey && e.key === 'Enter') { e.preventDefault(); splitHere() }
      else if (e.key === 'Escape' && focusMode) setFocusMode(false)
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !document.activeElement?.isContentEditable && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        if (bk.undoMove()) { e.preventDefault(); toast('ההזזה בוטלה') }
      }
    }
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (!e.target.closest?.('[data-testid="editor-scroll"]')) return
      e.preventDefault()
      setSize(Math.max(13, Math.min(32, size + (e.deltaY < 0 ? 1 : -1))))
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('wheel', onWheel) }
  }, [size, focusMode, addNote, activeEditor])

  useEffect(() => {
    const onMove = () => setTyping(false)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    if (kb.open && !settings.kb_tip_seen) {
      toast('טיפ: צובטים את המקלדת בשתי אצבעות כדי להפוך אותה למקלדת קטנה וצפה, וכך רואים כמעט את כל המסך.', { ms: 9000 })
      updateSettings({ kb_tip_seen: true })
    }
  }, [kb.open])

  if (bk.loading) return <div className="h-full flex items-center justify-center text-muted">טוען את הספר…</div>
  if (bk.error || !bk.book) return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
      <p>לא הצלחנו לטעון את הספר.</p>
      <p className="text-sm text-muted">אם אין חיבור לאינטרנט, נסו שוב כשהוא יחזור.</p>
      <div className="flex gap-2"><Button onClick={bk.reload}>נסה שוב</Button><Button variant="ghost" onClick={() => navigate('/')}>למסך הבית</Button></div>
    </div>
  )

  const notesProps = {
    chapterId, sceneId: scene?.id, activeNoteId, onJump: jumpToNote, onBack: goBack, canGoBack: !!backPos,
    onAddSceneNote: addSceneNote, onDone: onNoteDone, onDelete: onNoteDelete, onRetype: onNoteRetype, focusNoteId, onFocused: () => setFocusNoteId(null),
  }
  const showTree = !focusMode && !kb.open && treeOpen
  const showSide = !focusMode && !kb.open && sideOpen
  const treeAsDrawer = layout === 'narrow'
  const sideAsDrawer = layout !== 'wide'

  // ---------- iPad on-screen keyboard mode: only the text and a slim bar ----------
  if (kb.open) {
    return (
      <div className="fixed inset-x-0 flex flex-col bg-surface" style={{ top: kb.top, height: kb.height }} data-testid="keyboard-mode">
        <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-line text-sm">
          <span className="truncate font-medium flex-1">{scene?.title || chapter?.title || bk.book.title}</span>
          <span className="text-muted tabular-nums">היום {formatNumber(today.words)}</span>
          <SaveStatus compact />
          <button className="hit px-2 text-accent font-medium" onMouseDown={(e) => e.preventDefault()} onClick={() => activeEditor?.commands.blur()} data-testid="kb-done">סיום</button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <ChapterView ref={chapterRef} bk={bk} chapter={chapter} activeSceneId={scene?.id} notes={bk.notes} onSceneFocus={onSceneFocus} onEditorReady={onEditorReady} onSceneChange={onSceneChange} onAnchorClick={onAnchorClick} onFirstEdit={onFirstEdit} />
        </div>
        <div className="h-11 shrink-0 flex items-center justify-center gap-1 border-t border-line bg-sunk" onMouseDown={(e) => e.preventDefault()}>
          <FormatBar editor={activeEditor} onAddNote={addNote} onSplit={splitHere} />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('h-full flex flex-col overflow-hidden', focusMode && 'focus-mode', focusMode && typing && 'is-typing')} data-testid="workspace">
      {/* Top bar */}
      <header className="chrome h-14 shrink-0 flex items-center gap-1 px-2 border-b border-line bg-surface min-w-0">
        {!focusMode && <IconButton label="עץ הספר" onClick={() => setTreeOpen((x) => !x)} active={treeOpen} data-testid="toggle-tree"><MenuIcon size={18} /></IconButton>}
        <div className="hidden md:flex items-center gap-1 rounded-lg bg-sunk p-0.5" role="group" aria-label="תצוגה">
          <button className={cn('h-8 px-2.5 rounded-md text-sm inline-flex items-center gap-1', view === 'write' ? 'bg-surface shadow-sm' : 'text-muted')} onClick={() => setView('write')}><FileText size={15} />כתיבה</button>
          <button className={cn('h-8 px-2.5 rounded-md text-sm inline-flex items-center gap-1', view === 'board' ? 'bg-surface shadow-sm' : 'text-muted')} onClick={() => setView('board')} data-testid="view-board"><LayoutGrid size={15} />כרטיסים</button>
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-center">
          {view === 'write' && !focusMode && layout !== 'narrow' && <FormatBar editor={activeEditor} onAddNote={addNote} onSplit={splitHere} className="hidden lg:inline-flex" />}
        </div>
        <div className="flex items-center rounded-lg border border-line bg-raised h-10 px-0.5 gap-0.5 min-w-0">
          <Link to="/" className="hit hidden md:inline-flex items-center gap-1 rounded-md px-2 text-sm text-muted hover:bg-sunk tabular-nums whitespace-nowrap" title="היעד של היום" data-testid="today-pill">
            היום {formatNumber(today.words)}{plan.todayTarget ? ` / ${formatNumber(plan.todayTarget)}` : ''}
            {plan.todayTarget > 0 && today.words >= plan.todayTarget && <Check size={14} className="text-ok" />}
          </Link>
          <span className="hidden md:block w-px h-5 bg-line" aria-hidden />
          <span className="px-1.5"><SaveStatus compact={layout !== 'wide'} /></span>
          {layout !== 'narrow' && <span className="w-px h-5 bg-line" aria-hidden />}
          {layout !== 'narrow' && <DriveBadge state={drive} onClick={() => navigate('/settings#drive')} />}
        </div>
        <span className="w-1" />
        {layout !== 'narrow' && <TextSizeControl value={size} onChange={setSize} />}
        {layout !== 'narrow' && <SprintButton />}
        {layout !== 'narrow' && <IconButton label={focusMode ? 'צא ממצב ריכוז (Esc)' : 'מצב ריכוז'} onClick={() => setFocusMode((x) => !x)} active={focusMode} data-testid="focus-toggle" data-tour="focus">{focusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</IconButton>}
        <IconButton label="מצב קריאה" onClick={() => navigate(`/book/${bookId}/read${chapterId ? `?ch=${chapterId}` : ''}`)} data-testid="reading-toggle" data-tour="reading"><BookOpen size={18} /></IconButton>
        {!focusMode && <IconButton label="חלונית צד" onClick={() => setSideOpen((x) => !x)} active={sideOpen} data-testid="toggle-side"><PanelLeft size={18} /></IconButton>}
        <Menu trigger={<IconButton label="עוד" data-testid="more-menu" data-tour="more"><MoreVertical size={18} /></IconButton>}>
          <MenuItem icon={Home} onSelect={() => navigate('/')}>מסך הבית</MenuItem>
          {layout === 'narrow' && (
            <>
              <MenuItem icon={Maximize2} onSelect={() => setFocusMode(true)}>מצב ריכוז</MenuItem>
              <MenuItem onSelect={() => setSize(Math.min(32, size + 1))}>הגדל טקסט ({size})</MenuItem>
              <MenuItem onSelect={() => setSize(Math.max(13, size - 1))}>הקטן טקסט</MenuItem>
              <MenuItem onSelect={() => navigate('/settings#drive')}>גיבוי לדרייב</MenuItem>
            </>
          )}
          <MenuItem icon={LayoutGrid} onSelect={() => setView(view === 'board' ? 'write' : 'board')}>{view === 'board' ? 'תצוגת כתיבה' : 'לוח כרטיסים'}</MenuItem>
          <MenuItem icon={Search} onSelect={() => setDialog('find')}>חיפוש והחלפה</MenuItem>
          <MenuSeparator />
          <MenuItem icon={Upload} onSelect={() => navigate(`/book/${bookId}/import`)}>ייבוא קובץ וורד</MenuItem>
          <MenuItem icon={Download} onSelect={() => { setExportChapters(null); setDialog('export') }}>ייצוא לוורד או לפי די אף</MenuItem>
          <MenuSeparator />
          <MenuItem icon={CalendarClock} onSelect={() => navigate(`/book/${bookId}/plan`)}>תכנון זמנים ויעדים</MenuItem>
          <MenuItem icon={Clock} onSelect={() => navigate(`/book/${bookId}/timeline`)}>ציר זמן</MenuItem>
          <MenuItem icon={Layers} onSelect={async () => { if (!bk.book.use_parts) { bk.update('book', bk.book.id, { use_parts: true }); if (!bk.parts.filter((p) => !p.deleted).length) await bk.addPart('חלק ראשון') } else bk.update('book', bk.book.id, { use_parts: false }) }}>{bk.book.use_parts ? 'כבה חלוקה לחלקים' : 'הפעל חלוקה לחלקים'}</MenuItem>
          {bk.book.use_parts && <MenuItem onSelect={() => bk.addPart('')}>הוסף חלק</MenuItem>}
          <MenuItem icon={Trash2} onSelect={() => setDialog('trash')}>סל מחזור</MenuItem>
          <MenuSeparator />
          <MenuItem icon={Settings} onSelect={() => navigate('/settings')}>הגדרות, גופנים וגיבוי</MenuItem>
          <MenuItem icon={HelpCircle} onSelect={() => startTour()}>סיור מודרך</MenuItem>
        </Menu>
      </header>

      <div className="flex-1 min-h-0 flex relative">
        {/* Tree: right side in RTL */}
        {showTree && (
          treeAsDrawer ? (
            <div className="fixed inset-0 z-40 flex" onClick={() => setTreeOpen(false)}>
              <div className="w-[min(320px,86vw)] h-full shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
                <BookTree bk={bk} activeChapterId={chapterId} activeSceneId={sceneId} onOpenChapter={openChapter} onOpenScene={openScene} noteCounts={noteCounts} onExport={(ids) => { setExportChapters(ids); setDialog('export') }} onClose={() => setTreeOpen(false)} />
              </div>
              <div className="flex-1 bg-black/30" />
            </div>
          ) : (
            <aside className="w-[272px] shrink-0 border-e border-line">
              <BookTree bk={bk} activeChapterId={chapterId} activeSceneId={sceneId} onOpenChapter={openChapter} onOpenScene={openScene} noteCounts={noteCounts} onExport={(ids) => { setExportChapters(ids); setDialog('export') }} />
            </aside>
          )
        )}

        <main className="flex-1 min-w-0 flex flex-col bg-surface" data-tour="editor">
          {view === 'board'
            ? <BoardView bk={bk} noteCounts={noteCounts} onOpenScene={openScene} />
            : chapter
              ? <ChapterView ref={chapterRef} bk={bk} chapter={chapter} activeSceneId={scene?.id} notes={bk.notes} onSceneFocus={onSceneFocus} onEditorReady={onEditorReady} onSceneChange={onSceneChange} onAnchorClick={onAnchorClick} onFirstEdit={onFirstEdit} />
              : <EmptyBook bk={bk} onOpenChapter={openChapter} />}
          {view === 'write' && layout === 'narrow' && !focusMode && (
            <div className="chrome h-12 shrink-0 border-t border-line flex items-center justify-center bg-sunk overflow-x-auto">
              <FormatBar editor={activeEditor} onAddNote={addNote} onSplit={splitHere} />
            </div>
          )}
        </main>

        {/* Side panel: left side in RTL */}
        {showSide && (
          sideAsDrawer ? (
            <div className="fixed inset-0 z-40 flex flex-row-reverse" onClick={() => setSideOpen(false)}>
              <div className="w-[min(360px,90vw)] h-full shadow-[var(--shadow)]" onClick={(e) => e.stopPropagation()}>
                <SidePanel bk={bk} tab={sideTab} onTab={setSideTab} scene={scene} chapter={chapter} notesProps={notesProps} onOpenScene={openScene} onShowVersions={() => setDialog('versions')} onClose={() => setSideOpen(false)} />
              </div>
              <div className="flex-1 bg-black/30" />
            </div>
          ) : (
            <aside className="w-[340px] shrink-0 border-s border-line">
              <SidePanel bk={bk} tab={sideTab} onTab={setSideTab} scene={scene} chapter={chapter} notesProps={notesProps} onOpenScene={openScene} onShowVersions={() => setDialog('versions')} />
            </aside>
          )
        )}
        {focusMode && (
          <button className="chrome absolute top-3 left-3 hit rounded-lg px-3 text-sm text-muted hover:bg-sunk inline-flex items-center gap-1" onClick={() => setFocusMode(false)}><X size={15} />יציאה ממצב ריכוז</button>
        )}
      </div>

      <VersionsDialog bk={bk} scene={scene} open={dialog === 'versions'} onClose={() => setDialog(null)} />
      <TrashDialog bk={bk} open={dialog === 'trash'} onClose={() => setDialog(null)} />
      <FindReplaceDialog bk={bk} open={dialog === 'find'} onClose={() => setDialog(null)} onOpenScene={openScene} />
      <ExportDialog bk={bk} open={dialog === 'export'} initialChapters={exportChapters} onClose={() => setDialog(null)} />
    </div>
  )
}

function EmptyBook({ bk, onOpenChapter }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg">הספר ריק. מתחילים מפרק ראשון.</p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => bk.addChapter().then(({ chapter }) => onOpenChapter(chapter.id))} data-testid="first-chapter">פרק ראשון</Button>
        <Link to={`/book/${bk.book.id}/import`}><Button>ייבוא ספר קיים</Button></Link>
      </div>
    </div>
  )
}
