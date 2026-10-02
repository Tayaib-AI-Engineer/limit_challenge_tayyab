# Fleet Maintenance: frontend

Next.js 16 (App Router) + React 19 + MUI 7 + TanStack Query + axios, the stack the scaffold
came with. It talks to the backend in [`../backend`](../backend/README.md) over its JWT-protected
REST API.

**Demo video:** https://www.loom.com/share/4cd8ab866d4941ba8b5c958376a9455e (about 1 minute,
end to end against the real backend).

## Run it

1. **Start the backend and load sample data** (this also creates the login
   `demo` / `demo-password`):

   ```bash
   cd backend_focused
   docker compose up -d --build
   # wait until `docker compose logs backend` shows "Starting development server"
   docker compose exec backend python manage.py seed_fleet
   ```

2. **Start the frontend** (Node.js 20.9 or newer):

   ```bash
   cd backend_focused/frontend
   npm install
   npm run dev          # or: npm run build && npm start
   ```

3. Open http://localhost:3000. The login form is prefilled with the demo account
   (**demo** / **demo-password**), so you only need to press **Sign in**.

The API address defaults to `http://localhost:8000/api`. Set `NEXT_PUBLIC_API_BASE_URL` (for
example in `.env.local`) to point elsewhere. It is read at build time.

| Script                        | Does                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `npm run dev`                 | Development server with hot reload                        |
| `npm run build` / `npm start` | Production build / serve it                               |
| `npm run lint`                | ESLint (Next, TypeScript, React Compiler rules, Prettier) |
| `npm run format`              | Prettier check                                            |

## Pages

