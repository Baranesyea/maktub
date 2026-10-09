import { useEffect, useRef, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { ChevronLeft, ChevronDown, MoreHorizontal, Plus, Pin, EyeOff } from 'lucide-react'
import { Menu, MenuItem, MenuSeparator, IconButton, Dialog, Button } from '@/components/ui'
import { chapterLabel } from '@/hooks/useBook'
import { cn } from '@/lib/utils'
import { formatNumber, pagesFor, SCENE_STATUS } from '@/lib/text'
import { toast } from '@/lib/toast'

function InlineRename({ value, onDone }) {
  const [v, setV] = useState(value || '')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const commit = () => onDone(v.trim())
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onDone(null) }}
      onClick={(e) => e.stopPropagation()}
      className="w-full h-8 rounded-md border border-accent bg-surface px-2 text-[15px] outline-none"
      aria-label="שם חדש"
    />
  )
}

const StatusDot = ({ status }) => (
  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: (SCENE_STATUS[status] || SCENE_STATUS.idea).color }} title={(SCENE_STATUS[status] || SCENE_STATUS.idea).label} />
)

const NotesBadge = ({ n }) => n > 0 ? (
  <span className="inline-flex items-center gap-0.5 text-[12px] text-warn tabular-nums" title={`${n} פתקים פתוחים`}><Pin size={11} />{n}</span>
) : null

