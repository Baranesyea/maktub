// Research: notes about everything the book needs to get right. Facts, places, periods,
// interviews, sources. Each note has a title, tags, links to the book, and free text.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Search, X, Trash2, ChevronRight, Link2, BookMarked } from 'lucide-react'
import { useBook } from '@/hooks/useBook'
import { Page, Loading } from '@/components/AppShell'
import { Button, inputClass } from '@/components/ui'
import NoteEditor from '@/components/editor/NoteEditor'
import Attachments from '@/components/Attachments'
import { LinkPicker, CharacterPicker, toLink, fromLink } from '@/components/Links'
import { linkLabel } from '@/pages/Inspiration'
import { htmlToText } from '@/lib/text'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const recent = (a, b) => (b.updated_date || b.created_date || '').localeCompare(a.updated_date || a.created_date || '')

export function TagInput({ value = [], onChange }) {
  const [draft, setDraft] = useState('')
  const add = () => { const t = draft.trim().replace(/^#/, ''); if (t && !value.includes(t)) onChange([...value, t]); setDraft('') }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((t) => (
        <span key={t} className="h-7 ps-2.5 pe-1 rounded-full bg-sunk inline-flex items-center gap-1 text-sm">
          #{t}
          <button className="w-5 h-5 rounded-full hover:bg-raised inline-flex items-center justify-center" aria-label={`הסר את התגית ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X size={12} /></button>
        </span>
      ))}
      <input className="h-7 min-w-[7rem] flex-1 bg-transparent outline-none text-sm placeholder:text-faint" value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }} onBlur={add} placeholder="תגית ואנטר" aria-label="תגית חדשה" data-testid="research-tag-input" />
    </div>
  )
}

/** One research note, editable. Used on the research page and in the side panel while writing. */
export function ResearchDetail({ bk, note, compact = false, onDeleted }) {
  return (
    <div className={cn('flex flex-col', compact ? 'gap-3' : 'gap-4')}>
      <input
        className={cn('title-field w-full', compact ? 'text-base' : 'text-xl')}
        defaultValue={note.title || ''}
        key={`t-${note.id}`}
        placeholder="על מה המחקר?"
        onChange={(e) => bk.update('research', note.id, { title: e.target.value })}
        aria-label="נושא"
        data-testid="research-title"
        autoFocus={!compact && !note.title}
      />
      <TagInput value={note.tags || []} onChange={(tags) => bk.update('research', note.id, { tags })} />
      <div className="flex flex-col gap-2">
        <LinkPicker bk={bk} value={fromLink(note)} onChange={(v) => bk.update('research', note.id, toLink(v))} testid="research-link" className="max-w-sm" />
        <CharacterPicker bk={bk} value={note.character_ids || []} onChange={(ids) => bk.update('research', note.id, { character_ids: ids })} testid="research-people" />
      </div>
      <Attachments value={note.attachments || []} onChange={(list) => bk.update('research', note.id, { attachments: list }, { delay: 100 })} compact={compact} testid="research-files" />
      <NoteEditor key={note.id} value={note.content} onChange={(html) => bk.update('research', note.id, { content: html })} compact={compact}
        placeholder="מה גילית? עובדות, ציטוטים, מקורות וקישורים." testid="research-notes" />
      {onDeleted && (
        <div>
          <Button variant="ghost" size="sm" className="text-muted" onClick={() => { bk.update('research', note.id, { deleted: true }, { delay: 200 }); onDeleted(); toast('פתק המחקר נמחק', { action: { label: 'בטל', run: () => bk.update('research', note.id, { deleted: false }, { delay: 100 }) } }) }} data-testid="research-delete"><Trash2 size={15} />מחיקה</Button>
        </div>
      )}
    </div>
  )
}

export default function ResearchPage() {
  const { bookId, noteId } = useParams()
  const navigate = useNavigate()
  const bk = useBook(bookId)
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const notes = useMemo(() => bk.research.filter((r) => !r.deleted).sort(recent), [bk.research])
  const tags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags || []))].sort((a, b) => a.localeCompare(b, 'he')), [notes])
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return notes.filter((n) => (!tag || (n.tags || []).includes(tag)) && words.every((w) => `${n.title} ${(n.tags || []).join(' ')} ${htmlToText(n.content || '')}`.toLowerCase().includes(w)))
  }, [notes, q, tag])
  if (bk.loading || !bk.book) return <Loading />
  const base = `/book/${bookId}/research`
  const current = notes.find((n) => n.id === noteId)
  const create = async () => {
    const r = await bk.createRecord('research', { title: '', content: '', tags: tag ? [tag] : [], character_ids: [], order: 0, deleted: false })
    navigate(`${base}/${r.id}`)
  }

  return (
    <Page
      title="מחקר"
      subtitle="כל מה שהספר צריך לדעת: עובדות, מקומות, תקופות, ראיונות ומקורות."
      eyebrow={bk.book.title}
      testid="research"
      actions={<Button variant="primary" onClick={create} data-testid="research-new"><Plus size={16} />פתק מחקר חדש</Button>}
    >
      <div className="grid md:grid-cols-[300px_1fr] gap-6 items-start">
        <aside className={cn('flex flex-col gap-3', current && 'hidden md:flex')}>
          <label className="relative">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted" />
            <input className={cn(inputClass, 'w-full pr-9 bg-surface')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש במחקר" aria-label="חיפוש במחקר" data-testid="research-search" />
          </label>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => <button key={t} className={cn('h-7 px-2.5 rounded-full text-sm border', tag === t ? 'bg-fg text-bg border-fg' : 'border-line text-muted hover:text-fg')} onClick={() => setTag(tag === t ? '' : t)} data-testid={`research-tag-${t}`}>#{t}</button>)}
            </div>
          )}
          <div className="flex flex-col rounded-xl border border-line bg-surface overflow-hidden divide-y divide-line" data-testid="research-list">
            {shown.map((n) => (
              <Link key={n.id} to={`${base}/${n.id}`} className={cn('px-3 py-2.5 flex flex-col gap-0.5 hover:bg-sunk', n.id === noteId && 'bg-sunk')} data-testid={`research-item-${n.id}`}>
                <span className="truncate">{n.title || 'בלי שם'}</span>
                <span className="text-xs text-muted truncate">{htmlToText(n.content || '').slice(0, 90) || (n.tags || []).map((t) => `#${t}`).join(' ')}</span>
                {linkLabel(bk, n) && <span className="text-xs text-muted inline-flex items-center gap-1 truncate"><Link2 size={11} />{linkLabel(bk, n)}</span>}
              </Link>
            ))}
            {!shown.length && <div className="px-3 py-6 text-sm text-muted text-center">{notes.length ? 'אין תוצאות.' : 'עוד אין פתקי מחקר.'}</div>}
          </div>
        </aside>
        <section className={cn('min-w-0', !current && 'hidden md:block')}>
          {current ? (
            <div className="rounded-xl border border-line bg-surface p-5 sm:p-7" data-testid="research-detail">
              <Link to={base} className="md:hidden inline-flex items-center gap-1 text-sm text-muted mb-3"><ChevronRight size={16} />לכל המחקר</Link>
              <ResearchDetail bk={bk} note={current} onDeleted={() => navigate(base)} />
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-line-strong p-10 text-center flex flex-col items-center gap-3 text-muted">
              <BookMarked size={28} />
              <p className="max-w-sm">בוחרים פתק מהרשימה, או פותחים חדש. אפשר לקשר כל פתק לפרק, לסצנה או לדמות, והוא יופיע בחלונית הצד כשכותבים אותם.</p>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
