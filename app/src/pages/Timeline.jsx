import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, ChevronDown, ChevronLeft } from 'lucide-react'
import { useBook, chapterLabel } from '@/hooks/useBook'
import { resolveTime, midpoint, formatTime, jumps, timelineChecks } from '@/lib/timeline'
import { StoryTimeEditor } from '@/components/SidePanel'
import { Page, Panel } from '@/components/AppShell'
import { Button, IconButton, inputClass } from '@/components/ui'
import { cn } from '@/lib/utils'

const ERA_COLORS = ['#141518', '#55585f', '#8d9098', '#3a3b40', '#6f7279', '#a5a7ad']

export default function Timeline() {
  const { bookId } = useParams()
  const bk = useBook(bookId)
  const navigate = useNavigate()
  const [order, setOrder] = useState('reading')
  const [open, setOpen] = useState(null)
  const ctx = { scenes: bk.scenes, eras: bk.eras, characters: bk.characters }

  const reading = useMemo(() => bk.flatChapters.filter((c) => !c.unused).flatMap((c) => c.scenes.filter((s) => !s.unused).map((s) => ({ s, c }))), [bk.flatChapters])
  const jumpMap = useMemo(() => jumps(reading.map((x) => x.s), ctx), [reading, bk.eras])
  const checks = useMemo(() => timelineChecks(reading.map((x) => x.s), ctx), [reading, bk.eras, bk.characters])
  const chrono = useMemo(() => {
    const dated = reading.map((x) => ({ ...x, r: resolveTime(x.s, ctx) })).filter((x) => x.r && !x.r.error)
    dated.sort((a, b) => midpoint(a.r) - midpoint(b.r) || (a.s.story_time?.rank || 0) - (b.s.story_time?.rank || 0))
    return dated
  }, [reading, bk.eras])
  const list = order === 'reading' ? reading : chrono
  const eraOf = (r) => r && bk.eras.find((e) => { const a = resolveTime({ story_time: { type: 'era', era_id: e.id } }, ctx); return a && r.start >= a.start && r.start <= a.end })

  // Story curve: reading order across, chronological rank down. A straight diagonal = linear story.
  const curve = useMemo(() => {
    const rank = new Map(chrono.map((x, i) => [x.s.id, i]))
    return reading.map((x, i) => ({ i, rank: rank.get(x.s.id), title: x.s.title || chapterLabel(x.c) })).filter((p) => p.rank != null)
  }, [reading, chrono])

  if (bk.loading || !bk.book) return <div className="h-full flex items-center justify-center text-muted">טוען…</div>

  const W = 640, H = 220
  const n = Math.max(1, reading.length - 1), m = Math.max(1, chrono.length - 1)
  return (
    <Page eyebrow={bk.book.title} title="ציר זמן" subtitle="מתי כל סצנה קרתה בסיפור, לעומת הסדר שבו הקורא פוגש אותה." testid="timeline"
      actions={
        <div className="flex gap-1 rounded-lg border border-line bg-raised p-0.5" role="radiogroup" aria-label="סדר">
          <button role="radio" aria-checked={order === 'reading'} className={cn('h-8 px-3 rounded-md text-sm', order === 'reading' ? 'bg-surface shadow-sm' : 'text-muted')} onClick={() => setOrder('reading')} data-testid="order-reading">סדר קריאה</button>
          <button role="radio" aria-checked={order === 'chrono'} className={cn('h-8 px-3 rounded-md text-sm', order === 'chrono' ? 'bg-surface shadow-sm' : 'text-muted')} onClick={() => setOrder('chrono')} data-testid="order-chrono">סדר כרונולוגי</button>
        </div>
      }>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <Panel title={order === 'chrono' ? 'לפי מתי זה קרה' : 'לפי סדר הקריאה'} description={`${list.length} סצנות`} bodyClass="p-0">
          {(checks.undated > 0 || checks.issues.length > 0) && (
            <div className="border-b border-line bg-raised px-5 py-3 text-sm flex flex-col gap-1">
              {checks.undated > 0 && <div className="text-muted">{checks.undated} סצנות עוד בלי תאריך. זה בסדר, הן פשוט לא מופיעות בסדר הכרונולוגי.</div>}
              {checks.issues.map((x, i) => <div key={i} className="text-warn">⚠ {x.text}</div>)}
            </div>
          )}
          {order === 'chrono' && chrono.length === 0 && <p className="text-muted p-5">עוד אין סצנות עם תאריך. פתחו סצנה ובחרו "מתי זה קרה".</p>}
          {list.map(({ s, c }) => {
            const r = resolveTime(s, ctx)
            const era = eraOf(r)
            const j = jumpMap[s.id]
            return (
              <div key={s.id} className="border-b border-line last:border-b-0" data-testid="timeline-row">
                <div className="flex items-center gap-2 px-5 min-h-[52px] cursor-pointer hover:bg-raised" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  {open === s.id ? <ChevronDown size={15} className="text-muted" /> : <ChevronLeft size={15} className="text-muted" />}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-black">{s.title || 'סצנה ללא שם'}</div>
                    <div className="text-xs text-muted truncate">{chapterLabel(c)}</div>
                  </div>
                  {order === 'reading' && j && <span className={cn('text-xs rounded-full px-2 py-0.5', j.dir === 'back' ? 'bg-accent-soft text-accent' : 'bg-warn/10 text-warn')} data-testid="jump-badge">{j.label}</span>}
                  {era && <span className="text-xs rounded-full px-2 py-0.5 text-white" style={{ background: era.color || ERA_COLORS[0] }}>{era.name}</span>}
                  <span className={cn('text-sm tabular-nums whitespace-nowrap', !r && 'text-muted')}>{formatTime(s, ctx)}</span>
                </div>
                {open === s.id && (
                  <div className="border-t border-line bg-raised px-5 py-4 flex flex-col gap-3">
                    <StoryTimeEditor bk={bk} scene={s} onChange={(story_time) => bk.update('scenes', s.id, { story_time }, { delay: 300 })} />
                    <div><Button size="sm" onClick={() => navigate(`/book/${bookId}?ch=${c.id}&sc=${s.id}`)}>פתח בעורך</Button></div>
                  </div>
                )}
              </div>
            )
          })}
        </Panel>
        <aside className="flex flex-col gap-6">
          <Panel title="תקופות"><EraEditor bk={bk} /></Panel>
          {curve.length > 2 && (
            <Panel title="עקומת הסיפור" description="משמאל לימין: סדר הקריאה. מלמעלה למטה: מתי זה קרה. קפיצה למעלה היא פלאשבק.">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg border border-line bg-raised" role="img" aria-label="עקומת הסיפור">
                <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={curve.map((p) => `${W - 20 - (p.i / n) * (W - 40)},${20 + (p.rank / m) * (H - 40)}`).join(' ')} />
                {curve.map((p) => <circle key={p.i} cx={W - 20 - (p.i / n) * (W - 40)} cy={20 + (p.rank / m) * (H - 40)} r="4" fill="var(--accent)"><title>{p.title}</title></circle>)}
              </svg>
            </Panel>
          )}
        </aside>
      </div>
    </Page>
  )
}

