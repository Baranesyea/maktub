import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Upload, MoreVertical, Flame, ShieldCheck, ArrowLeft, Archive, Copy, Pencil, Trash2, CalendarClock } from 'lucide-react'
import { useSettings } from '@/lib/settings'
import { useBook } from '@/hooks/useBook'
import { usePlanToday } from '@/hooks/usePlanToday'
import { useToday, loadHistory } from '@/lib/stats'
import { computeStreak, dateKey } from '@/lib/planning'
import { createBook, duplicateBook, listBooks, bookWordCounts } from '@/lib/books'
import { isConnected } from '@/lib/drive'
import { db } from '@/api/db'
import { Page, Panel, Stat } from '@/components/AppShell'
import { Button, Dialog, IconButton, Menu, MenuItem, MenuSeparator, inputClass } from '@/components/ui'
import { formatNumber, htmlToText } from '@/lib/text'
import { chapterLabel } from '@/hooks/useBook'
import { todayKey, cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { CompassOnHome } from '@/components/Compass'

export default function Home() {
  const { settings, update } = useSettings()
  const navigate = useNavigate()
  const [books, setBooks] = useState(null)
  const [words, setWords] = useState({})
  const [newOpen, setNewOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [about, setAbout] = useState('')
  const [rename, setRename] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  const refresh = async () => {
    try {
      const list = await listBooks()
      setBooks(list)
      setWords(await bookWordCounts(list.map((b) => b.id)))
    } catch { setBooks([]) }
  }
  useEffect(() => { refresh() }, [])

  const create = async () => {
    const b = await createBook(title.trim() || 'ספר חדש', about.trim() ? { compass: { about: about.trim() } } : {})
    setNewOpen(false); setTitle(''); setAbout('')
    navigate(`/book/${b.id}`)
  }

  const activeBooks = (books || []).filter((b) => !b.archived)
  const archived = (books || []).filter((b) => b.archived)
  const focusBookId = settings.last_book_id && activeBooks.some((b) => b.id === settings.last_book_id) ? settings.last_book_id : activeBooks[0]?.id

  const dateLine = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
  const hasBook = activeBooks.length > 0
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : hour < 21 ? 'ערב טוב' : 'לילה טוב'
  return (
    <Page
      eyebrow={dateLine}
      title={books === null || hasBook ? greeting : 'ברוכים הבאים למכתוב'}
      testid="home"
      actions={books && !hasBook && <>
        <Button onClick={() => navigate('/import')}><Upload size={16} />ייבוא ספר קיים</Button>
        <Button variant="primary" onClick={() => setNewOpen(true)} data-testid="new-book"><Plus size={16} />ספר חדש</Button>
      </>}
    >
      {focusBookId && <TodayCard bookId={focusBookId} />}

      {hasBook && !isConnected() && !settings.backup_email?.enabled && (
        <div className="rounded-xl border border-line bg-raised px-4 py-3 flex flex-wrap items-center gap-3" data-testid="drive-reminder">
          <span className="w-9 h-9 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0"><ShieldCheck size={18} /></span>
          <div className="flex-1 min-w-[200px]">
            <div className="font-black text-[15px]">כדאי שיהיה לך עותק גם מחוץ למכתוב</div>
            <div className="text-[13px] text-muted">הכתיבה נשמרת כל הזמן. מומלץ להדליק גם גיבוי שבועי למייל שלך.</div>
          </div>
          <Button size="sm" onClick={() => navigate('/backup')}>להגדרות הגיבוי</Button>
        </div>
      )}

      <Panel
        title="הספרים שלי"
        description={books ? `${activeBooks.length} ${activeBooks.length === 1 ? 'ספר' : 'ספרים'}` : null}
        bodyClass="p-0"
        actions={<div className="flex items-center gap-1">
          {archived.length > 0 && <button className="text-[13px] text-muted hover:text-fg px-2" onClick={() => setShowArchived((x) => !x)}>{showArchived ? 'הסתר ארכיון' : `ארכיון (${archived.length})`}</button>}
          {hasBook && <Button size="sm" variant="ghost" onClick={() => navigate('/import')}><Upload size={15} />ייבוא</Button>}
          {hasBook && <Button size="sm" variant="ghost" onClick={() => setNewOpen(true)} data-testid="new-book"><Plus size={15} />ספר חדש</Button>}
        </div>}
      >
        {books === null && <p className="text-muted p-5">טוען…</p>}
        {books && activeBooks.length === 0 && (
          <div className="p-10 text-center">
            <p className="mb-4 text-muted">עוד אין ספרים. מתחילים ספר חדש, או מייבאים את מה שכבר כתבת.</p>
            <div className="flex justify-center gap-2">
              <Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={16} />ספר חדש</Button>
              <Button onClick={() => navigate('/import')}><Upload size={16} />ייבוא מוורד או מגוגל דוקס</Button>
            </div>
          </div>
        )}
        {books && activeBooks.length > 0 && (
          <div role="table" aria-label="הספרים שלי">
            <div role="row" className="hidden sm:grid grid-cols-[1fr_120px_140px_48px] gap-3 px-5 py-2 text-[12px] text-muted border-b border-line bg-raised">
              <span role="columnheader">שם הספר</span><span role="columnheader">מילים</span><span role="columnheader">עודכן</span><span />
            </div>
            {activeBooks.map((b) => <BookRow key={b.id} b={b} words={words[b.id]} onRename={() => setRename(b)} refresh={refresh} />)}
            {showArchived && archived.map((b) => <BookRow key={b.id} b={b} words={words[b.id]} onRename={() => setRename(b)} refresh={refresh} archivedRow />)}
          </div>
        )}
      </Panel>

      <Dialog open={newOpen} onOpenChange={setNewOpen} title="ספר חדש">
        <form onSubmit={(e) => { e.preventDefault(); create() }} className="flex flex-col gap-3">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="שם הספר (אפשר לשנות אחר כך)" autoFocus data-testid="new-book-title" />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">במשפט אחד, על מה הספר? (לא חובה)</span>
            <textarea className={cn(inputClass, 'h-auto py-2 leading-6 resize-none')} rows={2} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="למשל: נער מהפריפריה שמגלה שאבא שלו היה מרגל." style={{ fontSize: 16 }} data-testid="new-book-about" />
          </label>
          <Button variant="primary" type="submit" data-testid="create-book">צור ספר</Button>
        </form>
      </Dialog>
      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)} title="שינוי שם">
        {rename && (
          <form onSubmit={async (e) => { e.preventDefault(); await db.Book.update(rename.id, { title: e.target.elements.t.value }); setRename(null); refresh() }} className="flex flex-col gap-3">
            <input name="t" className={inputClass} defaultValue={rename.title} autoFocus />
            <Button variant="primary" type="submit">שמור</Button>
          </form>
        )}
      </Dialog>
    </Page>
  )
}

