import { useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Plus, Trash2, History, X } from 'lucide-react'
import NotesPanel from '@/components/NotesPanel'
import { Button, IconButton, inputClass, Select } from '@/components/ui'
import { SCENE_STATUS } from '@/lib/text'
import { formatTime, parseFuzzy, resolveTime, ageAt } from '@/lib/timeline'
import { chapterLabel } from '@/hooks/useBook'
import { cn } from '@/lib/utils'

export default function SidePanel({ bk, tab, onTab, scene, chapter, notesProps, onOpenScene, onShowVersions, onClose }) {
  return (
    <Tabs.Root value={tab} onValueChange={onTab} dir="rtl" className="h-full flex flex-col bg-surface" data-tour="side">
      <div className="h-14 shrink-0 flex items-stretch border-b border-line pe-1">
        <Tabs.List className="flex flex-1 items-stretch overflow-x-auto" aria-label="חלונית צד">
          {[['notes', 'פתקים'], ['scene', 'סצנה'], ['people', 'דמויות ומקומות']].map(([k, l]) => (
            <Tabs.Trigger key={k} value={k} className="hit px-3 text-sm whitespace-nowrap text-muted data-[state=active]:text-fg data-[state=active]:font-black data-[state=active]:shadow-[inset_0_-2px_0_var(--fg)]" data-testid={`tab-${k}`}>{l}</Tabs.Trigger>
          ))}
        </Tabs.List>
        {onClose && <span className="self-center"><IconButton label="סגור חלונית" onClick={onClose}><X size={17} /></IconButton></span>}
      </div>
      <Tabs.Content value="notes" className="flex-1 min-h-0"><NotesPanel bk={bk} {...notesProps} /></Tabs.Content>
      <Tabs.Content value="scene" className="flex-1 min-h-0 overflow-y-auto"><ScenePanel bk={bk} scene={scene} chapter={chapter} onShowVersions={onShowVersions} /></Tabs.Content>
      <Tabs.Content value="people" className="flex-1 min-h-0 overflow-y-auto"><PeoplePanel bk={bk} /></Tabs.Content>
    </Tabs.Root>
  )
}

function ScenePanel({ bk, scene, chapter, onShowVersions }) {
  if (!scene) return <p className="p-4 text-sm text-muted">בחרו סצנה.</p>
  const set = (patch, delay = 700) => bk.update('scenes', scene.id, patch, { delay })
  const ctx = { scenes: bk.scenes, eras: bk.eras, characters: bk.characters }
  const range = resolveTime(scene, ctx)
  const inScene = bk.characters.filter((c) => (scene.character_ids || []).includes(c.id))
  return (
    <div className="p-4 flex flex-col gap-4" key={scene.id}>
      <div className="text-xs text-muted">{chapterLabel(chapter)}</div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">שם הסצנה</span>
        <input className={inputClass} defaultValue={scene.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="למשל: השיחה במטבח" data-testid="scene-title" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">מה קורה כאן</span>
        <textarea className={cn(inputClass, 'h-auto py-2 leading-6')} rows={3} defaultValue={scene.summary || ''} onChange={(e) => set({ summary: e.target.value })} placeholder="תקציר קצר. מופיע גם בלוח הכרטיסים." />
      </label>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">סטטוס</span>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(SCENE_STATUS).map(([k, v]) => (
            <button key={k} onClick={() => set({ status: k }, 200)} className={cn('h-8 px-3 rounded-full border text-sm flex items-center gap-1.5', scene.status === k ? 'border-accent text-accent bg-accent-soft' : 'border-line')} aria-pressed={scene.status === k}>
              <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />{v.label}
            </button>
          ))}
        </div>
      </div>
      <StoryTimeEditor bk={bk} scene={scene} onChange={(story_time) => set({ story_time }, 300)} />
      {inScene.length > 0 && range && (
        <div className="text-sm">
          <div className="text-muted mb-1">גילים בסצנה</div>
          {inScene.map((c) => { const a = ageAt(c, range); return a ? <div key={c.id}>{c.name}: {a}</div> : null })}
        </div>
      )}
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">דמויות ומקומות בסצנה</span>
        <div className="flex flex-wrap gap-1.5">
          {bk.characters.map((c) => {
            const on = (scene.character_ids || []).includes(c.id)
            return (
              <button key={c.id} onClick={() => set({ character_ids: on ? scene.character_ids.filter((x) => x !== c.id) : [...(scene.character_ids || []), c.id] }, 200)} className={cn('h-8 px-3 rounded-full border text-sm', on ? 'border-accent text-accent bg-accent-soft' : 'border-line text-muted')} aria-pressed={on}>{c.name}</button>
            )
          })}
          {bk.characters.length === 0 && <span className="text-xs text-muted">מוסיפים בלשונית "דמויות ומקומות".</span>}
        </div>
      </div>
      <TagsEditor tags={scene.tags || []} onChange={(tags) => set({ tags }, 300)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!scene.unused} onChange={(e) => set({ unused: e.target.checked }, 200)} />
        לא בשימוש (נשארת, אבל לא נספרת ולא מיוצאת)
      </label>
      <Button variant="default" onClick={onShowVersions}><History size={16} />גרסאות קודמות</Button>
    </div>
  )
}

