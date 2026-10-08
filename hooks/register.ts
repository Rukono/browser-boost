import type { Register } from 'claude-code'

// Browser MCP servers whose `computer` tool takes a `scale` and that have a `browser_batch`.
const BATCHING = /^mcp__(Claude_Browser|claude-in-chrome)__/
const BROWSER = /^mcp__(Claude_Browser|claude-in-chrome|playwright)__/

// Default screenshot scale when the model leaves it unset; click coordinates stay full-frame.
const SCREENSHOT_SCALE = 0.6
// Standalone browser calls in a row before suggesting a batch.
const NUDGE_AFTER = 3

const PLAYBOOK = `When driving a browser (Claude_Browser, claude-in-chrome or playwright tools):
- Read before you look: use get_page_text / read_page / find (or playwright browser_snapshot) to read text and get element refs. Take a screenshot only to check layout or visuals, or when the tree lacks the target.
- Click and type by \`ref\` from find/read_page rather than by pixel coordinates whenever a ref exists.
- After navigate (or any click that loads a new page), pixel coordinates are invalid until you take a new screenshot. Don't follow a navigate with a coordinate click in the same batch: batch navigate + find, then batch the ref click with the steps after it.
- Batch: whenever you can predict two or more steps (navigate → click → type → Enter → read), send them in one browser_batch call. End a batch with get_page_text or one screenshot, not one after every step.
- Screenshots: pass scale 0.5–0.6 unless you need fine detail; use zoom on a region instead of a full-size screenshot.
- Use form_input to set fields by ref instead of click + select-all + type.
- Navigate straight to a known URL (search results, deep links) rather than clicking through menus.
- Don't wait or re-screenshot speculatively; on a slow page use a single short wait, then read.`

const STALE_VIEW_HINT =
  'browser-boost: the page changed since your last screenshot, so coordinates are invalid. Instead of taking a screenshot, use find or read_page to get a ref and click by ref.'

type Action = { name?: string; input?: Record<string, unknown> }

const isCoordinateAction = (a: Action) =>
  a.name === 'computer' && a.input?.coordinate !== undefined && a.input?.ref === undefined

// Index of the first coordinate action that follows a navigate with no screenshot in between, or -1.
const staleCoordinateAction = (actions: Action[]) => {
  let isStale = false
  for (const [i, a] of actions.entries()) {
    if (a.name === 'navigate') isStale = true
    else if (a.name === 'computer' && a.input?.action === 'screenshot') isStale = false
    else if (isStale && isCoordinateAction(a)) return i
  }
  return -1
}

const withScale = (input: Record<string, unknown>) =>
  input.action === 'screenshot' && input.scale === undefined ? { ...input, scale: SCREENSHOT_SCALE } : input

export const register: Register = on => {
  let streak = 0
  let calls = 0
  let batched = 0

  // Rides the first user message's context blocks, so it stays in the prompt cache.
  on('prompt.context', async ($, e, next) => {
    const ctx = await next(e)
    return { ...ctx, blocks: [...ctx.blocks, { name: 'browserPlaybook', text: PLAYBOOK }] }
  })

  on('tool.call', { tool: /^mcp__(Claude_Browser|claude-in-chrome|playwright)__/ }, async ($, e, next) => {
    const name = e.tool.replace(BROWSER, '')
    let input = e

    if (BATCHING.test(e.tool) && name === 'computer') {
      input = withScale(e as Record<string, unknown>) as typeof e
    } else if (BATCHING.test(e.tool) && name === 'browser_batch' && Array.isArray(e.actions)) {
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

    calls++
    if (name === 'browser_batch') {
      batched++
      streak = 0
    } else if (BATCHING.test(e.tool)) {
      streak++
    }
    $.ui.status(`browser ${calls} calls · ${batched} batched`)

    if (ran.isError === true && /not screenshotted/.test(ran.text ?? '')) {
      return { ...ran, context: [...(ran.context ?? []), STALE_VIEW_HINT] }
    }

    if (streak === NUDGE_AFTER && ran.deny === undefined && ran.isError === undefined) {
      return {
        ...ran,
        context: [
          ...(ran.context ?? []),
          `browser-boost: ${NUDGE_AFTER} single browser calls in a row. If you can predict the next steps, send them together in one browser_batch call.`,
        ],
      }
    }
    return ran
  }).catch(($, e, next) => next(e))
}
