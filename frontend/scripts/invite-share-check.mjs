import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const source = app.slice(app.indexOf('  const shareInvite ='), app.indexOf('  const openInviteShare ='))
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })

function harness({ status = 'ready', failure, link = 'https://example.com/?invite=test' } = {}) {
  const calls = [], notices = []
  const context = {
    inviteLink: link, kakaoShareStatus: status, boot: { family: { name: '테스트 가족' } },
    window: { Kakao: { Share: { sendDefault: options => {
      calls.push(['kakao', options])
      return failure ? Promise.reject(failure) : Promise.resolve()
    } } } },
    navigator: { userAgent: 'iPhone', share: async () => { calls.push(['system']) } },
    copyInvite: async () => { calls.push(['copy']) },
    setToast: text => notices.push(text), setError: text => notices.push(text),
    DOMException,
  }
  return { share: runInNewContext(outputText + '\nshareInvite', context), calls, notices }
}

test('Kakao is called synchronously inside the click, including on mobile', async () => {
  const app = harness()
  const pending = app.share('kakao')
  assert.equal(app.calls[0]?.[0], 'kakao')
  assert.equal(app.calls[0][1].link.webUrl, 'https://example.com/?invite=test')
  await pending
  assert.equal(app.calls.length, 1)
})

test('SDK loading and missing invitation give feedback without opening a share', async () => {
  for (const options of [{ status: 'loading' }, { link: '' }]) {
    const app = harness(options)
    await app.share('kakao')
    assert.equal(app.calls.length, 0)
    assert.match(app.notices[0], /준비/)
  }
})

test('unavailable SDK falls back to the device share sheet', async () => {
  const app = harness({ status: 'unavailable' })
  await app.share('kakao')
  assert.equal(app.calls[0][0], 'system')
})

test('share failure is visible and does not silently copy the invitation', async () => {
  const app = harness({ failure: new Error('blocked') })
  await app.share('kakao')
  assert.equal(app.calls.length, 1)
  assert.match(app.notices[0], /열지 못했어요/)
})

test('cancelling a share is not an error', async () => {
  const app = harness({ failure: new DOMException('cancelled', 'AbortError') })
  await app.share('kakao')
  assert.equal(app.notices.length, 0)
})
