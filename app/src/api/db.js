// Data access. In the real app every entity goes through the Base44 SDK.
// With VITE_MOCK=1 (local development and automated tests) a localStorage store
// with the same API is used instead, so the whole app can run without a backend.
import { isMock, uid } from '@/lib/utils'

export const ENTITIES = [
  'Book', 'Part', 'Chapter', 'Scene', 'Note', 'Idea', 'Character', 'Era',
  'WritingDay', 'Snapshot', 'UserSettings', 'Inspiration', 'ResearchNote',
]

function matches(rec, query = {}) {
  return Object.entries(query).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('$in' in v) return v.$in.includes(rec[k])
      if ('$ne' in v) return rec[k] !== v.$ne
    }
    return (rec[k] ?? null) === (v ?? null)
  })
}

function sortBy(list, sort) {
  if (!sort) return list
  const desc = sort.startsWith('-')
  const key = sort.replace(/^[-+]/, '')
  return [...list].sort((a, b) => {
    const x = a[key], y = b[key]
    if (x === y) return 0
    const r = x > y ? 1 : -1
    return desc ? -r : r
  })
}

// The server refuses any single text field longer than about 20,000 characters
// (roughly 3,000 Hebrew words). Long scene text is stored as the first piece in
// `content` and the rest in `content_more`, and joined back on every read.
export const FIELD_LIMIT = 19000
const PIECE = 15000
const LONG_FIELDS = { Scene: 'content', Snapshot: 'content', Inspiration: 'content', ResearchNote: 'content' }

export function splitLong(text, size = PIECE) {
  const out = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(i + size, text.length)
    // Never cut between the two halves of an emoji.
    if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end -= 1
    out.push(text.slice(i, end))
    i = end
  }
  return out
}

export function packLong(name, data) {
  const f = LONG_FIELDS[name]
  if (!f || !data || typeof data[f] !== 'string') return data
  const [first = '', ...rest] = splitLong(data[f])
  return { ...data, [f]: first, [`${f}_more`]: rest }
}

export function unpackLong(name, rec) {
  const f = LONG_FIELDS[name]
  if (!f || !rec || typeof rec !== 'object') return rec
  const more = rec[`${f}_more`]
  const { [`${f}_more`]: _drop, ...out } = rec
  if (Array.isArray(more) && more.length) out[f] = (rec[f] || '') + more.join('')
  return out
}

// If the server did not keep every piece, fail loudly so the outbox keeps the text and retries.
function stored(sent, rec) {
  const more = sent?.content_more
  if (Array.isArray(more) && more.length && rec && typeof rec === 'object' && (rec.content_more || []).length !== more.length) {
    throw new Error('long text was not fully stored')
  }
  return rec
}

function tooLong(data) {
  for (const [k, v] of Object.entries(data || {})) {
    const list = Array.isArray(v) ? v : [v]
    if (list.some((x) => typeof x === 'string' && x.length > FIELD_LIMIT)) {
      const e = new Error(`Field '${k}' exceeds the maximum allowed size.`)
      e.status = 400
      return e
    }
  }
  return null
}

function offlineError() {
  const e = new Error('offline')
  e.offline = true
  return e
}

// The local test server checks field types against the same entity files the real server uses,
// so a value of the wrong type fails in tests the way it fails in production.
const SCHEMAS = isMock
  ? Object.fromEntries(Object.entries(import.meta.glob('/base44/entities/*.jsonc', { eager: true, query: '?raw', import: 'default' }))
    .map(([, raw]) => { const j = JSON.parse(raw); return [j.name, j.properties || {}] }))
  : {}
function wrongType(name, data) {
  const props = SCHEMAS[name] || {}
  for (const [k, v] of Object.entries(data || {})) {
    const t = props[k]?.type
    if (!t || v === null || v === undefined) continue
    const ok = t === 'object' ? typeof v === 'object' && !Array.isArray(v)
      : t === 'array' ? Array.isArray(v)
      : t === 'number' ? typeof v === 'number'
      : t === 'boolean' ? typeof v === 'boolean'
      : t === 'string' ? typeof v === 'string' : true
    if (!ok) { const e = new Error(`Error in field ${k}: expected ${t}`); e.status = 422; return e }
  }
  return null
}

