import { chromium } from 'playwright'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const archiveRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(archiveRoot, 'competitor', 'ZIPPY_competitor_comparison.html')
const tableTarget = resolve(archiveRoot, 'competitor', 'ZIPPY_competitor_table_only.png')
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })

await page.goto(pathToFileURL(source).href, { waitUntil: 'networkidle' })
await page.locator('.comparison').screenshot({ path: tableTarget })
await browser.close()
console.log(tableTarget)
