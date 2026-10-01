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

### Everyday commands

Run these from `backend_focused/`.

| Task | Command |
|---|---|
| Follow the logs | `docker compose logs -f backend` |
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
