import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Bold, Italic, Highlighter, Heading2, Quote, Minus as Rule, Pin, Scissors, Timer, Cloud, CloudOff, Check, Loader2, AlertTriangle, Undo2, Redo2 } from 'lucide-react'
import { subscribeSave } from '@/lib/outbox'
import { onTypedWords } from '@/lib/stats'
import { IconButton, Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/text'

/** "נשמר" / "שומר…" / "אין חיבור, השינויים שמורים במחשב". Always visible. */
export function SaveStatus({ compact }) {
  const [s, setS] = useState({ status: 'saved' })
  useEffect(() => subscribeSave(setS), [])
  const map = {
    saved: { icon: Check, text: 'נשמר', cls: 'text-ok' },
    saving: { icon: Loader2, text: 'שומר…', cls: 'text-muted', spin: true },
    offline: { icon: CloudOff, text: 'אין חיבור, השינויים שמורים במחשב', short: 'שמור במחשב', cls: 'text-warn' },
    error: { icon: AlertTriangle, text: 'שגיאת שמירה, מנסה שוב. השינויים שמורים במחשב', short: 'מנסה שוב', cls: 'text-warn' },
  }[s.status] || {}
  const Icon = map.icon || Check
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm whitespace-nowrap', map.cls)} role="status" aria-live="polite" data-testid="save-status" data-state={s.status} data-tour="save">
      <Icon size={14} className={map.spin ? 'animate-spin' : ''} />
      <span>{compact ? map.short || map.text : map.text}</span>
    </span>
  )
}

/** Plus and minus change only the book text, never the whole interface. */
export function TextSizeControl({ value, onChange, min = 13, max = 32, label = 'גודל הטקסט' }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-surface" role="group" aria-label={label} data-tour="textsize">
      <button className="hit px-2 text-lg leading-none text-muted hover:text-fg" onClick={() => onChange(Math.max(min, value - 1))} aria-label="הקטן טקסט" data-testid="size-down">−</button>
      <span className="text-xs tabular-nums w-7 text-center" data-testid="size-value">{value}</span>
      <button className="hit px-2 text-lg leading-none text-muted hover:text-fg" onClick={() => onChange(Math.min(max, value + 1))} aria-label="הגדל טקסט" data-testid="size-up">+</button>
    </div>
  )
}

export function FormatBar({ editor, onAddNote, onSplit, className }) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!editor) return
    const fn = () => force((x) => x + 1)
    editor.on('selectionUpdate', fn); editor.on('transaction', fn)
    return () => { editor.off('selectionUpdate', fn); editor.off('transaction', fn) }
  }, [editor])
  const run = (fn) => () => { if (editor) fn(editor.chain().focus()).run() }
  const on = (name, attrs) => !!editor?.isActive(name, attrs)
  return (
    <div className={cn('inline-flex items-center gap-0.5', className)} role="toolbar" aria-label="עיצוב טקסט">
      <IconButton label="בטל (Ctrl+Z)" onClick={run((c) => c.undo())} disabled={!editor}><Undo2 size={16} /></IconButton>
      <IconButton label="בצע שוב" onClick={run((c) => c.redo())} disabled={!editor}><Redo2 size={16} /></IconButton>
      <IconButton label="מודגש" active={on('bold')} onClick={run((c) => c.toggleBold())} disabled={!editor}><Bold size={16} /></IconButton>
      <IconButton label="נטוי" active={on('italic')} onClick={run((c) => c.toggleItalic())} disabled={!editor}><Italic size={16} /></IconButton>
      <IconButton label="הדגשת רקע (מרקר)" active={on('highlight')} onClick={run((c) => c.toggleHighlight())} disabled={!editor}><Highlighter size={16} /></IconButton>
      <IconButton label="כותרת" active={on('heading', { level: 2 })} onClick={run((c) => c.toggleHeading({ level: 2 }))} disabled={!editor}><Heading2 size={16} /></IconButton>
      <IconButton label="ציטוט" active={on('blockquote')} onClick={run((c) => c.toggleBlockquote())} disabled={!editor}><Quote size={16} /></IconButton>
      <IconButton label="מפריד סצנה" onClick={run((c) => c.setHorizontalRule())} disabled={!editor}><Rule size={16} /></IconButton>
      <IconButton label="הדבק פתק (Ctrl+Shift+M)" onClick={onAddNote} disabled={!editor} data-testid="add-note" data-tour="addnote"><Pin size={16} /></IconButton>
      <IconButton label="פצל כאן לשתי סצנות" onClick={onSplit} disabled={!editor}><Scissors size={16} /></IconButton>
    </div>
  )
}

