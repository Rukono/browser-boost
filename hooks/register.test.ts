import { test, expect } from 'claude-code/testing'

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
