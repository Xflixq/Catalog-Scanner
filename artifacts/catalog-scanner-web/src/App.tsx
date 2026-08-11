import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import DtmLogo from '@assets/DTM_Logo_1786368092753.png';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  bulkScan,
  clearSession,
  connectWithLoginCode,
  createName,
  fetchCatalog,
  loadSession,
  removeItem,
  saveSession,
  type CatalogGroup,
  type ProductName,
  type SessionInfo,
} from '@/lib/api';

const queryClient = new QueryClient();

function sanitizeBarcode(value: string) {
  return value.replace(/[^\dA-Za-z-]/g, '');
}

function AppNotice({
  tone,
  children,
  onDismiss,
}: {
  tone: 'success' | 'error' | 'info';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-black bg-white px-4 py-3 text-sm text-black"
      role="status"
      data-testid={`status-${tone}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss ? (
        <button
          onClick={onDismiss}
          className="rounded-md border border-black px-2 py-1 text-xs font-semibold text-black transition hover:bg-black hover:text-white"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

function Modal({
  title,
  label,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div
        className={`catalog-enter max-h-[94dvh] w-full overflow-y-auto rounded-t-[1.25rem] border border-black bg-white shadow-[0_24px_60px_rgba(0,0,0,.2)] sm:rounded-[1.25rem] ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-start justify-between border-b border-black px-5 py-5 sm:px-7">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-black">{label}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-.03em] text-black">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-black px-3 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="px-5 py-6 sm:px-7">{children}</div>
      </div>
    </div>
  );
}

