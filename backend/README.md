# VPEDIA LEARNING — Backend

Django REST backend for VPEDIA LEARNING, a study-material platform for school
students in **Classes 7 to 12**.

Access is sold **one class at a time** through a **one-time manual UPI payment**.
There is **no payment gateway**. A student pays in their own UPI application,
returns to the site, submits proof, and an administrator verifies it. Only an
approved payment unlocks a class.

Students sign in with **Google OAuth only**. There is no password, OTP, magic
link or phone authentication anywhere in this project.

---

## Payment architecture

```
Student selects Class 10
        │
        ▼
POST /api/v1/purchases/          → ClassPurchase created, status PENDING
        │                          amount read from the server-side class price
        ▼
GET  /api/v1/purchases/{id}/upi/ → UPI ID, QR code, reference, upi://pay URI
        │
        ▼
Student pays in their own UPI app          ← entirely outside VPEDIA
        │
        ▼
POST /api/v1/payments/proofs/      → PaymentProof created, status PENDING
        │                             screenshot + UTR recorded
        ▼
Administrator reviews in Django Admin
        │
        ├── Approve → PaymentProof APPROVED
        │             ClassPurchase ACTIVE  (activated_at set)
        │             reviewer + timestamp recorded
        │             → has_class_access() now returns True
        │
        └── Reject  → PaymentProof REJECTED
                      ClassPurchase REJECTED
                      rejection_reason stored
                      → access stays locked; student may submit again
```

**Access is never granted by any of these actions alone:**

- creating a purchase
- uploading a screenshot
- opening a `upi://pay` link
- the frontend asking for it

Only `apps.payments.services.approve_payment()` activates a purchase, and it
refuses to run unless an active staff member calls it with a still-pending proof.

---

## Authentication: Google OAuth only

Students authenticate with their Google account. Nothing else exists.

**There is no password sign-in for students, and the routes for it are not
registered at all** — not hidden behind a permission, simply absent:

```
/accounts/login/                   404
/accounts/signup/                  404
/accounts/password/reset/          404
/accounts/password/change/         404
/accounts/email/                   404
/accounts/social/connections/      404
```

Three separate mechanisms enforce that:

1. **URLs** — `apps/accounts/urls.py` routes only Google's `login` and
   `callback`. allauth's password views are never included.
2. **Authentication backend** — the only entry in
   `AUTHENTICATION_BACKENDS` is `GoogleOnlyModelBackend`, a narrowed
   `ModelBackend` that refuses any account without `is_staff`. Django's stock
   `ModelBackend` is not in the list.
3. **Unusable passwords** — every student account is created with
   `set_unusable_password()`, so there is nothing for a password backend to
   check even if one were reachable.

Administrators still sign in to Django Admin with a password. That is a separate,
deliberate path and it is unchanged.

### Login flow

```
Student opens the app and clicks "Continue with Google"
        │
        ▼
GET /api/v1/auth/config/         → { google_enabled, login_url }
        │
        ▼
GET /api/v1/auth/google/         → { login_url }
        │
        ▼   browser navigates away from the SPA
GET /api/v1/accounts/google/login/?process=login&next=/api/v1/auth/complete/
        │  allauth generates `state` (session-bound) and a PKCE verifier,
        │  stashes both in the session, and redirects to Google
        ▼
https://accounts.google.com/o/oauth2/v2/auth
        │  client_id · redirect_uri · response_type=code · scope · state · code_challenge
        ▼
Google authenticates and redirects back
        │
        ▼
GET /api/v1/accounts/google/login/callback/?code=…&state=…
        │  allauth un-stashes and compares `state` (mismatch → 401 page),
        │  exchanges the code with the client secret, verifies the OIDC
        │  response, and confirms Google's `email_verified` claim
        ▼
Adapter policy (apps/accounts/adapter.py)
        │  · refuses an unverified email
        │  · finds the account by Google subject id, then by email
        │  · creates User + StudentProfile on a first-time identity
        ▼
Session created → HTTP-only cookie `vpedia_sessionid`
        │
        ▼
GET /api/v1/auth/complete/       → tiny same-origin page
        │  forwards to the SPA at /auth/google/callback
        ▼
/auth/google/callback  →  GET /api/v1/auth/me/  →  /dashboard
```

The SPA is never told "you are signed in" by the redirect. It asks the backend.
`/auth/google/callback` shows a loader and calls `/api/v1/auth/me/`, so a stale
or hand-crafted redirect grants nothing.

### Logout flow

