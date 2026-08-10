import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Barcode, Check, ChevronDown, Download, FileUp, FolderOpen, Info, Menu, PackagePlus, Pencil, Plus, Search, ScanLine, Trash2, Upload, X } from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

type Product = {
  id: string;
  barcode: string;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = 'catalog-scanner.products.v1';
const queryClient = new QueryClient();
const seedProducts: Product[] = [
  { id: 'seed-1', barcode: '085000123456', name: 'Hearth & Field — Sea Salt', notes: 'Kitchen shelf', createdAt: '2024-04-18T10:20:00.000Z', updatedAt: '2024-04-18T10:20:00.000Z' },
  { id: 'seed-2', barcode: '012345678905', name: 'Bluebird Cotton Towels', notes: '', createdAt: '2024-04-11T10:20:00.000Z', updatedAt: '2024-04-11T10:20:00.000Z' },
  { id: 'seed-3', barcode: '4006381333931', name: 'Morrow Graphite Pencil', notes: 'Desk drawer', createdAt: '2024-03-27T10:20:00.000Z', updatedAt: '2024-03-27T10:20:00.000Z' },
];

function readProducts(): Product[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as Product[];
  } catch {
    // A damaged local value should not prevent the catalog from opening.
  }
  return seedProducts;
}

function writeProducts(products: Product[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));
}

function AppNotice({ tone, children, onDismiss }: { tone: 'success' | 'error' | 'info'; children: ReactNode; onDismiss?: () => void }) {
  const colors = { success: 'border-[#a8c8ba] bg-[#e8f2eb] text-[#255d4e]', error: 'border-[#dfaaa3] bg-[#fae9e6] text-[#8b332b]', info: 'border-[#b6cad0] bg-[#e7f0f2] text-[#264d57]' };
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${colors[tone]}`} role="status" data-testid={`status-${tone}`}>
      {tone === 'success' ? <Check size={18} className="mt-0.5 shrink-0" /> : <Info size={18} className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && <button onClick={onDismiss} className="rounded-md p-1 opacity-65 hover:opacity-100" aria-label="Dismiss message" data-testid="button-dismiss-notice"><X size={16} /></button>}
    </div>
  );
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-[#142b32]/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" data-testid="modal">
      <div className={`catalog-enter max-h-[94dvh] w-full overflow-y-auto rounded-t-[1.5rem] border border-[#d9cdc0] bg-[#fdfaf5] shadow-[0_24px_80px_rgba(20,43,50,.22)] sm:rounded-[1.5rem] ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-start justify-between border-b border-[#e2d8cd] px-5 py-5 sm:px-7">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#b05f3c]">{eyebrow}</p>
            <h2 className="mt-1 font-sans text-2xl font-semibold tracking-[-.03em] text-[#142b32]">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-[#587077] transition hover:bg-[#eee6dc] hover:text-[#142b32]" aria-label="Close dialog" data-testid="button-close-modal"><X size={21} /></button>
        </div>
        <div className="px-5 py-6 sm:px-7">{children}</div>
      </div>
    </div>
  );
}

function ProductForm({ initial, initialBarcode, onSave, onClose, duplicate }: { initial?: Product; initialBarcode?: string; onSave: (values: Pick<Product, 'barcode' | 'name' | 'notes'>) => void; onClose: () => void; duplicate?: string }) {
  const [barcode, setBarcode] = useState(initial?.barcode ?? initialBarcode ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [touched, setTouched] = useState(false);
  const validBarcode = barcode.trim().length >= 4;
  const validName = name.trim().length > 0;
  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!validBarcode || !validName) return;
    onSave({ barcode: barcode.trim(), name: name.trim(), notes: notes.trim() });
  }
  return (
    <form onSubmit={submit} className="space-y-5" data-testid="form-product">
      <div className="rounded-xl border border-[#d8e2df] bg-[#f1f6f4] px-4 py-3 text-sm leading-6 text-[#34545a]">
        {initial ? 'Update the details for this catalog entry.' : 'Give this item a name so it is easy to find later.'}
      </div>
      {duplicate && <AppNotice tone="error">That barcode is already in the catalog{duplicate !== barcode ? ` as “${duplicate}”` : ''}. Use a different barcode.</AppNotice>}
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#26434a]">Barcode <span className="font-normal text-[#9a6a57]">required</span></span>
        <div className="relative">
          <Barcode size={18} className="pointer-events-none absolute left-3 top-3.5 text-[#789097]" />
          <input autoFocus={!initial} inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/[^\dA-Za-z-]/g, ''))} className={`h-12 w-full rounded-xl border bg-[#fffdf9] pl-10 pr-3 font-mono text-[15px] outline-none transition focus:border-[#b05f3c] focus:ring-2 focus:ring-[#b05f3c]/15 ${touched && !validBarcode ? 'border-[#bb5146]' : 'border-[#cfc4b8]'}`} placeholder="Scan or type barcode" data-testid="input-product-barcode" />
        </div>
        {touched && !validBarcode && <span className="mt-1.5 block text-xs text-[#a33e34]">Enter at least 4 characters.</span>}
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#26434a]">Product name <span className="font-normal text-[#9a6a57]">required</span></span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`h-12 w-full rounded-xl border bg-[#fffdf9] px-3 text-[15px] outline-none transition focus:border-[#b05f3c] focus:ring-2 focus:ring-[#b05f3c]/15 ${touched && !validName ? 'border-[#bb5146]' : 'border-[#cfc4b8]'}`} placeholder="What should this be called?" data-testid="input-product-name" />
        {touched && !validName && <span className="mt-1.5 block text-xs text-[#a33e34]">A product name is needed.</span>}
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-[#26434a]">Notes <span className="font-normal text-[#779097]">optional</span></span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-[#cfc4b8] bg-[#fffdf9] px-3 py-3 text-[15px] outline-none transition focus:border-[#b05f3c] focus:ring-2 focus:ring-[#b05f3c]/15" placeholder="A shelf, collection, or other short reminder" data-testid="input-product-notes" />
      </label>
      <div className="flex flex-col-reverse gap-3 border-t border-[#e2d8cd] pt-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="h-12 rounded-xl px-5 text-sm font-semibold text-[#526e74] transition hover:bg-[#eee6dc]" data-testid="button-cancel-product">Cancel</button>
        <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#142b32] px-6 text-sm font-bold text-[#fdfaf5] shadow-[0_5px_0_#0c1d21] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-save-product"><Check size={17} /> {initial ? 'Save changes' : 'Add to catalog'}</button>
      </div>
    </form>
  );
}

