# Design Spec — Salzburg Travel Agent

The visual design is done. It lives in Claude Design; `design/` holds an exported
copy. **Do not make design decisions in code** — implement what's specified here,
and read the source files when you need pixel-level detail.

## Source of truth

Canonical project (Claude Design):
<https://claude.ai/design/p/65e593b3-fbd3-4411-8741-97fc9c9d69a9?file=Salzburg+Travel+Agent.dc.html>

To import it via the `claude_design` MCP (`https://api.anthropic.com/v1/design/mcp`,
auth via `/design-login`):

> Use the claude_design MCP to import this project:
> https://claude.ai/design/p/65e593b3-fbd3-4411-8741-97fc9c9d69a9?file=Salzburg+Travel+Agent.dc.html
>
> Focus on these files (the whole project is readable):
> - `Salzburg Travel Agent.dc.html`
>
> Also read these files the selection imports:
> - `ios-frame.jsx`
> - `support.js`
>
> Implement: `Salzburg Travel Agent.dc.html`

Local export (readable without the MCP):

- `design/Salzburg Travel Agent.dc.html` — the three screens plus the handoff sheet
- `design/ios-frame.jsx` — iOS device frame used for presentation only. **Not part
  of the app.** It exists so the mockup renders inside a phone bezel; don't port it.
- `design/support.js` — the Claude Design canvas runtime. Not part of the app either.

Everything below is transcribed from the handoff sheet in that file, so a session
without MCP access can still build correctly. If the two ever disagree, the Claude
Design project wins.

## Screens

Three tabs, thumb-reachable, mobile-first: **Chat · Agenda · Saved**. Header shows
`Salzburg` with `Day 4 of 11 · Thu 20 Aug` underneath.

Note this supersedes the two-surface sketch in `salzburg-app-session1-spec.md`
("main screen + side panel"): the trip-context surface is split into **Agenda**
(time-anchored: today, next up, stay, flights, journal) and **Saved**
(unscheduled recommendations).

1. **Chat** — the primary surface. Agent answers render as full-width serif blocks
   with an inline day plan; a plan carries two actions, `Save to itinerary` and
   `Keep as is`.
2. **Agenda** — `Today` day card, then `Next up` future day cards, then `Stay`,
   `Flights`, and the auto-drafted `Journal` entry.
3. **Saved** — filter pills (`All / Food / Activity / Day trip`), a sand-tinted
   `Caught in chat` section for new captures, then `Kept` as white cards.

## Color

| Token | Hex | Use |
|---|---|---|
| paper | `#FAF7F2` | app background |
| sand | `#F4EFE7` | today / pending tint |
| line | `#EFE7DA` | 1px borders |
| card | `#FFFFFF` | cards |
| ink | `#1F1B16` | body text |
| muted | `#6B635A` | secondary detail |
| accent / Bar | `#A9542F` | terracotta |
| green / Ori | `#4E6B55` | |

Accent is used **only** for times, links, and one primary action per screen.
Message bubble tints are the 8% versions: `#F6EDE6` (Bar), `#E9EFE9` (Ori).
Contrast: body 12.4:1, muted 5.5:1, mono labels 4.8:1 — all pass AA in direct sun.

## Type

Literata for titles and journal prose · Source Sans 3 for anything read fast ·
IBM Plex Mono for times, labels, and flight numbers. Nothing below 14px except
mono caps labels.

| Role | Spec |
|---|---|
| Screen title | Serif 24 / 1.0 |
| Agent answer heading | Serif 21 / 1.25 |
| Body & message text | Sans 17 / 1.5 |
| Item name | Sans 17 / 600 |
| Secondary detail | Sans 15 / 1.45 |
| Section label | Mono 11 / .14em, caps |

## Patterns

**Message.** Agent: no bubble, full width, serif heading with a mono time column.
User: tinted bubble, right-aligned, radius `20/20/6/20`, mono name tag above.
*The sender is conveyed by the tint, not an avatar.*

**Day card (Agenda).** White card, 1px line, radius 18, padding 18. Serif date
header, then rows of `mono time (46px column) + name + one detail line`. Today gets
a mono accent tag and a sand tint; future days stay white.

**Auto journal.** The agent drafts one entry per day from that day's chat and shows
it under Agenda with a mono "drafted from your chat" line. Two 44px actions: `Edit`
(opens the text in place) or `Keep`. **Nothing is ever posted without appearing here
first.**

**Recommendation card.** Same shell as the day card. Name left, category pill right
(food / activity / day-trip → terracotta / green / ochre), one line of why it was
saved, then provenance (`From Bar's chat · Tue`) and `Edit` / `Remove`. Nothing is
typed in by hand: the agent captures places as they come up in chat, they land
sand-tinted at the top of Saved with `Keep` / `Not this one`, then settle into
`Kept` as white cards.

**Forms.** 52px fields, 48px buttons, 44px minimum for any tap target. Labels sit
above the field, never inside. Editing happens in place in the panel — **no modals.**

## Radii

`999px` pills · `18px` cards · `12px` small surfaces · `20/20/6/20` user bubbles.
