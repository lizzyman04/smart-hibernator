# Cross-OS Screenshot Checklist — D-13

**Purpose:** Manual per-OS verification that the extension UI renders consistently across Windows, macOS, and Linux. This is the **COMP-02 success gate** (cross-OS UI consistency). Screenshots captured here double as **D-11 Chrome Web Store listing assets**.

**Who runs this:** The maintainer (or a contributor with access to each OS). This is not a CI task — CI is single-OS (Linux) and cannot capture real native rendering differences.

**When to run:**
- Before CWS submission.
- After any change touching `src/popup/index.css`, `src/dashboard/index.css`, or shadcn/Radix component styles.
- After a Tailwind or shadcn version bump.

---

## Surfaces to capture

For each OS, capture all **four surfaces** below:

| # | Surface | How to open |
|---|---------|-------------|
| 1 | **Popup (with hibernated tabs)** | Click the extension icon in the Chrome toolbar. Have at least 5 hibernated tabs visible. |
| 2 | **Popup (empty / zero-state)** | Same as above with no hibernated tabs. |
| 3 | **Dashboard — Stats tab** | Open the extension dashboard (`chrome-extension://<id>/src/dashboard/index.html`) and select the Stats tab. Ensure at least a few sessions of data are present so the Recharts graph renders. |
| 4 | **Dashboard — Settings tab** | Same page, select the Settings tab. Scroll to the bottom if content is taller than the viewport. |

---

## Per-OS checklist

Run this checklist independently on each OS. Check every box before marking the OS as PASS.

### Windows (Chrome 120+)

**Setup:** Load the extension from a production build (`npm run build` then load `dist/` unpacked).

- [ ] **Scrollbars are thin** — confirm no Windows-style fat native scrollbars appear in the popup tab list or dashboard tab panels. The `scrollbar-width: thin` and `*::-webkit-scrollbar { width: 8px }` CSS rules should override native bars.
- [ ] **Scrollbar thumb is visible but subtle** — semi-transparent dark thumb (`rgb(0 0 0 / 0.2)` with `border-radius: 4px`), not the system grey flat bar.
- [ ] **Font renders as Geist or system fallback** — text in the popup and dashboard should be clean and consistent, using "Geist Variable" if the font loaded correctly, or `Segoe UI` as the Windows system fallback. No fallback to serif or generic fonts.
- [ ] **No native control divergence** — Radix-based slider (timeout setting), switch toggles, and scroll areas should appear styled (not native Windows form controls).
- [ ] **Popup width is consistent** — the popup should not overflow or truncate its content horizontally.
- [ ] **Dark/light rendering** — if testing dark mode (Windows system preference), verify the theme toggles correctly with no unstyled elements.

Screenshots to save (name them `win-<surface>.png`):
- [ ] `win-popup-tabs.png`
- [ ] `win-popup-empty.png`
- [ ] `win-dashboard-stats.png`
- [ ] `win-dashboard-settings.png`

---

### macOS (Chrome 120+)

**Setup:** Load the extension from a production build.

- [ ] **Scrollbars are overlay-style or thin** — macOS already shows overlay scrollbars by default; confirm the custom `scrollbar-width: thin` CSS does not conflict or produce double-scroll artifacts.
- [ ] **Font renders as Geist or system fallback** — expect "Geist Variable" if the font is bundled, otherwise `-apple-system` (San Francisco). No fallback to serif or generic fonts.
- [ ] **Font smoothing** — the `-webkit-font-smoothing: antialiased` rule should produce clean subpixel-smoothed text (expected on Retina displays).
- [ ] **No native control divergence** — same as Windows: all Radix controls should be styled, not native macOS aqua-style.
- [ ] **Popup dimensions** — popup should not overflow. On macOS HiDPI (Retina), verify the popup does not appear blurry or scaled incorrectly.
- [ ] **Dark/light rendering** — test both light and dark macOS system preferences if possible.

Screenshots to save (name them `mac-<surface>.png`):
- [ ] `mac-popup-tabs.png`
- [ ] `mac-popup-empty.png`
- [ ] `mac-dashboard-stats.png`
- [ ] `mac-dashboard-settings.png`

---

### Linux (Chrome 120+ on a GTK or KDE desktop)

