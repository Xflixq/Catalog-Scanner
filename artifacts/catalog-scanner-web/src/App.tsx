import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import DtmLogo from '@assets/DTM_Logo_1786368092753.png';
import NotFound from '@/pages/not-found';
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

function sanitizeBarcode(value: string) {
  return value.replace(/[^\dA-Za-z-]/g, '');
}

function AppNotice({ tone, children, onDismiss }: { tone: 'success' | 'error' | 'info'; children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-black bg-white px-4 py-3 text-sm text-black" role="status" data-testid={`status-${tone}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss ? <button onClick={onDismiss} className="rounded-md border border-black px-2 py-1 text-xs font-semibold text-black transition hover:bg-black hover:text-white" aria-label="Dismiss message" data-testid="button-dismiss-notice">Dismiss</button> : null}
    </div>
  );
}

function Modal({ title, label, onClose, children, wide = false }: { title: string; label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" data-testid="modal">
      <div className={`catalog-enter max-h-[94dvh] w-full overflow-y-auto rounded-t-[1.25rem] border border-black bg-white shadow-[0_24px_60px_rgba(0,0,0,.2)] sm:rounded-[1.25rem] ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-start justify-between border-b border-black px-5 py-5 sm:px-7">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-black">{label}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-.03em] text-black">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-md border border-black px-3 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white" aria-label="Close dialog" data-testid="button-close-modal">Close</button>
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
      <div className="rounded-xl border border-black bg-white px-4 py-3 text-sm leading-6 text-black">
        {initial ? 'Update the product details below.' : 'Enter a barcode and product name.'}
      </div>
      {duplicate ? <AppNotice tone="error">That barcode is already listed{duplicate !== barcode ? ` as ${duplicate}` : ''}. Use a different barcode.</AppNotice> : null}
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-black">Barcode <span className="font-normal text-black">required</span></span>
        <input autoFocus={!initial} inputMode="numeric" value={barcode} onChange={(e) => setBarcode(sanitizeBarcode(e.target.value))} className={`h-12 w-full rounded-xl border bg-white px-3 font-mono text-[15px] text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 ${touched && !validBarcode ? 'border-black' : 'border-black/40'}`} placeholder="Scan or type barcode" data-testid="input-product-barcode" />
        {touched && !validBarcode ? <span className="mt-1.5 block text-xs text-black">Enter at least 4 characters.</span> : null}
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-black">Product name <span className="font-normal text-black">required</span></span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`h-12 w-full rounded-xl border bg-white px-3 text-[15px] text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 ${touched && !validName ? 'border-black' : 'border-black/40'}`} placeholder="Enter the product name" data-testid="input-product-name" />
        {touched && !validName ? <span className="mt-1.5 block text-xs text-black">A product name is required.</span> : null}
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-black">Notes <span className="font-normal text-black">optional</span></span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-black/40 bg-white px-3 py-3 text-[15px] text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10" placeholder="Enter notes" data-testid="input-product-notes" />
      </label>
      <div className="flex flex-col-reverse gap-3 border-t border-black pt-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="h-12 rounded-xl border border-black px-5 text-sm font-semibold text-black transition hover:bg-black hover:text-white" data-testid="button-cancel-product">Cancel</button>
        <button type="submit" className="inline-flex h-12 items-center justify-center rounded-xl bg-black px-6 text-sm font-bold text-white transition hover:bg-white hover:text-black hover:ring-1 hover:ring-black disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-save-product">{initial ? 'Save changes' : 'Add product'}</button>
      </div>
    </form>
  );
}

function Scanner({ onDetected, onClose }: { onDetected: (barcode: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const detectedRef = useRef(false);
  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
        setCameraError('Camera access is not available. Type the barcode instead.');
        return;
      }

      try {
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result, error) => {
            if (!active || detectedRef.current) return;

            if (result) {
              const value = sanitizeBarcode(result.getText());
              if (value.length >= 4) {
                detectedRef.current = true;
                controlsRef.current?.stop();
                onDetected(value);
              }
              return;
            }

            if (error && error.name !== 'NotFoundException' && error.name !== 'ChecksumException') {
              setCameraError('The scanner could not read that code. Try again or use manual entry.');
            }
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
      detectedRef.current = false;
      controlsRef.current?.stop();
    };
  }, [onDetected]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = sanitizeBarcode(manual.trim());
    if (value.length >= 4) onDetected(value);
  }

  return (
    <Modal title="Scan barcode" label="Scanner" onClose={onClose}>
      <div className="overflow-hidden rounded-2xl border border-black bg-white">
        <div className="relative aspect-[1.45] overflow-hidden bg-black">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover opacity-90" data-testid="video-scanner" />
          <div className="absolute inset-x-[18%] top-1/2 h-24 -translate-y-1/2 border-2 border-white">
            <div className="scan-line absolute inset-x-3 top-1/2 h-px bg-white/90" />
          </div>
          <div className="absolute bottom-3 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[.16em] text-white">Center the barcode in the frame</div>
        </div>
        {cameraError ? <p className="border-t border-black px-4 py-3 text-xs leading-5 text-black">{cameraError}</p> : null}
      </div>
      <p className="my-4 text-sm text-black">Or enter the barcode below.</p>
      <form onSubmit={submit} className="flex gap-2" data-testid="form-manual-barcode">
        <input autoFocus inputMode="numeric" value={manual} onChange={(e) => setManual(sanitizeBarcode(e.target.value))} className="h-12 min-w-0 flex-1 rounded-xl border border-black/40 bg-white px-3 font-mono text-[15px] text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10" placeholder="e.g. 012345678905" data-testid="input-manual-barcode" />
        <button type="submit" className="h-12 rounded-xl bg-black px-4 text-sm font-bold text-white transition hover:bg-white hover:text-black hover:ring-1 hover:ring-black disabled:opacity-50" disabled={manual.trim().length < 4} data-testid="button-use-barcode">Use barcode</button>
      </form>
      <p className="mt-4 text-xs leading-5 text-black">Scanning stays on this device.</p>
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
    <Modal title="Add multiple products" label="Bulk entry" onClose={onClose} wide>
      {result ? <div className="space-y-5">
        <AppNotice tone={result.added ? 'success' : 'info'}>{result.added ? `${result.added} product${result.added === 1 ? '' : 's'} added.` : 'No new products were added.'} {result.skipped ? `${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped.` : ''} {result.invalid ? `${result.invalid} line${result.invalid === 1 ? '' : 's'} need a barcode and name.` : ''}</AppNotice>
        <button onClick={onClose} className="h-12 w-full rounded-xl bg-black text-sm font-bold text-white" data-testid="button-finish-bulk">Done</button>
      </div> : <form onSubmit={submit} className="space-y-5" data-testid="form-bulk">
        <div className="grid gap-4 rounded-xl border border-black bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div><p className="text-sm font-bold text-black">One product per line</p><p className="mt-1 text-xs leading-5 text-black"><span className="font-mono">barcode | name</span>. Notes can be added later.</p></div>
          <div className="font-mono text-[10px] text-black">{products.length} current entries</div>
        </div>
        <textarea autoFocus value={value} onChange={(e) => setValue(e.target.value)} rows={9} className="w-full resize-y rounded-xl border border-black/40 bg-white px-4 py-3 font-mono text-sm leading-7 text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10" placeholder={'012345678905 | Bluebird Cotton Towels\n4006381333931 | Morrow Graphite Pencil'} data-testid="textarea-bulk-products" />
        <div className="flex flex-col-reverse gap-3 border-t border-black pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="h-12 rounded-xl border border-black px-5 text-sm font-semibold text-black" data-testid="button-cancel-bulk">Cancel</button><button type="submit" disabled={!value.trim()} className="inline-flex h-12 items-center justify-center rounded-xl bg-black px-6 text-sm font-bold text-white disabled:opacity-45" data-testid="button-import-bulk">Add products</button></div>
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

  function openAdd(barcode = '') {
    setPendingBarcode(barcode);
    setDuplicate(undefined);
    setModal('add');
  }

  function saveProduct(values: Pick<Product, 'barcode' | 'name' | 'notes'>) {
    const existing = products.find((product) => product.barcode === values.barcode && product.id !== editing?.id);
    if (existing) {
      setDuplicate(existing.name);
      return;
    }

    const now = new Date().toISOString();
    const next = editing ? products.map((product) => product.id === editing.id ? { ...product, ...values, updatedAt: now } : product) : [{ id: makeId(), ...values, createdAt: now, updatedAt: now }, ...products];

    setProducts(next);
    writeProducts(next);
    setModal(null);
    setEditing(undefined);
    setDuplicate(undefined);
    setNotice({ tone: 'success', text: editing ? 'Product details saved.' : 'Product added.' });
  }

  function deleteProduct(product: Product) {
    if (!window.confirm(`Remove ${product.name} from the catalog?`)) return;
    const next = products.filter((item) => item.id !== product.id);
    setProducts(next);
    writeProducts(next);
    setNotice({ tone: 'success', text: 'Product removed.' });
  }

  function importRows(rows: Array<{ barcode: string; name: string }>) {
    let added = 0;
    let skipped = 0;
    let invalid = 0;
    const next = [...products];

    rows.forEach((row) => {
      if (row.barcode.length < 4 || !row.name) {
        invalid++;
        return;
      }

      if (next.some((product) => product.barcode === row.barcode)) {
        skipped++;
        return;
      }

      const now = new Date().toISOString();
      next.unshift({ id: makeId(), barcode: row.barcode, name: row.name, notes: '', createdAt: now, updatedAt: now });
      added++;
    });

    setProducts(next);
    writeProducts(next);
    return { added, skipped, invalid };
  }

  function exportCatalog() {
    const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `catalog-scanner-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({ tone: 'success', text: 'Catalog export downloaded.' });
    setMenuOpen(false);
  }

  function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(String(reader.result)) as Product[];
        const rows = incoming.filter((item) => item?.barcode && item?.name).map((item) => ({ barcode: item.barcode, name: item.name }));
        const result = importRows(rows);
        setNotice({ tone: result.added ? 'success' : 'info', text: `${result.added} product${result.added === 1 ? '' : 's'} imported${result.skipped ? `, ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped` : ''}.` });
      } catch {
        setNotice({ tone: 'error', text: 'That file could not be read. Choose a JSON export.' });
      }
    };

    reader.readAsText(file);
    event.target.value = '';
    setMenuOpen(false);
  }

  const closeModal = () => {
    setModal(null);
    setEditing(undefined);
    setDuplicate(undefined);
  };

  return (
    <div className="catalog-shell min-h-[100dvh]">
      <header className="border-b border-black bg-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <img src={DtmLogo} alt="DTM Fabrications" className="h-10 w-auto" />
            <h1 className="text-lg font-bold tracking-[-.04em] text-black">DTM Fabrications</h1>
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((open) => !open)} className="flex h-11 items-center gap-2 rounded-xl border border-black bg-white px-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white" aria-expanded={menuOpen} data-testid="button-catalog-menu">Menu</button>
            {menuOpen ? <div className="absolute right-0 top-14 z-10 w-56 rounded-xl border border-black bg-white p-1.5 shadow-[0_14px_35px_rgba(0,0,0,.14)]">
              <button onClick={exportCatalog} className="flex h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-black hover:bg-black hover:text-white" data-testid="button-export-catalog">Export JSON</button>
              <label className="flex h-11 w-full cursor-pointer items-center rounded-lg px-3 text-sm font-semibold text-black hover:bg-black hover:text-white" data-testid="label-import-catalog">Import JSON<input type="file" accept="application/json,.json" onChange={importFile} className="sr-only" data-testid="input-import-catalog" /></label>
              
            </div> : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 pb-12 pt-8 sm:px-8 sm:pt-12 lg:px-10">
        <section className="catalog-enter grid gap-8 border-b border-black pb-8 lg:grid-cols-[1fr_1.08fr] lg:items-end">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[.22em] text-black">Instructions</p>
            <h2 className="mt-4 max-w-[580px] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[.96] tracking-[-.07em] text-black">Scan Items<br />Select Name</h2>
            <p className="mt-5 max-w-[470px] text-base leading-7 text-black">Use the scanner, or type the barcode and product name below.</p>
          </div>
          <div className="rounded-[1.5rem] border border-black bg-white p-6 sm:p-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.19em] text-black">Choose an action</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => setModal('scan')} className="flex min-h-[58px] flex-1 items-center justify-center rounded-xl bg-black px-5 text-sm font-bold text-white transition hover:bg-white hover:text-black hover:ring-1 hover:ring-black" data-testid="button-scan-barcode">Scan barcode</button>
              <button onClick={() => openAdd()} className="flex min-h-[58px] items-center justify-center rounded-xl border border-black bg-white px-5 text-sm font-bold text-black transition hover:bg-black hover:text-white" data-testid="button-add-product">Add manually</button>
            </div>
            <button onClick={() => setModal('bulk')} className="mt-4 text-sm font-semibold text-black underline underline-offset-4" data-testid="button-add-bulk">Add several at once</button>
          </div>
        </section>
        <section className="catalog-enter catalog-stagger-1 mt-12" aria-labelledby="catalog-heading">
          <div className="flex flex-col gap-4 border-b border-black pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-black">Products</p>
              <h3 id="catalog-heading" className="mt-1 text-2xl font-bold tracking-[-.04em] text-black" data-testid="text-catalog-heading">Catalog {products.length > 0 ? <span className="font-mono text-base font-normal text-black">/ {products.length}</span> : null}</h3>
            </div>
            <label className="block w-full sm:w-72">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[.16em] text-black">Search</span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 w-full rounded-xl border border-black bg-white px-3 text-sm text-black outline-none transition placeholder:text-black/50 focus:border-black focus:ring-2 focus:ring-black/10" placeholder="Search name or barcode" aria-label="Search catalog" data-testid="input-search-catalog" />
            </label>
          </div>
          {notice ? <div className="mt-5"><AppNotice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</AppNotice></div> : null}
          {isLoading ? <div className="mt-6 space-y-3" data-testid="loading-catalog">{[1, 2, 3].map((item) => <div key={item} className="h-[78px] animate-pulse rounded-xl border border-black bg-white" />)}</div> : filtered.length === 0 ? <div className="catalog-enter mt-6 rounded-2xl border border-dashed border-black bg-white px-6 py-14 text-center" data-testid="empty-catalog"><h4 className="text-lg font-bold text-black">{search ? 'No matches found' : 'No products yet'}</h4><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-black">{search ? 'Try a different name or barcode.' : 'Scan a barcode or add one manually.'}</p>{!search ? <button onClick={() => openAdd()} className="mt-6 inline-flex h-11 items-center rounded-xl bg-black px-5 text-sm font-bold text-white" data-testid="button-empty-add">Add first product</button> : null}</div> : <div className="mt-6 overflow-hidden rounded-2xl border border-black bg-white" data-testid="product-list"><div className="hidden grid-cols-[1fr_180px_132px] gap-4 border-b border-black px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-black sm:grid"><span>Product</span><span>Barcode</span><span>Actions</span></div>{filtered.map((product, index) => <article key={product.id} className={`catalog-enter catalog-stagger-${Math.min(index + 1, 3)} group grid gap-3 border-b border-black px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_180px_132px] sm:items-center sm:gap-4 sm:px-5`} data-testid={`card-product-${product.id}`}><div className="min-w-0"><h4 className="truncate font-semibold text-black" data-testid={`text-product-name-${product.id}`}>{product.name}</h4>{product.notes ? <p className="mt-0.5 truncate text-xs text-black">{product.notes}</p> : null}</div><p className="font-mono text-xs text-black" data-testid={`text-product-barcode-${product.id}`}>{product.barcode}</p><div className="flex items-center gap-2 sm:justify-end"><button onClick={() => { setEditing(product); setDuplicate(undefined); setModal('edit'); }} className="h-10 rounded-lg border border-black px-3 text-sm font-semibold text-black hover:bg-black hover:text-white" aria-label={`Edit ${product.name}`} data-testid={`button-edit-product-${product.id}`}>Edit</button><button onClick={() => deleteProduct(product)} className="h-10 rounded-lg border border-black px-3 text-sm font-semibold text-black hover:bg-black hover:text-white" aria-label={`Delete ${product.name}`} data-testid={`button-delete-product-${product.id}`}>Delete</button></div></article>)}</div>}
          <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[.14em] text-black" data-testid="text-local-storage-note">Stored locally</p>
        </section>
      </main>
      <footer className="mx-auto flex max-w-[1180px] items-center justify-between px-5 pb-8 text-xs text-black sm:px-8 lg:px-10"><span>Stored locally in this browser</span></footer>
      {modal === 'scan' ? <Scanner onClose={closeModal} onDetected={(barcode) => { closeModal(); openAdd(barcode); }} /> : null}
      {(modal === 'add' || modal === 'edit') ? <Modal title={modal === 'edit' ? 'Edit product' : 'Add a product'} label={modal === 'edit' ? 'Product details' : pendingBarcode ? 'Barcode captured' : 'New entry'} onClose={closeModal}><ProductForm initial={editing} initialBarcode={pendingBarcode || undefined} onSave={saveProduct} onClose={closeModal} duplicate={duplicate} /></Modal> : null}
      {modal === 'bulk' ? <BulkModal products={products} onClose={closeModal} onImport={importRows} /> : null}
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