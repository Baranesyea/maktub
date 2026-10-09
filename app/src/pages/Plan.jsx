import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useBook, chapterLabel } from '@/hooks/useBook'
import { usePlanToday } from '@/hooks/usePlanToday'
import { useSettings } from '@/lib/settings'
import { WEEKDAYS, DEFAULT_WEEKLY, DEFAULT_WPH, chapterDueDates, dateKey, parseKey } from '@/lib/planning'
import { Page, Panel } from '@/components/AppShell'
import { Button, inputClass } from '@/components/ui'
import { formatNumber } from '@/lib/text'
import { cn } from '@/lib/utils'

const fmtDate = (k) => k ? parseKey(k).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

export default function Plan() {
  const { bookId } = useParams()
  const bk = useBook(bookId)
  const r = usePlanToday(bk)
  const { settings, update: updateSettings } = useSettings()
  const plan = bk.book?.plan || {}
  const [dayOff, setDayOff] = useState('')

  const set = (patch) => bk.update('book', bookId, { plan: { weekly_minutes: DEFAULT_WEEKLY, pace: 'steady', days_off: [], ...plan, ...patch, locked: null } }, { delay: 400 })
  const weekly = plan.weekly_minutes || DEFAULT_WEEKLY
  const due = useMemo(() => chapterDueDates(bk.flatChapters.filter((c) => !c.unused).map((c) => ({ id: c.id, words: c.words, due_date: plan.chapter_due?.[c.id] || null, estimate: plan.target_words ? plan.target_words / Math.max(1, bk.flatChapters.length) : undefined })), plan, { wph: r.wph }), [bk.flatChapters, plan, r.wph])

  if (bk.loading || !bk.book) return <div className="h-full flex items-center justify-center text-muted">טוען…</div>

  const weeklyMinutes = weekly.reduce((a, b) => a + b, 0)
  return (
    <Page eyebrow={bk.book.title} title="תכנון זמנים" subtitle="תאריך סיום, הזמן שיש לך בכל שבוע, ומכתוב מחשב אם זה אפשרי ומה היעד היומי." testid="plan">
      <div className="grid gap-6 lg:grid-cols-2 items-start">
      <div className="flex flex-col gap-6">
        <Panel title="המטרה" bodyClass="p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">תאריך סיום</span>
            <input type="date" className={inputClass} value={plan.deadline || ''} min={dateKey(new Date())} onChange={(e) => set({ deadline: e.target.value })} data-testid="plan-deadline" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">כמה מילים בספר, בערך (כרגע: {formatNumber(r.written)})</span>
            <input type="number" min={0} step={1000} className={inputClass} value={plan.target_words || ''} onChange={(e) => set({ target_words: +e.target.value || 0 })} placeholder="למשל 80000" data-testid="plan-target" />
          </label>
        </Panel>
        <Panel title="כמה זמן יש לך" description="דקות כתיבה בכל יום בשבוע." bodyClass="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="flex flex-col gap-1">
                <span className="text-muted">{d}</span>
                <select className="h-10 rounded-lg border border-line bg-bg text-sm px-0.5" value={weekly[i]} onChange={(e) => { const w = [...weekly]; w[i] = +e.target.value; set({ weekly_minutes: w }) }} aria-label={`דקות ביום ${d}`}>
                  {[0, 15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m === 0 ? 'חופש' : m < 60 ? `${m}ד׳` : `${m / 60}ש׳`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="text-sm text-muted">סך הכול {Math.round(weeklyMinutes / 6) / 10} שעות בשבוע.</div>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">ימים חריגים: חופשה, חג, שבוע עמוס</span>
            <div className="flex gap-2">
              <input type="date" className={cn(inputClass, 'flex-1')} value={dayOff} onChange={(e) => setDayOff(e.target.value)} aria-label="יום חופש" />
              <Button onClick={() => { if (dayOff && !(plan.days_off || []).includes(dayOff)) set({ days_off: [...(plan.days_off || []), dayOff].sort() }); setDayOff('') }}>הוסף</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(plan.days_off || []).map((d) => (
                <span key={d} className="h-7 px-2.5 rounded-full bg-sunk inline-flex items-center gap-1 text-xs">{fmtDate(d)}<button aria-label="הסר" onClick={() => set({ days_off: plan.days_off.filter((x) => x !== d) })}><X size={12} /></button></span>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">קצב</span>
            <select className={inputClass} value={plan.pace || 'steady'} onChange={(e) => set({ pace: e.target.value })}>
              <option value="steady">קבוע: לפי הזמן שיש בכל יום</option>
              <option value="ramp">עולה בהדרגה: מתחילים בקטן ובונים הרגל</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">כמה מילים אתה כותב בשעה</span>
            <input type="number" className={inputClass} value={settings.words_per_hour || ''} placeholder={r.measured ? `נמדד: ${r.measured}` : `ברירת מחדל: ${DEFAULT_WPH}`} onChange={(e) => updateSettings({ words_per_hour: +e.target.value || null })} />
            <span className="text-xs text-muted">{r.measured ? `לפי הכתיבה שלך בשבועיים האחרונים: כ־${r.measured} מילים בשעה. מכתוב משתמש במספר הזה אם לא הזנת אחר.` : 'אחרי כמה ימי כתיבה מכתוב ימדוד את הקצב האמיתי שלך ויעדכן לבד.'}</span>
          </label>
        </Panel>
      </div>

      <div className="flex flex-col gap-6">
        <Panel title="התשובה" bodyClass="p-5 flex flex-col gap-4">
          {!r.hasPlan ? (
            <p className="text-muted">קבעו תאריך סיום והיקף, ומכתוב יחשב אם זה אפשרי ומה היעד היומי.</p>
          ) : (
            <>
              <div className={cn('rounded-xl border p-4', r.feasible ? 'border-ok/40 bg-ok/5' : 'border-warn/40 bg-warn/5')} data-testid="plan-verdict">
                <div className="flex items-center gap-2 font-black mb-1">
                  {r.feasible ? <CheckCircle2 size={18} className="text-ok" /> : <AlertTriangle size={18} className="text-warn" />}
                  {r.feasible ? 'זה אפשרי.' : 'בזמן שהגדרת זה לא ייגמר בתאריך.'}
                </div>
                <div className="text-sm leading-6">
                  נשארו {formatNumber(r.remaining)} מילים. בקצב של כ־{formatNumber(r.wph)} מילים בשעה, הזמן שהגדרת עד {fmtDate(plan.deadline)} מספיק לכ־{formatNumber(r.capacity)} מילים.
                </div>
                {!r.feasible && (
                  <div className="mt-3 flex flex-col gap-2 text-sm">
                    <div className="font-medium">שלוש אפשרויות:</div>
                    <button className="text-start rounded-lg border border-line bg-surface p-2.5 hover:border-accent" onClick={() => set({ weekly_minutes: weekly.map((m) => (m > 0 ? m + Math.ceil(r.extraMinutesPerDay / 15) * 15 : 0)) })}>
                      להוסיף זמן: עוד כ־{r.extraMinutesPerDay} דקות בכל יום כתיבה.
                    </button>
                    {r.realisticDate && (
                      <button className="text-start rounded-lg border border-line bg-surface p-2.5 hover:border-accent" onClick={() => set({ deadline: r.realisticDate })}>
                        לדחות את התאריך: התאריך הריאלי הוא {fmtDate(r.realisticDate)}.
                      </button>
                    )}
                    <button className="text-start rounded-lg border border-line bg-surface p-2.5 hover:border-accent" onClick={() => set({ target_words: r.written + r.scopeWords })}>
                      להקטין את השלב: עד התאריך הזה אפשר להגיע לכ־{formatNumber(r.written + r.scopeWords)} מילים.
                    </button>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-line bg-raised p-4">
                <div className="text-sm text-muted">היעד של היום</div>
                <div className="text-3xl font-black tabular-nums">{r.todayMinutes ? formatNumber(r.todayTarget) : 'יום חופש'}</div>
                {r.todayMinutes > 0 && <div className="text-sm text-muted">בערך {r.todayMinutes} דקות. היעד ננעל בבוקר ומחושב מחדש מחר, כך שפספוס או עודף מתפזרים על הימים שנשארו.</div>}
              </div>
            </>
          )}
        </Panel>
        {r.hasPlan && (
              <Panel title="הפרקים על לוח השנה" description="פרק עם דדליין קבוע נשאר במקום, והשאר מסתדרים סביבו." bodyClass="p-2">
                <div className="flex flex-col gap-1 text-sm">
                  {bk.flatChapters.filter((c) => !c.unused).map((c) => {
                    const d = due[c.id]
                    return (
                      <div key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sunk">
                        <span className="flex-1 min-w-0 truncate">{chapterLabel(c)}</span>
                        {d?.late && <span className="text-xs text-warn">לא יספיק</span>}
                        <input type="date" className="h-8 rounded-md border border-line bg-bg px-1 text-xs" value={plan.chapter_due?.[c.id] || ''} onChange={(e) => set({ chapter_due: { ...(plan.chapter_due || {}), [c.id]: e.target.value || undefined } })} title="דדליין קבוע לפרק (לא חובה)" aria-label={`דדליין ל${chapterLabel(c)}`} />
                        <span className={cn('text-xs tabular-nums w-24 text-start', d?.pinned ? 'text-accent' : 'text-muted')}>{d ? fmtDate(d.due) : ''}</span>
                      </div>
                    )
                  })}
                </div>
              </Panel>
        )}
      </div>
      </div>
    </Page>
  )
}
