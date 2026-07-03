# Breakdown Report System

Log and track equipment breakdown problems, with multi-file attachments and full-text search across every field.

## What was fixed

1. **Could only attach one file** — the file input lacked `multiple`, and the JS only ever read `files[0]`. Now the input accepts up to 10 files per report, all are previewed before submit, and all are uploaded together.
2. **Attachments not visible when viewing a search result** — the original frontend expected a backend that was never provided, so `attachment_url` was always `undefined`. This package includes a complete Express + SQLite backend that stores uploaded files on disk, saves them in an `attachments` table linked to each report, and returns them as a proper `attachments: [...]` array to both the search list and the detail view. The detail modal now lists every attachment as a clickable link.

## Project structure

```
breakdown-report-system/
├── server.js          # Express backend + SQLite + Multer (multi-file uploads)
├── package.json
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── uploads/            # uploaded files are stored here (created automatically)
└── data/                # breakdown.db (SQLite) lives here (created automatically)
```

## Setup

Requires Node.js 18+.

```bash
cd breakdown-report-system
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

By default the server runs on port 3000. To use a different port:

```bash
PORT=4000 npm start
```

## How it works

- **Sites**: `GET /api/sites`, `POST /api/sites` — stored in the `sites` table, populated into the dropdown, with "+ Add New" opening a modal to create one on the fly.
- **Submitting a report**: `POST /api/reports` accepts `multipart/form-data` with the report fields plus zero or more files under the `attachments` field. Files are validated by extension (`jpg, jpeg, png, gif, webp, pdf, doc, docx, xls, xlsx`), limited to 20 MB each and 10 files per report, and saved to `uploads/` with a unique filename. Each file gets a row in the `attachments` table linked to the report.
- **Searching**: `GET /api/reports/search` returns every report (joined with site name and its attachments) in one call; the frontend filters client-side across reporter, site, agency, area, device, problem description, and root cause as you type.
- **Viewing a report**: `GET /api/reports/:id` returns the full report plus its attachment list, which the detail modal renders as clickable download/view links (served statically from `/uploads/...`).

## Notes / things to configure before production use

- The SQLite database and uploaded files are stored on local disk (`data/` and `uploads/`) — back these up if you redeploy.
- There's currently no authentication — anyone who can reach the server can submit reports and view/download attachments. Add an auth layer (e.g. a login gate or reverse-proxy auth) before exposing this outside a trusted network.
- File size/type limits are configurable at the top of `server.js` (`ALLOWED_EXT`, `MAX_FILES_PER_REPORT`, `MAX_FILE_SIZE_MB`).
