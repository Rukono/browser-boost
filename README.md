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
- **Batch nudge**: after 3 single browser calls in a row, Claude gets a
  reminder to group its next steps into one `browser_batch` call.
- **Status line**: shows `browser N calls · M batched`.

## Install

```
/plugin install browser-boost --marketplace Rukono/browser-boost
```

Answer `y` to add the marketplace, then pick a scope (user scope enables it
everywhere).

## Tuning

Edit the constants at the top of `hooks/register.ts`:

- `SCREENSHOT_SCALE` (default `0.6`): the default screenshot scale.
- `NUDGE_AFTER` (default `3`): how many single calls in a row trigger the nudge.

## Tests

```
claude plugin test .
```

## License

MIT
