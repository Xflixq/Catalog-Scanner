async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function el(id) {
  return document.getElementById(id);
}

async function refreshStatus() {
  const status = await api('/api/master/status');
  el('statusMeta').innerHTML = [
    `LAN ${status.baseUrl}`,
    `${status.items} items · ${status.names} names · ${status.sessions} sessions`,
    `DB ${status.dbPath}`,
  ].join('<br/>');
  el('dbPath').value = status.dbPath;
  el('port').value = String(status.port);
}

async function refreshTether() {
  const tether = await api('/api/master/tether');
  el('tetherQr').src = tether.qrDataUrl;
  el('tetherUrl').textContent = tether.baseUrl;
}

async function refreshCodes() {
  const { codes } = await api('/api/master/login-codes');
  el('codeList').innerHTML = codes
    .map((code) => {
      const state = code.usedAt ? `used ${new Date(code.usedAt).toLocaleString()}` : `expires ${new Date(code.expiresAt).toLocaleString()}`;
      return `<div class="code-item"><span><strong>${code.code}</strong> ${code.label ? `· ${code.label}` : ''}</span><span>${state}</span></div>`;
    })
    .join('');
}

async function refreshCatalog() {
  // Master console uses a short-lived local master session via health-only endpoints for status.
  // Catalog requires auth; create an ephemeral tether session for the console itself.
  if (!window.__masterToken) {
    const tether = await api('/api/master/tether');
    const session = await api('/api/auth/tether', {
      method: 'POST',
      body: JSON.stringify({ baseUrl: tether.baseUrl, deviceName: 'Master console' }),
    });
    window.__masterToken = session.token;
  }
  const data = await api('/api/catalog', {
    headers: { Authorization: `Bearer ${window.__masterToken}` },
  });
  el('catalog').innerHTML = data.groups
    .map((group) => {
      const items = group.items
        .map((item) => `<div class="item-row"><span>${item.barcode}</span><span>${item.notes || ''}</span></div>`)
        .join('');
      return `<details class="group"><summary>${group.name} <span class="muted">/ ${group.count}</span></summary><div class="group-items">${items || '<div class="muted">No barcodes</div>'}</div></details>`;
    })
    .join('') || '<p class="muted">No groups yet. Scan barcodes from a paired device.</p>';
}

el('refreshTether').addEventListener('click', () => {
  refreshTether().catch((err) => alert(err.message));
});

el('createCode').addEventListener('click', async () => {
  try {
    const created = await api('/api/master/login-codes', {
      method: 'POST',
      body: JSON.stringify({ label: el('codeLabel').value, ttlMinutes: 60 }),
    });
    el('latestCode').classList.remove('hidden');
    el('latestCode').textContent = created.code;
    el('codeLabel').value = '';
    await refreshCodes();
  } catch (err) {
    alert(err.message);
  }
});

el('saveConfig').addEventListener('click', async () => {
  try {
    const result = await api('/api/master/config', {
      method: 'POST',
      body: JSON.stringify({
        dbPath: el('dbPath').value,
        port: Number(el('port').value),
      }),
    });
    el('configNote').textContent = result.note || 'Saved.';
  } catch (err) {
    alert(err.message);
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
  }, 8000);
}

boot().catch((err) => {
  el('statusMeta').textContent = err.message;
});
