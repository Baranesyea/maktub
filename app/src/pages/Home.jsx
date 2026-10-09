import { Logo } from '@/components/Logo'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Upload, Settings, MoreVertical, Flame, CloudOff, ArrowLeft, Archive, Copy, Pencil, Trash2, CalendarClock } from 'lucide-react'
import { useSettings } from '@/lib/settings'
import { useBook } from '@/hooks/useBook'
import { usePlanToday } from '@/hooks/usePlanToday'
import { useToday, loadHistory } from '@/lib/stats'
import { computeStreak, dateKey } from '@/lib/planning'
import { createBook, duplicateBook, listBooks, bookWordCounts } from '@/lib/books'
import { isConnected } from '@/lib/drive'
import { db } from '@/api/db'
import { Button, Dialog, IconButton, Menu, MenuItem, MenuSeparator, inputClass } from '@/components/ui'
import { formatNumber, htmlToText } from '@/lib/text'
import { chapterLabel } from '@/hooks/useBook'
import { todayKey, cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

export default function Home() {
  const { settings, update } = useSettings()
  const navigate = useNavigate()
  const [books, setBooks] = useState(null)
  const [words, setWords] = useState({})
  const [newOpen, setNewOpen] = useState(false)
  const [title, setTitle] = useState('')
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
    const b = await createBook(title.trim() || 'ספר חדש')
    setNewOpen(false); setTitle('')
    navigate(`/book/${b.id}`)
  }

  const activeBooks = (books || []).filter((b) => !b.archived)
  const archived = (books || []).filter((b) => b.archived)
  const focusBookId = settings.last_book_id && activeBooks.some((b) => b.id === settings.last_book_id) ? settings.last_book_id : activeBooks[0]?.id

  return (
    <div className="h-full overflow-y-auto">
      <header className="h-14 flex items-center gap-2 px-4 border-b border-line bg-surface">
        <Logo height={24} />
        <div className="flex-1" />
        <Link to="/settings"><IconButton label="הגדרות"><Settings size={18} /></IconButton></Link>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
        {!isConnected() && (
          <div className="rounded-2xl border border-line bg-surface p-4 flex flex-wrap items-center gap-3" data-testid="drive-reminder">
            <CloudOff size={20} className="text-warn shrink-0" />
            <div className="flex-1 min-w-[220px]">
              <div className="font-medium">הספר שלך עוד לא מגובה בדרייב שלך</div>
              <div className="text-sm text-muted">מומלץ לחבר את גוגל דרייב: עותק מסודר של כל פרק, שמתעדכן לבד. זה לוקח שתי לחיצות.</div>
            </div>
            <Button onClick={() => navigate('/settings#drive')}>חבר את גוגל דרייב</Button>
          </div>
        )}

        {focusBookId && <TodayCard bookId={focusBookId} />}

        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold flex-1">הספרים שלי</h2>
            <Button onClick={() => navigate('/import')}><Upload size={16} />ייבוא ספר קיים</Button>
            <Button variant="primary" onClick={() => setNewOpen(true)} data-testid="new-book"><Plus size={16} />ספר חדש</Button>
          </div>
          {books === null && <p className="text-muted">טוען…</p>}
          {books && activeBooks.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center">
              <p className="mb-3">עוד אין ספרים. מתחילים ספר חדש, או מייבאים את מה שכבר כתבת.</p>
              <div className="flex justify-center gap-2">
                <Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={16} />ספר חדש</Button>
                <Button onClick={() => navigate('/import')}><Upload size={16} />ייבוא מוורד או מגוגל דוקס</Button>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeBooks.map((b) => (
              <BookCard key={b.id} b={b} words={words[b.id]} onRename={() => setRename(b)} refresh={refresh} />
            ))}
          </div>
          {archived.length > 0 && (
            <div className="mt-4">
              <button className="text-sm text-muted underline" onClick={() => setShowArchived((x) => !x)}>{showArchived ? 'הסתר ארכיון' : `ארכיון (${archived.length})`}</button>
              {showArchived && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3 opacity-80">
                  {archived.map((b) => <BookCard key={b.id} b={b} words={words[b.id]} onRename={() => setRename(b)} refresh={refresh} />)}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <Dialog open={newOpen} onOpenChange={setNewOpen} title="ספר חדש">
        <form onSubmit={(e) => { e.preventDefault(); create() }} className="flex flex-col gap-3">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="שם הספר (אפשר לשנות אחר כך)" autoFocus data-testid="new-book-title" />
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
    </div>
  )
}

function BookCard({ b, words, onRename, refresh }) {
  const navigate = useNavigate()
  return (
    <div className="group rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2 hover:shadow-[var(--shadow)] transition-shadow cursor-pointer" onClick={() => navigate(`/book/${b.id}`)} data-testid="book-card">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-lg truncate">{b.title}</div>
          <div className="text-sm text-muted tabular-nums">{formatNumber(words || 0)} מילים</div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
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
      <div className="text-xs text-muted">עודכן {new Date(b.updated_date).toLocaleDateString('he-IL')}</div>
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

  if (bk.loading || !bk.book) return <div className="h-40 rounded-2xl bg-surface border border-line animate-pulse" />
  const lastPos = settings.last_position?.book_id === bookId ? settings.last_position : null
  const nextScene = bk.flatChapters.flatMap((c) => c.scenes.map((s) => ({ s, c }))).find(({ s }) => s.status !== 'done' && !s.unused)
  const pct = plan.todayTarget ? Math.min(100, Math.round((today.words / plan.todayTarget) * 100)) : null
  const dayOff = plan.hasPlan && plan.todayMinutes === 0
  const last30 = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); const k = dateKey(d); return { k, w: k === todayKey() ? today.words : history.find((h) => h.date === k)?.words || 0 } })
  const maxW = Math.max(1, ...last30.map((x) => x.w), plan.todayTarget || 0)

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 grid gap-5 md:grid-cols-[1.2fr_1fr]" data-tour="today" data-testid="today-card">
      <div className="flex flex-col gap-4">
        <div className="text-sm text-muted">היום, ב"{bk.book.title}"</div>
        {fromBefore && (
          <div className="rounded-xl bg-accent-soft p-3" data-testid="note-from-yesterday">
            <div className="text-xs text-accent mb-1">הערה לעצמך מ{nts.date === dateKey(new Date(Date.now() - 864e5)) ? 'אתמול' : 'הפעם הקודמת'}</div>
            <div className="text-[16px]" style={{ fontFamily: "'Fb Mockup', var(--ui-font)" }}>{nts.text}</div>
          </div>
        )}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <div className="text-4xl font-semibold tabular-nums">{formatNumber(today.words)}</div>
            <div className="text-sm text-muted">{dayOff ? 'היום יום חופש. אפשר לכתוב, אבל אין יעד.' : plan.todayTarget ? `מתוך ${formatNumber(plan.todayTarget)} מילים היום` : 'מילים היום'}</div>
          </div>
          <div className="flex items-center gap-1.5 text-warn" title="רצף ימי כתיבה. ימי חופש לא שוברים את הרצף."><Flame size={20} /><span className="text-xl font-semibold tabular-nums">{streak}</span><span className="text-sm text-muted">ימים ברצף</span></div>
        </div>
        {pct != null && !dayOff && (
          <div className="h-2 rounded-full bg-sunk overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-ok' : 'bg-accent')} style={{ width: `${pct}%` }} />
          </div>
        )}
        {plan.hasPlan && plan.unrealistic && <div className="text-sm text-warn">היעד היום גבוה מהזמן שהגדרת. <Link className="underline" to={`/book/${bookId}/plan`}>לעדכן את התוכנית</Link></div>}
        {!plan.hasPlan && <Link to={`/book/${bookId}/plan`} className="text-sm text-accent underline">קבעו תאריך סיום וזמני כתיבה, ומכתוב יחשב יעד יומי</Link>}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="lg" onClick={() => navigate(lastPos ? `/book/${bookId}?ch=${lastPos.chapter_id || ''}${lastPos.scene_id ? `&sc=${lastPos.scene_id}` : ''}` : `/book/${bookId}`)} data-testid="continue-writing">
            המשך מאיפה שעצרת <ArrowLeft size={18} />
          </Button>
          {nextScene && (
            <Button size="lg" onClick={() => navigate(`/book/${bookId}?ch=${nextScene.c.id}&sc=${nextScene.s.id}`)}>
              הסצנה הבאה: {nextScene.s.title || htmlToText(nextScene.s.summary || '').slice(0, 24) || chapterLabel(nextScene.c)}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-sm text-muted mb-2">30 הימים האחרונים</div>
          <div className="flex items-end gap-[3px] h-20" aria-label="מילים ב־30 הימים האחרונים">
            {last30.map((d) => (
              <div key={d.k} className={cn('flex-1 rounded-t-sm', d.k === todayKey() ? 'bg-accent' : 'bg-accent/40')} style={{ height: `${Math.max(2, (d.w / maxW) * 100)}%` }} title={`${d.k}: ${d.w} מילים`} />
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">הערה לעצמך למחר</span>
          <textarea
            className={cn(inputClass, 'h-auto py-2 leading-6')}
            rows={3}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); update({ note_to_self: { text: e.target.value, date: todayKey(), book_id: bookId } }) }}
            placeholder="למשל: מחר מתחילים מהשיחה במטבח"
            style={{ fontFamily: "'Fb Mockup', var(--ui-font)", fontSize: 16 }}
            data-testid="note-to-self"
          />
        </label>
      </div>
    </section>
  )
}
