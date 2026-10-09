// Seeds the persistent test profile with a sample book.
import { chromium } from 'playwright-core'
const ctx = await chromium.launchPersistentContext('tests/e2e/artifacts/profile', { executablePath: '/opt/pw-browsers/chromium', viewport: { width: 1400, height: 900 } })
const page = ctx.pages()[0] || await ctx.newPage()
await page.goto('http://localhost:5199/')
await page.evaluate(() => {
  localStorage.clear()
  const now = new Date().toISOString()
  const mk = (o) => ({ created_date: now, updated_date: now, created_by: 'writer@example.com', ...o })
  const book = mk({ id: 'b1', title: 'הקיץ שעברנו צפונה', use_parts: false, deleted: false })
  const ch = [mk({ id: 'c1', book_id: 'b1', title: 'המטבח', kind: 'chapter', order: 0, deleted: false }), mk({ id: 'c2', book_id: 'b1', title: 'אחי', kind: 'chapter', order: 1, deleted: false }), mk({ id: 'c3', book_id: 'b1', title: 'הדירה החדשה', kind: 'chapter', order: 2, deleted: false })]
  const p = (t) => `<p>${t}</p>`
  const sc = [
    mk({ id: 's1', book_id: 'b1', chapter_id: 'c1', title: 'ההודעה', order: 0, status: 'draft', deleted: false, content: p('בקיץ ההוא, כשהמזגן במטבח עוד השמיע את הרעש הזה, אמא שלי החליטה שאנחנו עוברים דירה.') + p('"לאן?" שאלתי. היה לי בפה חצי פרוסה עם גבינה.'), word_count: 26, story_time: { type: 'exact', start: '2006-07' } }),
    mk({ id: 's2', book_id: 'b1', chapter_id: 'c1', title: 'הארגזים', order: 1, status: 'idea', deleted: false, content: p('הארגזים הגיעו ביום חמישי.'), word_count: 4, story_time: { type: 'relative', anchor_scene_id: 's1', offset_days: 14 } }),
    mk({ id: 's3', book_id: 'b1', chapter_id: 'c2', title: '', order: 0, status: 'draft', deleted: false, content: p('אחי תמיד ידע לאן הולכים.'), word_count: 5, story_time: { type: 'range', label: 'קיץ 1998', start: '1998-06-01', end: '1998-08-31' } }),
    mk({ id: 's4', book_id: 'b1', chapter_id: 'c3', title: '', order: 0, status: 'idea', deleted: false, content: p('עשר שנים אחר כך, ב־2016, חזרתי לבניין ההוא.'), word_count: 8, story_time: { type: 'exact', start: '2016' } }),
  ]
  localStorage.setItem('maktub_mock_Book', JSON.stringify([book]))
  localStorage.setItem('maktub_mock_Chapter', JSON.stringify(ch))
  localStorage.setItem('maktub_mock_Scene', JSON.stringify(sc))
  localStorage.setItem('maktub_mock_UserSettings', JSON.stringify([mk({ id: 'u1', tour_done: true, ui_font: 'gofan', write_font: 'frank', write_size: 19, read_size: 22, ipad_size: 17, theme: 'light', reading_theme: 'paper', typewriter: true })]))
})
await ctx.close()
console.log('seeded')
