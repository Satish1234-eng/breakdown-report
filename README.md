# Breakdown Report System (Supabase edition)

Log and track equipment breakdown problems. Data is stored in Supabase Postgres
(`reports`, `sites` tables) and file attachments in Supabase Storage — nothing
is stored on the app server's local disk, so data survives redeploys and
restarts on platforms like Render.

## Project structure

```
breakdown-report-system/
├── server.js          # Express backend, talks to Supabase (Postgres + Storage)
├── package.json
├── .gitignore
└── public/
    ├── index.html
    ├── app.js
    └── style.css
```

## Required environment variables

Set these in Render → your service → **Environment** (never commit them to git):

| Variable | Value |
|---|---|
| `SUPABASE_URL` | e.g. `https://<your-project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key |
| `SUPABASE_ATTACHMENT_BUCKET` | Name of your Storage bucket (default: `attachments`) |

The `service_role` key has full database access — it must only ever live in
Render's environment variables, never in code or in git.

## Database schema (already exists in your Supabase project)

```sql
create table sites (
  id   serial primary key,
  name text unique not null
);

create table reports (
  id             serial primary key,
  reported_by    text not null,
  site_id        integer references sites(id),
  agency         text not null,
  area_name      text,
  device_name    text,
  problem_desc   text not null,
  root_cause     text not null,
  created_at     timestamptz not null default now(),
  attachment_url  text,
  attachment_name text
);
```

## Storage bucket

Create a bucket (Supabase Dashboard → Storage → New bucket) matching
`SUPABASE_ATTACHMENT_BUCKET` (default `attachments`), and mark it **Public**
so uploaded files are viewable via their returned URL.

## Local development

```bash
npm install
SUPABASE_URL=https://your-ref.supabase.co SUPABASE_SERVICE_ROLE_KEY=your-key npm start
```

Or create a local `.env` file (already gitignored) and use a tool like
`dotenv` / `dotenv-cli` if you prefer not to pass env vars inline.

## Deploying to Render

1. Push this repo to GitHub.
2. In Render, create/update the Web Service pointing at this repo.
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Set the three environment variables above in Render's dashboard.
4. Deploy. Because all data lives in Supabase, redeploys and restarts no
   longer wipe your reports or attachments.
