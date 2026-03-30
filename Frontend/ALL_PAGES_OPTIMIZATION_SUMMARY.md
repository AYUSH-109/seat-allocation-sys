# All Pages Optimization Summary (Detailed)

_Last updated: 2026-03-30_

This document gives a **page-by-page technical breakdown** of optimization techniques used in the Frontend, including:

1. **what technique was used**,
2. **where it is used** (file + section),
3. **why it helps** (Lighthouse/UX impact).

---

## A) Global optimization architecture (applies to all pages)

## 1. Route-level code splitting (Lazy loading)

**Where used:** `src/App.jsx` (top-level lazy imports + route tree)

- `React.lazy(() => import('./pages/...'))` is used for all major pages:
  - `LandingPage`, `LoginPage`, `SignupPage`, `ProfilePage`, `DashboardPage`, `UploadPage`, `Allocation`, `CreatePlan`, `FeedbackPage`, `AdminFeedbackPage`, `AboutusPage`, `TemplateEditor`, `AttendencePage`, `MoreOptionsPage`, `ClassroomPage`, `ManualAllocation`.
- `Suspense` fallback spinners are used in:
  - `RootLayout` page-content wrapper,
  - `AuthLayout` wrapper,
  - lazy shell components (`Navbar`, `Footer`, `SessionRecoveryModal`).

**Technique:** JS chunk splitting + on-demand route hydration.

**Impact:**
- Lower initial JS transfer.
- Better initial parse/execute time.
- Better `FCP`, `LCP`, and `SI` on first load.

---

## 2. Protected-route loading guard

**Where used:** `src/App.jsx` → `ProtectedRoute` component.

**Technique:** Gate page render behind auth-loading state with a minimal spinner shell.

**Impact:**
- Prevents expensive page trees from rendering before auth settles.
- Reduces wasted render cycles and network churn.

---

## B) Page-by-page optimization map

## 1) Dashboard (`src/pages/DashboardPage.jsx`)

### Techniques used

1. **Memoization for stable render paths**
  - `useMemo` for greeting text.
  - `memo(StatCard)` to prevent avoidable card rerenders.
  - Static configs moved outside component (`DEFAULT_STATS`, `QUICK_ACTIONS`).

2. **Lower main-thread animation cost**
  - Stat counter animation uses `requestAnimationFrame` with guarded updates instead of interval-style churn.

3. **CLS reduction (layout stabilization)**
  - Stats initialize with `DEFAULT_STATS` (grid is present immediately, not empty → populated).
  - `Last updated` line keeps fixed vertical space using `min-h-[1rem]`.
  - `Next Exam` container has `min-h-[1.75rem]`.

4. **Critical vs non-critical fetch splitting**
  - Initial load prioritizes `fetchStats` + `fetchSessionInfo`.
  - `fetchActivity` runs after critical content is painted.

5. **Duplicate load-cycle reduction**
  - User-identity driven load/refresh effect consolidates data fetch timing.

6. **Below-the-fold render deferral**
  - `content-visibility: auto` + `containIntrinsicSize` on Quick Actions + Activity sections.

### Where used exactly

- Top constants + helpers: top of file (`DEFAULT_STATS`, `QUICK_ACTIONS`, `getGreeting`, `getActivityIcon`).
- `StatCard` definition block: memoized component and RAF animation.
- Data lifecycle: `fetchDashboardData`, user identity `useEffect`, `handleRefresh`.
- CLS guards: hero refresh-time paragraph and next-exam text container.
- Deferred sections: Quick Actions and Activity wrappers with `style={{ contentVisibility: 'auto', containIntrinsicSize: ... }}`.

### Metric impact focus

- **CLS:** improved via stable placeholder dimensions.
- **TBT/SI:** reduced via memoization + deferred non-critical work.
- **LCP:** helped by reducing critical-path JS/network contention.

---

## 2) Upload page (`src/pages/UploadPage.jsx`)

### Techniques used

1. **Animation-frequency reduction**
  - Auto-slide interval slowed (fewer updates per minute).

2. **Cheaper visual composition**
  - Heavy blur overlays reduced/replaced with lighter alternatives.

3. **DOM size reduction in previews**
  - Placeholder rows reduced to avoid unnecessary layout/paint work.

4. **Accessibility-state optimization**
  - `aria-busy` on upload action while processing.
  - Better `aria-label` and mode toggle semantics (`fieldset`, `legend`, `aria-pressed`).
  - Explicit `htmlFor` + `id` linkage for inputs.

### Where used exactly

- Upload actions and parse/upload controls.
- Extraction mode selection UI.
- Template format preview sections.
- Batch/name/enrollment form controls.

### Metric impact focus

- **TBT/SI:** lower animation and paint overhead.
- **Accessibility score:** better semantic state expression.

---

## 3) Manual Allocation (`src/pages/ManualAllocation.jsx`)

### Techniques used

1. **Form semantics hardening**
  - Comprehensive `htmlFor` + `id` mapping across controls.

2. **Action-level accessibility**
  - Dynamic `aria-label` for generate/export/fullscreen actions.
  - `aria-describedby` on helper-linked fields.

3. **Grid semantics for assistive tech**
  - `role="grid"`, `aria-rowcount`, `aria-colcount`.
  - Cell-level `role="gridcell"`, position metadata, descriptive labels.

4. **Constraint-surface completeness**
  - Controls exposed and passed for `fillByColumn`, `enforceAdj`, `brokenSeatsStr`.

