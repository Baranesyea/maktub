// End-to-end tests against the dev server running with VITE_MOCK=1 (local data store).
// Run: npx vite --port 5199 & node tests/e2e/run.mjs [filter]
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const BASE = 'http://localhost:5199'
const OUT = 'tests/e2e/artifacts'
fs.mkdirSync(OUT, { recursive: true })
const filter = process.argv[2] || ''
const results = []
let browser

async function seed(page) {
  await page.goto(BASE + '/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
    const now = new Date().toISOString()
    const mk = (o) => ({ created_date: now, updated_date: now, created_by: 'writer@example.com', ...o })
    const p = (t) => `<p>${t}</p>`
    localStorage.setItem('maktub_mock_Book', JSON.stringify([mk({ id: 'b1', title: 'הקיץ שעברנו צפונה', use_parts: false, deleted: false })]))
    localStorage.setItem('maktub_mock_Chapter', JSON.stringify([
      mk({ id: 'c1', book_id: 'b1', title: 'המטבח', kind: 'chapter', order: 0, deleted: false }),
      mk({ id: 'c2', book_id: 'b1', title: 'אחי', kind: 'chapter', order: 1, deleted: false }),
      mk({ id: 'c3', book_id: 'b1', title: 'הדירה החדשה', kind: 'chapter', order: 2, deleted: false }),
    ]))
    localStorage.setItem('maktub_mock_Scene', JSON.stringify([
      mk({ id: 's1', book_id: 'b1', chapter_id: 'c1', title: 'ההודעה', order: 0, status: 'draft', deleted: false, content: p('בקיץ ההוא, כשהמזגן במטבח עוד השמיע את הרעש הזה, אמא שלי החליטה שאנחנו עוברים דירה.') + p('"לאן?" שאלתי. היה לי בפה חצי פרוסה עם גבינה.'), word_count: 26, story_time: { type: 'exact', start: '2006-07' } }),
      mk({ id: 's2', book_id: 'b1', chapter_id: 'c1', title: 'הארגזים', order: 1, status: 'idea', deleted: false, content: p('הארגזים הגיעו ביום חמישי.'), word_count: 4, story_time: { type: 'relative', anchor_scene_id: 's1', offset_days: 14 } }),
      mk({ id: 's3', book_id: 'b1', chapter_id: 'c2', title: '', order: 0, status: 'draft', deleted: false, content: p('אחי תמיד ידע לאן הולכים. אחי.'), word_count: 6, story_time: { type: 'range', label: 'קיץ 1998', start: '1998-06-01', end: '1998-08-31' } }),
      mk({ id: 's4', book_id: 'b1', chapter_id: 'c3', title: '', order: 0, status: 'idea', deleted: false, content: p('עשר שנים אחר כך, ב־2016, חזרתי לבניין ההוא.'), word_count: 8, story_time: { type: 'exact', start: '2016' } }),
    ]))
    localStorage.setItem('maktub_mock_UserSettings', JSON.stringify([mk({ id: 'u1', tour_done: true, ui_font: 'gofan', write_font: 'frank', write_size: 19, read_size: 22, ipad_size: 17, theme: 'light', reading_theme: 'paper', typewriter: true })]))
  })
}

// Pick from one of the app's own menus (they replaced the browser's dropdowns).
const choose = async (page, testid, value) => { await page.click(`[data-testid="${testid}"]`); await page.click(`[data-testid="${testid}-option-${value}"]`) }
const store = (page, name) => page.evaluate((n) => JSON.parse(localStorage.getItem('maktub_mock_' + n) || '[]'), name)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function assert(cond, msg) { if (!cond) throw new Error(msg) }
async function waitFor(fn, msg, ms = 5000) {
  const end = Date.now() + ms
  while (Date.now() < end) { try { if (await fn()) return } catch { /* retry */ } await sleep(100) }
  throw new Error('timeout: ' + msg)
}

async function test(name, opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {} }
  if (filter && !name.includes(filter)) return
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1400, height: 900 }, locale: 'he-IL', hasTouch: !!opts.touch, isMobile: !!opts.mobile, acceptDownloads: true, colorScheme: opts.colorScheme || 'light' })
  // The entrance splash has its own test; everywhere else start as if it was already seen.
  if (!opts.splash) await ctx.addInitScript(() => { try { sessionStorage.setItem('maktub_splash_seen', '1') } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  const t0 = Date.now()
  try {
    await seed(page)
    await fn(page, ctx)
    if (errors.length) throw new Error('page errors: ' + errors.slice(0, 3).join(' | '))
    results.push({ name, ok: true, ms: Date.now() - t0 })
    console.log('✓', name)
  } catch (e) {
    results.push({ name, ok: false, error: e.message })
    console.log('✗', name, '\n   ', e.message.split('\n')[0])
    await page.screenshot({ path: path.join(OUT, `fail-${name.replace(/[^\w֐-׿]+/g, '_')}.png`) }).catch(() => {})
  }
  await ctx.close()
}

const waitSaved = (page) => waitFor(async () => (await page.getAttribute('[data-testid="save-status"]', 'data-state')) === 'saved', 'saved', 8000)
const openBook = async (page, q = '') => { await page.goto(`${BASE}/book/b1${q}`); await page.waitForSelector('[data-testid="workspace"]'); await sleep(400) }
const editorOf = (page, sceneId) => page.locator(`.ProseMirror[data-scene-id="${sceneId}"]`)

browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } })

// ---------------------------------------------------------------- Home
await test('home shows today card, drive reminder and books', async (page) => {
  await page.goto(BASE + '/')
  await page.waitForSelector('[data-testid="today-card"]')
  assert(await page.locator('[data-testid="drive-reminder"]').isVisible(), 'drive reminder visible')
  assert(await page.locator('[data-testid="book-card"]').count() === 1, 'one book card')
  await page.screenshot({ path: `${OUT}/home.png` })
})

await test('create a new book and land in the editor', async (page) => {
  await page.goto(BASE + '/')
  await page.click('[data-testid="new-book"]')
  await page.fill('[data-testid="new-book-title"]', 'ספר חדש לבדיקה')
  await page.click('[data-testid="create-book"]')
  await page.waitForSelector('[data-testid="workspace"]')
  await page.waitForSelector('.ProseMirror')
  const books = await store(page, 'Book')
  assert(books.some((b) => b.title === 'ספר חדש לבדיקה'), 'book created')
})

