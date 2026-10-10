// Pictures for the inspiration gallery. They are private files: only the writer can open them,
// through short-lived signed links that are renewed as needed.
// With VITE_MOCK=1 the files live in localStorage as data URLs, so tests run without a server.
import { useEffect, useState } from 'react'
import { isMock, uid } from '@/lib/utils'

const FULL_MAX = 2000
const THUMB_MAX = 520
const MOCK_KEY = 'maktub_mock_files'

/** Shrink a picture before upload: a full copy for its page and a small one for the gallery. */
export async function prepareImage(file) {
  const bmp = await createImageBitmap(file)
  const out = async (max, quality) => {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale))
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d').drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise((res) => c.toBlob(res, 'image/webp', quality))
    return blob || await new Promise((res) => c.toBlob(res, 'image/jpeg', quality))
  }
  const [full, thumb] = await Promise.all([out(FULL_MAX, 0.86), out(THUMB_MAX, 0.8)])
  const info = { width: bmp.width, height: bmp.height }
  bmp.close?.()
  return { full, thumb, ...info }
}

const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob) })

async function core() { return (await import('@/api/base44Client')).base44.integrations.Core }

/** Upload one blob as a private file; returns its file_uri. */
export async function uploadPrivate(blob, name = 'image.webp') {
  if (isMock) {
    const data = await blobToDataUrl(blob)
    // Read after the await, so two uploads at once do not overwrite each other.
    const files = JSON.parse(localStorage.getItem(MOCK_KEY) || '{}')
    const uri = `mock://${uid()}`
    files[uri] = data
    localStorage.setItem(MOCK_KEY, JSON.stringify(files))
    return uri
  }
  const file = new File([blob], name, { type: blob.type || 'image/webp' })
  const { file_uri } = await (await core()).UploadPrivateFile({ file })
  return file_uri
}

// Signed links last an hour; keep them for 50 minutes, in memory and for this tab.
const LINK_MS = 50 * 60 * 1000
const links = new Map()
const pending = new Map()
function remembered(uri) {
  const hit = links.get(uri)
  if (hit && hit.exp > Date.now()) return hit.url
  try {
    const s = JSON.parse(sessionStorage.getItem('maktub_links') || '{}')[uri]
    if (s && s.exp > Date.now()) { links.set(uri, s); return s.url }
  } catch { /* ignore */ }
  return null
}
function remember(uri, url) {
  const v = { url, exp: Date.now() + LINK_MS }
  links.set(uri, v)
  try { const s = JSON.parse(sessionStorage.getItem('maktub_links') || '{}'); s[uri] = v; sessionStorage.setItem('maktub_links', JSON.stringify(s)) } catch { /* full */ }
}

export async function mediaUrl(uri) {
  if (!uri) return null
  if (isMock) return JSON.parse(localStorage.getItem(MOCK_KEY) || '{}')[uri] || null
  const hit = remembered(uri)
  if (hit) return hit
  if (!pending.has(uri)) {
    pending.set(uri, (async () => {
      try {
        const { signed_url } = await (await core()).CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 })
        remember(uri, signed_url)
        return signed_url
      } finally { pending.delete(uri) }
    })())
  }
  return pending.get(uri)
}

/** The current link for a private file, renewed before it expires. */
export function useMediaUrl(uri) {
  const [url, setUrl] = useState(() => (uri && !isMock ? remembered(uri) : null))
  useEffect(() => {
    let alive = true
    let timer
    const get = () => mediaUrl(uri).then((u) => { if (alive) setUrl(u) }).catch(() => {})
    if (uri) { get(); if (!isMock) timer = setInterval(get, LINK_MS) }
    else setUrl(null)
    return () => { alive = false; clearInterval(timer) }
  }, [uri])
  return url
}

/** Pictures in a paste or drop, if any. */
export function imagesIn(dataTransfer) {
  return [...(dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'))
}
