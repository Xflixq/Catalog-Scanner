const $ = (id) => document.getElementById(id);

async function refreshStatus() {
  const status = await window.master.status();
  $('statusMeta').innerHTML = [
    `LAN ${status.baseUrl}`,
    `${status.items} items · ${status.names} names · ${status.sessions} sessions`,
    `DB ${status.dbPath}`,
  ].join('<br/>');
  $('dbPath').value = status.dbPath;
  $('port').value = String(status.port);
}

async function refreshTether() {
  const tether = await window.master.tether();
  $('tetherQr').src = tether.qrDataUrl;
  $('tetherUrl').textContent = tether.baseUrl;
}

async function refreshCodes() {
  const { codes } = await window.master.codes();
  $('codeList').innerHTML = codes
    .map((code) => {
      const state = code.usedAt
        ? `used ${new Date(code.usedAt).toLocaleString()}`
        : `expires ${new Date(code.expiresAt).toLocaleString()}`;
      return `<div class="code-item"><span><strong>${code.code}</strong>${
        code.label ? ` · ${escapeHtml(code.label)}` : ''
      }</span><span>${state}</span></div>`;
    })
    .join('');
}

async function refreshCatalog() {
  const data = await window.master.catalog();
  $('catalog').innerHTML =
    (data.groups || [])
      .map((group) => {
        const items = (group.items || [])
          .map((item) => {
            const when = item.scannedAt ? new Date(item.scannedAt).toLocaleString() : '';
            return `<div class="item-row"><span>${escapeHtml(
              item.barcode,
            )}</span><span>${when}${
              item.notes ? ` · ${escapeHtml(item.notes)}` : ''
            }</span></div>`;
          })
          .join('');
        return `<details class="group"><summary>${escapeHtml(
          group.name,
        )} <span class="muted">/ ${group.count}</span></summary><div class="group-items">${
          items || '<div class="muted">No barcodes</div>'
        }</div></details>`;
      })
      .join('') || '<p class="muted">No groups yet. Scan barcodes from a paired device.</p>';
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&' + 'amp;')
    .replaceAll('<', '&' + 'lt;')
    .replaceAll('>', '&' + 'gt;')
    .replaceAll('"', '&' + 'quot;');
}

$('refreshTether').addEventListener('click', () => {
  refreshTether().catch((e) => alert(e.message));
});

$('createCode').addEventListener('click', async () => {
  try {
    const created = await window.master.createCode({
      label: $('codeLabel').value,
      ttlMinutes: 60,
    });
    $('latestCode').classList.remove('hidden');
    $('latestCode').textContent = created.code;
    $('codeLabel').value = '';
    await refreshCodes();
  } catch (e) {
    alert(e.message);
  }
});

$('browseDb').addEventListener('click', async () => {
  const p = await window.master.pickDbPath();
  if (p) $('dbPath').value = p;
});

$('saveConfig').addEventListener('click', async () => {
  try {
    const result = await window.master.saveConfig({
      dbPath: $('dbPath').value,
      port: Number($('port').value),
    });
    $('configNote').textContent = result.note || 'Saved.';
  } catch (e) {
    alert(e.message);
  }
});

async function boot() {
  await refreshStatus();
  await refreshTether();
  await refreshCodes();
  await refreshCatalog();
  setInterval(() => {
    refreshStatus().catch(() => undefined);
    refreshCatalog().catch(() => undefined);
    refreshCodes().catch(() => undefined);
  }, 8000);
}

boot().catch((e) => {
  $('statusMeta').textContent = e.message;
});