export default function BookTree({ bk, activeChapterId, activeSceneId, onOpenChapter, onOpenScene, noteCounts = {}, onExport, onClose }) {
  const [collapsed, setCollapsed] = useState(() => { try { return JSON.parse(localStorage.getItem('maktub_tree_collapsed') || '{}') } catch { return {} } })
  const [renaming, setRenaming] = useState(null) // {kind, id}
  const [selected, setSelected] = useState([]) // [{kind, id}]
  const [moveDialog, setMoveDialog] = useState(null)
  const [draggingType, setDraggingType] = useState(null)
  const [ctxMenu, setCtxMenu] = useState(null)
  const openCtx = (id) => (e) => { e.preventDefault(); setCtxMenu(id) }

  useEffect(() => { try { localStorage.setItem('maktub_tree_collapsed', JSON.stringify(collapsed)) } catch { /* ignore */ } }, [collapsed])
  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))

  const totalWords = bk.flatChapters.reduce((n, c) => n + (c.unused ? 0 : c.words), 0)
  const chapterNotes = (ch) => ch.scenes.reduce((n, s) => n + (noteCounts[s.id] || 0), 0)

  const isSel = (kind, id) => selected.some((s) => s.kind === kind && s.id === id)
  const clickSelect = (e, kind, id) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault()
      setSelected((sel) => {
        const others = sel.filter((s) => s.kind === kind)
        return isSel(kind, id) ? others.filter((s) => s.id !== id) : [...others, { kind, id }]
      })
      return true
    }
    setSelected([{ kind, id }])
    return false
  }

  const onDragStart = (start) => setDraggingType(start.type)
  const onDragEnd = (result) => {
    setDraggingType(null)
    const { draggableId, destination, type } = result
    if (!destination) return
    if (type === 'CHAPTER') {
      const id = draggableId.slice(3)
      const partId = destination.droppableId === 'part:none' ? null : destination.droppableId.slice(5)
      const multi = selected.filter((s) => s.kind === 'chapter').map((s) => s.id)
      if (multi.length > 1 && multi.includes(id)) {
        const ordered = bk.flatChapters.filter((c) => multi.includes(c.id)).map((c) => c.id)
        bk.rememberPositions()
        ordered.forEach((cid, k) => bk.moveChapter(cid, destination.index + k, partId))
      } else bk.moveChapter(id, destination.index, partId)
      toast('הפרק הועבר', { action: { label: 'בטל', run: () => bk.undoMove() } })
      return
    }
    if (type === 'SCENE') {
      const id = draggableId.slice(3)
      const destCh = destination.droppableId.slice(3)
      const destChapter = bk.flatChapters.find((c) => c.id === destCh)
      let index = destination.index
      // A single-scene chapter shows no scene rows; dropping on it adds after its scene.
      if (destChapter && destChapter.scenes.length === 1 && destChapter.scenes[0].id !== id) index = 1
      const multi = selected.filter((s) => s.kind === 'scene').map((s) => s.id)
      if (multi.length > 1 && multi.includes(id)) {
        const ordered = bk.flatChapters.flatMap((c) => c.scenes).filter((s) => multi.includes(s.id)).map((s) => s.id)
        bk.rememberPositions()
        ordered.forEach((sid, k) => bk.moveScene(sid, destCh, index + k, { remember: false }))
      } else bk.moveScene(id, destCh, index)
      toast('הסצנה הועברה', { action: { label: 'בטל', run: () => bk.undoMove() } })
    }
  }

  // Keyboard moves: Alt+Up / Alt+Down move the selected chapter or scene.
  const onKeyDown = (e) => {
    if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key) || selected.length !== 1) return
    e.preventDefault()
    const dir = e.key === 'ArrowUp' ? -1 : 1
    const sel = selected[0]
    if (sel.kind === 'chapter') {
      const group = bk.tree.find((g) => g.chapters.some((c) => c.id === sel.id))
      const i = group.chapters.findIndex((c) => c.id === sel.id)
      const j = i + dir
      if (j < 0 || j >= group.chapters.length) return
      bk.moveChapter(sel.id, j, group.part?.id || null)
    } else {
      const ch = bk.flatChapters.find((c) => c.scenes.some((s) => s.id === sel.id))
      const i = ch.scenes.findIndex((s) => s.id === sel.id)
      const j = i + dir
      if (j >= 0 && j < ch.scenes.length) bk.moveScene(sel.id, ch.id, j)
      else {
        // Past the edge: move into the neighbouring chapter.
        const k = bk.flatChapters.findIndex((c) => c.id === ch.id) + dir
        const other = bk.flatChapters[k]
        if (other) bk.moveScene(sel.id, other.id, dir < 0 ? other.scenes.length : 0)
      }
    }
  }

  const chapterMenu = (ch) => (
    <>
      <MenuItem onSelect={() => bk.addChapter({ afterId: ch.id, partId: ch.part_id || null }).then(({ chapter }) => onOpenChapter(chapter.id))}>הוסף פרק אחרי</MenuItem>
      <MenuItem onSelect={() => bk.addScene(ch.id).then((s) => onOpenScene(s.id))}>הוסף סצנה</MenuItem>
      <MenuItem onSelect={() => setRenaming({ kind: 'chapter', id: ch.id })}>שנה שם</MenuItem>
      <MenuItem onSelect={() => bk.duplicateChapter(ch.id)}>שכפל</MenuItem>
      <MenuItem onSelect={() => setMoveDialog({ kind: 'chapter', id: ch.id })}>העבר ל…</MenuItem>
      <MenuItem onSelect={() => { if (bk.mergeChapterIntoPrevious(ch.id) === false) toast('אין פרק קודם למזג אליו') }}>מזג לתוך הפרק הקודם</MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => bk.update('chapters', ch.id, { kind: ch.kind === 'prologue' ? 'chapter' : 'prologue' })}>{ch.kind === 'prologue' ? 'הפוך לפרק רגיל' : 'סמן כפרולוג'}</MenuItem>
      <MenuItem onSelect={() => bk.update('chapters', ch.id, { kind: ch.kind === 'epilogue' ? 'chapter' : 'epilogue' })}>{ch.kind === 'epilogue' ? 'הפוך לפרק רגיל' : 'סמן כאפילוג'}</MenuItem>
      <MenuItem onSelect={() => bk.update('chapters', ch.id, { unused: !ch.unused })}>{ch.unused ? 'החזר לשימוש' : 'סמן "לא בשימוש"'}</MenuItem>
      <MenuItem onSelect={() => onExport?.([ch.id])}>ייצא את הפרק</MenuItem>
      <MenuSeparator />
      <MenuItem danger onSelect={() => { bk.trash('chapters', ch.id); toast('הפרק הועבר לסל', { action: { label: 'בטל', run: () => bk.restore('chapters', ch.id) } }) }}>מחק</MenuItem>
    </>
  )

  const sceneMenu = (s, ch) => (
    <>
      <MenuItem onSelect={() => bk.addScene(ch.id, s.id).then((n) => onOpenScene(n.id))}>הוסף סצנה אחרי</MenuItem>
      <MenuItem onSelect={() => setRenaming({ kind: 'scene', id: s.id })}>שנה שם</MenuItem>
      <MenuItem onSelect={() => bk.duplicateScene(s.id)}>שכפל</MenuItem>
      <MenuItem onSelect={() => setMoveDialog({ kind: 'scene', id: s.id })}>העבר ל…</MenuItem>
      <MenuItem onSelect={() => bk.sceneToChapter(s.id).then((c) => onOpenChapter(c.id))}>הפוך לפרק</MenuItem>
      <MenuItem onSelect={() => { const r = bk.mergeSceneWithPrevious(s.id); if (r === false) toast('זו הסצנה הראשונה בפרק'); else onOpenScene(r) }}>מזג עם הסצנה הקודמת</MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => bk.update('scenes', s.id, { unused: !s.unused })}>{s.unused ? 'החזר לשימוש' : 'סמן "לא בשימוש"'}</MenuItem>
      <MenuSeparator />
      <MenuItem danger onSelect={() => { bk.trash('scenes', s.id); toast('הסצנה הועברה לסל', { action: { label: 'בטל', run: () => bk.restore('scenes', s.id) } }) }}>מחק</MenuItem>
    </>
  )

  const menuProps = (id) => ({ open: ctxMenu === id, onOpenChange: (o) => setCtxMenu(o ? id : null) })

  return (
    <nav className="h-full flex flex-col bg-sunk" aria-label="עץ הספר" data-tour="tree" onKeyDown={onKeyDown}>
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2 border-b border-line">
        <div className="min-w-0">
          <div className="font-semibold truncate">{bk.book?.title}</div>
          <div className="text-xs text-muted tabular-nums">{formatNumber(totalWords)} מילים · כ־{formatNumber(pagesFor(totalWords))} עמודים</div>
        </div>
        <div className="flex items-center">
          <IconButton label="פרק חדש" onClick={() => bk.addChapter().then(({ chapter }) => onOpenChapter(chapter.id))} data-testid="add-chapter"><Plus size={18} /></IconButton>
          {onClose && <IconButton label="סגור" onClick={onClose}><ChevronLeft size={18} /></IconButton>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-2" data-testid="tree">
        <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {bk.tree.map((group) => (
            <div key={group.part?.id || 'none'} className="mb-2">
              {group.part && (
                <div className="group flex items-center gap-1 px-2 pt-2 pb-1 text-xs font-semibold text-muted">
                  {renaming?.id === group.part.id
                    ? <InlineRename value={group.part.title} onDone={(v) => { if (v !== null) bk.update('parts', group.part.id, { title: v }); setRenaming(null) }} />
                    : <span className="flex-1 truncate" onDoubleClick={() => setRenaming({ kind: 'part', id: group.part.id })}>{group.part.title || 'חלק ללא שם'}</span>}
                  <RowMenuBase label="פעולות לחלק" {...menuProps(group.part.id)}>
                    <MenuItem onSelect={() => setRenaming({ kind: 'part', id: group.part.id })}>שנה שם</MenuItem>
                    <MenuItem onSelect={() => bk.addChapter({ partId: group.part.id }).then(({ chapter }) => onOpenChapter(chapter.id))}>הוסף פרק לחלק</MenuItem>
                    <MenuItem danger onSelect={() => { group.chapters.forEach((c) => bk.update('chapters', c.id, { part_id: null })); bk.update('parts', group.part.id, { deleted: true }) }}>מחק חלק (הפרקים נשמרים)</MenuItem>
                  </RowMenuBase>
                </div>
              )}
              <Droppable droppableId={`part:${group.part?.id || 'none'}`} type="CHAPTER">
                {(dp) => (
                  <div ref={dp.innerRef} {...dp.droppableProps} className="min-h-[8px]">
                    {group.chapters.map((ch, i) => {
                      const showScenes = ch.scenes.length > 1
                      const open = !collapsed[ch.id]
                      const active = ch.id === activeChapterId
                      return (
                        <Draggable key={ch.id} draggableId={`ch:${ch.id}`} index={i}>
                          {(p, snap) => (
                            <div ref={p.innerRef} {...p.draggableProps} className={cn('rounded-lg', snap.isDragging && 'drag-lifted')}>
                              <div
                                {...p.dragHandleProps}
                                role="treeitem"
                                aria-selected={active}
                                aria-expanded={showScenes ? open : undefined}
                                data-testid={`chapter-row-${i}`}
                                className={cn('group hit flex items-center gap-1.5 rounded-lg px-1.5 cursor-pointer select-none', active && !activeSceneId ? 'bg-accent-soft text-accent' : active ? 'bg-surface' : 'hover:bg-surface', isSel('chapter', ch.id) && selected.length > 1 && 'ring-2 ring-accent', ch.unused && 'opacity-50')}
                                onClick={(e) => { if (!clickSelect(e, 'chapter', ch.id)) onOpenChapter(ch.id) }}
                                onDoubleClick={() => setRenaming({ kind: 'chapter', id: ch.id })}
                                onContextMenu={openCtx(ch.id)}
                              >
                                {showScenes ? (
                                  <button className="w-6 h-6 flex items-center justify-center text-muted shrink-0" aria-label={open ? 'כווץ' : 'פתח'} onClick={(e) => { e.stopPropagation(); toggle(ch.id) }}>
                                    {open ? <ChevronDown size={15} /> : <ChevronLeft size={15} />}
                                  </button>
                                ) : <span className="w-6 shrink-0 flex justify-center"><StatusDot status={ch.scenes[0]?.status} /></span>}
                                {renaming?.id === ch.id
                                  ? <InlineRename value={ch.title} onDone={(v) => { if (v !== null) bk.update('chapters', ch.id, { title: v }); setRenaming(null) }} />
                                  : <span className="flex-1 min-w-0 truncate font-medium text-[15px]">{chapterLabel(ch)}</span>}
                                {ch.unused && <EyeOff size={13} className="text-muted" aria-label="לא בשימוש" />}
                                <NotesBadge n={chapterNotes(ch)} />
                                <span className="text-[12px] text-muted tabular-nums shrink-0">{formatNumber(ch.words)}</span>
                                <RowMenuBase label="פעולות לפרק" {...menuProps(ch.id)}>{chapterMenu(ch)}</RowMenuBase>
                              </div>
                              <Droppable droppableId={`sc:${ch.id}`} type="SCENE">
                                {(sdp, ssnap) => (
                                  <div ref={sdp.innerRef} {...sdp.droppableProps} className={cn('ps-5 transition-colors rounded-lg', draggingType === 'SCENE' ? 'min-h-[14px]' : 'min-h-[2px]', ssnap.isDraggingOver && 'bg-accent-soft')}>
                                    {showScenes && open && ch.scenes.map((s, j) => (
                                      <Draggable key={s.id} draggableId={`sc:${s.id}`} index={j}>
                                        {(sp, ss) => (
                                          <div
                                            ref={sp.innerRef}
                                            {...sp.draggableProps}
                                            {...sp.dragHandleProps}
                                            role="treeitem"
                                            aria-selected={s.id === activeSceneId}
                                            data-testid={`scene-row-${s.id}`}
                                            className={cn('group hit flex items-center gap-1.5 rounded-lg px-1.5 cursor-pointer select-none text-[14px]', s.id === activeSceneId ? 'bg-accent-soft text-accent' : 'hover:bg-surface text-fg/85', ss.isDragging && 'drag-lifted', isSel('scene', s.id) && selected.length > 1 && 'ring-2 ring-accent', s.unused && 'opacity-50')}
                                            onClick={(e) => { if (!clickSelect(e, 'scene', s.id)) onOpenScene(s.id) }}
                                            onDoubleClick={() => setRenaming({ kind: 'scene', id: s.id })}
                                            onContextMenu={openCtx(s.id)}
                                          >
                                            <StatusDot status={s.status} />
                                            {renaming?.id === s.id
                                              ? <InlineRename value={s.title} onDone={(v) => { if (v !== null) bk.update('scenes', s.id, { title: v }); setRenaming(null) }} />
                                              : <span className="flex-1 min-w-0 truncate">{s.title || `סצנה ${j + 1}`}</span>}
                                            <NotesBadge n={noteCounts[s.id] || 0} />
                                            <span className="text-[12px] text-muted tabular-nums shrink-0">{formatNumber(s.word_count || 0)}</span>
                                            <RowMenuBase label="פעולות לסצנה" {...menuProps(s.id)}>{sceneMenu(s, ch)}</RowMenuBase>
                                          </div>
                                        )}
                                      </Draggable>
                                    ))}
                                    {sdp.placeholder}
                                  </div>
                                )}
                              </Droppable>
                            </div>
                          )}
                        </Draggable>
                      )
                    })}
                    {dp.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </DragDropContext>
        {bk.flatChapters.length === 0 && (
          <div className="p-4 text-center text-sm text-muted">
            <p className="mb-3">עוד אין פרקים.</p>
            <Button size="sm" onClick={() => bk.addChapter().then(({ chapter }) => onOpenChapter(chapter.id))}><Plus size={16} />פרק ראשון</Button>
          </div>
        )}
      </div>

      <MoveToDialog bk={bk} target={moveDialog} onClose={() => setMoveDialog(null)} />
    </nav>
  )
}

function RowMenuBase({ children, label, open, onOpenChange }) {
  return (
    <Menu open={open} onOpenChange={onOpenChange} trigger={<IconButton label={label} className="opacity-60 group-hover:opacity-100 shrink-0" onClick={(e) => e.stopPropagation()}><MoreHorizontal size={16} /></IconButton>}>{children}</Menu>
  )
}

function MoveToDialog({ bk, target, onClose }) {
  if (!target) return null
  const isScene = target.kind === 'scene'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={isScene ? 'העבר סצנה לפרק' : 'העבר פרק'}>
      <div className="flex flex-col gap-1 max-h-[60vh] overflow-auto">
        {isScene && bk.flatChapters.map((c) => (
          <button key={c.id} className="hit text-start rounded-lg px-3 hover:bg-sunk" onClick={() => { bk.moveScene(target.id, c.id, c.scenes.filter((s) => s.id !== target.id).length); toast('הסצנה הועברה', { action: { label: 'בטל', run: () => bk.undoMove() } }); onClose() }}>
            {chapterLabel(c)}
          </button>
        ))}
        {!isScene && (
          <>
            <button className="hit text-start rounded-lg px-3 hover:bg-sunk" onClick={() => { bk.moveChapter(target.id, 0, bk.flatChapters.find((c) => c.id === target.id)?.part_id || null); onClose() }}>לתחילת הספר</button>
            {bk.flatChapters.filter((c) => c.id !== target.id).map((c) => (
              <button key={c.id} className="hit text-start rounded-lg px-3 hover:bg-sunk" onClick={() => {
                const group = bk.tree.find((g) => g.chapters.some((x) => x.id === c.id))
                const list = group.chapters.filter((x) => x.id !== target.id)
                bk.moveChapter(target.id, list.findIndex((x) => x.id === c.id) + 1, group.part?.id || null)
                toast('הפרק הועבר', { action: { label: 'בטל', run: () => bk.undoMove() } })
                onClose()
              }}>אחרי {chapterLabel(c)}</button>
            ))}
          </>
        )}
      </div>
    </Dialog>
  )
}