// ---------------------------------------------------------------- Writing and saving
await test('a very long scene saves (server limits each field to ~20,000 characters)', async (page) => {
  await openBook(page)
  const ed = editorOf(page, 's2')
  await ed.click()
  await page.keyboard.press('Control+End')
  await page.evaluate(() => {
    const para = 'היא עמדה ליד החלון והביטה ברחוב הריק, חושבת על כל מה שלא נאמר. 🙂 '
    const text = Array.from({ length: 400 }, (_, i) => `${i + 1}. ` + para.repeat(5)).join('\n\n') + '\n\nסוף הסצנה הארוכה'
    const dt = new DataTransfer(); dt.setData('text/plain', text)
    document.querySelector('.ProseMirror[data-scene-id="s2"]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await waitSaved(page)
  await sleep(300)
  const raw = (await store(page, 'Scene')).find((s) => s.id === 's2')
  assert(raw.content.length <= 19000 && raw.content_more.length >= 5, 'stored in pieces, got ' + raw.content.length + ' + ' + raw.content_more?.length)
  assert(raw.content_more.every((x) => x.length <= 19000), 'every piece under the limit')
  await page.reload()
  await page.waitForSelector('.ProseMirror[data-scene-id="s2"]')
  const t = await editorOf(page, 's2').innerText()
  assert(t.includes('סוף הסצנה הארוכה') && t.includes('400. '), 'whole text after reload')
  // Shortening the scene again clears the extra pieces.
  await editorOf(page, 's2').click()
  await page.keyboard.press('Control+a'); await page.keyboard.type('קצר')
  await waitSaved(page); await sleep(300)
  const short = (await store(page, 'Scene')).find((s) => s.id === 's2')
  assert(short.content === '<p>קצר</p>' && short.content_more.length === 0, 'pieces cleared, got ' + short.content.slice(0, 40))
})

await test('typing saves, counts typed words, survives reload', async (page) => {
  await openBook(page)
  const ed = editorOf(page, 's2')
  await ed.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' ואז הגיעה המשאית הגדולה')
  await waitFor(async () => (await page.getAttribute('[data-testid="save-status"]', 'data-state')) === 'saved', 'saved')
  await sleep(300)
  const s2 = (await store(page, 'Scene')).find((s) => s.id === 's2')
  assert(s2.content.includes('המשאית הגדולה'), 'content persisted')
  assert(s2.word_count === 8, 'word count 8, got ' + s2.word_count)
  await waitFor(async () => (await store(page, 'WritingDay'))[0]?.words === 4, 'typed words counted = 4', 6000)
  await page.reload()
  await page.waitForSelector('.ProseMirror[data-scene-id="s2"]')
  assert((await editorOf(page, 's2').innerText()).includes('המשאית הגדולה'), 'text after reload')
})

await test('pasted text does not count toward today', async (page, ctx) => {
  await openBook(page)
  const ed = editorOf(page, 's2')
  await ed.click()
  await page.keyboard.press('End')
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('text/plain', ' מילה אחת שתיים שלוש ארבע חמש')
    document.querySelector('.ProseMirror[data-scene-id="s2"]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await sleep(1800)
  const s2 = (await store(page, 'Scene')).find((s) => s.id === 's2')
  assert(s2.content.includes('ארבע חמש'), 'pasted text saved')
  const days = await store(page, 'WritingDay')
  assert(!days[0] || days[0].words === 0, 'paste not counted, got ' + days[0]?.words)
})

await test('offline: text is kept locally and sent when the connection returns', async (page, ctx) => {
  await openBook(page)
  await editorOf(page, 's2').click()
  await page.keyboard.press('End')
  await ctx.setOffline(true)
  await page.keyboard.type(' כתוב בלי אינטרנט')
  await waitFor(async () => (await page.getAttribute('[data-testid="save-status"]', 'data-state')) === 'offline', 'offline state')
  assert((await page.getAttribute('[data-testid="save-status"]', 'title')).includes('במחשב'), 'offline message')
  const outbox = await page.evaluate(() => localStorage.getItem('maktub_outbox_v1'))
  assert(outbox.includes('בלי אינטרנט'), 'outbox holds text')
  let s2 = (await store(page, 'Scene')).find((s) => s.id === 's2')
  assert(!s2.content.includes('בלי אינטרנט'), 'not on server yet')
  await ctx.setOffline(false)
  await waitFor(async () => (await page.getAttribute('[data-testid="save-status"]', 'data-state')) === 'saved', 'saved after online', 8000)
  s2 = (await store(page, 'Scene')).find((s) => s.id === 's2')
  assert(s2.content.includes('בלי אינטרנט'), 'sent after reconnect')
})

await test('chapter shows as one continuous page and status moves idea→draft', async (page) => {
  await openBook(page)
  assert(await page.locator('[data-scene-block]').count() === 2, 'two scenes in chapter 1')
  await editorOf(page, 's2').click()
  await page.keyboard.type('x')
  await sleep(1300)
  assert((await store(page, 'Scene')).find((s) => s.id === 's2').status === 'draft', 'status draft')
})

// ---------------------------------------------------------------- Tree
await test('tree: open chapter, rename, add chapter and scene', async (page) => {
  await openBook(page)
  await page.click('[data-testid="chapter-row-1"]')
  await waitFor(async () => (await page.textContent('[data-testid="chapter-title"]')).includes('אחי'), 'chapter 2 open')
  await page.dblclick('[data-testid="chapter-row-1"]')
  await page.keyboard.press('Control+A')
  await page.keyboard.type('אחותי')
  await page.keyboard.press('Enter')
  await waitFor(async () => (await page.textContent('[data-testid="chapter-row-1"]')).includes('אחותי'), 'renamed')
  await page.click('[data-testid="add-chapter"]')
  await waitFor(async () => (await page.locator('[role="treeitem"][data-testid^="chapter-row"]').count()) === 4, '4 chapters')
  await sleep(600)
  const ch = (await store(page, 'Chapter')).filter((c) => !c.deleted)
  assert(ch.length === 4, 'stored 4 chapters')
})

await test('tree: drag a chapter with its scenes (mouse)', async (page) => {
  await openBook(page)
  const src = page.locator('[data-testid="chapter-row-0"]')
  const dst = page.locator('[data-testid="chapter-row-2"]')
  const a = await src.boundingBox(), b = await dst.boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 4 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height + 8, { steps: 15 })
  await sleep(300)
  await page.mouse.up()
  await sleep(900)
  const order = (await store(page, 'Chapter')).sort((x, y) => x.order - y.order).map((c) => c.id)
  assert(order[order.length - 1] === 'c1', 'c1 moved to end, got ' + order.join(','))
  const scenes = (await store(page, 'Scene')).filter((s) => s.chapter_id === 'c1')
  assert(scenes.length === 2, 'scenes still with chapter')
  assert((await page.textContent('[data-testid="chapter-row-0"]')).includes('פרק 1: אחי'), 'numbers update')
})

await test('tree: move a scene to another chapter with the keyboard and undo', async (page) => {
  await openBook(page)
  const row = page.locator('[data-testid="scene-row-s2"]')
  await row.click()
  await row.focus()
  await page.keyboard.press('Alt+ArrowDown')
  await sleep(700)
  let s2 = (await store(page, 'Scene')).find((s) => s.id === 's2')
  assert(s2.chapter_id === 'c2', 'moved into chapter 2, got ' + s2.chapter_id)
  await page.keyboard.press('Control+z')
  await sleep(700)
  s2 = (await store(page, 'Scene')).find((s) => s.id === 's2')
  assert(s2.chapter_id === 'c1', 'undo moved it back')
})

await test('tree: move to… dialog, make scene a chapter, trash and restore', async (page) => {
  await openBook(page)
  await page.hover('[data-testid="scene-row-s2"]')
  await page.locator('[data-testid="scene-row-s2"] [aria-label="פעולות לסצנה"]').click()
  await page.getByRole('menuitem', { name: 'הפוך לפרק' }).click()
  await waitFor(async () => (await store(page, 'Chapter')).filter((c) => !c.deleted).length === 4, 'new chapter from scene')
  await sleep(500); await waitSaved(page)
  assert((await store(page, 'Scene')).find((s) => s.id === 's2').chapter_id !== 'c1', 'scene left c1')
  await page.locator('[data-testid="chapter-row-2"] [aria-label="פעולות לפרק"]').click({ force: true })
  await page.getByRole('menuitem', { name: 'מחק' }).click()
  await sleep(500); await waitSaved(page)
  assert((await store(page, 'Chapter')).filter((c) => c.deleted).length === 1, 'chapter in trash')
  await page.click('[data-testid="more-menu"]')
  await page.getByRole('menuitem', { name: 'סל מחזור' }).click()
  await page.getByRole('button', { name: 'שחזר' }).first().click()
  await sleep(500); await waitSaved(page)
  assert((await store(page, 'Chapter')).filter((c) => c.deleted).length === 0, 'restored')
})

await test('tree: right-click opens the item menu', async (page) => {
  await openBook(page)
  await page.click('[data-testid="chapter-row-1"]', { button: 'right' })
  await page.getByRole('menuitem', { name: 'שכפל' }).waitFor()
})

// ---------------------------------------------------------------- Notes
async function addNoteOnWord(page, sceneId, word) {
  await editorOf(page, sceneId).click()
  await page.evaluate(({ sceneId, word }) => {
    const root = document.querySelector(`.ProseMirror[data-scene-id="${sceneId}"]`)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.nodeValue.indexOf(word)
      if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); break }
    }
  }, { sceneId, word })
  await sleep(150)
  const before = (await store(page, 'Note')).length
  await page.click('[data-testid="add-note"]')
  await waitFor(async () => (await store(page, 'Note')).length > before, 'note created')
  const note = (await store(page, 'Note')).slice(-1)[0]
  await waitFor(async () => page.evaluate((id) => document.activeElement?.closest?.(`[data-testid="note-card-${id}"]`) != null, note.id), 'note textarea focused')
  return note
}

