# SmartLedgr Backend — Setup & Deployment Guide

## Project Structure

```
smartledgr-backend/
├── src/
│   ├── server.js              ← Express entry point
│   ├── db/index.js            ← PostgreSQL connection pool
│   ├── middleware/auth.js     ← JWT auth + company access guard
│   └── routes/
│       ├── auth.js            ← POST /login, GET /me
│       ├── contacts.js        ← Customers & Suppliers CRUD
│       ├── invoices.js        ← Sales & Purchase invoices CRUD
│       ├── master.js          ← Accounts, Taxes, Banks, Company
│       ├── cashbook.js        ← Cash book entries
│       ├── journals.js        ← Journal entries
│       ├── reconciliation.js  ← Bank reconciliation
│       └── currency.js        ← XE.com rate proxy
├── scripts/
│   ├── schema.sql             ← Full PostgreSQL schema
│   └── seed.js                ← Demo data seeder
├── .env.example               ← Environment variable template
└── package.json
```

---

## PART 1 — Run Locally

### Prerequisites
- Node.js 18+  →  https://nodejs.org
- PostgreSQL 14+  →  https://www.postgresql.org/download
- Git  →  https://git-scm.com

### Step 1 — Install dependencies
```bash
cd smartledgr-backend
npm install
```

### Step 2 — Create PostgreSQL database
```bash
# Open psql as postgres superuser
psql -U postgres

# Inside psql:
CREATE DATABASE smartledgr;
\q
```

### Step 3 — Configure environment
```bash
cp .env.example .env
```
Open `.env` and set:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smartledgr
DB_USER=postgres
DB_PASSWORD=your_postgres_password
JWT_SECRET=any_long_random_string_here
PORT=5000
CLIENT_URL=http://localhost:3000
```

### Step 4 — Run schema + seed demo data
```bash
npm run db:seed
```
This creates all tables and seeds:
- 2 companies (TechSlide + Global Ventures)
- 2 users: `user2@smartledgr.com` / `demo123` (Admin)
- Chart of accounts, taxes, bank accounts, invoices, contacts

### Step 5 — Start the server
```bash
npm run dev        # development (auto-restart)
npm start          # production
```

### Step 6 — Test the API
```bash
# Health check
curl http://localhost:5000/health

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user2@smartledgr.com","password":"demo123"}'

# Copy the token from response, then:
TOKEN="paste_token_here"
COMPANY_ID="paste_company_id_here"

# Get contacts
curl http://localhost:5000/api/companies/$COMPANY_ID/contacts \
  -H "Authorization: Bearer $TOKEN"

# Get invoices
curl http://localhost:5000/api/companies/$COMPANY_ID/invoices?type=sales \
  -H "Authorization: Bearer $TOKEN"
```

---

## PART 2 — Deploy to Railway (Free, Easiest)

Railway gives you a free PostgreSQL database + Node.js hosting.

### Step 1 — Push to GitHub
```bash
cd smartledgr-backend
git init
git add .
git commit -m "Initial SmartLedgr backend"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/smartledgr-backend.git
git push -u origin main
```

### Step 2 — Deploy on Railway
1. Go to https://railway.app → Sign up (free, no credit card needed)
2. Click **New Project → Deploy from GitHub repo**
3. Select your `smartledgr-backend` repo
4. Click **Add Plugin → PostgreSQL** — Railway auto-creates the DB

### Step 3 — Set environment variables in Railway
In Railway dashboard → your service → **Variables** tab, add:
```
NODE_ENV=production
JWT_SECRET=generate_a_long_random_string_here
CLIENT_URL=https://your-frontend-url.com
PORT=5000
```
Railway automatically injects `DATABASE_URL` from the Postgres plugin.

> **Important:** Update `src/db/index.js` to also accept `DATABASE_URL`:

```js
// Add at top of src/db/index.js, before the Pool config:
const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  : new Pool({ host, port, database, user, password });
```

### Step 4 — Run seed on Railway
In Railway dashboard → your service → **Shell** tab:
```bash
node scripts/seed.js
```

### Step 5 — Get your API URL
Railway gives you a URL like: `https://smartledgr-backend-production.up.railway.app`
Your API is live at that URL!

---

## PART 3 — Alternative: Deploy to Render (Also Free)

1. Go to https://render.com → New → **Web Service**
2. Connect GitHub repo
3. Set:
   - Build command: `npm install`
   - Start command: `npm start`
4. Add **PostgreSQL** database (free tier)
5. Add environment variables (same as Railway)
6. Deploy!

---

## PART 4 — Host the Frontend

### Option A — Netlify (Free, Instant)
1. Go to https://netlify.com
2. Drag & drop your `SmartLedgr.jsx` built folder
   - OR connect GitHub and deploy automatically

For the React app (SmartLedgr.jsx), first build it:
```bash
# Install Vite or Create React App
npm create vite@latest smartledgr-frontend -- --template react
cd smartledgr-frontend
# Copy SmartLedgr.jsx content into src/App.jsx
npm run build
# Deploy the /dist folder to Netlify
```

### Option B — Vercel (Free, One command)
```bash
npm i -g vercel
cd smartledgr-frontend
vercel
```

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login → returns JWT token |
| GET  | `/api/auth/me`    | Get current user + companies |

### Per-Company Routes (all need `Authorization: Bearer TOKEN`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/companies/:id/contacts` | List / create contacts |
| GET/PUT/DELETE | `/api/companies/:id/contacts/:cid` | Get / update / delete |
| GET/POST | `/api/companies/:id/invoices` | List / create invoices |
| GET/PUT/DELETE | `/api/companies/:id/invoices/:iid` | Get / update / delete |
| PATCH | `/api/companies/:id/invoices/:iid/status` | Change invoice status |
| GET/POST | `/api/companies/:id/cashbooks` | Cash books |
| GET/POST | `/api/companies/:id/journals` | Journal entries |
| PATCH | `/api/companies/:id/journals/:jid/publish` | Publish journal |
| GET/POST | `/api/companies/:id/reconciliations` | Reconciliations |
| PATCH | `/api/companies/:id/reconciliations/:rid/items/:itid` | Toggle reconcile |
| PATCH | `/api/companies/:id/reconciliations/:rid/finalize` | Finalize |
| GET/POST | `/api/companies/:id/accounts` | Chart of accounts |
| GET/POST | `/api/companies/:id/taxes` | Tax rates |
| GET/POST | `/api/companies/:id/banks` | Bank accounts |
| GET/PUT | `/api/companies/:id/company` | Company profile |
| GET | `/api/currency/rate?from=USD&to=INR` | Exchange rate |

---

## Connecting Frontend to Backend

In your `SmartLedgr.jsx`, replace the mock data calls with real API calls.
Example login:

```js
const API = "https://your-railway-url.up.railway.app/api";

const login = async (email, password) => {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  localStorage.setItem("token", data.token);
  return data;
};

const apiFetch = (path, opts={}) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}`,
               "Content-Type": "application/json", ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(r => r.json());

// Usage:
const invoices = await apiFetch(`/companies/${companyId}/invoices?type=sales`);
const newInv   = await apiFetch(`/companies/${companyId}/invoices`, { method:"POST", body: invoiceData });
```

---

## Tech Stack Summary
- **Runtime:** Node.js 22
- **Framework:** Express 4
- **Database:** PostgreSQL 14+
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **ORM:** Raw SQL via `pg` pool (no ORM overhead)
- **Hosting:** Railway / Render (backend) + Netlify / Vercel (frontend)
