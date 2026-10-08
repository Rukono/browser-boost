# Changelog

## 0.3.1

- Tokens-saved count now covers every scaled screenshot, measured against
  its full size from the result's own scale and frame, whoever set the
  scale. Before, it counted only screenshots the mod itself scaled, so it
  read zero when the model passed a scale or another copy of the mod ran.

## 0.3.0

- Recovery hints: hidden element ("outside the viewport"), stale view after
  navigation, and `find` queries that match 10 or more elements.
- Status line shows the tokens saved by scaled screenshots, measured from each
  screenshot's reported frame size.
- Playbook: use `find` with exact words for single facts, expect
  `get_page_text` to open with menus, zoom when text extraction drops link
  words, and reveal hidden elements before clicking them.
- Pure logic moved to `hooks/lib.ts` and unit-tested (10 tests).

## 0.2.0

- Stale-view guard: refuse a `browser_batch` that clicks by coordinate right
  after a `navigate` with no screenshot in between.

## 0.1.0

- Browser playbook, 0.6 default screenshot scale, batching nudge, status line.