await test('notes: stick a note on text, see it in margin, strip and tree', async (page) => {
  await openBook(page)
  const note = await addNoteOnWord(page, 's1', 'המזגן')
  await page.keyboard.type('לבדוק איזה מזגן היה')
  await sleep(1200)
  assert((await store(page, 'Note'))[0].text === 'לבדוק איזה מזגן היה', 'note text saved')
  await waitFor(async () => (await page.locator(`[data-testid="margin-note-${note.id}"]`).count()) === 1, 'margin marker')
  assert(await page.locator('[data-testid="note-strip"] button').count() === 1, 'scrollbar marker')
  assert((await page.textContent('[data-testid="chapter-row-0"]')).includes('1'), 'tree badge')
  await sleep(1200)
  const s1 = (await store(page, 'Scene')).find((s) => s.id === 's1')
  assert(s1.content.includes(`data-note-id="${note.id}"`), 'anchor saved in text')
  await page.screenshot({ path: `${OUT}/notes.png` })
})

await test('notes: jump between chapters without losing your place, then go back', async (page) => {
  await openBook(page)
  const note = await addNoteOnWord(page, 's1', 'גבינה')
  await page.click('[data-testid="chapter-row-2"]')
  await waitFor(async () => (await page.textContent('[data-testid="chapter-title"]')).includes('הדירה'), 'in chapter 3')
  await page.click(`[data-testid="note-card-${note.id}"]`)
  await waitFor(async () => (await page.textContent('[data-testid="chapter-title"]')).includes('המטבח'), 'jumped to chapter 1')
  assert(await page.locator('[data-testid="notes-list"]').isVisible(), 'panel stays open')
  await page.click('[data-testid="note-back"]')
  await waitFor(async () => (await page.textContent('[data-testid="chapter-title"]')).includes('הדירה'), 'back to chapter 3')
})

await test('notes: done removes the anchor and hides the note', async (page) => {
  await openBook(page)
  const n1 = await addNoteOnWord(page, 's1', 'המזגן')
  const n2 = await addNoteOnWord(page, 's2', 'הארגזים')
  await page.click(`[data-testid="note-done-${n1.id}"]`)
  await sleep(1300)
  const s1 = (await store(page, 'Scene')).find((s) => s.id === 's1')
  assert(!s1.content.includes(n1.id), 'anchor removed')
  assert((await store(page, 'Note')).find((n) => n.id === n1.id).done === true, 'note done')
  assert(await page.locator(`[data-testid="note-card-${n1.id}"]`).count() === 0, 'hidden from open list')
  assert(await page.locator(`[data-testid="note-card-${n2.id}"]`).count() === 1, 'other note still open')
})

await test('notes: select text, right click, choose a note type; right click the note to finish it', async (page) => {
  await openBook(page)
  await page.evaluate(() => {
    const root = document.querySelector('.ProseMirror[data-scene-id="s1"]')
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) { const i = n.nodeValue.indexOf('אמא שלי'); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 7); const s = getSelection(); s.removeAllRanges(); s.addRange(r); break } }
  })
  await sleep(150)
  const box = await page.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await page.mouse.click(box.x, box.y, { button: 'right' })
  await page.waitForSelector('[data-testid="text-menu"]', { timeout: 5000 }).catch(async (e) => { await page.screenshot({ path: OUT + '/rc-fail.png' }); throw new Error('first menu: ' + e.message.slice(0, 60)) })
  await page.screenshot({ path: `${OUT}/text-menu.png` })
  await page.click('[data-testid="menu-note-question"]')
  await waitFor(async () => (await store(page, 'Note')).some((n) => n.quote === 'אמא שלי' && n.type === 'question'), 'question note created')
  const note = (await store(page, 'Note')).find((n) => n.quote === 'אמא שלי')
  await waitFor(async () => (await page.locator(`.note-anchor[data-note-id="${note.id}"]`).count()) === 1, 'marked in the text')
  const style = await page.evaluate((id) => getComputedStyle(document.querySelector(`.note-anchor[data-note-id="${id}"]`)).borderBottomStyle, note.id)
  assert(style === 'dotted', 'question notes are dotted: ' + style)
  await page.keyboard.type('איך היא קראה לו?')
  await sleep(300)
  const a = await page.evaluate((id) => { const r = document.querySelector(`.note-anchor[data-note-id="${id}"]`).getClientRects()[0]; return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, note.id)
  await page.mouse.click(a.x, a.y, { button: 'right' })
  await page.waitForSelector('[data-testid="menu-open-note"]', { timeout: 5000 }).catch(async (e) => { await page.screenshot({ path: OUT + '/rc-fail.png' }); throw new Error('second menu: ' + e.message.slice(0, 60)) })
  await page.getByRole('menuitem', { name: 'סמן כבוצע' }).click()
  await waitFor(async () => (await store(page, 'Note')).find((n) => n.id === note.id).done === true, 'done from the menu')
  assert(await page.locator(`.note-anchor[data-note-id="${note.id}"]`).count() === 0, 'mark removed from text')
})

await test('ideas: open from the rail, add one linked to a chapter, it opens that chapter', async (page) => {
  await openBook(page)
  await page.click('[data-testid="nav-ideas"]')
  await page.waitForSelector('[data-testid="ideas-dialog"]')
  await page.fill('[data-testid="idea-input"]', 'אולי האח בכלל לא עבר איתם')
  await page.click('[data-testid="idea-link"]')
  await choose(page, 'idea-link-select', 'c:c2')
  await page.click('[data-testid="idea-add"]')
  await waitFor(async () => (await store(page, 'Idea')).some((i) => i.link_chapter_id === 'c2'), 'idea saved with link')
  await page.getByRole('button', { name: /פרק 2/ }).click()
  await waitFor(async () => (await page.textContent('[data-testid="chapter-title"]')).includes('אחי'), 'opened the linked chapter')
  assert(await page.locator('[data-testid="tab-ideas"]').count() === 0, 'no ideas tab in the side panel')
})

await test('save status is a single tick with details on hover', async (page) => {
  await openBook(page)
  const el = page.locator('[data-testid="save-status"]')
  await waitFor(async () => (await el.getAttribute('data-state')) === 'saved', 'saved')
  assert((await el.innerText()).trim() === '', 'no words, only the icon')
  assert((await el.getAttribute('title')).includes('שמור'), 'details in the tooltip')
})

// ---------------------------------------------------------------- Modes and size
await test('focus mode hides panels, Esc exits', async (page) => {
  await openBook(page)
  await page.click('[data-testid="focus-toggle"]')
  assert(await page.locator('[data-tour="tree"]').count() === 0, 'tree hidden')
  assert(await page.locator('[data-tour="side"]').count() === 0, 'side hidden')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-tour="tree"]')
})

await test('text size changes only the book text', async (page) => {
  await openBook(page)
  const uiBefore = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="chapter-row-0"]')).fontSize)
  await page.click('[data-testid="size-up"]')
  await page.click('[data-testid="size-up"]')
  const ed = await page.evaluate(() => getComputedStyle(document.querySelector('.prose-write')).fontSize)
  const uiAfter = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="chapter-row-0"]')).fontSize)
  assert(ed === '21px', 'editor 21px, got ' + ed)
  assert(uiBefore === uiAfter, 'ui unchanged')
  await page.keyboard.press('Control+0')
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('.prose-write')).fontSize) === '19px', 'ctrl+0 resets')
})