function mockEntity(name) {
  const store = mockStore(name)
  const un = (r) => unpackLong(name, r)
  const pack = (d) => { const p = packLong(name, sanitize(d)); const e = tooLong(p) || wrongType(name, p); if (e) throw e; return p }
  return {
    filter: async (q, s, l) => (await store.filter(q, s, l)).map(un),
    list: async (s, l) => (await store.list(s, l)).map(un),
    get: async (id) => un(await store.get(id)),
    create: async (d) => { const p = pack(d); return un(await store.create(p)) },
    bulkCreate: async (l) => { const ps = l.map(pack); return (await store.bulkCreate(ps)).map(un) },
    update: async (id, d) => { const p = pack(d); return un(await store.update(id, p)) },
    delete: (id) => store.delete(id),
  }
}

function mockStore(name) {
  const key = `maktub_mock_${name}`
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] } }
  const write = (rows) => localStorage.setItem(key, JSON.stringify(rows))
  const net = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineError()
    // Tests can make the fake server slow, to catch screens that assume instant data.
    const slow = Number(localStorage.getItem('maktub_mock_latency') || 0)
    await new Promise((r) => setTimeout(r, 5 + slow))
  }
  const stamp = (data) => {
    const now = new Date().toISOString()
    return { id: uid(), created_date: now, updated_date: now, created_by: 'writer@example.com', ...data }
  }
  return {
    async filter(query = {}, sort, limit) {
      await net()
      const rows = sortBy(read().filter((r) => matches(r, query)), sort)
      return limit ? rows.slice(0, limit) : rows
    },
    async list(sort, limit) { return this.filter({}, sort, limit) },
    async get(id) { await net(); const r = read().find((x) => x.id === id); if (!r) throw new Error('not found'); return r },
    async create(data) { await net(); const rows = read(); const rec = stamp(sanitize(data)); rows.push(rec); write(rows); return rec },
    async bulkCreate(list) { await net(); const rows = read(); const recs = list.map((d) => stamp(sanitize(d))); write([...rows, ...recs]); return recs },
    async update(id, data) {
      await net()
      const rows = read(); const i = rows.findIndex((r) => r.id === id)
      if (i < 0) throw new Error('not found')
      rows[i] = { ...rows[i], ...sanitize(data), updated_date: new Date().toISOString() }
      write(rows); return rows[i]
    },
    async delete(id) { await net(); write(read().filter((r) => r.id !== id)); return { success: true } },
  }
}

let real = null
async function realEntities() {
  if (!real) {
    const { base44 } = await import('@/api/base44Client')
    real = base44.entities
  }
  return real
}

// Base44 validates field types, so an empty value is sent as the type's empty value instead of null.
const OBJECT_FIELDS = new Set(['plan', 'story_time', 'note_to_self', 'last_position', 'drive', 'board', 'backup_email'])
const NUMBER_FIELDS = new Set(['words_per_hour', 'word_count', 'order', 'words', 'seconds', 'write_size', 'read_size', 'ipad_size'])
export function sanitize(data) {
  if (!data || typeof data !== 'object') return data
  const out = {}
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('_')) continue
    if (v === null || v === undefined) out[k] = OBJECT_FIELDS.has(k) ? {} : NUMBER_FIELDS.has(k) ? 0 : ''
    else out[k] = v
  }
  return out
}

function realEntity(name) {
  const call = async (method, ...args) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineError()
    const ents = await realEntities()
    const handler = ents[name]
    if (method === 'bulkCreate' && !handler.bulkCreate) return Promise.all(args[0].map((d) => handler.create(d)))
    return handler[method](...args)
  }
  const un = (r) => unpackLong(name, r)
  const pack = (d) => packLong(name, sanitize(d))
  return {
    filter: async (q, s, l) => (await call('filter', q, s, l)).map(un),
    list: async (s, l) => (await call('list', s, l)).map(un),
    get: async (id) => un(await call('get', id)),
    create: async (d) => { const p = pack(d); return un(stored(p, await call('create', p))) },
    bulkCreate: async (l) => { const ps = l.map(pack); const rs = await call('bulkCreate', ps); return rs.map((r, i) => un(stored(ps[i], r))) },
    update: async (id, d) => { const p = pack(d); return un(stored(p, await call('update', id, p))) },
    delete: (id) => call('delete', id),
  }
}

export const db = Object.fromEntries(ENTITIES.map((n) => [n, isMock ? mockEntity(n) : realEntity(n)]))
