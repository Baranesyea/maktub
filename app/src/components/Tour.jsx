import { useEffect, useLayoutEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSettings } from '@/lib/settings'
import { isConnected } from '@/lib/drive'
import { Button } from '@/components/ui'

export const startTour = () => window.dispatchEvent(new Event('maktub-tour-start'))

const STEPS = [
  { sel: '[data-tour="tree"]', title: 'עץ הספר', text: 'כאן כל הפרקים והסצנות. גוררים כדי לשנות סדר: פרק זז עם כל הסצנות שלו. באייפד: לחיצה ארוכה ואז גרירה. הקליקו פעמיים כדי לשנות שם.' },
  { sel: '[data-tour="editor"]', title: 'כאן כותבים', text: 'פרק מוצג כעמוד אחד רציף של הסצנות שלו. אין כפתור שמירה: כל מילה נשמרת לבד, קודם במכשיר ואחר כך בשרת.' },
  { sel: '[data-tour="save"]', title: 'מצב השמירה', text: 'וי ירוק: הכול שמור בשרת. וי אפור: שומר, או שאין אינטרנט והשינויים שמורים במחשב עד שהחיבור יחזור. העבירו את העכבר לפרטים.' },
  { sel: '[data-tour="side"]', title: 'חלונית הצד', text: 'פתקים, פרטי הסצנה (סטטוס, תקציר, מתי זה קרה), ודמויות ומקומות. תיבת הרעיונות נפתחת מהסרגל הימני.' },
  { sel: '[data-tour="addnote"]', title: 'פתק על הטקסט', text: 'מסמנים מילה, משפט או פסקה ולוחצים עליהם בכפתור הימני של העכבר. באייפד: הכפתור הזה. הטקסט נשאר מסומן, והפתק מופיע בשוליים ובחלונית.' },
  { sel: '[data-tour="focus"]', title: 'ריכוז וקריאה', text: 'מצב ריכוז מעלים הכול חוץ מהטקסט. ליד: מצב קריאה, כמו ספר. פלוס ומינוס מגדילים רק את הטקסט.' },
  { sel: '[data-testid="today-pill"]', title: 'היעד של היום', text: 'כמה כתבת היום מתוך היעד. לחיצה מובילה ללוח הבית: רצף, הסצנה הבאה, והערה לעצמך למחר.' },
  { sel: '[data-tour="more"]', title: 'ייבוא, ייצוא ועוד', text: 'כאן: ייבוא ספר מוורד, ייצוא לוורד ולפי די אף, תכנון זמנים, ציר זמן, לוח כרטיסים וסל מחזור.' },
  { sel: '[data-tour="drive"]', title: 'גיבוי לגוגל דרייב', text: 'מומלץ: עותק מסודר של כל פרק בדרייב שלך, שמתעדכן לבד. זה לוקח שתי לחיצות.', drive: true },
]

function visible(el) {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight
}

export default function Tour() {
  const { settings, update, loaded } = useSettings()
  const location = useLocation()
  const navigate = useNavigate()
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)

  const steps = STEPS
  useEffect(() => {
    const fn = () => { setI(0); setActive(true) }
    window.addEventListener('maktub-tour-start', fn)
    return () => window.removeEventListener('maktub-tour-start', fn)
  }, [])
  // First time in a book: start the tour once.
  useEffect(() => {
    if (!loaded || settings.tour_done || active || !/^\/book\/[^/]+$/.test(location.pathname)) return
    const t = setTimeout(() => { setI(0); setActive(true) }, 1200)
    return () => clearTimeout(t)
  }, [loaded, settings.tour_done, location.pathname])

  const finish = () => { setActive(false); update({ tour_done: true }) }

  // Skip steps whose target is not on screen (for example the tree drawer on a phone).
  // At the very start the book may still be loading from the server: wait for the screen
  // instead of treating "nothing visible yet" as the end of the tour.
  const [waitTick, setWaitTick] = useState(0)
  useLayoutEffect(() => {
    if (!active) return
    if (i === 0 && !document.querySelector('[data-testid="workspace"]')) {
      if (waitTick < 40) { const t = setTimeout(() => setWaitTick((x) => x + 1), 250); return () => clearTimeout(t) }
      setActive(false); return
    }
    let k = i
    while (k < steps.length && !visible(document.querySelector(steps[k].sel))) k++
    if (k >= steps.length) { if (i === 0) { setActive(false); return } finish(); return }
    if (k !== i) { setI(k); return }
    const measure = () => {
      const r = document.querySelector(steps[i].sel)?.getBoundingClientRect()
      if (r) setRect({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active, i, location.pathname, waitTick])

  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowLeft') next()
      if (e.key === 'ArrowRight') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!active || !rect) return null
  const step = steps[i]
  const next = () => (i + 1 >= steps.length ? finish() : setI(i + 1))
  const tall = rect.height > window.innerHeight * 0.4
  const below = rect.top + rect.height + 200 < window.innerHeight
  let bubbleTop = below ? rect.top + rect.height + 10 : Math.max(10, rect.top - 190)
  let bubbleLeft = Math.min(Math.max(12, rect.left + rect.width / 2 - 160), window.innerWidth - 332)
  if (tall) {
    // Put the bubble beside a tall area (the tree, the side panel, the editor) instead of over it.
    bubbleTop = Math.min(rect.top + 60, window.innerHeight - 220)
    const spaceLeft = rect.left - 12, spaceRight = window.innerWidth - (rect.left + rect.width) - 12
    if (spaceLeft >= 330) bubbleLeft = rect.left - 330
    else if (spaceRight >= 330) bubbleLeft = rect.left + rect.width + 10
    else bubbleLeft = Math.min(Math.max(12, rect.left + rect.width / 2 - 160), window.innerWidth - 332)
  }
  const last = i === steps.length - 1

  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="סיור מודרך" data-testid="tour">
      <div className="absolute inset-0" onClick={finish} />
      <div className="tour-spot" style={rect} />
      <div className="absolute w-[320px] max-w-[calc(100vw-24px)] rounded-2xl bg-surface border border-line shadow-[var(--shadow)] p-4 flex flex-col gap-2" style={{ top: bubbleTop, left: bubbleLeft }} dir="rtl">
        <div className="text-xs text-muted">{i + 1} מתוך {steps.length}</div>
        <div className="font-semibold">{step.title}</div>
        <div className="text-sm leading-6">{step.text}</div>
        {step.drive && !isConnected() && (
          <Button variant="primary" onClick={() => { finish(); navigate('/settings#drive') }} data-testid="tour-drive">חבר את גוגל דרייב</Button>
        )}
        <div className="flex items-center gap-2 mt-1">
          <Button size="sm" variant="ghost" onClick={finish} data-testid="tour-skip">דלג</Button>
          <div className="flex-1" />
          {i > 0 && <Button size="sm" onClick={() => setI(i - 1)}>הקודם</Button>}
          <Button size="sm" variant="primary" onClick={next} data-testid="tour-next">{last ? 'סיום' : 'הבא'}</Button>
        </div>
      </div>
    </div>
  )
}