```
POST /api/v1/auth/logout/   (with X-CSRFToken)
        │
        ▼
django.contrib.auth.logout(request)
        │  flushes the session row and cycles the session key
        ▼
200 { "detail": "Signed out." }
        │  `vpedia_sessionid` and `vpedia_csrftoken` expired (Max-Age=0)
        ▼
GET /api/v1/auth/me/  → { "authenticated": false, "user": null }
```

Authentication state is terminated on the server. The cookie the browser still
holds is worthless. Clearing frontend storage is cosmetic and is not the
mechanism.

### Session architecture

| Decision | Choice | Why |
|---|---|---|
| Mechanism | HTTP-only session cookie | JavaScript cannot read it, so an XSS bug cannot steal a long-lived credential. No token in `localStorage`. |
| Storage | `django.contrib.sessions.backends.db` | Inspectable and revocable. |
| CSRF | Enforced by DRF `SessionAuthentication` | Every POST/PATCH/PUT/DELETE needs `X-CSRFToken`. Get one from `GET /api/v1/auth/csrf/`. |
| Unauthenticated | **401** | `SessionAuthenticationWithChallenge` adds a `WWW-Authenticate` header so "signed out" is distinguishable from "not allowed". A CSRF failure is still 403, because that genuinely is a forbidden request. |
| OAuth tokens | Never stored | `SOCIALACCOUNT_STORE_TOKENS = False`. The application needs no Google API access, so nothing is persisted. |
| Provider scope | `openid email profile` | Minimum needed for identity and display name. |

Development works because `vite.config.ts` proxies `/api` to
`http://127.0.0.1:8000`. The browser only ever sees `localhost:5173`, so the
session cookie is a plain first-party cookie and `SameSite=Lax` is not a problem.

> **Production note.** `SameSite=Lax` requires the SPA and API to be same-site.
> Use `app.example.com` and `api.example.com`, not `app.example.com` and
> `api.other-vendor.com`. If you deliberately split them across different
> registrable domains, set `SESSION_COOKIE_SAMESITE=None`,
> `CSRF_COOKIE_SAMESITE=None` and both `*_COOKIE_SECURE=True`, and serve only
> over HTTPS.

### Configuring Google Cloud Console

Written for someone who has never configured Google OAuth before. The whole
thing takes about ten minutes and happens once.

#### 1. Create a project

1. Open <https://console.cloud.google.com/>.
2. Click the project picker at the top and choose **New Project**.
3. Name it something like `VPEDIA LEARNING` and click **Create**.

#### 2. Configure the OAuth consent screen

1. In the left sidebar open **APIs & Services → OAuth consent screen**.
2. Choose the user type:
   - **External** — anyone with a Google account can sign in. Correct for
     individual students.
   - **Internal** — only users in your own Google Workspace organisation.
     Choose this if your school runs on Workspace and you want to restrict
     sign-in to that domain.
