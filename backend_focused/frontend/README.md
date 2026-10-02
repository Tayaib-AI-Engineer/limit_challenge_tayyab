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
