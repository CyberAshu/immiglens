# ImmigLens

ImmigLens is a web application that helps immigration professionals monitor job postings for Labour Market Impact Assessment (LMIA) compliance. It automates the capture of job posting screenshots, detects changes over time, generates PDF reports, and manages employers, positions, and organizations — all backed by a subscription-based access model.

---

## Features

- **Employer & Position Management** — organize employers, job positions, and posting URLs
- **Automated Screenshots** — scheduled headless browser captures of job posting pages via Playwright
- **Change Detection** — diff-based detection of content changes between capture rounds
- **PDF Reports** — generate and store compliance reports for each capture round
- **Organizations & Invitations** — multi-tenant org support with user invitations
- **Subscriptions & Tiers** — Free / Pro / Enterprise tiers with configurable limits
- **Audit Logs** — full action history for admin oversight
- **Notifications** — in-app notification system
- **Admin Dashboard** — user management, org overview, subscription controls

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Recharts |
| Backend | FastAPI, SQLAlchemy 2 (async), asyncpg |
| Database | PostgreSQL via Supabase (PgBouncer pool) |
| Storage | Supabase Storage (screenshots, documents, reports) |
| Browser Automation | Playwright (Chromium headless) |
| Scheduling | APScheduler |
| Email | SendGrid SMTP |
| Auth | JWT (python-jose + bcrypt) |
| Web Server | Nginx (reverse proxy + static files) |
| Hosting | AWS EC2 (Ubuntu 24.04, t3.small) |
| CI/CD | GitHub Actions |

---

## Project Structure

```
immiglens/
├── .github/
│   └── workflows/
│       └── deploy.yml        # CI/CD — auto deploy to EC2 on push to main
├── immiglensBE/              # FastAPI backend
│   ├── app/
│   │   ├── core/             # Config, DB, security, permissions, audit
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── routers/          # API route handlers
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # Browser, scheduler, storage, PDF, notifications
│   │   └── main.py           # FastAPI app entry point
│   ├── requirements.txt
│   └── .env                  # Environment variables (not committed)
└── immiglensFE/              # React frontend
    ├── src/
    │   ├── api/              # API client functions
    │   ├── components/       # Shared UI components
    │   ├── context/          # Auth context
    │   ├── pages/            # Page components
    │   └── types/            # TypeScript type definitions
    ├── .env                  # Local dev env
    ├── .env.production       # Production env
    └── vite.config.ts
```

---

## Local Development

### Prerequisites
- Python 3.12+
- Node.js 20+
- A Supabase project (PostgreSQL + Storage buckets)

### Backend

```bash
cd immiglensBE
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
playwright install chromium --with-deps
```

Create `immiglensBE/.env`:
```env
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:6543/postgres
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key from Supabase dashboard>
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.<your-sendgrid-api-key>
SMTP_FROM=<your-verified-sender@email.com>
```

Start the backend:
```bash
uvicorn app.main:app --reload
```
API runs at `http://localhost:8000` — docs at `http://localhost:8000/docs`

### Frontend

```bash
cd immiglensFE
npm install
npm run dev
```
App runs at `http://localhost:5173` (Vite proxies `/api` to `localhost:8000`)

---

## Supabase Setup

1. Create a Supabase project
2. Run the backend once to auto-create tables (`Base.metadata.create_all`)
3. Create 3 **public** storage buckets: `screenshots`, `documents`, `reports`
4. Copy the **connection string** (port 6543, transaction pooler) and **service_role** key into `.env`

---

## Production Deployment (AWS EC2)

The app is hosted on a single EC2 instance:
- **Nginx** serves the React `dist/` on port 80 and proxies `/api/` to FastAPI
- **FastAPI** runs on `127.0.0.1:8000` managed by systemd
- **GitHub Actions** builds the frontend and deploys on every push to `main`

### Required GitHub Secrets

| Secret | Value |
|---|---|
| `EC2_HOST` | EC2 public IP |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contents of the `.pem` private key file |

### HTTPS (optional)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async connection string |
| `SECRET_KEY` | JWT signing secret (32-byte hex) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role API key |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (default: 587) |
| `SMTP_USER` | SMTP username (`apikey` for SendGrid) |
| `SMTP_PASSWORD` | SMTP password / API key |
| `SMTP_FROM` | Verified sender email address |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (default: localhost) |
