# browser-boost

A Claude Code mod that makes Claude cheaper and faster at driving a browser
(the built-in browser pane, Claude in Chrome, or Playwright MCP).

## What it does

- **Browser playbook**: adds a short set of rules to each conversation. Claude
  reads page text before taking screenshots, clicks by element ref instead of
  pixel coordinates, batches predictable steps, uses `form_input` for fields,
  and navigates straight to known URLs.
- **Smaller screenshots**: a screenshot without an explicit `scale` is taken at
  0.6 scale (about 64% fewer image tokens). This applies inside `browser_batch`
  too. Click coordinates stay in the full-size frame, and an explicit `scale`
  is left alone.
- **Stale-view guard**: a `browser_batch` that clicks by pixel coordinate right
  after a `navigate`, with no screenshot in between, is refused before any step
  runs, because the browser would reject that click. Claude is told to look up
  the element with `find` and click by ref instead. A single coordinate click
  that fails for the same reason gets the same hint.
- **Recovery hints**: when a call goes wrong in a known way, Claude gets a
  one-line fix with the result: a hidden element (reveal it first), a page
  that changed since the last screenshot (click by ref), or a `find` that
  matched 10 or more elements (use the exact link text).
- **Batch nudge**: after 3 single browser calls in a row, Claude gets a
  reminder to group its next steps into one `browser_batch` call.
- **Status line**: shows `browser N calls · M batched · ~Xk tokens saved`.
  The savings count is measured from each screenshot the mod scaled.

## Measured savings

On a multi-page Wikipedia task (search, read a fact, follow a link, read
again), the same task used **24% fewer tokens** with browser-boost, and about
40% fewer once avoidable lookup mistakes were removed. The browser needed
half as many calls. On a two-screenshot task, the saving was about 8%: the
gain grows with the number of screenshots.

## Install

```
/plugin install browser-boost --marketplace Rukono/browser-boost
```

Answer `y` to add the marketplace, then pick a scope (user scope enables it
everywhere).

## Tuning

Edit the constants at the top of `hooks/lib.ts`:

- `SCREENSHOT_SCALE` (default `0.6`): the default screenshot scale.
- `NUDGE_AFTER` (default `3`): how many single calls in a row trigger the nudge.
- `BROAD_FIND` (default `10`): how many `find` matches trigger the be-specific hint.

## Tests

```
claude plugin test .
```

## License

MIT
