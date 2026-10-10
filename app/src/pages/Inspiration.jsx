// Inspiration: pictures that help the writing (places, faces, moods). They are not part of the book.
// A gallery of pictures, a free board, and a page for every picture with room to write under it.
import { useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ImagePlus, LayoutGrid, Columns3, ChevronRight, ChevronLeft, Trash2, Link2, Upload } from 'lucide-react'
import { useBook, chapterLabel } from '@/hooks/useBook'
import { Page, Loading } from '@/components/AppShell'
import { Button, IconButton } from '@/components/ui'
import { PrivateImage, useAddPictures, useDropPictures } from '@/components/InspirationBits'
import InspirationBoard from '@/components/InspirationBoard'
import NoteEditor from '@/components/editor/NoteEditor'
import { LinkPicker, CharacterPicker, toLink, fromLink } from '@/components/Links'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0)

export function linkLabel(bk, r) {
  if (r.link_scene_id) {
    const c = bk.flatChapters.find((ch) => ch.scenes.some((s) => s.id === r.link_scene_id))
    const s = c?.scenes.find((x) => x.id === r.link_scene_id)
    return c ? `${chapterLabel(c)}${s?.title ? ` · ${s.title}` : ''}` : ''
  }
  if (r.link_chapter_id) return chapterLabel(bk.flatChapters.find((c) => c.id === r.link_chapter_id))
  return ''
}

function AddButton({ onFiles, label = 'הוספת תמונות', variant = 'primary' }) {
  const input = useRef(null)
  return (
    <>
      <Button variant={variant} onClick={() => input.current?.click()} data-testid="add-pictures"><ImagePlus size={16} />{label}</Button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} data-testid="add-pictures-input" />
    </>
  )
}

export default function InspirationPage() {
  const { bookId, itemId } = useParams()
  const bk = useBook(bookId)
  if (bk.loading || !bk.book) return <Loading />
  return itemId ? <PicturePage bk={bk} itemId={itemId} /> : <Gallery bk={bk} />
}

