/* ══════════════════════════════════════════════════════════
   Breakdown Report System — Backend Server
   Express + better-sqlite3 + Multer (multi-file uploads)
   ══════════════════════════════════════════════════════════ */

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];
const MAX_FILES_PER_REPORT = 10;
const MAX_FILE_SIZE_MB = 20;

// Ensure required folders exist
[UPLOAD_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Database setup ────────────────────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, 'breakdown.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    reported_by   TEXT NOT NULL,
    site_id       INTEGER NOT NULL REFERENCES sites(id),
    agency        TEXT NOT NULL,
    area_name     TEXT,
    device_name   TEXT,
    problem_desc  TEXT NOT NULL,
    root_cause    TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id     INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    url           TEXT NOT NULL
  );
`);

// ── Multer (multi-file) config ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  }
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  if (!ALLOWED_EXT.includes(ext)) {
    return cb(new Error('INVALID_FILE_TYPE'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: MAX_FILES_PER_REPORT
  }
});

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(ROOT, 'public')));

// ── Sites ─────────────────────────────────────────────────────────────────────
app.get('/api/sites', (req, res) => {
  const sites = db.prepare('SELECT id, name FROM sites ORDER BY name').all();
  res.json(sites);
});

app.post('/api/sites', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Site name is required.' });
  }
  try {
    const info = db.prepare('INSERT INTO sites (name) VALUES (?)').run(name);
    const site = db.prepare('SELECT id, name FROM sites WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(site);
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return res.status(409).json({ error: 'A site with that name already exists.' });
    }
    console.error(e);
    res.status(500).json({ error: 'Failed to save site.' });
  }
});

// ── Reports: create (multi-file) ─────────────────────────────────────────────
app.post('/api/reports', (req, res) => {
  upload.array('attachments', MAX_FILES_PER_REPORT)(req, res, (err) => {
    if (err) {
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: 'One or more files have an invalid type (image, PDF, Word or Excel only).' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `Each file must be under ${MAX_FILE_SIZE_MB} MB.` });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: `You can attach up to ${MAX_FILES_PER_REPORT} files.` });
      }
      console.error(err);
      return res.status(400).json({ error: 'Upload failed.' });
    }

    const { reported_by, site_id, agency, area_name, device_name, problem_desc, root_cause } = req.body;

    if (!reported_by || !site_id || !agency || !problem_desc || !root_cause) {
      // Clean up any files already written to disk since the report is invalid
      (req.files || []).forEach(f => fs.unlink(f.path, () => {}));
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const site = db.prepare('SELECT id FROM sites WHERE id = ?').get(site_id);
    if (!site) {
      (req.files || []).forEach(f => fs.unlink(f.path, () => {}));
      return res.status(400).json({ error: 'Invalid site selected.' });
    }

    const insertReport = db.prepare(`
      INSERT INTO reports (reported_by, site_id, agency, area_name, device_name, problem_desc, root_cause)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insertReport.run(
      reported_by.trim(), site_id, agency,
      (area_name || '').trim(), (device_name || '').trim(),
      problem_desc.trim(), root_cause.trim()
    );
    const reportId = info.lastInsertRowid;

    const insertAttachment = db.prepare(`
      INSERT INTO attachments (report_id, filename, original_name, url)
      VALUES (?, ?, ?, ?)
    `);
    (req.files || []).forEach(f => {
      insertAttachment.run(reportId, f.filename, f.originalname, `/uploads/${f.filename}`);
    });

    res.status(201).json({ id: reportId });
  });
});

// ── Reports: list / search ───────────────────────────────────────────────────
function attachReportAttachments(reports) {
  const attStmt = db.prepare('SELECT id, original_name, url FROM attachments WHERE report_id = ?');
  return reports.map(r => ({
    ...r,
    attachments: attStmt.all(r.id)
  }));
}

app.get('/api/reports/search', (req, res) => {
  const reports = db.prepare(`
    SELECT reports.*, sites.name AS site_name
    FROM reports
    JOIN sites ON sites.id = reports.site_id
    ORDER BY reports.created_at DESC
  `).all();

  res.json(attachReportAttachments(reports));
});

app.get('/api/reports/:id', (req, res) => {
  const report = db.prepare(`
    SELECT reports.*, sites.name AS site_name
    FROM reports
    JOIN sites ON sites.id = reports.site_id
    WHERE reports.id = ?
  `).get(req.params.id);

  if (!report) return res.status(404).json({ error: 'Report not found.' });

  const attachments = db.prepare('SELECT id, original_name, url FROM attachments WHERE report_id = ?').all(report.id);
  res.json({ ...report, attachments });
});

// ── Fallback to index.html for the SPA ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Breakdown Report System running at http://localhost:${PORT}`);
});
