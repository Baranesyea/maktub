// "Aids" in the side panel: pictures and research next to the text while writing.
// What is linked to the scene, chapter or characters on screen comes first.
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ImagePlus, Plus, Maximize2, BookMarked } from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import { PrivateImage, useAddPictures } from '@/components/InspirationBits'
import { PictureDetail } from '@/pages/Inspiration'
import { ResearchDetail } from '@/pages/Research'
import { linkedTo } from '@/components/Links'
import { htmlToText } from '@/lib/text'
import { cn } from '@/lib/utils'

export default function AidsPanel({ bk, scene, chapter }) {
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null) // { kind: 'picture' | 'research', id }
  const [add, busy] = useAddPictures(bk)
  const input = useRef(null)
  const ctx = { sceneId: scene?.id, chapterId: chapter?.id, characterIds: scene?.character_ids || [] }
  const pictures = useMemo(() => bk.inspirations.filter((r) => !r.deleted && r.kind === 'image'), [bk.inspirations])
  const research = useMemo(() => bk.research.filter((r) => !r.deleted), [bk.research])
  const near = { pictures: pictures.filter((r) => linkedTo(r, ctx)), research: research.filter((r) => linkedTo(r, ctx)) }
  const rest = { pictures: pictures.filter((r) => !linkedTo(r, ctx)), research: research.filter((r) => !linkedTo(r, ctx)) }
  const base = `/book/${bk.book?.id}`
  const linkHere = scene ? { link_scene_id: scene.id, link_chapter_id: '' } : chapter ? { link_chapter_id: chapter.id, link_scene_id: '' } : {}

  if (open) {
    const item = open.kind === 'picture' ? pictures.find((r) => r.id === open.id) : research.find((r) => r.id === open.id)
    if (item) {
      return (
        <div className="h-full overflow-y-auto p-3 flex flex-col gap-2" data-testid="aid-open">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(null)} data-testid="aid-back"><ChevronRight size={15} />חזרה</Button>
            <div className="flex-1" />
            <Link to={open.kind === 'picture' ? `${base}/inspiration/${item.id}` : `${base}/research/${item.id}`} className="hit inline-flex items-center gap-1 rounded-lg px-2 text-sm text-muted hover:bg-sunk"><Maximize2 size={14} />עמוד מלא</Link>
          </div>
          {open.kind === 'picture' ? <PictureDetail bk={bk} item={item} compact /> : <ResearchDetail bk={bk} note={item} compact />}
        </div>
      )
    }
  }

  const show = (k) => filter === 'all' || filter === k
  const section = (title, list) => (
    (show('pictures') && list.pictures.length) || (show('research') && list.research.length) ? (
      <div className="flex flex-col gap-2">
        <div className="text-xs text-muted">{title}</div>
        {show('pictures') && list.pictures.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {list.pictures.map((r) => (
              <button key={r.id} className="text-start rounded-lg overflow-hidden border border-line bg-surface hover:shadow-[var(--shadow-sm)]" onClick={() => setOpen({ kind: 'picture', id: r.id })} data-testid={`aid-picture-${r.id}`}>
                <PrivateImage uri={r.thumb_uri} width={r.width} height={r.height} alt={r.title} className="w-full max-h-40" />
                {r.title && <div className="px-2 py-1 text-xs truncate">{r.title}</div>}
              </button>
            ))}
          </div>
        )}
        {show('research') && list.research.length > 0 && (
          <div className="flex flex-col rounded-lg border border-line divide-y divide-line overflow-hidden">
            {list.research.map((r) => (
              <button key={r.id} className="text-start px-3 py-2 hover:bg-sunk flex flex-col" onClick={() => setOpen({ kind: 'research', id: r.id })} data-testid={`aid-research-${r.id}`}>
                <span className="text-sm truncate inline-flex items-center gap-1.5"><BookMarked size={13} className="text-muted shrink-0" />{r.title || 'בלי שם'}</span>
                <span className="text-xs text-muted truncate">{htmlToText(r.content || '').slice(0, 80)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    ) : null
  )

  const empty = !pictures.length && !research.length
  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-4" data-testid="aids">
      <div className="flex items-center gap-1">
        <div className="inline-flex rounded-lg bg-sunk p-0.5 text-sm" role="group" aria-label="סינון">
          {[['all', 'הכול'], ['pictures', 'תמונות'], ['research', 'מחקר']].map(([k, l]) => (
            <button key={k} className={cn('h-7 px-2.5 rounded-md', filter === k ? 'bg-surface shadow-sm' : 'text-muted')} onClick={() => setFilter(k)} data-testid={`aids-filter-${k}`}>{l}</button>
          ))}
        </div>
        <div className="flex-1" />
        <IconButton label="תמונה לסצנה הזו" onClick={() => input.current?.click()} data-testid="aids-add-picture"><ImagePlus size={17} /></IconButton>
        <IconButton label="פתק מחקר לסצנה הזו" onClick={async () => { const r = await bk.createRecord('research', { title: '', content: '', tags: [], character_ids: [], order: 0, deleted: false, ...linkHere }); setOpen({ kind: 'research', id: r.id }) }} data-testid="aids-add-research"><Plus size={17} /></IconButton>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={async (e) => { const made = await add(e.target.files, linkHere); e.target.value = ''; if (made.length === 1) setOpen({ kind: 'picture', id: made[0].id }) }} data-testid="aids-picture-input" />
      </div>
      {busy > 0 && <div className="text-xs text-muted">מעלה…</div>}
      {section(scene ? 'קשור לסצנה, לפרק או לדמויות שלה' : 'קשור לפרק', near)}
      {section('כל השאר', rest)}
      {empty && (
        <div className="text-sm text-muted leading-6">
          כאן יופיעו תמונות ופתקי מחקר, ליד הטקסט. מה שמקושר לסצנה הזו יופיע ראשון.
          <div className="flex flex-col gap-1 mt-3">
            <Link to={`${base}/inspiration`} className="underline">לגלריית ההשראה</Link>
            <Link to={`${base}/research`} className="underline">לאזור המחקר</Link>
          </div>
        </div>
      )}
    </div>
  )
}
