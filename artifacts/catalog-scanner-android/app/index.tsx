import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  bulkScan,
  clearSession,
  connectWithLoginCode,
  connectWithTether,
  createName,
  fetchCatalog,
  loadSession,
  removeItem,
  type CatalogGroup,
  type ProductName,
  type SessionInfo,
} from '@/lib/api';

type Notice = { tone: 'success' | 'error' | 'info'; message: string };

function sanitizeBarcode(value: string) {
  return value.replace(/[^0-9A-Za-z-]/g, '');
}

async function safeHapticSuccess() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // ignore
  }
}

function AppNotice({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{notice.message}</Text>
      <Pressable onPress={onDismiss} hitSlop={10}>
        <Feather name="x" size={18} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

function PairingScreen({
  onPaired,
}: {
  onPaired: (session: SessionInfo) => void;
}) {
  const colors = useColors();
  const styles = createStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'qr' | 'code'>('qr');
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://192.168.0.5:47821');
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState(Platform.OS === 'ios' ? 'iOS scanner' : 'Android scanner');

  async function pairFromQr(data: string) {
    if (busy || scanned) return;
    setScanned(true);
    setBusy(true);
    setError('');
    try {
      const session = await connectWithTether(data, deviceName.trim() || 'Android scanner');
      await safeHapticSuccess();
      onPaired(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tether failed');
      setScanned(false);
    } finally {
      setBusy(false);
    }
  }

  async function pairFromCode() {
    setBusy(true);
    setError('');
    try {
      const session = await connectWithLoginCode(baseUrl.trim(), code.trim(), deviceName.trim() || 'Scanner');
      await safeHapticSuccess();
      onPaired(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAwareScrollViewCompat contentContainerStyle={styles.pairPage} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>FIRST BOOT</Text>
      <Text style={styles.heroTitle}>Connect to{'\n'}Master PC</Text>
      <Text style={styles.heroBody}>
        Scan the tether QR shown on the master computer. Other devices can use a login code instead.
      </Text>

      <View style={styles.segment}>
        <Pressable onPress={() => setMode('qr')} style={[styles.segmentBtn, mode === 'qr' && styles.segmentBtnActive]}>
          <Text style={[styles.segmentText, mode === 'qr' && styles.segmentTextActive]}>Tether QR</Text>
        </Pressable>
        <Pressable onPress={() => setMode('code')} style={[styles.segmentBtn, mode === 'code' && styles.segmentBtnActive]}>
          <Text style={[styles.segmentText, mode === 'code' && styles.segmentTextActive]}>Login code</Text>
        </Pressable>
      </View>

      <Text style={styles.fieldLabel}>Device name</Text>
      <TextInput
        style={styles.textInput}
        value={deviceName}
        onChangeText={setDeviceName}
        placeholder="Warehouse scanner"
        placeholderTextColor={colors.mutedForeground}
      />

      {mode === 'qr' ? (
        <View style={styles.pairCard}>
          {Platform.OS !== 'web' && permission?.granted ? (
            <View style={styles.cameraFrame}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanned || busy ? undefined : ({ data }) => void pairFromQr(data)}
              />
              <View style={styles.scanTarget} />
              <Text style={styles.cameraHint}>Point at the master tether QR</Text>
            </View>
          ) : Platform.OS !== 'web' ? (
            <View style={styles.permissionCard}>
              <Text style={styles.modalTitle}>Camera access</Text>
              <Text style={styles.bodyText}>Allow camera access to scan the master tether QR.</Text>
              <Pressable onPress={() => void requestPermission()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Allow camera</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.permissionCard}>
              <Text style={styles.bodyText}>Use login code mode on web, or open this app in Expo Go on a phone.</Text>
            </View>
          )}
          {busy ? <ActivityIndicator color={colors.foreground} style={{ marginTop: 16 }} /> : null}
        </View>
      ) : (
        <View style={styles.pairCard}>
          <Text style={styles.fieldLabel}>Master URL</Text>
          <TextInput
            style={styles.textInput}
            value={baseUrl}
            onChangeText={setBaseUrl}
            autoCapitalize="none"
            placeholder="http://192.168.0.5:47821"
            placeholderTextColor={colors.mutedForeground}
          />
          <Text style={styles.fieldLabel}>Login code</Text>
          <TextInput
            style={styles.textInput}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            placeholder="ABC123"
            placeholderTextColor={colors.mutedForeground}
          />
          <Pressable onPress={() => void pairFromCode()} style={[styles.primaryButton, { marginTop: 16 }]} disabled={busy}>
            <Text style={styles.primaryButtonText}>{busy ? 'Connecting…' : 'Connect'}</Text>
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </KeyboardAwareScrollViewCompat>
  );
}

const SCAN_COOLDOWN_MS = 2000;

function barcodeInTargetBox(
  bounds?: { origin?: { x?: number; y?: number }; size?: { width?: number; height?: number } } | null,
) {
  // Expo reports normalized 0..1 bounds on many devices. Accept only codes whose
  // center sits inside the on-screen target rectangle (roughly inset 12% x / 28% y).
  if (!bounds?.origin || !bounds?.size) return true;
  const x = Number(bounds.origin.x ?? 0);
  const y = Number(bounds.origin.y ?? 0);
  const w = Number(bounds.size.width ?? 0);
  const h = Number(bounds.size.height ?? 0);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return true;
  const cx = x + w / 2;
  const cy = y + h / 2;
  // If values look like pixels (>1), skip strict filtering.
  if (cx > 1.5 || cy > 1.5) return true;
  return cx >= 0.12 && cx <= 0.88 && cy >= 0.28 && cy <= 0.72;
}

function BulkScanModal({
  names,
  onClose,
  onSubmit,
  onCreateName,
}: {
  names: ProductName[];
  onClose: () => void;
  onCreateName: (name: string) => Promise<void>;
  onSubmit: (payload: { name: string; barcodes: string[]; notes: string; scannedAt?: string }) => Promise<void>;
}) {
  const colors = useColors();
  const styles = createStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState(names[0]?.name || '');
  const [newName, setNewName] = useState('');
  const [notes, setNotes] = useState('');
  const [manual, setManual] = useState('');
  const [showNames, setShowNames] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastScan, setLastScan] = useState<{ code: string; action: 'added' | 'removed'; at: number } | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const coolingRef = useRef(false);

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
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
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
    setLastScan({ code: value, action, at: Date.now() });
    if (!opts?.force) {
      coolingRef.current = true;
      setCooldownUntil(Date.now() + SCAN_COOLDOWN_MS);
    }
    void safeHapticSuccess();
  }

  async function saveNewName() {
    const cleaned = newName.trim();
    if (!cleaned) return;
    setBusy(true);
    setError('');
    try {
      await onCreateName(cleaned);
      setSelectedName(cleaned);
      setNewName('');
      setShowNames(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add name');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
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

  const cooling = cooldownLeft > 0;

  return (
    <KeyboardAwareScrollViewCompat contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
      <View style={styles.formIntro}>
        <Text style={styles.formIntroTitle}>Hold one barcode inside the white box.</Text>
        <Text style={styles.formIntroText}>
          2s cooldown after each scan. Same code again removes it from this batch. Only codes in the target box are accepted.
        </Text>
      </View>

      {Platform.OS !== 'web' && permission?.granted ? (
        <View style={styles.cameraFrame}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'qr'] }}
            onBarcodeScanned={
              cooling
                ? undefined
                : ({ data, bounds }) => {
                    if (!barcodeInTargetBox(bounds as any)) return;
                    toggleBarcode(data);
                  }
            }
          />
          <View style={styles.scanTarget} />
          <Text style={styles.cameraHint}>
            {cooling
              ? `Cooldown ${(cooldownLeft / 1000).toFixed(1)}s`
              : `${barcodes.length} in batch · aim inside box`}
          </Text>
        </View>
      ) : Platform.OS !== 'web' ? (
        <Pressable onPress={() => void requestPermission()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Allow camera</Text>
        </Pressable>
      ) : null}

      {lastScan ? (
        <View style={styles.lastScanBanner}>
          <Text style={styles.lastScanLabel}>{lastScan.action === 'added' ? 'SCANNED' : 'REMOVED'}</Text>
          <Text style={styles.lastScanCode}>{lastScan.code}</Text>
        </View>
      ) : null}

      <View style={styles.manualRow}>
        <TextInput
          style={[styles.textInput, styles.manualInput]}
          value={manual}
          onChangeText={(v) => setManual(sanitizeBarcode(v))}
          placeholder="Type barcode"
          placeholderTextColor={colors.mutedForeground}
        />
        <Pressable
          onPress={() => {
            toggleBarcode(manual, { force: true });
            setManual('');
          }}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Add / remove</Text>
        </Pressable>
      </View>

      <View style={styles.batchList}>
        {barcodes.length ? barcodes.map((code) => (
          <Pressable key={code} onPress={() => toggleBarcode(code, { force: true })} style={styles.batchChip}>
            <Text style={styles.batchChipText}>{code}</Text>
            <Feather name="x" size={14} color={colors.foreground} />
          </Pressable>
        )) : <Text style={styles.muted}>No barcodes in this batch yet.</Text>}
      </View>

      <Text style={styles.fieldLabel}>Name</Text>
      <Pressable onPress={() => setShowNames((v) => !v)} style={styles.selectBox}>
        <Text style={styles.selectBoxText}>{selectedName || 'Select name'}</Text>
        <Feather name={showNames ? 'chevron-up' : 'chevron-down'} size={18} color={colors.foreground} />
      </Pressable>
      {showNames ? (
        <View style={styles.selectMenu}>
          {names.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                setSelectedName(item.name);
                setShowNames(false);
              }}
              style={styles.selectOption}
            >
              <Text style={styles.selectOptionText}>{item.name}</Text>
            </Pressable>
          ))}
          <View style={styles.newNameRow}>
            <TextInput
              style={[styles.textInput, { flex: 1 }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Add new name"
              placeholderTextColor={colors.mutedForeground}
            />
            <Pressable onPress={() => void saveNewName()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Add</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Text style={styles.fieldLabel}>Notes optional</Text>
      <TextInput
        style={[styles.textInput, styles.notesInput]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional notes for new items"
        placeholderTextColor={colors.mutedForeground}
        multiline
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.formActions}>
        <Pressable onPress={onClose} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={() => void submit()} style={styles.primaryButton} disabled={busy}>
          <Text style={styles.primaryButtonText}>{busy ? 'Saving…' : 'Save batch'}</Text>
        </Pressable>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

export default function CatalogHome() {
  const colors = useColors();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [names, setNames] = useState<ProductName[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<'scan' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSession()
      .then(async (saved) => {
        if (!saved) {
          setBootstrapping(false);
          return;
        }
        setSession(saved);
        try {
          const data = await fetchCatalog(saved);
          setGroups(data.groups);
          setNames(data.names);
        } catch {
          await clearSession();
          setSession(null);
        } finally {
          setBootstrapping(false);
        }
      })
      .catch(() => setBootstrapping(false));
  }, []);

  const refresh = useCallback(async (active: SessionInfo) => {
    setLoading(true);
    try {
      const data = await fetchCatalog(active);
      setGroups(data.groups);
      setNames(data.names);
    } finally {
      setLoading(false);
    }
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

  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 24) : insets.top;
  const bottomInset = Platform.OS === 'web' ? 24 : insets.bottom;

  if (bootstrapping) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.root, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <PairingScreen
          onPaired={(next) => {
            setSession(next);
            void refresh(next);
          }}
        />
      </View>
    );
  }

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
              <View>
                <Text style={styles.eyebrow}>MASTER CONNECTED</Text>
                <Text style={styles.brandName}>DTM Inventory</Text>
                <Text style={styles.monoSmall}>{session.baseUrl}</Text>
              </View>
              <Pressable
                onPress={() => {
                  Alert.alert('Disconnect?', 'This device will need the tether QR or a login code again.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: () => {
                        void clearSession().then(() => {
                          setSession(null);
                          setGroups([]);
                          setNames([]);
                        });
                      },
                    },
                  ]);
                }}
                style={styles.rowButton}
              >
                <Text style={styles.rowButtonText}>Disconnect</Text>
              </Pressable>
            </View>

            <View style={styles.hero}>
              <Text style={styles.heroTitle}>Scan Items{'\n'}Select Name</Text>
              <Text style={styles.heroBody}>Bulk-scan barcodes, then assign one name to the whole batch.</Text>
            </View>

            <View style={styles.actionCard}>
              <Text style={styles.actionEyebrow}>CHOOSE AN ACTION</Text>
              <Pressable onPress={() => setModal('scan')} style={[styles.primaryButton, styles.bigButton]}>
                <Feather name="maximize" size={18} color={colors.primaryForeground} />
                <Text style={styles.primaryButtonText}>Scan barcodes</Text>
              </Pressable>
              <Pressable onPress={() => session && void refresh(session)} style={[styles.secondaryButton, { marginTop: 10 }]}>
                <Text style={styles.secondaryButtonText}>{loading ? 'Refreshing…' : 'Refresh catalog'}</Text>
              </Pressable>
            </View>

            <View style={styles.catalogHeader}>
              <View>
                <Text style={styles.eyebrow}>CATALOG</Text>
                <Text style={styles.sectionTitle}>
                  Groups {groups.length > 0 ? <Text style={styles.sectionCount}>/ {groups.length}</Text> : null}
                </Text>
              </View>
              <View style={styles.searchWrap}>
                <Feather name="search" size={18} color={colors.mutedForeground} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search name or barcode"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.searchInput}
                />
              </View>
            </View>

            {notice ? <AppNotice notice={notice} onDismiss={() => setNotice(null)} /> : null}
          </View>
        }
        renderItem={({ item }) => {
          const open = !!expanded[item.id];
          return (
            <View style={styles.groupCard}>
              <Pressable
                onPress={() => setExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                style={styles.groupHeader}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupName}>{item.name}</Text>
                  <Text style={styles.groupCount}>{item.count} barcode{item.count === 1 ? '' : 's'}</Text>
                </View>
                <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.foreground} />
              </Pressable>
              {open ? (
                <View style={styles.groupBody}>
                  {item.items.map((barcodeItem) => (
                    <View key={barcodeItem.id} style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemBarcode}>{barcodeItem.barcode}</Text>
                        {barcodeItem.scannedAt ? (
                          <Text style={styles.itemNotes}>
                            Scanned {new Date(barcodeItem.scannedAt).toLocaleString()}
                          </Text>
                        ) : null}
                        {barcodeItem.notes ? <Text style={styles.itemNotes}>{barcodeItem.notes}</Text> : null}
                      </View>
                      <Pressable
                        onPress={() => {
                          if (!session) return;
                          void removeItem(session, barcodeItem.id).then((result) => {
                            setGroups(result.groups);
                            setNames(result.names);
                            setNotice({ tone: 'success', message: 'Barcode removed.' });
                          });
                        }}
                        style={styles.rowButton}
                      >
                        <Text style={styles.rowButtonText}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>{search ? 'No matches found' : 'No groups yet'}</Text>
            <Text style={styles.bodyText}>{search ? 'Try a different name or barcode.' : 'Scan a batch to create the first group.'}</Text>
          </View>
        }
      />

      {modal === 'scan' ? (
        <Modal visible animationType="slide" transparent onRequestClose={() => setModal(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.eyebrow}>BULK SCAN</Text>
                  <Text style={styles.modalTitle}>Scan barcodes</Text>
                </View>
                <Pressable onPress={() => setModal(null)} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </Pressable>
              </View>
              <BulkScanModal
                names={names}
                onClose={() => setModal(null)}
                onCreateName={async (name) => {
                  if (!session) return;
                  const result = await createName(session, name);
                  setNames(result.names);
                }}
                onSubmit={async (payload) => {
                  if (!session) return;
                  const result = await bulkScan(session, payload);
                  setGroups(result.groups);
                  setNames(result.names);
                  setNotice({
                    tone: 'success',
                    message: `Batch saved · +${result.added} / -${result.removed}${result.moved ? ` / moved ${result.moved}` : ''}`,
                  });
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    page: { paddingHorizontal: 20, paddingBottom: 28, maxWidth: 900, width: '100%', alignSelf: 'center' },
    pairPage: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      alignItems: 'flex-start',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 14,
      marginBottom: 8,
    },
    brandName: { marginTop: 4, color: colors.foreground, fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
    monoSmall: {
      marginTop: 4,
      color: colors.mutedForeground,
      fontSize: 11,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    eyebrow: {
      color: colors.foreground,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.8,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    hero: { paddingTop: 24, paddingBottom: 18 },
    heroTitle: { color: colors.foreground, fontSize: 42, lineHeight: 42, fontWeight: '700', letterSpacing: -2 },
    heroBody: { color: colors.foreground, fontSize: 16, lineHeight: 24, marginTop: 12, maxWidth: 520 },
    actionCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 18,
      marginBottom: 28,
      backgroundColor: colors.card,
    },
    actionEyebrow: {
      color: colors.foreground,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.6,
      marginBottom: 14,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    bigButton: { minHeight: 56 },
    primaryButton: {
      minHeight: 48,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryButtonText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '700' },
    secondaryButton: {
      minHeight: 48,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
    catalogHeader: { gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 14 },
    sectionTitle: { color: colors.foreground, fontSize: 26, fontWeight: '700', letterSpacing: -1, marginTop: 4 },
    sectionCount: { color: colors.mutedForeground, fontSize: 16, fontWeight: '400' },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 46,
      backgroundColor: colors.card,
    },
    searchInput: { flex: 1, marginLeft: 8, color: colors.foreground, fontSize: 14, paddingVertical: 0 },
    notice: {
      marginTop: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      backgroundColor: colors.card,
    },
    noticeText: { flex: 1, color: colors.foreground, fontSize: 13, lineHeight: 18 },
    groupCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      marginTop: 12,
      backgroundColor: colors.card,
      overflow: 'hidden',
    },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    groupName: { color: colors.foreground, fontSize: 16, fontWeight: '700' },
    groupCount: { color: colors.mutedForeground, fontSize: 12, marginTop: 3 },
    groupBody: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 14, paddingBottom: 10 },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    itemBarcode: {
      color: colors.foreground,
      fontSize: 13,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    itemNotes: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
    rowButton: {
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    rowButtonText: { color: colors.foreground, fontSize: 12, fontWeight: '700' },
    emptyBlock: {
      marginTop: 18,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      borderRadius: 16,
      padding: 28,
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: { color: colors.foreground, fontSize: 18, fontWeight: '700' },
    bodyText: { color: colors.mutedForeground, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    muted: { color: colors.mutedForeground, fontSize: 13 },
    modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
    modalSheet: {
      maxHeight: '94%',
      backgroundColor: colors.background,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { color: colors.foreground, fontSize: 24, fontWeight: '700', letterSpacing: -0.6, marginTop: 4 },
    closeButton: {
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonText: { color: colors.foreground, fontSize: 13, fontWeight: '700' },
    formContent: { padding: 18, paddingBottom: 36, gap: 8 },
    formIntro: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: colors.card,
      marginBottom: 8,
    },
    formIntroTitle: { color: colors.foreground, fontSize: 14, fontWeight: '700', lineHeight: 20 },
    formIntroText: { color: colors.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 4 },
    fieldLabel: { color: colors.foreground, fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 6 },
    textInput: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: 12,
      paddingHorizontal: 12,
      color: colors.foreground,
      backgroundColor: colors.card,
      fontSize: 15,
    },
    notesInput: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
    manualRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    manualInput: { flex: 1 },
    batchList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    batchChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: colors.card,
    },
    batchChipText: {
      color: colors.foreground,
      fontSize: 12,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    selectBox: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    selectBoxText: { color: colors.foreground, fontSize: 15, fontWeight: '600' },
    selectMenu: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      marginTop: 8,
      overflow: 'hidden',
      backgroundColor: colors.card,
    },
    selectOption: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    selectOptionText: { color: colors.foreground, fontSize: 14, fontWeight: '600' },
    newNameRow: { flexDirection: 'row', gap: 8, padding: 10 },
    formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
    cameraFrame: {
      height: 220,
      backgroundColor: '#000',
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    scanTarget: {
      position: 'absolute',
      left: '12%',
      right: '12%',
      top: '28%',
      height: 90,
      borderWidth: 2,
      borderColor: '#fff',
      borderRadius: 4,
    },
    cameraHint: {
      position: 'absolute',
      bottom: 12,
      left: 0,
      right: 0,
      textAlign: 'center',
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
    },
    lastScanBanner: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.card,
      marginTop: 8,
      gap: 2,
    },
    lastScanLabel: {
      color: colors.foreground,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.4,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    lastScanCode: {
      color: colors.foreground,
      fontSize: 16,
      fontWeight: '700',
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    pairCard: {
      marginTop: 16,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      backgroundColor: colors.card,
    },
    segment: {
      marginTop: 18,
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      overflow: 'hidden',
    },
    segmentBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
    segmentBtnActive: { backgroundColor: colors.primary },
    segmentText: { color: colors.foreground, fontWeight: '700', fontSize: 13 },
    segmentTextActive: { color: colors.primaryForeground },
    permissionCard: { padding: 18, gap: 10, alignItems: 'center' },
    errorText: { color: colors.foreground, marginTop: 12, fontSize: 13, fontWeight: '600' },
  });
