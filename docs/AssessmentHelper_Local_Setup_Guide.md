# Assessment Helper — Local Development Setup Guide

This guide explains how to run **Assessment Helper** on a Windows computer using **Docker Desktop**, **PostgreSQL**, **FastAPI**, and **React/Vite**.

> **What runs where?** Docker Compose starts the PostgreSQL database, runs the CourseBook data importer, and starts the FastAPI backend. The React frontend is started separately with npm. The frontend is **not** included in the current `docker-compose.yml`.

## 1. Prerequisites

Install the following before starting:

- **Git** — to clone or update the repository.
- **Docker Desktop** — to run the database, importer, and backend. Start Docker Desktop and wait until its engine is running. On Windows, Docker Desktop may require WSL 2.
- **Node.js and npm** — to install and run the React frontend. Use a Node.js version compatible with the project's Vite version (Vite 8); check the project's current requirements if you encounter a version error.
- **VS Code** (recommended) — for editing configuration and opening terminals.

Verify the command-line tools in PowerShell:

```powershell
git --version
docker --version
docker compose version
node --version
npm --version
```

## 2. Open the Project

Clone the repository if needed, or pull the latest changes in an existing clone. Open the **repository root** in VS Code — the directory containing `docker-compose.yml`.

Expected structure:

```text
AssessmentHelperCapstone/
├── backend/
├── Databasing/
├── docs/
├── frontend/
├── NebulaLabsIntegration/
├── .env.example
├── docker-compose.yml
└── README.md
```

> Run Docker Compose commands from the **repository root**, not from `frontend/`.

## 3. Configure Environment Variables

Docker Compose reads values from a local `.env` file. The repository includes `.env.example` as a starting point.

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
```

If `.env` already exists, **do not overwrite it**; just open it for editing.

Ensure the file defines the required variables:

```dotenv
# Local PostgreSQL credentials — example values only
POSTGRES_USER=assessment_user
POSTGRES_PASSWORD=replace_with_your_local_password
POSTGRES_DB=assessment_helper

# Obtain valid development values from the team
NEBULALABS_API_KEY=replace_with_team_development_key
ANONYMIZATION_KEY=replace_with_team_development_key

# Optional importer settings (defaults in Compose: 26F and CS)
COURSEBOOK_TERM=26F
COURSEBOOK_PREFIX=CS
```

**Important:** These are placeholders, not production credentials. Get the appropriate CourseBook/API and anonymization values from the team. The importer may fail without them, and the backend is configured to wait for the importer to finish successfully.

- Do **not** commit `.env` to Git or share passwords/API keys in chat or screenshots.
- Keep `.env.example` free of real secrets.
- You can inspect resolved variables with `docker compose config --environment`, but **do not share its output** because it may reveal secrets.

## 4. Start the Database, Importer, and Backend

Make sure Docker Desktop is running. From the **repository root**, execute:

```powershell
docker compose up --build -d
```

On the first run, Docker may take a few minutes to download images and install Python dependencies.

Check the services:

```powershell
docker compose ps -a
```

Expected results:

| Service | Expected status | Notes |
| --- | --- | --- |
| `db` / `ah_db` | `Up (healthy)` | PostgreSQL, exposed on port **5432** |
| `coursebook` | `Exited (0)` | One-time startup import completed successfully |
| `backend` / `ah_backend` | `Up` | FastAPI, exposed on port **8000** |

`Exited (0)` for **coursebook** is **normal**: it is a job, not a continuously running server.

The backend will not start if the importer fails, because `docker-compose.yml` uses:

```yaml
depends_on:
  coursebook:
    condition: service_completed_successfully
