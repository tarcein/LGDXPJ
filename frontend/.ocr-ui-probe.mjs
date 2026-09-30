import { chromium } from 'playwright'
import { resolve } from 'node:path'

const baseUrl = process.argv[2]
const imagePath = resolve(process.cwd(), '..', 'asset', 'AI채팅', '1.png')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

page.on('requestfailed', request => {
  if (request.url().includes('/api/')) {
    console.log('REQUEST_FAILED', request.method(), request.url(), request.failure()?.errorText)
  }
})
page.on('response', async response => {
  if (response.url().includes('/api/intakes/photo')) {
    console.log('OCR_RESPONSE', response.status(), response.url(), await response.text())
  }
})

try {
  await page.goto(`${baseUrl}/?screen=capture`, { waitUntil: 'networkidle' })
  await page.getByLabel('앨범에서 알림장 사진 업로드').setInputFiles(imagePath)
  const analyze = page.getByRole('button', { name: '사진 분석하기' })
  if (await analyze.isDisabled()) {
    const childButtons = page.locator('.child-picker button')
    console.log('CHILD_BUTTONS', await childButtons.allTextContents())
    await childButtons.first().click()
  }
  await analyze.click()
  await page.waitForTimeout(10000)
  console.log('BODY_TEXT', (await page.locator('body').innerText()).slice(-1000))
} finally {
  await browser.close()
}