| Page                  | What you can do                                                                                                                             | API endpoints                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`              | Sign in. A deep link survives the detour (`?next=`)                                                                                         | `POST /auth/token/`                                                                                                                                                                                         |
| `/vehicles`           | **Vehicle search**: office, status, make, model, service dates, mechanic; sortable columns; pages. Every filter is in the URL               | `GET /vehicles/?…`, `GET /offices/`, `GET /mechanics/`                                                                                                                                                      |
| `/vehicles/new`       | Add a vehicle, with VIN/plate conflicts flagged while you type                                                                              | `POST /vehicles/`, `GET /vehicles/duplicate-check/`                                                                                                                                                         |
| `/vehicles/[id]`      | Details, totals and the paged maintenance history. Log a service, move to another office, deactivate or reactivate, delete, delete a record | `GET /vehicles/{id}/`, `GET /vehicles/{id}/maintenance-history/`, `POST /maintenance-records/`, `DELETE /maintenance-records/{id}/`, `POST /vehicles/{id}/assign-office/`, `PATCH`/`DELETE /vehicles/{id}/` |
| `/vehicles/[id]/edit` | Edit a vehicle. Only changed fields are sent                                                                                                | `PATCH /vehicles/{id}/`, `GET /vehicles/duplicate-check/`                                                                                                                                                   |
| `/maintenance-due`    | **Work queue** of vehicles due for service. Logging a service takes a vehicle off the list                                                  | `GET /vehicles/needing-maintenance/`, `POST /maintenance-records/`                                                                                                                                          |
| `/offices`            | Office summary. Each card opens the vehicle search filtered to that office                                                                  | `GET /offices/summary/`                                                                                                                                                                                     |

The brief asks for the CRUD endpoints, the vehicle search and one more. The extra one is
**vehicles needing maintenance**, because it's the report a user acts on. The office summary,
assign-office, duplicate-check and maintenance-history endpoints are used too.

## Design decisions

**The URL is the only source of truth for the search.**

- Parameter names are the API's (`?office=3&active=true&make=Ford&maintenance_from=…`), so a
  search can be bookmarked, shared, reloaded or restored with Back.
- [`lib/vehicle-search.ts`](lib/vehicle-search.ts) parses strictly. A value that can't be valid
  (`active=maybe`, `2026-02-30`, an unknown sort field) is dropped with a notice, and the URL
  is corrected, instead of failing the whole search. Values only the server can judge, such as
  an office ID that doesn't exist, are sent, and the API's 400 is shown under the matching filter.
- Filters update the URL with `window.history.replaceState`. The Next docs say this syncs with
  `useSearchParams` without a server round trip. It also sidesteps a Next 16.2.1 production bug,
  where in-page `router.replace` calls snap back after a link to the same page is prefetched.
- `replace`, not `push`: Back leaves the search page instead of undoing filters one at a time.
- Any filter change resets to page 1.
- The page you came from is remembered for the "Back to vehicles" links.

**Data fetching (TanStack Query).**

- Query keys come from one factory ([`lib/query-keys.ts`](lib/query-keys.ts)), and the search key
  is the parsed filters, so equal URLs share a cache entry.
- `keepPreviousData` keeps the old rows on screen (dimmed, with a progress bar) while a new
  search loads, instead of flashing a skeleton.
- 4xx responses are never retried; the default would delay a 404 by several seconds.
- After any write, everything derived from vehicles is invalidated: lists, details, histories,
  the due list, the office summary and the workload. Only queries on screen refetch, so this is
  cheap.
- There are no optimistic updates. The server rejects a lot (uniqueness, inactive mechanics,
  office moves) and answers in tens of milliseconds, so guessing would cost more than it saves.

**Authentication.**

- The access token (1 hour) is kept only in memory. The refresh token (1 day) is kept in
  `localStorage`, so a reload or a new tab stays signed in.
- After a reload, one refresh runs before the page's queries start, instead of each query failing
  with a 401.
- When a token expires mid-session, concurrent 401s share **one** refresh and then retry.
- A failed refresh signs you out and returns you to `/login?next=…`. A network error does not.
- The route guard runs in the browser, because Next's server-side `proxy.ts` can't read
  `localStorage`.

**Styling.**

- MUI only. The scaffold's Tailwind `globals.css` overrode MUI's baseline: Arial on white, and a
  black page under a dark-mode OS.
- `@mui/material-nextjs`'s `AppRouterCacheProvider` puts Emotion's server-rendered styles in
  `<head>`. Without it there was a hydration error.
- The theme uses the Geist font the layout already loads.

**Forms.**

- Controlled MUI fields, with validation that mirrors the backend rules
  ([`lib/rules.ts`](lib/rules.ts)). The server stays the authority, and its 400s are mapped
  onto the matching fields.
- VIN and plate are upper-cased as you type and normalised on blur, just as the server stores
  them.
- The duplicate check runs 400 ms after you stop typing, only once the value is well-formed, with
  the same rules as saving: `exclude_id` when editing, and `active=false` lets a plate be reused.
- Edit sends a PATCH with only the changed fields. Save stays disabled until something changes.
- The office isn't editable on the form; moving a vehicle is its own action (assign-office).

**Smaller details.**

- **Dates.** They're calendar dates, formatted without time-zone conversion
  (`new Date('2026-10-01')` would read 30 September in the US). "Today" for the latest service
  date is the **UTC** date, because that's what the server validates against.
- **Exact-match filters.** Make and model match exactly in the API, so they apply on Enter or
  blur, not on every keystroke, which would flash "no results" for every partial word.
- **Deleting.** A delete refused with 409 (the vehicle still has maintenance records) turns into
  an explanation and a **Deactivate instead** button.
- **Prefetching.** Links in table rows aren't prefetched: each page of rows would fetch 20 route
  payloads for data the browser loads from the API anyway.

## Assumptions and tradeoffs

- **Token storage.** A refresh token in `localStorage` is readable by a successful XSS (React
  escapes output, and nothing renders raw HTML). The production-grade alternative is an httpOnly
  cookie behind a same-origin proxy, at the cost of a proxy hop, CSRF handling and a different
  API base URL.
- **Signing out is client-side only.** The backend doesn't blacklist refresh tokens.
- **The login form is prefilled** with the seeded demo account, for reviewing and the demo
  video. That puts those credentials in the JavaScript bundle, which is acceptable for local
  sample data but not for a real deployment, where the fields would start empty.
- **"Overdue"** means more than 365 days since the last service, or never serviced (active
  vehicles only), the same rule as the backend.
- **Currency** is USD, because the API doesn't carry one.
- **Out of scope:**
  - office and mechanic create/edit screens (the API supports them);
  - editing a maintenance record (delete and log it again);
  - the mechanic workload report.
- **Testing.** No automated frontend tests are included. Every flow was exercised end to end in
  a headless browser against the real API, in a production build: search, URL handling, create
  with duplicate checks, log service, move, edit, 409 to deactivate, the due-list loop, sign-out
  and session refresh. Unit tests for `lib/vehicle-search.ts` and the auth interceptor would be
  the first to add.

## Project layout

```
app/                    routes (App Router); (app)/ holds the signed-in pages behind AuthGate
components/             page components, dialogs, AppShell, AuthGate, snackbar
components/vehicles/    search, table, filters, detail, history, form, dialogs
lib/
  api-client.ts         axios instance, Bearer header, single shared token refresh
  auth.ts               token store (memory + localStorage), session hooks
  api.ts                one function per endpoint
  queries.ts            React Query hooks and post-write invalidation
  query-keys.ts         query key factory
  vehicle-search.ts     URL <-> search state (parse, serialize, hook)
  errors.ts             any failure -> a typed ApiProblem
  rules.ts, format.ts   validation hints, dates and money
  types.ts              API shapes
```