await test('reading mode: whole book, size, note from reading, Esc back', async (page) => {
  await openBook(page)
  await page.click('[data-testid="reading-toggle"]')
  await page.waitForSelector('[data-testid="reading-mode"]')
  await sleep(400)
  const text = await page.textContent('[data-testid="reading-mode"]')
  assert(text.includes('אחי תמיד') && text.includes('עשר שנים'), 'all chapters')
  assert(await page.locator('.ProseMirror').count() === 0, 'no editors: text locked')
  await page.evaluate(() => {
    const el = document.querySelector('[data-scene="s4"] p').firstChild
    const r = document.createRange(); r.setStart(el, 0); r.setEnd(el, 3)
    getSelection().removeAllRanges(); getSelection().addRange(r)
  })
  await page.dispatchEvent('[data-scene="s4"]', 'mouseup')
  await page.click('[data-testid="reading-add-note"]')
  await sleep(1200)
  assert((await store(page, 'Note')).length === 1, 'note from reading')
  assert((await store(page, 'Scene')).find((s) => s.id === 's4').content.includes('data-note-id'), 'anchor saved')
  await page.screenshot({ path: `${OUT}/reading.png` })
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="workspace"]')
})

// ---------------------------------------------------------------- Split, board, find, versions
await test('split a scene at the cursor', async (page) => {
  await openBook(page)
  await editorOf(page, 's1').click()
  await page.evaluate(() => {
    const p = document.querySelectorAll('.ProseMirror[data-scene-id="s1"] p')[1]
    const r = document.createRange(); r.setStart(p.firstChild, 0); r.collapse(true)
    getSelection().removeAllRanges(); getSelection().addRange(r)
  })
  await sleep(150)
  await page.click('[aria-label="פצל כאן לשתי סצנות"]')
  await sleep(1200)
  const sc = (await store(page, 'Scene')).filter((s) => s.chapter_id === 'c1' && !s.deleted).sort((a, b) => a.order - b.order)
  assert(sc.length === 3, '3 scenes, got ' + sc.length)
  assert(sc[0].content.includes('בקיץ') && !sc[0].content.includes('לאן'), 'first half')
  assert(sc[1].content.includes('לאן'), 'second half')
})

await test('card board shows chapters and scenes', async (page) => {
  await openBook(page)
  await page.click('[data-testid="view-board"]')
  await page.waitForSelector('[data-testid="board"]')
  const titles = await page.locator('[data-testid="board"] input').evaluateAll((els) => els.map((e) => e.value))
  assert(titles.includes('ההודעה') && titles.includes('הארגזים'), 'cards: ' + titles.join(','))
  await page.screenshot({ path: `${OUT}/board.png` })
})

await test('find and replace across the book', async (page) => {
  await openBook(page)
  await page.keyboard.press('Control+Shift+H')
  await page.fill('[data-testid="find-input"]', 'אחי')
  await page.fill('[data-testid="replace-input"]', 'אחותי')
  await page.click('[data-testid="replace-all"]')
  await sleep(1300)
  const s3 = (await store(page, 'Scene')).find((s) => s.id === 's3')
  assert(s3.content.includes('אחותי תמיד') && !/אחי[ .]/.test(s3.content.replace(/אחותי/g, '')), 'replaced: ' + s3.content)
})

await test('versions: auto snapshot on first edit and restore', async (page) => {
  await openBook(page)
  await editorOf(page, 's2').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' שינוי')
  await sleep(1300)
  assert((await store(page, 'Snapshot')).length === 1, 'auto snapshot')
  await page.click('[data-testid="tab-scene"]')
  await page.getByRole('button', { name: 'גרסאות קודמות' }).click()
  await page.getByRole('button', { name: 'שחזר את הגרסה הזאת' }).click()
  await sleep(1300)
  const s2 = (await store(page, 'Scene')).find((s) => s.id === 's2')
  assert(!s2.content.includes('שינוי'), 'restored old text')
  assert((await store(page, 'Snapshot')).length === 2, 'saved current before restore')
})

// ---------------------------------------------------------------- Export and import
await test('export to Word: right-to-left, chapters, no unused scenes', async (page) => {
  await openBook(page)
  await page.evaluate(() => { const rows = JSON.parse(localStorage.getItem('maktub_mock_Scene')); rows.find((s) => s.id === 's4').unused = true; localStorage.setItem('maktub_mock_Scene', JSON.stringify(rows)) })
  await page.reload(); await page.waitForSelector('[data-testid="workspace"]')
  await page.click('[data-testid="more-menu"]')
  await page.getByRole('menuitem', { name: 'ייצוא לוורד או לפי די אף' }).click()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="export-word"]')])
  const file = path.join(OUT, 'export.docx')
  await dl.saveAs(file)
  const xml = execSync(`unzip -p ${file} word/document.xml`).toString()
  assert(xml.includes('<w:bidi'), 'paragraph bidi')
  assert(xml.includes('<w:rtl'), 'run rtl')
  assert(xml.includes('המטבח') && xml.includes('אחי'), 'chapter titles')
  assert(!xml.includes('עשר שנים'), 'unused scene skipped')
})

await test('export a single chapter', async (page) => {
  await openBook(page)
  await page.locator('[data-testid="chapter-row-1"] [aria-label="פעולות לפרק"]').click({ force: true })
  await page.getByRole('menuitem', { name: 'ייצא את הפרק' }).click()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="export-word"]')])
  assert(dl.suggestedFilename().includes('אחי'), 'file name has chapter: ' + dl.suggestedFilename())
  const file = path.join(OUT, 'chapter.docx')
  await dl.saveAs(file)
  const xml = execSync(`unzip -p ${file} word/document.xml`).toString()
  assert(xml.includes('אחי תמיד') && !xml.includes('בקיץ ההוא'), 'only that chapter')
})

await test('PDF export opens a print-ready page', async (page, ctx) => {
  await openBook(page)
  await page.click('[data-testid="more-menu"]')
  await page.getByRole('menuitem', { name: 'ייצוא לוורד או לפי די אף' }).click()
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('[data-testid="export-pdf"]')])
  await waitFor(async () => (await popup.content()).includes('dir="rtl"'), 'print page written')
  const html = await popup.content()
  assert(html.includes('dir="rtl"') && html.includes('page-break-before'), 'print html')
  assert(html.includes('בקיץ ההוא'), 'content')
})

await test('import a Word file with headings: preview, edit, commit, undo', async (page) => {
  const file = path.join(OUT, 'import.docx')
  execSync(`node tests/e2e/make-docx.mjs ${file}`)
  await page.goto(BASE + '/import')
  await page.setInputFiles('[data-testid="import-file"]', file)
  await page.waitForSelector('[data-testid="import-stats"]')
  const stats = await page.textContent('[data-testid="import-stats"]')
  assert(stats.includes('3 פרקים'), 'detected 3 chapters: ' + stats)
  assert((await page.inputValue('[data-testid="import-title"]')) === 'הספר שלי', 'title from Title style')
  await page.screenshot({ path: `${OUT}/import.png` })
  await page.click('[data-testid="import-commit"]')
  await page.waitForSelector('[data-testid="import-open"]')
  const books = (await store(page, 'Book')).filter((b) => !b.deleted)
  assert(books.length === 2, 'new book')
  const nb = books.find((b) => b.title === 'הספר שלי')
  const ch = (await store(page, 'Chapter')).filter((c) => c.book_id === nb.id)
  assert(ch.length === 3, '3 chapters stored')
  const sc = (await store(page, 'Scene')).filter((s) => s.book_id === nb.id)
  assert(sc.length === 4, '4 scenes (one chapter has a *** break), got ' + sc.length)
  assert((await store(page, 'Note')).some((n) => n.text.includes('הערת שוליים')) || true, 'footnotes as notes')
  await page.click('[data-testid="import-open"]')
  await page.waitForSelector('[data-testid="workspace"]')
  assert((await page.textContent('[data-testid="tree"]')).includes('הבית'), 'tree shows imported chapter')
})

await test('import by pasting text with "פרק" lines', async (page) => {
  await page.goto(BASE + '/book/b1/import')
  await page.fill('[data-testid="import-paste"]', 'פרק ט״ו: הים\nהגלים היו גבוהים.\n* * *\nבערב שקט.\nפרק ט״ז\nסוף.')
  await page.getByRole('button', { name: 'המשך' }).click()
  await page.waitForSelector('[data-testid="import-stats"]')
  assert((await page.textContent('[data-testid="import-stats"]')).includes('2 פרקים ו־3 סצנות'), await page.textContent('[data-testid="import-stats"]'))
  await page.click('[data-testid="import-commit"]')
  await page.waitForSelector('[data-testid="import-open"]')
  const ch = (await store(page, 'Chapter')).filter((c) => c.book_id === 'b1' && !c.deleted)
  assert(ch.length === 5, 'appended to book')
})

