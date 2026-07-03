/* ══════════════════════════════════════════════════════════
   Breakdown Report System — Frontend JS
   ══════════════════════════════════════════════════════════ */

const API = ''; // same origin; change to e.g. 'http://server-ip:3000' if hosted separately

const ALLOWED_EXT = ['jpg','jpeg','png','gif','webp','pdf','doc','docx','xls','xlsx'];
const MAX_FILES = 10;

// ── Tab Switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('panel-report').classList.toggle('hidden', tab !== 'report');
  document.getElementById('panel-search').classList.toggle('hidden', tab !== 'search');
  document.getElementById('tab-report').classList.toggle('active-tab', tab === 'report');
  document.getElementById('tab-search').classList.toggle('active-tab', tab === 'search');

  if (tab === 'search') {
    doSearch(); // auto-load all records when switching to search tab
  }
}

// ── Sites ─────────────────────────────────────────────────────────────────────
let sites = [];

async function loadSites() {
  try {
    const res = await fetch(`${API}/api/sites`);
    sites = await res.json();
    populateSiteDropdown();
  } catch (e) {
    console.error('Failed to load sites', e);
  }
}

function populateSiteDropdown(selectedId) {
  const sel = document.getElementById('site_select');
  const current = selectedId || sel.value;
  sel.innerHTML = '<option value="">-- Select site --</option>';
  sites.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    if (String(s.id) === String(current)) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Site Modal ────────────────────────────────────────────────────────────────
function openSiteModal() {
  document.getElementById('new_site_name').value = '';
  document.getElementById('site-modal-err').textContent = '';
  document.getElementById('site-modal-err').classList.add('hidden');
  document.getElementById('site-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('new_site_name').focus(), 80);
}

function closeSiteModal() {
  document.getElementById('site-modal').classList.add('hidden');
}

async function saveSite() {
  const nameEl = document.getElementById('new_site_name');
  const errEl  = document.getElementById('site-modal-err');
  const name   = nameEl.value.trim();

  errEl.classList.add('hidden');

  if (!name) {
    errEl.textContent = 'Site name cannot be empty.';
    errEl.classList.remove('hidden');
    nameEl.focus();
    return;
  }

  try {
    const res  = await fetch(`${API}/api/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Failed to save site.';
      errEl.classList.remove('hidden');
      return;
    }

    // Add to local list & dropdown, then pre-select it
    sites.push(data);
    sites.sort((a, b) => a.name.localeCompare(b.name));
    populateSiteDropdown(data.id);
    closeSiteModal();
  } catch (e) {
    errEl.textContent = 'Network error. Please try again.';
    errEl.classList.remove('hidden');
  }
}

// ── Form Validation helpers ───────────────────────────────────────────────────
function setError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  const err = document.getElementById(`err-${fieldId}`);
  el.classList.add('input-error');
  if (err) {
    err.textContent = msg;
    err.classList.remove('hidden');
  }
}

function clearError(fieldId) {
  const el = document.getElementById(fieldId);
  const err = document.getElementById(`err-${fieldId}`);
  el.classList.remove('input-error');
  if (err) err.classList.add('hidden');
}

function clearAllErrors() {
  ['reported_by','site_select','agency','problem_desc','root_cause','attachment'].forEach(clearError);
}

// ── Attachment preview (multi-file) ───────────────────────────────────────────
let selectedFiles = [];

document.getElementById('attachment').addEventListener('change', () => {
  const fileInput = document.getElementById('attachment');
  const nameEl = document.getElementById('attachment-name');
  clearError('attachment');

  const newFiles = Array.from(fileInput.files);
  fileInput.value = ''; // reset so the same file can be re-picked if needed

  const invalid = newFiles.find(f => !ALLOWED_EXT.includes(f.name.split('.').pop().toLowerCase()));
  if (invalid) {
    setError('attachment', 'Please attach only valid file types (image, PDF, Word or Excel).');
    return;
  }

  selectedFiles = selectedFiles.concat(newFiles);

  if (selectedFiles.length > MAX_FILES) {
    setError('attachment', `You can attach up to ${MAX_FILES} files at once.`);
    selectedFiles = selectedFiles.slice(0, MAX_FILES);
  }

  renderFileList();
});

function renderFileList() {
  const nameEl = document.getElementById('attachment-name');
  if (selectedFiles.length === 0) {
    nameEl.innerHTML = '';
    nameEl.classList.add('hidden');
    return;
  }
  nameEl.innerHTML = selectedFiles
    .map((f, i) => `
      <div class="flex items-center justify-between">
        <span>📎 ${escHtml(f.name)} (${(f.size / 1024).toFixed(0)} KB)</span>
        <button type="button" onclick="removeFile(${i})" class="text-red-500 text-xs ml-2">Remove</button>
      </div>`)
    .join('');
  nameEl.classList.remove('hidden');
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
}

// ── Report Form Submit ────────────────────────────────────────────────────────
document.getElementById('reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAllErrors();
  hideBanner();

  const reported_by  = document.getElementById('reported_by').value.trim();
  const site_id      = document.getElementById('site_select').value;
  const agency       = document.getElementById('agency').value;
  const area_name    = document.getElementById('area_name').value.trim();
  const device_name  = document.getElementById('device_name').value.trim();
  const problem_desc = document.getElementById('problem_desc').value.trim();
  const root_cause   = document.getElementById('root_cause').value.trim();
  const fileInput    = document.getElementById('attachment');
  const files = selectedFiles;

  let valid = true;
  if (!reported_by)  { setError('reported_by',  'Please enter your name.');              valid = false; }
  if (!site_id)      { setError('site_select',   'Please select a site location.');       valid = false; }
  if (!agency)       { setError('agency',        'Please select an agency.');             valid = false; }
  if (!problem_desc) { setError('problem_desc',  'Please enter the problem description.'); valid = false; }
  if (!root_cause)   { setError('root_cause',    'Please enter the root cause / steps.'); valid = false; }

  if (files.length > MAX_FILES) {
    setError('attachment', `You can attach up to ${MAX_FILES} files at once.`);
    valid = false;
  } else if (files.length) {
    const invalid = files.find(f => !ALLOWED_EXT.includes(f.name.split('.').pop().toLowerCase()));
    if (invalid) {
      setError('attachment', 'Please attach only valid file types (image, PDF, Word or Excel).');
      valid = false;
    }
  }

  if (!valid) return;

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    // Use multipart/form-data so attachments (if any) travel with the report.
    const formData = new FormData();
    formData.append('reported_by', reported_by);
    formData.append('site_id', site_id);
    formData.append('agency', agency);
    formData.append('area_name', area_name);
    formData.append('device_name', device_name);
    formData.append('problem_desc', problem_desc);
    formData.append('root_cause', root_cause);
    files.forEach(f => formData.append('attachments', f)); // same field name, appended once per file

    const res  = await fetch(`${API}/api/reports`, {
      method: 'POST',
      // NOTE: do not set Content-Type manually — the browser sets the
      // correct multipart boundary automatically for FormData bodies.
      body: formData
    });
    const data = await res.json();

    if (!res.ok) {
      showBanner(data.error || 'Submission failed. Please try again.', 'error');
    } else {
      showBanner(`✅ Report #${data.id} submitted successfully!`, 'success');
      document.getElementById('reportForm').reset();
selectedFiles = [];
document.getElementById('attachment-name').classList.add('hidden');
document.getElementById('attachment-name').innerHTML = '';
populateSiteDropdown(); // reset dropdown selection
    }
  } catch (err) {
    showBanner('Network error. Please check your connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Report';
  }
});

function showBanner(msg, type) {
  const banner = document.getElementById('form-banner');
  banner.textContent = msg;
  banner.className = `mt-4 rounded-lg px-4 py-3 text-sm font-medium ${
    type === 'success'
      ? 'bg-green-100 text-green-800 border border-green-300'
      : 'bg-red-100 text-red-800 border border-red-300'
  }`;
  banner.classList.remove('hidden');
  banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideBanner() {
  document.getElementById('form-banner').classList.add('hidden');
}

// ── Search ────────────────────────────────────────────────────────────────────
// All records are fetched once and then filtered client-side across every
// field (reported by, site, agency, area, device, problem/alarm name, and
// root cause) — not just the problem description.
let allReportsCache = null;

const SEARCHABLE_FIELDS = [
  'reported_by', 'site_name', 'agency', 'area_name',
  'device_name', 'problem_desc', 'root_cause'
];

async function fetchAllReports(force = false) {
  if (allReportsCache && !force) return allReportsCache;
  const res = await fetch(`${API}/api/reports/search`); // no q param = full list
  allReportsCache = await res.json();
  return allReportsCache;
}

function filterReports(records, q) {
  if (!q) return records;
  const term = q.trim().toLowerCase();
  if (!term) return records;

  return records.filter(r =>
    SEARCHABLE_FIELDS.some(field => {
      const val = r[field];
      return val && String(val).toLowerCase().includes(term);
    })
  );
}

async function doSearch() {
  const q = document.getElementById('search_input').value.trim();
  const container = document.getElementById('results-container');
  const status    = document.getElementById('search-status');

  container.innerHTML = '<div class="flex justify-center py-8"><div class="spinner"></div></div>';
  status.classList.add('hidden');

  try {
    const all  = await fetchAllReports();
    const data = filterReports(all, q);

    status.textContent = q
      ? `${data.length} result(s) for "${q}"`
      : `${data.length} total record(s)`;
    status.classList.remove('hidden');

    if (data.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <svg class="mx-auto w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
          </svg>
          <p class="text-sm">No records found.</p>
        </div>`;
      return;
    }

    container.innerHTML = data.map(r => `
      <div class="result-card" onclick="openDetail(${r.id})">
        <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-gray-800 text-sm truncate">${escHtml(r.problem_desc)}</p>
            <p class="text-xs text-gray-400 mt-0.5">${escHtml(r.site_name)} &nbsp;•&nbsp; ${formatDate(r.created_at)}</p>
          </div>
          <span class="badge ${r.agency === 'Electrical' ? 'badge-electrical' : 'badge-mechanical'}">
            ${escHtml(r.agency)}
          </span>
        </div>
        <div class="flex flex-wrap gap-3 text-xs text-gray-500">
          <span>👤 ${escHtml(r.reported_by)}</span>
          ${r.area_name   ? `<span>📍 ${escHtml(r.area_name)}</span>`   : ''}
          ${r.device_name ? `<span>🔧 ${escHtml(r.device_name)}</span>` : ''}
          ${r.attachments && r.attachments.length
            ? `<span>📎 ${r.attachments.length} attachment${r.attachments.length > 1 ? 's' : ''}</span>`
            : ''}
        </div>
        <p class="mt-2 text-xs text-blue-500 font-medium">Click to view full details →</p>
      </div>
    `).join('');

  } catch (err) {
    container.innerHTML = '<p class="text-red-500 text-sm py-4">Failed to load records. Please try again.</p>';
  }
}

function clearSearch() {
  document.getElementById('search_input').value = '';
  doSearch();
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
async function openDetail(id) {
  const modal   = document.getElementById('detail-modal');
  const content = document.getElementById('detail-content');
  content.innerHTML = '<div class="flex justify-center py-8"><div class="spinner"></div></div>';
  modal.classList.remove('hidden');

  try {
    const res = await fetch(`${API}/api/reports/${id}`);
    const r   = await res.json();

    if (!res.ok) {
      content.innerHTML = `<p class="text-red-500 text-sm">${escHtml(r.error || 'Failed to load report details.')}</p>`;
      return;
    }

    content.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="detail-row">
          <label>Report #</label>
          <p>#${r.id}</p>
        </div>
        <div class="detail-row">
          <label>Date &amp; Time</label>
          <p>${formatDate(r.created_at, true)}</p>
        </div>
        <div class="detail-row">
          <label>Reported By</label>
          <p>${escHtml(r.reported_by)}</p>
        </div>
        <div class="detail-row">
          <label>Site Location</label>
          <p>${escHtml(r.site_name)}</p>
        </div>
        <div class="detail-row">
          <label>Agency</label>
          <p>
            <span class="badge ${r.agency === 'Electrical' ? 'badge-electrical' : 'badge-mechanical'}">
              ${escHtml(r.agency)}
            </span>
          </p>
        </div>
        <div class="detail-row">
          <label>Area Name</label>
          <p>${escHtml(r.area_name || '—')}</p>
        </div>
        <div class="detail-row sm:col-span-2">
          <label>Device Name</label>
          <p>${escHtml(r.device_name || '—')}</p>
        </div>
      </div>

      <div class="detail-row mt-2">
        <label>Problem Description / Alarm Name</label>
        <p class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">${escHtml(r.problem_desc)}</p>
      </div>

      <div class="detail-row">
        <label>Root Cause &amp; Solution Steps</label>
        <p class="bg-blue-50 border border-blue-200 rounded-lg p-3 leading-relaxed">${escHtml(r.root_cause)}</p>
      </div>

      ${r.attachments && r.attachments.length ? `
      <div class="detail-row">
        <label>Attachments (${r.attachments.length})</label>
        <div class="flex flex-col gap-1.5 mt-1">
          ${r.attachments.map(a => `
            <a href="${escHtml(a.url)}" target="_blank" rel="noopener"
               class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-sm">
              📎 ${escHtml(a.original_name)}
            </a>
          `).join('')}
        </div>
      </div>` : ''}
    `;
  } catch (err) {
    content.innerHTML = '<p class="text-red-500 text-sm">Failed to load report details.</p>';
  }
}

function closeDetail() {
  document.getElementById('detail-modal').classList.add('hidden');
}

// Close modals on backdrop click
document.getElementById('detail-modal').addEventListener('click', function(e) {
  if (e.target === this) closeDetail();
});
document.getElementById('site-modal').addEventListener('click', function(e) {
  if (e.target === this) closeSiteModal();
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(str, full = false) {
  if (!str) return '';
  const d = new Date(str.replace(' ', 'T'));
  if (full) {
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadSites();
