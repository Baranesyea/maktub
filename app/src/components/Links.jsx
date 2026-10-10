// Linking an idea, a picture or a research note to the book: a chapter or a scene, and characters.
import { Check, UserRound, X } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Select } from '@/components/ui'
import { chapterLabel } from '@/hooks/useBook'
import { cn } from '@/lib/utils'

export function LinkPicker({ bk, value, onChange, testid = 'link-select', size = 'sm', className }) {
  return (
    <Select size={size} value={value} onChange={onChange} aria-label="קישור לפרק או לסצנה" data-testid={testid} className={cn('w-full', className)}
      options={[{ value: '', label: 'בלי קישור לפרק' }, ...bk.flatChapters.flatMap((c) => [
        { value: `c:${c.id}`, label: `${chapterLabel(c)} (כל הפרק)`, group: chapterLabel(c) },
        ...(c.scenes.length > 1 ? c.scenes.map((s, i) => ({ value: `s:${s.id}`, label: s.title || `סצנה ${i + 1}`, group: chapterLabel(c) })) : []),
      ])]} />
  )
}

export const toLink = (v) => v.startsWith('c:') ? { link_chapter_id: v.slice(2), link_scene_id: '' } : v.startsWith('s:') ? { link_chapter_id: '', link_scene_id: v.slice(2) } : { link_chapter_id: '', link_scene_id: '' }
export const fromLink = (r) => (r?.link_scene_id ? `s:${r.link_scene_id}` : r?.link_chapter_id ? `c:${r.link_chapter_id}` : '')

/** Does this item belong with the scene or chapter on screen? */
export function linkedTo(r, { sceneId, chapterId, characterIds = [] }) {
  if (sceneId && r.link_scene_id === sceneId) return true
  if (chapterId && r.link_chapter_id === chapterId) return true
  return (r.character_ids || []).some((id) => characterIds.includes(id))
}

/** Characters (and places) as chips, with a menu to add or remove. */
export function CharacterPicker({ bk, value = [], onChange, testid = 'character-picker' }) {
  const people = bk.characters || []
  const chosen = people.filter((c) => value.includes(c.id))
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chosen.map((c) => (
        <span key={c.id} className="h-7 ps-2.5 pe-1 rounded-full bg-sunk inline-flex items-center gap-1 text-sm">
          {c.name}
          <button className="w-5 h-5 rounded-full hover:bg-raised inline-flex items-center justify-center" aria-label={`הסר את ${c.name}`} onClick={() => toggle(c.id)}><X size={12} /></button>
        </span>
      ))}
      {people.length > 0 ? (
        <DropdownMenu.Root dir="rtl" modal={false}>
          <DropdownMenu.Trigger asChild>
            <button className="h-7 px-2.5 rounded-full border border-dashed border-line-strong text-sm text-muted hover:text-fg inline-flex items-center gap-1" data-testid={testid}><UserRound size={13} />דמויות ומקומות</button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={4} collisionPadding={8} dir="rtl" className="z-[60] min-w-[200px] max-h-[min(320px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow)] text-[15px]">
              {people.map((c) => (
                <DropdownMenu.Item key={c.id} onSelect={(e) => { e.preventDefault(); toggle(c.id) }} data-testid={`${testid}-option-${c.id}`}
                  className="flex items-center gap-2 rounded-lg px-2.5 min-h-[36px] cursor-pointer outline-none data-[highlighted]:bg-sunk">
                  <span className="w-4 shrink-0">{value.includes(c.id) && <Check size={14} />}</span>
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-muted">{c.kind === 'place' ? 'מקום' : 'דמות'}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : <span className="text-xs text-muted">אפשר לקשר לדמויות אחרי שמוסיפים אותן בחלונית הצד.</span>}
    </div>
  )
}
