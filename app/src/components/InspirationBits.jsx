// Shared pieces for pictures: showing a private image, and adding pictures to a book.
import { useCallback, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { prepareImage, uploadPrivate, useMediaUrl, imagesIn } from '@/lib/media'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

/** A private picture. Keeps its shape while the link loads, so the gallery does not jump. */
export function PrivateImage({ uri, width, height, alt = '', className, fit = 'cover', style, ...rest }) {
  const url = useMediaUrl(uri)
  const ratio = width && height ? `${width} / ${height}` : undefined
  return url
    ? <img src={url} alt={alt} draggable={false} className={cn('block', fit === 'cover' ? 'object-cover' : 'object-contain', className)} style={{ aspectRatio: ratio, ...style }} {...rest} />
    : <div className={cn('bg-sunk flex items-center justify-center text-faint', className)} style={{ aspectRatio: ratio || '4 / 3', ...style }} {...rest}><ImageIcon size={22} /></div>
}

const titleFrom = (name = '') => name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 80)

/** Upload pictures into the book's inspiration. Returns [add(files), uploadingCount]. */
export function useAddPictures(bk) {
  const [busy, setBusy] = useState(0)
  const add = useCallback(async (files, extra = {}) => {
    const list = [...files].filter((f) => f.type?.startsWith('image/'))
    if (!list.length) return []
    setBusy((n) => n + list.length)
    const made = []
    let order = Math.max(-1, ...bk.inspirations.map((r) => r.order ?? 0)) + 1
    for (const f of list) {
      try {
        const img = await prepareImage(f)
        const [file_uri, thumb_uri] = await Promise.all([uploadPrivate(img.full), uploadPrivate(img.thumb, 'thumb.webp')])
        made.push(await bk.createRecord('inspirations', {
          kind: 'image', title: titleFrom(f.name), file_uri, thumb_uri, width: img.width, height: img.height,
          content: '', order: order++, deleted: false, character_ids: [], ...extra,
        }))
      } catch (e) {
        console.error(e)
        toast(`לא הצלחנו להעלות את ${f.name || 'התמונה'}. נסו שוב.`)
      }
      setBusy((n) => n - 1)
    }
    return made
  }, [bk])
  return [add, busy]
}

/** Drop or paste pictures anywhere on a page. */
export function useDropPictures(onFiles) {
  const [over, setOver] = useState(false)
  const handlers = {
    onDragOver: (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); setOver(true) } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false) },
    onDrop: (e) => { const files = imagesIn(e.dataTransfer); setOver(false); if (files.length) { e.preventDefault(); onFiles(files) } },
    onPaste: (e) => { const files = imagesIn(e.clipboardData); if (files.length) { e.preventDefault(); onFiles(files) } },
  }
  return [handlers, over]
}
