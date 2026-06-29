# FindingsTooltip — Portal Rendering to Fix Overflow Clipping

**Date:** 2026-06-29
**Status:** Proposed
**Affects:** `client/src/components/findings-severity-badges/FindingsTooltip.tsx`

---

## Problem

The `FindingsTooltip` popup is rendered with `position: absolute; top: calc(100% + 6px)` inside
the table row DOM. The table card container (`tableCard` in
`client/src/app/repos/[repoId]/pulls/styles.ts:90`) has `overflow: hidden` to clip row
corners against its `borderRadius: 10`.

`overflow: hidden` creates a **clipping context**: any absolutely-positioned descendant is
clipped to that box's paint area, regardless of `z-index`. The tooltip is therefore invisible
whenever the table is not tall enough to reveal it — exactly what the screenshot shows.

The same clipping applies in `RunHistory` (`RunHistory.tsx:135` also has `overflow: hidden` on
its run-block container).

---

## Root cause (one sentence)

`position: absolute` tooltips are clipped by any ancestor with `overflow: hidden`; `z-index`
alone cannot escape an overflow clipping context.

---

## Solution: React Portal + `position: fixed`

Render the popup via `ReactDOM.createPortal(popup, document.body)`. The popup node is inserted
directly under `<body>`, outside every overflow context, and positioned with
`position: fixed` using coordinates measured from the anchor element at open time.

This is the standard approach used by all production tooltip/popover libraries (Radix UI,
Floating UI, etc.). It requires no changes to the three call sites.

---

## Implementation detail — `FindingsTooltip.tsx`

### State & refs

```ts
const anchorRef = React.useRef<HTMLDivElement>(null);
const [popupStyle, setPopupStyle] = React.useState<React.CSSProperties | null>(null);
```

`popupStyle` is `null` when closed; non-null when open (holds the `fixed` coordinates).

### Opening: measure anchor, compute popup position

```ts
function handleMouseEnter() {
  if (!hasContent || !anchorRef.current) return;
  const rect = anchorRef.current.getBoundingClientRect();
  const POPUP_WIDTH = 380;
  const POPUP_GAP   = 6;

  // Left-align with anchor; clamp so popup never overflows the right viewport edge.
  const rawLeft = rect.left;
  const maxLeft = window.innerWidth - POPUP_WIDTH - 8;
  const left    = Math.min(rawLeft, Math.max(0, maxLeft));

  setPopupStyle({
    position: "fixed",
    top: rect.bottom + POPUP_GAP,
    left,
    width: POPUP_WIDTH,
    zIndex: 9999,
  });
}
```

`position: fixed` coordinates are relative to the viewport, so they remain correct regardless
of page scroll at the moment of hover.

### Closing

```ts
function handleMouseLeave() { setPopupStyle(null); }
```

### Scroll / resize guard

When the page scrolls or the window resizes while the tooltip is open, the stored `fixed`
coordinates become stale (the anchor has moved). The simplest correct behaviour is to close
the tooltip:

```ts
React.useEffect(() => {
  if (!popupStyle) return;
  const close = () => setPopupStyle(null);
  window.addEventListener("scroll", close, { capture: true, passive: true });
  window.addEventListener("resize", close);
  return () => {
    window.removeEventListener("scroll", close, { capture: true });
    window.removeEventListener("resize", close);
  };
}, [popupStyle]);
```

`{ capture: true }` catches scroll events on any scrollable ancestor, not just `window`.

### Portal rendering

```tsx
import ReactDOM from "react-dom";

// In the return:
<div ref={anchorRef} style={{ position: "relative", display: "inline-flex" }}
     onMouseEnter={handleMouseEnter}
     onMouseLeave={handleMouseLeave}>
  <FindingsSeverityBadges bySeverity={bySeverity} />
</div>

{popupStyle && typeof document !== "undefined" &&
  ReactDOM.createPortal(
    <div style={{ ...popupStyle, background: "…", border: "…", … }}>
      {/* same popup content as today */}
    </div>,
    document.body,
  )
}
```

The `typeof document !== "undefined"` guard makes the portal call safe during any SSR pass
(the component is already `"use client"` but the guard costs nothing and avoids subtle
hydration errors).

### What does NOT change

- The popup's visual design (colours, shadow, border, scrollable list, finding rows) is unchanged.
- The three call sites (`PRRow.tsx`, `RunHistory.tsx`, `ReviewRunAccordion.tsx`) change nothing.
- The component's public API (props) is unchanged.

---

## Why not the alternatives?

| Alternative | Why rejected |
|---|---|
| Remove `overflow: hidden` from `tableCard` | `overflow: hidden` is load-bearing for the rounded-corner card look; row backgrounds would bleed through the border-radius at the top and bottom rows. |
| `overflow: clip` instead of `overflow: hidden` | `overflow: clip` still clips painted overflow; absolutely-positioned children still cannot escape it. |
| Increase `z-index` | `z-index` operates within a stacking context, not across clipping contexts. No `z-index` value escapes `overflow: hidden`. |
| Restructure the DOM so the tooltip is outside the card | Would require lifting tooltip state to a page-level ancestor and threading it through props — significantly more invasive than a portal. |

---

## Test impact

`ReactDOM.createPortal` in jsdom (used by vitest + RTL) appends the portal node to
`document.body`. `screen.getByText(…)` queries the full document, so all existing tests
(`FindingsTooltip.test.tsx:76-108`) continue to pass without changes.

The mouse-event trigger (`container.firstChild`) remains the anchor `<div>`, which is
unaffected by the portal.

---

## Files touched

| File | Change |
|---|---|
| `client/src/components/findings-severity-badges/FindingsTooltip.tsx` | Portal rendering + `getBoundingClientRect` positioning |

No other files change.
