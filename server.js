/* ══════════════════════════════════════════════════════════
   Breakdown Report System — Backend Server (Supabase edition)
   Express + Supabase (Postgres + Storage) + Multer
   ══════════════════════════════════════════════════════════ */

const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ATTACHMENT_BUCKET = process.env.SUPABASE_ATTACHMENT_BUCKET || 'attachments';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  console.error('Set these in Render → your service → Environment, not in code.');
  process.exit(1);
}

// service_role key = full server-side access; NEVER expose this to the frontend
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];
const MAX_FILE_SIZE_MB = 20;

// ── Multer: hold the file in memory, then stream it to Supabase Storage ──────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (!ALLOWED_EXT.includes(ext)) return cb(new Error('INVALID_FILE_TYPE'));
    cb(null, true);
  }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Sites ─────────────────────────────────────────────────────────────────────
app.get('/api/sites', async (req, res) => {
  const { data, error } = await supabase.from('sites').select('id, name').order('name');
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load sites.' });
  }
  res.json(data);
});

app.post('/api/sites', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Site name is required.' });

  const { data, error } = await supabase.from('sites').insert({ name }).select().single();
  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A site with that name already exists.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Failed to save site.' });
  }
  res.status(201).json(data);
});

// ── Reports: create (single attachment, matching existing schema) ───────────
app.post('/api/reports', (req, res) => {
  upload.single('attachment')(req, res, async (err) => {
    if (err) {
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: 'Please attach a valid file type (image, PDF, Word or Excel).' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `File must be under ${MAX_FILE_SIZE_MB} MB.` });
      }
      console.error(err);
      return res.status(400).json({ error: 'Upload failed.' });
    }

    const { reported_by, site_id, agency, area_name, device_name, problem_desc, root_cause } = req.body;

    if (!reported_by || !site_id || !agency || !problem_desc || !root_cause) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    let attachment_url = null;
    let attachment_name = null;

    if (req.file) {
      const ext = path.extname(req.file.originalname);
      const storageKey = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(storageKey, req.file.buffer, { contentType: req.file.mimetype });

      if (uploadError) {
        console.error(uploadError);
        return res.status(500).json({ error: 'Attachment upload failed: ' + uploadError.message });
      }

      const { data: publicUrlData } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(storageKey);
      attachment_url = publicUrlData.publicUrl;
      attachment_name = req.file.originalname;
    }

    const { data, error } = await supabase
      .from('reports')
      .insert({
        reported_by: reported_by.trim(),
        site_id,
        agency,
        area_name: (area_name || '').trim(),
        device_name: (device_name || '').trim(),
        problem_desc: problem_desc.trim(),
        root_cause: root_cause.trim(),
        attachment_url,
        attachment_name
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to save report.' });
    }

    res.status(201).json({ id: data.id });
  });
});

// ── Reports: list / search ───────────────────────────────────────────────────
app.get('/api/reports/search', async (req, res) => {
  const { data, error } = await supabase
    .from('reports')
    .select('*, sites(name)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load reports.' });
  }

  const reports = data.map(r => ({
    ...r,
    site_name: r.sites ? r.sites.name : null,
    sites: undefined
  }));

  res.json(reports);
});

// ── Reports: single detail ───────────────────────────────────────────────────
app.get('/api/reports/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('reports')
    .select('*, sites(name)')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  res.json({ ...data, site_name: data.sites ? data.sites.name : null, sites: undefined });
});

// ── Fallback to index.html for the SPA ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Breakdown Report System (Supabase) running on port ${PORT}`);
});
