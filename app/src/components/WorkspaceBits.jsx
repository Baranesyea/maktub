import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Bold, Italic, Highlighter, Heading2, Quote, Minus as Rule, Pin, Scissors, Timer, Cloud, CloudOff, Check, Loader2, AlertTriangle, Undo2, Redo2, Trash2 as Trash } from 'lucide-react'
import { subscribeSave } from '@/lib/outbox'
import { onTypedWords } from '@/lib/stats'
import { IconButton, Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/text'

/** A single tick: green when everything is on the server, grey while saving or waiting. Details on hover. */
export function SaveStatus() {
  const [s, setS] = useState({ status: 'saved' })
  useEffect(() => subscribeSave(setS), [])
  const text = {
    saved: 'הכול שמור בשרת',
    saving: 'שומר…',
    offline: 'אין חיבור לאינטרנט. השינויים שמורים במחשב ויישלחו כשהחיבור יחזור.',
    error: 'השמירה לשרת נכשלה ומכתוב מנסה שוב. השינויים שמורים במחשב.',
  }[s.status] || 'הכול שמור בשרת'
  const ok = s.status === 'saved'
  return (
    <span className={cn('inline-flex items-center justify-center w-8 h-8 rounded-md', ok ? 'text-[var(--saved)]' : 'text-faint', s.status === 'saving' && 'animate-pulse')}
      role="status" aria-label={text} title={text} data-testid="save-status" data-state={s.status} data-tour="save">
      <Check size={17} strokeWidth={2.4} />
    </span>
  )
}

/** Plus and minus change only the book text, never the whole interface. */
export function TextSizeControl({ value, onChange, min = 13, max = 32, label = 'גודל הטקסט', bare }) {
  return (
    <div className={cn('inline-flex items-center rounded-lg', !bare && 'border border-line bg-surface')} role="group" aria-label={label} data-tour="textsize">
      <button className="hit px-2 text-lg leading-none text-muted hover:text-fg" onClick={() => onChange(Math.max(min, value - 1))} aria-label="הקטן טקסט" data-testid="size-down">−</button>
      <span className="text-xs tabular-nums w-7 text-center" data-testid="size-value">{value}</span>
      <button className="hit px-2 text-lg leading-none text-muted hover:text-fg" onClick={() => onChange(Math.min(max, value + 1))} aria-label="הגדל טקסט" data-testid="size-up">+</button>
    </div>
  )
}

export function FormatBar({ editor, onAddNote, onSplit, className, compact, bare }) {
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
    <div className={cn('inline-flex items-center', !bare && 'rounded-lg border border-line bg-raised p-0.5', className)} role="toolbar" aria-label="עיצוב טקסט">
      <IconButton label="בטל (Ctrl+Z)" onClick={run((c) => c.undo())} disabled={!editor}><Undo2 size={16} /></IconButton>
      <IconButton label="בצע שוב" onClick={run((c) => c.redo())} disabled={!editor}><Redo2 size={16} /></IconButton>
      <Sep />
      <IconButton label="מודגש" active={on('bold')} onClick={run((c) => c.toggleBold())} disabled={!editor}><Bold size={16} /></IconButton>
      <IconButton label="נטוי" active={on('italic')} onClick={run((c) => c.toggleItalic())} disabled={!editor}><Italic size={16} /></IconButton>
      <IconButton label="הדגשת רקע (מרקר)" active={on('highlight')} onClick={run((c) => c.toggleHighlight())} disabled={!editor}><Highlighter size={16} /></IconButton>
      {!compact && <Sep />}
      {!compact && <IconButton label="כותרת" active={on('heading', { level: 2 })} onClick={run((c) => c.toggleHeading({ level: 2 }))} disabled={!editor}><Heading2 size={16} /></IconButton>}
      {!compact && <IconButton label="ציטוט" active={on('blockquote')} onClick={run((c) => c.toggleBlockquote())} disabled={!editor}><Quote size={16} /></IconButton>}
      {!compact && <IconButton label="מפריד סצנה" onClick={run((c) => c.setHorizontalRule())} disabled={!editor}><Rule size={16} /></IconButton>}
      <Sep />
      <IconButton label="הדבק פתק (Ctrl+Shift+M)" onClick={onAddNote} disabled={!editor} data-testid="add-note" data-tour="addnote"><Pin size={16} /></IconButton>
      {!compact && <IconButton label="פצל כאן לשתי סצנות" onClick={onSplit} disabled={!editor}><Scissors size={16} /></IconButton>}
    </div>
  )
}

const Sep = () => <span className="w-px h-5 bg-line mx-0.5" aria-hidden />

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
        <Popover.Content dir="rtl" sideOffset={6} collisionPadding={8} className="z-50 w-64 rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow)] text-sm">
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

/** The menu that opens on a right click over selected text or over a note in the text. */
export function TextMenu({ menu, onClose, onAddNote, onHighlight, onOpenNote, onNoteDone, onNoteDelete, noteTypes }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!menu) return
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    const key = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', key)
    window.addEventListener('wheel', onClose, { passive: true })
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('mousedown', close, true); window.removeEventListener('keydown', key)
      window.removeEventListener('wheel', onClose); window.removeEventListener('resize', onClose)
    }
  }, [menu, onClose])
  useEffect(() => { ref.current?.querySelector('button')?.focus() }, [menu])
  // Place it at the click, then pull it up by its real height if it would run past the bottom.
  const [h, setH] = useState(0)
  useLayoutEffect(() => { if (menu && ref.current) setH(ref.current.offsetHeight) }, [menu])
  if (!menu) return null
  const W = 230
  const left = Math.min(Math.max(8, menu.x - W), window.innerWidth - W - 8)
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - (h || 320) - 8))
  const item = 'w-full flex items-center gap-2.5 rounded-md px-2.5 min-h-[36px] text-start hover:bg-sunk focus:bg-sunk outline-none focus-visible:outline-none'
  return (
    <div ref={ref} role="menu" dir="rtl" className="fixed z-[70] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow)] text-[14px] overflow-y-auto" style={{ left, top, width: W, maxHeight: 'calc(100vh - 16px)' }} data-testid="text-menu"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const items = [...ref.current.querySelectorAll('button')]
        const i = items.indexOf(document.activeElement)
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      }}>
      {menu.noteId && (
        <>
          <button role="menuitem" className={item} onClick={() => { onOpenNote(menu.noteId); onClose() }} data-testid="menu-open-note"><Pin size={15} />פתח את הפתק</button>
          <button role="menuitem" className={item} onClick={() => { onNoteDone(menu.noteId); onClose() }}><Check size={15} />סמן כבוצע</button>
          <button role="menuitem" className={item} onClick={() => { onNoteDelete(menu.noteId); onClose() }}><Trash size={15} />מחק את הפתק</button>
          {menu.hasSelection && <div className="h-px bg-line my-1" />}
        </>
      )}
      {menu.hasSelection && (
        <>
          <div className="px-2.5 pt-1 pb-1.5 text-[12px] text-muted">פתק על הטקסט המסומן</div>
          {Object.entries(noteTypes).map(([k, t]) => (
            <button key={k} role="menuitem" className={item} onClick={() => { onAddNote(k); onClose() }} data-testid={`menu-note-${k}`}>
              <span className="w-3 h-3 rounded-sm border border-line-strong" style={{ background: t.color }} aria-hidden />{t.label}
            </button>
          ))}
          <div className="h-px bg-line my-1" />
          <button role="menuitem" className={item} onClick={() => { onHighlight(); onClose() }}><Highlighter size={15} />מרקר</button>
        </>
      )}
    </div>
  )
}
