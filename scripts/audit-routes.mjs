/**
 * Route audit script.
 *
 * Visits every route, waits for the loading state to settle inside the page,
 * and records the resulting heading, access state and any console errors.
 *
 *   node scripts/audit-routes.mjs
 *
 * Requires the dev server to be running.
 */
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const CHROME =
  process.env.CHROME_PATH ??
  'C:/Program Files/Google/Chrome/Application/chrome.exe'

/** Routes under audit, grouped by the state they are expected to reach. */
const ROUTES = [
  { path: '/', expect: 'h1: Learn Today. Build a Brighter Tomorrow' },
  // With a session present the login screen correctly bounces to the
  // dashboard, so that redirect is what is asserted here.
  { path: '/login', expect: 'h1: Dashboard' },
  { path: '/classes', expect: 'h1: Select Your Class' },
  { path: '/classes/7', expect: 'h1: Class 7' },
  { path: '/classes/10', expect: 'h1: Class 10' },
  { path: '/classes/11', expect: 'h1: Class 11' },
  { path: '/classes/12', expect: 'h1: Class 12' },
  // Class 9 has no stream step, so the purchase page is directly reachable.
  { path: '/purchase/9', expect: 'h1: Class 9 Complete Access' },
  // Reachable with no router state thanks to the ?class= fallback.
  { path: '/payment/failed?class=9', expect: 'h1: Payment Failed' },
  { path: '/faq', expect: 'h1: Frequently Asked Questions' },
  { path: '/not-a-real-page', expect: 'h1: Page Not Found' },

  // Student area — requires a session
  { path: '/dashboard', expect: 'h1: Dashboard', auth: true },
  { path: '/dashboard/classes', expect: 'h1: My Classes', auth: true },
  { path: '/dashboard/notifications', expect: 'h1: Notifications', auth: true },
  { path: '/library', expect: 'h1: My Library', auth: true },
  { path: '/profile', expect: 'h1: My Profile', auth: true },
  { path: '/search', expect: 'h1: Search', auth: true },

  // Unlocked class (Class 10 is seeded as purchased)
  { path: '/classes/10/subjects', expect: 'h1: Class 10', auth: true },
  {
    path: '/classes/10/subjects/c10-math/chapters',
    expect: 'h1: Mathematics',
    auth: true,
  },
  { path: '/chapters/c10-math-ch1/content', expect: 'h1: Real Numbers', auth: true },
  { path: '/pyqs/c10-math', expect: 'h1: Previous Year Questions', auth: true },

  // Locked class — must show the restricted state, never content
  { path: '/classes/11/subjects', expect: 'h1: Access Restricted', auth: true },
  { path: '/pyqs/c11-sci-phy', expect: 'h1: Access Restricted', auth: true },
  { path: '/classes/12/subjects', expect: 'h1: Access Restricted', auth: true },
]

const WAIT_IN_PAGE = `(async () => {
  const settle = async () => {
    for (let i = 0; i < 80; i += 1) {
      const busy = document.body.innerText.includes('Checking your')
        || document.body.innerText.includes('Loading…')
        || document.body.innerText.includes('Preparing your document')
      if (!busy) return true
      await new Promise(r => setTimeout(r, 120))
    }
    return false
  }
  await settle()
  await new Promise(r => setTimeout(r, 700))
  const h1 = document.querySelector('h1')
  return {
    h1: h1 ? h1.innerText.trim() : null,
    headings: [...document.querySelectorAll('h1,h2,h3')].map(h => h.tagName + ': ' + h.innerText.trim().split('\\n')[0].slice(0, 44)),
    locked: document.body.innerText.includes('Access Restricted') || document.body.innerText.includes('Content Locked'),
    pdfCanvases: document.querySelectorAll('.pdf-page canvas').length,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  }
})()`

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 220))
})
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + String(err).slice(0, 220)))

// Seed an authenticated session the same way the mock service does.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
await page.evaluate(() => {
  sessionStorage.setItem(
    'vpedia.mock.session',
    JSON.stringify({
      id: 'usr_demo_001',
      name: 'Rahul Sharma',
      email: 'rahul@gmail.com',
      avatarUrl: null,
      currentClassId: 10,
      joinedAt: '2026-10-05T09:12:00.000Z',
      status: 'active',
    }),
  )
})

const results = []
let failures = 0

for (const route of ROUTES) {
  const url = route.raw ? `${BASE}${route.path}` : `${BASE}${route.path}`
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.evaluate(WAIT_IN_PAGE)

  const data = await page.evaluate(WAIT_IN_PAGE)
  const expected = route.expect ?? ''
  const [kind, wanted] = expected.split(': ')
  // Headings may wrap across lines; compare on collapsed whitespace.
  const normalise = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
  const actual = kind === 'h1' ? normalise(data.h1) : null
  const ok = actual === normalise(wanted)
  if (!ok) failures += 1

  results.push({
    route: route.path,
    ok,
    h1: actual,
    wanted,
    headings: data.headings.slice(0, 5),
    locked: data.locked,
    pdfCanvases: data.pdfCanvases,
    horizontalOverflow: data.scrollW > data.clientW + 1,
  })
}

await browser.close()

/* ---------------------------------------------------------------------
   Report
   ------------------------------------------------------------------ */

const pad = (value, width) => String(value ?? '').padEnd(width)
console.log('')
console.log(pad('ROUTE', 46) + pad('OK', 6) + 'H1 / STATE')
console.log('-'.repeat(96))
for (const r of results) {
  const note = r.ok ? '' : `  (expected "${r.wanted}")`
  const h1 = String(r.h1 ?? '').replace(/\s+/g, ' ')
  console.log(pad(r.route, 46) + pad(r.ok ? 'pass' : 'FAIL', 6) + pad(h1, 34) + note)
}

console.log('')
const overflow = results.filter((r) => r.horizontalOverflow)
console.log(`Routes audited      : ${results.length}`)
console.log(`Failures            : ${failures}`)
console.log(`Horizontal overflow : ${overflow.length}${overflow.length ? ` (${overflow.map((o) => o.route).join(', ')})` : ''}`)
console.log(`Console errors      : ${consoleErrors.length}`)
for (const e of [...new Set(consoleErrors)].slice(0, 12)) console.log(`  - ${e}`)

process.exit(failures > 0 || consoleErrors.length > 0 ? 1 : 0)
