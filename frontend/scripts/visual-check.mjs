import { chromium } from 'playwright'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await chromium.launch({ executablePath: edgePath, headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
  await page.getByText('할머니와 태권도로 이동 중').waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-home.png'), fullPage: true })
  await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: /가족/ }).click()
  await page.getByText('확인 필요').first().waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-family.png'), fullPage: true })
  await page.getByRole('button', { name: '확인하기' }).first().click()
  await page.getByText('돌봄 예정 일시').waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-review.png'), fullPage: true })
  await page.getByRole('button', { name: '뒤로 가기' }).click()
  await page.getByRole('button', { name: '알림장 촬영' }).click()
  await page.getByText('흩어진 안내를').waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-capture.png'), fullPage: true })
  console.log('Mobile screens rendered: home, family, review, capture')
} finally {
  await browser.close()
}
