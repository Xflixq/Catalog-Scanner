function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function boot() {
  const list = document.getElementById('list');
  try {
    const res = await fetch('/api/files');
    const data = await res.json();
    const files = data.files || [];
    if (!files.length) {
      list.innerHTML = '<p class="empty">No packages yet. Run <code>pwsh -File scripts/build-all.ps1</code> first.</p>';
      return;
    }
    list.innerHTML = files
      .map(
        (f) => `<div class="item">
          <div class="meta">
            <div class="name">${f.name}</div>
            <div class="size">${fmtSize(f.size)} · ${new Date(f.mtime).toLocaleString()}</div>
          </div>
          <a class="btn" href="${f.url}">Download</a>
        </div>`,
      )
      .join('');
  } catch (err) {
    list.innerHTML = `<p class="empty">Could not load files: ${err.message}</p>`;
  }
}

boot();
