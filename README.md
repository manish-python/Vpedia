# VPEDIA LEARNING — Frontend

Production frontend for **VPEDIA LEARNING**, a study-material platform for school
students in **Classes 7 to 12**.

Students buy access **one class at a time, with a single one-time payment**, and get
complete access to every subject, chapter, note, PYQ, solution and paper inside that
class — and nothing outside it.

---

## Stack

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript (strict) |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 (CSS-first tokens, no config file) |
| Routing | React Router 7 |
| Icons | Lucide React |
| State | React Context + custom hooks |
| PDF | react-pdf / PDF.js (worker bundled locally) |
| Package manager | npm |

No UI kit, no state library, no framework beyond this.

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # type-check + production bundle into dist/
npm run preview      # serve the production build (SPA fallback included)
npm run verify       # typecheck + lint + build
```

### Audit scripts

```bash
npm run preview                                   # in one terminal
npm run audit:routes                              # every route, expected state, console errors
npm run audit:responsive                          # mobile/tablet/laptop overflow + mobile nav
CHECK_VIEWER=1 npm run audit:responsive          # also assert the PDF viewer renders
```

Both audits exit non-zero on failure and default to `http://127.0.0.1:5173`.
Override with `BASE_URL`. The PDF viewer assertion is opt-in because headless
Chrome cannot rasterise the viewer canvas.

---

## Integration status

The frontend is connected to the Django API. PostgreSQL is the source of truth
for catalogue data, access, purchases, UPI settings and payment proofs.

| System | Status | Where it plugs in |
|---|---|---|
| Google OAuth | **Live** (Stage 3) | `src/services/authService.ts` → Django `apps/accounts` |
| Django REST API | **Live** | `src/services/client.ts` and `src/services/*` |
| Manual UPI payments | **Live** | `src/services/paymentService.ts` |
| Protected PDF delivery | **Live** | `GET /contents/{slug}/document/` |

### Authentication

Sign-in is **Google OAuth only**, and it is real — there is no mock session.

```
/login  ──click──▶  Django /api/v1/accounts/google/login/
                     │  (allauth builds state + PKCE; client secret stays server-side)
                     ▼
                 accounts.google.com  ──▶  Django /api/v1/accounts/google/login/callback/
                     │  (allauth verifies the OIDC response, then signs the student in)
                     ▼
                 Django /api/v1/auth/complete/  ──▶  /auth/google/callback (this app)
                                                          │  asks the backend who it is
                                                          ▼
                                                       /dashboard
```

Three consequences worth knowing:

- **No Google client id in the frontend.** The browser never sees one, because
  the whole exchange happens on the backend. There is nothing to put in
  `.env.local`.
- **The session is an HTTP-only cookie.** `fetch` is called with
  `credentials: 'include'`; the cookie is unreadable from JavaScript, so an XSS
  bug cannot steal it. Nothing is stored in `localStorage` or `sessionStorage`.
- **`vite.config.ts` proxies `/api` and `/admin` to `VITE_DEV_BACKEND`**
  (default `http://127.0.0.1:8000`).
  That is what keeps the session cookie first-party in development. It also
  means the OAuth redirect URI Google must be given is the **Vite** origin,
  `http://localhost:5173/api/v1/accounts/google/login/callback/`.

Sign-out calls `POST /auth/logout`, which deletes the session server-side and
expires the cookie. Clearing browser storage is cosmetic, not the mechanism.

All catalogue, academic, content, purchase and payment services call the real
backend. `VITE_USE_MOCKS` only controls the legacy notifications fixture, which
has no backend endpoint.

### Frontend environment

```bash
# .env.local
VITE_API_BASE_URL=/api/v1
VITE_DEV_BACKEND=http://127.0.0.1:8000
```

The Vite proxy forwards `/api` and `/admin` to `VITE_DEV_BACKEND`. In
production, set `VITE_API_BASE_URL` to the deployed API URL.

### Backend endpoints

Authentication, profile, catalogue, academic data, content, purchases and
manual UPI payments are live against `backend/`.

