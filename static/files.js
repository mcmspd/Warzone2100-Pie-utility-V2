/**
 * Warzone 2100 File Manager (dedicated /files page)
 * Browse + view .pie/.json anywhere under data/ (read-only),
 * save / mkdir / delete restricted to data/custom (enforced server-side).
 */

const fm = {
  cwd: '',
  writable: false,
  openPath: null, // currently open file (server-relative path) or null
  openWritable: false,
  dirs: [],
  files: []
};

let fmToastTimer = null;
function fmToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if (fmToastTimer) clearTimeout(fmToastTimer);
  fmToastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function $(id) {
  return document.getElementById(id);
}

function escFm(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function fmBrowse(path) {
  try {
    const res = await fetch(`/api/files/browse?path=${encodeURIComponent(path || '')}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    fm.cwd = data.path || '';
    fm.writable = !!data.writable;
    fm.dirs = data.dirs || [];
    fm.files = data.files || [];
    renderFmCrumbs();
    renderFmLists();
    updateFmToolbar();
  } catch (err) {
    console.error('Browse failed:', err);
    fmToast('Browse failed: ' + err.message);
  }
}

function renderFmCrumbs() {
  const crumbs = $('fm-crumbs');
  if (!crumbs) return;
  crumbs.innerHTML = '';
  const root = document.createElement('button');
  root.className = 'fm-crumb';
  root.textContent = 'data/';
  root.title = 'Server data root';
  root.addEventListener('click', () => fmBrowse(''));
  crumbs.appendChild(root);
  if (!fm.cwd) return;
  const parts = fm.cwd.split('/');
  parts.forEach((seg, i) => {
    const sep = document.createElement('span');
    sep.className = 'fm-crumb-sep';
    sep.textContent = '/';
    crumbs.appendChild(sep);
    const b = document.createElement('button');
    b.className = 'fm-crumb';
    b.textContent = seg;
    const target = parts.slice(0, i + 1).join('/');
    b.addEventListener('click', () => fmBrowse(target));
    crumbs.appendChild(b);
  });
}

function renderFmLists() {
  const dirsEl = $('fm-dirs');
  if (dirsEl) {
    dirsEl.innerHTML = '';
    if (fm.dirs.length === 0) {
      dirsEl.innerHTML = '<div class="saved-uv-empty">No subfolders</div>';
    }
    const frag = document.createDocumentFragment();
    fm.dirs.forEach((d) => {
      const b = document.createElement('button');
      b.className = 'asm-entry-row';
      b.innerHTML = `<span class="asm-row-label">📁 ${escFm(d.name)}</span>`;
      b.addEventListener('click', () => fmBrowse(d.path));
      frag.appendChild(b);
    });
    dirsEl.appendChild(frag);
  }

  const filesEl = $('fm-files');
  if (filesEl) {
    filesEl.innerHTML = '';
    if (fm.files.length === 0) {
      filesEl.innerHTML = '<div class="saved-uv-empty">No .pie / .json files here</div>';
    }
    const frag = document.createDocumentFragment();
    fm.files.forEach((f) => {
      const b = document.createElement('button');
      b.className = 'asm-entry-row' + (fm.openPath === f.path ? ' asm-selected' : '');
      const kb = f.size >= 1024 ? `${(f.size / 1024).toFixed(1)}k` : `${f.size}b`;
      b.innerHTML = `<span class="asm-row-label">${escFm(f.name)}</span><span class="asm-entry-id">${kb}</span>`;
      b.title = `${f.path} (${f.size} bytes)`;
      b.addEventListener('click', () => fmOpen(f.path));
      frag.appendChild(b);
    });
    filesEl.appendChild(frag);
  }
}

function setEditor(content, readOnly) {
  const ed = $('fm-editor');
  if (!ed) return;
  ed.value = content || '';
  ed.readOnly = !!readOnly;
  ed.classList.toggle('fm-readonly', !!readOnly);
}

function updateFmToolbar() {
  const saveBtn = $('btn-fm-save');
  if (saveBtn) saveBtn.disabled = false; // server enforces custom-only; error surfaces as toast
  const copyBtn = $('btn-fm-save-copy');
  if (copyBtn) copyBtn.style.display = (fm.openPath && !fm.openWritable) ? 'inline-flex' : 'none';
  const info = $('fm-info');
  if (info) {
    if (fm.openPath) {
      info.textContent = `${fm.openPath}${fm.openWritable ? '' : ' (read-only — official/synced file)'}`;
    } else {
      info.textContent = fm.writable
        ? `/${fm.cwd || ''} — writable (data/custom)`
        : 'Pick a file to view it';
    }
  }
  const nameRow = $('fm-name-row');
  if (nameRow) nameRow.style.display = fm.openPath || fm.writable ? 'flex' : 'none';
}

async function fmOpen(path) {
  try {
    const res = await fetch(`/api/files/view?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    fm.openPath = data.path;
    fm.openWritable = !!data.writable;
    const fn = $('fm-filename');
    if (fn) fn.value = data.path;
    setEditor(data.content, !data.writable);
    renderFmLists();
    updateFmToolbar();
  } catch (err) {
    console.error('Open failed:', err);
    fmToast('Open failed: ' + err.message);
  }
}

function fmNewFile() {
  fm.openPath = null;
  fm.openWritable = true;
  const fn = $('fm-filename');
  if (fn) {
    fn.value = ((fm.writable && fm.cwd) ? fm.cwd + '/' : 'custom/') + 'untitled.pie';
    fn.focus();
    fn.select();
  }
  setEditor('', false);
  renderFmLists();
  updateFmToolbar();
}

async function fmSave(overwrite) {
  const fn = $('fm-filename');
  const ed = $('fm-editor');
  const target = fn ? fn.value.trim() : '';
  if (!target) {
    fmToast('Enter a file path first.');
    if (fn) fn.focus();
    return;
  }
  try {
    const res = await fetch('/api/files/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target, content: ed ? ed.value : '', overwrite: !!overwrite })
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409) {
        if (window.confirm(`"${target}" exists. Overwrite it?`)) {
          await fmSave(true);
        }
        return;
      }
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    fm.openPath = data.path;
    fm.openWritable = true;
    if (fn) fn.value = data.path;
    // Refresh listing (new file may live in another dir) and stay in place
    await fmBrowse(fm.cwd);
    renderFmLists();
    updateFmToolbar();
    fmToast(`Saved ${data.path}`);
  } catch (err) {
    console.error('Save failed:', err);
    fmToast('Save failed: ' + err.message);
  }
}

function fmSaveCopy() {
  if (!fm.openPath || fm.openWritable) return;
  const base = fm.openPath.split('/').pop();
  const fn = $('fm-filename');
  if (fn) {
    fn.value = 'custom/' + base;
    fn.focus();
    fn.select();
  }
  setEditor($('fm-editor') ? $('fm-editor').value : '', false);
  fm.openPath = null;
  fm.openWritable = true;
  updateFmToolbar();
  fmToast('Editing a copy — press Save to write under data/custom');
}

async function fmDelete() {
  // Prefer the open file; otherwise the current folder (custom only, server-guarded)
  const target = fm.openPath || fm.cwd;
  if (!target) {
    fmToast('Nothing to delete.');
    return;
  }
  const isDir = !fm.openPath;
  const attempt = async (recursive) => {
    const qs = `path=${encodeURIComponent(target)}${recursive ? '&recursive=true' : ''}`;
    const res = await fetch(`/api/files?${qs}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return { ok: true };
  };
  try {
    if (!window.confirm(`Delete "${target}"${isDir ? ' and everything under it' : ''}?`)) return;
    let r = await attempt(false);
    if (!r.ok && /not empty/i.test(r.error || '')) {
      if (!window.confirm(`"${target}" is not empty. Delete it recursively?`)) return;
      r = await attempt(true);
    }
    if (!r.ok) throw new Error(r.error);
    if (fm.openPath) {
      fm.openPath = null;
      setEditor('', true);
      const fn = $('fm-filename');
      if (fn) fn.value = '';
    }
    if (isDir) {
      const up = target.split('/').slice(0, -1).join('/');
      await fmBrowse(up);
    } else {
      await fmBrowse(fm.cwd);
    }
    renderFmLists();
    updateFmToolbar();
    fmToast(`Deleted ${target}`);
  } catch (err) {
    console.error('Delete failed:', err);
    fmToast('Delete failed: ' + err.message);
  }
}

async function fmMkdir() {
  const name = window.prompt('New folder name (created inside /' + (fm.cwd || '') + '):', 'new-folder');
  if (!name) return;
  const clean = name.trim().replace(/[\/\\]+/g, '/').replace(/^\.+/, '');
  if (!clean) {
    fmToast('Invalid folder name.');
    return;
  }
  const target = (fm.cwd ? fm.cwd + '/' : '') + clean;
  try {
    const res = await fetch('/api/files/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await fmBrowse(fm.cwd);
    fmToast(`Created ${data.path}`);
  } catch (err) {
    console.error('mkdir failed:', err);
    fmToast('mkdir failed: ' + err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const wire = (id, fn) => {
    const b = $(id);
    if (b) b.addEventListener('click', fn);
  };
  wire('btn-fm-new', fmNewFile);
  wire('btn-fm-mkdir', fmMkdir);
  wire('btn-fm-save', () => fmSave(false));
  wire('btn-fm-save-copy', fmSaveCopy);
  wire('btn-fm-delete', fmDelete);
  wire('btn-fm-refresh', () => fmBrowse(fm.cwd));

  // Drag & drop upload (.pie / .json only; lands in cwd if writable, else data/custom)
  const dropZone = $('fm-main');
  let dragDepth = 0;
  if (dropZone) {
    dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth++;
      dropZone.classList.add('fm-dragover');
    });
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dropZone.classList.remove('fm-dragover');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      dropZone.classList.remove('fm-dragover');
      if (e.dataTransfer && e.dataTransfer.files) {
        fmUploadDropped(Array.from(e.dataTransfer.files));
      }
    });
  }

  fmBrowse('');
});

function fmUploadDropped(files) {
  const ok = files.filter(f => /\.pie$/i.test(f.name) || /\.json$/i.test(f.name));
  const skipped = files.length - ok.length;
  if (skipped > 0) {
    fmToast(`${skipped} file${skipped === 1 ? '' : 's'} skipped (only .pie / .json accepted)`);
  }
  if (ok.length === 0) return;
  const base = (fm.writable && fm.cwd) ? fm.cwd + '/' : 'custom/';
  let done = 0;
  let failed = 0;
  ok.forEach((f) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const target = base + f.name.split('/').pop();
        const put = async (overwrite) => {
          const res = await fetch('/api/files/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: target, content: String(reader.result || ''), overwrite })
          });
          const data = await res.json();
          if (!res.ok) {
            if (res.status === 409 && !overwrite) {
              if (window.confirm(`"${target}" exists. Overwrite it?`)) {
                await put(true);
                return 'overwrote';
              }
              return 'skipped';
            }
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          return 'saved';
        };
        const outcome = await put(false);
        if (outcome === 'saved' || outcome === 'overwrote') done++;
        else failed++;
      } catch (err) {
        console.error('Upload failed:', err);
        failed++;
        fmToast(`Upload failed for ${f.name}: ` + err.message);
      } finally {
        if (done + failed === ok.length) {
          await fmBrowse(fm.cwd);
          fmToast(`Uploaded ${done} file${done === 1 ? '' : 's'}${failed > 0 ? ` (${failed} failed)` : ''} to /${base}`);
        }
      }
    };
    reader.onerror = () => {
      failed++;
      fmToast(`Could not read ${f.name}`);
    };
    reader.readAsText(f);
  });
}
