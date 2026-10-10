// The inspiration board: pictures and sticky notes laid out freely, like a wall above the desk.
// Positions are measured from the right edge (the book is in Hebrew). Pictures that were never
// placed get a tidy spot automatically until the writer moves them.
import { useMemo, useRef, useState } from 'react'
import { StickyNote, ZoomIn, ZoomOut, X, Maximize2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import { PrivateImage } from '@/components/InspirationBits'
import { cn } from '@/lib/utils'

const CANVAS_W = 4200, CANVAS_H = 3200
const COL_W = 260, GAP = 28, PAD = 40

function autoLayout(items) {
  const cols = [0, 0, 0, 0].map(() => PAD)
  const out = {}
  for (const it of items) {
    if (it.board?.w) continue
    const c = cols.indexOf(Math.min(...cols))
    const h = it.kind === 'note' ? 160 : Math.round(COL_W * ((it.height || 3) / (it.width || 4))) + 30
    out[it.id] = { x: PAD + c * (COL_W + GAP), y: cols[c], w: COL_W, h: it.kind === 'note' ? 160 : undefined }
    cols[c] += h + GAP
  }
  return out
}

export default function InspirationBoard({ bk, onOpen }) {
  const items = useMemo(() => bk.inspirations.filter((r) => !r.deleted).sort((a, b) => (a.board?.z || 0) - (b.board?.z || 0)), [bk.inspirations])
  const auto = useMemo(() => autoLayout(items), [items])
  const [zoom, setZoom] = useState(1)
  const [live, setLive] = useState(null) // { id, x, y, w, h } while dragging or resizing
  const scroller = useRef(null)
  const topZ = Math.max(0, ...items.map((r) => r.board?.z || 0))

  const posOf = (it) => (live?.id === it.id ? live : { ...auto[it.id], ...(it.board?.w ? it.board : {}) })

  const start = (e, it, mode) => {
    if (e.button !== 0) return
    if (mode === 'move' && e.target.closest('textarea, button, a')) return
    e.preventDefault(); e.stopPropagation()
    const p0 = posOf(it)
    const sx = e.clientX, sy = e.clientY
    const el = e.currentTarget
    el.setPointerCapture?.(e.pointerId)
    let cur = { id: it.id, ...p0 }
    const onMove = (ev) => {
      const dx = (ev.clientX - sx) / zoom, dy = (ev.clientY - sy) / zoom
      cur = mode === 'move'
        ? { ...cur, x: Math.max(0, Math.min(CANVAS_W - p0.w, p0.x - dx)), y: Math.max(0, Math.min(CANVAS_H - 80, p0.y + dy)) }
        : { ...cur, w: Math.max(120, Math.min(900, p0.w - dx)), h: it.kind === 'note' ? Math.max(90, (p0.h || 160) + dy) : undefined }
      setLive(cur)
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp)
      const { id: _id, ...pos } = cur
      if (pos.x !== p0.x || pos.y !== p0.y || pos.w !== p0.w || pos.h !== p0.h || !it.board?.w) {
        bk.update('inspirations', it.id, { board: { ...pos, z: topZ + 1 } }, { delay: 300 })
      }
      setLive(null)
    }
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp)
  }

  const addNote = async () => {
    const s = scroller.current
    // In a right-to-left scroller scrollLeft runs from 0 (right edge) to negative values.
    const x = Math.max(PAD, Math.abs(s ? s.scrollLeft : 0) / zoom + PAD)
    const y = (s ? s.scrollTop : 0) / zoom + PAD
    await bk.createRecord('inspirations', { kind: 'note', title: '', content: '', board: { x: Math.round(x), y: Math.round(y), w: 220, h: 160, z: topZ + 1 }, order: 0, deleted: false, character_ids: [] })
  }

  return (
    <div className="flex flex-col h-full min-h-[480px] rounded-xl border border-line bg-surface overflow-hidden" data-testid="board">
      <div className="h-12 shrink-0 flex items-center gap-1 px-2 border-b border-line">
        <Button size="sm" variant="ghost" onClick={addNote} data-testid="board-add-note"><StickyNote size={15} />פתק חדש</Button>
        <div className="flex-1" />
        <span className="text-xs text-muted hidden sm:inline">גוררים כדי לסדר. גוררים את הפינה כדי לשנות גודל. לחיצה כפולה על תמונה פותחת אותה.</span>
        <IconButton label="הקטן" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}><ZoomOut size={16} /></IconButton>
        <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
        <IconButton label="הגדל" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.15).toFixed(2)))}><ZoomIn size={16} /></IconButton>
      </div>
      <div ref={scroller} className="flex-1 min-h-0 overflow-auto bg-[radial-gradient(var(--line)_1px,transparent_1px)] [background-size:22px_22px]">
        <div className="relative" style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}>
          <div className="absolute top-0 right-0 origin-top-right" style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${zoom})` }}>
            {items.map((it) => {
              const p = posOf(it)
              if (!p?.w) return null
              const dragging = live?.id === it.id
              return (
                <div
                  key={it.id}
                  className={cn('absolute group rounded-lg bg-surface border border-line select-none touch-none', dragging ? 'shadow-[var(--shadow)] cursor-grabbing' : 'shadow-[var(--shadow-sm)] cursor-grab')}
                  style={{ right: p.x, top: p.y, width: p.w, height: it.kind === 'note' ? p.h || 160 : undefined, zIndex: dragging ? 9999 : it.board?.z || 0 }}
                  onPointerDown={(e) => start(e, it, 'move')}
                  onDoubleClick={() => it.kind === 'image' && onOpen(it)}
                  data-testid={`board-item-${it.id}`}
                >
                  {it.kind === 'image' ? (
                    <div className="p-1.5">
                      <PrivateImage uri={it.thumb_uri} width={it.width} height={it.height} alt={it.title} className="w-full rounded-md" />
                      {it.title && <div className="px-1 pt-1.5 text-sm truncate">{it.title}</div>}
                      <button className="absolute top-2 left-2 w-7 h-7 rounded-md bg-surface/90 border border-line hidden group-hover:inline-flex items-center justify-center" aria-label="פתח" onClick={() => onOpen(it)}><Maximize2 size={14} /></button>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col p-2 bg-raised rounded-lg">
                      <div className="h-4 flex justify-end">
                        <button className="w-5 h-5 rounded hidden group-hover:inline-flex items-center justify-center text-muted hover:text-fg" aria-label="מחק פתק" onClick={() => bk.removeRecord('inspirations', it.id)} data-testid="board-note-delete"><X size={13} /></button>
                      </div>
                      <textarea
                        className="flex-1 w-full resize-none bg-transparent outline-none text-[15px] leading-6 cursor-text"
                        defaultValue={it.content || ''}
                        placeholder="כתבו כאן…"
                        onChange={(e) => bk.update('inspirations', it.id, { content: e.target.value })}
                        data-testid="board-note-text"
                      />
                    </div>
                  )}
                  <span
                    className="absolute -bottom-1.5 -left-1.5 w-4 h-4 rounded-sm bg-surface border border-line-strong hidden group-hover:block cursor-nesw-resize"
                    onPointerDown={(e) => start(e, it, 'resize')}
                    aria-hidden
                    data-testid="board-resize"
                  />
                </div>
              )
            })}
            {!items.length && <div className="absolute top-24 right-24 text-muted">הלוח ריק. הוסיפו תמונות או פתק.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
