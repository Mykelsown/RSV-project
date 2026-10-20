/* Dev only: verifies that the landing and login pages have no horizontal
   page scroll at the tested widths. Not part of the production bundle and
   not a test dependency: it drives the locally installed Chrome through
   puppeteer-core (fetched temporarily via npx) and only loads dist assets
   from vite preview.

   Usage:
     npm run build
     npm run preview &
     npx -y puppeteer-core@23 node scripts/overflow-check.mjs
     (or PREVIEW_URL=http://localhost:4173 node scripts/overflow-check.mjs)
*/

import puppeteer from 'puppeteer-core'

const WIDTHS = [360, 390, 414, 768, 1024, 1280, 1536]
const BASE = process.env.PREVIEW_URL || 'http://localhost:4173'
const PAGES = ['/', '/login']

const findChrome = () => {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ]
  const found = candidates.find(Boolean)
  if (!found) throw new Error('Set CHROME_PATH or install Chrome at /usr/bin/google-chrome')
  return found
}

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
})

let failures = 0
for (const path of PAGES) {
  for (const width of WIDTHS) {
    // portrait everywhere, landscape on the narrow phones
    const orientations = width < 768 ? ['portrait', 'landscape'] : ['portrait']
    for (const orientation of orientations) {
      const viewWidth = orientation === 'landscape' ? 414 : width
      const viewHeight = orientation === 'landscape' ? Math.round(width * 0.8) : Math.round(width * 1.8)
      const page = await browser.newPage()
      await page.setViewport({ width: viewWidth, height: viewHeight })
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30000 })
      // give lazy sections and fonts a moment
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)))
      const result = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      const overflow = result.scrollWidth > result.clientWidth + 1
      if (overflow) failures += 1
      console.log(`${path} @ ${viewWidth}px ${orientation}: scrollWidth=${result.scrollWidth} clientWidth=${result.clientWidth}${overflow ? ' OVERFLOW' : ' ok'}`)
      await page.close()
    }
  }
}

await browser.close()
if (failures > 0) {
  console.error(`\n${failures} overflow case(s) found.`)
  process.exit(1)
}
console.log('\nNo horizontal overflow at any tested width.')