function TagsEditor({ tags, onChange }) {
  const [v, setV] = useState('')
  const add = () => { const t = v.trim(); if (t && !tags.includes(t)) onChange([...tags, t]); setV('') }
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">תגיות ונושאים</span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="h-7 px-2.5 rounded-full bg-sunk flex items-center gap-1">#{t}<button aria-label={`הסר ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}><X size={12} /></button></span>
        ))}
      </div>
      <input className={inputClass} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="תגית ואנטר, למשל: אובדן" />
    </div>
  )
}

const TIME_TYPES = [['unknown', 'לא ידוע'], ['exact', 'תאריך'], ['range', 'משוער'], ['era', 'תקופה'], ['relative', 'יחסי']]

export function StoryTimeEditor({ bk, scene, onChange }) {
  const st = scene.story_time || { type: 'unknown' }
  const ctx = { scenes: bk.scenes, eras: bk.eras, characters: bk.characters }
  const [fuzzy, setFuzzy] = useState(st.label || '')
  const set = (patch) => onChange({ ...st, ...patch })
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="story-time">
      <span className="text-muted">מתי זה קרה</span>
      <div className="flex flex-wrap gap-1">
        {TIME_TYPES.map(([k, l]) => (
          <button key={k} onClick={() => onChange({ type: k })} className={cn('h-8 px-2.5 rounded-lg border text-sm', st.type === k ? 'border-accent text-accent bg-accent-soft' : 'border-line')} aria-pressed={st.type === k}>{l}</button>
        ))}
      </div>
      {st.type === 'exact' && (
        <input className={inputClass} placeholder="2016, 2016-03 או 2016-03-14" defaultValue={st.start || ''} onChange={(e) => set({ start: e.target.value.trim() })} aria-label="תאריך" />
      )}
      {st.type === 'range' && (
        <>
          <input className={inputClass} placeholder='למשל: קיץ 2015, תחילת שנות התשעים, בערך 2012' value={fuzzy} onChange={(e) => {
            setFuzzy(e.target.value)
            const p = parseFuzzy(e.target.value)
            set({ label: e.target.value, ...(p || {}) })
          }} aria-label="זמן משוער" />
          <div className="flex gap-2">
            <input className={cn(inputClass, 'flex-1 min-w-0')} placeholder="מ־" value={st.start || ''} onChange={(e) => set({ start: e.target.value })} aria-label="מתאריך" />
            <input className={cn(inputClass, 'flex-1 min-w-0')} placeholder="עד" value={st.end || ''} onChange={(e) => set({ end: e.target.value })} aria-label="עד תאריך" />
          </div>
        </>
      )}
      {st.type === 'era' && (
        <Select value={st.era_id || ''} onChange={(v) => set({ era_id: v })} aria-label="תקופה" placeholder="בחרו תקופה" className="w-full"
          options={bk.eras.map((e) => ({ value: e.id, label: e.name }))} />
      )}
      {st.type === 'relative' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <input type="number" className={cn(inputClass, 'w-24')} value={Math.abs(st.offset_days || 0)} onChange={(e) => set({ offset_days: Math.sign(st.offset_days || 1) * Math.abs(+e.target.value || 0) })} aria-label="מספר ימים" />
            <span>ימים</span>
            <Select value={(st.offset_days || 0) < 0 ? 'before' : 'after'} onChange={(v) => set({ offset_days: (v === 'before' ? -1 : 1) * Math.abs(st.offset_days || 0) })} aria-label="לפני או אחרי"
              options={[{ value: 'after', label: 'אחרי' }, { value: 'before', label: 'לפני' }]} />
          </div>
          <Select value={st.anchor_scene_id || ''} onChange={(v) => set({ anchor_scene_id: v })} aria-label="סצנה" placeholder="בחרו סצנה" className="w-full"
            options={bk.flatChapters.flatMap((c) => c.scenes.filter((s) => s.id !== scene.id).map((s) => ({ value: s.id, label: s.title || 'סצנה', group: chapterLabel(c) })))} />
        </div>
      )}
      <div className="text-xs text-muted">{formatTime(scene, ctx)}</div>
    </div>
  )
}

