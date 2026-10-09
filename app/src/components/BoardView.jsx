import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Pin, Plus, ArrowUpLeft } from 'lucide-react'
import { chapterLabel } from '@/hooks/useBook'
import { formatNumber, SCENE_STATUS } from '@/lib/text'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

/** The card board: one column per chapter, one card per scene. Dragging reorders the book itself. */
export default function BoardView({ bk, noteCounts, onOpenScene }) {
  const onDragEnd = ({ draggableId, destination }) => {
    if (!destination) return
    bk.moveScene(draggableId, destination.droppableId, destination.index)
    toast('הסצנה הועברה', { action: { label: 'בטל', run: () => bk.undoMove() } })
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto p-4" data-testid="board">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 items-start min-w-max">
          {bk.flatChapters.map((ch) => (
            <div key={ch.id} className="w-72 shrink-0 rounded-2xl bg-sunk p-2 flex flex-col max-h-full">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="font-semibold text-sm truncate">{chapterLabel(ch)}</span>
                <span className="text-xs text-muted tabular-nums">{formatNumber(ch.words)}</span>
              </div>
              <Droppable droppableId={ch.id}>
                {(dp, snap) => (
                  <div ref={dp.innerRef} {...dp.droppableProps} className={cn('flex flex-col gap-2 min-h-[40px] rounded-xl p-0.5', snap.isDraggingOver && 'bg-accent-soft')}>
                    {ch.scenes.map((s, i) => (
                      <Draggable key={s.id} draggableId={s.id} index={i}>
                        {(p, ds) => (
                          <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className={cn('rounded-xl border border-line bg-surface p-3 flex flex-col gap-1.5', ds.isDragging && 'drag-lifted')}>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: (SCENE_STATUS[s.status] || SCENE_STATUS.idea).color }} />
                              <input className="flex-1 min-w-0 bg-transparent font-medium text-[15px] outline-none" defaultValue={s.title || ''} placeholder={`סצנה ${i + 1}`} onChange={(e) => bk.update('scenes', s.id, { title: e.target.value })} aria-label="שם הסצנה" />
                            </div>
                            <textarea className="bg-transparent text-sm text-muted outline-none resize-none leading-5" rows={3} defaultValue={s.summary || ''} placeholder="מה קורה כאן" onChange={(e) => bk.update('scenes', s.id, { summary: e.target.value })} aria-label="תקציר" />
                            <div className="flex items-center gap-2 text-xs text-muted">
                              <span className="tabular-nums">{formatNumber(s.word_count || 0)} מילים</span>
                              {noteCounts[s.id] > 0 && <span className="text-warn inline-flex items-center gap-0.5"><Pin size={11} />{noteCounts[s.id]}</span>}
                              <span className="flex-1" />
                              <button className="inline-flex items-center gap-0.5 text-accent" onClick={() => onOpenScene(s.id)}><ArrowUpLeft size={13} />פתח</button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {dp.placeholder}
                  </div>
                )}
              </Droppable>
              <button className="hit mt-1 text-sm text-muted hover:text-fg rounded-lg inline-flex items-center justify-center gap-1" onClick={() => bk.addScene(ch.id)}><Plus size={14} />סצנה</button>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  )
}
