import { chromium } from 'playwright-core'
const OUT = 'tests/e2e/artifacts'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await page.goto('http://localhost:5199/')
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/home.png` })
await page.click('[data-testid="new-book"]')
await page.fill('[data-testid="new-book-title"]', 'ספר בדיקה')
await page.click('[data-testid="create-book"]')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/workspace.png` })
console.log(errors.join('\n') || 'no errors')
await browser.close()
