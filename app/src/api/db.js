// Data access. In the real app every entity goes through the Base44 SDK.
// With VITE_MOCK=1 (local development and automated tests) a localStorage store
// with the same API is used instead, so the whole app can run without a backend.
import { isMock, uid } from '@/lib/utils'

export const ENTITIES = [
  'Book', 'Part', 'Chapter', 'Scene', 'Note', 'Idea', 'Character', 'Era',
  'WritingDay', 'Snapshot', 'UserSettings',
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

function offlineError() {
  const e = new Error('offline')
  e.offline = true
  return e
}

function mockEntity(name) {
  const key = `maktub_mock_${name}`
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] } }
  const write = (rows) => localStorage.setItem(key, JSON.stringify(rows))
  const net = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineError()
    await new Promise((r) => setTimeout(r, 5))
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
    async create(data) { await net(); const rows = read(); const rec = stamp(data); rows.push(rec); write(rows); return rec },
    async bulkCreate(list) { await net(); const rows = read(); const recs = list.map(stamp); write([...rows, ...recs]); return recs },
    async update(id, data) {
      await net()
      const rows = read(); const i = rows.findIndex((r) => r.id === id)
      if (i < 0) throw new Error('not found')
      rows[i] = { ...rows[i], ...data, updated_date: new Date().toISOString() }
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

function realEntity(name) {
  const call = async (method, ...args) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineError()
    const ents = await realEntities()
    const handler = ents[name]
    if (method === 'bulkCreate' && !handler.bulkCreate) return Promise.all(args[0].map((d) => handler.create(d)))
    return handler[method](...args)
  }
  return {
    filter: (q, s, l) => call('filter', q, s, l),
    list: (s, l) => call('list', s, l),
    get: (id) => call('get', id),
    create: (d) => call('create', d),
    bulkCreate: (l) => call('bulkCreate', l),
    update: (id, d) => call('update', id, d),
    delete: (id) => call('delete', id),
  }
}

export const db = Object.fromEntries(ENTITIES.map((n) => [n, isMock ? mockEntity(n) : realEntity(n)]))