```
# --- auth (live) ---
GET    /auth/config                             -> { google_enabled, login_url }
GET    /auth/csrf                               -> { csrfToken }
GET    /auth/google                             -> { login_url }
GET    /auth/me                                 -> { authenticated, user, profile, unlocked_classes }
POST   /auth/logout
GET    /profile/me
PATCH  /profile/me                              { selected_class?, selected_stream?, first_name?, last_name? }

# --- catalogue and academics ---
GET    /classes/
GET    /classes/{slug}/
GET    /streams/?class={slug}
GET    /subjects/?class={slug}&stream={slug}
GET    /subjects/{slug}/chapters/
GET    /chapters/{slug}/contents/
GET    /contents/{slug}/
GET    /contents/{slug}/access/
GET    /contents/{slug}/document/       -> gated PDF bytes

# --- purchases and manual UPI ---
GET    /purchases/my/
POST   /purchases/                         -> creates PENDING request; no amount accepted
GET    /my-classes/                        -> ACTIVE access only
GET    /payments/upi/
GET    /payments/upi/qr/
GET    /purchases/{id}/upi/
POST   /payments/proofs/                   -> screenshot + UTR, remains PENDING
GET    /payments/my/
```

---

## Security posture

These are deliberate, not oversights.

- **No secrets in the frontend.** No OAuth client secret, database credentials,
  storage credentials or payment-gateway keys are shipped to the browser.
- **Google OAuth only.** There is no username, password, confirm-password,
  forgot-password or email-registration form anywhere in the codebase. The profile
  page explains why there is no password control.
- **Manual UPI only.** Opening a UPI app and submitting a screenshot do not grant
  access. The student remains PENDING until an administrator approves the proof.
- **Route guards are UI flow, not security.** `ProtectedRoute`,
  `ClassProtectedRoute` and `ContentProtectedRoute` stop a student from reaching a
  screen they have not paid for. Django must authorise every content request
  independently.
- **Locked content is never served.** The viewer is not mounted for locked content,
  and the backend's document endpoint re-checks `has_class_access` before streaming
  bytes.
- **No gateway or permanent public study-material URL.** PDFs are served only by
  the authenticated, class-access-gated document endpoint. Payment screenshots
  remain behind the staff-guarded media view.

---

## Project structure

```
src/
├── components/
│   ├── brand/          Logo and mark
│   ├── cards/          ClassCard, SubjectCard, ChapterCard, ContentCard, FeatureCard
│   ├── common/         Button, Badge, Card, Modal, Toast, Skeleton, states
│   ├── content/        ContentTabs, ContentFilter, SegmentedControl
│   ├── illustrations/  Original SVG artwork
│   ├── navigation/     Navbar, Sidebar, MobileBottomNav, Breadcrumb
│   ├── payment/        PaymentSummary, PaymentStatus
│   ├── pdf/            PDFViewer, PDFToolbar, PDFThumbnail, PDFPage
│   ├── search/         SearchBar, SearchResults, SearchEmptyState
│   └── user/           Avatar, ProfileCard
├── context/            AuthContext, PurchaseContext, ToastContext
├── data/               Presentation copy, content labels, marketing and FAQ
├── hooks/              useAsync, useDebounce, useMediaQuery, useSeo, ...
├── layouts/            PublicLayout, AppLayout
├── pages/              One folder per area, per the product flow
├── routes/             Route table + ProtectedRoute / ClassProtectedRoute / ContentProtectedRoute
├── services/           auth, class, subject, content, purchase, payment, library, profile
├── types/              Domain types
└── utils/              cn, format, accent, icons
```

### Design system

Tokens live in `src/index.css` under Tailwind 4's `@theme`: one type family (Outfit),
a blue primary, purple secondary, green/success, orange/warning, pink and sky accents,
a shared radius scale, soft low-contrast shadows and a small set of motion tokens.

`prefers-reduced-motion` is honoured globally. Status is never conveyed by colour
alone — every locked/unlocked, active/inactive state also carries an icon or text.

---

## Routes

| Route | Access |
|---|---|
| `/` | Public |
| `/login` | Public |
| `/classes` | Public |
| `/classes/:classId` | Public |
| `/purchase/:classId` | Signed in |
| `/faq` | Public |
| `/payment` | Signed in |
| `/payment/success` | Signed in |
| `/payment/failed` | Public |
| `/dashboard` | Signed in |
| `/dashboard/classes` | Signed in |
| `/dashboard/notifications` | Signed in |
| `/library` | Signed in |
| `/profile` | Signed in |
| `/search` | Signed in |
| `/classes/:classId/subjects` | Class purchased |
| `/classes/:classId/subjects/:subjectId` | Class purchased |
| `/classes/:classId/subjects/:subjectId/chapters` | Class purchased |
| `/chapters/:chapterId/content` | Class purchased |
| `/notes/:contentId` | Signed in, access checked |
| `/pyqs/:subjectId` | Class purchased |
| `*` | 404 |

