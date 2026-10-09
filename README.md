# Carbon Platform — Frontend

Angular single-page application for the agricultural carbon project platform: farmer onboarding → farm & land
data → project → standard / activity / methodology → MRV, sampling and laboratory → carbon calculation →
VVB/ACVA verification → registry issuance → credit ledger → marketplace → retirement → revenue and farmer payout.

This repository holds **only the Angular app**. The API, database migrations, background workers, Docker stack,
operations scripts and the product / workflow documentation live in the backend repository
**[carbon_platform_new](https://github.com/leelakumarakula/carbon_platform_new)**. The two are developed side by side:

```
<workspace>/
├── carbon_platform_new/       backend (FastAPI + SQL Server), docker-compose.yml, docs/
└── carbon_project_frontend/   this repository (Angular 21)
```

Keep that layout: the backend's `docker-compose.yml` builds this app from `../carbon_project_frontend`, and the E2E
smoke test reads the DEMO password from `../carbon_platform_new/backend/.env` unless told otherwise.

| Layer | Technology |
|---|---|
| Frontend | Angular 21, TypeScript strict, standalone components, signals, zoneless, Angular Material, Leaflet + MapLibre |
| API it talks to | FastAPI `/api/v1` (carbon_platform_new), JWT access token in memory + rotating refresh token in an httpOnly cookie |

## Prerequisites

- Node 22+ and npm (verified with Node 24.12 / npm 11.6)
- The backend running on http://localhost:8000 (see the backend README or `docs/fresh-setup.md` there)

## Running the dev server

```bash
npm ci
npx ng serve                 # http://localhost:4200
```

`ng serve` proxies `/api` and `/docs` to `http://localhost:8000` ([proxy.conf.json](proxy.conf.json)), so the app
and the API share one origin in development. The API base path is `/api/v1` (`src/app/core/api/api.service.ts`).

If ports 8000 / 4200 are taken, start the API on another port and run
`ng serve --port 4300 --proxy-config <file>` with a copy of `proxy.conf.json` that points `/api` at the new port.

Sign in with the bootstrap admin, or with the DEMO accounts after `python manage.py seed-demo` in the backend
(`<name>@demo.carbon.example`, password `DEMO_USER_PASSWORD` from the backend `.env`).

## Tests and checks

```bash
npx ng test --watch=false    # unit tests (Vitest + jsdom)
npx ng build                 # production build → dist/frontend/browser
npm run e2e:smoke            # UI smoke test, see below
```

### E2E smoke test (`e2e/smoke.cjs`)

Drives the real UI with an installed Chrome/Edge through `playwright-core` (no browser download). It needs the API and
`ng serve` running with DEMO data seeded, and signs in about 15 times within a minute, so start the API with
`LOGIN_RATE_LIMIT_PER_MINUTE=100`.

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `http://localhost:4200` | where the app is served |
| `CHROME_PATH` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | browser executable |
| `SHOTS_DIR` | `e2e/screenshots` | screenshots (git-ignored) |
| `DEMO_USER_PASSWORD` | – | DEMO account password; if unset it is read from the backend `.env` |
| `BACKEND_ENV_FILE` | `../../carbon_platform_new/backend/.env` | backend `.env` to read `DEMO_USER_PASSWORD` from |

## Docker

```bash
docker build -f docker/Dockerfile -t carbon-frontend .
```

The image builds the app and serves it with nginx ([docker/nginx.conf](docker/nginx.conf)), proxying `/api/` to the
`backend:8000` service of the backend's `docker-compose.yml`. Run the whole stack from `carbon_platform_new`
(`docker compose up -d --build`); its `frontend` service points at this repository.

## Source layout (`src/app`)

| Folder | Responsibility |
|---|---|
| `core/` | `ApiService`, `ApiError`, auth service / guards / interceptors, permissions, navigation registry, notifications |
| `shared/` | Status badge, page header, state view, reason dialog, form helpers, `PagedList`, `geo-map` (Leaflet / MapLibre) |
| `layout/` | Shell: side navigation filtered by permissions, user menu, DEMO indicator |
| `auth/`, `dashboard/`, `admin/`, `farmer/`, `farms/`, `projects/`, `methodologies/`, `mrv/`, `lab/`, `calculation/`, `verification/`, `registry/`, `ledger/`, `marketplace/`, `finance/` | Feature pages; each feature owns its models and API service |
| `testing/` | Test helpers |

Conventions: every component is standalone and `OnPush`; state is held in signals; business rules stay on the server,
the client only mirrors them (state machines, password policy) for instant feedback. Formatting follows the
`prettier` block in `package.json` (100 columns, single quotes). The browser only draws and previews map shapes;
validation and area are always computed by the API.

The full architecture and every workflow are documented in the backend repository (`docs/architecture.md`,
`docs/*-workflow.md`, `docs/e2e-test-guide.md`).

## History

Until 2026-10-09 this app lived in `carbon_platform_new/frontend`. It was extracted with `git subtree split`, so the
complete commit history of the frontend is in this repository. The last combined snapshot is kept on the backend
repository's `carbon_frontend_backend_bkp` branch.
