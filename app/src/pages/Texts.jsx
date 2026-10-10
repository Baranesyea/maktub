// Texts: things you write that are not part of a book. A memory from a trip, a thought, the start
// of a story. Each text stands alone: a title, a line about it, and the text. No chapters, no order.
import { useEffect, useMemo, useRef, useState } from 'react'
import { keepCaretInView, movedByKeyboard } from '@/hooks/useViewport'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Search, ChevronRight, Trash2, NotebookPen, BookPlus } from 'lucide-react'
import IntoBookDialog from '@/components/IntoBookDialog'
import { db } from '@/api/db'
import { useTexts } from '@/hooks/useTexts'
import { Page, Loading } from '@/components/AppShell'
import { Button, inputClass } from '@/components/ui'
import SceneEditor from '@/components/editor/SceneEditor'
import { SaveStatus } from '@/components/WorkspaceBits'
import { useSettings } from '@/lib/settings'
import { htmlToText, formatNumber } from '@/lib/text'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

export default function TextsPage() {
  const { textId } = useParams()
  const store = useTexts()
  if (store.loading) return <Loading />
  return textId ? <TextPage store={store} textId={textId} /> : <TextList store={store} />
}

function TextList({ store }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return store.texts.filter((t) => words.every((w) => `${t.title} ${t.description} ${htmlToText(t.content || '')}`.toLowerCase().includes(w)))
  }, [store.texts, q])
  const create = async () => { const r = await store.create(); navigate(`/texts/${r.id}`) }
  return (
    <Page
      title="טקסטים"
      subtitle="כותבים כאן חופשי, מחוץ לספר: זיכרון, מחשבה, התחלה של סיפור. אם בסוף זה שייך לספר, מכניסים אותו לאן שרוצים בלחיצה."
      testid="texts"
      actions={<Button variant="primary" onClick={create} data-testid="text-new"><Plus size={16} />טקסט חדש</Button>}
    >
      {store.texts.length > 0 && (
        <label className="relative max-w-sm">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted" />
          <input className={cn(inputClass, 'w-full pr-9 bg-surface')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בטקסטים" aria-label="חיפוש בטקסטים" data-testid="texts-search" />
        </label>
      )}
      {shown.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="texts-list">
          {shown.map((t) => (
            <Link key={t.id} to={`/texts/${t.id}`} className="rounded-xl border border-line bg-surface p-5 flex flex-col gap-2 hover:shadow-[var(--shadow)] transition-shadow min-h-[150px]" data-testid={`text-card-${t.id}`}>
              <div className="font-black text-lg leading-snug line-clamp-2">{t.title || 'בלי כותרת'}</div>
              {t.description && <div className="text-sm text-muted line-clamp-2">{t.description}</div>}
              <div className="text-sm leading-6 line-clamp-3 font-write">{htmlToText(t.content || '').slice(0, 240)}</div>
              <div className="mt-auto pt-2 text-xs text-muted flex gap-2">
                <span>{fmtDate(t.created_date)}</span>
                {t.word_count > 0 && <span>· {formatNumber(t.word_count)} מילים</span>}
                {t.from_book && <span className="truncate">· מתוך "{t.from_book}"</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : store.texts.length ? (
        <p className="text-muted">אין תוצאות.</p>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-line-strong p-10 sm:p-16 text-center flex flex-col items-center gap-3" data-testid="texts-empty">
          <NotebookPen size={30} className="text-muted" />
          <div className="text-lg">כאן כותבים מה שלא שייך לספר</div>
          <p className="text-sm text-muted max-w-md">באמצע ספר על הצבא עלה זיכרון מטיול? כתבו אותו כאן, חופשי. כל טקסט נפרד, בלי פרקים ובלי סדר: כותרת, שורה עליו, והטקסט. ואם תחליטו שהוא שייך לספר, כפתור אחד מכניס אותו כפרק חדש או כסצנה בפרק שתבחרו.</p>
          <Button variant="primary" onClick={create}><Plus size={16} />טקסט ראשון</Button>
        </div>
      )}
    </Page>
  )
}

function TextPage({ store, textId }) {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const t = store.texts.find((x) => x.id === textId)
  const [intoBook, setIntoBook] = useState(false)
  const scroller = useRef(null)
  const [editor, setEditor] = useState(null)
  useEffect(() => {
    if (!editor) return
    const fn = () => { if (settings.typewriter && movedByKeyboard()) keepCaretInView(editor, scroller.current, { ratio: 0.42 }) }
    editor.on('selectionUpdate', fn); editor.on('update', fn)
    return () => { editor.off('selectionUpdate', fn); editor.off('update', fn) }
  }, [editor, settings.typewriter])
  if (!t) return (
    <Page title="טקסטים" testid="text-page">
      <p className="text-muted">הטקסט לא נמצא. <Link className="underline" to="/texts">לכל הטקסטים</Link></p>
    </Page>
  )
  const placed = ({ bookId, sceneId, chapter, scene }) => {
    setIntoBook(false)
    store.update(t.id, { deleted: true }, { delay: 100 })
    navigate(`/book/${bookId}?sc=${sceneId}`)
    toast('הטקסט נכנס לספר', {
      action: { label: 'בטל', run: () => {
        store.update(t.id, { deleted: false }, { delay: 100 })
        const gone = { deleted: true, deleted_at: new Date().toISOString() }
        db.Scene.update(scene.id, gone).catch(() => {})
        if (chapter) db.Chapter.update(chapter.id, gone).catch(() => {})
        navigate(`/texts/${t.id}`)
      } },
      ms: 7000,
    })
  }
  const remove = () => {
    store.update(t.id, { deleted: true }, { delay: 200 })
    navigate('/texts')
    toast('הטקסט נמחק', { action: { label: 'בטל', run: () => store.update(t.id, { deleted: false }, { delay: 100 }) } })
  }
  return (
    <div className="h-full flex flex-col" data-testid="text-page">
      <header className="chrome h-14 shrink-0 flex items-center gap-2 px-3 border-b border-line bg-surface">
        <Link to="/texts" className="hit inline-flex items-center gap-1 rounded-lg px-2 text-sm text-muted hover:bg-sunk" data-testid="back-to-texts"><ChevronRight size={16} />טקסטים</Link>
        <div className="flex-1" />
        <span className="text-sm text-muted tabular-nums">{formatNumber(t.word_count || 0)} מילים</span>
        <SaveStatus />
        <Button size="sm" onClick={() => setIntoBook(true)} data-testid="text-into-book"><BookPlus size={15} />הכנסה לספר</Button>
        <Button variant="ghost" size="sm" className="text-muted" onClick={remove} data-testid="text-delete"><Trash2 size={15} />מחיקה</Button>
      </header>
      <main ref={scroller} className="flex-1 min-h-0 overflow-y-auto bg-surface">
        <div className="mx-auto max-w-[720px] px-5 sm:px-8 pt-10 pb-[45vh] flex flex-col gap-2">
          <input
            key={`t-${t.id}`}
            className="w-full bg-transparent outline-none font-write font-black placeholder:text-faint placeholder:font-normal"
            style={{ fontSize: 'calc(var(--write-size) * 1.45)' }}
            defaultValue={t.title || ''}
            placeholder="כותרת"
            autoFocus={!t.title}
            onChange={(e) => store.update(t.id, { title: e.target.value })}
            aria-label="כותרת"
            data-testid="text-title"
          />
          <input
            key={`d-${t.id}`}
            className="w-full bg-transparent outline-none text-muted placeholder:text-faint mb-6"
            defaultValue={t.description || ''}
            placeholder="שורה על הטקסט (לא חובה)"
            onChange={(e) => store.update(t.id, { description: e.target.value })}
            aria-label="תיאור"
            data-testid="text-description"
          />
          <div className="texts-writing">
          <SceneEditor
            key={t.id}
            scene={{ id: t.id, content: t.content || '', word_count: t.word_count || 0 }}
            paragraphStyle={settings.paragraph_style}
            onReady={(_id, ed) => setEditor(ed)}
            onChange={(id, html, words) => store.update(id, { content: html, word_count: words })}
            placeholder="כאן כותבים. הכול נשמר לבד."
          />
          </div>
        </div>
      </main>
      {intoBook && <IntoBookDialog text={t} open onClose={() => setIntoBook(false)} onDone={placed} />}
    </div>
  )
}