Class 11 and 12 additionally gate on a chosen stream, stored in the
`?stream=` query parameter so pages stay shareable and back/forward works.

---

## Responsive behaviour

- **Desktop** — sidebar plus multi-column grids.
- **Tablet** — columns reduce, grids reflow.
- **Mobile** — dedicated bottom navigation (Home · Classes · Library · Search ·
  Profile) with at least 78 px per item, stacked layouts, and no horizontal
  scrolling anywhere (asserted by `audit:responsive` across 14 routes at three
  widths).

---

## Data and access model

`ClassId` is a literal union (`7 | 8 | 9 | 10 | 11 | 12`), so an out-of-range class
is a type error rather than a runtime surprise.

Access is always **reported and enforced by Django** from ACTIVE purchase records:

```
purchase.classId ∈ unlockedClasses  →  content unlocked
```

- One class = one payment = complete access to that class only.
- Buying Class 10 never unlocks 7, 8, 9, 11 or 12.
- `is_locked`, `has_access` and the document response are server-side decisions;
  frontend values only drive presentation.

Content types are a single discriminated union (`NOTES`, `PYQ`, `SOLVED_PYQ`,
`IMPORTANT_QUESTIONS`, `PRACTICE_PAPER`, `MODEL_PAPER`) driving one reusable card,
one tab set and one filter — adding a type is a data change, not a new component.

---

## Development content

The academic catalogue is seeded in PostgreSQL. To attach valid local-development
PDFs to real chapters, run the backend command:

```bash
cd backend
python manage.py seed_content
```

Use `--class 10` or `--limit 40` to scope it. Existing rows are preserved.

## Two content systems

VPEDIA serves two deliberately separate kinds of educational material. They are
never mixed, and they have different access rules.

| | Class Content | Other Resources |
|---|---|---|
| Belongs to | Class → Stream → Subject → Chapter | Category only |
| Model | `apps.content.Content` | `apps.resources.OtherResource` |
| Gated by | `has_class_access` — an ACTIVE `ClassPurchase` | `is_published` only |
| Admin | `/admin-panel/content` → **Class Content** | `/admin-panel/content` → **Other Resources** |
| Student | `/classes/…` | `/other-resources` |
| API | `/api/v1/contents/…` | `/api/v1/other-resources/…` |

An Other Resource has **no** class, stream, subject or chapter foreign key. That
is structural, not a convention: with nothing to resolve, there is no path by
which a resource could grant, create or alter an entitlement. Uploading one can
never activate a `ClassPurchase`.

Uploads default to **Draft**. Only an explicit **Publish** makes material
visible, and the backend filters drafts out of every student-facing endpoint.

