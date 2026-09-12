// The icon set. Twenty hand-authored stroke glyphs — no icon font, no library,
// no image assets, because the repo has none and the design asks for none.
//
// Geometry is copied verbatim from the handoff's icon grid: a 24×24 viewBox,
// no fill, currentColor stroke, round caps and joins. That uniformity is the
// whole system — an icon drawn to a different grid or weight reads as a
// different family, so add one only by transcribing it from the design, never
// by eyeballing a path.
//
// Colour always comes from the parent (`currentColor`) and size is set here
// rather than in CSS, because an SVG sized by CSS reflows before the stylesheet
// lands. `stroke-width` is per-icon: the design draws `plus` and `send` heavier
// so they hold their weight as solid-filled controls, and the tick inside the
// packing checkbox heavier again at 16px.

const ICONS = {
  // Navigation and chrome
  stack: (
    <>
      <rect x="3" y="8" width="14" height="12" rx="3" />
      <path d="M7 8V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  'chevron-down': <path d="M5 9l7 7 7-7" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  'chevron-left': <path d="M15 5l-7 7 7 7" />,

  // The four tabs
  bubble: <path d="M4 5h16v11H9l-5 4V5z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </>
  ),
  bookmark: <path d="M6 4h12v17l-6-4-6 4V4z" />,
  bag: (
    <>
      <path d="M4 8h16l-1 12H5L4 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </>
  ),

  // Meaning
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />,
  check: <path d="M5 13l4 4 10-10" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.5 7-11a7 7 0 0 0-14 0c0 4.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  rain: (
    <>
      <path d="M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 8a3.5 3.5 0 0 1-.5 7H7z" />
      <path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" />
    </>
  ),

  // The three recommendation categories, which double as session topics
  fork: (
    <>
      <path d="M7 3v7a2 2 0 0 0 4 0V3M9 12v9" />
      <path d="M16 3c-1.5 2-2 4-1 7h2c1-3 .5-5-1-7zM16 10v11" />
    </>
  ),
  peak: <path d="M3 19l6-11 4 7 2-3 6 7H3z" />,
  car: (
    <>
      <path d="M5 16h14M6 16l1.5-5.5A2 2 0 0 1 9.4 9h5.2a2 2 0 0 1 1.9 1.5L18 16" />
      <circle cx="8" cy="18" r="1.6" />
      <circle cx="16" cy="18" r="1.6" />
    </>
  ),

  // Actions
  trash: <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />,
  send: <path d="M12 19V6M6 12l6-6 6 6" />,
}

// Per the handoff: 1.6 is the family weight, with two exceptions the design
// draws heavier. The packing tick passes 2.2 explicitly — it's the one icon
// rendered small enough that 1.6 disappears.
const WEIGHTS = { plus: 1.8, send: 2 }

export default function Icon({ name, size = 20, strokeWidth }) {
  const glyph = ICONS[name]
  // A typo'd name must not throw inside a message list. Nothing is drawn, the
  // layout keeps its gap, and the missing icon is visible in review.
  if (!glyph) return null

  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? WEIGHTS[name] ?? 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyph}
    </svg>
  )
}