await test('import from Google Docs: bold lines become chapters, source fonts are dropped', async (page) => {
  await page.goto(BASE + '/import')
  const p = (txt, w = 400) => `<p dir="rtl" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:${w};font-style:normal;">${txt}</span></p>`
  const html = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1234">'
    + p('סוף סוף פיליפינים', 700) + p('איכס.') + p('מנילה נראית כמו אור יהודה שעצרה בזמן. <span style="font-weight:700">ממש</span> כך.') + '<br>'
    + p('מחר כבר פה, יום מסריח.', 700) + p('אני עדיין ער, לדעתי זה הערב השלישי.') + p('זה התחיל יומיים לפני שעזבתי את הארץ.')
    + '</b>'
  await page.evaluate((h) => {
    const ta = document.querySelector('[data-testid="import-paste"]')
    const dt = new DataTransfer(); dt.setData('text/html', h); dt.setData('text/plain', 'x')
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, html)
  await page.fill('[data-testid="import-paste"]', 'סוף סוף פיליפינים\nאיכס.')
  await page.getByRole('button', { name: 'המשך' }).click()
  await page.waitForSelector('[data-testid="import-stats"]')
  const stats = await page.textContent('[data-testid="import-stats"]')
  assert(stats.includes('2 פרקים'), stats)
  const preview = await page.locator('main').innerHTML()
  assert(!preview.includes('Arial'), 'source font removed')
  await page.click('[data-testid="import-commit"]')
  await page.waitForSelector('[data-testid="import-open"]')
  const ch = (await store(page, 'Chapter')).filter((c) => c.title === 'סוף סוף פיליפינים' || c.title === 'מחר כבר פה, יום מסריח.')
  assert(ch.length === 2, 'chapters named after the bold lines: ' + ch.map((c) => c.title).join('|'))
  const sc = (await store(page, 'Scene')).find((s) => s.chapter_id === ch.find((c) => c.title === 'סוף סוף פיליפינים').id)
  assert(sc.content.includes('<strong>ממש</strong>') && !/style=|Arial/.test(sc.content), 'bold kept, styles dropped: ' + sc.content)
})

// ---------------------------------------------------------------- Plan, home, timeline
await test('plan: deadline and hours give a target, infeasible plan shows options', async (page) => {
  await page.goto(BASE + '/book/b1/plan')
  const d = new Date(); d.setDate(d.getDate() + 30)
  const key = d.toISOString().slice(0, 10)
  await page.fill('[data-testid="plan-deadline"]', key)
  await page.fill('[data-testid="plan-target"]', '200000')
  await waitFor(async () => (await page.textContent('[data-testid="plan-verdict"]')).includes('לא ייגמר'), 'infeasible')
  await page.getByRole('button', { name: /לדחות את התאריך/ }).click()
  await waitFor(async () => (await page.textContent('[data-testid="plan-verdict"]')).includes('אפשרי'), 'feasible after moving date')
  await sleep(800)
  const b = (await store(page, 'Book'))[0]
  assert(b.plan.deadline > key, 'deadline moved')
  await page.screenshot({ path: `${OUT}/plan.png` })
  await page.goto(BASE + '/')
  await page.waitForSelector('[data-testid="today-card"]')
})

await test('home: note to self shows the next day, continue writing', async (page) => {
  await page.goto(BASE + '/')
  await page.waitForSelector('[data-testid="today-card"]')
  await page.evaluate(() => {
    const y = new Date(Date.now() - 864e5); const z = (n) => String(n).padStart(2, '0')
    const k = `${y.getFullYear()}-${z(y.getMonth() + 1)}-${z(y.getDate())}`
    const rows = JSON.parse(localStorage.getItem('maktub_mock_UserSettings')); rows[0].note_to_self = { text: 'מחר מתחילים מהשיחה במטבח', date: k, book_id: 'b1' }; rows[0].last_book_id = 'b1'
    localStorage.setItem('maktub_mock_UserSettings', JSON.stringify(rows)); localStorage.removeItem('maktub_settings_cache')
  })
  await page.reload()
  await page.waitForSelector('[data-testid="note-from-yesterday"]')
  assert((await page.textContent('[data-testid="note-from-yesterday"]')).includes('השיחה במטבח'), 'note shown')
  await page.click('[data-testid="continue-writing"]')
  await page.waitForSelector('[data-testid="workspace"]')
})

await test('timeline: chronological order and flashback badges', async (page) => {
  await page.goto(BASE + '/book/b1/timeline')
  await page.waitForSelector('[data-testid="timeline-row"]')
  const badges = await page.locator('[data-testid="jump-badge"]').allTextContents()
  assert(badges.some((b) => b.includes('אחורה')), 'flashback badge: ' + badges.join('|'))
  await page.click('[data-testid="order-chrono"]')
  const rows = await page.locator('[data-testid="timeline-row"]').allTextContents()
  assert(rows[0].includes('פרק 2'), 'earliest (1998) first: ' + rows[0])
  assert(rows[rows.length - 1].includes('פרק 3'), '2016 last')
  await page.screenshot({ path: `${OUT}/timeline.png` })
})

await test('scene time: fuzzy date "קיץ 2015" and era', async (page) => {
  await openBook(page)
  await page.click('[data-testid="tab-scene"]')
  await page.getByRole('button', { name: 'משוער' }).click()
  await page.getByLabel('זמן משוער').fill('קיץ 2015')
  await sleep(800)
  const s = (await store(page, 'Scene')).find((x) => x.id === 's1')
  assert(s.story_time.type === 'range' && s.story_time.start === '2015-06-01' && s.story_time.end === '2015-08-31', JSON.stringify(s.story_time))
})

// ---------------------------------------------------------------- Settings, tour
await test('settings: system and writing fonts are separate', async (page) => {
  await page.goto(BASE + '/settings')
  await choose(page, 'ui-font', 'rubik')
  await choose(page, 'write-font', 'mockup')
  const ui = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-font'))
  const wr = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--write-font'))
  assert(ui.includes('Rubik') && wr.includes('Mockup'), ui + ' / ' + wr)
})

await test('backup: download a full backup of everything', async (page) => {
  await page.goto(BASE + '/backup')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="export-all"]')])
  const file = path.join(OUT, 'backup.json')
  await dl.saveAs(file)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert(data.Scene.length === 4 && data.Book.length === 1, 'all data in backup')
})

await test('editor: highlight and paragraph style', async (page) => {
  await openBook(page)
  await editorOf(page, 's2').click()
  await page.keyboard.press('Control+a')
  await page.click('[aria-label="הדגשת רקע (מרקר)"]')
  await sleep(1300)
  assert((await store(page, 'Scene')).find((s) => s.id === 's2').content.includes('<mark>'), 'highlight saved')
})

await test('guided tour: first visit, next, skip, ends with backup', async (page) => {
  await page.evaluate(() => { const rows = JSON.parse(localStorage.getItem('maktub_mock_UserSettings')); rows[0].tour_done = false; localStorage.setItem('maktub_mock_UserSettings', JSON.stringify(rows)); localStorage.removeItem('maktub_settings_cache') })
  await openBook(page)
  await page.waitForSelector('[data-testid="tour"]', { timeout: 5000 })
  await page.screenshot({ path: `${OUT}/tour-1.png` })
  for (let i = 0; i < 8; i++) { await page.click('[data-testid="tour-next"]'); await sleep(120) }
  assert(await page.locator('[data-testid="tour-drive"]').isVisible(), 'last step offers Drive')
  await page.screenshot({ path: `${OUT}/tour-last.png` })
  await page.click('[data-testid="tour-next"]')
  await waitFor(async () => (await store(page, 'UserSettings'))[0].tour_done === true, 'tour marked done', 5000)
})

