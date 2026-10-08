import type { Register } from 'claude-code'
import {
  type Action,
  HINTS,
  NUDGE_AFTER,
  PLAYBOOK,
  formatStatus,
  resultHints,
  staleCoordinateAction,
  tokensSaved,
  withScale,
} from './lib.ts'

// Browser MCP servers whose `computer` tool takes a `scale` and that have a `browser_batch`.
const BATCHING = /^mcp__(Claude_Browser|claude-in-chrome)__/
const BROWSER = /^mcp__(Claude_Browser|claude-in-chrome|playwright)__/

export const register: Register = on => {
  let streak = 0
  let calls = 0
  let batched = 0
  let saved = 0

  // Rides the first user message's context blocks, so it stays in the prompt cache.
  on('prompt.context', async ($, e, next) => {
    const ctx = await next(e)
    return { ...ctx, blocks: [...ctx.blocks, { name: 'browserPlaybook', text: PLAYBOOK }] }
  })

  on('tool.call', { tool: /^mcp__(Claude_Browser|claude-in-chrome|playwright)__/ }, async ($, e, next) => {
    const name = e.tool.replace(BROWSER, '')
    const isBatching = BATCHING.test(e.tool)
    let input = e

    if (isBatching && name === 'computer') {
      input = withScale(e as Record<string, unknown>) as typeof e
    } else if (isBatching && name === 'browser_batch' && Array.isArray(e.actions)) {
      // The browser refuses a coordinate click on a page it hasn't screenshotted; catch it before any step runs.
      const stale = staleCoordinateAction(e.actions as Action[])
      if (stale !== -1) {
        return {
          deny: `browser-boost: actions[${stale}] clicks by coordinate after a navigate with no screenshot in between, so it would fail. Batch navigate + find first, then click by ref in a second batch.`,
        }
      }
      const actions = (e.actions as Action[]).map(a =>
        a.name === 'computer' && a.input ? { ...a, input: withScale(a.input) } : a,
      )
      input = { ...e, actions } as typeof e
    }

    const ran = await next(input)
    if (ran.deny !== undefined) return ran

    const text = ran.text ?? ''
    calls++
    saved += tokensSaved(text)
    if (name === 'browser_batch') {
      batched++
      streak = 0
    } else if (isBatching) {
      streak++
    }
    $.ui.status(formatStatus(calls, batched, saved))

    const hints = resultHints(text)
    if (streak === NUDGE_AFTER && ran.isError === undefined) hints.push(HINTS.batch)
    return hints.length > 0 ? { ...ran, context: [...(ran.context ?? []), ...hints] } : ran
  }).catch(($, e, next) => next(e))
}
