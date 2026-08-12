const $ = (id) => document.getElementById(id);
let catalogCache = { groups: [] };
let pinsCache = { pins: [] };
let currentPage = 'dashboard';

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&' + 'amp;')
    .replaceAll('<', '&' + 'lt;')
    .replaceAll('>', '&' + 'gt;')
    .replaceAll('"', '&' + 'quot;');
}

function pinKey(type, id) {
  return `${type}:${id}`;
}

function pinnedSet() {
  const set = new Set();
  for (const p of pinsCache.pins || []) {
    set.add(pinKey(p.targetType || p.target_type, p.targetId || p.target_id));
  }
  return set;
}

function isPinned(type, id) {
  return pinnedSet().has(pinKey(type, id));
}

function wireWindowControls() {
  $('btnMin')?.addEventListener('click', () => window.winControls?.minimize());
  $('btnMax')?.addEventListener('click', async () => {
    await window.winControls?.maximize();
  });
  $('btnClose')?.addEventListener('click', () => window.winControls?.close());
}

function showPage(name) {
  currentPage = name;
  document.querySelectorAll('.page-view').forEach((el) => {
    el.classList.toggle('active', el.id === `page-${name}`);
  });
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === name);
  });
  if (name === 'inventory') renderCatalog();
  if (name === 'dashboard') renderPins();
}

function wireNav() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => showPage(btn.dataset.goto));
  });
}

function renderDashStats(status) {
  const cards = [
    ['Network', status.baseUrl || '—'],
    ['Items', String(status.items || 0)],
    ['Names', String(status.names || 0)],
    ['Sessions', String(status.sessions || 0)],
  ];
  $('dashStats').innerHTML = cards
    .map(
      ([label, value]) =>
        `<div class="stat"><span class="stat-label">${escapeHtml(label)}</span><span class="stat-value">${escapeHtml(
          value,
        )}</span></div>`,
    )
    .join('');
  $('dashNetwork').textContent = status.baseUrl || '—';
  $('dashDb').textContent = status.dbPath ? `Database · ${status.dbPath}` : '—';
  $('sidebarStatus').textContent = status.baseUrl
    ? `Online · ${status.items || 0} items`
    : 'Connecting…';
  if (status.nodeBin) {
    $('aboutNode').textContent = `Runtime Node · ${status.nodeBin}`;
  }
}