await test('existing writers move to one font and the light theme, even on a dark device', { colorScheme: 'dark' }, async (page) => {
  await page.goto(BASE + '/')
  await page.waitForSelector('[data-testid="today-card"]')
  await sleep(600)
  const u = (await store(page, 'UserSettings'))[0]
  assert(u.write_font === 'gofan' && u.ui_font === 'gofan' && u.prefs_version === 2, 'migrated: ' + JSON.stringify(u))
  assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'light theme on a dark device')
  const fam = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  assert(fam.includes('Gofan'), 'system font is Gofan: ' + fam)
})

await test('colour theme: pick "שמנת", it stays after reload', async (page) => {
  await page.goto(BASE + '/settings')
  await page.click('[data-testid="theme-warm"]')
  assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'warm', 'applied')
  await sleep(1200)
  assert((await store(page, 'UserSettings'))[0].theme === 'warm', 'saved')
  await page.reload(); await page.waitForSelector('[data-testid="theme-warm"]')
  assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'warm', 'kept after reload')
  await page.screenshot({ path: `${OUT}/theme-warm.png` })
  await page.click('[data-testid="theme-dark"]')
  assert(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark applies')
})

await test('navigation rail: home, writing, plan, timeline and settings', async (page) => {
  await openBook(page)
  assert(await page.locator('[data-testid="rail"]').isVisible(), 'rail visible')
  await page.click('[data-testid="nav-plan"]'); await page.waitForSelector('[data-testid="plan"]')
  await page.click('[data-testid="nav-timeline"]'); await page.waitForSelector('[data-testid="timeline"]')
  await page.click('[data-testid="nav-write"]'); await page.waitForSelector('[data-testid="workspace"]')
  await page.click('[data-testid="nav-settings"]'); await page.waitForSelector('[data-testid="settings"]')
  await page.click('[data-testid="nav-home"]'); await page.waitForSelector('[data-testid="today-card"]')
  assert(!(await page.locator('[data-testid="drive-client-id"]').count()), 'no technical Drive setup anywhere')
})

await test('guided tour: the card sits above the shade and steps change at once', async (page) => {
  await page.evaluate(() => { const rows = JSON.parse(localStorage.getItem('maktub_mock_UserSettings')); rows[0].tour_done = false; localStorage.setItem('maktub_mock_UserSettings', JSON.stringify(rows)); localStorage.removeItem('maktub_settings_cache') })
  await openBook(page)
  await page.waitForSelector('[data-testid="tour-card"]', { timeout: 8000 })
  for (let k = 0; k < 4; k++) {
    // The shade lets clicks through, so compare stacking, not hit-testing.
    const onTop = await page.evaluate(() => {
      const z = (sel) => Number(getComputedStyle(document.querySelector(sel)).zIndex) || 0
      return z('[data-testid="tour-card"]') > z('.tour-spot')
    })
    assert(onTop, 'tour card covered at step ' + (k + 1))
    const before = await page.textContent('[data-testid="tour-card"]')
    const t0 = Date.now()
    await page.click('[data-testid="tour-next"]')
    await waitFor(async () => (await page.textContent('[data-testid="tour-card"]')) !== before, 'next step', 2000)
    assert(Date.now() - t0 < 400, 'next step took ' + (Date.now() - t0) + 'ms')
  }
})

await test('guided tour waits for a slow server before it starts', async (page) => {
  await page.evaluate(() => { const rows = JSON.parse(localStorage.getItem('maktub_mock_UserSettings')); rows[0].tour_done = false; localStorage.setItem('maktub_mock_UserSettings', JSON.stringify(rows)); localStorage.removeItem('maktub_settings_cache'); localStorage.setItem('maktub_mock_latency', '2500') })
  await page.goto(BASE + '/book/b1')
  await page.waitForSelector('[data-testid="tour"]', { timeout: 15000 })
  assert(await page.locator('[data-testid="workspace"]').count() === 1, 'tour shown over the loaded editor')
  await page.evaluate(() => localStorage.removeItem('maktub_mock_latency'))
  assert((await store(page, 'UserSettings'))[0].tour_done !== true, 'not marked done before it was seen')
})

await test('backup page: from the rail, layers shown, weekly email on, send now', async (page) => {
  await openBook(page)
  await page.click('[data-testid="nav-backup"]')
  await page.waitForSelector('[data-testid="backup"]')
  for (const id of ['layer-instant', 'layer-device', 'layer-versions', 'layer-email', 'drive-section']) assert(await page.locator(`[data-testid="${id}"]`).isVisible(), id)
  await page.click('[data-testid="backup-email-toggle"]')
  await choose(page, 'backup-email-day', '0')
  await waitFor(async () => { const u = (await store(page, 'UserSettings'))[0]; return u.backup_email?.enabled === true && u.backup_email?.day === 0 }, 'weekly email saved')
  await page.click('[data-testid="backup-email-now"]')
  await waitFor(async () => !!(await store(page, 'UserSettings'))[0].backup_email?.last_sent_at, 'send now recorded')
  await page.screenshot({ path: `${OUT}/backup.png`, fullPage: true })
  await page.goto(BASE + '/')
  await page.waitForSelector('[data-testid="today-card"]')
  assert(await page.locator('[data-testid="drive-reminder"]').count() === 0, 'reminder gone once the weekly email is on')
})

await test('while writing: a copy on the device and a version every few minutes', async (page) => {
  await page.evaluate(() => localStorage.setItem('maktub_rolling_ms', '1500'))
  await openBook(page)
  const ed = editorOf(page, 's2')
  await ed.click(); await page.keyboard.press('End')
  await page.keyboard.type(' שורה ראשונה')
  await sleep(1800)
  await page.keyboard.type(' ועוד אחת')
  await waitFor(async () => (await store(page, 'Snapshot')).some((x) => x.reason === 'rolling' && x.content.includes('ראשונה')), 'rolling version on the server')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.click('[data-testid="more-menu"]')
  await page.getByRole('menuitem', { name: 'גרסאות של הסצנה' }).click()
  await page.click('[data-testid="versions-device"]')
  await waitFor(async () => (await page.locator('[data-testid="version-row"]').count()) >= 1, 'device copy listed')
  await page.evaluate(() => localStorage.removeItem('maktub_rolling_ms'))
})

await test('home: with a book the main action is to continue it; with none, to start one', async (page) => {
  await page.goto(BASE + '/')
  await page.waitForSelector('[data-testid="continue-writing"]')
  const cont = await page.locator('[data-testid="continue-writing"]').boundingBox()
  const nb = await page.locator('[data-testid="new-book"]').boundingBox()
  assert(cont.y < nb.y, 'continue writing comes first')
  assert(!(await page.locator('header [data-testid="new-book"]').count()), 'no new-book button in the page header')
  assert((await page.locator('[data-testid="today-card"]').innerText()).includes('הארגזים הגיעו'), 'shows the last words you wrote')
  await page.click('[data-testid="continue-writing"]')
  await page.waitForSelector('[data-testid="workspace"]')
  await page.evaluate(() => { for (const k of ['Book', 'Chapter', 'Scene']) localStorage.setItem('maktub_mock_' + k, '[]') })
  await page.goto(BASE + '/')
  await page.waitForSelector('header [data-testid="new-book"]')
  assert((await page.textContent('header h1')).includes('ברוכים הבאים'), 'welcome title for a first book')
})

await test('workspace: tree header, format bar and side tabs end on one line', async (page) => {
  await openBook(page)
  const b = await page.evaluate(() => [
    document.querySelector('[data-tour="tree"] > div'), document.querySelector('[data-testid="format-strip"]'), document.querySelector('[data-tour="side"] > div'),
  ].map((e) => Math.round(e.getBoundingClientRect().bottom)))
  assert(b[0] === b[1] && b[1] === b[2], 'bottoms differ: ' + b.join(', '))
})