/** A writing sprint: write for a fixed time and see how many words came out. */
export function SprintButton() {
  const [running, setRunning] = useState(null) // { end, words }
  const [left, setLeft] = useState(0)
  const [result, setResult] = useState(null)
  const wordsRef = useRef(0)
  useEffect(() => {
    if (!running) return
    const off = onTypedWords((n) => { wordsRef.current += n })
    const t = setInterval(() => {
      const ms = running.end - Date.now()
      setLeft(Math.max(0, ms))
      if (ms <= 0) { setResult(wordsRef.current); setRunning(null) }
    }, 500)
    return () => { off(); clearInterval(t) }
  }, [running])
  const start = (min) => { wordsRef.current = 0; setResult(null); setRunning({ end: Date.now() + min * 60000 }); setLeft(min * 60000) }
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000)
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className={cn('hit inline-flex items-center gap-1 rounded-lg px-2 text-sm', running ? 'text-accent bg-accent-soft' : 'text-muted hover:text-fg hover:bg-sunk')} aria-label="ספרינט כתיבה">
          <Timer size={16} />{running && <span className="tabular-nums">{mm}:{String(ss).padStart(2, '0')}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content dir="rtl" sideOffset={6} className="z-50 w-64 rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow)] text-sm">
          {running ? (
            <div className="flex flex-col gap-2">
              <div>נשארו <b className="tabular-nums">{mm}:{String(ss).padStart(2, '0')}</b> דקות.</div>
              <div>נכתבו עד עכשיו: <b className="tabular-nums">{formatNumber(wordsRef.current)}</b> מילים.</div>
              <Button size="sm" onClick={() => { setResult(wordsRef.current); setRunning(null) }}>עצור</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {result != null && <div className="text-ok">כתבת {formatNumber(result)} מילים בספרינט.</div>}
              <div className="text-muted">ספרינט: כותבים בלי לעצור עד שהזמן נגמר.</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[10, 15, 25, 45].map((m) => <Button key={m} size="sm" onClick={() => start(m)}>{m}′</Button>)}
              </div>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function DriveBadge({ state, onClick }) {
  if (!state) return null
  const map = {
    off: { icon: CloudOff, text: 'לא מגובה בדרייב', cls: 'text-muted' },
    synced: { icon: Cloud, text: state.at ? `מסונכרן ${state.at}` : 'מסונכרן', cls: 'text-ok' },
    syncing: { icon: Loader2, text: `מסנכרן${state.count ? ` ${state.count} פרקים` : ''}`, cls: 'text-muted', spin: true },
    pending: { icon: CloudOff, text: `אין חיבור, ${state.count || ''} שינויים ממתינים`, cls: 'text-warn' },
    attention: { icon: AlertTriangle, text: 'הגיבוי דורש תשומת לב', cls: 'text-warn' },
  }[state.status] || {}
  const Icon = map.icon || Cloud
  return (
    <button onClick={onClick} className={cn('hit inline-flex items-center gap-1 rounded-lg px-2 text-sm whitespace-nowrap hover:bg-sunk', map.cls)} data-testid="drive-status" data-tour="drive">
      <Icon size={15} className={map.spin ? 'animate-spin' : ''} /><span className="hidden lg:inline">{map.text}</span>
    </button>
  )
}