function PairingPanel({ onPaired }: { onPaired: (session: SessionInfo) => void }) {
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:47821');
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('Workstation');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await connectWithLoginCode(baseUrl.trim(), code.trim(), deviceName.trim() || 'Workstation');
      onPaired(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-[1.5rem] border border-black bg-white p-6 sm:p-8">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-black">Other PC login</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-black">Connect with a login code</h2>
      <p className="mt-3 text-sm leading-6 text-black">
        Generate a one-time code on the master PC console, then enter the master URL and code here.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-black">Master URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="h-12 w-full rounded-xl border border-black/40 bg-white px-3 text-[15px] text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            placeholder="http://192.168.0.5:47821"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-black">Login code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="h-12 w-full rounded-xl border border-black/40 bg-white px-3 font-mono text-[15px] tracking-[0.2em] text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            placeholder="ABC123"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-black">This PC name</span>
          <input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            className="h-12 w-full rounded-xl border border-black/40 bg-white px-3 text-[15px] text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            placeholder="Front desk"
          />
        </label>
        {error ? <AppNotice tone="error">{error}</AppNotice> : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-black px-6 text-sm font-bold text-white transition hover:bg-white hover:text-black hover:ring-1 hover:ring-black disabled:opacity-50"
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </div>
  );
}

const SCAN_COOLDOWN_MS = 2000;

function BulkScanModal({
  names,
  onClose,
  onCreateName,
  onSubmit,
}: {
  names: ProductName[];
  onClose: () => void;
  onCreateName: (name: string) => Promise<void>;
  onSubmit: (payload: { name: string; barcodes: string[]; notes: string; scannedAt?: string }) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const coolingRef = useRef(false);
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState(names[0]?.name || '');
  const [newName, setNewName] = useState('');
  const [notes, setNotes] = useState('');
  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastScan, setLastScan] = useState<{ code: string; action: 'added' | 'removed' } | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setCooldownLeft(0);
      coolingRef.current = false;
      return;
    }
    const tick = () => {
      const left = Math.max(0, cooldownUntil - Date.now());
      setCooldownLeft(left);
      if (left <= 0) coolingRef.current = false;
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  function toggleBarcode(raw: string, opts?: { force?: boolean }) {
    const value = sanitizeBarcode(raw);
    if (value.length < 4) return;
    if (!opts?.force && coolingRef.current) return;
    let action: 'added' | 'removed' = 'added';
    setBarcodes((prev) => {
      if (prev.includes(value)) {
        action = 'removed';
        return prev.filter((b) => b !== value);
      }
      return [value, ...prev];
    });
    setLastScan({ code: value, action });
    if (!opts?.force) {
      coolingRef.current = true;
      setCooldownUntil(Date.now() + SCAN_COOLDOWN_MS);
    }
  }

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
        setCameraError('Camera access is not available. Type barcodes instead.');
        return;
      }
      try {
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (!active || !result || coolingRef.current) return;
            // Only accept codes detected while the user is aiming at the center target box.
            // zxing does not always give reliable bounds in-browser, so we still apply cooldown
            // and a clear last-scan banner so consecutive codes are unambiguous.
            toggleBarcode(result.getText());
          },
        );
        controlsRef.current = controls;
      } catch {
        setCameraError('Camera permission is required. Use manual entry instead.');
      }
    }

    start();
    return () => {
      active = false;
      controlsRef.current?.stop();
    };
  }, []);

  async function addName() {
    const cleaned = newName.trim();
    if (!cleaned) return;
    setBusy(true);
    setError('');
    try {
      await onCreateName(cleaned);
      setSelectedName(cleaned);
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add name');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedName.trim()) {
      setError('Choose or add a name');
      return;
    }
    if (!barcodes.length) {
      setError('Scan at least one barcode');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        name: selectedName.trim(),
        barcodes,
        notes: notes.trim(),
        scannedAt: new Date().toISOString(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk scan failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Scan barcodes" label="Bulk scan" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-xl border border-black bg-white px-4 py-3 text-sm leading-6 text-black">
          Hold one barcode inside the white box. There is a 2s cooldown after each scan so consecutive codes stay clear.
          Scanning the same code again removes it from this batch.
        </div>

        <div className="overflow-hidden rounded-2xl border border-black bg-white">
          <div className="relative aspect-[1.45] overflow-hidden bg-black">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover opacity-90" />
            <div className="absolute inset-x-[18%] top-1/2 h-24 -translate-y-1/2 border-2 border-white">
              <div className="scan-line absolute inset-x-3 top-1/2 h-px bg-white/90" />
            </div>
                        <div className="absolute bottom-3 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[.16em] text-white">
              {cooldownLeft > 0
                ? `Cooldown ${(cooldownLeft / 1000).toFixed(1)}s`
                : `${barcodes.length} in batch · aim inside box`}
            </div>
          </div>
          {cameraError ? <p className="border-t border-black px-4 py-3 text-xs leading-5 text-black">{cameraError}</p> : null}
        </div>

        {lastScan ? (
          <div className="rounded-xl border border-black bg-white px-4 py-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-black">
              {lastScan.action === 'added' ? 'Scanned' : 'Removed'}
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-black">{lastScan.code}</p>
          </div>
        ) : null}

        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(sanitizeBarcode(e.target.value))}
            className="h-12 min-w-0 flex-1 rounded-xl border border-black/40 bg-white px-3 font-mono text-[15px] text-black outline-none focus:border-black"
            placeholder="Type barcode"
          />
          <button
            type="button"
            onClick={() => {
              toggleBarcode(manual, { force: true });
              setManual('');
            }}
            className="h-12 rounded-xl border border-black px-4 text-sm font-bold text-black"
          >
            Add / remove
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {barcodes.length ? (
            barcodes.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => toggleBarcode(code, { force: true })}
                className="inline-flex items-center gap-2 rounded-full border border-black px-3 py-1.5 font-mono text-xs font-semibold text-black"
              >
                {code} ×
              </button>
            ))
          ) : (
            <p className="text-sm text-black/70">No barcodes in this batch yet.</p>
          )}
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-black">Name</span>
          <select
            value={selectedName}
            onChange={(e) => setSelectedName(e.target.value)}
            className="h-12 w-full rounded-xl border border-black/40 bg-white px-3 text-[15px] text-black outline-none focus:border-black"
          >
            <option value="">Select name</option>
            {names.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-xl border border-black/40 bg-white px-3 text-[15px] text-black outline-none focus:border-black"
            placeholder="Add new name"
          />
          <button type="button" onClick={() => void addName()} className="h-12 rounded-xl bg-black px-4 text-sm font-bold text-white">
            Add name
          </button>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-black">Notes optional</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-black/40 bg-white px-3 py-3 text-[15px] text-black outline-none focus:border-black"
            placeholder="Optional notes for new items"
          />
        </label>

        {error ? <AppNotice tone="error">{error}</AppNotice> : null}

        <div className="flex flex-col-reverse gap-3 border-t border-black pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-12 rounded-xl border border-black px-5 text-sm font-semibold text-black">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-black px-6 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save batch'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Home() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [names, setNames] = useState<ProductName[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [scanOpen, setScanOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = loadSession();
    if (!saved) {
      setBootstrapping(false);
      return;
    }
    setSession(saved);
    fetchCatalog(saved)
      .then((data) => {
        setGroups(data.groups);
        setNames(data.names);
      })
      .catch(() => {
        clearSession();
        setSession(null);
      })
      .finally(() => setBootstrapping(false));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            group.name.toLowerCase().includes(term) ||
            item.barcode.toLowerCase().includes(term) ||
            item.notes.toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.name.toLowerCase().includes(term) || group.items.length > 0)
      .map((group) => ({ ...group, count: group.items.length }));
  }, [groups, search]);

  async function refresh(active: SessionInfo) {
    setLoading(true);
    try {
      const data = await fetchCatalog(active);
      setGroups(data.groups);
      setNames(data.names);
    } finally {
      setLoading(false);
    }
  }

  if (bootstrapping) {
    return (
      <div className="catalog-shell flex min-h-[100dvh] items-center justify-center">
        <div className="h-10 w-10 animate-pulse rounded-full border border-black" />
      </div>
    );
  }

  return (
    <div className="catalog-shell min-h-[100dvh]">
      <header className="border-b border-black bg-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <img src={DtmLogo} alt="DTM Fabrications" className="h-10 w-auto" />
            <div>
              <h1 className="text-lg font-bold tracking-[-.04em] text-black">DTM Fabrications</h1>
              {session ? <p className="font-mono text-[10px] text-black/70">{session.baseUrl}</p> : null}
            </div>
          </div>
          {session ? (
            <button
              onClick={() => {
                clearSession();
                setSession(null);
                setGroups([]);
                setNames([]);
              }}
              className="h-11 rounded-xl border border-black px-4 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 pb-12 pt-8 sm:px-8 sm:pt-12 lg:px-10">
        {!session ? (
          <section className="catalog-enter">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[.22em] text-black">Portable master network</p>
            <h2 className="mt-4 max-w-[640px] text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[.96] tracking-[-.07em] text-black">
              Connect this PC
              <br />
              to the master
            </h2>
            <p className="mt-5 max-w-[520px] text-base leading-7 text-black">
              Android devices pair with a tether QR on first boot. Other PCs use a login code from the master console.
            </p>
            <div className="mt-10">
              <PairingPanel
                onPaired={(next) => {
                  saveSession(next);
                  setSession(next);
                  void refresh(next);
                }}
              />
            </div>
          </section>
        ) : (
          <>
            <section className="catalog-enter grid gap-8 border-b border-black pb-8 lg:grid-cols-[1fr_1.08fr] lg:items-end">
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[.22em] text-black">Instructions</p>
                <h2 className="mt-4 max-w-[580px] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[.96] tracking-[-.07em] text-black">
                  Scan Items
                  <br />
                  Select Name
                </h2>
                <p className="mt-5 max-w-[470px] text-base leading-7 text-black">
                  Bulk-scan barcodes, then assign one name to the batch. Groups expand to show every barcode.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-black bg-white p-6 sm:p-8">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.19em] text-black">Choose an action</p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => setScanOpen(true)}
                    className="flex min-h-[58px] flex-1 items-center justify-center rounded-xl bg-black px-5 text-sm font-bold text-white transition hover:bg-white hover:text-black hover:ring-1 hover:ring-black"
                  >
                    Scan barcodes
                  </button>
                  <button
                    onClick={() => void refresh(session)}
                    className="flex min-h-[58px] items-center justify-center rounded-xl border border-black bg-white px-5 text-sm font-bold text-black transition hover:bg-black hover:text-white"
                  >
                    {loading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              </div>
            </section>

            <section className="catalog-enter catalog-stagger-1 mt-12">
              <div className="flex flex-col gap-4 border-b border-black pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-black">Catalog</p>
                  <h3 className="mt-1 text-2xl font-bold tracking-[-.04em] text-black">
                    Groups {groups.length > 0 ? <span className="font-mono text-base font-normal text-black">/ {groups.length}</span> : null}
                  </h3>
                </div>
                <label className="block w-full sm:w-72">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[.16em] text-black">Search</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-11 w-full rounded-xl border border-black bg-white px-3 text-sm text-black outline-none transition placeholder:text-black/50 focus:border-black focus:ring-2 focus:ring-black/10"
                    placeholder="Search name or barcode"
                  />
                </label>
              </div>

              {notice ? (
                <div className="mt-5">
                  <AppNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
                    {notice.text}
                  </AppNotice>
                </div>
              ) : null}

              {filtered.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-black bg-white px-6 py-14 text-center">
                  <h4 className="text-lg font-bold text-black">{search ? 'No matches found' : 'No groups yet'}</h4>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-black">
                    {search ? 'Try a different name or barcode.' : 'Scan a batch to create the first group.'}
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {filtered.map((group) => {
                    const open = !!expanded[group.id];
                    return (
                      <article key={group.id} className="overflow-hidden rounded-2xl border border-black bg-white">
                        <button
                          onClick={() => setExpanded((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                        >
                          <div>
                            <h4 className="font-semibold text-black">{group.name}</h4>
                            <p className="mt-1 font-mono text-xs text-black/70">
                              {group.count} barcode{group.count === 1 ? '' : 's'}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-black">{open ? 'Collapse' : 'Expand'}</span>
                        </button>
                        {open ? (
                          <div className="border-t border-black">
                            {group.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex flex-col gap-3 border-b border-black px-5 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div>
                                  <p className="font-mono text-sm text-black">{item.barcode}</p>
                                  {item.scannedAt ? (
                                    <p className="mt-1 text-xs text-black/70">
                                      Scanned {new Date(item.scannedAt).toLocaleString()}
                                    </p>
                                  ) : null}
                                  {item.notes ? <p className="mt-1 text-xs text-black/70">{item.notes}</p> : null}
                                </div>
                                <button
                                  onClick={() => {
                                    void removeItem(session, item.id).then((result) => {
                                      setGroups(result.groups);
                                      setNames(result.names);
                                      setNotice({ tone: 'success', text: 'Barcode removed.' });
                                    });
                                  }}
                                  className="h-10 rounded-lg border border-black px-3 text-sm font-semibold text-black hover:bg-black hover:text-white"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {session && scanOpen ? (
        <BulkScanModal
          names={names}
          onClose={() => setScanOpen(false)}
          onCreateName={async (name) => {
            const result = await createName(session, name);
            setNames(result.names);
          }}
          onSubmit={async (payload) => {
            const result = await bulkScan(session, payload);
            setGroups(result.groups);
            setNames(result.names);
            setNotice({
              tone: 'success',
              text: `Batch saved · +${result.added} / -${result.removed}${result.moved ? ` / moved ${result.moved}` : ''}`,
            });
          }}
        />
      ) : null}
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