function renderPins() {
  const host = $('pinnedItems');
  if (!host) return;
  const pins = pinsCache.pins || [];
  if (!pins.length) {
    host.innerHTML =
      '<div class="pin-empty">No pins yet. Open Inventory and pin a group or barcode.</div>';
    return;
  }
  host.innerHTML = pins
    .map((p) => {
      const type = p.targetType || p.target_type || 'item';
      const id = p.targetId || p.target_id || '';
      const title = p.label || p.barcode || id;
      const meta = [type === 'group' ? 'Group' : 'Barcode', p.barcode || id, p.notes]
        .filter(Boolean)
        .join(' · ');
      return `<div class="pin-card" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}">
        <div class="pin-title">${escapeHtml(title)}</div>
        <div class="pin-meta">${escapeHtml(meta)}</div>
        <div class="pin-actions">
          <button class="btn tiny ghost pin-jump" type="button">Open inventory</button>
          <button class="btn tiny ghost pin-remove" type="button">Unpin</button>
        </div>
      </div>`;
    })
    .join('');

  host.querySelectorAll('.pin-jump').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.pin-card');
      const label = card?.querySelector('.pin-title')?.textContent || '';
      showPage('inventory');
      if ($('inventorySearch')) {
        $('inventorySearch').value = label;
        renderCatalog();
      }
    });
  });
  host.querySelectorAll('.pin-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.pin-card');
      try {
        await window.master.pinToggle({
          targetType: card.dataset.type,
          targetId: card.dataset.id,
        });
        await refreshPins();
        if (currentPage === 'inventory') renderCatalog();
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

async function refreshStatus() {
  const status = await window.master.status();
  renderDashStats(status);
  if ($('dbPath')) $('dbPath').value = status.dbPath || '';
  if ($('port')) $('port').value = String(status.port || '');
  return status;
}

async function refreshTether() {
  const tether = await window.master.tether();
  $('tetherQr').src = tether.qrDataUrl;
  $('tetherUrl').textContent = tether.baseUrl;
}

async function refreshCodes() {
  const { codes } = await window.master.codes();
  $('codeList').innerHTML = (codes || [])
    .map((code) => {
      const state = code.usedAt
        ? `used ${new Date(code.usedAt).toLocaleString()}`
        : `expires ${new Date(code.expiresAt).toLocaleString()}`;
      return `<div class="code-item"><span><strong>${escapeHtml(code.code)}</strong>${
        code.label ? ` · ${escapeHtml(code.label)}` : ''
      }</span><span>${escapeHtml(state)}</span></div>`;
    })
    .join('');
}

async function togglePin(payload) {
  await window.master.pinToggle(payload);
  await refreshPins();
  renderCatalog();
}

function renderCatalog() {
  const q = ($('inventorySearch')?.value || '').trim().toLowerCase();
  let groups = catalogCache.groups || [];
  if (q) {
    groups = groups
      .map((g) => {
        const nameHit = String(g.name || '').toLowerCase().includes(q);
        const items = (g.items || []).filter(
          (it) =>
            String(it.barcode || '').toLowerCase().includes(q) ||
            String(it.notes || '').toLowerCase().includes(q),
        );
        if (nameHit) return g;
        if (!items.length) return null;
        return { ...g, items, count: items.length };
      })
      .filter(Boolean);
  }

  $('inventoryCount').textContent = `${groups.length} group${groups.length === 1 ? '' : 's'}`;
  $('catalog').innerHTML =
    groups
      .map((group) => {
        const groupId = String(group.id ?? group.name ?? '');
        const groupPinned = isPinned('group', groupId);
        const items = (group.items || [])
          .map((item) => {
            const itemId = String(item.id ?? item.barcode ?? '');
            const when = item.scannedAt ? new Date(item.scannedAt).toLocaleString() : '';
            const itemPinned = isPinned('item', itemId);
            return `<div class="item-row">
              <span>${escapeHtml(item.barcode)}${
                item.notes ? ` · ${escapeHtml(item.notes)}` : ''
              }${when ? ` · ${escapeHtml(when)}` : ''}</span>
              <span class="item-actions">
                <button class="btn pin ${itemPinned ? 'active' : ''}" type="button"
                  data-pin-type="item"
                  data-pin-id="${escapeHtml(itemId)}"
                  data-pin-label="${escapeHtml(item.barcode || itemId)}"
                  data-pin-barcode="${escapeHtml(item.barcode || '')}"
                  data-pin-notes="${escapeHtml(item.notes || group.name || '')}"
                  title="${itemPinned ? 'Unpin from dashboard' : 'Pin to dashboard'}">${
                    itemPinned ? 'Pinned' : 'Pin'
                  }</button>
              </span>
            </div>`;
          })
          .join('');
        return `<details class="group" open>
          <summary>
            <span>${escapeHtml(group.name)}</span>
            <span class="group-summary-actions">
              <span class="muted">${group.count || 0}</span>
              <button class="btn pin ${groupPinned ? 'active' : ''}" type="button"
                data-pin-type="group"
                data-pin-id="${escapeHtml(groupId)}"
                data-pin-label="${escapeHtml(group.name || groupId)}"
                data-pin-notes="Inventory group"
                title="${groupPinned ? 'Unpin group' : 'Pin group to dashboard'}">${
                  groupPinned ? 'Pinned' : 'Pin'
                }</button>
            </span>
          </summary>
          <div class="group-items">${items || '<div class="muted">No barcodes yet</div>'}</div>
        </details>`;
      })
      .join('') || '<p class="muted">No groups yet. Scan barcodes from a paired device.</p>';

  $('catalog').querySelectorAll('button[data-pin-type]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await togglePin({
          targetType: btn.dataset.pinType,
          targetId: btn.dataset.pinId,
          label: btn.dataset.pinLabel,
          barcode: btn.dataset.pinBarcode || '',
          notes: btn.dataset.pinNotes || '',
        });
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function refreshCatalog() {
  const data = await window.master.catalog();
  catalogCache = data || { groups: [] };
  renderCatalog();
}

async function refreshPins() {
  try {
    const data = await window.master.pins();
    pinsCache = data || { pins: [] };
  } catch {
    pinsCache = { pins: [] };
  }
  renderPins();
}

async function refreshAll() {
  await refreshStatus();
  await Promise.all([
    refreshTether().catch(() => undefined),
    refreshCodes().catch(() => undefined),
    refreshPins().catch(() => undefined),
    refreshCatalog().catch(() => undefined),
  ]);
}

function wireActions() {
  $('refreshAll')?.addEventListener('click', () => {
    refreshAll().catch((e) => alert(e.message));
  });
  $('refreshInventory')?.addEventListener('click', () => {
    refreshCatalog().catch((e) => alert(e.message));
  });
  $('refreshPins')?.addEventListener('click', () => {
    refreshPins().catch((e) => alert(e.message));
  });
  $('inventorySearch')?.addEventListener('input', () => renderCatalog());

  $('refreshTether')?.addEventListener('click', () => {
    refreshTether().catch((e) => alert(e.message));
  });

  $('createCode')?.addEventListener('click', async () => {
    try {
      const created = await window.master.createCode({
        label: $('codeLabel').value,
        ttlMinutes: 60,
      });
      $('latestCode').classList.remove('hidden');
      $('latestCode').textContent = created.code;
      $('codeLabel').value = '';
      await refreshCodes();
      await refreshStatus();
    } catch (e) {
      alert(e.message);
    }
  });

  $('browseDb')?.addEventListener('click', async () => {
    const p = await window.master.pickDbPath();
    if (p) $('dbPath').value = p;
  });

  $('saveConfig')?.addEventListener('click', async () => {
    try {
      const result = await window.master.saveConfig({
        dbPath: $('dbPath').value,
        port: Number($('port').value),
      });
      $('configNote').textContent = result.note || 'Saved.';
      await refreshStatus();
    } catch (e) {
      alert(e.message);
    }
  });
}

async function boot() {
  wireWindowControls();
  wireNav();
  wireActions();
  showPage('dashboard');
  await refreshAll();
  setInterval(() => {
    refreshStatus().catch(() => undefined);
    if (currentPage === 'inventory') refreshCatalog().catch(() => undefined);
    if (currentPage === 'dashboard') refreshPins().catch(() => undefined);
    if (currentPage === 'devices') {
      refreshCodes().catch(() => undefined);
    }
  }, 8000);
}

boot().catch((e) => {
  $('dashStats').innerHTML = `<div class="stat"><span class="stat-label">Error</span><span class="stat-value">${escapeHtml(
    e.message || String(e),
  )}</span></div>`;
  $('sidebarStatus').textContent = 'Offline';
});
