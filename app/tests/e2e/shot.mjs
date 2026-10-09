// Usage: node tests/e2e/shot.mjs <path> <out.png> [width] [height] [skipTour]
import { chromium } from 'playwright-core'
const [, , path = '/', out = 'tests/e2e/artifacts/shot.png', w = '1400', h = '900'] = process.argv
const ctx = await chromium.launchPersistentContext('tests/e2e/artifacts/profile', { executablePath: '/opt/pw-browsers/chromium', viewport: { width: +w, height: +h }, locale: 'he-IL' })
const browser = ctx
const page = ctx.pages()[0] || await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + (m.location()?.url || '')) })
await page.goto('http://localhost:5199/')
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('maktub_settings_cache') || '{}'); s.tour_done = true; localStorage.setItem('maktub_settings_cache', JSON.stringify(s)); const rows = JSON.parse(localStorage.getItem('maktub_mock_UserSettings') || '[]'); rows.forEach((r) => r.tour_done = true); localStorage.setItem('maktub_mock_UserSettings', JSON.stringify(rows)) })
let target = path
if (path.includes('FIRSTBOOK')) {
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('maktub_mock_Book') || '[]').filter((b) => !b.deleted)[0]?.id)
  target = path.replace('FIRSTBOOK', id)
}
await page.goto('http://localhost:5199' + target)
await page.waitForTimeout(1800)
await page.screenshot({ path: out })
console.log(errors.join('\n') || 'no errors')
await browser.close()
