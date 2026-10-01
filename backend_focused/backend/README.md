# Fleet Maintenance API: backend

Django 5.2 + Django REST Framework 3.17 API for offices, vehicles, mechanics and
maintenance records. Data is stored in SQLite (`backend/db.sqlite3`).

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

## Troubleshooting

- **`Cannot connect to the Docker daemon`**: Docker Desktop isn't running. Start it and
  retry.
- **`port is already allocated`**: something else is using port 8000. Stop it, or start
  with `BACKEND_PORT=8001 docker compose up -d`.
- **`RuntimeError ... URL doesn't end in a slash` on a POST**: every endpoint ends with
  `/`, for example `/api/vehicles/`, not `/api/vehicles`. Django can redirect a GET to the
  slashed URL, but not a POST without losing its body.
