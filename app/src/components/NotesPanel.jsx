import { useMemo, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { chapterLabel } from '@/hooks/useBook'
import { NOTE_TYPES } from '@/lib/text'
import { cn } from '@/lib/utils'
import { IconButton, Button, Select } from '@/components/ui'

/** Orders open notes the way they appear in the book: chapter, scene, position in the text. */
export function orderedNotes(bk, notes) {
  const out = []
  for (const ch of bk.flatChapters) {
    for (const s of ch.scenes) {
      const html = s.content || ''
      const list = notes.filter((n) => n.scene_id === s.id)
      list.sort((a, b) => {
        const ia = html.indexOf(`data-note-id="${a.id}"`), ib = html.indexOf(`data-note-id="${b.id}"`)
        return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || String(a.created_date).localeCompare(String(b.created_date))
      })
      for (const n of list) out.push({ ...n, chapter: ch, scene: s, orphan: !!n.anchored && !html.includes(`data-note-id="${n.id}"`) })
    }
  }
  return out
}

export default function NotesPanel({ bk, chapterId, activeNoteId, onJump, onDone, onDelete, onRetype, focusNoteId, onFocused }) {
  const [scope, setScope] = useState('book')
  const [showDone, setShowDone] = useState(false)

  const all = useMemo(() => orderedNotes(bk, bk.notes), [bk.notes, bk.flatChapters])
  const inScope = all.filter((n) => scope === 'book' || n.chapter.id === chapterId)
  const filtered = inScope.filter((n) => showDone || !n.done)
  const doneCount = inScope.filter((n) => n.done).length

  let lastScene = null
  return (
    <div className="flex flex-col h-full" data-tour="notes">
      <div className="px-3 py-2.5 border-b border-line flex items-center gap-2">
        <div className="flex rounded-lg border border-line bg-raised p-0.5 text-[13px]" role="group" aria-label="אילו פתקים">
          {[['chapter', 'בפרק הזה'], ['book', 'בכל הספר']].map(([k, l]) => (
            <button key={k} className={cn('px-2.5 h-7 rounded-md', scope === k ? 'bg-surface shadow-[var(--shadow-sm)] font-black' : 'text-muted')} onClick={() => setScope(k)} aria-pressed={scope === k}>{l}</button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[13px] text-muted tabular-nums">{filtered.filter((n) => !n.done).length} פתוחים</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2" data-testid="notes-list">
        {filtered.length === 0 && (
          <div className="p-5 text-center text-[13px] text-muted leading-6">
            <div className="font-black text-fg mb-1">אין פתקים {scope === 'chapter' ? 'בפרק הזה' : 'בספר'}</div>
            מסמנים מילה, משפט או פסקה, לוחצים עליהם בכפתור הימני של העכבר, ובוחרים סוג פתק.
          </div>
        )}
        {filtered.map((n) => {
          const header = lastScene !== n.scene_id
          lastScene = n.scene_id
          const t = NOTE_TYPES[n.type || 'fix']
          return (
            <div key={n.id}>
              {header && <div className="px-2 pt-3 pb-1 text-[12px] text-muted truncate">{chapterLabel(n.chapter)}{n.chapter.scenes.length > 1 ? ` · ${n.scene.title || 'סצנה'}` : ''}</div>}
              <div
                className={cn('rounded-lg border bg-surface p-2.5 mb-1.5 cursor-pointer', n.id === activeNoteId ? 'border-fg' : 'border-line hover:border-line-strong', n.done && 'opacity-60')}
                onClick={() => onJump(n)}
                data-testid={`note-card-${n.id}`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-[12px] text-muted">
                  <span className="w-2.5 h-2.5 rounded-sm border border-line-strong" style={{ background: t.color }} aria-hidden />{t.label}
                  {n.quote && <span className="truncate">· ״{n.quote}״</span>}
                </div>
                {n.orphan && <div className="text-[12px] text-warn mb-1">הטקסט המקורי נמחק</div>}
                <textarea
                  ref={(el) => { if (el && focusNoteId === n.id) { el.focus(); el.scrollIntoView({ block: 'nearest' }); onFocused?.() } }}
                  defaultValue={n.text || ''}
                  placeholder="מה רצית לזכור?"
                  rows={Math.min(5, Math.max(1, (n.text || '').split('\n').length))}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => bk.update('notes', n.id, { text: e.target.value }, { delay: 800 })}
                  className="w-full resize-none bg-transparent outline-none text-[14px] leading-6"
                  aria-label="תוכן הפתק"
                />
                <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                  <Select size="xs" value={n.type || 'fix'} onChange={(v) => onRetype(n, v)} aria-label="סוג הפתק" className="bg-surface"
                    options={Object.entries(NOTE_TYPES).map(([k, x]) => ({ value: k, label: x.label }))} />
                  <div className="flex-1" />
                  {n.done
                    ? <Button size="sm" variant="ghost" onClick={() => onDone(n, false)}>החזר</Button>
                    : <Button size="sm" variant="ghost" onClick={() => onDone(n, true)} data-testid={`note-done-${n.id}`}><Check size={15} />בוצע</Button>}
                  <IconButton label="מחק פתק" onClick={() => onDelete(n)}><Trash2 size={15} /></IconButton>
                </div>
              </div>
            </div>
          )
        })}
        {doneCount > 0 && (
          <button className="w-full text-center text-[12px] text-muted hover:text-fg py-2" onClick={() => setShowDone((x) => !x)}>{showDone ? 'הסתר פתקים שבוצעו' : `הצג גם ${doneCount} שבוצעו`}</button>
        )}
      </div>
    </div>
  )
}