3. Fill in the app details:
   - **App name** — `VPEDIA LEARNING` (what students see on Google's screen).
   - **User support email** — a real address you monitor.
   - **Developer contact email** — yours.
4. Under **Scopes**, add:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`

   These are the only two the app needs. Do not add more.
5. Click **Save and Continue**.

**"Publish app" vs "Test mode".** While the consent screen is in *Testing*,
Google only lets accounts you explicitly list as test users sign in, and those
accounts show a red "this app is unverified" warning screen. For real students,
either click **Publish app** (an unverified warning is acceptable for a small
first release; Google allows up to 100 users in testing before requiring
verification) or complete Google's verification for production.

#### 3. Create the OAuth client

1. **APIs & Services → Credentials**.
2. Click **Create credentials → OAuth client ID**.
3. Choose application type **Web application**.
4. Fill in:

   **Name** — `VPEDIA LEARNING (local)` or `(production)`.

   **Authorized JavaScript origins** — the origin of the page that *starts*
   sign-in. With the Vite dev proxy that is the SPA, not Django:

   ```
   http://localhost:5173
   http://127.0.0.1:5173
   https://your-spa-domain.example
   ```

   Origins are scheme + host + port, with **no trailing path**.

   **Authorized redirect URIs** — where Google sends the browser back. Must
   match the server's value **exactly**, including the port:

   ```
   # Development, through the Vite proxy
   http://localhost:5173/api/v1/accounts/google/login/callback/

   # Development, talking to Django directly (no proxy)
   http://127.0.0.1:8000/api/v1/accounts/google/login/callback/

   # Production
   https://api.your-domain.example/api/v1/accounts/google/login/callback/
   ```

   > The trailing slash matters. Google treats
   > `.../callback` and `.../callback/` as different, and an exact mismatch
   > fails with `redirect_uri_mismatch`.

5. Click **Create**. A **Client ID** and a **Client secret** are shown. Copy the
   client secret now — Google shows it only once.

#### 4. Configure the environment

Copy the values into `backend/.env` (never into source control):

```dotenv
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=1234567890-abcdefghijklm.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-Ab3dEfGh1JkLmN0pQrStUvWxYz
GOOGLE_REDIRECT_URI=http://localhost:5173/api/v1/accounts/google/login/callback/
```

Leave `GOOGLE_REDIRECT_URI` blank to have the server derive it from the incoming
request. That is correct, but it depends on the origin the browser actually used,
so pinning it removes a whole class of `redirect_uri_mismatch` bugs.

#### 5. Verify

```bash
python manage.py check
```

`apps/accounts/checks.py` reports anything wrong before you open a browser:
placeholder-looking credentials, a redirect URI that does not point at the
callback, `FRONTEND_URL` missing from `CSRF_TRUSTED_ORIGINS`, a readable session
cookie, or `http` in a non-debug deployment.

Then start both servers and click "Continue with Google".

#### Which URI do I register?

It depends on how the browser reaches Django:

| How you run it | Redirect URI to register |
|---|---|
| Vite proxy (`npm run dev`, port 5173) | `http://localhost:5173/api/v1/accounts/google/login/callback/` |
| Django directly (`runserver`, port 8000) | `http://127.0.0.1:8000/api/v1/accounts/google/login/callback/` |

With the proxy, Django sees `Host: localhost:5173` and derives the frontend
origin. Google then returns the browser to the Vite dev server, which proxies the
callback through to Django. That is why the proxy must not rewrite the Host
header (`changeOrigin: false`).

### Production configuration

```dotenv
DEBUG=False
SECRET_KEY=<a long random string>
ALLOWED_HOSTS=api.your-domain.example
CORS_ALLOWED_ORIGINS=https://your-spa-domain.example
CSRF_TRUSTED_ORIGINS=https://your-spa-domain.example
FRONTEND_URL=https://your-spa-domain.example

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.your-domain.example/api/v1/accounts/google/login/callback/

SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=True
SECURE_HSTS_PRELOAD=True
USE_X_FORWARDED_PROTO=True
```

Nothing about production is hardcoded. `FRONTEND_URL` drives only the
post-OAuth redirect; `GOOGLE_REDIRECT_URI` drives only the URI sent to Google.

Serve Django behind a TLS-terminating reverse proxy, and forward
`X-Forwarded-Proto` so `SECURE_SSL_REDIRECT` and the secure cookie flags behave.

---

## Requirements

| Component | Version |
|---|---|
| Python | 3.12+ (developed on 3.14) |
| Django | 6.1 |
| DRF | 3.18 |
| django-allauth | 65.19 |
| PostgreSQL | 14+ (developed on 18) |

---

## Setup

### 1. Virtual environment

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. PostgreSQL

```bash
createdb vpedia
```

### 4. Environment

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

Edit `.env`:

```dotenv
DEBUG=True
SECRET_KEY=change-me-to-a-long-random-string
DATABASE_URL=postgresql://postgres:password@localhost:5432/vpedia
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
VPEDIA_UPI_ID=yourupi@bank
VPEDIA_UPI_NAME=VPEDIA LEARNING
```

`.env` is gitignored. Never commit real credentials.

Leaving `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` blank is a supported state:
the project boots, `/api/v1/auth/config/` reports `google_enabled: false`, and no
OAuth route is registered. Nothing is half-configured.

### 5. Migrations, seed, superuser

```bash
python manage.py migrate
python manage.py seed_data
python manage.py seed_data --with-content      # optional placeholder material
python manage.py createsuperuser
```

### 6. Run

```bash
python manage.py runserver
```

| Surface | URL |
|---|---|
| API base | http://127.0.0.1:8000/api/v1/ |
| Health | http://127.0.0.1:8000/api/v1/health/ |
| Django Admin | http://127.0.0.1:8000/admin/ |

### 7. Tests

```bash
pytest
```

### 8. Frontend

```bash
cd ..
npm install
npm run dev          # proxies /api and /admin to http://127.0.0.1:8000
```

Open <http://localhost:5173>. The sign-in button needs `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` in `backend/.env`; otherwise it reports that sign-in is
not configured rather than pretending to work.

> The Vite proxy means Google must be given
> `http://localhost:5173/api/v1/accounts/google/login/callback/` as the redirect
> URI. See *Which URI do I register?* above.

---

## Seed data

`python manage.py seed_data` creates development data and is **idempotent** —
running it again updates rows rather than duplicating them.

| Class | Price | Streams |
|---|---|---|
| Class 7 | ₹99 | — |
| Class 8 | ₹99 | — |
| Class 9 | ₹149 | — |
| Class 10 | ₹199 | — |
| Class 11 | ₹249 | Science, Commerce, Humanities |
| Class 12 | ₹299 | Science, Commerce, Humanities |

These are **development defaults stored as ordinary rows** in
`ClassLevel.price`. They are editable in Django Admin and are never hardcoded
into business logic.

Streams: Science, Commerce, Humanities — each linked to the classes that offer it.

---

## Project layout

```
backend/
├── manage.py
├── requirements.txt
├── pytest.ini
├── .env.example
│
├── config/
│   ├── settings.py        environment-driven configuration
│   ├── urls.py            admin + /api/v1/ + guarded media
│   ├── api_urls.py        versioned API routes
│   ├── wsgi.py / asgi.py
│
├── apps/
│   ├── core/              validators, permissions, pagination, health, auth backend, seed command
│   ├── accounts/          User (email identity), StudentProfile, Google adapter, auth API
│   ├── academics/         ClassLevel, Stream, Subject, Chapter
│   ├── content/           Content (six content types)
│   ├── purchases/         ClassPurchase, access-control service
│   ├── payments/          UPISettings, PaymentProof, approval service, admin
│
├── templates/             OAuth failure pages
├── media/                 uploads (never public)
└── tests/                 pytest suite
```

---

## Models

| Model | Table | Purpose |
|---|---|---|
| `accounts.User` | `accounts_user` | Email-identified user, no username, unusable password |
| `accounts.StudentProfile` | `accounts_student_profile` | Optional class/stream preference, phone, avatar |
| `academics.ClassLevel` | `academics_class_level` | Class + **server-side price** |
| `academics.Stream` | `academics_stream` | Science / Commerce / Humanities |
| `academics.Subject` | `academics_subject` | Unique per class + stream |
| `academics.Chapter` | `academics_chapter` | Unique per subject |
| `content.Content` | `content_content` | Material, unpublished by default |
| `purchases.ClassPurchase` | `purchases_class_purchase` | Entitlement |
| `payments.UPISettings` | `payments_upi_settings` | Singleton UPI config |
| `payments.PaymentProof` | `payments_payment_proof` | UPI evidence + review state |

### Access rules enforced in the database

| Constraint | Effect |
|---|---|
| `purchases_unique_active_purchase_per_user_class` | At most one `PENDING`/`ACTIVE` purchase per user + class |
| `payments_upi_settings_singleton` | Only the `pk=1` UPI row may exist |
| `accounts_user_unique_google_subject` | One account per Google identity |
| `PaymentProof.utr` unique | A single bank transfer cannot be claimed twice |
| `academics_subject_unique_per_class_stream` | No duplicate subject per class/stream |

Because a purchase row is scoped to exactly one `class_level`, a Class 10
purchase cannot grant access to any other class. There is no path in the code
that widens that scope.

---

## Access control

```python
from apps.purchases.services import has_class_access

if has_class_access(request.user, chapter.subject.class_level):
    ...
```

Returns `True` only when the user is **authenticated and active** and an
`ACTIVE` `ClassPurchase` exists for that exact class.

| Purchase status | Access |
|---|---|
| `PENDING` | No |
| `ACTIVE` | **Yes** |
| `REJECTED` | No |
| `CANCELLED` | No |
| No purchase | No |
| Inactive user | No |

Reusable pieces:

- `has_class_access(user, class_level)`
- `get_active_purchase(user, class_level)`
- `get_unlocked_class_ids(user)`
- `user_can_access_content(user, content)`
- `apps.core.permissions.IsOwnerOrStaff`
- `apps.payments.permissions.IsPaymentReviewer`

### `selected_class` is not an entitlement

`StudentProfile.selected_class` and `selected_stream` record what a student is
studying and shape the default dashboard. They grant nothing.

```python
profile.selected_class = Class 10
has_class_access(student, class 10)   # still False until a payment is approved
```

`GET /api/v1/profile/me/` returns both facts side by side so the distinction is
visible rather than implied:

```json
{
  "profile": { "selected_class": 4, "selected_class_name": "Class 10" },
  "unlocked_classes": [],
  "has_access_to_selected_class": false
}
```

Access to material is decided by `ClassPurchase` rows, never by a profile field.

---

## API endpoints

Base: `/api/v1/`

### Public read

| Method | Path | Notes |
|---|---|---|
| GET | `/health/` | `{"status":"ok","service":"VPEDIA LEARNING API"}` |
| GET | `/classes/` | Active classes with price |
| GET | `/classes/{slug}/` | One class |
| GET | `/classes/{slug}/subjects/` | `?stream=` to narrow |
| GET | `/streams/` | `?class=` to narrow |
| GET | `/subjects/` | `?class=` `?stream=` |
| GET | `/subjects/{slug}/` | One subject |
| GET | `/subjects/{slug}/chapters/` | Chapters + published-material counts |
| GET | `/chapters/` | `?subject=` `?class=` |
| GET | `/contents/` | Metadata only, `is_locked` per row |
| GET | `/contents/{slug}/` | One item |
| GET | `/contents/{slug}/access/` | `{"allowed": bool, "reason": ...}` |
| GET | `/chapters/{slug}/contents/` | `has_access` + results |
| GET | `/payments/upi/` | Active UPI config |

### Authentication

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/auth/config/` | — | `{google_enabled, login_url}`; 503 when unconfigured |
| GET | `/auth/csrf/` | — | Issues the CSRF cookie, returns the token |
| GET | `/auth/google/` | — | `{login_url}` to begin the round trip |
| GET | `/auth/complete/` | — | Post-OAuth landing page |
| GET | `/auth/me/` | — | Always 200: `{authenticated, user, profile, unlocked_classes}` |
| POST | `/auth/logout/` | — | Terminates the session server-side |
| GET | `/accounts/google/login/` | — | OAuth start (allauth) |
| GET | `/accounts/google/login/callback/` | — | OAuth callback (allauth) |

### Profile

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/profile/me/` | student | Own account, profile, unlocked classes |
| PATCH | `/profile/me/` | student | `first_name`, `last_name`, `selected_class`, `selected_stream` **only** |

### Purchases and payments

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/purchases/` | student | `{class_level, stream?}` → PENDING |
| GET | `/purchases/` | student | Caller's purchases |
| GET | `/purchases/my/` | student | Same, explicit alias |
| GET | `/purchases/{id}/upi/` | owner | UPI id, QR, `upi://pay` URI |
| GET | `/purchases/{id}/access/` | owner | Entitlement for this purchase |
| POST | `/payments/proofs/` | student | multipart: purchase, utr, screenshot |
| GET | `/payments/proofs/` | student | Caller's proofs |
| GET | `/payments/my/` | student | Same, explicit alias |
| GET | `/payments/proofs/{id}/detail/` | owner | Own proof |
| GET | `/my-classes/` | student | Classes with an approved purchase |

### Staff only

| Method | Path | Notes |
|---|---|---|
| POST | `/payments/proofs/{id}/approve/` | Approve + activate |
| POST | `/payments/proofs/{id}/reject/` | Requires `reason` |
| POST | `/payments/proofs/{id}/note/` | Internal note |

Every authenticated route returns **401** without a valid session, **403** when
signed in but not permitted, and **403** for a missing CSRF token on an unsafe
method.

---

## Server-side amount validation

`PurchaseRequestSerializer` has **no `amount` field**, and
`submit_payment_proof` copies the amount from the purchase record. A client
posting `{"amount": "1.00"}` is ignored; the server-side class price is used.

Approval re-checks that the proof amount matches the purchase amount and rolls
the whole transaction back if it does not.

---

## UPI payment URI

`build_upi_uri()` produces the vendor-neutral standard:

```
upi://pay?pa=<UPI_ID>&pn=<NAME>&am=<AMOUNT>&cu=INR&tn=<REFERENCE>
```

No provider-specific deep links are used. Opening this URI means only that a
UPI app was launched — it is not evidence of payment, and the backend never
treats it as such.

---

## Django Admin

Registered: User, StudentProfile, ClassLevel, Stream, Subject, Chapter,
Content, ClassPurchase, PaymentProof, UPISettings.

**PaymentProof** console shows student, class, amount, UTR, status,
submitted_at, reviewed_at and reviewed_by, with filters on status, class,
payment method, submitted date and currency, and search across student email,
name, UTR and transaction id.

Review happens in two places, both calling the same service:

- the change form (Approve / Reject with a required rejection reason)
- bulk list actions

`ClassPurchase` and `PaymentProof` amount fields are read-only in admin, and
purchases cannot be created by hand — they must come through the API so the
amount stays server-derived.

---

## Uploads

```
media/
├── payment_proofs/   student UPI screenshots
├── content/          study material
├── profile_images/   student avatars
├── avatars/          Google profile photos
└── upi/qr/           configured UPI QR
```

Paths are `…/<year>/<month>/<reference>/<uuid>.<ext>` — original filenames are
never reused, which removes path traversal and name collisions.

Screenshots are validated by **decoding them with Pillow** and fully loading the
image, so a renamed text file or a truncated file is rejected. The
client-supplied `Content-Type` is not trusted. Allowed: JPG, PNG, WebP. Size
limit: `MAX_UPLOAD_SIZE_MB` (default 5 MB).

### Files are not public

`MEDIA_URL` resolves to `apps.core.views.private_media`, which requires an
active staff member and blocks path traversal. Non-staff callers get 403 and
never learn whether the file exists. Payment screenshots are therefore not
reachable by an unauthenticated request.

The `PaymentProof` serializer also omits the screenshot URL entirely.

---

## Security

- `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS` all from the environment
- No credentials in source; `.env` gitignored
- CORS uses an explicit allowlist — `CORS_ALLOW_ALL_ORIGINS` is never enabled
- CSRF trusted origins from the environment, and enforced on every unsafe method
- `X-Frame-Options: DENY`, `nosniff`, `same-origin` referrer policy
- HSTS / secure-cookie flags available for HTTPS deployments
- Admin-only access to uploads, with traversal protection
- Students cannot approve, reject, or change an amount or status
- Students cannot read or submit against another student's records
- Ownership enforced by DRF object permissions, not by URL obscurity

### Authentication-specific

- **OAuth `state` is session-bound.** A callback with a missing, forged or
  cross-session state is refused with a 401 page before any token exchange.
- **PKCE (S256) is on.** The authorization code is bound to a verifier that never
  leaves the server session and never appears in a URL.
- **Only a Google-verified email is accepted.** `email_verified` must come from
  Google's decoded OIDC response. A hand-written `{"email": "..."}` reaches no
  endpoint that could return a session.
- **No OAuth token is stored.** `SOCIALACCOUNT_STORE_TOKENS = False`, and no API
  response or log line contains a token or the client secret.
- **OAuth cannot grant or revoke privileges.** `save_user` never assigns
  `is_staff` or `is_superuser`.
- **Profile writes are a four-field whitelist.** Anything else in the body is
  rejected with a 400 naming the field, so tampering is visible rather than
  silently dropped.
- **No user id in the URL or body.** Ownership always comes from
  `request.user`.
- **`System check` verifies the OAuth wiring** before a browser is ever opened —
  see `apps/accounts/checks.py`.

---

## Tests

```bash
pytest                    # full suite
pytest -v                 # named tests
pytest tests/test_class_access.py
```

175 tests covering the required behaviours and the surrounding security
boundaries:

| File | Focus |
|---|---|
| `test_public_api.py` | Health, catalogue reads |
| `test_purchase_creation.py` | Creation, server-side pricing, duplicate prevention |
| `test_payment_workflow.py` | Submission, approval, rejection, atomicity, double review |
| `test_class_access.py` | The access rule in every state |
| `test_api_permissions.py` | Transport-layer enforcement, amount tampering |
| `test_google_oauth.py` | Sign-in flow, account creation, verified email, callback misuse, staff safety, configuration checks |
| `test_profile_api.py` | Session state, profile, ownership tampering, CSRF, logout |
| `test_stage2_compatibility.py` | Every Stage 2 behaviour re-verified over real session cookies |

The OAuth tests drive allauth's real login-start and callback views over HTTP.
Only Google's token endpoint and userinfo endpoint are stubbed, so `state`
validation, PKCE, session creation and the adapter policy all execute exactly as
they do in production.

---

## Not in this stage

Any payment gateway · object storage (R2/S3) · email or SMS · recommendations ·
analytics · deployment configuration.

Each has a prepared seam: the storage-agnostic `FileField` upload helpers, and
the document-reference pattern the frontend already uses for private PDFs.

Google OAuth **is** implemented. See *Authentication: Google OAuth only* above for
the full setup, or run `python manage.py check` to validate a configuration
before opening a browser.