function PeoplePanel({ bk }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState('character')
  const add = async () => { const n = name.trim(); if (!n) return; setName(''); await bk.createRecord('characters', { name: n, kind }) }
  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex gap-2">
        <Select value={kind} onChange={setKind} aria-label="סוג" className="shrink-0"
          options={[{ value: 'character', label: 'דמות' }, { value: 'place', label: 'מקום' }]} />
        <input className={cn(inputClass, 'flex-1 min-w-0')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="שם" />
        <IconButton label="הוסף" onClick={add}><Plus size={18} /></IconButton>
      </div>
      {bk.characters.length === 0 && <p className="text-sm text-muted text-center p-3">עוד אין דמויות או מקומות.</p>}
      {['character', 'place'].map((k) => {
        const list = bk.characters.filter((c) => (c.kind || 'character') === k)
        if (!list.length) return null
        return (
          <div key={k}>
            <div className="text-xs text-muted mb-1">{k === 'character' ? 'דמויות' : 'מקומות'}</div>
            {list.map((c) => (
              <details key={c.id} className="rounded-xl border border-line mb-1.5">
                <summary className="hit px-3 flex items-center cursor-pointer">{c.name}</summary>
                <div className="px-3 pb-3 flex flex-col gap-2">
                  <input className={inputClass} defaultValue={c.name} onChange={(e) => bk.update('characters', c.id, { name: e.target.value })} aria-label="שם" />
                  {k === 'character' && (
                    <div className="flex gap-2">
                      <input className={cn(inputClass, 'flex-1 min-w-0')} defaultValue={c.birth_date || ''} placeholder="נולד/ה (למשל 1984)" onChange={(e) => bk.update('characters', c.id, { birth_date: e.target.value.trim() })} aria-label="תאריך לידה" />
                      <input className={cn(inputClass, 'flex-1 min-w-0')} defaultValue={c.death_date || ''} placeholder="נפטר/ה" onChange={(e) => bk.update('characters', c.id, { death_date: e.target.value.trim() })} aria-label="תאריך פטירה" />
                    </div>
                  )}
                  <textarea className={cn(inputClass, 'h-auto py-2')} rows={4} defaultValue={c.description || ''} placeholder="תיאור, רקע, הערות" onChange={(e) => bk.update('characters', c.id, { description: e.target.value })} aria-label="תיאור" />
                  <Button size="sm" variant="danger" onClick={() => bk.removeRecord('characters', c.id)}><Trash2 size={14} />מחק</Button>
                </div>
              </details>
            ))}
          </div>
        )
      })}
    </div>
  )
}
