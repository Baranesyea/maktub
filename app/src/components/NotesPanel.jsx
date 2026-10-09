import { useMemo, useState } from 'react'
import { ChevronRight, ChevronLeft, Undo2, Check, Trash2, Plus, ListChecks } from 'lucide-react'
import { chapterLabel } from '@/hooks/useBook'
import { NOTE_TYPES } from '@/lib/text'
import { cn } from '@/lib/utils'
import { IconButton, Button } from '@/components/ui'

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

export default function NotesPanel({ bk, chapterId, sceneId, activeNoteId, onJump, onBack, canGoBack, onAddSceneNote, onDone, onDelete, onRetype, focusNoteId, onFocused }) {
  const [scope, setScope] = useState('book')
  const [showDone, setShowDone] = useState(false)
  const [types, setTypes] = useState([])
  const [review, setReview] = useState(false)

  const all = useMemo(() => orderedNotes(bk, bk.notes), [bk.notes, bk.flatChapters])
  const filtered = all.filter((n) => {
    if (!showDone && n.done) return false
    if (scope === 'scene' && n.scene_id !== sceneId) return false
    if (scope === 'chapter' && n.chapter.id !== chapterId) return false
    if (review && n.type !== 'fix') return false
    if (types.length && !types.includes(n.type || 'fix')) return false
    return true
  })
  const openCount = all.filter((n) => !n.done).length
  const idx = filtered.findIndex((n) => n.id === activeNoteId)
  const go = (dir) => {
    if (!filtered.length) return
    const next = idx < 0 ? (dir > 0 ? 0 : filtered.length - 1) : (idx + dir + filtered.length) % filtered.length
    onJump(filtered[next])
  }
  const startReview = () => {
    setReview(true); setShowDone(false)
    const first = all.find((n) => !n.done && n.type === 'fix' && (scope === 'book' || (scope === 'chapter' ? n.chapter.id === chapterId : n.scene_id === sceneId)))
    if (first) onJump(first)
  }
  const completeAndNext = (n) => {
    onDone(n, true)
    if (review) {
      const rest = filtered.filter((x) => x.id !== n.id)
      const after = rest[Math.min(idx, rest.length - 1)]
      if (after) onJump(after)
    }
  }

  let lastScene = null
  return (
    <div className="flex flex-col h-full" data-tour="notes">
      <div className="p-3 border-b border-line flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <IconButton label="הפתק הקודם" onClick={() => go(-1)} data-testid="note-prev"><ChevronRight size={18} /></IconButton>
          <span className="text-sm text-muted tabular-nums min-w-[4.5ch] text-center">{filtered.length ? `${idx >= 0 ? idx + 1 : '–'}/${filtered.length}` : '0'}</span>
          <IconButton label="הפתק הבא" onClick={() => go(1)} data-testid="note-next"><ChevronLeft size={18} /></IconButton>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={onBack} disabled={!canGoBack} data-testid="note-back"><Undo2 size={15} />חזרה למקום שבו הייתי</Button>
        </div>
        <div className="flex gap-1 text-sm" role="group" aria-label="היקף">
          {[['scene', 'הסצנה'], ['chapter', 'הפרק'], ['book', 'כל הספר']].map(([k, l]) => (
            <button key={k} className={cn('px-2.5 h-8 rounded-lg', scope === k ? 'bg-accent-soft text-accent' : 'hover:bg-sunk')} onClick={() => setScope(k)} aria-pressed={scope === k}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          {Object.entries(NOTE_TYPES).map(([k, t]) => (
            <button key={k} onClick={() => setTypes((x) => x.includes(k) ? x.filter((y) => y !== k) : [...x, k])} className={cn('px-2 h-7 rounded-full border flex items-center gap-1', types.includes(k) ? 'border-accent text-accent' : 'border-line text-muted')} aria-pressed={types.includes(k)}>
              <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />{t.label}
            </button>
          ))}
          <label className="flex items-center gap-1 px-2 text-muted"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />גם שבוצעו</label>
        </div>
        <div className="flex gap-2">
          {review
            ? <Button size="sm" variant="ghost" onClick={() => setReview(false)}>סיים סבב תיקונים</Button>
            : <Button size="sm" variant="ghost" onClick={startReview}><ListChecks size={15} />סבב תיקונים</Button>}
          <Button size="sm" variant="ghost" onClick={onAddSceneNote} disabled={!sceneId}><Plus size={15} />פתק לסצנה</Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2" data-testid="notes-list">
        {review && filtered.length === 0 && openCount >= 0 && (
          <p className="p-4 text-center text-sm text-ok">סיימת את כל התיקונים {scope === 'chapter' ? 'בפרק הזה' : scope === 'scene' ? 'בסצנה הזאת' : 'בספר'}.</p>
        )}
        {!review && filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-muted">אין פתקים כאן. סמנו מילה או משפט בטקסט ולחצו על 📌 כדי להדביק פתק.</p>
        )}
        {filtered.map((n) => {
          const header = lastScene !== n.scene_id
          lastScene = n.scene_id
          const t = NOTE_TYPES[n.type || 'fix']
          return (
            <div key={n.id}>
              {header && <div className="px-2 pt-3 pb-1 text-xs text-muted truncate">{chapterLabel(n.chapter)}{n.chapter.scenes.length > 1 ? ` · ${n.scene.title || 'סצנה'}` : ''}</div>}
              <div
                className={cn('rounded-xl border bg-surface p-2.5 mb-1.5 cursor-pointer', n.id === activeNoteId ? 'border-accent shadow-sm' : 'border-line', n.done && 'opacity-60')}
                style={{ borderInlineStartWidth: 4, borderInlineStartColor: t.color }}
                onClick={() => onJump(n)}
                data-testid={`note-card-${n.id}`}
              >
                {n.quote && <div className="text-xs text-muted mb-1 truncate">״{n.quote}״</div>}
                {n.orphan && <div className="text-xs text-warn mb-1">הטקסט המקורי נמחק</div>}
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
                  <select value={n.type || 'fix'} onChange={(e) => onRetype(n, e.target.value)} className="h-7 rounded-md border border-line bg-bg text-xs px-1" aria-label="סוג הפתק">
                    {Object.entries(NOTE_TYPES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
                  </select>
                  <div className="flex-1" />
                  {n.done
                    ? <Button size="sm" variant="ghost" onClick={() => onDone(n, false)}>החזר</Button>
                    : <Button size="sm" variant="ghost" onClick={() => completeAndNext(n)} data-testid={`note-done-${n.id}`}><Check size={15} />בוצע</Button>}
                  <IconButton label="מחק פתק" onClick={() => onDelete(n)}><Trash2 size={15} /></IconButton>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