Seed the default resource categories (idempotent — never duplicates, never
overwrites an administrator's edits):

```bash
python manage.py seed_resource_categories
python manage.py seed_resource_categories --add "Entrance Exams"
```

Both content systems accept PDF only. Validation checks size, the `.pdf`
extension **and** the `%PDF-` magic bytes, so an archive or executable renamed
to `.pdf` is rejected.

Other Resources are readable by any signed-in student; class content still
requires an approved purchase. Files are streamed only through gated routes —
`/contents/{slug}/document/` and `/other-resources/{slug}/document/` — and no
storage path is ever serialised into a list response.

---

## Known scope boundaries

By design this project does not implement R2/S3, subscriptions, recommendations
or an advanced student-facing frontend. Google OAuth, Django Admin
authentication, PostgreSQL, manual UPI payments and the existing payment
approval workflow remain backend responsibilities.

Two things previously listed here have since been built and are documented
below: admin notifications, and an aggregated dashboard.

Deliberately still out of scope: Razorpay or any other payment gateway, Redis,
WebSockets or Django Channels, email/SMS/WhatsApp delivery, live classes, video
streaming, and any external analytics platform. Notification delivery is
in-portal only.

## Custom admin panel

The separate staff-only React panel is available at `/admin-panel`. It uses the
existing Django staff/password architecture and the same session cookie as the
backend; it does not create a second user database or change student Google
OAuth. Django Admin remains available at `/admin/` as the internal fallback.

Custom admin API routes live under `/api/v1/admin/` and require an authenticated,
active `is_staff` user. Students receive `403 Forbidden` from staff-only routes.
The panel covers dashboard statistics, students, class pricing/status, subjects,
chapters, educational PDF uploads/publishing, purchases, payment review and live
UPI/QR settings.

### Layout and responsiveness

Three breakpoints, no horizontal page overflow at any of them:

| Width | Navigation |
| --- | --- |
| `>= 1024px` | full 256px sidebar with labels |
| `768px – 1023px` | 68px icon rail; labels become `sr-only`, so the name still reaches assistive tech |
| `< 768px` | off-canvas drawer; 246x38px minimum nav targets |

Tables become one card per row below `md` rather than scrolling sideways, and
create/edit forms render in the shared `Modal`, which becomes a full-height
bottom sheet on a phone. The header stays usable at every width: brand,
notification bell, account and logout never wrap.

### Dashboard

`GET /api/v1/admin/dashboard/` returns the whole screen in one request. Every
figure is produced by a grouped SQL query in
`backend/apps/admin_api/dashboard.py`, so the browser never receives rows to
count and opening the page costs a fixed number of queries regardless of data
volume.

`approved_revenue` sums **ACTIVE** purchases only. Pending and rejected requests
never contribute to it — no money has been accepted for those.

Charts are CSS/SVG (`src/admin/ui/charts.tsx`): a bar list, a status bar, a
14-day registration trend and a donut. No charting dependency was added.

### Notifications

`AdminNotification` (migration `0001_initial` in `apps/admin_api`) is a
staff-only feed of things that actually happened: a student signed in, a
payment proof was submitted, a payment was approved or rejected, content or a
resource was published.

Three properties are deliberate:

* **Server-created.** Rows come from `apps.admin_api.notifications.notify`,
  called by the Google OAuth adapter and the payment service. There is no create
  endpoint at all — `POST /api/v1/admin/notifications/` answers `405` — so a
  client cannot forge "payment approved".
* **Not business state.** Deleting a notification loses a breadcrumb, never a
  purchase.
* **Links are server-generated.** `link` is built from the primary key of the
  record it describes, so it can only point inside the portal.

The header bell polls `unread-count/` every 20 seconds, pauses while the tab is
hidden, and reloads immediately on `visibilitychange` or when another part of the
portal changes a read state. No WebSockets or background workers.

### Subjects and chapters

Both use the same dependent Class → Stream → Subject chain:

* Classes 7–10 have no Stream field at all; Classes 11–12 require one. The rule
  is enforced server-side as well, because a hidden field is not a validation.
* The Subject list is restricted **by the query**, not by hiding options in the
  browser: `/subjects/?class=<slug>&stream=<slug>`.
* Class 11/12 legitimately have a "Mathematics" in every stream, so options are
  labelled `Mathematics — Science`, `Mathematics — Commerce`. A bare duplicate
  name is never listed.
* Editing preselects the existing Class and Subject from the row itself
  (`AdminChapterSerializer` exposes `class_level_id`, `stream_id` and
  `stream_name` for exactly this), so nothing has to be re-selected and no extra
  request is needed.
* Renaming mutates the row. The primary key, every chapter and content foreign
  key, every uploaded PDF and the published/draft flag are all preserved, and
  the slug is **not** recomputed — so a rename cannot break a bookmarked URL.
* Slugs are derived server-side on create. An explicit slug is still honoured.

A note on the database layer: `UNIQUE(class_level, stream, slug)` protects
nothing for Classes 7–10, because PostgreSQL treats a NULL in a unique index as
distinct from every other NULL. `AdminSubjectSerializer` therefore also checks
the name per class/stream and returns a message naming the class.

### Search and filters

Every admin list honours `?search=`, `?ordering=`, `?page=`, `?page_size=` plus
its own filters (`class`, `stream`, `subject`, `status`, `type`, `published`,
`unread`, `group`). `StandardPagination` serves 25 rows a page, maximum 100.

`StaffReadOnlyViewSet` exists so that read-only admin lists cannot forget
`filter_backends`. DRF's default is an empty list, so a viewset that declares
`search_fields` without it accepts `?search=` and silently discards it — the page
looks like it is searching and quietly returns everything. Students, Purchases
and Payments all had that defect; `test_no_admin_list_ignores_a_search_parameter`
guards the whole class of bug.

### Error handling

The frontend never renders a Django error page. `src/services/client.ts` refuses
any non-JSON or HTML body and substitutes a status-appropriate sentence, because
under `DEBUG=True` an unhandled exception answers with an HTML page containing
settings, SQL and file paths — trusting that body is how a traceback ends up
rendered inside the app. Panels render `ErrorState` (icon, sentence, **Try
again**); forms render DRF field errors next to the field that caused them.
