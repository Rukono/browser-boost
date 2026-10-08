// Pure helpers for browser-boost: no engine calls, so tests can exercise them directly.

export type Action = { name?: string; input?: Record<string, unknown> }

// Default screenshot scale when the model leaves it unset; click coordinates stay full-frame.
export const SCREENSHOT_SCALE = 0.6
// Standalone browser calls in a row before suggesting a batch.
export const NUDGE_AFTER = 3
// A find that returns at least this many matches gets a "be more specific" hint.
export const BROAD_FIND = 10

export const PLAYBOOK = `When driving a browser (Claude_Browser, claude-in-chrome or playwright tools):
- Read before you look: use get_page_text / read_page / find (or playwright browser_snapshot) to read text and get element refs. Take a screenshot only to check layout or visuals, or when the tree lacks the target.
- For one fact, use find with the exact words you expect (the link text, a label, a phrase from the sentence) instead of get_page_text. Keep find queries specific: a two-word topic can match dozens of elements.
- get_page_text opens with menus and sidebars; pass max_chars and expect to need find for anything below the fold.
- Text extraction drops the words inside links ("the study of the , , and"). When those words matter, zoom on the region or take one small screenshot.
- Click and type by \`ref\` from find/read_page rather than by pixel coordinates whenever a ref exists.
- After navigate (or any click that loads a new page), pixel coordinates are invalid until you take a new screenshot. Don't follow a navigate with a coordinate click in the same batch: batch navigate + find, then batch the ref click with the steps after it.
- A ref "outside the viewport" is hidden (a collapsed search box or menu): click the control that reveals it (search icon, menu button) first.
- Batch: whenever you can predict two or more steps (navigate → click → type → Enter → read), send them in one browser_batch call. End a batch with get_page_text or one screenshot, not one after every step.
- Screenshots: pass scale 0.5–0.6 unless you need fine detail; use zoom on a region instead of a full-size screenshot.
- Use form_input to set fields by ref instead of click + select-all + type.
- Navigate straight to a known URL (search results, deep links) rather than clicking through menus.
- Don't wait or re-screenshot speculatively; on a slow page use a single short wait, then read.`

export const HINTS = {
  staleView:
    'browser-boost: the page changed since your last screenshot, so coordinates are invalid. Instead of taking a screenshot, use find or read_page to get a ref and click by ref.',
  hiddenRef:
    'browser-boost: that element is hidden (often a collapsed search box or menu). Click the control that reveals it, such as a search icon or menu button, then retry by ref.',
  broadFind: (n: number) =>
    `browser-boost: find returned ${n} matches. Next time use the exact link or button text, or a phrase from the target sentence, so it returns a few.`,
  batch: `browser-boost: ${NUDGE_AFTER} single browser calls in a row. If you can predict the next steps, send them together in one browser_batch call.`,
}

/** The input with the default scale added when it is a screenshot without one. */
export const withScale = (input: Record<string, unknown>) =>
  input.action === 'screenshot' && input.scale === undefined ? { ...input, scale: SCREENSHOT_SCALE } : input

const isCoordinateAction = (a: Action) =>
  a.name === 'computer' && a.input?.coordinate !== undefined && a.input?.ref === undefined

/** Index of the first coordinate action that follows a navigate with no screenshot in between, or -1. */
export const staleCoordinateAction = (actions: readonly Action[]) => {
  let isStale = false
  for (const [i, a] of actions.entries()) {
    if (a.name === 'navigate') isStale = true
    else if (a.name === 'computer' && a.input?.action === 'screenshot') isStale = false
    else if (isStale && isCoordinateAction(a)) return i
  }
  return -1
}

// Image tokens are about width × height / 750.
const imageTokens = (w: number, h: number) => (w * h) / 750

/**
 * Tokens saved by the first `count` screenshots this mod scaled, read off the
 * "coordinate frame: WxH" the browser reports for each scaled screenshot.
 */
export const tokensSaved = (text: string, count: number) => {
  const frames = [...text.matchAll(/scale view; coordinate frame: (\d+)x(\d+)/g)].slice(0, count)
  return Math.round(
    frames.reduce((sum, [, w, h]) => sum + imageTokens(+w, +h) * (1 - SCREENSHOT_SCALE ** 2), 0),
  )
}

/** The match count of a find result, or 0. */
export const findMatches = (text: string) => Number(/Found (\d+) match/.exec(text)?.[1] ?? 0)

/** The hints a result's text calls for. */
export const resultHints = (text: string) => {
  const hints: string[] = []
  if (/not screenshotted/.test(text)) hints.push(HINTS.staleView)
  if (/outside the viewport/.test(text)) hints.push(HINTS.hiddenRef)
  const n = findMatches(text)
  if (n >= BROAD_FIND) hints.push(HINTS.broadFind(n))
  return hints
}

export const formatStatus = (calls: number, batched: number, saved: number) =>
  `browser ${calls} calls · ${batched} batched` + (saved > 0 ? ` · ~${(saved / 1000).toFixed(1)}k tokens saved` : '')
