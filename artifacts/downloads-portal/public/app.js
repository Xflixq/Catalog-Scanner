function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function pick(files, names) {
  for (const name of names) {
    const hit = files.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit;
  }
  // partial
  for (const name of names) {
    const key = name.toLowerCase().replace(/\.[^.]+$/, '');
    const hit = files.find((f) => f.name.toLowerCase().includes(key));
    if (hit) return hit;
  }
  return null;
}

function bindCard(id, file) {
  const btn = document.getElementById('btn-' + id);
  const meta = document.getElementById('meta-' + id);
  if (!btn || !meta) return;
  if (!file) {
    meta.textContent = 'Not published yet';
    btn.classList.add('is-disabled');
    btn.removeAttribute('href');
    return;
  }
  meta.textContent = file.name + ' · ' + fmtSize(file.size);
  btn.href = file.url;
  btn.classList.remove('is-disabled');
}

async function boot() {
  const res = await fetch('./api/files', { cache: 'no-store' });
  const data = await res.json();
  const files = data.files || [];

  bindCard('setup', pick(files, ['DTMInventorySetup.msi', 'DTM-Inventory-Setup.msi']));
  bindCard('master', pick(files, ['DTMInventoryMaster.msi', 'DTM-Inventory-Master.msi']));
  bindCard('android', pick(files, ['DTMInventory.apk', 'dtm-inventory.apk']));

  const list = document.getElementById('list');
  if (!files.length) {
    list.textContent = 'No files in downloads yet. Build with pnpm master:setup && pnpm android:apk';
    return;
  }
  // Prefer MSI/APK in list; hide zip unless no msi
  const preferred = files.filter((f) => /\.(msi|apk)$/i.test(f.name));
  const rest = files.filter((f) => !/\.(msi|apk)$/i.test(f.name) && !/\.zip$/i.test(f.name));
  const show = preferred.length ? preferred.concat(rest) : files;
  list.innerHTML = show
    .map(
      (f) =>
        `<a class="file-row" href="${f.url}"><span>${f.name}</span><span>${fmtSize(f.size)}</span></a>`,
    )
    .join('');
}

boot().catch((e) => {
  const list = document.getElementById('list');
  if (list) list.textContent = 'Failed to load files: ' + e.message;
});