function EraEditor({ bk }) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const add = async () => {
    if (!name.trim()) return
    await bk.createRecord('eras', { name: name.trim(), start: start.trim(), end: end.trim(), color: ERA_COLORS[bk.eras.length % ERA_COLORS.length] })
    setName(''); setStart(''); setEnd('')
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted">תקופות בחיים או בסיפור, למשל: "תיכון 2008–2011", "הצבא", "השנים בתל אביב".</p>
      {bk.eras.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-sm rounded-lg border border-line px-2 py-1.5">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: e.color }} />
          <span className="flex-1 truncate">{e.name}</span>
          <span className="text-xs text-muted tabular-nums">{e.start}{e.end ? `–${e.end}` : ''}</span>
          <IconButton label="מחק תקופה" onClick={() => bk.removeRecord('eras', e.id)}><Trash2 size={14} /></IconButton>
        </div>
      ))}
      <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="שם התקופה" aria-label="שם התקופה" />
      <div className="flex gap-2">
        <input className={cn(inputClass, 'flex-1 min-w-0')} value={start} onChange={(e) => setStart(e.target.value)} placeholder="מ־ (2008)" aria-label="מ" />
        <input className={cn(inputClass, 'flex-1 min-w-0')} value={end} onChange={(e) => setEnd(e.target.value)} placeholder="עד (2011)" aria-label="עד" />
        <IconButton label="הוסף תקופה" onClick={add}><Plus size={18} /></IconButton>
      </div>
    </div>
  )
}