function BookRow({ b, words, onRename, refresh, archivedRow }) {
  const navigate = useNavigate()
  return (
    <div role="row" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/book/${b.id}`)}
      className={cn('group grid grid-cols-[1fr_48px] sm:grid-cols-[1fr_120px_140px_48px] gap-3 items-center px-5 py-3 border-b border-line last:border-b-0 hover:bg-raised cursor-pointer outline-none focus-visible:bg-raised', archivedRow && 'opacity-60')}
      onClick={() => navigate(`/book/${b.id}`)} data-testid="book-card">
      <div role="cell" className="min-w-0 flex items-center gap-3">
        <span className="w-8 h-10 shrink-0 rounded-[3px] bg-accent text-accent-fg flex items-center justify-center text-[13px] font-black shadow-[var(--shadow-sm)]" aria-hidden>{(b.title || 'ס').trim()[0]}</span>
        <div className="min-w-0">
          <div className="font-black truncate">{b.title}</div>
          <div className="sm:hidden text-[13px] text-muted tabular-nums">{formatNumber(words || 0)} מילים</div>
        </div>
      </div>
      <div role="cell" className="hidden sm:block text-[14px] tabular-nums">{formatNumber(words || 0)}</div>
      <div role="cell" className="hidden sm:block text-[13px] text-muted tabular-nums">{new Date(b.updated_date).toLocaleDateString('he-IL')}</div>
      <div role="cell" onClick={(e) => e.stopPropagation()}>
        <Menu trigger={<IconButton label="פעולות לספר"><MoreVertical size={17} /></IconButton>}>
          <MenuItem icon={Pencil} onSelect={onRename}>שנה שם</MenuItem>
          <MenuItem icon={Copy} onSelect={async () => { await duplicateBook(b.id); toast('נוצר עותק של הספר'); refresh() }}>שכפל (למשל לפני שכתוב גדול)</MenuItem>
          <MenuItem icon={CalendarClock} onSelect={() => navigate(`/book/${b.id}/plan`)}>תכנון זמנים</MenuItem>
          <MenuItem icon={Archive} onSelect={async () => { await db.Book.update(b.id, { archived: !b.archived }); refresh() }}>{b.archived ? 'הוצא מהארכיון' : 'העבר לארכיון'}</MenuItem>
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onSelect={async () => {
            await db.Book.update(b.id, { deleted: true, deleted_at: new Date().toISOString() })
            refresh()
            toast('הספר נמחק', { action: { label: 'בטל', run: async () => { await db.Book.update(b.id, { deleted: false }); refresh() } }, ms: 8000 })
          }}>מחק</MenuItem>
        </Menu>
      </div>
    </div>
  )
}

/** The daily dashboard: today's target, streak, where to continue, and the note from yesterday. */
function TodayCard({ bookId }) {
  const bk = useBook(bookId)
  const plan = usePlanToday(bk)
  const today = useToday()
  const { settings, update } = useSettings()
  const [history, setHistory] = useState([])
  useEffect(() => { loadHistory(60).then(setHistory) }, [today.words > 0])
  const navigate = useNavigate()
  const streak = useMemo(() => computeStreak([...history.filter((h) => h.date !== todayKey()), { date: todayKey(), words: today.words }], bk.book?.plan || {}, { goal: plan.todayTarget ? Math.max(1, Math.round(plan.todayTarget * 0.5)) : 1 }), [history, today.words, plan.todayTarget, bk.book?.plan])
  const nts = settings.note_to_self
  const fromBefore = nts?.text && nts.date && nts.date < todayKey() && nts.book_id === bookId
  const [draft, setDraft] = useState(nts?.date === todayKey() && nts.book_id === bookId ? nts.text : '')

  if (bk.loading || !bk.book) return <div className="h-56 rounded-xl bg-surface border border-line animate-pulse" />
  const lastPos = settings.last_position?.book_id === bookId ? settings.last_position : null
  const nextScene = bk.flatChapters.flatMap((c) => c.scenes.map((s) => ({ s, c }))).find(({ s }) => s.status !== 'done' && !s.unused)
  const pct = plan.todayTarget ? Math.min(100, Math.round((today.words / plan.todayTarget) * 100)) : null
  const dayOff = plan.hasPlan && plan.todayMinutes === 0
  const last30 = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); const k = dateKey(d); return { k, w: k === todayKey() ? today.words : history.find((h) => h.date === k)?.words || 0 } })
  const maxW = Math.max(1, ...last30.map((x) => x.w), plan.todayTarget || 0)

  const totalWords = bk.flatChapters.reduce((n, c) => n + (c.unused ? 0 : c.words || 0), 0)
  const minutes = Math.round((today.seconds || 0) / 60)
  // Where you stopped, and the last words you wrote there.
  const stopChapter = bk.flatChapters.find((c) => c.id === lastPos?.chapter_id) || bk.flatChapters[0]
  const stopScene = stopChapter && (stopChapter.scenes.find((s) => s.id === lastPos?.scene_id) || [...stopChapter.scenes].reverse().find((s) => s.content) || stopChapter.scenes[0])
  const stopText = htmlToText(stopScene?.content || '').replace(/\s+/g, ' ').trim()
  const tail = stopText.length > 170 ? '…' + stopText.slice(-170).replace(/^\S*\s/, '') : stopText
  const continueUrl = lastPos ? `/book/${bookId}?ch=${lastPos.chapter_id || ''}${lastPos.scene_id ? `&sc=${lastPos.scene_id}` : ''}` : `/book/${bookId}`
  const showNext = nextScene && nextScene.s.id !== stopScene?.id
  return (
    <div className="flex flex-col gap-4" data-tour="today" data-testid="today-card">
      <section className="rounded-2xl bg-fg text-bg p-6 sm:p-8 flex flex-col gap-5 shadow-[var(--shadow)]" aria-label="ממשיכים לכתוב">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div className="flex-1 min-w-[200px]">
            <div className="text-[13px] opacity-60">הספר שלך</div>
            <div className="text-[28px] sm:text-[34px] leading-tight font-black">{bk.book.title}</div>
          </div>
          <div className="text-[13px] opacity-70 tabular-nums">
            {dayOff ? 'היום יום חופש' : plan.todayTarget ? `היום ${formatNumber(today.words)} מתוך ${formatNumber(plan.todayTarget)} מילים` : `היום ${formatNumber(today.words)} מילים`}
            {pct != null && !dayOff && (
              <div className="h-1 w-40 rounded-full bg-bg/20 overflow-hidden mt-1.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-bg" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        </div>
        <CompassOnHome bk={bk} />
        {stopChapter && (
          <div className="border-s-2 border-bg/30 ps-4">
            <div className="text-[13px] opacity-60 mb-1">עצרת ב{chapterLabel(stopChapter)}{stopScene?.title && stopChapter.scenes.length > 1 ? ` · ${stopScene.title}` : ''}</div>
            {tail ? <p className="m-0 text-[17px] leading-8 font-write opacity-90" style={{ fontWeight: 'var(--write-weight, 300)' }}>{tail}</p> : <p className="m-0 text-[15px] opacity-70">הדף עוד ריק. זה הזמן למשפט הראשון.</p>}
          </div>
        )}
        {fromBefore && (
          <div className="rounded-lg bg-bg/10 px-4 py-3" data-testid="note-from-yesterday">
            <div className="text-[12px] opacity-60 mb-0.5">הערה לעצמך מ{nts.date === dateKey(new Date(Date.now() - 864e5)) ? 'אתמול' : 'הפעם הקודמת'}</div>
            <div className="text-[16px]">{nts.text}</div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <button onClick={() => navigate(continueUrl)} data-testid="continue-writing"
            className="h-14 px-7 rounded-xl bg-bg text-fg text-[18px] font-black inline-flex items-center gap-2 hover:opacity-90 transition-opacity">
            המשך לכתוב <ArrowLeft size={20} />
          </button>
          {showNext && (
            <button className="text-[14px] opacity-75 hover:opacity-100 underline underline-offset-4 decoration-bg/40" onClick={() => navigate(`/book/${bookId}?ch=${nextScene.c.id}&sc=${nextScene.s.id}`)}>
              או לסצנה הבאה: {nextScene.s.title || htmlToText(nextScene.s.summary || '').slice(0, 24) || chapterLabel(nextScene.c)}
            </button>
          )}
        </div>
        {plan.hasPlan && plan.unrealistic && <div className="text-[13px] opacity-80">היעד היום גבוה מהזמן שהגדרת. <Link className="underline" to={`/book/${bookId}/plan`}>לעדכן את התוכנית</Link></div>}
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="ימים ברצף" icon={Flame} value={streak} hint="ימי חופש לא שוברים את הרצף" />
        <Stat label="זמן כתיבה היום" value={minutes < 60 ? `${minutes} דק׳` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`} hint="רק זמן שבו באמת הקלדת" />
        <Stat label="מילים בספר" value={formatNumber(totalWords)} hint={`${bk.flatChapters.filter((c) => !c.unused).length} פרקים`} />
        <Stat label="יעד יומי" value={plan.todayTarget ? formatNumber(plan.todayTarget) : '—'} hint={plan.hasPlan ? 'לפי התוכנית שלך' : <Link to={`/book/${bookId}/plan`} className="underline underline-offset-4">לקבוע תאריך סיום</Link>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="הערה לעצמך למחר" description="תופיע כאן כשתחזור.">
          <textarea
            className={cn(inputClass, 'w-full h-auto py-2 leading-6')}
            rows={3}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); update({ note_to_self: { text: e.target.value, date: todayKey(), book_id: bookId } }) }}
            placeholder="למשל: מחר מתחילים מהשיחה במטבח"
            style={{ fontSize: 16 }}
            aria-label="הערה לעצמך למחר"
            data-testid="note-to-self"
          />
        </Panel>
        <Panel title="30 הימים האחרונים" description="מילים שהקלדת בכל יום">
          <div className="flex items-end gap-[3px] h-24" aria-label="מילים ב־30 הימים האחרונים">
            {last30.map((d) => (
              <div key={d.k} className={cn('flex-1 rounded-t-[2px]', d.k === todayKey() ? 'bg-accent' : d.w ? 'bg-accent/35' : 'bg-sunk')} style={{ height: `${Math.max(3, (d.w / maxW) * 100)}%` }} title={`${d.k}: ${d.w} מילים`} />
            ))}
          </div>
          <div className="flex justify-between text-[12px] text-muted mt-2"><span>לפני חודש</span><span>היום</span></div>
        </Panel>
      </div>
    </div>
  )
}
