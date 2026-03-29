# All Pages Optimization Summary

_Last updated: 2026-03-30_

This file summarizes the optimization work completed across the pages involved in the recent Lighthouse/performance/accessibility improvements.

---

## Techniques used (and how they work)

### ✅ Lazy loading

- **Yes, lazy loading is applied in this project at app/route level** in `src/App.jsx` using `React.lazy(...)` + `Suspense` for pages/components (`UploadPage`, `Allocation`, `DashboardPage`, `ManualAllocation`, etc.).
- **How it works:**
  - Instead of bundling every page into the first JavaScript payload, each page is split into its own chunk.
  - The chunk is downloaded only when that route is visited.
  - `Suspense` shows a lightweight fallback while the chunk loads.
- **Benefit:** smaller initial bundle, faster first load, improved Lighthouse performance metrics.

> Note: In this optimization pass, no new lazy imports were added in page files; route-level lazy loading was already present and remains active.

### ✅ Accessibility-first rendering improvements

- Added `htmlFor` + `id` bindings, `fieldset`/`legend`, `aria-pressed`, `aria-busy`, and better `aria-label`s.
- **How it works:** improves semantic structure for screen readers and state communication (busy/selected/action context) without changing visual UI.
- **Benefit:** higher Accessibility scores and better keyboard/assistive-tech behavior.

### ✅ Reduced rendering/paint cost on Upload page

- Increased auto-slide interval (`3500ms -> 4500ms`), removed blur-heavy overlays, and reduced placeholder rows (`30 -> 10`).
- **How it works:**
  - fewer animation updates per minute,
  - fewer expensive blur/compositing operations,
  - fewer DOM nodes to layout/paint.
- **Benefit:** less main-thread and GPU work, better runtime smoothness/performance.

### ✅ Stable callback usage

- `useCallback` is used in key pages (`DashboardPage`, `ManualAllocation`) for frequently passed async handlers.
- **How it works:** memoizes function identity between renders (when dependencies are unchanged).
- **Benefit:** reduces unnecessary downstream re-renders in child trees that depend on callback prop identity.

---

## 1) Smart Allocation Page (`src/pages/Allocation.jsx`)

### Optimization status
- No additional net code diff is currently present in this file in the working tree.
- The page was kept stable in the final pass to avoid regressions while prioritizing Upload + Manual Allocation fixes.

### Notes
- Existing optimization guidance for this page remains in `OPTIMIZATION_GUIDE.md`.
- If needed, a fresh pass can be done later for route-level lazy loading/memoization with regression-safe checkpoints.

---

## 2) Manual Allocation Page (`src/pages/ManualAllocation.jsx`)

### Accessibility improvements made

#### Form labeling and input association
- Added `htmlFor` for major labels and matched with input `id`s:
  - `rows`, `cols`, `numBatches`, `blockWidth`
  - `batchNamesStr`, `roomNo`, `startRollsStr`, `batchStudentCountsStr`, `brokenSeatsStr`
- Added per-batch serial input association:
  - `id={\`batchSerial${idx}\`}` with corresponding `label htmlFor`

#### ARIA enhancements
- Added `aria-label` to action buttons:
  - Generate button (`Generating seating plan` / `Generate seating plan`)
  - Fullscreen preview button
  - PDF export button (`Generating PDF` / `Export seating plan as PDF`)
- Added `aria-describedby` help text for start roll override input.

#### Seating grid semantics
- Added grid roles for assistive tech:
  - Container: `role="grid"`, `aria-rowcount`, `aria-colcount`
  - Cells: `role="gridcell"`, `aria-rowindex`, `aria-colindex`, descriptive `aria-label`

### Functional UI constraints added/exposed
- Added/connected constraint controls:
  - `fillByColumn`
  - `enforceAdj`
  - `brokenSeatsStr`
- Ensures these options are editable from UI and passed into generation payload.

---

## 3) Upload Student Page (`src/pages/UploadPage.jsx`)

### Performance optimizations made

#### Lower animation workload
- Auto-slide interval increased from **3500ms → 4500ms**.
- UI indicator text updated to match new timing.

#### Reduced paint/composition cost
- Removed blur-heavy overlays in template preview and replaced with lighter gradients.
- Removed `backdrop-blur-lg` from floating template labels.

#### Reduced unnecessary DOM nodes
- Empty template row placeholders reduced from **30 → 10** in both format previews.

### Accessibility improvements made

#### Upload action accessibility
- Added dynamic `aria-label` on upload button.
- Added `aria-busy={uploading}` while parsing/upload is in progress.

#### Selection semantics
- Wrapped extraction mode controls in `fieldset` + `legend`.
- Added `aria-pressed` to mode toggle buttons.

#### Form label/input linkage
- Added `htmlFor` + `id` pairs for:
  - Batch name (`batchNameInput`)
  - Name column (`nameColumnInput`)
  - Enrollment column (`enrollmentColumnInput`)

---

## 4) Dashboard Page (`src/pages/DashboardPage.jsx`)

### Current status
- No active net diff is currently present in this file in the working tree.
- The file has been stabilized in its current state after prior syntax-recovery steps.

### Note
- Any future dashboard-specific optimization pass should be done in isolated commits to avoid cross-page merge/regression risk.

---

## Build/verification snapshot

- Frontend production build completed successfully after these updates.
- Existing project-wide ESLint warnings remain in unrelated files and were not introduced by this optimization summary work.

---

## Scope clarification

This summary reflects the page-level optimization work captured in the current workspace state and recent optimization pass. If you want, this can be expanded into:

1. before/after Lighthouse score table per page,
2. exact commit links per optimization,
3. rollback-safe checklist for future optimization rounds.
