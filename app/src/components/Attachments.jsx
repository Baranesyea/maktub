// Files and pictures attached to a research topic: PDFs, documents, scans, photos.
// Kept as private files; pictures show as thumbnails, other files as a list. Opening a file
// asks for a fresh private link and shows it in a new tab.
import { useRef, useState } from 'react'
import { Paperclip, FileText, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { PrivateImage } from '@/components/InspirationBits'
import { prepareImage, uploadPrivate, mediaUrl, imagesIn } from '@/lib/media'
import { toast } from '@/lib/toast'
import { uid } from '@/lib/utils'

const MAX_MB = 25
const size = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} מ״ב` : `${Math.max(1, Math.round(b / 1024))} ק״ב`)

async function open(uri) {
  const w = window.open('', '_blank') // opened right away so the browser does not block it
  try {
    const url = await mediaUrl(uri)
    if (w && url) w.location.href = url
  } catch { w?.close(); toast('לא הצלחנו לפתוח את הקובץ') }
}

export default function Attachments({ value = [], onChange, compact = false, testid = 'attachments' }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(0)
  const list = value || []
  const add = async (files) => {
    const picked = [...(files || [])]
    if (!picked.length) return
    setBusy((n) => n + picked.length)
    let next = [...list]
    for (const f of picked) {
      try {
        if (f.size > MAX_MB * 1024 * 1024) { toast(`${f.name} גדול מ־${MAX_MB} מ״ב`); continue }
        if (f.type.startsWith('image/') && !/svg/.test(f.type)) {
          const img = await prepareImage(f)
          const [uri, thumb_uri] = await Promise.all([uploadPrivate(img.full, f.name), uploadPrivate(img.thumb, 'thumb.webp')])
          next = [...next, { id: uid(), kind: 'image', name: f.name, uri, thumb_uri, width: img.width, height: img.height, size: f.size }]
        } else {
          const uri = await uploadPrivate(f, f.name)
          next = [...next, { id: uid(), kind: 'file', name: f.name, uri, type: f.type, size: f.size }]
        }
        onChange(next)
      } catch (e) {
        console.error(e)
        toast(`לא הצלחנו להעלות את ${f.name}`)
      } finally { setBusy((n) => n - 1) }
    }
  }
  const remove = (id) => onChange(list.filter((a) => a.id !== id))
  const images = list.filter((a) => a.kind === 'image')
  const files = list.filter((a) => a.kind !== 'image')
  return (
    <div className="flex flex-col gap-2" data-testid={testid}
      onDragOver={(e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault() }}
      onDrop={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); add(e.dataTransfer.files) } }}
      onPaste={(e) => { const imgs = imagesIn(e.clipboardData); if (imgs.length) { e.preventDefault(); add(imgs) } }}>
      {images.length > 0 && (
        <div className={compact ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-3 sm:grid-cols-4 gap-2'}>
          {images.map((a) => (
            <div key={a.id} className="relative group rounded-lg overflow-hidden border border-line bg-sunk">
              <button className="block w-full" onClick={() => open(a.uri)} title={a.name} data-testid="attachment-image">
                <PrivateImage uri={a.thumb_uri} width={a.width} height={a.height} alt={a.name} className="w-full aspect-square" />
              </button>
              <button className="absolute top-1 left-1 w-6 h-6 rounded-full bg-surface/90 border border-line hidden group-hover:inline-flex items-center justify-center" aria-label={`הסר את ${a.name}`} onClick={() => remove(a.id)}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-col rounded-lg border border-line divide-y divide-line overflow-hidden">
          {files.map((a) => (
            <div key={a.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-sunk">
              <FileText size={16} className="text-muted shrink-0" />
              <button className="flex-1 min-w-0 text-start truncate text-sm hover:underline" onClick={() => open(a.uri)} data-testid="attachment-file">{a.name}</button>
              <span className="text-xs text-muted shrink-0">{size(a.size || 0)}</span>
              <button className="w-6 h-6 rounded inline-flex items-center justify-center text-muted hover:text-fg opacity-0 group-hover:opacity-100" aria-label={`הסר את ${a.name}`} onClick={() => remove(a.id)}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" className="text-muted" onClick={() => input.current?.click()} data-testid={`${testid}-add`}><Paperclip size={15} />קובץ או תמונה</Button>
        {busy > 0 && <span className="text-xs text-muted inline-flex items-center gap-1"><Loader2 size={13} className="animate-spin" />מעלה…</span>}
        {!list.length && !busy && !compact && <span className="text-xs text-faint">אפשר גם לגרור לכאן. מסמכים, צילומים, סריקות, עד {MAX_MB} מ״ב.</span>}
      </div>
      <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} data-testid={`${testid}-input`} />
    </div>
  )
}
