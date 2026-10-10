// The book's compass: a few lines on what the book is for, so the writing has a direction.
// Edited on the planning page or in a dialog; shown on the home page and beside the text.
import { useState } from 'react'
import { Compass as CompassIcon, Pencil } from 'lucide-react'
import { Button, Dialog, inputClass } from '@/components/ui'
import { cn } from '@/lib/utils'

export const COMPASS = [
  { key: 'about', label: 'במשפט אחד, על מה הספר?', hint: 'למשל: נער מהפריפריה שמגלה שאבא שלו היה מרגל.' },
  { key: 'feel', label: 'מה הקורא צריך להרגיש או להבין בסוף?', hint: 'למשל: שאפשר לסלוח גם למי שלא ביקש סליחה.' },
  { key: 'audience', label: 'למי הספר?', hint: 'למשל: נוער, מבוגרים, המשפחה שלי.' },
  { key: 'why', label: 'למה אני כותב אותו?', hint: 'התשובה שתחזיר אותך לכתוב ביום שאין חשק.' },
]

export const compassOf = (book) => book?.compass || {}
export const hasCompass = (book) => COMPASS.some(({ key }) => (compassOf(book)[key] || '').trim())

/** The four questions, saved as you type. */
export function CompassFields({ bk, autoFocus = false }) {
  const [value, setValue] = useState(() => compassOf(bk.book))
  const set = (key, text) => {
    const next = { ...value, [key]: text }
    setValue(next)
    bk.update('book', bk.book.id, { compass: next }, { delay: 600 })
  }
  return (
    <div className="flex flex-col gap-4" data-testid="compass-fields">
      {COMPASS.map(({ key, label, hint }, i) => (
        <label key={key} className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">{label}</span>
          <textarea
            className={cn(inputClass, 'h-auto py-2 leading-6 resize-none')}
            rows={2}
            value={value[key] || ''}
            onChange={(e) => set(key, e.target.value)}
            placeholder={hint}
            autoFocus={autoFocus && i === 0}
            style={{ fontSize: 16 }}
            data-testid={`compass-${key}`}
          />
        </label>
      ))}
    </div>
  )
}

export function CompassDialog({ bk, open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="המצפן של הספר">
      <p className="text-sm text-muted -mt-1 mb-4">כמה שורות על מה הספר הזה רוצה להיות. לא חובה לענות על הכול, ואפשר לשנות בכל רגע.</p>
      {open && <CompassFields bk={bk} autoFocus />}
      <div className="mt-5"><Button variant="primary" onClick={() => onOpenChange(false)} data-testid="compass-done">סיום</Button></div>
    </Dialog>
  )
}

/** One quiet line beside the text: the sentence the book is about. */
export function CompassLine({ bk }) {
  const [open, setOpen] = useState(false)
  if (!bk.book) return null
  const c = compassOf(bk.book)
  const about = (c.about || '').trim()
  return (
    <>
      <button
        className="w-full shrink-0 flex items-start gap-2 px-3 py-2 border-b border-line text-start text-[13px] leading-5 hover:bg-sunk"
        onClick={() => setOpen(true)}
        title={hasCompass(bk.book) ? 'המצפן של הספר' : 'להגדיר מצפן לספר'}
        data-testid="compass-line"
      >
        <CompassIcon size={14} className="mt-[3px] shrink-0 text-muted" />
        {about ? <span className="line-clamp-2">{about}</span> : <span className="text-muted">על מה הספר הזה? להגדיר מצפן</span>}
      </button>
      <CompassDialog bk={bk} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** On the dark "continue writing" card of the home page. */
export function CompassOnHome({ bk }) {
  const [open, setOpen] = useState(false)
  const c = compassOf(bk.book)
  const about = (c.about || '').trim()
  const feel = (c.feel || '').trim()
  return (
    <>
      {about || feel ? (
        <div className="flex items-start gap-2.5" data-testid="compass-home">
          <CompassIcon size={16} className="mt-1 shrink-0 opacity-60" />
          <div className="flex-1 min-w-0">
            {about && <div className="text-[16px] leading-7">{about}</div>}
            {feel && <div className="text-[13px] opacity-70 leading-6">בסוף הקורא צריך: {feel}</div>}
          </div>
          <button className="shrink-0 w-8 h-8 rounded-lg inline-flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-bg/10" onClick={() => setOpen(true)} aria-label="עריכת המצפן" data-testid="compass-edit"><Pencil size={14} /></button>
        </div>
      ) : (
        <button className="self-start inline-flex items-center gap-1.5 text-[14px] opacity-75 hover:opacity-100 underline underline-offset-4 decoration-bg/40" onClick={() => setOpen(true)} data-testid="compass-set">
          <CompassIcon size={15} />על מה הספר הזה? להגדיר מצפן
        </button>
      )}
      <CompassDialog bk={bk} open={open} onOpenChange={setOpen} />
    </>
  )
}
