import { test, expect } from 'claude-code/testing'
import { formatStatus, tokensSaved } from './lib.ts'

const SHOT = 'mcp__Claude_Browser__computer'
const BATCH = 'mcp__Claude_Browser__browser_batch'

test('screenshots without a scale get the default scale', async ($, on) => {
  const seen: Record<string, unknown>[] = []
  on('tool.call', { tool: SHOT }, (_$, e) => {
    seen.push(e as Record<string, unknown>)
    return { result: 'ok' }
  })
  await $.tool.call({ tool: SHOT, action: 'screenshot' })
  await $.tool.call({ tool: SHOT, action: 'screenshot', scale: 1 })
  await $.tool.call({ tool: SHOT, action: 'left_click', coordinate: [1, 2] })
  expect(seen[0].scale).toBe(0.6)
  expect(seen[1].scale).toBe(1)
  expect(seen[2].scale).toBe(undefined)
})

test('screenshots inside a batch get the default scale', async ($, on) => {
  let actions: { name: string; input: Record<string, unknown> }[] = []
  on('tool.call', { tool: BATCH }, (_$, e) => {
    actions = (e as { actions: typeof actions }).actions
    return { result: 'ok' }
  })
  await $.tool.call({
    tool: BATCH,
    actions: [
      { name: 'navigate', input: { url: 'example.com' } },
      { name: 'computer', input: { action: 'screenshot' } },
    ],
  })
  expect(actions[0].input).toEqual({ url: 'example.com' })
  expect(actions[1].input.scale).toBe(0.6)
})

test('three single calls in a row nudge toward browser_batch', async ($, on) => {
  on('tool.call', { tool: SHOT }, () => ({ result: 'ok' }))
  const a = await $.tool.call({ tool: SHOT, action: 'left_click', coordinate: [1, 1] })
  await $.tool.call({ tool: SHOT, action: 'left_click', coordinate: [1, 1] })
  const c = await $.tool.call({ tool: SHOT, action: 'left_click', coordinate: [1, 1] })
  expect(a.context).toBe(undefined)
  expect(String(c.context)).toContain('browser_batch')
})

test('a coordinate click right after navigate in a batch is refused before it runs', async ($, on) => {
  let ran = false
  on('tool.call', { tool: BATCH }, () => {
    ran = true
    return { result: 'ok' }
  })
  const res = await $.tool.call({
    tool: BATCH,
    actions: [
      { name: 'navigate', input: { url: 'example.com' } },
      { name: 'computer', input: { action: 'left_click', coordinate: [400, 588] } },
    ],
  })
  expect(ran).toBe(false)
  expect(String(res.deny)).toContain('click by ref')
})

test('a batch with a screenshot or a ref click after navigate runs', async ($, on) => {
  let runs = 0
  on('tool.call', { tool: BATCH }, () => {
    runs++
    return { result: 'ok' }
  })
  await $.tool.call({
    tool: BATCH,
    actions: [
      { name: 'navigate', input: { url: 'example.com' } },
      { name: 'computer', input: { action: 'screenshot' } },
      { name: 'computer', input: { action: 'left_click', coordinate: [1, 1] } },
    ],
  })
  await $.tool.call({
    tool: BATCH,
    actions: [
      { name: 'navigate', input: { url: 'example.com' } },
      { name: 'computer', input: { action: 'left_click', ref: 'ref_7' } },
    ],
  })
  expect(runs).toBe(2)
})

test('a stale-view click error gets a hint to click by ref', async ($, on) => {
  on('tool.call', { tool: SHOT }, () => ({
    isError: true as const,
    result: undefined,
    text: 'left_click: this tab has loaded a different site or document that you have not screenshotted yet',
  }))
  const res = await $.tool.call({ tool: SHOT, action: 'left_click', coordinate: [1, 1] })
  expect(String(res.context)).toContain('click by ref')
})

test('a hidden-ref error gets a hint to reveal the element first', async ($, on) => {
  on('tool.call', { tool: SHOT }, () => ({
    isError: true as const,
    result: undefined,
    text: 'ref ref_58 is entirely outside the viewport (center (0, 0)) — likely hidden or off-canvas',
  }))
  const res = await $.tool.call({ tool: SHOT, action: 'left_click', ref: 'ref_58' })
  expect(String(res.context)).toContain('search icon or menu button')
})

test('a find with many matches gets a be-specific hint, a narrow one does not', async ($, on) => {
  const FIND = 'mcp__Claude_Browser__find'
  let matches = 20
  on('tool.call', { tool: FIND }, () => ({ result: 'ok', text: `Found ${matches} match(es) for "x":` }))
  const broad = await $.tool.call({ tool: FIND, query: 'information theory' })
  matches = 1
  const narrow = await $.tool.call({ tool: FIND, query: 'is the mathematical study' })
  expect(String(broad.context)).toContain('find returned 20 matches')
  expect(narrow.context).toBe(undefined)
})

test('tokensSaved counts every scaled screenshot against its full size', () => {
  const two =
    'Screenshot size: 480x365 0.6-scale view; coordinate frame: 800x609.\n' +
    'Successfully captured screenshot (941x463, jpeg) — 0.6-scale view; coordinate frame: 1568x772.'
  // 800 × 609 / 750 ≈ 650 tokens at full size, 64% saved; 1568 × 772 / 750 ≈ 1614, 64% saved.
  expect(tokensSaved(two)).toBe(416 + 1033)
  expect(tokensSaved('Screenshot size: 400x305 0.5-scale view; coordinate frame: 800x609.')).toBe(487)
  expect(tokensSaved('Screenshot size: 800x609')).toBe(0)
})

test('formatStatus shows savings only once there are some', () => {
  expect(formatStatus(3, 1, 0)).toBe('browser 3 calls · 1 batched')
  expect(formatStatus(3, 1, 1250)).toBe('browser 3 calls · 1 batched · ~1.3k tokens saved')
})
