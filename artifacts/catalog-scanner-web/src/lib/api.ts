export type CatalogItem = {
  id: string;
  barcode: string;
  nameId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  scannedAt?: string;
};

export type CatalogGroup = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  count: number;
  items: CatalogItem[];
};

export type ProductName = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionInfo = {
  token: string;
  baseUrl: string;
  deviceName: string;
  createdAt?: string;
};

const SESSION_KEY = 'dtm-inventory.session.v2';

export function loadSession(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionInfo;
    if (!parsed?.token || !parsed?.baseUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: SessionInfo) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

async function request<T>(
  session: SessionInfo | null,
  path: string,
  init: RequestInit = {},
  baseUrlOverride?: string,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(baseUrlOverride || session?.baseUrl || '');
  if (!baseUrl) throw new Error('Not connected to a master PC');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function connectWithLoginCode(baseUrl: string, code: string, deviceName: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  const session = await request<SessionInfo>(
    null,
    '/api/auth/login-code',
    {
      method: 'POST',
      body: JSON.stringify({ code, deviceName }),
    },
    normalized,
  );
  const full = { ...session, baseUrl: session.baseUrl || normalized };
  saveSession(full);
  return full;
}

export async function fetchCatalog(session: SessionInfo) {
  return request<{ groups: CatalogGroup[]; names: ProductName[] }>(session, '/api/catalog');
}

export async function createName(session: SessionInfo, name: string) {
  return request<{ name: ProductName; names: ProductName[] }>(session, '/api/names', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function bulkScan(
  session: SessionInfo,
  payload: { name: string; barcodes: string[]; notes?: string; scannedAt?: string },
) {
  return request<{
    added: number;
    removed: number;
    moved: number;
    groups: CatalogGroup[];
    names: ProductName[];
  }>(session, '/api/scan/bulk', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      scannedAt: payload.scannedAt || new Date().toISOString(),
    }),
  });
}

export async function removeItem(session: SessionInfo, id: string) {
  return request<{ groups: CatalogGroup[]; names: ProductName[] }>(session, `/api/items/${id}`, {
    method: 'DELETE',
  });
}