### Where used exactly

- Input panel forms.
- Action toolbar buttons.
- Seat preview grid container + grid cells.
- Generation payload construction.

### Metric impact focus

- **Accessibility + UX correctness** with no visual changes.
- Better interaction clarity for keyboard/screen-reader users.

---

## 4) Allocation (`src/pages/Allocation.jsx`)

### Techniques currently present

1. **Structured motion and staged transitions**
  - `framer-motion` + `AnimatePresence` for stats modal and interactive blocks.

2. **Stable card/button primitives**
  - Local reusable `Card` / `Button` wrappers reduce repeated class logic.

3. **Progressive UI disclosure**
  - Constraint panels and stats overlays only render when needed.

### Where used exactly

- Constraint validation blocks.
- Allocation statistics modal (`AnimatePresence` section).
- Seat cards with state-based rendering (allocated/broken/empty).

### Notes

- This page is feature-heavy and animation-rich; future optimization should prioritize:
  - seat-grid virtualization/windowing,
  - reduced transition density for large rooms,
  - memoized derived seat maps.

---

## 5) Classroom (`src/pages/ClassroomPage.jsx`)

### Techniques currently present

1. **Derived-state memoization**
  - `useMemo` for `effectiveBlockStructure` and structure-sum validation.

2. **Controlled animation sequencing**
  - Staggered motion on room list and seat preview.

3. **Reusable primitive components**
  - Local UI wrappers (`Card`, `Button`, `Input`, etc.) keep render structure predictable.

### Where used exactly

- Room block-structure logic section (`useMemo` blocks).
- Sidebar room registry list animation.
- Seat toggle grid animation section.

### Metric impact focus

- Less redundant recomputation in block calculations.
- Better maintainability for future performance tuning.

---

## 6) Admin Feedback (`src/pages/AdminFeedbackPage.jsx`)

### Techniques currently present

1. **Heavy-list derived-state memoization**
  - `useMemo` for dashboard stats and filtered/sorted feedback list.

2. **Conditional modal rendering**
  - `AnimatePresence` gates feedback detail overlays.

3. **Batched visual metadata rendering**
  - Severity/status/icon configs computed and reused per list item.

### Where used exactly

- `stats` memo block.
- `filteredFeedbacks` memo block.
- feedback list map with animated cards + modal open path.

### Metric impact focus

- Lower recompute cost during search/filter/sort interactions.

---

## 7) Attendance (`src/pages/AttendencePage.jsx`)

### Techniques currently present

1. **AnimatePresence for preview panels**
  - Modal previews and format slides only animate/render while active.

2. **Controlled image transitions**
  - `motion.img` with guarded transitions and `onError` fallback behavior.

3. **Scrollable modal content isolation**
  - Large student lists stay in bounded scroll containers.

### Where used exactly

- Debarred format slider block (`motion.img`).
- Preview modal block (`AnimatePresence` + bounded `max-h`).

### Metric impact focus

- Better interaction smoothness during previews.

---

## 8) Create Plan (`src/pages/CreatePlan.jsx`)

### Techniques currently present

1. **Progressive hero/card reveal**
  - Staggered animation timing for action cards.

2. **Conditional modal mount/unmount**
  - Plan viewer wrapped in `AnimatePresence`.

3. **Text animation component reuse**
  - Uses shared `SplitText` for heading animation.

### Where used exactly

- Hero `SplitText` block.
- Action card grid map (staggered animation).
- Plan detail modal section.

---

## 9) About Us (`src/pages/AboutusPage.jsx`)

### Techniques currently present

1. **In-view gated animation**
  - Motion blocks animate when viewport-visible.

2. **Pointer-reactive visual effects**
  - 3D tilt + spotlight/shimmer effects computed from mouse movement.

3. **Reusable animated text component**
  - Uses `SplitText` in headline/content sections.

### Where used exactly

- Feature card motion wrappers (`useInView`, `motion.div`).
- Spotlight/shimmer overlays in card containers.

### Note

- This page is intentionally animation-heavy for branding; optimization trade-offs should preserve design intent.

---

## 10) Login / Signup / Profile / Feedback / Template Editor / More Options / Landing

### Current optimization pattern

- These pages primarily benefit from:
  - **route-level lazy loading** in `App.jsx`,
  - shared shell suspense fallbacks,
  - reusable design primitives.

### Where used

- Route registration and lazy imports: `src/App.jsx`.

### Note

- If needed, these can be optimized further with per-page memoization audits and interaction-cost profiling.

---

## C) Shared component optimization used by multiple pages

## `src/components/SplitText.jsx`

### Techniques used

1. `useMemo` for tokenization (`letters`) to avoid repeated split work.
2. `memo(...)` export to prevent unnecessary rerenders from parent updates.
3. Effect dependencies narrowed to animation-relevant values.

### Pages benefiting

- `DashboardPage`, `CreatePlan`, `AboutusPage`, `ClassroomPage` (and any page importing `SplitText`).

---

## D) Verification snapshot

- Production build command used: `npm run build` from `Frontend/`.
- Build status: **successful** (compiled, with pre-existing lint warnings in unrelated files).

---

## E) Recommended next optimization wave (if needed)

1. **Allocation seat-grid windowing** (largest potential TBT win).
2. **Animation budget policy per page** (cap concurrent animated elements above-the-fold).
3. **Network-layer caching headers** for dashboard APIs (`stats`, `session-info`, `activity`).
4. **Before/after Lighthouse table** per route to quantify gains.