function Gallery({ bk }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'board' ? 'board' : 'gallery'
  const [add, busy] = useAddPictures(bk)
  const [drop, over] = useDropPictures(add)
  const pictures = useMemo(() => bk.inspirations.filter((r) => !r.deleted && r.kind === 'image').sort(byOrder), [bk.inspirations])
  const open = (it) => navigate(`/book/${bk.book.id}/inspiration/${it.id}`)

  return (
    <Page
      title="השראה"
      subtitle="תמונות שעוזרות לכתוב: מקומות, פנים, אווירה. הן לא חלק מהספר."
      eyebrow={bk.book.title}
      width={view === 'board' ? 'max-w-none' : undefined}
      testid="inspiration"
      actions={
        <>
          <div className="inline-flex rounded-lg bg-sunk p-0.5" role="group" aria-label="תצוגה">
            <button className={cn('h-8 px-2.5 rounded-md text-sm inline-flex items-center gap-1', view === 'gallery' ? 'bg-surface shadow-sm' : 'text-muted')} onClick={() => setParams({})} data-testid="view-gallery"><LayoutGrid size={15} />גלריה</button>
            <button className={cn('h-8 px-2.5 rounded-md text-sm inline-flex items-center gap-1', view === 'board' ? 'bg-surface shadow-sm' : 'text-muted')} onClick={() => setParams({ view: 'board' })} data-testid="view-board-inspiration"><Columns3 size={15} />לוח</button>
          </div>
          <AddButton onFiles={add} />
        </>
      }
    >
      <div {...drop} className={cn('relative flex flex-col gap-4', view === 'board' && 'h-[calc(100vh-190px)]')}>
        {busy > 0 && <div className="text-sm text-muted" data-testid="uploading">מעלה {busy === 1 ? 'תמונה אחת' : `${busy} תמונות`}…</div>}
        {view === 'board' ? (
          <InspirationBoard bk={bk} onOpen={open} />
        ) : pictures.length ? (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 [column-fill:_balance]" data-testid="gallery">
            {pictures.map((it) => (
              <Link key={it.id} to={`/book/${bk.book.id}/inspiration/${it.id}`} className="block mb-4 break-inside-avoid rounded-xl overflow-hidden border border-line bg-surface hover:shadow-[var(--shadow)] transition-shadow" data-testid={`picture-${it.id}`}>
                <PrivateImage uri={it.thumb_uri} width={it.width} height={it.height} alt={it.title} className="w-full" />
                {(it.title || linkLabel(bk, it) || it.content) && (
                  <div className="px-3 py-2">
                    {it.title && <div className="text-sm truncate">{it.title}</div>}
                    {linkLabel(bk, it) && <div className="text-xs text-muted truncate inline-flex items-center gap-1"><Link2 size={11} />{linkLabel(bk, it)}</div>}
                  </div>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-line-strong p-10 sm:p-16 text-center flex flex-col items-center gap-3" data-testid="gallery-empty">
            <ImagePlus size={30} className="text-muted" />
            <div className="text-lg">עוד אין כאן תמונות</div>
            <p className="text-sm text-muted max-w-md">גוררים לכאן תמונות, מדביקים אותן, או בוחרים מהמחשב. לכל תמונה יש עמוד משלה עם מקום לכתוב מה היא מעוררת ולמה היא חשובה לסיפור.</p>
            <AddButton onFiles={add} label="בחירת תמונות" />
          </div>
        )}
        {over && (
          <div className="absolute inset-0 z-20 rounded-2xl border-2 border-dashed border-fg bg-surface/85 flex items-center justify-center text-lg pointer-events-none"><Upload size={20} className="ms-2" />שחררו כדי להוסיף</div>
        )}
      </div>
    </Page>
  )
}

/** A picture's own page: the picture on top, and room to write underneath. */
export function PictureDetail({ bk, item, compact = false, onDeleted }) {
  return (
    <div className={cn('flex flex-col', compact ? 'gap-3' : 'gap-5')}>
      <div className={cn('rounded-xl overflow-hidden bg-sunk flex items-center justify-center', compact ? '' : 'border border-line')}>
        <PrivateImage uri={compact ? item.thumb_uri : item.file_uri} width={item.width} height={item.height} alt={item.title} fit="contain"
          className={cn('w-full', compact ? 'max-h-[260px]' : 'max-h-[62vh]')} data-testid="picture-hero" />
      </div>
      <input
        className={cn('w-full bg-transparent outline-none font-black placeholder:text-faint', compact ? 'text-lg' : 'text-2xl sm:text-[28px]')}
        defaultValue={item.title || ''}
        key={`t-${item.id}`}
        placeholder="שם לתמונה"
        onChange={(e) => bk.update('inspirations', item.id, { title: e.target.value })}
        aria-label="שם התמונה"
        data-testid="picture-title"
      />
      <div className="flex flex-col gap-2">
        <LinkPicker bk={bk} value={fromLink(item)} onChange={(v) => bk.update('inspirations', item.id, toLink(v))} testid="picture-link" className="max-w-sm" />
        <CharacterPicker bk={bk} value={item.character_ids || []} onChange={(ids) => bk.update('inspirations', item.id, { character_ids: ids })} testid="picture-people" />
      </div>
      <NoteEditor key={item.id} value={item.content} onChange={(html) => bk.update('inspirations', item.id, { content: html })} compact={compact} testid="picture-notes" />
      {onDeleted && (
        <div>
          <Button variant="ghost" size="sm" className="text-muted" onClick={() => { bk.update('inspirations', item.id, { deleted: true }, { delay: 200 }); onDeleted(); toast('התמונה נמחקה', { action: { label: 'בטל', run: () => bk.update('inspirations', item.id, { deleted: false }, { delay: 100 }) } }) }} data-testid="picture-delete"><Trash2 size={15} />מחיקת התמונה</Button>
        </div>
      )}
    </div>
  )
}

function PicturePage({ bk, itemId }) {
  const navigate = useNavigate()
  const pictures = bk.inspirations.filter((r) => !r.deleted && r.kind === 'image').sort(byOrder)
  const i = pictures.findIndex((r) => r.id === itemId)
  const item = pictures[i]
  const base = `/book/${bk.book.id}/inspiration`
  const prev = pictures[i - 1], next = pictures[i + 1]
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return
      if (e.key === 'ArrowRight' && prev) navigate(`${base}/${prev.id}`)
      if (e.key === 'ArrowLeft' && next) navigate(`${base}/${next.id}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!item) return (
    <Page title="השראה" testid="picture-page">
      <p className="text-muted">התמונה לא נמצאה. <Link className="underline" to={base}>לכל התמונות</Link></p>
    </Page>
  )
  return (
    <Page
      title={<Link to={base} className="inline-flex items-center gap-1 hover:underline" data-testid="back-to-gallery"><ChevronRight size={22} />השראה</Link>}
      eyebrow={bk.book.title}
      width="max-w-[880px]"
      testid="picture-page"
      actions={
        <div className="flex items-center gap-1 text-sm text-muted">
          <IconButton label="התמונה הקודמת" disabled={!prev} onClick={() => navigate(`${base}/${prev.id}`)} data-testid="picture-prev"><ChevronRight size={18} /></IconButton>
          <span className="tabular-nums">{i + 1} / {pictures.length}</span>
          <IconButton label="התמונה הבאה" disabled={!next} onClick={() => navigate(`${base}/${next.id}`)} data-testid="picture-next"><ChevronLeft size={18} /></IconButton>
        </div>
      }
    >
      <PictureDetail key={item.id} bk={bk} item={item} onDeleted={() => navigate(next ? `${base}/${next.id}` : prev ? `${base}/${prev.id}` : base)} />
    </Page>
  )
}