function Scanner({ onDetected, onClose }: { onDetected: (barcode: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [detectorAvailable, setDetectorAvailable] = useState(false);
  useEffect(() => {
    const Detector = (window as unknown as { BarcodeDetector?: new (options?: { formats: string[] }) => { detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    setDetectorAvailable(Boolean(Detector));
    let active = true;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
        setCameraError('Camera access is not available here. Use the manual entry below.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (Detector) {
          const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'] });
          const tick = async () => {
            if (!active || !videoRef.current) return;
            try {
              const found = await detector.detect(videoRef.current);
              if (found[0]?.rawValue) { onDetected(found[0].rawValue); return; }
            } catch { /* keep scanning */ }
            window.setTimeout(tick, 350);
          };
          tick();
        }
      } catch {
        setCameraError('Camera permission was not granted. You can still enter the barcode by hand.');
      }
    }
    start();
    return () => { active = false; streamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, [onDetected]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (manual.trim().length >= 4) onDetected(manual.trim());
  }
  return (
    <Modal title="Scan a barcode" eyebrow="Quick capture" onClose={onClose}>
      <div className="overflow-hidden rounded-2xl bg-[#142b32]">
        <div className="relative aspect-[1.55] overflow-hidden">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover opacity-80" data-testid="video-scanner" />
          <div className="absolute inset-x-[15%] top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-[#e58b5d] shadow-[0_0_0_999px_rgba(20,43,50,.35)]">
            <div className="scan-line absolute inset-x-2 top-1/2 h-px bg-[#f4b28f] shadow-[0_0_10px_#e58b5d]" />
          </div>
          <div className="absolute bottom-3 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[.16em] text-[#f6d3c3]">{detectorAvailable ? 'Point at a barcode' : 'Manual mode recommended'}</div>
        </div>
        {cameraError && <p className="px-4 py-3 text-xs leading-5 text-[#f4c6b3]">{cameraError}</p>}
      </div>
      <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#8a9b9d]"><span className="h-px flex-1 bg-[#e2d8cd]" />or enter it<span className="h-px flex-1 bg-[#e2d8cd]" /></div>
      <form onSubmit={submit} className="flex gap-2" data-testid="form-manual-barcode">
        <input autoFocus inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value.replace(/[^\dA-Za-z-]/g, ''))} className="h-12 min-w-0 flex-1 rounded-xl border border-[#cfc4b8] bg-[#fffdf9] px-3 font-mono text-[15px] outline-none focus:border-[#b05f3c] focus:ring-2 focus:ring-[#b05f3c]/15" placeholder="e.g. 012345678905" data-testid="input-manual-barcode" />
        <button type="submit" className="h-12 rounded-xl bg-[#b05f3c] px-4 text-sm font-bold text-[#fffaf4] transition hover:bg-[#984c2e] disabled:opacity-50" disabled={manual.trim().length < 4} data-testid="button-use-barcode">Use barcode</button>
      </form>
      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#6d8185]"><Info size={15} className="mt-0.5 shrink-0" /> Scanning happens on this device. Nothing is uploaded.</p>
    </Modal>
  );
}

function BulkModal({ onImport, onClose, products }: { onImport: (rows: Array<{ barcode: string; name: string }>) => { added: number; skipped: number; invalid: number }; onClose: () => void; products: Product[] }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ added: number; skipped: number; invalid: number } | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const rows = value.split('\n').map((line) => line.split('|').map((part) => part.trim())).filter(([barcode, name]) => barcode && name).map(([barcode, name]) => ({ barcode, name }));
    setResult(onImport(rows));
  }
  return (
    <Modal title="Add a batch" eyebrow="Bulk entry" onClose={onClose} wide>
      {result ? <div className="space-y-5">
        <AppNotice tone={result.added ? 'success' : 'info'}>{result.added ? `${result.added} product${result.added === 1 ? '' : 's'} added to your catalog.` : 'No new products were added.'} {result.skipped ? `${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped.` : ''} {result.invalid ? `${result.invalid} line${result.invalid === 1 ? '' : 's'} need${result.invalid === 1 ? 's' : ''} a barcode and name.` : ''}</AppNotice>
        <button onClick={onClose} className="h-12 w-full rounded-xl bg-[#142b32] text-sm font-bold text-[#fdfaf5]" data-testid="button-finish-bulk">Done</button>
      </div> : <form onSubmit={submit} className="space-y-5" data-testid="form-bulk">
        <div className="grid gap-4 rounded-xl border border-[#d8e2df] bg-[#f1f6f4] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div><p className="text-sm font-bold text-[#26434a]">One product per line</p><p className="mt-1 text-xs leading-5 text-[#60777d]"><span className="font-mono">barcode | name</span> — notes can be added later.</p></div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-[#617b80]"><FileUp size={17} /> {products.length} current entries</div>
        </div>
        <textarea autoFocus value={value} onChange={(e) => setValue(e.target.value)} rows={9} className="w-full resize-y rounded-xl border border-[#cfc4b8] bg-[#fffdf9] px-4 py-3 font-mono text-sm leading-7 outline-none focus:border-[#b05f3c] focus:ring-2 focus:ring-[#b05f3c]/15" placeholder={'012345678905 | Bluebird Cotton Towels\n4006381333931 | Morrow Graphite Pencil'} data-testid="textarea-bulk-products" />
        <div className="flex flex-col-reverse gap-3 border-t border-[#e2d8cd] pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="h-12 rounded-xl px-5 text-sm font-semibold text-[#526e74]" data-testid="button-cancel-bulk">Cancel</button><button type="submit" disabled={!value.trim()} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#142b32] px-6 text-sm font-bold text-[#fdfaf5] disabled:opacity-45" data-testid="button-import-bulk"><Upload size={17} /> Add products</button></div>
      </form>}
    </Modal>
  );
}

function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'add' | 'scan' | 'bulk' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Product | undefined>();
  const [pendingBarcode, setPendingBarcode] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [duplicate, setDuplicate] = useState<string | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { setProducts(readProducts()); setIsLoading(false); }, 180);
    return () => window.clearTimeout(timer);
  }, []);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return products;
    return products.filter((product) => `${product.name} ${product.barcode} ${product.notes}`.toLocaleLowerCase().includes(term));
  }, [products, search]);

  function openAdd(barcode = '') { setPendingBarcode(barcode); setDuplicate(undefined); setModal('add'); }
  function saveProduct(values: Pick<Product, 'barcode' | 'name' | 'notes'>) {
    const existing = products.find((product) => product.barcode === values.barcode && product.id !== editing?.id);
    if (existing) { setDuplicate(existing.name); return; }
    const now = new Date().toISOString();
    const next = editing ? products.map((product) => product.id === editing.id ? { ...product, ...values, updatedAt: now } : product) : [{ id: makeId(), ...values, createdAt: now, updatedAt: now }, ...products];
    setProducts(next); writeProducts(next); setModal(null); setEditing(undefined); setDuplicate(undefined);
    setNotice({ tone: 'success', text: editing ? 'Product details saved.' : 'Product added to your catalog.' });
  }
  function deleteProduct(product: Product) {
    if (!window.confirm(`Remove “${product.name}” from your catalog?`)) return;
    const next = products.filter((item) => item.id !== product.id); setProducts(next); writeProducts(next);
    setNotice({ tone: 'success', text: 'Product removed.' });
  }
  function importRows(rows: Array<{ barcode: string; name: string }>) {
    let added = 0; let skipped = 0; let invalid = 0;
    const next = [...products];
    rows.forEach((row) => {
      if (row.barcode.length < 4 || !row.name) { invalid++; return; }
      if (next.some((product) => product.barcode === row.barcode)) { skipped++; return; }
      const now = new Date().toISOString(); next.unshift({ id: makeId(), barcode: row.barcode, name: row.name, notes: '', createdAt: now, updatedAt: now }); added++;
    });
    setProducts(next); writeProducts(next);
    return { added, skipped, invalid };
  }
  function exportCatalog() {
    const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `catalog-scanner-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
    setNotice({ tone: 'success', text: 'Catalog export downloaded.' }); setMenuOpen(false);
  }
  function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(String(reader.result)) as Product[];
        const rows = incoming.filter((item) => item?.barcode && item?.name).map((item) => ({ barcode: item.barcode, name: item.name }));
        const result = importRows(rows);
        setNotice({ tone: result.added ? 'success' : 'info', text: `${result.added} product${result.added === 1 ? '' : 's'} imported${result.skipped ? `, ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped` : ''}.` });
      } catch { setNotice({ tone: 'error', text: 'That file could not be read. Choose a Catalog Scanner JSON export.' }); }
    };
    reader.readAsText(file); event.target.value = ''; setMenuOpen(false);
  }
  const closeModal = () => { setModal(null); setEditing(undefined); setDuplicate(undefined); };

  return (
    <div className="catalog-shell catalog-grain min-h-[100dvh]">
      <header className="border-b border-[#d9cdc0] bg-[#fdfaf5]/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#142b32] text-[#f4b28f] shadow-[3px_3px_0_#c9b7a8]"><ScanLine size={22} strokeWidth={2.2} /></div>
            <div><p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#b05f3c]">Private catalog</p><h1 className="text-lg font-bold tracking-[-.04em] text-[#142b32]">Catalog Scanner</h1></div>
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((open) => !open)} className="flex h-11 items-center gap-2 rounded-xl border border-[#d5c9bd] bg-[#fffdf9] px-3 text-sm font-semibold text-[#36545a] transition hover:border-[#a99586]" aria-expanded={menuOpen} data-testid="button-catalog-menu"><Menu size={18} /><span className="hidden sm:inline">Catalog tools</span><ChevronDown size={15} className={`transition ${menuOpen ? 'rotate-180' : ''}`} /></button>
            {menuOpen && <div className="absolute right-0 top-14 z-10 w-56 rounded-xl border border-[#d9cdc0] bg-[#fffdf9] p-1.5 shadow-[0_14px_35px_rgba(20,43,50,.14)]">
              <button onClick={exportCatalog} className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-[#34545a] hover:bg-[#f2ebe3]" data-testid="button-export-catalog"><Download size={17} /> Export catalog</button>
              <label className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-semibold text-[#34545a] hover:bg-[#f2ebe3]" data-testid="label-import-catalog"><Upload size={17} /> Import JSON<input type="file" accept="application/json,.json" onChange={importFile} className="sr-only" data-testid="input-import-catalog" /></label>
              <p className="px-3 pb-2 pt-1 text-[10px] leading-4 text-[#819094]">Everything stays in this browser.</p>
            </div>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 pb-12 pt-8 sm:px-8 sm:pt-12 lg:px-10">
        <section className="catalog-enter grid gap-8 lg:grid-cols-[1fr_1.08fr] lg:items-end">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[.22em] text-[#b05f3c]">At the counter · {products.length} entries</p>
            <h2 className="mt-4 max-w-[580px] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[.96] tracking-[-.07em] text-[#142b32]">Name it.<br /><span className="text-[#b05f3c]">Move on.</span></h2>
            <p className="mt-5 max-w-[470px] text-base leading-7 text-[#526b71]">A quiet, local-first place for the things worth remembering. Scan a code, add a name, keep your hands moving.</p>
          </div>
          <div className="relative overflow-hidden rounded-[1.5rem] bg-[#dbe6e0] p-6 sm:p-8">
            <div className="absolute -right-8 -top-12 h-40 w-40 rounded-full border-[22px] border-[#c4d7ce]" />
            <div className="absolute -bottom-16 -left-10 h-36 w-36 rounded-full border-[18px] border-[#c4d7ce]" />
            <div className="relative">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.19em] text-[#527873]">Ready when you are</p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => setModal('scan')} className="flex min-h-[58px] flex-1 items-center justify-center gap-3 rounded-xl bg-[#b05f3c] px-5 text-sm font-bold text-[#fffaf4] shadow-[0_5px_0_#86422a] transition hover:-translate-y-0.5 hover:bg-[#9d502f] active:translate-y-0 active:shadow-none" data-testid="button-scan-barcode"><ScanLine size={20} /> Scan barcode</button>
                <button onClick={() => openAdd()} className="flex min-h-[58px] items-center justify-center gap-2 rounded-xl border border-[#8baea4] bg-[#f1f6f1]/75 px-5 text-sm font-bold text-[#264d4d] transition hover:bg-[#f8fbf7]" data-testid="button-add-product"><Plus size={19} /> Add manually</button>
              </div>
              <button onClick={() => setModal('bulk')} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#35635e] underline decoration-[#93b2aa] underline-offset-4 hover:text-[#1d4745]" data-testid="button-add-bulk"><PackagePlus size={16} /> Add several at once</button>
            </div>
          </div>
        </section>
        <section className="catalog-enter catalog-stagger-1 mt-12" aria-labelledby="catalog-heading">
          <div className="flex flex-col gap-4 border-b border-[#d9cdc0] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#b05f3c]">Your shelf</p><h3 id="catalog-heading" className="mt-1 text-2xl font-bold tracking-[-.04em] text-[#142b32]" data-testid="text-catalog-heading">Catalog {products.length > 0 && <span className="font-mono text-base font-normal text-[#829093]">/ {products.length}</span>}</h3></div>
            <label className="relative block w-full sm:w-72"><Search size={18} className="pointer-events-none absolute left-3.5 top-3.5 text-[#789097]" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 w-full rounded-xl border border-[#d5c9bd] bg-[#fffdf9] pl-10 pr-3 text-sm outline-none transition placeholder:text-[#9ba7a5] focus:border-[#b05f3c] focus:ring-2 focus:ring-[#b05f3c]/15" placeholder="Search name or barcode" aria-label="Search catalog" data-testid="input-search-catalog" /></label>
          </div>
          {notice && <div className="mt-5"><AppNotice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</AppNotice></div>}
          {isLoading ? <div className="mt-6 space-y-3" data-testid="loading-catalog">{[1, 2, 3].map((item) => <div key={item} className="h-[78px] animate-pulse rounded-xl border border-[#e3d9ce] bg-[#f0e9e1]" />)}</div> : filtered.length === 0 ? <div className="catalog-enter mt-6 rounded-2xl border border-dashed border-[#cbbcaf] bg-[#faf5ee] px-6 py-14 text-center" data-testid="empty-catalog"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e5eeea] text-[#45726c]"><FolderOpen size={25} /></div><h4 className="mt-5 text-lg font-bold text-[#26434a]">{search ? 'Nothing matches that search' : 'Your catalog is ready for its first entry'}</h4><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6b7d80]">{search ? 'Try a different name or barcode.' : 'Scan a barcode or add a product by hand. It will stay right here on this tablet.'}</p>{!search && <button onClick={() => openAdd()} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#142b32] px-5 text-sm font-bold text-[#fdfaf5]" data-testid="button-empty-add"><Plus size={17} /> Add first product</button>}</div> : <div className="mt-6 overflow-hidden rounded-2xl border border-[#d9cdc0] bg-[#fdfaf5] shadow-[0_5px_20px_rgba(48,54,47,.04)]" data-testid="product-list"><div className="hidden grid-cols-[1fr_180px_90px] gap-4 border-b border-[#e4dad0] bg-[#f5eee6] px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#7b8b8c] sm:grid"><span>Product</span><span>Barcode</span><span /></div>{filtered.map((product, index) => <article key={product.id} className={`catalog-enter catalog-stagger-${Math.min(index + 1, 3)} group grid gap-3 border-b border-[#e8dfd6] px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_180px_90px] sm:items-center sm:gap-4 sm:px-5`} data-testid={`card-product-${product.id}`}><div className="min-w-0"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e9ddd2] text-[#9c5739]"><Barcode size={19} /></div><div className="min-w-0"><h4 className="truncate font-semibold text-[#26434a]" data-testid={`text-product-name-${product.id}`}>{product.name}</h4>{product.notes && <p className="mt-0.5 truncate text-xs text-[#789097]">{product.notes}</p>}</div></div><p className="mt-2 pl-12 font-mono text-xs text-[#849295] sm:hidden" data-testid={`text-product-barcode-${product.id}`}>{product.barcode}</p></div><p className="hidden font-mono text-xs text-[#60777d] sm:block" data-testid={`text-product-barcode-${product.id}`}>{product.barcode}</p><div className="flex items-center justify-between gap-2 sm:justify-end"><p className="text-[11px] text-[#94a09f] sm:hidden">Added {formatDate(product.createdAt)}</p><div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"><button onClick={() => { setEditing(product); setDuplicate(undefined); setModal('edit'); }} className="flex h-10 w-10 items-center justify-center rounded-lg text-[#587077] hover:bg-[#e8f0ec] hover:text-[#35635e]" aria-label={`Edit ${product.name}`} data-testid={`button-edit-product-${product.id}`}><Pencil size={17} /></button><button onClick={() => deleteProduct(product)} className="flex h-10 w-10 items-center justify-center rounded-lg text-[#9f6f66] hover:bg-[#fae9e6] hover:text-[#a33e34]" aria-label={`Delete ${product.name}`} data-testid={`button-delete-product-${product.id}`}><Trash2 size={17} /></button></div></div></article>)}</div>}
          <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[.14em] text-[#94a09f]" data-testid="text-local-storage-note">Stored locally on this tablet · no account needed</p>
        </section>
      </main>
      <footer className="mx-auto flex max-w-[1180px] items-center justify-between px-5 pb-8 text-xs text-[#7b8b8c] sm:px-8 lg:px-10"><span>Catalog Scanner <span className="text-[#b4aaa0]">/</span> v1</span><span className="font-mono text-[10px]">LOCAL-FIRST</span></footer>
      {modal === 'scan' && <Scanner onClose={closeModal} onDetected={(barcode) => { closeModal(); openAdd(barcode); }} />}
      {(modal === 'add' || modal === 'edit') && <Modal title={modal === 'edit' ? 'Edit product' : 'Add a product'} eyebrow={modal === 'edit' ? 'Catalog entry' : pendingBarcode ? 'Barcode captured' : 'New entry'} onClose={closeModal}><ProductForm initial={editing} initialBarcode={pendingBarcode || undefined} onSave={saveProduct} onClose={closeModal} duplicate={duplicate} /></Modal>}
      {modal === 'bulk' && <BulkModal products={products} onClose={closeModal} onImport={importRows} />}
    </div>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;