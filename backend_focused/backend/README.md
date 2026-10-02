# Fleet Maintenance API: backend

Django 5.2 + Django REST Framework 3.17 API for offices, vehicles, mechanics and
maintenance records. Data is stored in SQLite (`backend/db.sqlite3`).

**Contents:** [Run with Docker](#run-with-docker-recommended) ·
[Run without Docker](#run-without-docker) · [API](#api) · [Errors](#errors) ·
[Tests](#tests) · [Design notes](#design-notes) · [Assumptions](#assumptions) ·
[Tradeoffs and next steps](#tradeoffs-and-next-steps) · [Project layout](#project-layout) ·
[Troubleshooting](#troubleshooting)

## Run with Docker (recommended)

You need Docker Desktop, or Docker Engine with the Compose v2 plugin.

```bash
cd backend_focused
docker compose up -d --build
```

On startup the container applies migrations, then runs the Django dev server.

| URL | What it is |
|---|---|
| http://localhost:8000/api/ | API root (browsable in a browser, JSON for API clients) |
| http://localhost:8000/api/docs/ | Swagger UI, where you can try every endpoint |
| http://localhost:8000/api/schema/ | OpenAPI 3 schema |
| http://localhost:8000/admin/ | Django admin (create a user first, see below) |

The `backend/` folder is mounted into the container, so code edits reload the server
automatically and the database file is the same one a local virtualenv run would use.

### Load sample data

```bash
docker compose exec backend python manage.py seed_fleet
```

This creates 12 offices, 40 mechanics, 2,000 vehicles and 50,000 maintenance records
spread over the last three years, in about 4 seconds on an empty database. Replacing
existing data with `--clear` takes about 15 seconds under Docker Desktop, because the
database file sits in the bind-mounted folder where disk writes are slower (natively it
stays around 4 seconds). It finishes by printing the vehicles and URLs worth a look. The
data includes a case for each endpoint:

- an office with no vehicles
- active vehicles never serviced, and overdue vehicles, including one last serviced
  exactly 365 days ago (not overdue) and one 366 days ago (overdue)
- inactive vehicles reusing an active vehicle's license plate
- inactive mechanics, and active mechanics with no work this year
- one vehicle with 500 maintenance records

The same `--seed` on the same day always produces the same data. The command refuses to
run on a database that already has fleet data unless you pass `--clear`.

| Option | Default | Meaning |
|---|---|---|
| `--offices`, `--mechanics`, `--vehicles`, `--records` | 12, 40, 2000, 50000 | How much to create |
| `--seed` | 42 | Random seed |
| `--clear` | off | Delete all existing fleet data first |

### Everyday commands

Run these from `backend_focused/`.

| Task | Command |
|---|---|
| Follow the logs | `docker compose logs -f backend` |
| Replace the data with a fresh sample | `docker compose exec backend python manage.py seed_fleet --clear` |
| Run the tests | `docker compose exec backend python manage.py test` |
| Run the tests when the stack is stopped | `docker compose run --rm backend python manage.py test` |
| Create migrations after a model change | `docker compose exec backend python manage.py makemigrations` |
| Apply migrations | `docker compose exec backend python manage.py migrate` |
| Create an admin user | `docker compose exec backend python manage.py createsuperuser` |
| Django shell | `docker compose exec backend python manage.py shell` |
| Rebuild after changing `requirements.txt` | `docker compose up -d --build` |
| Stop | `docker compose down` |
| Reset the database | `docker compose down && rm backend/db.sqlite3 && docker compose up -d` |

### Configuration

Set these under `environment:` in `docker-compose.yml`, or export them before running
locally.

| Variable | Default | Purpose |
|---|---|---|
| `BACKEND_PORT` | `8000` | Host port (Compose only), e.g. `BACKEND_PORT=8001 docker compose up -d` |
| `DJANGO_DEBUG` | `1` | `0` turns debug mode off |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated host names Django will serve |
| `DJANGO_SECRET_KEY` | development key | Set a real secret outside local development |

The frontend reads `NEXT_PUBLIC_API_BASE_URL`, which defaults to
`http://localhost:8000/api`. Change it if you change `BACKEND_PORT`.

## Run without Docker

Requires Python 3.10 or newer (developed on 3.14).

```bash
cd backend_focused/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_fleet        # optional sample data
python manage.py runserver 0.0.0.0:8000
```

Run the tests with `python manage.py test`.

## API

Every endpoint is under `/api/` and is documented, with a "Try it out" button, at
http://localhost:8000/api/docs/.

| Method | Path | What it does |
|---|---|---|
| GET, POST | `/api/offices/` | List / create offices |
| GET, PUT, PATCH, DELETE | `/api/offices/{id}/` | Read / update / delete an office |
| GET | `/api/offices/summary/` | Every office with its active vehicle count, maintenance cost over the last 12 months and latest maintenance date |
| GET, POST | `/api/vehicles/` | List / create vehicles. The list is also the **vehicle search** (filters below) |
| GET | `/api/vehicles/{id}/` | Vehicle detail: office, complete maintenance history (newest first) and the mechanic of each record |
| PUT, PATCH, DELETE | `/api/vehicles/{id}/` | Update / delete a vehicle |
| GET | `/api/vehicles/{id}/maintenance-history/` | The vehicle's maintenance records, newest first, paginated |
| POST | `/api/vehicles/{id}/assign-office/` | Move the vehicle to another office: `{"office": 3}` |
| GET | `/api/vehicles/needing-maintenance/` | Active vehicles never serviced or last serviced more than 365 days ago, oldest maintenance first |
| GET | `/api/vehicles/duplicate-check/?vin=&license_plate=&exclude_id=` | Which of the given VIN and plate already belong to another vehicle |
| GET, POST | `/api/mechanics/` | List / create mechanics (`?active=true` / `false`) |
| GET, PUT, PATCH, DELETE | `/api/mechanics/{id}/` | Read / update / delete a mechanic |
| GET | `/api/mechanics/workload/` | Records completed and their total cost this calendar year, busiest first (`?active=true` hides inactive mechanics) |
| GET, POST | `/api/maintenance-records/` | List / create records (`?vehicle=`, `?mechanic=`, `?maintenance_type=`) |
| GET, PUT, PATCH, DELETE | `/api/maintenance-records/{id}/` | Read / update / delete a record |

### Vehicle search

All parameters are optional and combine with AND, for example
`/api/vehicles/?office=3&active=true&mechanic_certification=ASE-1234567&maintenance_from=2026-01-01&maintenance_to=2026-03-31`.

| Parameter | Matches |
|---|---|
| `office` | Office ID |
| `active` | `true` or `false` |
| `make`, `model` | Exact value, case-insensitive |
| `maintenance_from`, `maintenance_to` | A maintenance record dated in this range (both inclusive, either may be used alone) |
| `mechanic_certification` | A maintenance record by the mechanic with this certification number |

The three maintenance parameters describe **one** record: "serviced by ASE-1234567 in
March" only matches vehicles where that mechanic did work in March, not vehicles that
mechanic serviced in January and someone else serviced in March.

### Conventions

- **Trailing slashes are required** (`/api/vehicles/`, not `/api/vehicles`).
- **Pagination.** Lists that grow with the fleet return
  `{"count", "next", "previous", "results"}`, 20 items per page. Use `?page=` and
  `?page_size=` (up to 100). The office summary and mechanic workload cover small tables
  and return a plain array, as in the challenge's example.
- **Ordering.** CRUD lists accept `?ordering=`, e.g. `?ordering=-year`.
- **Money** is a JSON number with at most two decimals, e.g. `"maintenance_cost_last_year": 527742.99`.
- **Identifiers** (VIN, license plate, certification number) are trimmed and upper-cased
  on input, so `" abc-123 "` is stored and matched as `"ABC-123"`.

Example responses (from the sample data):

```jsonc
// GET /api/offices/summary/  (one element)
{"id": 54, "name": "Cassandraton Depot", "city": "Cassandraton", "active_vehicle_count": 169,
 "maintenance_cost_last_year": 527742.99, "last_maintenance": "2026-10-01"}

// GET /api/mechanics/workload/  (one element)
{"id": 159, "name": "Jennifer Oliver", "certification_number": "ASE-2322602", "active": true,
 "maintenance_count": 441, "total_cost": 127999.52}

// GET /api/vehicles/duplicate-check/?vin=...&license_plate=...
{"conflicts": ["vin", "license_plate"]}
```

## Errors

| Status | When | Body |
|---|---|---|
| 400 | Invalid input, including uniqueness conflicts and bad search parameters | Messages per field: `{"vin": ["A vehicle with this VIN already exists."]}` |
| 404 | Unknown ID in the URL | `{"detail": "No Vehicle matches the given query."}` |
| 405 | Method not supported, e.g. GET on `assign-office` | `{"detail": ...}` |
| 409 | Deleting something other records depend on: an office with vehicles, a vehicle or mechanic with maintenance records | `{"detail": "...", "blocking_objects": {"vehicles": 191}}` |
| 409 | Two requests saved the same unique value at the same moment and the database rejected the second | `{"detail": "The request conflicts with existing data. Refresh and try again."}` |

Validation rules:

- **Vehicles.**
  - The VIN is 17 characters without I, O or Q, and unique.
  - The model year is between 1981 (when 17-character VINs became standard) and next year.
  - A license plate can't be used by two *active* vehicles. Reactivating a vehicle whose
    plate has since been taken is rejected too.
  - The office can't be changed through PUT/PATCH; use `assign-office`.
- **Maintenance records.**
  - The date can't be in the future.
  - The cost can't be negative (zero is allowed, e.g. warranty work).
  - The maintenance type is one of `oil_change`, `tire_rotation`, `brake_service`,
    `inspection`, `engine_repair`, `transmission`, `battery`, `other`.
  - Inactive mechanics can't be put on a new record. Existing records stay editable.
- **Mechanics.** The certification number is unique.
- **Offices.** The name is unique.

## Tests

```bash
docker compose exec backend python manage.py test                                  # all 68 tests, ~1.5 s
docker compose exec backend python manage.py test fleet.tests.test_vehicle_search_api  # one module
```

Without Docker, run `python manage.py test` from `backend/` with the virtualenv active.
Tests use an in-memory SQLite database and never touch `db.sqlite3`.

| Module | Covers |
|---|---|
| `test_vehicles_api` | Vehicle CRUD validation: normalising, unique VIN, the active-plate rule (including reactivation), office changes, delete protection |
| `test_maintenance_records_api` | Record validation: future dates, costs, types, inactive mechanics |
| `test_offices_mechanics_api` | Office and mechanic CRUD, delete protection, JSON for axios' default `Accept` header |
| `test_reports` | Office summary, needing maintenance and mechanic workload, including date boundaries |
| `test_vehicle_actions_api` | Vehicle detail, maintenance history, assign-office, duplicate check |
| `test_vehicle_search_api` | Every search parameter, and the "same maintenance record" rule |
| `test_seed_command` | Seed sizes, planted scenarios, model validity of generated data, reproducibility |
| `test_dates` | "One year before", including 29 February |

Two techniques worth knowing when reading them:

- **Query counts are asserted** (`assertNumQueries`). For example, vehicle detail must run
  2 queries whether the vehicle has 1 or 40 records, so an N+1 regression fails a test.
- **Report logic takes `today` as an argument** (`Vehicle.objects.needing_maintenance(today)`).
  Boundary cases are tested with a fixed date, without mocking the clock: exactly 365 days,
  31 December vs 1 January, and the first day of the 12-month window.

## Design notes

Query logic lives in custom QuerySet methods in `fleet/models.py`, so views stay thin and
the queries can be tested without HTTP. Measured on the sample data (2,000 vehicles,
50,000 records):

- **Vehicle detail** uses `select_related("office")` plus a `Prefetch` of the records with
  `select_related("mechanic")`.
  - `select_related` can only JOIN single-valued relations, so the one-to-many history
    needs `prefetch_related`. The `select_related` inside the `Prefetch` folds each
    record's mechanic into the same query.
  - Result: 2 queries for any history length, instead of 503 for a vehicle with 500
    records. That vehicle's full detail renders in about 30 ms.
- **Office summary** computes each figure in its own correlated subquery.
  - Annotating `Count("vehicles")` and `Sum("vehicles__maintenance_records__cost")` on
    one queryset JOINs vehicles to records, which repeats each vehicle once per record.
    In testing that reported 5,444 active vehicles instead of 200.
  - Separate subqueries can't fan out, and they need no outer GROUP BY.
- **Vehicles needing maintenance** uses `NOT EXISTS` (any record in the last 365 days?).
  The check stops at the first recent record via an index, instead of aggregating every
  record of every vehicle and discarding most of them, which was 3–5 times slower.
- **Mechanic workload** is a plain JOIN with the date range inside the aggregate's
  `FILTER`. With only one one-to-many relation there's no fan-out. Putting the date range
  in `.filter()` instead would turn it into an inner join and drop idle mechanics from
  the ranking.
- **Vehicle search** collects the maintenance parameters into a single
  `id IN (SELECT vehicle_id ...)` subquery.
  - django-filter applies each filter as its own `.filter()` call, and on a one-to-many
    relation each call adds a separate JOIN. The conditions could then be met by
    different records, and vehicles would repeat. Adding `.distinct()` removes the
    repeats but still gives the wrong answer.
- **Indexes.**
  - `MaintenanceRecord(vehicle, date)` serves history ordering without a sort step,
    latest-date lookups and the recent-record checks.
  - `MaintenanceRecord(mechanic, date)` serves the workload's date range.
  - They make Django's automatic single-column foreign key indexes redundant, so those
    are switched off.
- **Plate uniqueness** is a partial unique index (`UNIQUE (license_plate) WHERE active`),
  plus a serializer check that gives a field-level message.
  - DRF's auto-generated validator for this constraint is incorrect in DRF 3.17. It
    rejects valid inactive vehicles. It is also skipped for a PATCH that only sets
    `active: true`, so that request reaches the database and fails with a 500. It is
    replaced.
- **Assign office** saves with `update_fields=["office"]`, so only `office_id` is written.
  A full `save()` rewrites every column and can silently undo a concurrent change, such
  as another request deactivating the vehicle.

## Assumptions

- **"Last 12 months"** (office summary) runs from the same calendar date one year ago
  through today, both inclusive. For 29 February it starts on 28 February.
- **Office costs and last maintenance date** include records of inactive vehicles; only
  the vehicle count is limited to active vehicles.
- **No assignment history is kept.** "Record only the new office assignment" is read as
  "change only the office field". A vehicle's past records therefore count towards its
  *current* office.
- **"Current year"** (workload) is the calendar year in the server time zone (UTC), from
  1 January through today.
  - Mechanics with no work this year are included with zero, so "least busy" means
    something.
  - Inactive mechanics are listed with `"active": false`.
  - Ties are ordered by total cost, then name.
- **"More than 365 days ago"** is strict: a vehicle serviced exactly 365 days ago is not
  overdue. Vehicles never serviced come first.
- **Duplicate check.**
  - The VIN is compared with all vehicles; the plate only with active vehicles, matching
    the plate rule.
  - It always answers 200, because a conflict is the answer, not an error.
  - `exclude_id` lets an edit form skip the vehicle being edited.
- **Deleting vs deactivating.** Maintenance records are history, so a vehicle or mechanic
  with records can't be deleted; set `active` to `false` instead. The same goes for an
  office that still has vehicles.
- **Assigning a vehicle to its current office** succeeds without changing anything, so a
  retried request doesn't fail.
- **License plates** keep their spaces and hyphens as entered, so `ABC 123` and `ABC-123`
  are different plates.
- **VIN check digits** are not verified. They are only mandatory for North American
  vehicles.

## Tradeoffs and next steps

- **SQLite, as provided.**
  - SQLite stores decimals as floating point. Sums are converted back to `Decimal` and
    rounded to cents, which is exact at these magnitudes.
  - On PostgreSQL the schema and queries work unchanged (the partial unique index
    included). `nulls_first` is already explicit, because PostgreSQL sorts NULLs last.
- **Concurrent writes.** SQLite has no `SELECT ... FOR UPDATE`, so the uniqueness checks
  in serializers can race. The database constraints still hold, and the losing request
  gets a 409.
- **Vehicle detail returns the complete history**, as the challenge asks. For a vehicle
  with 500 records that is about 89 KB. A UI should page through
  `maintenance-history/` instead.
- **Money as JSON numbers** matches the challenge's example and is precise to the cent
  for any realistic fleet total. DRF's default, strings, would also survive values beyond
  about 15 significant digits.
- **django-filter** gives validated parameters (400 on a bad date), a filter form in the
  browsable API and documented parameters in Swagger. The same-record rule needed a
  custom `filter_queryset`.
- **Case-insensitive `make`/`model` matching** can't use an index on SQLite. That is fine
  at this size; on PostgreSQL I would add an index on `UPPER(make)` or use `citext`.
- **No authentication.** The challenge says none is needed, and CORS allows every origin
  for local development. JWT via `djangorestframework-simplejwt` would be the next step.
- **The Docker image runs Django's development server.** A deployment would use gunicorn
  with PostgreSQL, `DJANGO_DEBUG=0` and an explicit `CORS_ALLOWED_ORIGINS`.
- **Next steps.**
  - An office-assignment history table. Office changes already go through a single
    endpoint, so it has one place to write.
  - Assignment history would also let costs follow the office where the work was done.

## Project layout

```
backend/
├── server/            settings, root URLs (admin, /api/, schema, docs)
└── fleet/
    ├── models.py      models, constraints, indexes and the QuerySet methods behind every report
    ├── validators.py  VIN, plate, model year and maintenance date rules
    ├── serializers.py request validation and response shapes
    ├── filters.py     vehicle search
    ├── views.py       ViewSets and their custom actions
    ├── urls.py        router
    ├── exceptions.py  409 responses for protected deletes and constraint conflicts
    ├── pagination.py  page size settings
    ├── dates.py       "one year before"
    ├── admin.py       Django admin
    ├── management/commands/seed_fleet.py
    ├── migrations/
    └── tests/
```

## Troubleshooting

- **`Cannot connect to the Docker daemon`**: Docker Desktop isn't running. Start it and
  retry.
- **`port is already allocated`**: something else is using port 8000. Stop it, or start
  with `BACKEND_PORT=8001 docker compose up -d`.
- **`RuntimeError ... URL doesn't end in a slash` on a POST**: every endpoint ends with
  `/`, for example `/api/vehicles/`, not `/api/vehicles`. Django can redirect a GET to the
  slashed URL, but not a POST without losing its body.
