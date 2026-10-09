import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncBook, rtlHtml, MANIFEST_NAME } from '../../src/lib/driveCore.js'

function fakeDrive() {
  const files = new Map()
  let n = 0
  const calls = []
  const mk = (o) => { const id = 'f' + (++n); const f = { id, trashed: false, modifiedTime: 't' + n, ...o }; files.set(id, f); return f }
  const api = {
    createFolder: async (name, parent) => { calls.push(['folder', name]); return mk({ name, parent, folder: true }) },
    get: async (id) => { const f = files.get(id); if (!f) throw new Error('404'); return { ...f } },
    rename: async (id, name, add) => { const f = files.get(id); f.name = name; if (add) f.parent = add; calls.push(['rename', name]); return f },
    trash: async (id) => { files.get(id).trashed = true; calls.push(['trash', files.get(id).name]); return {} },
    copy: async (id, name) => { calls.push(['copy', name]); return mk({ name, parent: files.get(id).parent, html: files.get(id).html }) },
    list: async (parent) => ({ files: [...files.values()].filter((f) => f.parent === parent && !f.trashed) }),
    createDoc: async (name, parent, html) => { calls.push(['create', name]); return mk({ name, parent, html }) },
    updateDoc: async (id, name, html) => { const f = files.get(id); f.name = name; f.html = html; f.modifiedTime = 'u' + (++n); calls.push(['update', name]); return f },
    uploadFile: async (name, parent) => { calls.push(['upload', name]); return mk({ name, parent }) },
  }
  return { api, files, calls }
}

const book = { id: 'b', title: 'הספר שלי' }
const groups = (txt = 'שלום') => [{ part: null, chapters: [
  { id: 'c1', label: 'פרק 1: הבית', scenes: [{ id: 's1', content: `<p>${txt}</p>` }] },
  { id: 'c2', label: 'פרק 2', scenes: [{ id: 's2', content: '<p>עוד</p>' }, { id: 's3', content: '<p>ועוד</p>' }] },
] }]

test('first sync creates folder, a doc per chapter, a manifest and a snapshot', async () => {
  const d = fakeDrive()
  const { state } = await syncBook({ book, groups: groups(), state: {}, root: 'root', api: d.api, makeSnapshot: async () => new Blob(['x']) })
  const names = [...d.files.values()].filter((f) => !f.trashed).map((f) => f.name)
  assert.ok(names.includes('הספר שלי'))
  assert.ok(names.includes('01 — פרק 1: הבית'))
  assert.ok(names.includes('02 — פרק 2'))
  assert.ok(names.includes(MANIFEST_NAME))
  assert.ok(names.includes('גרסאות'))
  assert.ok(names.some((x) => x.endsWith('.docx')))
  assert.ok(state.chapters.c1.fileId && state.manifestId)
})

test('only changed chapters are uploaded again', async () => {
  const d = fakeDrive()
  const r1 = await syncBook({ book, groups: groups(), state: {}, root: 'root', api: d.api })
  d.calls.length = 0
  await syncBook({ book, groups: groups('שלום עולם'), state: r1.state, root: 'root', api: d.api })
  const updates = d.calls.filter((c) => c[0] === 'update').map((c) => c[1])
  assert.deepEqual(updates.filter((x) => x !== MANIFEST_NAME), ['01 — פרק 1: הבית'])
})

test('a chapter edited in Google Docs is copied before overwrite', async () => {
  const d = fakeDrive()
  const r1 = await syncBook({ book, groups: groups(), state: {}, root: 'root', api: d.api })
  d.files.get(r1.state.chapters.c1.fileId).modifiedTime = 'edited-by-user'
  let conflict = null
  await syncBook({ book, groups: groups('חדש'), state: r1.state, root: 'root', api: d.api, onConflict: (n) => { conflict = n } })
  assert.ok(conflict && conflict.includes('נערך בגוגל דוקס'))
  assert.ok(d.calls.some((c) => c[0] === 'copy'))
})

test('deleted chapters are trashed and reordering renames files', async () => {
  const d = fakeDrive()
  const r1 = await syncBook({ book, groups: groups(), state: {}, root: 'root', api: d.api })
  const g = groups()
  g[0].chapters = [g[0].chapters[1]]
  await syncBook({ book, groups: g, state: r1.state, root: 'root', api: d.api })
  assert.ok(d.calls.some((c) => c[0] === 'trash' && c[1] === '01 — פרק 1: הבית'))
  assert.ok([...d.files.values()].some((f) => f.name === '01 — פרק 2' && !f.trashed))
})

test('google docs html is explicitly right-to-left', () => {
  const html = rtlHtml('כותרת', '<p>שלום</p><hr><p><span class="note-anchor" data-note-id="x">עולם</span></p>')
  assert.ok(html.includes('<p dir="rtl"'))
  assert.ok(!html.includes('note-anchor'))
  assert.ok(html.includes('* * *'))
})