**Setup:** Load the extension from a production build. GTK Chromium is the primary target since CI runs Linux.

- [ ] **Scrollbars are thin** — Linux desktop environments can show very wide or narrow scrollbars depending on the GTK/KDE theme. Confirm `scrollbar-width: thin` takes effect and overrides any thick system bars.
- [ ] **Font renders as Geist or system fallback** — expect "Geist Variable" if loaded, otherwise `Roboto` (common on Ubuntu/GNOME) or the generic `sans-serif` fallback. Text should be legible and not pixelated.
- [ ] **Font smoothing** — check text is not jagged; `-webkit-font-smoothing: antialiased` should apply.
- [ ] **No native control divergence** — Radix controls should be styled consistently with the other OSes.
- [ ] **Popup dimensions** — consistent with the Windows and macOS captures.

Screenshots to save (name them `linux-<surface>.png`):
- [ ] `linux-popup-tabs.png`
- [ ] `linux-popup-empty.png`
- [ ] `linux-dashboard-stats.png`
- [ ] `linux-dashboard-settings.png`

---

## Cross-OS comparison

After collecting all screenshots, do a side-by-side comparison:

- [ ] Popup layout is pixel-near across all three OSes (allow minor subpixel differences).
- [ ] Scrollbar thickness and styling is consistent (thin, subtle thumb).
- [ ] Font rendering is comparable in weight and clarity.
- [ ] No OS shows unstyled/broken Radix components that are styled on the other two.
- [ ] Dashboard charts (Recharts ResponsiveContainer) render the bars/lines correctly on all three OSes.

---

## Known non-issues (do not flag these)

- **Font weight variation:** Subpixel rendering differs between OSes (macOS Retina appears slightly lighter; this is expected and acceptable).
- **macOS scrollbar position:** On macOS, overlay scrollbars appear on top of content rather than taking up space — this is correct, not a layout bug.
- **ChromeOS:** Treated as Linux for this checklist. If you have access to a Chromebook, run the Linux checklist on ChromeOS as well and save screenshots with `chromeos-` prefix.

---

## Where to store screenshots

Save all captures in `docs/screenshots/` (create the directory if needed):

```
docs/screenshots/
  win-popup-tabs.png
  win-popup-empty.png
  win-dashboard-stats.png
  win-dashboard-settings.png
  mac-popup-tabs.png
  mac-popup-empty.png
  mac-dashboard-stats.png
  mac-dashboard-settings.png
  linux-popup-tabs.png
  linux-popup-empty.png
  linux-dashboard-stats.png
  linux-dashboard-settings.png
```

The `docs/screenshots/` directory is in `.gitignore` for now (images can be large). Store them in a shared folder or attach to the release PR instead if the repo size matters.

---

## Store listing asset selection

The CWS listing (see `docs/STORE-LISTING.md`) calls for specific screenshots. From the captures above, select the following for upload:

| CWS slot | Recommended source |
|----------|--------------------|
| Screenshot 1 — Popup with tabs | `mac-popup-tabs.png` (macOS shows the cleanest rendering for marketing) |
| Screenshot 2 — Dashboard Stats | `mac-dashboard-stats.png` or `win-dashboard-stats.png` (whichever has richer chart data) |
| Screenshot 3 — Dashboard Settings | Any OS, `*-dashboard-settings.png` |
| Screenshot 4 — Popup empty state | `mac-popup-empty.png` |

Use the Windows screenshots as supplementary if the CWS listing allows more than 4 screenshots.

---

## Sign-off

Once all boxes above are checked and screenshots are saved:

```
Cross-OS screenshot pass — COMPLETE
Date: ___________
Tester: ___________
Windows: PASS ✓ / FAIL ✗ (notes: ___)
macOS:   PASS ✓ / FAIL ✗ (notes: ___)
Linux:   PASS ✓ / FAIL ✗ (notes: ___)
Overall: PASS ✓ / FAIL ✗
```

If any OS FAILS, open an issue describing the specific divergence (screenshot + description) and fix the CSS before submitting to the CWS.

---

*Checklist version: 1.0 — reflects Smart Hibernator v1.0.1 (CSS normalized in Phase 5 Plan 04: `--app-font`, `scrollbar-width: thin`, `::-webkit-scrollbar` rules in popup and dashboard `@layer base`).*
