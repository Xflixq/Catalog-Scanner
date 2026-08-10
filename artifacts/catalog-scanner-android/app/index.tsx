import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Product = {
  id: string;
  barcode: string;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type Notice = { tone: 'success' | 'error' | 'info'; message: string };
type FormValues = Pick<Product, 'barcode' | 'name' | 'notes'>;

const STORAGE_KEY = 'catalog-scanner.products.v1';
const sampleProducts: Product[] = [
  { id: 'seed-1', barcode: '085000123456', name: 'Hearth & Field — Sea Salt', notes: 'Kitchen shelf', createdAt: '2024-04-18T10:20:00.000Z', updatedAt: '2024-04-18T10:20:00.000Z' },
  { id: 'seed-2', barcode: '012345678905', name: 'Bluebird Cotton Towels', notes: '', createdAt: '2024-04-11T10:20:00.000Z', updatedAt: '2024-04-11T10:20:00.000Z' },
  { id: 'seed-3', barcode: '4006381333931', name: 'Morrow Graphite Pencil', notes: 'Desk drawer', createdAt: '2024-03-27T10:20:00.000Z', updatedAt: '2024-03-27T10:20:00.000Z' },
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeBarcode(value: string) {
  return value.replace(/[^0-9A-Za-z-]/g, '');
}

function AppNotice({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const colors = useColors();
  const styles = createStyles(colors);
  const icon = notice.tone === 'success' ? 'check-circle' : notice.tone === 'error' ? 'alert-circle' : 'info';
  return (
    <View style={[styles.notice, notice.tone === 'success' ? styles.noticeSuccess : notice.tone === 'error' ? styles.noticeError : styles.noticeInfo]}>
      <Feather name={icon} size={18} color={notice.tone === 'error' ? colors.destructive : colors.primary} />
      <Text style={styles.noticeText}>{notice.message}</Text>
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss message">
        <Feather name="x" size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

function ProductForm({
  initial,
  initialBarcode,
  duplicate,
  onSave,
  onClose,
}: {
  initial?: Product;
  initialBarcode?: string;
  duplicate?: string;
  onSave: (values: FormValues) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const styles = createStyles(colors);
  const [barcode, setBarcode] = useState(initial?.barcode ?? initialBarcode ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [touched, setTouched] = useState(false);
  const barcodeValid = barcode.trim().length >= 4;
  const nameValid = name.trim().length > 0;

  function submit() {
    setTouched(true);
    if (!barcodeValid || !nameValid) return;
    onSave({ barcode: barcode.trim(), name: name.trim(), notes: notes.trim() });
  }

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={styles.formContent}
      bottomOffset={72}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.formIntro}>
        <Text style={styles.formIntroTitle}>{initial ? 'Update this catalog entry.' : 'Give this item a name for next time.'}</Text>
        <Text style={styles.formIntroText}>Only a barcode and product name are needed.</Text>
      </View>
      {duplicate ? <View style={styles.inlineError}><Feather name="alert-circle" size={17} color={colors.destructive} /><Text style={styles.inlineErrorText}>That barcode is already listed as {duplicate}.</Text></View> : null}
      <Text style={styles.fieldLabel}>Barcode <Text style={styles.fieldHint}>required</Text></Text>
      <View style={[styles.inputWrap, touched && !barcodeValid ? styles.inputError : null]}>
        <MaterialCommunityIcons name="barcode" size={22} color={colors.mutedForeground} />
        <TextInput
          style={styles.inputInline}
          value={barcode}
          onChangeText={(value) => setBarcode(sanitizeBarcode(value))}
          placeholder="Scan or type barcode"
          placeholderTextColor={colors.mutedForeground}
          autoFocus={!initial}
          inputMode="numeric"
          testID="input-product-barcode"
        />
      </View>
      {touched && !barcodeValid ? <Text style={styles.validation}>Enter at least 4 characters.</Text> : null}
      <Text style={styles.fieldLabel}>Product name <Text style={styles.fieldHint}>required</Text></Text>
      <TextInput
        style={[styles.textInput, touched && !nameValid ? styles.inputError : null]}
        value={name}
        onChangeText={setName}
        placeholder="What should this be called?"
        placeholderTextColor={colors.mutedForeground}
        testID="input-product-name"
      />
      {touched && !nameValid ? <Text style={styles.validation}>A product name is needed.</Text> : null}
      <Text style={styles.fieldLabel}>Notes <Text style={styles.fieldHint}>optional</Text></Text>
      <TextInput
        style={[styles.textInput, styles.notesInput]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Shelf, collection, or short reminder"
        placeholderTextColor={colors.mutedForeground}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        testID="input-product-notes"
      />
      <View style={styles.formActions}>
        <Pressable onPress={onClose} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} testID="button-cancel-product">
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={submit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} testID="button-save-product">
          <Feather name="check" size={18} color={colors.primaryForeground} />
          <Text style={styles.primaryButtonText}>{initial ? 'Save changes' : 'Add to catalog'}</Text>
        </Pressable>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function ScannerModal({ onDetected, onClose }: { onDetected: (barcode: string) => void; onClose: () => void }) {
  const colors = useColors();
  const styles = createStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manual, setManual] = useState('');

  async function handleScan(data: string) {
    if (scanned) return;
    setScanned(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDetected(sanitizeBarcode(data));
  }

  if (!permission) {
    return <View style={styles.scanLoading}><Text style={styles.bodyText}>Preparing camera…</Text></View>;
  }

  return (
    <View style={styles.scanPanel}>
      {permission.granted ? (
        <View style={styles.cameraFrame}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'] }}
            onBarcodeScanned={scanned ? undefined : ({ data }) => void handleScan(data)}
          />
          <View style={styles.scanTarget}><View style={styles.scanLine} /></View>
          <Text style={styles.cameraHint}>Point the camera at a barcode</Text>
        </View>
      ) : (
        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}><MaterialCommunityIcons name="camera-outline" size={28} color={colors.accent} /></View>
          <Text style={styles.modalTitle}>Camera access</Text>
          <Text style={styles.bodyText}>Allow camera access to scan product barcodes directly on this tablet.</Text>
          <Pressable onPress={() => void requestPermission()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} testID="button-request-camera">
            <Feather name="camera" size={18} color={colors.primaryForeground} />
            <Text style={styles.primaryButtonText}>Allow camera</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>or type it</Text><View style={styles.orLine} /></View>
      <View style={styles.manualRow}>
        <TextInput
          style={[styles.textInput, styles.manualInput]}
          value={manual}
          onChangeText={(value) => setManual(sanitizeBarcode(value))}
          placeholder="e.g. 012345678905"
          placeholderTextColor={colors.mutedForeground}
          inputMode="numeric"
          autoFocus={!permission.granted}
          testID="input-manual-barcode"
        />
        <Pressable
          onPress={() => manual.trim().length >= 4 && onDetected(manual.trim())}
          disabled={manual.trim().length < 4}
          style={({ pressed }) => [styles.accentButton, manual.trim().length < 4 && styles.disabledButton, pressed && styles.pressed]}
          testID="button-use-barcode"
        >
          <Text style={styles.accentButtonText}>Use barcode</Text>
        </Pressable>
      </View>
      <View style={styles.scanFooter}><Feather name="shield" size={15} color={colors.mutedForeground} /><Text style={styles.caption}>Scanning stays on this device.</Text></View>
      <Pressable onPress={onClose} style={styles.closeTextButton}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
    </View>
  );
}

function BulkModal({ products, onImport, onClose }: { products: Product[]; onImport: (value: string) => Promise<{ added: number; skipped: number; invalid: number }>; onClose: () => void }) {
  const colors = useColors();
  const styles = createStyles(colors);
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ added: number; skipped: number; invalid: number } | null>(null);

  return (
    <KeyboardAwareScrollViewCompat contentContainerStyle={styles.formContent} bottomOffset={72} keyboardShouldPersistTaps="handled">
      {result ? (
        <View style={styles.resultBlock}>
          <View style={styles.resultIcon}><Feather name={result.added ? 'check' : 'info'} size={23} color={result.added ? colors.primary : colors.mutedForeground} /></View>
          <Text style={styles.modalTitle}>{result.added ? `${result.added} added` : 'Nothing new added'}</Text>
          <Text style={styles.bodyText}>{result.skipped ? `${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped. ` : ''}{result.invalid ? `${result.invalid} line${result.invalid === 1 ? '' : 's'} need a barcode and name.` : 'Your catalog is up to date.'}</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} testID="button-finish-bulk"><Text style={styles.primaryButtonText}>Done</Text></Pressable>
        </View>
      ) : (
        <>
          <View style={styles.formIntro}>
            <Text style={styles.formIntroTitle}>One product per line</Text>
            <Text style={styles.formIntroText}>Use <Text style={styles.codeText}>barcode | name</Text>. {products.length} current entries.</Text>
          </View>
          <TextInput
            style={[styles.textInput, styles.bulkInput]}
            value={value}
            onChangeText={setValue}
            placeholder={'012345678905 | Bluebird Cotton Towels\\n4006381333931 | Morrow Graphite Pencil'}
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
            autoFocus
            testID="input-bulk-products"
          />
          <View style={styles.formActions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} testID="button-cancel-bulk"><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
            <Pressable onPress={() => void onImport(value).then(setResult)} disabled={!value.trim()} style={({ pressed }) => [styles.primaryButton, !value.trim() && styles.disabledButton, pressed && styles.pressed]} testID="button-import-bulk"><Feather name="upload" size={18} color={colors.primaryForeground} /><Text style={styles.primaryButtonText}>Add products</Text></Pressable>
          </View>
        </>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

export default function CatalogHome() {
  const colors = useColors();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState<'add' | 'edit' | 'scan' | 'bulk' | null>(null);
  const [editing, setEditing] = useState<Product | undefined>();
  const [pendingBarcode, setPendingBarcode] = useState('');
  const [duplicate, setDuplicate] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      try {
        setProducts(saved ? JSON.parse(saved) as Product[] : sampleProducts);
      } catch {
        setProducts(sampleProducts);
      }
      setLoaded(true);
    }).catch(() => {
      setProducts(sampleProducts);
      setLoaded(true);
    });
  }, []);

  const persist = useCallback(async (next: Product[]) => {
    setProducts(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => `${product.name} ${product.barcode} ${product.notes}`.toLowerCase().includes(term));
  }, [products, search]);

  function closeModal() {
    setModal(null);
    setEditing(undefined);
    setPendingBarcode('');
    setDuplicate(undefined);
  }

  async function saveProduct(values: FormValues) {
    const existing = products.find((product) => product.barcode === values.barcode && product.id !== editing?.id);
    if (existing) {
      setDuplicate(existing.name);
      return;
    }
    const now = new Date().toISOString();
    const next = editing
      ? products.map((product) => product.id === editing.id ? { ...product, ...values, updatedAt: now } : product)
      : [{ id: makeId(), ...values, createdAt: now, updatedAt: now }, ...products];
    await persist(next);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeModal();
    setNotice({ tone: 'success', message: editing ? 'Product details saved.' : 'Product added to your catalog.' });
  }

  function openAdd(barcode = '') {
    setPendingBarcode(barcode);
    setDuplicate(undefined);
    setModal('add');
  }

  async function deleteProduct(product: Product) {
    Alert.alert('Remove product?', `Remove ${product.name} from this catalog?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void persist(products.filter((item) => item.id !== product.id)).then(() => setNotice({ tone: 'success', message: 'Product removed.' })) },
    ]);
  }

  async function importBulk(value: string) {
    let added = 0;
    let skipped = 0;
    let invalid = 0;
    const next = [...products];
    value.split('\n').forEach((line) => {
      const [barcode = '', name = ''] = line.split('|').map((part) => part.trim());
      if (barcode.length < 4 || !name) {
        if (line.trim()) invalid++;
        return;
      }
      if (next.some((product) => product.barcode === barcode)) {
        skipped++;
        return;
      }
      const now = new Date().toISOString();
      next.unshift({ id: makeId(), barcode, name, notes: '', createdAt: now, updatedAt: now });
      added++;
    });
    await persist(next);
    return { added, skipped, invalid };
  }

  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.root, { paddingTop: topInset, paddingBottom: bottomInset }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.brandRow}>
                <View style={styles.brandMark}><Feather name="maximize" size={22} color={colors.accent} /></View>
                <View><Text style={styles.eyebrow}>PRIVATE CATALOG</Text><Text style={styles.brandName}>Catalog Scanner</Text></View>
              </View>
              <Text style={styles.headerCount}>{products.length} {products.length === 1 ? 'entry' : 'entries'}</Text>
            </View>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>AT THE COUNTER</Text>
              <Text style={styles.heroTitle}>Name it.{"\\n"}<Text style={styles.heroAccent}>Move on.</Text></Text>
              <Text style={styles.heroBody}>Scan a code, add a name, keep your hands moving. Everything stays on this tablet.</Text>
            </View>
            <View style={styles.actionCard}>
              <Text style={styles.actionEyebrow}>READY WHEN YOU ARE</Text>
              <View style={styles.actionRow}>
                <Pressable onPress={() => setModal('scan')} style={({ pressed }) => [styles.accentButton, styles.bigButton, pressed && styles.pressed]} testID="button-scan-barcode">
                  <Feather name="maximize" size={21} color={colors.accentForeground} /><Text style={styles.accentButtonText}>Scan barcode</Text>
                </Pressable>
                <Pressable onPress={() => openAdd()} style={({ pressed }) => [styles.secondaryButton, styles.bigButton, pressed && styles.pressed]} testID="button-add-product">
                  <Feather name="plus" size={20} color={colors.secondaryForeground} /><Text style={styles.secondaryButtonText}>Add manually</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => setModal('bulk')} style={styles.bulkLink} testID="button-add-bulk">
                <MaterialCommunityIcons name="playlist-plus" size={18} color={colors.secondaryForeground} /><Text style={styles.bulkLinkText}>Add several at once</Text>
              </Pressable>
            </View>
            <View style={styles.catalogHeader}>
              <View><Text style={styles.eyebrow}>YOUR SHELF</Text><Text style={styles.sectionTitle}>Catalog {products.length > 0 ? <Text style={styles.sectionCount}>/ {products.length}</Text> : null}</Text></View>
              <View style={styles.searchWrap}><Feather name="search" size={18} color={colors.mutedForeground} /><TextInput value={search} onChangeText={setSearch} placeholder="Search name or barcode" placeholderTextColor={colors.mutedForeground} style={styles.searchInput} accessibilityLabel="Search catalog" testID="input-search-catalog" /></View>
            </View>
            {notice ? <AppNotice notice={notice} onDismiss={() => setNotice(null)} /> : null}
            {!loaded ? <View style={styles.loadingBlock}><View style={styles.skeleton} /><View style={styles.skeleton} /><View style={styles.skeleton} /></View> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.productRow} testID={`card-product-${item.id}`}>
            <View style={styles.productIcon}><MaterialCommunityIcons name="barcode" size={21} color={colors.accent} /></View>
            <View style={styles.productInfo}><Text style={styles.productName} numberOfLines={1}>{item.name}</Text><Text style={styles.productBarcode}>{item.barcode}</Text>{item.notes ? <Text style={styles.productNotes} numberOfLines={1}>{item.notes}</Text> : null}</View>
            <View style={styles.rowActions}>
              <Pressable onPress={() => { setEditing(item); setDuplicate(undefined); setModal('edit'); }} style={styles.iconButton} accessibilityLabel={`Edit ${item.name}`} testID={`button-edit-product-${item.id}`}><Feather name="edit-2" size={17} color={colors.mutedForeground} /></Pressable>
              <Pressable onPress={() => void deleteProduct(item)} style={styles.iconButton} accessibilityLabel={`Delete ${item.name}`} testID={`button-delete-product-${item.id}`}><Feather name="trash-2" size={17} color={colors.destructive} /></Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={loaded ? <View style={styles.emptyBlock}><View style={styles.emptyIcon}><Feather name={search ? 'search' : 'inbox'} size={26} color={colors.secondaryForeground} /></View><Text style={styles.emptyTitle}>{search ? 'Nothing matches that search' : 'Your catalog is ready'}</Text><Text style={styles.bodyText}>{search ? 'Try a different name or barcode.' : 'Scan a barcode or add a product by hand.'}</Text>{!search ? <Pressable onPress={() => openAdd()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} testID="button-empty-add"><Feather name="plus" size={18} color={colors.primaryForeground} /><Text style={styles.primaryButtonText}>Add first product</Text></Pressable> : null}</View> : null}
        ListFooterComponent={<View style={styles.footer}><Text style={styles.footerMono}>LOCAL-FIRST</Text></View>}
      />
      {modal ? <Modal visible animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}><View><Text style={styles.eyebrow}>{modal === 'scan' ? 'QUICK CAPTURE' : modal === 'bulk' ? 'BULK ENTRY' : modal === 'edit' ? 'CATALOG ENTRY' : pendingBarcode ? 'BARCODE CAPTURED' : 'NEW ENTRY'}</Text><Text style={styles.modalTitle}>{modal === 'scan' ? 'Scan a barcode' : modal === 'bulk' ? 'Add a batch' : modal === 'edit' ? 'Edit product' : 'Add a product'}</Text></View><Pressable onPress={closeModal} style={styles.closeButton} accessibilityLabel="Close dialog"><Feather name="x" size={22} color={colors.mutedForeground} /></Pressable></View>
            {modal === 'scan' ? <ScannerModal onClose={closeModal} onDetected={(barcode) => { closeModal(); openAdd(barcode); }} /> : modal === 'bulk' ? <BulkModal products={products} onClose={closeModal} onImport={importBulk} /> : <ProductForm initial={editing} initialBarcode={pendingBarcode || undefined} duplicate={duplicate} onSave={(values) => void saveProduct(values)} onClose={closeModal} />}
          </View>
        </View>
      </Modal> : null}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  page: { paddingHorizontal: 20, paddingBottom: 24, maxWidth: 900, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: { width: 40, height: 40, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  brandName: { marginTop: 2, color: colors.foreground, fontSize: 18, fontWeight: '700', letterSpacing: -0.5 },
  headerCount: { color: colors.mutedForeground, fontSize: 13, fontWeight: '600' },
  hero: { paddingTop: 31, paddingBottom: 24 },
  heroTitle: { color: colors.foreground, fontSize: 47, lineHeight: 46, fontWeight: '700', letterSpacing: -2.5, marginTop: 13 },
  heroAccent: { color: colors.accent },
  heroBody: { color: colors.mutedForeground, fontSize: 16, lineHeight: 24, marginTop: 14, maxWidth: 520 },
  actionCard: { backgroundColor: colors.secondary, borderRadius: 24, padding: 20, marginBottom: 36 },
  actionEyebrow: { color: colors.secondaryForeground, opacity: 0.75, fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 17 },
  bigButton: { flex: 1, minHeight: 56 },
  primaryButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 13, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '700' },
  accentButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 13, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  accentButtonText: { color: colors.accentForeground, fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { color: colors.secondaryForeground, fontSize: 14, fontWeight: '700' },
  bulkLink: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 17, alignSelf: 'flex-start' },
  bulkLinkText: { color: colors.secondaryForeground, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  catalogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 14 },
  sectionTitle: { color: colors.foreground, fontSize: 26, fontWeight: '700', letterSpacing: -1, marginTop: 5 },
  sectionCount: { color: colors.mutedForeground, fontSize: 16, fontWeight: '400' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, minWidth: 190, flex: 1, maxWidth: 275, height: 46 },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 14, marginLeft: 8, paddingVertical: 0 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 15 },
  productIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  productInfo: { flex: 1, minWidth: 0 },
  productName: { color: colors.foreground, fontSize: 15, fontWeight: '700' },
  productBarcode: { color: colors.mutedForeground, fontSize: 12, fontFamily: 'monospace', marginTop: 3 },
  productNotes: { color: colors.mutedForeground, fontSize: 12, marginTop: 3 },
  rowActions: { flexDirection: 'row', gap: 2 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  emptyBlock: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20, alignItems: 'center', paddingHorizontal: 24, paddingVertical: 48, marginTop: 18 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.foreground, fontSize: 18, fontWeight: '700', marginTop: 16 },
  bodyText: { color: colors.mutedForeground, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 7 },
  footer: { alignItems: 'center', paddingVertical: 22, gap: 5 },
  footerMono: { color: colors.mutedForeground, fontSize: 10, letterSpacing: 1.5 },
  caption: { color: colors.mutedForeground, fontSize: 11 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 14 },
  noticeSuccess: { backgroundColor: colors.secondary, borderColor: colors.border },
  noticeError: { backgroundColor: colors.card, borderColor: colors.destructive },
  noticeInfo: { backgroundColor: colors.secondary, borderColor: colors.border },
  noticeText: { flex: 1, color: colors.foreground, fontSize: 13, lineHeight: 19 },
  loadingBlock: { gap: 10, marginTop: 18 },
  skeleton: { height: 72, borderRadius: 14, backgroundColor: colors.secondary, opacity: 0.65 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,52,59,0.4)' },
  modalSheet: { maxHeight: '93%', backgroundColor: colors.background, borderTopLeftRadius: 25, borderTopRightRadius: 25, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 21, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { color: colors.foreground, fontSize: 24, fontWeight: '700', letterSpacing: -0.7, marginTop: 4 },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  formContent: { padding: 21, paddingBottom: 36 },
  formIntro: { padding: 14, borderRadius: 14, backgroundColor: colors.secondary, marginBottom: 20 },
  formIntroTitle: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
  formIntroText: { color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 4 },
  fieldLabel: { color: colors.foreground, fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 5 },
  fieldHint: { color: colors.mutedForeground, fontWeight: '400' },
  inputWrap: { height: 50, borderWidth: 1, borderColor: colors.input, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  inputInline: { flex: 1, color: colors.foreground, fontSize: 15, fontFamily: 'monospace' },
  textInput: { minHeight: 50, borderWidth: 1, borderColor: colors.input, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 13, color: colors.foreground, fontSize: 15 },
  notesInput: { minHeight: 86, paddingTop: 13 },
  inputError: { borderColor: colors.destructive },
  validation: { color: colors.destructive, fontSize: 12, marginTop: 5, marginBottom: 2 },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.destructive, padding: 11, marginBottom: 14 },
  inlineErrorText: { color: colors.destructive, flex: 1, fontSize: 13, lineHeight: 18 },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  disabledButton: { opacity: 0.45 },
  cameraFrame: { height: 250, backgroundColor: colors.primary, overflow: 'hidden', position: 'relative' },
  scanPanel: { paddingBottom: 14 },
  scanTarget: { position: 'absolute', left: '15%', right: '15%', top: '32%', height: 92, borderWidth: 2, borderColor: colors.accent, borderRadius: 10 },
  scanLine: { position: 'absolute', left: 8, right: 8, top: '50%', height: 2, backgroundColor: colors.accent },
  cameraHint: { position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', color: colors.primaryForeground, fontSize: 12, fontWeight: '700' },
  scanLoading: { padding: 35, alignItems: 'center' },
  permissionCard: { padding: 28, alignItems: 'center', backgroundColor: colors.secondary },
  permissionIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 21, paddingVertical: 18 },
  orLine: { height: 1, backgroundColor: colors.border, flex: 1 },
  orText: { color: colors.mutedForeground, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  manualRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 21 },
  manualInput: { flex: 1, fontFamily: 'monospace' },
  scanFooter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 15 },
  closeTextButton: { alignSelf: 'center', padding: 14 },
  bulkInput: { minHeight: 190, paddingTop: 13, fontFamily: 'monospace', lineHeight: 24 },
  codeText: { fontFamily: 'monospace', color: colors.foreground },
  resultBlock: { alignItems: 'center', padding: 26 },
  resultIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
});