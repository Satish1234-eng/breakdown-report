# Breakdown Report System

A responsive web app for logging and searching equipment breakdown problems.
Runs 24/7 on Railway with a free PostgreSQL cloud database.

---

## Deploy to Railway (Free — PC can be OFF)

### Step 1 — Push code to GitHub
1. Go to https://github.com and create a new repository (e.g. `breakdown-report`)
2. Install Git if you don't have it: https://git-scm.com/download/win
3. Open a terminal in this project folder and run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/breakdown-report.git
   git push -u origin main
   ```

### Step 2 — Create Railway account
1. Go to https://railway.app
2. Sign up with your GitHub account (free)

### Step 3 — Deploy the app
1. Click **"New Project"**
2. Choose **"Deploy from GitHub repo"**
3. Select your `breakdown-report` repository
4. Railway will auto-detect Node.js and deploy it

### Step 4 — Add PostgreSQL database
1. Inside your Railway project, click **"New"** → **"Database"** → **"PostgreSQL"**
2. Railway automatically sets the `DATABASE_URL` environment variable — nothing else needed
3. Your app will restart and connect to the database automatically

### Step 5 — Get your public URL
1. Click your web service → **"Settings"** → **"Domains"**
2. Click **"Generate Domain"**
3. You'll get a URL like `https://breakdown-report-production.up.railway.app`
4. Share that URL with anyone — accessible from anywhere in the world!

---

## Local Development

### Prerequisites
- Node.js 18+
- A PostgreSQL database (local or cloud)

### Setup
```bash
npm install
```

Create a `.env` file:
```
DATABASE_URL=postgresql://user:password@localhost:5432/breakdown_db
```

Then run:
```bash
npm start
```

Open http://localhost:3000

---

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (cloud-hosted on Railway)
- **Frontend:** HTML + Tailwind CSS + Vanilla JS
- **Hosting:** Railway (free tier)
