// The ideas box: quick thoughts that do not belong anywhere yet. An idea can point to a chapter
// or a scene if you want, and can become a scene of its own.
import { useState } from 'react'
import { Plus, Trash2, ArrowUpLeft, Link2, X } from 'lucide-react'
import { Dialog, Button, IconButton, inputClass } from '@/components/ui'
import { chapterLabel } from '@/hooks/useBook'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

function LinkPicker({ bk, value, onChange }) {
  return (
    <select className={cn(inputClass, 'h-9 text-sm w-full')} value={value} onChange={(e) => onChange(e.target.value)} aria-label="קישור לפרק או לסצנה" data-testid="idea-link-select">
      <option value="">בלי קישור</option>
      {bk.flatChapters.map((c) => (
        <optgroup key={c.id} label={chapterLabel(c)}>
          <option value={`c:${c.id}`}>{chapterLabel(c)} (כל הפרק)</option>
          {c.scenes.length > 1 && c.scenes.map((s, i) => <option key={s.id} value={`s:${s.id}`}>{s.title || `סצנה ${i + 1}`}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

const toLink = (v) => v.startsWith('c:') ? { link_chapter_id: v.slice(2), link_scene_id: '' } : v.startsWith('s:') ? { link_chapter_id: '', link_scene_id: v.slice(2) } : { link_chapter_id: '', link_scene_id: '' }

export default function IdeasDialog({ bk, open, onClose, onOpenScene, onOpenChapter }) {
  const [text, setText] = useState('')
  const [linking, setLinking] = useState(false)
  const [link, setLink] = useState('')
  const add = async () => {
    const t = text.trim()
    if (!t) return
    setText(''); setLink(''); setLinking(false)
    await bk.createRecord('ideas', { text: t, done: false, ...toLink(link) })
  }
  const ideas = [...bk.ideas].filter((i) => !i.done).sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)))
  const linkLabel = (i) => {
    if (i.link_scene_id) {
      const ch = bk.flatChapters.find((c) => c.scenes.some((s) => s.id === i.link_scene_id))
      const sc = ch?.scenes.find((s) => s.id === i.link_scene_id)
      return ch ? { text: `${chapterLabel(ch)}${ch.scenes.length > 1 ? ` · ${sc.title || 'סצנה'}` : ''}`, go: () => { onOpenScene(i.link_scene_id); onClose() } } : null
    }
    if (i.link_chapter_id) {
      const ch = bk.flatChapters.find((c) => c.id === i.link_chapter_id)
      return ch ? { text: chapterLabel(ch), go: () => { onOpenChapter(ch.id); onClose() } } : null
    }
    return null
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="תיבת רעיונות">
      <div className="flex flex-col gap-4" data-testid="ideas-dialog">
        <div className="rounded-xl border border-line bg-raised p-3 flex flex-col gap-2">
          <textarea className={cn(inputClass, 'h-auto py-2 bg-surface')} rows={2} value={text} autoFocus
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }}
            placeholder="רעיון חדש. בלי להחליט לאן הוא שייך." data-testid="idea-input" />
          {linking && <div className="flex items-center gap-2"><div className="flex-1"><LinkPicker bk={bk} value={link} onChange={setLink} /></div><IconButton label="בלי קישור" onClick={() => { setLinking(false); setLink('') }}><X size={16} /></IconButton></div>}
          <div className="flex items-center gap-2">
            {!linking && <button className="text-[13px] text-muted hover:text-fg inline-flex items-center gap-1" onClick={() => setLinking(true)} data-testid="idea-link"><Plus size={14} />קישור לפרק או סצנה</button>}
            <div className="flex-1" />
            <Button variant="primary" size="sm" onClick={add} disabled={!text.trim()} data-testid="idea-add">הוסף</Button>
          </div>
        </div>
        {ideas.length === 0 && <p className="text-sm text-muted text-center py-4">תיבת הרעיונות ריקה.</p>}
        <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
          {ideas.map((i) => {
            const l = linkLabel(i)
            return (
              <div key={i.id} className="rounded-xl border border-line p-3 text-[14px] leading-6" data-testid="idea-card">
                <div className="whitespace-pre-wrap">{i.text}</div>
                {l && <button className="mt-1 text-[13px] text-muted hover:text-fg inline-flex items-center gap-1" onClick={l.go}><Link2 size={13} />{l.text}</button>}
                <div className="flex items-center gap-1 mt-2">
                  <Button size="sm" variant="ghost" disabled={!bk.flatChapters.length} onClick={async () => {
                    const chId = i.link_chapter_id || bk.flatChapters.find((c) => c.scenes.some((s) => s.id === i.link_scene_id))?.id || bk.flatChapters[bk.flatChapters.length - 1].id
                    const s = await bk.addScene(chId, i.link_scene_id || null, { summary: i.text, status: 'idea' })
                    bk.update('ideas', i.id, { done: true, scene_id: s.id })
                    onOpenScene(s.id); onClose()
                    toast('הרעיון הפך לסצנה')
                  }}><ArrowUpLeft size={15} />הפוך לסצנה</Button>
                  <div className="flex-1" />
                  <IconButton label="מחק רעיון" onClick={() => bk.removeRecord('ideas', i.id)}><Trash2 size={15} /></IconButton>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Dialog>
  )
}