```

### Confirm the backend

Open **http://localhost:8000/docs** in your browser. If FastAPI's documentation is enabled, the Swagger UI should appear.

If it does not load, inspect the backend logs:

```powershell
docker compose logs backend --tail=100
```

## 5. Start the React Frontend

Open a **second terminal** in VS Code. From the repository root:

```powershell
cd frontend
npm install
npm run dev
```

The current frontend uses **React, TypeScript, and Vite**. Vite should display a local address similar to:

```text
VITE v8.x.x ready
Local: http://localhost:5173/
```

Open **http://localhost:5173/**, or whichever URL Vite prints. **5173** is the observed frontend port; **5577** is not the port used in the tested local setup.

Keep this terminal open while using the frontend. Pressing `Ctrl+C` stops the Vite development server.

> **Security note:** `npm install` may report dependency vulnerabilities. Review them with `npm audit` and coordinate fixes with the team. Avoid running `npm audit fix --force` just to get the application started: it may introduce breaking dependency upgrades.

## 6. Verify the Application

Once the page opens, check the following:

1. **Frontend:** The Assessment Helper login page or dashboard renders.
2. **Navigation:** Pages and dashboards can be opened.
3. **Backend connectivity:** Features that fetch or save data work, rather than only showing mock data.
4. **Database data:** Relevant faculty, course, or evaluation records appear where expected.

A page loading successfully confirms that the frontend server is running; it does **not** by itself prove that every API integration or application feature is working.

### Local service addresses

| Component | Address |
| --- | --- |
| React frontend | http://localhost:5173/ |
| FastAPI API docs | http://localhost:8000/docs |
| FastAPI backend | http://localhost:8000/ |
| PostgreSQL | localhost:5432 (database connection, **not** a webpage) |

## 7. Stopping the Application

**Stop the frontend:** In the terminal running `npm run dev`, press `Ctrl+C`.

**Stop Docker services:** In a terminal at the repository root:

```powershell
docker compose down
```

This stops and removes the project's containers and network, but **keeps the named PostgreSQL volume**.

> **Do not casually run `docker compose down -v`.** The `-v` flag deletes named volumes, including the project's PostgreSQL data volume, and can erase local database data.

## 8. Starting It Again Later

After the initial installation, you normally do **not** need to reinstall npm packages or rebuild Docker images every time.

**Terminal 1 — repository root:**

```powershell
docker compose up -d
```

**Terminal 2 — repository root:**

```powershell
cd frontend
npm run dev
```

Open **http://localhost:5173/**.

Rebuild when relevant Dockerfiles or container dependencies change:

```powershell
docker compose up --build -d
```

## 9. Troubleshooting

### A. `The "POSTGRES_USER" variable is not set` (or similar warnings)

**Cause:** Docker Compose cannot find the required values in `.env` or the environment.

**Fix:** Confirm that `.env` exists in the **same directory as `docker-compose.yml`**, contains the required values, and is saved. Then retry:

```powershell
docker compose up -d
```

For a first-time database initialization, PostgreSQL generally needs a nonempty password.

### B. `ah_db` exits with code 1

Inspect database logs:

```powershell
docker compose logs db --tail=100
```

Check PostgreSQL credentials and initialization SQL errors. Do not delete the database volume before reading the logs.

### C. CourseBook exits with code 2: `/app/on-start.sh: 5: set: Illegal option -`

This happened during the tested Windows setup. The issue was resolved by changing the script's line endings to **LF** and saving the file.

In VS Code:

1. Open `NebulaLabsIntegration/on-start.sh`.
2. Click **CRLF** in the bottom-right status bar (if shown).
3. Select **LF**.
4. **Save** the file (`Ctrl+S`) — this step matters!
5. Rebuild and restart:

```powershell
docker compose up --build -d
```

If it still fails, inspect the actual script contents. Some Bash-specific options, such as `set -o pipefail`, are not supported by the `/bin/sh` interpreter used in the current Compose command.

### D. CourseBook exits with a nonzero code for another reason

Check its logs:

```powershell
docker compose logs coursebook --tail=100
```

Possible causes include missing or invalid API credentials, an importer exception, or a database issue. Since the backend depends on successful importer completion, fix the importer first.

### E. Backend shows `Created` but not `Up`

Check all statuses:

```powershell
docker compose ps -a
```

If CourseBook did not exit with code `0`, the backend is waiting on its dependency. Review the CourseBook logs before trying to debug FastAPI itself.

### F. React starts but the page cannot fetch data

Confirm that the backend is running and `http://localhost:8000/docs` loads. Then inspect the browser developer tools (Console and Network tabs) for failed requests. The frontend may need an API base URL or Vite proxy configuration; check `frontend/vite.config.ts` and the frontend's environment configuration.

### G. Port 5432, 8000, or 5173 is already in use

Another program may be using that port. Check for an existing PostgreSQL service, another Docker stack, or another Vite server. Resolve the conflict or coordinate a port change with the team. If you change a port, update any frontend API configuration that depends on it.

### H. Changes to SQL files do not appear in PostgreSQL

The files mounted under `/docker-entrypoint-initdb.d/` run **only when PostgreSQL initializes a new data directory**. Restarting the container does not rerun them against an existing database volume.

For schema changes, use an intentional migration or apply SQL to the existing development database. Do not erase the volume as a routine troubleshooting step.

## 10. Useful Commands Cheat Sheet

Run these from the repository root unless otherwise noted.

```powershell
# Start Docker services
docker compose up -d

# Rebuild images and start
docker compose up --build -d

# Show running and stopped services
docker compose ps -a

# Inspect logs
docker compose logs db --tail=100
docker compose logs coursebook --tail=100
docker compose logs backend --tail=100

# Restart services
docker compose restart

# Stop Docker services without deleting the database volume
docker compose down

# Start frontend (from repository root)
cd frontend
npm run dev
```

---

**Tested workflow:** Windows PowerShell + Docker Desktop + PostgreSQL 16 + FastAPI + React/Vite 8. The Docker services and Vite development server were successfully started using the commands above. Exact API behavior and complete end-to-end feature coverage should still be verified by each developer.
