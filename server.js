const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Database connection ───────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sites (
      id   SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id              SERIAL PRIMARY KEY,
      reported_by     TEXT        NOT NULL,
      site_id         INTEGER     NOT NULL REFERENCES sites(id),
      agency          TEXT        NOT NULL CHECK (agency IN ('Electrical','Mechanical')),
      area_name       TEXT        NOT NULL DEFAULT '',
      device_name     TEXT        NOT NULL DEFAULT '',
      problem_desc    TEXT        NOT NULL,
      root_cause      TEXT        NOT NULL,
      attachment_url  TEXT,
      attachment_name TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // In case the table already existed from before this update, add the
  // new columns if they're missing (safe to run every startup).
  await pool.query(`
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS attachment_url TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS attachment_name TEXT;
  `);

  console.log('✅  Database tables ready.');
}

// ── File upload setup (multer) ────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeExt  = path.extname(file.originalname).toLowerCase();
    const uniqueId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueId}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return cb(new Error('Unsupported file type.'));
    }
    cb(null, true);
  }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR)); // serve uploaded files

// ── Sites ─────────────────────────────────────────────────────────────────────
app.get('/api/sites', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name FROM sites ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.post('/api/sites', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Site name is required.' });

  try {
    const dup = await pool.query(
      'SELECT id FROM sites WHERE LOWER(name) = LOWER($1)',
      [name]
    );
    if (dup.rows.length) {
      return res.status(409).json({ error: `Site "${name}" already exists.` });
    }

    const { rows } = await pool.query(
      'INSERT INTO sites (name) VALUES ($1) RETURNING id, name',
      [name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// ── Reports ───────────────────────────────────────────────────────────────────
// NOTE: now uses multer's `upload.single('attachment')` so it accepts
// multipart/form-data (the file, if any, plus the regular text fields).
app.post('/api/reports', upload.single('attachment'), async (req, res) => {
  const {
    reported_by, site_id, agency,
    area_name, device_name, problem_desc, root_cause
  } = req.body;

  if (!reported_by || !site_id || !agency || !problem_desc || !root_cause) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (!['Electrical', 'Mechanical'].includes(agency)) {
    return res.status(400).json({ error: 'Invalid agency value.' });
  }

  const attachment_url  = req.file ? `/uploads/${req.file.filename}` : null;
  const attachment_name = req.file ? req.file.originalname : null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO reports
         (reported_by, site_id, agency, area_name, device_name, problem_desc, root_cause, attachment_url, attachment_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        reported_by.trim(),
        Number(site_id),
        agency,
        (area_name   || '').trim(),
        (device_name || '').trim(),
        problem_desc.trim(),
        root_cause.trim(),
        attachment_url,
        attachment_name
      ]
    );
    res.status(201).json({ id: rows[0].id, message: 'Report submitted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// GET search — now also matches reported_by, site name, agency, area, device, and root cause
app.get('/api/reports/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    let result;
    if (!q) {
      result = await pool.query(`
        SELECT r.*, s.name AS site_name
        FROM reports r JOIN sites s ON s.id = r.site_id
        ORDER BY r.created_at DESC
      `);
    } else {
      result = await pool.query(`
        SELECT r.*, s.name AS site_name
        FROM reports r JOIN sites s ON s.id = r.site_id
        WHERE r.reported_by  ILIKE $1
           OR s.name         ILIKE $1
           OR r.agency       ILIKE $1
           OR r.area_name    ILIKE $1
           OR r.device_name  ILIKE $1
           OR r.problem_desc ILIKE $1
           OR r.root_cause   ILIKE $1
        ORDER BY r.created_at DESC
      `, [`%${q}%`]);
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// GET single report
app.get('/api/reports/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, s.name AS site_name
      FROM reports r JOIN sites s ON s.id = r.site_id
      WHERE r.id = $1
    `, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Report not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// ── Multer error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Unsupported file type.') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ── Catch-all ─────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀  Breakdown Report App → http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialise database:', err.message);
    process.exit(1);
  });