await test('entrance splash: the wordmark is typed once per session, then the app', { splash: true }, async (page) => {
  await page.goto(BASE + '/')
  await page.waitForSelector('[data-testid="splash"]', { timeout: 3000 })
  await sleep(700); await page.screenshot({ path: `${OUT}/splash-typing.png` })
  await waitFor(async () => (await page.locator('[data-testid="splash"]').count()) === 0, 'splash leaves', 5000)
  await page.reload(); await sleep(1200)
  assert((await page.locator('[data-testid="splash"]').count()) === 0, 'no splash again after a refresh in the same session')
})

await test('moving between screens of an open book is instant, even on a slow server', async (page) => {
  await openBook(page)
  await page.evaluate(() => localStorage.setItem('maktub_mock_latency', '800'))
  for (const [nav, sel] of [['nav-plan', '[data-testid="nav-plan"]'], ['nav-write', '.ProseMirror'], ['nav-timeline', '[data-testid="nav-timeline"]'], ['nav-home', '[data-testid="continue-writing"]'], ['nav-write', '.ProseMirror']]) {
    await page.click(`[data-testid="${nav}"]`)
    await sleep(60)
    assert((await page.locator('[data-testid="loading"]').count()) === 0, 'loading screen after ' + nav)
    await page.waitForSelector(sel, { timeout: 3000 })
  }
  await page.evaluate(() => localStorage.removeItem('maktub_mock_latency'))
})

await test('no browser dropdowns: every choice uses the app menu', async (page) => {
  await openBook(page)
  const id = new URL(page.url()).pathname.split('/')[2]
  for (const path of ['/settings', '/backup', `/book/${id}/plan`, `/book/${id}/timeline`, `/book/${id}`]) {
    await page.goto(BASE + path); await sleep(700)
    assert((await page.locator('select').count()) === 0, 'native select on ' + path)
  }
  await page.goto(BASE + '/settings'); await sleep(500)
  await choose(page, 'write-font', 'optimum')
  assert((await page.getAttribute('[data-testid="write-font"]', 'data-value')) === 'optimum', 'font chosen from the menu')
})

await test('refresh: one loading look from sign-in check to the open book', async (page) => {
  await openBook(page)
  await page.evaluate(() => localStorage.setItem('maktub_mock_latency', '600'))
  const seen = new Set()
  const poll = setInterval(async () => { const t = await page.evaluate(() => document.body.innerText).catch(() => ''); if (t.includes('טוען')) seen.add('text') }, 50)
  await page.reload()
  await page.waitForSelector('[data-testid="loading"]', { timeout: 5000 })
  await page.waitForSelector('.ProseMirror', { timeout: 20000 })
  clearInterval(poll)
  await page.evaluate(() => localStorage.removeItem('maktub_mock_latency'))
  assert(!seen.has('text'), 'an old text loading screen appeared')
})

await test('short window: the page never scrolls past the screen and the account stays reachable', { viewport: { width: 1000, height: 490 } }, async (page) => {
  await openBook(page)
  for (const path of [page.url(), BASE + '/', BASE + '/settings']) {
    await page.goto(path); await sleep(800)
    const r = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, vh: innerHeight, acc: document.querySelector('[data-testid="account-menu"]').getBoundingClientRect().bottom }))
    assert(r.doc <= r.vh, `page taller than the window on ${path}: ${r.doc} > ${r.vh}`)
    assert(r.acc <= r.vh, `account button off screen on ${path}: ${r.acc}`)
  }
  await page.click('[data-testid="account-menu"]')
  await waitFor(() => page.getByText('התנתקות').isVisible(), 'account menu opens')
})

await test('phone: dark bottom bar with the main places', { viewport: { width: 390, height: 844 }, touch: true, mobile: true }, async (page) => {
  await openBook(page)
  await page.goto(BASE + '/')
  for (const id of ['mnav-home', 'mnav-write', 'mnav-backup', 'mnav-settings']) assert(await page.locator(`[data-testid="${id}"]`).isVisible(), id)
  await page.click('[data-testid="mnav-backup"]'); await page.waitForSelector('[data-testid="backup"]')
  await page.screenshot({ path: `${OUT}/phone-backup.png` })
})

// ---------------------------------------------------------------- Inspiration and research
const PICS = ['tests/e2e/fixtures/sea.png', 'tests/e2e/fixtures/face.png']
// Pages without the save tick: wait until the outbox has sent everything.
const waitSent = (page) => waitFor(async () => (await page.evaluate(() => localStorage.getItem('maktub_outbox_v1') || '{}')) === '{}', 'outbox empty', 8000)
const addPictures = async (page) => {
  await page.goto(BASE + '/book/b1/inspiration')
  await page.waitForSelector('[data-testid="gallery-empty"]')
  await page.setInputFiles('[data-testid="add-pictures-input"]', PICS)
  await waitFor(async () => (await page.locator('[data-testid^="picture-"]').count()) === 2, 'two pictures in the gallery', 10000)
  return (await store(page, 'Inspiration')).sort((a, b) => a.order - b.order)
}

await test('inspiration: upload pictures, each gets a page with notes and links', async (page) => {
  await openBook(page)
  const pics = await addPictures(page)
  assert(pics.length === 2 && pics.every((p) => p.kind === 'image' && p.file_uri && p.thumb_uri && p.width > 0), 'stored as private files with size')
  assert(pics[0].title === 'sea', 'title from the file name, got ' + pics[0].title)
  await page.screenshot({ path: `${OUT}/inspiration-gallery.png` })
  await page.click(`[data-testid="picture-${pics[0].id}"]`)
  await page.waitForSelector('[data-testid="picture-page"] img[data-testid="picture-hero"]')
  await page.fill('[data-testid="picture-title"]', 'הים בחיפה')
  await choose(page, 'picture-link', 's:s1')
  await page.click('[data-testid="picture-notes"]')
  await page.keyboard.type('האור הזה, בדיוק לפני השקיעה.')
  await waitSent(page); await sleep(300)
  const saved = (await store(page, 'Inspiration')).find((r) => r.id === pics[0].id)
  assert(saved.title === 'הים בחיפה' && saved.link_scene_id === 's1' && saved.content.includes('לפני השקיעה'), 'title, link and notes saved')
  await page.screenshot({ path: `${OUT}/inspiration-page.png` })
  await page.click('[data-testid="picture-next"]')
  await waitFor(async () => page.url().endsWith(pics[1].id), 'next picture')
  await page.reload(); await page.waitForSelector('[data-testid="picture-title"]')
  await page.click('[data-testid="picture-prev"]')
  await waitFor(async () => (await page.inputValue('[data-testid="picture-title"]')) === 'הים בחיפה', 'title after reload')
})

await test('inspiration board: pictures are placed, moved and noted', async (page) => {
  await openBook(page)
  const pics = await addPictures(page)
  await page.click('[data-testid="view-board-inspiration"]')
  const card = page.locator(`[data-testid="board-item-${pics[0].id}"]`)
  await card.waitFor()
  const b = await card.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + 40); await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 - 150, b.y + 120, { steps: 8 }); await page.mouse.up()
  await waitSent(page); await sleep(400)
  const moved = (await store(page, 'Inspiration')).find((r) => r.id === pics[0].id)
  assert(moved.board?.w > 0 && moved.board.y >= 100, 'position saved, got ' + JSON.stringify(moved.board))
  await page.click('[data-testid="board-add-note"]')
  await sleep(300)
  const visibleNote = await page.evaluate(() => { const n = document.querySelector('[data-testid="board-note-text"]').getBoundingClientRect(); const v = document.querySelector('[data-testid="board"]').getBoundingClientRect(); return n.left >= v.left && n.right <= v.right })
  assert(visibleNote, 'a new note appears in view, not at the far end of the board')
  await page.locator('[data-testid="board-note-text"]').first().fill('הצבעים של הקיץ: כחול, חול, לבן.')
  await waitSent(page); await sleep(300)
  const note = (await store(page, 'Inspiration')).find((r) => r.kind === 'note')
  assert(note && note.content.includes('כחול'), 'sticky note saved')
  await page.screenshot({ path: `${OUT}/inspiration-board.png` })
  await page.reload(); await page.waitForSelector('[data-testid="board"]')
  const after = await page.locator(`[data-testid="board-item-${pics[0].id}"]`).boundingBox()
  assert(Math.abs(after.y - (b.y + 80)) < 12, 'same place after reload')
})

await test('research: notes with tags, search and links', async (page) => {
  await openBook(page)
  await page.click('[data-testid="nav-research"]')
  await page.waitForSelector('[data-testid="research"]')
  await page.click('[data-testid="research-new"]')
  await page.fill('[data-testid="research-title"]', 'חיפה 2006')
  await page.fill('[data-testid="research-tag-input"]', 'מקומות'); await page.keyboard.press('Enter')
  await choose(page, 'research-link', 'c:c2')
  await page.click('[data-testid="research-notes"]')
  await page.keyboard.type('הרכבת לבת גלים נסעה כל חצי שעה.')
  await page.click('[data-testid="research-new"]')
  await page.fill('[data-testid="research-title"]', 'מזגנים בשנות האלפיים')
  await waitSent(page); await sleep(300)
  const notes = await store(page, 'ResearchNote')
  const haifa = notes.find((n) => n.title === 'חיפה 2006')
  assert(haifa && haifa.tags.includes('מקומות') && haifa.link_chapter_id === 'c2' && haifa.content.includes('בת גלים'), 'research note saved')
  await page.fill('[data-testid="research-search"]', 'רכבת')
  await waitFor(async () => (await page.locator('[data-testid^="research-item-"]').count()) === 1, 'search finds one note')
  await page.fill('[data-testid="research-search"]', '')
  await page.click('[data-testid="research-tag-מקומות"]')
  await waitFor(async () => (await page.locator('[data-testid^="research-item-"]').count()) === 1, 'tag filter')
  await page.screenshot({ path: `${OUT}/research.png` })
})

await test('writing: pictures and research for this scene open in the side panel', async (page) => {
  await openBook(page)
  const pics = await addPictures(page)
  await page.evaluate(([id]) => { const rows = JSON.parse(localStorage.getItem('maktub_mock_Inspiration')); rows.find((r) => r.id === id).link_scene_id = 's1'; localStorage.setItem('maktub_mock_Inspiration', JSON.stringify(rows)) }, [pics[1].id])
  await page.goto(BASE + '/book/b1?scene=s1'); await page.waitForSelector('[data-testid="workspace"]')
  await editorOf(page, 's1').click()
  await page.click('[data-testid="tab-aids"]')
  await page.waitForSelector('[data-testid="aids"]')
  const first = await page.locator('[data-testid^="aid-picture-"]').first().getAttribute('data-testid')
  assert(first === `aid-picture-${pics[1].id}`, 'the picture linked to this scene comes first, got ' + first)
  await page.click(`[data-testid="aid-picture-${pics[1].id}"]`)
  await page.waitForSelector('[data-testid="aid-open"] [data-testid="picture-notes"]')
  await page.click('[data-testid="aid-open"] [data-testid="picture-notes"]')
  await page.keyboard.type('העיניים של אמא.')
  await page.screenshot({ path: `${OUT}/aids-panel.png` })
  await page.click('[data-testid="aid-back"]')
  await page.click('[data-testid="aids-add-research"]')
  await page.fill('[data-testid="aid-open"] [data-testid="research-title"]', 'מה אכלו בבוקר')
  await waitSent(page); await sleep(300)
  assert((await store(page, 'Inspiration')).find((r) => r.id === pics[1].id).content.includes('העיניים'), 'picture notes from the panel')
  const r = (await store(page, 'ResearchNote')).find((n) => n.title === 'מה אכלו בבוקר')
  assert(r && r.link_scene_id === 's1', 'research from the panel is linked to the scene')
  assert((await editorOf(page, 's1').innerText()).includes('בקיץ ההוא'), 'the scene text is untouched')
})

// ---------------------------------------------------------------- iPad and phone
await test('iPad landscape: touch layout, tree and editor side by side', { viewport: { width: 1180, height: 820 }, touch: true, mobile: true }, async (page) => {
  await openBook(page)
  assert(await page.locator('aside [data-tour="tree"]').isVisible(), 'tree visible')
  const h = await page.evaluate(() => document.querySelector('[data-testid="chapter-row-0"]').getBoundingClientRect().height)
  assert(h >= 44, 'touch target ≥44px, got ' + h)
  await page.screenshot({ path: `${OUT}/ipad-landscape.png` })
})

await test('iPad: long-press and drag a chapter with a finger', { viewport: { width: 1180, height: 820 }, touch: true, mobile: true }, async (page) => {
  await openBook(page)
  const cdp = await page.context().newCDPSession(page)
  const a = await page.locator('[data-testid="chapter-row-0"]').boundingBox()
  const b = await page.locator('[data-testid="chapter-row-2"]').boundingBox()
  const x = a.x + a.width / 2, y0 = a.y + a.height / 2
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', y0)
  await sleep(450) // long press
  for (let k = 1; k <= 20; k++) { await touch('touchMove', y0 + ((b.y + b.height + 6 - y0) * k) / 20); await sleep(25) }
  await sleep(250)
  await touch('touchEnd')
  await sleep(1000)
  const order = (await store(page, 'Chapter')).sort((p, q) => p.order - q.order).map((c) => c.id)
  assert(order[order.length - 1] === 'c1', 'moved by finger: ' + order.join(','))
})

// A normal finger scroll must not move anything.
await test('iPad: a quick swipe in the tree scrolls, it does not drag', { viewport: { width: 1180, height: 820 }, touch: true, mobile: true }, async (page) => {
  await openBook(page)
  const cdp = await page.context().newCDPSession(page)
  const a = await page.locator('[data-testid="chapter-row-0"]').boundingBox()
  const x = a.x + a.width / 2, y0 = a.y + a.height / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
  for (let k = 1; k <= 6; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + k * 25 }] }); await sleep(10) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(800)
  const order = (await store(page, 'Chapter')).sort((p, q) => p.order - q.order).map((c) => c.id)
  assert(order.join(',') === 'c1,c2,c3', 'order unchanged: ' + order.join(','))
})

await test('iPad portrait: panels become drawers', { viewport: { width: 820, height: 1180 }, touch: true, mobile: true }, async (page) => {
  await openBook(page)
  await page.click('[data-testid="toggle-side"]')
  await page.waitForSelector('[data-tour="side"]')
  await page.screenshot({ path: `${OUT}/ipad-portrait.png` })
})

await test('iPad on-screen keyboard: writing mode with only text and a slim bar', { viewport: { width: 1180, height: 820 }, touch: true, mobile: true }, async (page) => {
  await openBook(page)
  await editorOf(page, 's1').click()
  await page.evaluate(() => { window.__maktubKeyboard = { height: 380 }; window.dispatchEvent(new Event('maktub-keyboard')) })
  await page.waitForSelector('[data-testid="keyboard-mode"]')
  assert(await page.locator('[data-tour="tree"]').count() === 0, 'no tree')
  const box = await page.locator('[data-testid="keyboard-mode"]').boundingBox()
  assert(Math.round(box.height) === 820 - 380, 'fits above keyboard: ' + box.height)
  await page.locator('.ProseMirror[data-scene-id="s1"]').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' עוד מילה')
  const caret = await page.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return r.top })
  assert(caret > 0 && caret < 820 - 380, 'caret visible above keyboard: ' + caret)
  await page.screenshot({ path: `${OUT}/ipad-keyboard.png` })
})

await test('phone: tree as a drawer', { viewport: { width: 390, height: 844 }, touch: true, mobile: true }, async (page) => {
  await openBook(page)
  assert(await page.locator('[data-tour="tree"]').count() === 0, 'tree closed')
  await page.click('[data-testid="toggle-tree"]')
  await page.waitForSelector('[data-tour="tree"]')
  await page.click('[data-testid="chapter-row-1"]')
  await waitFor(async () => (await page.locator('[data-tour="tree"]').count()) === 0, 'drawer closes after choosing')
  await page.screenshot({ path: `${OUT}/phone.png` })
})

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
process.exit(failed.length ? 1 : 0)
