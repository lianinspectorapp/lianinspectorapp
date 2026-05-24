// ============ INSPECTION SYSTEM ============
        let inspectionStep = 0;
        let inspectionFormData = null;
        let inspectionItemsData = {};
        let currentOfflineInspectionId = null;
let vehicleAutosaveTimer = null;
let lastVehicleDraft = '';
let itemAutosaveTimers = {};
let editingInspectionId = null;
let editingSourceDraftId = null;



const VEHICLE_FIELD_IDS = [
    'customerName',
    'customerPhone',
    'vehicleType',
    'vehiclePlate',
    'vehicleYear',
    'vehicleColor',
    'vehicleTransmission',
    'vehicleFuel',
    'vehicleMileage'
];

// Checkbox tambahan di Step Data Kendaraan
// Disimpan terpisah dari checklist item agar mudah di-restore tanpa mengubah struktur item inspeksi.
const DOCUMENT_FIELD_IDS = [
    'doc_bpkb',
    'doc_stnk',
    'doc_faktur',
    'doc_forma',
    'doc_kir',
    'doc_manual',
    'doc_servis'
];

const ACCESSORY_FIELD_IDS = [
    'acc_kunci_serep',
    'acc_kunci_roda',
    'acc_ban_serep',
    'acc_dongkrak'
];

function getCheckboxGroupData(ids = []) {
    return ids.reduce((acc, id) => {
        acc[id] = Boolean(document.getElementById(id)?.checked);
        return acc;
    }, {});
}

function fillCheckboxGroup(ids = [], data = {}) {
    ids.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.checked = Boolean(data?.[id]);
    });
}

function getDocumentFormData() {
    return getCheckboxGroupData(DOCUMENT_FIELD_IDS);
}

function getAccessoryFormData() {
    return getCheckboxGroupData(ACCESSORY_FIELD_IDS);
}

function fillInspectionMetaData({ documentsData = {}, accessoriesData = {} } = {}) {
    fillCheckboxGroup(DOCUMENT_FIELD_IDS, documentsData);
    fillCheckboxGroup(ACCESSORY_FIELD_IDS, accessoriesData);
}

function hasCheckedData(data = {}) {
    return Object.values(data || {}).some(value => Boolean(value));
}

function getVehicleFormData() {
    return {
        customerName: document.getElementById('customerName')?.value?.trim() || '',
        customerPhone: document.getElementById('customerPhone')?.value?.trim() || '',
        vehicleType: document.getElementById('vehicleType')?.value?.trim() || '',
        vehiclePlate: document.getElementById('vehiclePlate')?.value?.trim() || '',
        vehicleYear: document.getElementById('vehicleYear')?.value?.trim() || '',
        vehicleColor: document.getElementById('vehicleColor')?.value?.trim() || '',
        vehicleTransmission: document.getElementById('vehicleTransmission')?.value?.trim() || '',
        vehicleFuel: document.getElementById('vehicleFuel')?.value?.trim() || '',
        vehicleMileage: document.getElementById('vehicleMileage')?.value?.trim() || ''
    };
}

function fillVehicleForm(data = {}) {
    VEHICLE_FIELD_IDS.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = data[id] || '';
    });
}


function hasVehicleDraftContent(data = {}) {
    return VEHICLE_FIELD_IDS.some(id => String(data?.[id] || '').trim() !== '');
}

function hasInspectionDraftContent(draft = {}) {
    return hasVehicleDraftContent(draft.vehicleData || {}) ||
        Object.keys(draft.itemsData || {}).length > 0 ||
        hasCheckedData(draft.documentsData || {}) ||
        hasCheckedData(draft.accessoriesData || {});
}

function isVehicleDataComplete(data = {}) {
    return VEHICLE_FIELD_IDS.every(id => String(data?.[id] || '').trim() !== '');
}

function applyOfflineDraftToInspection(draft, { showUi = true, preferChecklist = false } = {}) {
    if (!draft) return false;

    currentOfflineInspectionId = draft.id;
    editingInspectionId = getEditingInspectionIdFromDraft(draft);
    editingSourceDraftId = editingInspectionId ? draft.id : null;
    inspectionFormData = draft.vehicleData || {};
    inspectionItemsData = draft.itemsData || {};
    console.log(editingInspectionId ? '✏️ Draft revisi direstore' : '✅ Draft inspeksi direstore', Object.keys(inspectionItemsData || {}).length);
    lastVehicleDraft = JSON.stringify(inspectionFormData || {});

    fillVehicleForm(inspectionFormData);
    fillInspectionMetaData({
        documentsData: draft.documentsData || {},
        accessoriesData: draft.accessoriesData || {}
    });

    const hasItems = Object.keys(inspectionItemsData || {}).length > 0;
    const canOpenChecklist = isVehicleDataComplete(inspectionFormData);
    inspectionStep = hasItems || canOpenChecklist ? 1 : 0;

    if (!showUi) return true;

    setInspectionFlowActive(true);
    hideDraftMonitoringCards();
    document.getElementById('startNewInspectionBtn')?.classList.add('hidden');
    document.getElementById('inspectionNavTabs')?.classList.remove('hidden');
    document.getElementById('emptyInspectionState')?.classList.add('hidden');

    if ((preferChecklist || hasItems) && canOpenChecklist) {
        document.getElementById('vehicleDataSection')?.classList.add('hidden');
        document.getElementById('activeInspectionSection')?.classList.remove('hidden');
        renderInspectionItems();
        updateTabUI('checklist');
    } else {
        document.getElementById('vehicleDataSection')?.classList.remove('hidden');
        document.getElementById('activeInspectionSection')?.classList.add('hidden');
        updateTabUI('vehicle');
    }

    return true;
}

function ensureOfflineInspectionId() {
    if (!currentOfflineInspectionId) {
        const activeDraftId = typeof getActiveDraftId === 'function' ? getActiveDraftId() : null;
        currentOfflineInspectionId = activeDraftId || (typeof createOfflineInspectionId === 'function'
            ? createOfflineInspectionId()
            : `${currentUser?.id || currentUser?.username || 'user'}_${Date.now()}`);
    }

    return currentOfflineInspectionId;
}

function resetInspectionRuntime({ clearForm = false, deleteDraft = false } = {}) {
    if (vehicleAutosaveTimer) clearTimeout(vehicleAutosaveTimer);
    Object.values(itemAutosaveTimers || {}).forEach(timer => clearTimeout(timer));
    itemAutosaveTimers = {};

    const draftIdToDelete = currentOfflineInspectionId;

    inspectionStep = 0;
    inspectionFormData = null;
    inspectionItemsData = {};
    currentOfflineInspectionId = null;
    lastVehicleDraft = '';
    clearEditingInspectionMode();

    if (clearForm) {
        fillVehicleForm({});
        fillInspectionMetaData({ documentsData: {}, accessoriesData: {} });
    }
    if (deleteDraft && draftIdToDelete && typeof deleteOfflineInspection === 'function') {
        deleteOfflineInspection(draftIdToDelete).catch(console.error);
    }
}


function isInspectionFormVisible() {
    const vehicleSection = document.getElementById('vehicleDataSection');
    const activeSection = document.getElementById('activeInspectionSection');

    return Boolean(
        (vehicleSection && !vehicleSection.classList.contains('hidden')) ||
        (activeSection && !activeSection.classList.contains('hidden'))
    );
}

function hideDraftMonitoringCards() {
    const container = document.getElementById('draftInspectionContainer');
    if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
}


// ================= V19: LAYOUT + SUBMIT CLEANUP HELPERS =================
function relocateDraftMonitoringContainer() {
    const container = document.getElementById('draftInspectionContainer');
    const startBtn = document.getElementById('startNewInspectionBtn');

    if (!container || !startBtn) return;

    // Tempatkan monitoring tepat di bawah tombol Mulai Inspeksi Baru,
    // bukan di bawah form/checklist inspeksi.
    if (container.previousElementSibling !== startBtn) {
        startBtn.insertAdjacentElement('afterend', container);
    }
}

function clearInspectionFormUi() {
    fillVehicleForm({});
    fillInspectionMetaData({ documentsData: {}, accessoriesData: {} });

    const categoriesContainer = document.getElementById('categoriesInspectionList');
    if (categoriesContainer) categoriesContainer.innerHTML = '';

    const progressText = document.getElementById('progressText');
    if (progressText) progressText.textContent = '0 / 0';

    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = '0%';

    const vehicleDisplay = document.getElementById('vehicleNameDisplay');
    if (vehicleDisplay) vehicleDisplay.textContent = '🚗 Kendaraan: -';
}

function setInspectionUiIdle({ showMonitoring = true } = {}) {
    document.getElementById('inspectionNavTabs')?.classList.add('hidden');
    document.getElementById('vehicleDataSection')?.classList.add('hidden');
    document.getElementById('activeInspectionSection')?.classList.add('hidden');
    document.getElementById('startNewInspectionBtn')?.classList.remove('hidden');
    relocateDraftMonitoringContainer();

    if (showMonitoring) {
        showIdleInspectionState();
    } else {
        hideDraftMonitoringCards();
    }
}



// ================= V27: INSPECTION LANDING + MONITORING GUARD =================
function setInspectionFlowActive(active) {
    const view = document.getElementById('inspectionView');
    if (view) view.dataset.flowActive = active ? 'true' : 'false';
}

function isInspectionFlowActive() {
    const view = document.getElementById('inspectionView');
    return Boolean(view?.dataset.flowActive === 'true' || isInspectionFormVisible());
}

function prepareInspectionLandingView() {
    if (!currentUser) return;

    relocateDraftMonitoringContainer();

    // Kalau form kendaraan atau checklist sedang terbuka, jangan tampilkan monitoring.
    if (isInspectionFormVisible()) {
        setInspectionFlowActive(true);
        hideDraftMonitoringCards();
        return;
    }

    setInspectionFlowActive(false);

    document.getElementById('inspectionNavTabs')?.classList.add('hidden');
    document.getElementById('vehicleDataSection')?.classList.add('hidden');
    document.getElementById('activeInspectionSection')?.classList.add('hidden');
    document.getElementById('startNewInspectionBtn')?.classList.remove('hidden');

    const emptyState = document.getElementById('emptyInspectionState');

    if (currentUser?.role === 'admin') {
        if (emptyState) emptyState.classList.add('hidden');
        renderDraftInspectionCards();
    } else {
        hideDraftMonitoringCards();
        if (emptyState) emptyState.classList.remove('hidden');
    }
}

function isDraftActiveMonitoringCandidate(draft) {
    if (!draft || !hasInspectionDraftContent(draft)) return false;

    const status = draft.status || 'draft';
    const syncStatus = draft.syncStatus || 'draft';

    // Monitoring hanya untuk inspeksi yang benar-benar sedang berjalan.
    // Draft yang sudah submit / pending final sync tidak ditampilkan sebagai monitoring aktif.
    if (status !== 'draft' || syncStatus !== 'draft') return false;
    if (draft.remotePayload || draft.submittedAt || draft.finalInspectionId) return false;
    if (isDraftAlreadySubmitted(draft)) return false;

    return true;
}

function normalizeDraftCompareText(value) {
    return String(value ?? '').trim().toLowerCase();
}

function isDraftAlreadySubmitted(draft) {
    const vehicle = draft?.vehicleData || {};
    const plate = normalizeDraftCompareText(vehicle.vehiclePlate);
    const phone = normalizeDraftCompareText(vehicle.customerPhone);
    const client = normalizeDraftCompareText(vehicle.customerName);
    const vehicleType = normalizeDraftCompareText(vehicle.vehicleType);
    const draftTime = new Date(draft.createdAt || draft.updatedAt || 0).getTime();

    if (!plate && !phone && !client && !vehicleType) return false;

    return (allInspections || []).some(raw => {
        const insp = normalizeInspectionForReport(raw);
        const inspPlate = normalizeDraftCompareText(insp.vehiclePlate);
        const inspPhone = normalizeDraftCompareText(insp.customerPhone);
        const inspClient = normalizeDraftCompareText(insp.customerName);
        const inspVehicle = normalizeDraftCompareText(insp.vehicleType);
        const inspTime = new Date(insp.inspectionDate || 0).getTime();

        // Kalau tanggal final lebih lama dari draft baru, jangan dianggap duplikat.
        if (draftTime && inspTime && inspTime + 5000 < draftTime) return false;

        const strongMatch = plate && inspPlate && plate === inspPlate;
        const supportingMatch =
            (phone && inspPhone && phone === inspPhone) ||
            (client && inspClient && client === inspClient) ||
            (vehicleType && inspVehicle && vehicleType === inspVehicle);

        return Boolean(strongMatch && (supportingMatch || !phone));
    });
}

function normalizeCloudActiveInspectionRow(row = {}) {
    const payload = row.data || {};
    return {
        ...payload,
        id: payload.offlineId || row.id,
        offlineId: payload.offlineId || row.id,
        activeInspectionId: row.id,
        remoteActiveInspectionId: row.id,
        supabaseActiveInspectionId: row.id,
        inspectorName: payload.inspectorName || row.inspector || '-',
        ownerId: payload.ownerId || payload.inspectorId || row.inspector || '',
        inspectorId: payload.inspectorId || payload.ownerId || row.inspector || '',
        role: payload.role || 'inspector',
        status: payload.status || 'draft',
        syncStatus: payload.syncStatus || 'draft',
        vehicleData: payload.vehicleData || {},
        documentsData: payload.documentsData || {},
        accessoriesData: payload.accessoriesData || {},
        itemsData: payload.itemsData || {},
        remotePayload: payload.remotePayload || null,
        submittedAt: payload.submittedAt || null,
        finalInspectionId: payload.finalInspectionId || null,
        createdAt: payload.createdAt || row.created_at,
        updatedAt: payload.updatedAt || row.created_at,
        _source: 'cloud',
        _rowId: row.id
    };
}

function isStrictActiveInspectionCloudDraft(draft) {
    if (!draft || !hasInspectionDraftContent(draft)) return false;

    const status = draft.status || 'draft';
    const syncStatus = draft.syncStatus || 'draft';

    // active_inspections hanya boleh menjadi monitoring inspeksi berjalan.
    // Data submit/sudah final/pending final sync tidak boleh tampil di card monitoring.
    if (status !== 'draft') return false;
    if (syncStatus !== 'draft') return false;
    if (draft.remotePayload || draft.submittedAt || draft.finalInspectionId) return false;

    return true;
}

function getRawInspectionDateForStaleCheck(raw = {}) {
    const candidate = raw.created_at || raw.inspection_date || raw.inspectionDate || raw.createdAt || raw._inspectionDate || null;
    const time = candidate ? new Date(candidate).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
}

function isCloudDraftAlreadyFinalized(draft, finalRows = []) {
    if (!draft) return false;

    const vehicle = draft.vehicleData || {};
    const plate = normalizeDraftCompareText(vehicle.vehiclePlate);
    const phone = normalizeDraftCompareText(vehicle.customerPhone);
    const client = normalizeDraftCompareText(vehicle.customerName);
    const vehicleType = normalizeDraftCompareText(vehicle.vehicleType);
    const inspector = normalizeDraftCompareText(draft.inspectorName || draft.inspectorId || draft.ownerId);
    const draftTime = new Date(draft.updatedAt || draft.createdAt || 0).getTime();

    if (!plate && !phone && !client && !vehicleType) return false;

    return (finalRows || []).some(raw => {
        const finalTime = getRawInspectionDateForStaleCheck(raw);

        // Jangan hapus draft baru hanya karena kendaraan yang sama pernah disubmit dulu.
        // Stale check hanya aktif kalau waktu final tersedia dan final terjadi setelah draft dibuat/diupdate.
        if (!finalTime || !draftTime || finalTime + 3000 < draftTime) return false;

        const insp = normalizeInspectionForReport(raw);
        const inspPlate = normalizeDraftCompareText(insp.vehiclePlate);
        const inspPhone = normalizeDraftCompareText(insp.customerPhone);
        const inspClient = normalizeDraftCompareText(insp.customerName);
        const inspVehicle = normalizeDraftCompareText(insp.vehicleType);
        const inspInspector = normalizeDraftCompareText(insp.inspectorUsername || raw.inspector);

        const plateMatch = plate && inspPlate && plate === inspPlate;
        const phoneMatch = phone && inspPhone && phone === inspPhone;
        const clientMatch = client && inspClient && client === inspClient;
        const vehicleMatch = vehicleType && inspVehicle && vehicleType === inspVehicle;
        const inspectorMatch = !inspector || !inspInspector || inspector === inspInspector;

        return Boolean(plateMatch && inspectorMatch && (phoneMatch || clientMatch || vehicleMatch));
    });
}

async function cleanupCloudActiveInspectionRow(rowId, reason = 'inactive') {
    if (!rowId || typeof supabaseClient === 'undefined' || !supabaseClient || !navigator.onLine) {
        return false;
    }

    try {
        const { error } = await supabaseClient
            .from('active_inspections')
            .delete()
            .eq('id', rowId);

        if (error) throw error;
        console.log('🧹 Cloud active_inspections stale dibersihkan:', { rowId, reason });
        return true;
    } catch (err) {
        console.warn('⚠️ Gagal cleanup cloud active_inspections stale:', { rowId, reason, err });
        return false;
    }
}

async function getCloudActiveInspectionDrafts() {
    if (currentUser?.role !== 'admin') return [];
    if (typeof supabaseClient === 'undefined' || !supabaseClient || !navigator.onLine) return [];

    try {
        const activeResult = await supabaseClient
            .from('active_inspections')
            .select('*')
            .order('created_at', { ascending: false });

        if (activeResult.error) throw activeResult.error;

        let finalRows = [];
        try {
            const finalResult = await supabaseClient
                .from('inspections')
                .select('*')
                .limit(200);
            finalRows = finalResult?.data || [];
        } catch (finalErr) {
            console.warn('⚠️ Final inspections tidak bisa dicek untuk cleanup monitoring:', finalErr?.message || finalErr);
        }

        const data = activeResult.data || [];
        const visibleDrafts = [];

        for (const row of (data || [])) {
            const draft = normalizeCloudActiveInspectionRow(row);

            const isActiveDraft = isStrictActiveInspectionCloudDraft(draft);
            const alreadyFinalized = isCloudDraftAlreadyFinalized(draft, finalRows);

            if (!isActiveDraft || alreadyFinalized) {
                // Non-blocking cleanup: kalau gagal, minimal row tidak ditampilkan.
                cleanupCloudActiveInspectionRow(row.id, alreadyFinalized ? 'already_finalized' : 'not_active_draft');
                continue;
            }

            visibleDrafts.push(draft);
        }

        return visibleDrafts;
    } catch (err) {
        console.warn('⚠️ Gagal mengambil active_inspections dari Supabase:', err);
        return [];
    }
}

function dedupeActiveDrafts(drafts = []) {
    const map = new Map();

    drafts.forEach(draft => {
        const key = String(draft.offlineId || draft.id || draft.activeInspectionId || '').trim();
        if (!key) return;

        const existing = map.get(key);
        if (!existing) {
            map.set(key, draft);
            return;
        }

        const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        const draftTime = new Date(draft.updatedAt || draft.createdAt || 0).getTime();
        if (draftTime >= existingTime) map.set(key, draft);
    });

    return Array.from(map.values()).sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
    });
}

function installInspectionSwitchViewGuard() {
    if (window.__inspectionSwitchViewGuardInstalled) return;
    if (typeof window.switchView !== 'function') return;

    const originalSwitchView = window.switchView;
    window.switchView = function(viewId, ...args) {
        const result = originalSwitchView.call(this, viewId, ...args);

        if (viewId === 'inspectionView') {
            setTimeout(() => {
                if (!isInspectionFormVisible()) prepareInspectionLandingView();
                else hideDraftMonitoringCards();
            }, 0);
        }

        return result;
    };

    window.__inspectionSwitchViewGuardInstalled = true;
}

function getCurrentActiveDraftStorageKeySafe() {
    const ownerId = String(currentUser?.id || currentUser?.username || '').trim();
    return ownerId ? `active_inspection_draft_${ownerId}` : null;
}

async function cleanupSubmittedDraftLocally(draftId) {
    if (!draftId) return;

    try {
        if (typeof clearActiveDraftId === 'function') clearActiveDraftId(draftId);
    } catch (err) {
        console.warn('⚠️ clearActiveDraftId gagal:', err);
    }

    try {
        const key = getCurrentActiveDraftStorageKeySafe();
        if (key && localStorage.getItem(key) === draftId) localStorage.removeItem(key);
    } catch (err) {
        console.warn('⚠️ remove active draft localStorage gagal:', err);
    }

    try {
        if (typeof deleteOfflineInspection === 'function') await deleteOfflineInspection(draftId);
    } catch (err) {
        console.warn('⚠️ deleteOfflineInspection setelah submit gagal:', err);
    }
}

async function cleanupAfterSuccessfulSubmit(draftId, finalInspectionId) {
    try {
        if (draftId && typeof deleteActiveInspectionFromSupabase === 'function') {
            await deleteActiveInspectionFromSupabase(draftId);
        }
    } catch (err) {
        console.warn('⚠️ cleanup active_inspections setelah submit gagal:', err);
    }

    await cleanupSubmittedDraftLocally(draftId);

    inspectionStep = 0;
    inspectionFormData = null;
    inspectionItemsData = {};
    currentOfflineInspectionId = null;
    lastVehicleDraft = '';
    clearEditingInspectionMode();

    clearInspectionFormUi();
    setInspectionFlowActive(false);
    setInspectionUiIdle({ showMonitoring: false });

    // Refresh data Supabase agar history langsung berisi report terbaru.
    try {
        if (typeof loadInitialData === 'function') await loadInitialData();
    } catch (err) {
        console.warn('⚠️ loadInitialData setelah submit gagal:', err);
    }

    // Arahkan ke History. Report detail dibuka setelah data history selesai dimuat.
    try {
        if (typeof switchView === 'function') switchView('historyView');
    } catch (err) {
        console.warn('⚠️ switchView history gagal:', err);
    }

    if (finalInspectionId) {
        setTimeout(() => {
            if (typeof window.viewInspectionReport === 'function') {
                window.viewInspectionReport(finalInspectionId);
            }
        }, 700);
    }
}

function normalizeInspectionForReport(raw = {}) {
    if (!raw) return raw;
    const inspectionDate = raw.inspectionDate || raw.inspection_date || raw.created_at || raw.createdAt || raw._inspectionDate || new Date().toISOString();
    const normalized = {
        ...raw,
        id: raw.id || raw.inspection_id || raw.inspectionId,
        inspectionId: raw.inspectionId || raw.inspection_id || raw.id,
        inspectorUsername: raw.inspectorUsername || raw.inspector || raw.inspector_name || raw.inspectorName || '-',
        customerName: raw.customerName || raw.customer_name || raw.client_name || '-',
        customerPhone: raw.customerPhone || raw.customer_phone || raw.client_phone || '-',
        vehicleType: raw.vehicleType || raw.vehicle_type || '-',
        vehiclePlate: raw.vehiclePlate || raw.vehicle_plate || '-',
        vehicleYear: raw.vehicleYear || raw.vehicle_year || '-',
        vehicleColor: raw.vehicleColor || raw.vehicle_color || '-',
        vehicleTransmission: raw.vehicleTransmission || raw.vehicle_transmission || '-',
        vehicleFuel: raw.vehicleFuel || raw.vehicle_fuel || '-',
        vehicleMileage: raw.vehicleMileage || raw.vehicle_mileage || raw.odometer || '-',
        inspectionDate,
        value: Number(raw.value ?? raw.score ?? raw._value ?? 0) || 0,
        status: raw.status || raw._status || 'completed'
    };
    return normalized;
}


// ================= V20: HISTORY ACCESS + MODAL ROOT FIX =================
function normalizeComparableText(value) {
    return String(value ?? '').trim().toLowerCase();
}

function getCurrentHistoryUserKey() {
    return normalizeComparableText(
        currentUser?.username ||
        currentUser?.name ||
        currentUser?.id ||
        ''
    );
}

function canCurrentUserSeeInspection(rawInspection) {
    if (!currentUser || !rawInspection) return false;

    const role = normalizeComparableText(currentUser.role || 'inspector');
    if (role === 'admin') return true;

    const inspection = normalizeInspectionForReport(rawInspection);
    const currentKey = getCurrentHistoryUserKey();
    const currentId = normalizeComparableText(currentUser.id || '');

    const candidates = [
        inspection.inspectorUsername,
        rawInspection.inspector,
        rawInspection.inspectorUsername,
        rawInspection.inspector_name,
        rawInspection.inspectorName,
        rawInspection.ownerId,
        rawInspection.owner_id,
        rawInspection.inspectorId,
        rawInspection.inspector_id
    ].map(normalizeComparableText).filter(Boolean);

    return Boolean(
        (currentKey && candidates.includes(currentKey)) ||
        (currentId && candidates.includes(currentId))
    );
}

function getVisibleHistoryInspections() {
    return (allInspections || [])
        .map(normalizeInspectionForReport)
        .filter(i => i && (i.vehiclePlate || i.vehicleType) && i.inspectionDate)
        .filter(canCurrentUserSeeInspection)
        .sort((a, b) => new Date(a.inspectionDate || 0).getTime() - new Date(b.inspectionDate || 0).getTime());
}

function updateHistoryHeaderLabel() {
    const historyView = document.getElementById('historyView');
    if (!historyView) return;

    const subtitle = historyView.querySelector('p.text-xs.text-gray-600.font-semibold');
    if (!subtitle) return;

    subtitle.textContent = currentUser?.role === 'admin'
        ? 'Semua laporan dari seluruh user'
        : 'Riwayat laporan milik akun ini';
}

function ensureReportModalAtBodyRoot() {
    const modal = document.getElementById('reportModal');
    if (!modal) return null;

    // Kalau modal berada di dalam elemen lain yang sedang hidden, display:flex di modal tetap tidak terlihat.
    // Pindahkan ke document.body agar overlay selalu muncul di atas halaman.
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }

    return modal;
}

function parseDetailNoteToMeta(note = '') {
    const text = String(note || '');
    const meta = { notes: text };
    const match = text.match(/Kerusakan:\s*([^\n]+)/i);
    if (match) {
        meta.selectedDamage = match[1].trim();
        meta.notes = text.replace(match[0], '').trim();
    }
    return meta;
}

function buildItemsDataFromInspectionDetails(details = []) {
    const result = {};
    (details || []).forEach(detail => {
        const itemName = detail.item_name || detail.itemName || '';
        if (!itemName || itemName.startsWith('Dokumen -') || itemName.startsWith('Aksesori -')) return;

        const item = (sheetItems || []).find(i => String(i.name || '').trim().toLowerCase() === String(itemName).trim().toLowerCase());
        const itemId = item?.id || itemName;
        const status = detail.status || 'good';
        result[itemId] = status;

        const meta = parseDetailNoteToMeta(detail.note || '');
        const photoUrls = String(detail.photo_url || '')
            .split('\n')
            .map(url => url.trim())
            .filter(Boolean)
            .map(url => ({ url, viewUrl: url }));
        if (photoUrls.length > 0) meta.photos = photoUrls;
        result[itemId + '_data'] = meta;
    });
    return result;
}


function buildMetaCheckboxDataFromInspectionDetails(details = []) {
    const documentsData = {};
    const accessoriesData = {};

    const docReverse = {
        'dokumen - bpkb': 'doc_bpkb',
        'dokumen - stnk': 'doc_stnk',
        'dokumen - faktur': 'doc_faktur',
        'dokumen - form a': 'doc_forma',
        'dokumen - kir': 'doc_kir',
        'dokumen - buku manual': 'doc_manual',
        'dokumen - buku servis': 'doc_servis'
    };

    const accReverse = {
        'aksesori - kunci serep': 'acc_kunci_serep',
        'aksesori - kunci roda': 'acc_kunci_roda',
        'aksesori - ban serep': 'acc_ban_serep',
        'aksesori - dongkrak': 'acc_dongkrak'
    };

    (details || []).forEach(detail => {
        const name = String(detail.item_name || detail.itemName || '').trim().toLowerCase();
        const status = String(detail.status || '').trim().toLowerCase();
        const isAvailable = status === 'ada' || status === 'good' || status === 'true' || status === '1';

        if (docReverse[name]) documentsData[docReverse[name]] = isAvailable;
        if (accReverse[name]) accessoriesData[accReverse[name]] = isAvailable;
    });

    return { documentsData, accessoriesData };
}

function getEditingInspectionIdFromDraft(draft = null) {
    const remote = draft?.remotePayload || {};
    return editingInspectionId ||
        draft?.editingInspectionId ||
        remote.existingInspectionId ||
        remote.editingInspectionId ||
        (remote._editMode ? (remote.id || remote.inspection_id || remote.inspectionId) : null) ||
        null;
}

function setEditingInspectionMode(inspectionId, draftId = null) {
    editingInspectionId = inspectionId || null;
    editingSourceDraftId = draftId || null;
}

function clearEditingInspectionMode() {
    editingInspectionId = null;
    editingSourceDraftId = null;
}

async function fetchInspectionDetailsForReport(inspectionId) {
    if (!inspectionId || typeof supabaseClient === 'undefined' || !supabaseClient) return [];
    try {
        const { data, error } = await supabaseClient
            .from('inspection_details')
            .select('*')
            .eq('inspection_id', inspectionId);
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('⚠️ Gagal load inspection_details untuk report:', err);
        return [];
    }
}

function showIdleInspectionState() {
    relocateDraftMonitoringContainer();

    if (isInspectionFormVisible()) {
        setInspectionFlowActive(true);
        hideDraftMonitoringCards();
        return;
    }

    prepareInspectionLandingView();
}

function scheduleItemDraftAutosave(itemId, delay = 700) {
    if (!itemId) return;

    if (itemAutosaveTimers[itemId]) {
        clearTimeout(itemAutosaveTimers[itemId]);
    }

    itemAutosaveTimers[itemId] = setTimeout(() => {
        delete itemAutosaveTimers[itemId];
        saveCurrentInspectionDraft();
        console.log('💾 Autosave checklist item:', itemId);
    }, delay);
}

function touchInspectionItemData(itemId) {
    if (!inspectionItemsData[itemId + '_data']) {
        inspectionItemsData[itemId + '_data'] = {};
    }

    inspectionItemsData[itemId + '_data'].updatedAt = new Date().toISOString();
    return inspectionItemsData[itemId + '_data'];
}


function parseDamageOptions(value) {
    if (Array.isArray(value)) {
        return value.map(v => String(v).trim()).filter(Boolean);
    }

    if (value === null || value === undefined) return [];

    const raw = String(value).trim();
    if (!raw) return [];

    // Supabase jsonb/array kadang kebaca sebagai string JSON: ["Lecet","Retak"]
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map(v => String(v).trim()).filter(Boolean);
        }
    } catch (_) {
        // lanjut ke split biasa
    }

    return raw
        .split(/[,;|\n]+/)
        .map(v => v.trim())
        .filter(Boolean);
}

function getItemDamageOptions(item) {
    if (!item) return [];

    // Field utama dari tabel Supabase items adalah damage_types.
    // Fallback disediakan agar tetap aman kalau ada data lama/camelCase.
    return parseDamageOptions(
        item.damage_types ??
        item.damageTypes ??
        item.damage_type_id ??
        item.damageTypeId ??
        item.damage_type ??
        item.damageType ??
        item.damages
    );
}

function saveCurrentInspectionDraft(extra = {}) {
    if (!currentUser) return null;

    ensureOfflineInspectionId();

    const vehicleData = getVehicleFormData();
    inspectionFormData = {
        ...(inspectionFormData || {}),
        ...vehicleData
    };

    return saveInspectionOffline({
        id: currentOfflineInspectionId,
        vehicleData: inspectionFormData,
        itemsData: inspectionItemsData || {},
        documentsData: getDocumentFormData(),
        accessoriesData: getAccessoryFormData(),
        status: 'draft',
        syncStatus: 'draft',
        ...extra
    }).catch(err => {
        console.error('❌ Gagal menyimpan draft inspeksi:', err);
        return null;
    });
}

        function initInspectionSystem() {
            console.log('🔧 Initializing inspection system...');
            relocateDraftMonitoringContainer();
            installInspectionSwitchViewGuard();
            
            const startBtn = document.getElementById('startNewInspectionBtn');
            const cancelVehicleBtn = document.getElementById('cancelVehicleDataBtn');
            const confirmVehicleBtn = document.getElementById('confirmVehicleDataBtn');
            const cancelInspBtn = document.getElementById('cancelInspectionBtn');
            const submitBtn = document.getElementById('submitInspectionBtn');
            const tabVehicle = document.getElementById('tabVehicleData');
            const tabChecklist = document.getElementById('tabChecklist');
            
            console.log('Button elements:', {
                startBtn: !!startBtn,
                cancelVehicleBtn: !!cancelVehicleBtn,
                confirmVehicleBtn: !!confirmVehicleBtn,
                cancelInspBtn: !!cancelInspBtn,
                submitBtn: !!submitBtn,
                tabVehicle: !!tabVehicle,
                tabChecklist: !!tabChecklist
            });
            
            if (startBtn) startBtn.addEventListener('click', startNewInspection);
            if (cancelVehicleBtn) cancelVehicleBtn.addEventListener('click', cancelInspection);
            if (confirmVehicleBtn) confirmVehicleBtn.addEventListener('click', (e) => {
                console.log('✓ Confirm button clicked');
                proceedToStep2(e);
            });
            if (cancelInspBtn) cancelInspBtn.addEventListener('click', cancelInspection);
            if (submitBtn) submitBtn.addEventListener('click', submitInspection);
            if (tabVehicle) tabVehicle.addEventListener('click', switchToVehicleDataTab);
            if (tabChecklist) tabChecklist.addEventListener('click', switchToChecklistTab);
            
            // ================= AUTOSAVE VEHICLE FORM =================

VEHICLE_FIELD_IDS.forEach(id => {

    const input = document.getElementById(id);

    if (!input) return;

    input.addEventListener('input', () => {

        clearTimeout(vehicleAutosaveTimer);

        vehicleAutosaveTimer = setTimeout(() => {

            ensureOfflineInspectionId();

            const vehicleData = getVehicleFormData();
            const currentDraftString = JSON.stringify(vehicleData);

            if (currentDraftString === lastVehicleDraft) {
                console.log('⏭️ Draft tidak berubah');
                return;
            }

            lastVehicleDraft = currentDraftString;
            inspectionFormData = vehicleData;

            saveCurrentInspectionDraft();

            console.log('💾 Autosave offline per user');

        }, 1000);

    });

});

// ================= AUTOSAVE DOCUMENT & ACCESSORY CHECKBOXES =================
[...DOCUMENT_FIELD_IDS, ...ACCESSORY_FIELD_IDS].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener('change', () => {
        saveCurrentInspectionDraft();
        console.log('💾 Autosave dokumen/aksesoris:', id, input.checked);
    });
});

            // Untuk inspector biasa, draft boleh langsung dibuka lagi setelah refresh.
            // Untuk admin, halaman awal tetap menjadi monitoring; draft admin baru dibuka ketika klik Mulai Inspeksi Baru.
            if (currentUser?.role === 'admin') {
                setInspectionFlowActive(false);
                prepareInspectionLandingView();
            } else {
                restoreOfflineDraft({ showUi: true }).then(restored => {
                    if (!restored) prepareInspectionLandingView();
                });
            }

            console.log('✓ Inspection system ready');
        }

        async function startNewInspection() {
            console.log('📋 Starting/resuming inspection...');
            
            if (!sheetItems || sheetItems.length === 0) {
                showToast('⚠️ Belum ada item inspeksi', 'error');
                return;
            }

            // Setelah refresh, currentOfflineInspectionId kosong.
            // Cek dulu apakah user aktif masih punya draft agar autosave tidak membuat baris baru.
            // Berlaku untuk admin juga, tetapi hanya draft milik akun admin yang sedang login.
            const restored = await restoreOfflineDraft({ showUi: true });
            if (restored) {
                showToast('✓ Draft inspeksi sebelumnya dilanjutkan');
                return;
            }
            

            inspectionStep = 0;
            inspectionFormData = {};
            inspectionItemsData = {};
            clearEditingInspectionMode();
            currentOfflineInspectionId = typeof createOfflineInspectionId === 'function'
                ? createOfflineInspectionId()
                : `${currentUser.id}_${Date.now()}`;
            lastVehicleDraft = '';
            
            document.getElementById('customerName').value = '';
            document.getElementById('customerPhone').value = '';
            document.getElementById('vehicleType').value = '';
            document.getElementById('vehiclePlate').value = '';
            document.getElementById('vehicleYear').value = '';
            document.getElementById('vehicleColor').value = '';
            document.getElementById('vehicleTransmission').value = '';
            document.getElementById('vehicleFuel').value = '';
            document.getElementById('vehicleMileage').value = '';
            fillInspectionMetaData({ documentsData: {}, accessoriesData: {} });
            
            setInspectionFlowActive(true);
            hideDraftMonitoringCards();
            document.getElementById('startNewInspectionBtn').classList.add('hidden');
            document.getElementById('inspectionNavTabs').classList.remove('hidden');
            document.getElementById('vehicleDataSection').classList.remove('hidden');
            document.getElementById('activeInspectionSection').classList.add('hidden');
            document.getElementById('emptyInspectionState').classList.add('hidden');
            
            updateTabUI('vehicle');

// Jangan langsung simpan draft kosong. Draft baru dibuat saat user mulai mengetik/lanjut checklist.
// Saat form inspeksi aktif, monitoring admin harus disembunyikan agar tidak muncul di bawah form.
hideDraftMonitoringCards();

if (currentUser?.role === 'admin') {
    console.log('👑 Admin mode - draft baru akan menjadi milik admin aktif');
}
            console.log('✓ New inspection started');
        }

async function renderDraftInspectionCards() {

    if (!currentUser) return;

    relocateDraftMonitoringContainer();

    const container = document.getElementById('draftInspectionContainer');
    const emptyState = document.getElementById('emptyInspectionState');

    if (!container) return;

    // Monitoring hanya untuk admin dan hanya saat halaman inspeksi sedang idle.
    if (currentUser.role !== 'admin' || isInspectionFormVisible()) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    try {
        const localDrafts = typeof getAllOfflineInspections === 'function'
            ? await getAllOfflineInspections()
            : [];
        const cloudDrafts = await getCloudActiveInspectionDrafts();

        const activeDrafts = dedupeActiveDrafts([...(localDrafts || []), ...(cloudDrafts || [])])
            .filter(isDraftActiveMonitoringCandidate);

        // Untuk admin, container ini muncul di bawah tombol Mulai Inspeksi Baru.
        if (emptyState) emptyState.classList.add('hidden');
        container.classList.remove('hidden');

        if (activeDrafts.length === 0) {
            container.innerHTML = `
<div class="card-modern rounded-2xl shadow-lg p-8 text-center border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50">
    <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shadow-md">
        <span class="text-white text-2xl">📋</span>
    </div>
    <p class="text-gray-700 font-bold mb-2">Belum ada inspeksi berjalan</p>
    <p class="text-gray-500 text-sm leading-relaxed">Monitoring akan muncul di sini saat admin atau inspector mulai mengisi draft inspeksi.</p>
</div>
`;
            return;
        }

        container.innerHTML = activeDrafts.map(draft => {
            const clientName = draft.vehicleData?.customerName || '-';
            const vehicleName = draft.vehicleData?.vehicleType || '-';
            const startTime = draft.createdAt
                ? new Date(draft.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                : '-';

            const statusLabel = 'Sedang inspeksi';
            const statusClass = 'text-green-600';
            const dotClass = 'bg-green-500';

            return `
<div class="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-cyan-50 shadow-sm p-4 mb-3">

    <div class="absolute -top-10 -right-10 w-24 h-24 bg-blue-200/30 rounded-full blur-2xl"></div>

    <div class="relative flex items-start justify-between">

        <div class="flex-1">

            <div class="flex items-center gap-2 mb-3">
                <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
                    <span class="text-white text-sm">👨‍🔧</span>
                </div>

                <div>
                    <p class="text-sm font-bold text-gray-800 leading-tight">${draft.inspectorName || '-'}</p>
                    <div class="flex items-center gap-1 mt-1">
                        <div class="w-2 h-2 rounded-full ${dotClass} animate-pulse"></div>
                        <p class="text-[11px] ${statusClass} font-medium">${statusLabel}</p>
                    </div>
                </div>
            </div>

            <div class="space-y-2">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">🚗</div>
                    <div>
                        <p class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Kendaraan</p>
                        <p class="text-sm font-semibold text-gray-700 leading-tight">${vehicleName}</p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-xl bg-cyan-100 flex items-center justify-center">👤</div>
                    <div>
                        <p class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Client</p>
                        <p class="text-sm font-medium text-gray-700 leading-tight">${clientName}</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="ml-3">
            <div class="px-3 py-2 rounded-2xl bg-white border border-blue-100 shadow-sm text-center min-w-[70px]">
                <p class="text-[10px] text-gray-400 font-semibold uppercase">Mulai</p>
                <p class="text-sm font-bold text-blue-600 mt-1">${startTime}</p>
            </div>
        </div>
    </div>
</div>
`;
        }).join('');

    } catch (err) {
        console.error('❌ Render draft cards gagal:', err);
    }
}

        // ================= RESTORE OFFLINE DRAFT =================

async function restoreOfflineDraft(options = {}) {

    try {

        if (!currentUser) return false;

        // Admin juga boleh auto-restore, tetapi getActiveOfflineInspection()
        // tetap memfilter berdasarkan ownerId akun yang sedang login.
        // Jadi admin tidak akan mengambil draft user lain.
        const draft = typeof getActiveOfflineInspection === 'function'
            ? await getActiveOfflineInspection()
            : await getLastOfflineInspection();

        if (!draft || !hasInspectionDraftContent(draft) || !isDraftActiveMonitoringCandidate(draft)) {

            console.log('📭 Tidak ada draft offline yang perlu direstore');

            return false;
        }

        console.log('📦 Draft ditemukan dan direstore:', draft.id);

        applyOfflineDraftToInspection(draft, {
            showUi: options.showUi !== false,
            preferChecklist: Boolean(options.preferChecklist)
        });

        console.log('✅ Draft berhasil direstore khusus user aktif');
        return true;

    } catch (err) {

        console.error('❌ Restore draft gagal:', err);
        return false;
    }
}

        function switchToVehicleDataTab() {
            console.log('📋 Vehicle data tab');
            document.getElementById('vehicleDataSection').classList.remove('hidden');
            document.getElementById('activeInspectionSection').classList.add('hidden');
            updateTabUI('vehicle');
        }

        function switchToChecklistTab() {
            const customerName = document.getElementById('customerName').value.trim();
            const customerPhone = document.getElementById('customerPhone').value.trim();
            const vehicleType = document.getElementById('vehicleType').value.trim();
            const vehiclePlate = document.getElementById('vehiclePlate').value.trim();
            const vehicleYear = document.getElementById('vehicleYear').value.trim();
            const vehicleColor = document.getElementById('vehicleColor').value.trim();
            const vehicleTransmission = document.getElementById('vehicleTransmission').value.trim();
            const vehicleFuel = document.getElementById('vehicleFuel').value.trim();
            const vehicleMileage = document.getElementById('vehicleMileage').value.trim();
            
            if (!customerName || !customerPhone || !vehicleType || !vehiclePlate || !vehicleYear || !vehicleColor || !vehicleTransmission || !vehicleFuel || !vehicleMileage) {
                showToast('⚠️ Lengkapi data kendaraan', 'error');
                return;
            }
            
            inspectionFormData = { customerName, customerPhone, vehicleType, vehiclePlate, vehicleYear, vehicleColor, vehicleTransmission, vehicleFuel, vehicleMileage };
            
            document.getElementById('vehicleDataSection').classList.add('hidden');
            document.getElementById('activeInspectionSection').classList.remove('hidden');
            
            if (Object.keys(inspectionItemsData).length === 0) {
                renderInspectionItems();
            }
            
            updateTabUI('checklist');
        }

        function updateTabUI(activeTab) {
            const tabVehicle = document.getElementById('tabVehicleData');
            const tabChecklist = document.getElementById('tabChecklist');
            
            if (activeTab === 'vehicle') {
                tabVehicle.classList.remove('border-gray-300', 'text-gray-600');
                tabVehicle.classList.add('bg-white', 'border-2', 'border-blue-400', 'text-blue-700');
                tabChecklist.classList.add('border-gray-300', 'text-gray-600');
                tabChecklist.classList.remove('bg-white', 'border-blue-400', 'text-blue-700');
            } else {
                tabVehicle.classList.add('border-gray-300', 'text-gray-600');
                tabVehicle.classList.remove('bg-white', 'border-blue-400', 'text-blue-700');
                tabChecklist.classList.remove('border-gray-300', 'text-gray-600');
                tabChecklist.classList.add('bg-white', 'border-2', 'border-blue-400', 'text-blue-700');
            }
        }

        function proceedToStep2(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            console.log('📋 Proceeding to Step 2...');
            
            const customerName = document.getElementById('customerName').value.trim();
            const customerPhone = document.getElementById('customerPhone').value.trim();
            const vehicleType = document.getElementById('vehicleType').value.trim();
            const vehiclePlate = document.getElementById('vehiclePlate').value.trim();
            const vehicleYear = document.getElementById('vehicleYear').value.trim();
            const vehicleColor = document.getElementById('vehicleColor').value.trim();
            const vehicleTransmission = document.getElementById('vehicleTransmission').value.trim();
            const vehicleFuel = document.getElementById('vehicleFuel').value.trim();
            const vehicleMileage = document.getElementById('vehicleMileage').value.trim();
            
            console.log('📝 Field values:', {
                customerName: `"${customerName}"`,
                customerPhone: `"${customerPhone}"`,
                vehicleType: `"${vehicleType}"`,
                vehiclePlate: `"${vehiclePlate}"`,
                vehicleYear: `"${vehicleYear}"`,
                vehicleColor: `"${vehicleColor}"`,
                vehicleTransmission: `"${vehicleTransmission}"`,
                vehicleFuel: `"${vehicleFuel}"`,
                vehicleMileage: `"${vehicleMileage}"`
            });
            
            if (!customerName || !customerPhone || !vehicleType || !vehiclePlate || !vehicleYear || !vehicleColor || !vehicleTransmission || !vehicleFuel || !vehicleMileage) {
                const missingFields = [];
                if (!customerName) missingFields.push('Nama Pemesan');
                if (!customerPhone) missingFields.push('No. WhatsApp');
                if (!vehicleType) missingFields.push('Merk/Tipe');
                if (!vehiclePlate) missingFields.push('No. Polisi');
                if (!vehicleYear) missingFields.push('Tahun');
                if (!vehicleColor) missingFields.push('Warna');
                if (!vehicleTransmission) missingFields.push('Transmisi');
                if (!vehicleFuel) missingFields.push('Bahan Bakar');
                if (!vehicleMileage) missingFields.push('Odometer');
                
                showToast(`⚠️ Lengkapi: ${missingFields.join(', ')}`, 'error');
                console.log('❌ Validation failed - missing fields:', missingFields);
                return;
            }
            
            console.log('✓ All fields valid');
            inspectionFormData = { customerName, customerPhone, vehicleType, vehiclePlate, vehicleYear, vehicleColor, vehicleTransmission, vehicleFuel, vehicleMileage };
            inspectionStep = 1;
            
            console.log('📝 Form data saved:', inspectionFormData);

            saveCurrentInspectionDraft();

            console.log('Hiding vehicle section, showing inspection section...');
            
            document.getElementById('vehicleDataSection').classList.add('hidden');
            document.getElementById('activeInspectionSection').classList.remove('hidden');
            
            console.log('Rendering inspection items...');
            renderInspectionItems();
            updateTabUI('checklist');
            
            console.log('✓ Step 2 ready - checklist items visible');
            showToast('✓ Lanjut ke checklist item inspeksi');
        }

        function getInspectionCategoryProgress(items = []) {
            const total = items.length;
            const completed = (items || []).filter(item => {
                const value = inspectionItemsData?.[item.id];
                return value === 'good' || value === 'warning' || value === 'bad';
            }).length;
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
            return { total, completed, percentage };
        }

        function closeOtherInspectionCategories(activeContentId) {
            document.querySelectorAll('[data-inspection-category-content="true"]').forEach(content => {
                if (content.id === activeContentId) return;
                content.classList.add('hidden');
                const section = content.closest('[data-inspection-category-section="true"]');
                const arrow = section?.querySelector('[data-category-arrow="true"]');
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            });
        }

        function toggleInspectionCategory(contentId, arrowId) {
            const content = document.getElementById(contentId);
            const arrow = document.getElementById(arrowId);
            if (!content) return;

            const willOpen = content.classList.contains('hidden');
            if (willOpen) {
                closeOtherInspectionCategories(contentId);
                content.classList.remove('hidden');
                if (arrow) arrow.style.transform = 'rotate(180deg)';
                try {
                    window.__activeInspectionCategoryId = contentId;
                } catch (_) {}
            } else {
                content.classList.add('hidden');
                if (arrow) arrow.style.transform = 'rotate(0deg)';
                try {
                    if (window.__activeInspectionCategoryId === contentId) window.__activeInspectionCategoryId = null;
                } catch (_) {}
            }
        }

        window.toggleInspectionCategory = toggleInspectionCategory;

        function renderInspectionItems() {
            hideDraftMonitoringCards();
            console.log('📊 Rendering items...');
            
            const container = document.getElementById('categoriesInspectionList');
            container.innerHTML = '';
            
            const vehicleDisplay = document.getElementById('vehicleNameDisplay');
            vehicleDisplay.textContent = `🚗 ${inspectionFormData.vehicleType} - ${inspectionFormData.vehiclePlate}`;
            
            const categories = [];
            sheetCategories.forEach(cat => {
                const itemsInCat = sheetItems.filter(item => item.category === cat.name);
                if (itemsInCat.length > 0) {
                    categories.push({ category: cat, items: itemsInCat });
                }
            });
            
            if (categories.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-500 py-4">❌ Tidak ada kategori dengan items</div>';
                return;
            }
            
            categories.forEach(({ category, items }, categoryIndex) => {
                const categorySection = document.createElement('div');
                categorySection.className = 'overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm';
                categorySection.dataset.inspectionCategorySection = 'true';
                
                const safeCategoryKey = String(category.id || category.name || categoryIndex).replace(/[^a-zA-Z0-9_-]/g, '_');
                const contentId = `inspectionCategoryContent_${safeCategoryKey}`;
                const arrowId = `inspectionCategoryArrow_${safeCategoryKey}`;
                const progress = getInspectionCategoryProgress(items);
                const shouldOpen = window.__activeInspectionCategoryId === contentId;
                const progressColor = progress.percentage >= 100 ? 'from-green-500 to-emerald-600' : 'from-blue-500 to-cyan-600';

                const header = document.createElement('button');
                header.type = 'button';
                header.className = 'w-full text-left bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 transition-all hover:from-blue-700 hover:to-blue-800';
                header.innerHTML = `
                    <div class="flex items-center justify-between gap-3">
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="text-base">📁</span>
                                <p class="font-black text-sm truncate">${escapeHtml(category.name)} <span class="font-semibold opacity-90">(${items.length} items)</span></p>
                            </div>
                            <div class="mt-2 flex items-center gap-2">
                                <div class="h-2 flex-1 rounded-full bg-white/30 overflow-hidden">
                                    <div data-category-progress-fill="${safeCategoryKey}" class="h-full rounded-full bg-gradient-to-r ${progressColor} transition-all duration-300" style="width:${progress.percentage}%"></div>
                                </div>
                                <span data-category-progress-text="${safeCategoryKey}" class="text-[11px] font-bold whitespace-nowrap">${progress.completed}/${progress.total}</span>
                            </div>
                        </div>
                        <div class="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                            <i id="${arrowId}" data-category-arrow="true" data-lucide="chevron-down" style="width:20px;height:20px;transition:transform .2s ease;transform:${shouldOpen ? 'rotate(180deg)' : 'rotate(0deg)'};"></i>
                        </div>
                    </div>
                `;
                header.addEventListener('click', () => toggleInspectionCategory(contentId, arrowId));
                categorySection.appendChild(header);

                const content = document.createElement('div');
                content.id = contentId;
                content.dataset.inspectionCategoryContent = 'true';
                content.className = shouldOpen ? 'space-y-3 p-3 bg-gradient-to-br from-blue-50/60 to-cyan-50/60' : 'hidden space-y-3 p-3 bg-gradient-to-br from-blue-50/60 to-cyan-50/60';
                
                items.forEach(item => {
                    const itemCard = createInspectionItemElement(item);
                    content.appendChild(itemCard);
                });

                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-blue-200 bg-white text-blue-700 font-bold text-sm hover:bg-blue-50 transition-all';
                closeBtn.innerHTML = `<i data-lucide="chevron-up" style="width:18px;height:18px;"></i><span>Tutup kategori ini</span>`;
                closeBtn.addEventListener('click', () => toggleInspectionCategory(contentId, arrowId));
                content.appendChild(closeBtn);
                
                categorySection.appendChild(content);
                container.appendChild(categorySection);
            });
            
            updateProgressBar();
            saveCurrentInspectionDraft();
            lucide.createIcons();
        }

        function createInspectionItemElement(item) {
            const wrapper = document.createElement('div');
            wrapper.className = 'space-y-2';
            wrapper.dataset.itemid = item.id;
            
            const itemStatus = inspectionItemsData[item.id];
            const itemData = inspectionItemsData[item.id + '_data'] || {};
            
            let borderClass = 'border-gray-200';
            let bgClass = 'bg-white';
            
            if (itemStatus === 'good') {
                borderClass = 'border-green-400';
                bgClass = 'bg-green-50';
            } else if (itemStatus === 'warning') {
                borderClass = 'border-yellow-400';
                bgClass = 'bg-yellow-50';
            } else if (itemStatus === 'bad') {
                borderClass = 'border-red-400';
                bgClass = 'bg-red-50';
            }
            
            const card = document.createElement('div');
            card.className = `card-modern rounded-lg border-2 p-3 ${borderClass} ${bgClass} ml-2`;
            
            const info = document.createElement('div');
            info.className = 'flex items-start justify-between gap-3';
            
            const title = document.createElement('div');
            title.className = 'flex-1';
            title.innerHTML = `
                <p class="font-bold text-sm text-gray-900">${item.name}</p>
                <p class="text-xs text-gray-600 mt-1">Kritis: ${item.critical_level || 'Low'}</p>
            `;
            
            const buttons = document.createElement('div');
            buttons.className = 'flex gap-2 flex-shrink-0';
            
            ['good', 'warning', 'bad'].forEach(status => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.dataset.itemId = item.id;
                btn.dataset.status = status;
                btn.className = `w-12 h-12 rounded-lg text-lg font-bold transition-all cursor-pointer shadow-md hover:shadow-lg`;
                
                if (status === 'good') {
                    btn.innerHTML = '🟢';
                    btn.className += itemStatus === 'good' ? ' bg-green-500 scale-125 ring-4 ring-green-300' : ' bg-green-100 hover:bg-green-200';
                } else if (status === 'warning') {
                    btn.innerHTML = '🟡';
                    btn.className += itemStatus === 'warning' ? ' bg-yellow-500 scale-125 ring-4 ring-yellow-300' : ' bg-yellow-100 hover:bg-yellow-200';
                } else {
                    btn.innerHTML = '🔴';
                    btn.className += itemStatus === 'bad' ? ' bg-red-500 scale-125 ring-4 ring-red-300' : ' bg-red-100 hover:bg-red-200';
                }
                
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    setItemStatus(item.id, status);
                });
                buttons.appendChild(btn);
            });
            
            info.appendChild(title);
            info.appendChild(buttons);
            card.appendChild(info);
            wrapper.appendChild(card);
            
            if (itemStatus) {
                const damages = getItemDamageOptions(item);
                
                const dropdownContainer = document.createElement('div');
                dropdownContainer.className = 'ml-2 mt-3 space-y-2 p-3 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-lg';
                
                if (itemStatus === 'warning' || itemStatus === 'bad') {
                    const damageLabel = document.createElement('div');
                    damageLabel.className = 'text-xs font-bold text-blue-900 flex items-center gap-2';
                    damageLabel.innerHTML = '🔧 Pilih Jenis Kerusakan:';
                    dropdownContainer.appendChild(damageLabel);

                    if (damages.length > 0) {
                        const damageGrid = document.createElement('div');
                        damageGrid.className = 'grid grid-cols-2 gap-2';

                        damages.forEach(damage => {
                            const isSelected = itemData.selectedDamage === damage;
                            
                            const btn = document.createElement('button');
                            btn.type = 'button';
                            btn.dataset.itemId = item.id;
                            btn.dataset.damage = damage;
                            btn.className = `w-full min-h-[42px] text-left px-3 py-2 rounded-lg font-semibold text-xs transition-all border-2 ${
                                isSelected
                                    ? 'bg-blue-600 border-blue-700 text-white'
                                    : 'bg-white border-blue-300 text-blue-900 hover:bg-blue-100'
                            }`;
                            btn.textContent = `${isSelected ? '✓' : '○'} ${damage}`;
                            
                            btn.addEventListener('click', (e) => {
                                e.preventDefault();
                                setItemDamage(item.id, damage);
                            });
                            
                            damageGrid.appendChild(btn);
                        });

                        dropdownContainer.appendChild(damageGrid);
                    } else {
                        const emptyDamage = document.createElement('div');
                        emptyDamage.className = 'text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-medium';
                        emptyDamage.textContent = 'Belum ada jenis kerusakan yang diset untuk item ini.';
                        dropdownContainer.appendChild(emptyDamage);
                    }
                }
                
                const notesInput = document.createElement('textarea');
                notesInput.placeholder = 'Catatan kondisi...';
                notesInput.className = 'w-full min-h-[42px] px-3 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs font-medium resize-none bg-white';
                notesInput.rows = 1;
                notesInput.value = itemData.notes || '';
                notesInput.addEventListener('input', (e) => {
                    if (!inspectionItemsData[item.id + '_data']) {
                        inspectionItemsData[item.id + '_data'] = {};
                    }
                    inspectionItemsData[item.id + '_data'].notes = e.target.value;
                    inspectionItemsData[item.id + '_data'].updatedAt = new Date().toISOString();
                    scheduleItemDraftAutosave(item.id);
                });
                dropdownContainer.appendChild(notesInput);
                
                const photoContainer = document.createElement('div');
                photoContainer.className = 'space-y-3';
                photoContainer.dataset.photoContainer = 'true';
                
                const galleryPhotoInput = document.createElement('input');
                galleryPhotoInput.type = 'file';
                galleryPhotoInput.accept = 'image/*';
                galleryPhotoInput.multiple = true;
                galleryPhotoInput.id = 'gallery_photo_' + item.id;
                galleryPhotoInput.className = 'hidden';
                galleryPhotoInput.addEventListener('change', (e) => handlePhotoCapture(item.id, e));
                photoContainer.appendChild(galleryPhotoInput);

                const cameraPhotoInput = document.createElement('input');
                cameraPhotoInput.type = 'file';
                cameraPhotoInput.accept = 'image/*';
                cameraPhotoInput.capture = 'environment';
                cameraPhotoInput.multiple = false;
                cameraPhotoInput.id = 'camera_photo_' + item.id;
                cameraPhotoInput.className = 'hidden';
                cameraPhotoInput.addEventListener('change', (e) => handlePhotoCapture(item.id, e));
                photoContainer.appendChild(cameraPhotoInput);

                const photoActionRow = document.createElement('div');
                photoActionRow.className = 'grid grid-cols-2 gap-2';

                const cameraBtn = document.createElement('button');
                cameraBtn.type = 'button';
                cameraBtn.className = 'flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg font-bold text-xs transition-all shadow-md hover:shadow-lg';
                cameraBtn.innerHTML = '<i data-lucide="camera" style="width: 16px; height: 16px;"></i> <span>Kamera</span>';
                cameraBtn.addEventListener('click', () => openLiveCameraCapture(item.id, cameraPhotoInput));
                photoActionRow.appendChild(cameraBtn);

                const galleryBtn = document.createElement('button');
                galleryBtn.type = 'button';
                galleryBtn.className = 'flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-lg font-bold text-xs transition-all shadow-md hover:shadow-lg';
                galleryBtn.innerHTML = '<i data-lucide="image" style="width: 16px; height: 16px;"></i> <span>Galeri</span>';
                galleryBtn.addEventListener('click', () => galleryPhotoInput.click());
                photoActionRow.appendChild(galleryBtn);

                photoContainer.appendChild(photoActionRow);
                
                if (itemData.photos && itemData.photos.length > 0) {
                    const galleryDiv = document.createElement('div');
                    galleryDiv.dataset.photoGallery = 'true';
                    galleryDiv.className = 'grid grid-cols-3 gap-2';
                    
                    itemData.photos.forEach((photo, photoIndex) => {
                        const previewDiv = document.createElement('button');
                        previewDiv.type = 'button';
                        previewDiv.className = 'relative rounded-lg overflow-hidden border-2 border-blue-300 bg-gray-100 h-24 shadow-sm hover:shadow-md transition-all group';
                        previewDiv.setAttribute('aria-label', `Preview foto ${photoIndex + 1}`);
                        previewDiv.addEventListener('click', () => openPhotoPreview(item.id, photoIndex));
                        previewDiv.innerHTML = `
                            <img src="${getPhotoSrc(photo)}" alt="Foto ${photoIndex + 1}" class="w-full h-full object-cover" loading="lazy">
                            <button type="button" class="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-black shadow-lg border border-white/80 transition-all" onclick="event.stopPropagation(); removePhoto('${item.id}', ${photoIndex})" aria-label="Hapus foto">
                                ×
                            </button>
                        `;
                        galleryDiv.appendChild(previewDiv);
                    });
                    
                    photoContainer.appendChild(galleryDiv);
                }
                
                dropdownContainer.appendChild(photoContainer);
                wrapper.appendChild(dropdownContainer);
            }
            
            return wrapper;
        }

        function setItemStatus(itemId, status) {
            inspectionItemsData[itemId] = status;

            const itemMeta = touchInspectionItemData(itemId);

            // Kalau item kembali menjadi good, jangan hapus catatan/foto yang sudah dibuat.
            // Cukup hapus jenis kerusakan karena hanya relevan untuk warning/bad.
            if (status === 'good' && itemMeta.selectedDamage) {
                delete itemMeta.selectedDamage;
            }
            
            const itemElement = document.querySelector(`[data-itemid="${itemId}"]`);
            if (itemElement) {
                const item = sheetItems.find(i => i.id === itemId);
                if (item) {
                    const newElement = createInspectionItemElement(item);
                    itemElement.replaceWith(newElement);
                }
            }
            
            updateProgressBar();
            saveCurrentInspectionDraft();
            lucide.createIcons();
        }

        function setItemDamage(itemId, damage) {
            const itemMeta = touchInspectionItemData(itemId);
            itemMeta.selectedDamage = damage;
            
            const itemElement = document.querySelector(`[data-itemid="${itemId}"]`);
            if (itemElement) {
                const item = sheetItems.find(i => i.id === itemId);
                if (item) {
                    const newElement = createInspectionItemElement(item);
                    itemElement.replaceWith(newElement);
                }
            }
            
            updateProgressBar();
            saveCurrentInspectionDraft();
            lucide.createIcons();
        }


        function getPhotoSrc(photo) {
            if (!photo) return '';
            if (typeof photo === 'string') return photo;
            // previewUrl/localPreview/dataUrl diprioritaskan supaya thumbnail tetap tampil
            // walaupun link Google Drive belum public atau butuh waktu untuk bisa diakses.
            return photo.previewUrl || photo.localPreview || photo.dataUrl || photo.url || photo.photo_url || photo.photoUrl || '';
        }

        function getPhotoRemoteUrl(photo) {
            if (!photo) return '';
            if (typeof photo === 'string') return photo;
            return photo.url || photo.photo_url || photo.photoUrl || photo.driveUrl || photo.remoteUrl || photo.viewUrl || photo.fileUrl || '';
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function escapeAttr(value) {
            return escapeHtml(value).replace(/`/g, '&#096;');
        }

        function extractGoogleDriveFileId(value) {
            const text = String(value || '').trim();
            if (!text) return '';

            const patterns = [
                /[?&]id=([^&#]+)/i,
                /\/d\/([^/]+)/i,
                /file\/d\/([^/]+)/i,
                /open\?id=([^&#]+)/i,
                /uc\?export=view&id=([^&#]+)/i,
                /uc\?id=([^&#]+)/i
            ];

            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1]) return decodeURIComponent(match[1]);
            }

            // Kalau GAS langsung mengirim fileId tanpa URL.
            if (/^[a-zA-Z0-9_-]{20,}$/.test(text) && !text.includes('http')) return text;

            return '';
        }

        function buildDriveImageUrlFromFileId(fileId) {
            return fileId ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}` : '';
        }

        function buildDriveThumbnailUrlFromFileId(fileId, size = 1200) {
            // Endpoint thumbnail Google Drive biasanya lebih stabil untuk ditampilkan sebagai <img>
            // dibanding uc?export=view, selama file/folder punya akses viewer.
            return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${encodeURIComponent(size)}` : '';
        }

        function buildDriveOpenUrlFromFileId(fileId) {
            return fileId ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view` : '';
        }

        function normalizeDrivePhotoUrl(value) {
            const fileId = extractGoogleDriveFileId(value);
            return fileId ? buildDriveImageUrlFromFileId(fileId) : String(value || '');
        }

        function getPhotoFileId(photo) {
            if (!photo) return '';
            if (typeof photo === 'string') return extractGoogleDriveFileId(photo);
            return photo.fileId || photo.file_id || extractGoogleDriveFileId(
                photo.url || photo.photo_url || photo.photoUrl || photo.viewUrl || photo.driveUrl || photo.remoteUrl || photo.fileUrl || ''
            );
        }

        function getPhotoReportSrc(photo) {
            const fileId = getPhotoFileId(photo);
            if (fileId) return buildDriveThumbnailUrlFromFileId(fileId, 1200);

            const remote = getPhotoRemoteUrl(photo);
            if (remote) return normalizeDrivePhotoUrl(remote);

            return getPhotoSrc(photo);
        }

        function getPhotoOpenUrl(photo) {
            const fileId = getPhotoFileId(photo);
            if (fileId) return buildDriveOpenUrlFromFileId(fileId);

            if (photo && typeof photo === 'object') {
                const direct = photo.viewUrl || photo.webViewLink || photo.openUrl || photo.url || photo.photo_url || photo.photoUrl || '';
                if (direct) return direct;
            }

            return getPhotoReportSrc(photo);
        }

        function getGasImageProxyUrl(fileId) {
            if (!fileId || typeof GAS_UPLOAD_URL === 'undefined' || !GAS_UPLOAD_URL) return '';
            const separator = GAS_UPLOAD_URL.includes('?') ? '&' : '?';
            return `${GAS_UPLOAD_URL}${separator}action=getImage&fileId=${encodeURIComponent(fileId)}`;
        }

        function splitInspectionCaption(caption = '', fallback = '') {
            const raw = String(caption || fallback || '').trim();
            if (!raw) return { itemName: 'Foto', extra: '' };

            const parts = raw
                .split(/\s+[—–-]\s+/)
                .map(part => part.trim())
                .filter(Boolean);

            return {
                itemName: parts.shift() || raw,
                extra: parts.join(' - ')
            };
        }

        function buildCaptionHtml(caption = '', fallback = '') {
            const parsed = splitInspectionCaption(caption, fallback);
            const itemHtml = `<span style="font-weight:950;color:#0f172a;">${escapeHtml(parsed.itemName)}</span>`;
            const extraHtml = parsed.extra
                ? ` <span style="font-weight:500;color:#64748b;">(${escapeHtml(parsed.extra)})</span>`
                : '';
            return itemHtml + extraHtml;
        }

        const REPORT_PHOTO_CACHE = window.__REPORT_PHOTO_CACHE || (window.__REPORT_PHOTO_CACHE = new Map());

        function buildReportPhotoHtml(photo, index = 0, caption = '') {
            const localSrc = getPhotoSrc(photo);
            const fileId = getPhotoFileId(photo);
            const openUrl = getPhotoOpenUrl(photo) || localSrc;
            const label = caption || `Foto ${index + 1}`;
            const safeOpenUrl = escapeAttr(openUrl || '#');
            const safeLabel = escapeHtml(label);
            const safeAttrLabel = escapeAttr(label);
            const captionHtml = buildCaptionHtml(label, `Foto ${index + 1}`);

            const isLocalData = localSrc && String(localSrc).startsWith('data:image/');

            if (!fileId && !isLocalData) {
                return `
                    <a href="${safeOpenUrl}" target="_blank" rel="noopener" style="min-height: 180px; border: 1px dashed #cbd5e1; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: #f8fafc; color: #1e40af; font-size: 12px; font-weight: 850; text-align: center; padding: 12px; break-inside: avoid; text-decoration:none;">
                        <span style="font-size:26px;margin-right:8px;">📷</span>
                        <span>${safeLabel}<br><span style="font-weight:650;color:#64748b;">Buka foto asli</span></span>
                    </a>
                `;
            }

            const imgAttr = isLocalData
                ? `src="${escapeAttr(localSrc)}"`
                : `src="" data-report-drive-file-id="${escapeAttr(fileId)}" data-report-photo-label="${safeAttrLabel}"`;

            return `
                <div class="report-photo-card" style="background:#ffffff; border:1px solid #dbeafe; border-radius:16px; overflow:hidden; box-shadow:0 8px 22px rgba(15,23,42,.08); break-inside:avoid; page-break-inside:avoid;">
                    <a href="${safeOpenUrl}" target="_blank" rel="noopener" style="display:block;text-decoration:none;color:inherit;position:relative;background:#eff6ff;">
                        <img ${imgAttr} alt="${safeAttrLabel}" style="display:${isLocalData ? 'block' : 'none'}; width:100%; height:240px; object-fit:cover; background:#e5e7eb;">
                        <div data-photo-loading="true" style="display:${isLocalData ? 'none' : 'flex'}; min-height:240px; align-items:center; justify-content:center; flex-direction:column; gap:9px; color:#1e40af; font-size:12px; font-weight:850; text-align:center; padding:14px;">
                            <span class="lian-report-photo-spinner" aria-hidden="true" style="width:34px;height:34px;border-radius:999px;border:4px solid #bfdbfe;border-top-color:#1d4ed8;display:inline-block;animation:lianReportPhotoSpin .75s linear infinite;"></span>
                            <span>Memuat foto...</span>
                            <span style="font-size:11px;font-weight:650;color:#64748b;">${safeLabel}</span>
                        </div>
                        <div data-photo-fallback="true" style="display:none; min-height:240px; align-items:center; justify-content:center; flex-direction:column; gap:7px; color:#1e40af; font-size:12px; font-weight:850; text-align:center; padding:14px;">
                            <span style="font-size:30px;">📷</span>
                            <span>${safeLabel}</span>
                            <span style="font-size:11px;font-weight:650;color:#64748b;">Klik untuk buka foto asli</span>
                        </div>
                    </a>
                    <div style="padding:10px 12px;border-top:1px solid #e5e7eb;line-height:1.35;font-size:12px;">
                        ${captionHtml}
                    </div>
                </div>
            `;
        }

        function loadImageElement(src) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('Gambar gagal dimuat'));
                image.src = src;
            });
        }

        async function rotatePortraitDataUrlToLandscape(dataUrl) {
            if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return dataUrl;

            const image = await loadImageElement(dataUrl);
            if (!image.naturalWidth || !image.naturalHeight) return dataUrl;

            // Jika portrait cukup jelas, putar 90 derajat agar tampil landscape di laporan.
            if (image.naturalHeight <= image.naturalWidth * 1.12) return dataUrl;

            const canvas = document.createElement('canvas');
            canvas.width = image.naturalHeight;
            canvas.height = image.naturalWidth;
            const ctx = canvas.getContext('2d');
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
            return canvas.toDataURL('image/jpeg', 0.86);
        }

        async function fetchReportPhotoDataUrl(fileId) {
            if (!fileId) throw new Error('fileId kosong');
            if (REPORT_PHOTO_CACHE.has(fileId)) return REPORT_PHOTO_CACHE.get(fileId);

            const proxyUrl = getGasImageProxyUrl(fileId);
            if (!proxyUrl) throw new Error('GAS_UPLOAD_URL belum tersedia');

            const response = await fetch(proxyUrl, { method: 'GET' });
            const text = await response.text();
            let result = null;
            try {
                result = JSON.parse(text);
            } catch (_) {
                throw new Error('Response image proxy bukan JSON valid');
            }

            if (!result.success || !result.dataUrl) {
                throw new Error(result.error || 'GAS tidak mengembalikan dataUrl foto');
            }

            const finalDataUrl = await rotatePortraitDataUrlToLandscape(result.dataUrl);
            REPORT_PHOTO_CACHE.set(fileId, finalDataUrl);
            return finalDataUrl;
        }

        const REPORT_PHOTO_BATCH_SIZE = 6;
        const REPORT_PHOTO_BATCH_CONCURRENCY = 2;

        function chunkArray(items = [], size = 6) {
            const chunks = [];
            for (let i = 0; i < items.length; i += size) {
                chunks.push(items.slice(i, i + size));
            }
            return chunks;
        }

        async function fetchReportPhotoBatchDataUrls(fileIds = []) {
            const uniqueIds = [...new Set((fileIds || []).filter(Boolean))]
                .filter(fileId => !REPORT_PHOTO_CACHE.has(fileId));

            if (uniqueIds.length === 0) return { ok: true, loaded: 0 };
            if (typeof GAS_UPLOAD_URL === 'undefined' || !GAS_UPLOAD_URL) {
                throw new Error('GAS_UPLOAD_URL belum tersedia');
            }

            const response = await fetch(GAS_UPLOAD_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify({
                    action: 'getImages',
                    fileIds: uniqueIds
                })
            });

            const text = await response.text();
            let result = null;
            try {
                result = JSON.parse(text);
            } catch (_) {
                throw new Error('Response GAS batch bukan JSON valid');
            }

            if (!result.success || !Array.isArray(result.images)) {
                throw new Error(result.error || 'GAS batch tidak mengembalikan images');
            }

            let loaded = 0;
            for (const image of result.images) {
                if (!image?.fileId || !image?.success || !image?.dataUrl) continue;
                try {
                    const finalDataUrl = await rotatePortraitDataUrlToLandscape(image.dataUrl);
                    REPORT_PHOTO_CACHE.set(image.fileId, finalDataUrl);
                    loaded += 1;
                } catch (err) {
                    console.warn('Foto batch gagal diproses:', image.fileId, err?.message || err);
                }
            }

            return { ok: true, loaded };
        }

        async function hydrateSingleReportPhoto(img) {
            const fileId = img.dataset.reportDriveFileId;
            const loading = img.parentElement?.querySelector('[data-photo-loading="true"]');
            const fallback = img.parentElement?.querySelector('[data-photo-fallback="true"]');

            if (!fileId) {
                if (loading) loading.style.display = 'none';
                if (fallback) fallback.style.display = 'flex';
                return;
            }

            try {
                const dataUrl = await fetchReportPhotoDataUrl(fileId);
                img.src = dataUrl;
                img.style.display = 'block';
                if (loading) loading.style.display = 'none';
                if (fallback) fallback.style.display = 'none';
            } catch (err) {
                console.warn('⚠️ Foto report gagal dimuat:', fileId, err?.message || err);
                img.removeAttribute('src');
                img.style.display = 'none';
                if (loading) loading.style.display = 'none';
                if (fallback) fallback.style.display = 'flex';
            }
        }

        async function runWithConcurrency(items, limit, worker) {
            const queue = [...items];
            const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
                while (queue.length) {
                    const item = queue.shift();
                    await worker(item);
                }
            });
            await Promise.all(runners);
        }

        async function hydrateReportDrivePhotos() {
            const reportContent = document.getElementById('reportContent');
            if (!reportContent) return;

            const images = Array.from(reportContent.querySelectorAll('img[data-report-drive-file-id]'));
            if (images.length === 0) return;

            const uniqueFileIds = [...new Set(images
                .map(img => img.dataset.reportDriveFileId)
                .filter(Boolean))];
            const missingFileIds = uniqueFileIds.filter(fileId => !REPORT_PHOTO_CACHE.has(fileId));

            console.log(`📷 Load foto laporan: ${images.length} foto, ${missingFileIds.length} belum cache`);

            if (missingFileIds.length > 0) {
                const chunks = chunkArray(missingFileIds, REPORT_PHOTO_BATCH_SIZE);
                try {
                    await runWithConcurrency(chunks, REPORT_PHOTO_BATCH_CONCURRENCY, async (chunk) => {
                        await fetchReportPhotoBatchDataUrls(chunk);
                    });
                } catch (err) {
                    console.warn('Batch foto gagal, fallback single request:', err?.message || err);
                }
            }

            await runWithConcurrency(images, 4, hydrateSingleReportPhoto);
            console.log('✅ Foto laporan selesai');
        }

        function readFileAsDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(reader.error || new Error('Gagal membaca preview foto'));
                reader.readAsDataURL(file);
            });
        }


        // ================= FOTO OPTIMIZATION =================
        // Tujuan: foto tetap jernih untuk inspeksi, tetapi ukuran file jauh lebih ringan
        // agar Google Drive tidak cepat penuh dan report lebih cepat memuat foto.
        const INSPECTION_PHOTO_OPTIMIZE_CONFIG = {
            maxLongEdge: 1920,          // cukup tajam untuk detail inspeksi mobil
            jpegQuality: 0.82,          // balance jernih vs ukuran file
            thumbnailLongEdge: 420,     // preview lokal kecil untuk IndexedDB/UI
            thumbnailQuality: 0.68,
            skipOptimizationBelowBytes: 450 * 1024
        };

        function formatBytes(bytes = 0) {
            const num = Number(bytes || 0);
            if (num < 1024) return `${num} B`;
            if (num < 1024 * 1024) return `${(num / 1024).toFixed(0)} KB`;
            return `${(num / 1024 / 1024).toFixed(2)} MB`;
        }

        function isImageFile(file) {
            return Boolean(file && String(file.type || '').startsWith('image/'));
        }

        function getOptimizedFileName(file, suffix = 'optimized') {
            const originalName = file?.name || `inspection_photo_${Date.now()}.jpg`;
            const base = originalName.replace(/\.[^/.]+$/, '') || 'inspection_photo';
            return `${base}_${suffix}.jpg`;
        }

        function fileFromBlob(blob, file, suffix = 'optimized') {
            const name = getOptimizedFileName(file, suffix);
            try {
                return new File([blob], name, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
            } catch (_) {
                blob.name = name;
                blob.lastModified = Date.now();
                return blob;
            }
        }

        function loadImageElementFromFile(file) {
            return new Promise((resolve, reject) => {
                if (!isImageFile(file)) {
                    reject(new Error('File bukan gambar'));
                    return;
                }

                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    resolve({
                        img,
                        width: img.naturalWidth || img.width,
                        height: img.naturalHeight || img.height,
                        cleanup: () => URL.revokeObjectURL(url)
                    });
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Gagal memuat gambar untuk optimasi'));
                };
                img.src = url;
            });
        }

        function getScaledDimensions(width, height, maxLongEdge) {
            const w = Number(width || 0);
            const h = Number(height || 0);
            const maxEdge = Math.max(w, h);

            if (!w || !h || maxEdge <= maxLongEdge) {
                return { width: w, height: h, scale: 1 };
            }

            const scale = maxLongEdge / maxEdge;
            return {
                width: Math.max(1, Math.round(w * scale)),
                height: Math.max(1, Math.round(h * scale)),
                scale
            };
        }

        function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.82) {
            return new Promise((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (!blob) reject(new Error('Gagal membuat blob gambar'));
                    else resolve(blob);
                }, type, quality);
            });
        }

        async function resizeImageFile(file, {
            maxLongEdge = INSPECTION_PHOTO_OPTIMIZE_CONFIG.maxLongEdge,
            quality = INSPECTION_PHOTO_OPTIMIZE_CONFIG.jpegQuality,
            suffix = 'optimized',
            allowReturnOriginal = true
        } = {}) {
            if (!isImageFile(file)) return file;

            let loaded = null;
            try {
                loaded = await loadImageElementFromFile(file);

                const { width, height } = getScaledDimensions(
                    loaded.width,
                    loaded.height,
                    maxLongEdge
                );

                if (!width || !height) return file;

                // Kalau file sudah kecil dan dimensinya tidak melebihi batas, pakai original saja.
                const isAlreadySmall =
                    Math.max(loaded.width, loaded.height) <= maxLongEdge &&
                    Number(file.size || 0) <= INSPECTION_PHOTO_OPTIMIZE_CONFIG.skipOptimizationBelowBytes;

                if (allowReturnOriginal && isAlreadySmall && String(file.type || '').includes('jpeg')) {
                    return file;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d', { alpha: false });
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(loaded.img, 0, 0, width, height);

                const blob = await canvasToBlob(canvas, 'image/jpeg', quality);

                // Jika hasil re-encode ternyata lebih besar dan original sudah JPEG, pakai original.
                if (
                    allowReturnOriginal &&
                    String(file.type || '').includes('jpeg') &&
                    Number(blob.size || 0) >= Number(file.size || 0)
                ) {
                    return file;
                }

                return fileFromBlob(blob, file, suffix);
            } catch (err) {
                console.warn('⚠️ Optimasi foto dilewati:', err);
                return file;
            } finally {
                if (loaded?.cleanup) loaded.cleanup();
            }
        }

        async function createSmallPhotoPreviewDataUrl(file) {
            if (!isImageFile(file)) return '';

            let loaded = null;
            try {
                loaded = await loadImageElementFromFile(file);

                const { width, height } = getScaledDimensions(
                    loaded.width,
                    loaded.height,
                    INSPECTION_PHOTO_OPTIMIZE_CONFIG.thumbnailLongEdge
                );

                if (!width || !height) return '';

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d', { alpha: false });
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'medium';
                ctx.drawImage(loaded.img, 0, 0, width, height);

                return canvas.toDataURL('image/jpeg', INSPECTION_PHOTO_OPTIMIZE_CONFIG.thumbnailQuality);
            } catch (err) {
                console.warn('⚠️ Preview kecil gagal dibuat:', err);
                return '';
            } finally {
                if (loaded?.cleanup) loaded.cleanup();
            }
        }

        function appendTemporaryPhotoPreview(itemId, file) {
            const itemElement = document.querySelector(`[data-itemid="${itemId}"]`);
            if (!itemElement || !file) return null;

            let galleryDiv = itemElement.querySelector('[data-photo-gallery="true"]');
            const photoContainer = itemElement.querySelector('[data-photo-container="true"]');

            if (!galleryDiv) {
                galleryDiv = document.createElement('div');
                galleryDiv.dataset.photoGallery = 'true';
                galleryDiv.className = 'grid grid-cols-3 gap-2';
                if (photoContainer) photoContainer.appendChild(galleryDiv);
            }

            const previewUrl = URL.createObjectURL(file);
            const previewDiv = document.createElement('div');
            previewDiv.className = 'relative rounded-lg overflow-hidden border-2 border-blue-300 bg-gray-100 h-24 shadow-sm';
            previewDiv.dataset.tempPhoto = 'true';
            previewDiv.innerHTML = `
                <img src="${previewUrl}" alt="Foto lokal" class="w-full h-full object-cover">
                <div class="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] text-center py-1 font-semibold flex items-center justify-center gap-1">
                    <span class="inline-block w-3 h-3 rounded-full border-2 border-white/50 border-t-white animate-spin"></span>
                    <span>Mengupload...</span>
                </div>
            `;
            galleryDiv.prepend(previewDiv);

            return { previewUrl, previewDiv };
        }

        function markTemporaryPhotoFailed(tempPreview) {
            if (!tempPreview?.previewDiv) return;
            const badge = tempPreview.previewDiv.querySelector('div');
            if (badge) {
                badge.textContent = 'Upload gagal';
                badge.className = 'absolute inset-x-0 bottom-0 bg-red-600/90 text-white text-[10px] text-center py-1 font-semibold';
            }
        }

        function clearTemporaryPhotoPreview(tempPreview) {
            if (!tempPreview) return;
            try {
                if (tempPreview.previewUrl) URL.revokeObjectURL(tempPreview.previewUrl);
            } catch (_) {}
            if (tempPreview.previewDiv?.parentNode) {
                tempPreview.previewDiv.remove();
            }
        }

        window.openPhotoPreview = (itemId, photoIndex) => {
            const photo = inspectionItemsData?.[itemId + '_data']?.photos?.[photoIndex];
            const src = getPhotoSrc(photo);
            if (!src) {
                showToast('Foto belum tersedia untuk dipreview', 'error');
                return;
            }

            const existing = document.getElementById('photoPreviewOverlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'photoPreviewOverlay';
            overlay.className = 'fixed inset-0 z-[1000000] bg-black/90 flex items-center justify-center p-4';
            overlay.innerHTML = `
                <div class="relative max-w-5xl max-h-[92vh] flex items-center justify-center">
                    <img src="${src}" alt="Preview foto inspeksi" class="max-w-full max-h-[92vh] object-contain rounded-xl shadow-2xl bg-black" />
                    <button type="button" id="closePhotoPreviewBtn" class="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white text-gray-900 font-black shadow-lg flex items-center justify-center">×</button>
                </div>
            `;

            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) overlay.remove();
            });

            overlay.querySelector('img')?.addEventListener('click', (event) => event.stopPropagation());
            overlay.querySelector('#closePhotoPreviewBtn')?.addEventListener('click', () => overlay.remove());
            document.body.appendChild(overlay);
        };

        function fileToInspectionPhotoFile(blob, prefix = 'camera') {
            const name = `${prefix}_${Date.now()}.jpg`;
            try {
                return new File([blob], name, { type: blob.type || 'image/jpeg' });
            } catch (_) {
                blob.name = name;
                return blob;
            }
        }

        function openLiveCameraCapture(itemId, fallbackInput) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast('Kamera langsung tidak tersedia, membuka pilihan file.', 'error');
                fallbackInput?.click();
                return;
            }

            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 z-[999999] bg-black/85 flex items-center justify-center p-3';
            overlay.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[96vh] overflow-hidden flex flex-col">
                    <div class="px-4 py-3 bg-blue-700 text-white font-bold flex items-center justify-between flex-shrink-0">
                        <span>Ambil Foto Langsung</span>
                        <button type="button" id="closeCameraModalBtn" class="text-white text-xl leading-none">×</button>
                    </div>
                    <div class="p-3 space-y-3 flex-1 overflow-auto">
                        <div class="relative w-full aspect-[9/16] max-h-[72vh] mx-auto rounded-2xl overflow-hidden bg-black shadow-inner">
                            <video id="liveCameraVideo" autoplay playsinline muted class="absolute inset-0 w-full h-full object-cover bg-black"></video>
                        </div>
                        <canvas id="liveCameraCanvas" class="hidden"></canvas>
                        <div class="grid grid-cols-2 gap-2">
                            <button type="button" id="cancelLiveCameraBtn" class="px-4 py-3 rounded-lg bg-gray-100 text-gray-700 font-bold">Batal</button>
                            <button type="button" id="captureLiveCameraBtn" class="px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold">Ambil Foto</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const video = overlay.querySelector('#liveCameraVideo');
            const canvas = overlay.querySelector('#liveCameraCanvas');
            let stream = null;

            const closeCamera = () => {
                if (stream) stream.getTracks().forEach(track => track.stop());
                overlay.remove();
            };

            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) closeCamera();
            });
            overlay.querySelector('#closeCameraModalBtn')?.addEventListener('click', closeCamera);
            overlay.querySelector('#cancelLiveCameraBtn')?.addEventListener('click', closeCamera);

            navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1080 },
                    height: { ideal: 1920 },
                    aspectRatio: { ideal: 9 / 16 }
                },
                audio: false
            }).then(mediaStream => {
                stream = mediaStream;
                video.srcObject = stream;
            }).catch(err => {
                console.error('Kamera gagal dibuka:', err);
                closeCamera();
                showToast('Kamera gagal dibuka, membuka pilihan file.', 'error');
                fallbackInput?.click();
            });

            overlay.querySelector('#captureLiveCameraBtn')?.addEventListener('click', () => {
                if (!video.videoWidth || !video.videoHeight) {
                    showToast('Kamera belum siap, coba lagi.', 'error');
                    return;
                }

                // Hasil foto dibuat portrait 9:16 dengan crop tengah, mengikuti layar kamera.
                const targetRatio = 9 / 16;
                const videoRatio = video.videoWidth / video.videoHeight;
                let sx = 0;
                let sy = 0;
                let sw = video.videoWidth;
                let sh = video.videoHeight;

                if (videoRatio > targetRatio) {
                    sh = video.videoHeight;
                    sw = sh * targetRatio;
                    sx = (video.videoWidth - sw) / 2;
                } else {
                    sw = video.videoWidth;
                    sh = sw / targetRatio;
                    sy = (video.videoHeight - sh) / 2;
                }

                canvas.width = 1080;
                canvas.height = 1920;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(blob => {
                    if (!blob) {
                        showToast('Gagal mengambil foto.', 'error');
                        return;
                    }

                    const file = fileToInspectionPhotoFile(blob, 'camera');
                    closeCamera();
                    processInspectionPhotoFiles(itemId, [file]);
                }, 'image/jpeg', 0.86);
            });
        }

        function extractPhotoMetaFromGasResult(result) {
            if (!result || typeof result !== 'object') return null;

            const rawUrl = result.url ||
                result.fileUrl ||
                result.file_url ||
                result.webViewLink ||
                result.web_view_link ||
                result.driveUrl ||
                result.drive_url ||
                result.link ||
                '';

            const fileId = result.fileId || result.file_id || result.id || extractGoogleDriveFileId(rawUrl) || extractGoogleDriveFileId(result.viewUrl || result.webViewLink || '');
            const imageUrl = fileId ? buildDriveImageUrlFromFileId(fileId) : normalizeDrivePhotoUrl(rawUrl);
            const viewUrl = result.viewUrl || result.webViewLink || result.web_view_link || (fileId ? buildDriveOpenUrlFromFileId(fileId) : rawUrl);

            if (!imageUrl) return null;

            return {
                fileId: fileId || '',
                url: imageUrl,
                photo_url: imageUrl,
                viewUrl: viewUrl || imageUrl,
                rawUrl: rawUrl || imageUrl,
                sharingStatus: result.sharingStatus || result.sharing_status || '',
                uploadedAt: new Date().toISOString()
            };
        }

        function extractPhotoUrlFromGasResult(result) {
            return extractPhotoMetaFromGasResult(result)?.url || null;
        }

        async function uploadPhotoToDrive(file) {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(',')[1]);
                reader.onerror = () => reject(reader.error || new Error('Gagal membaca file foto'));
                reader.readAsDataURL(file);
            });

            const payload = {
                fileName: file.name || `inspection_photo_${Date.now()}.jpg`,
                mimeType: file.type || 'image/jpeg',
                base64
            };

            console.log('UPLOAD URL:', GAS_UPLOAD_URL);

            const response = await fetch(GAS_UPLOAD_URL, {
                method: 'POST',
                // text/plain lebih aman untuk Google Apps Script karena menghindari preflight CORS.
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify(payload)
            });

            const text = await response.text();
            console.log('GAS RAW RESPONSE:', text);

            let result = null;
            try {
                result = JSON.parse(text);
            } catch (err) {
                throw new Error('Response GAS bukan JSON valid: ' + text.slice(0, 120));
            }

            const uploadedPhoto = extractPhotoMetaFromGasResult(result);
            if (uploadedPhoto && uploadedPhoto.url) {
                return uploadedPhoto;
            }

            if (result.success === false) {
                throw new Error(
                    (result.error || 'Upload gagal') +
                    ' — file mungkin sudah dibuat di Google Drive, tetapi GAS belum mengembalikan URL. Perbaiki script GAS agar tetap return url/fileId meskipun setSharing gagal.'
                );
            }

            throw new Error('Upload berhasil diproses, tetapi URL foto tidak ditemukan di response GAS.');
        }

        async function processInspectionPhotoFiles(itemId, files) {
            files = Array.from(files || []);
            if (files.length === 0) return;

            const photos = [];
            const failed = [];
            const tempPreviews = [];
            const localPreviews = [];
            const uploadFiles = [];
            const optimizationStats = [];

            // Thumbnail lokal langsung tampil dari file original supaya user merasa aplikasi merespons cepat.
            files.forEach(file => {
                const temp = appendTemporaryPhotoPreview(itemId, file);
                if (temp) tempPreviews.push(temp);
            });

            showToast(`⏳ Menyiapkan ${files.length} foto...`);

            // Optimasi dilakukan sebelum upload:
            // - file Drive lebih kecil
            // - loading foto report lebih cepat
            // - IndexedDB hanya menyimpan preview kecil, bukan foto full-size
            for (const file of files) {
                try {
                    const optimizedFile = await resizeImageFile(file, {
                        maxLongEdge: INSPECTION_PHOTO_OPTIMIZE_CONFIG.maxLongEdge,
                        quality: INSPECTION_PHOTO_OPTIMIZE_CONFIG.jpegQuality,
                        suffix: 'inspection'
                    });

                    uploadFiles.push(optimizedFile);

                    optimizationStats.push({
                        originalSize: file.size || 0,
                        optimizedSize: optimizedFile.size || file.size || 0,
                        optimized: optimizedFile !== file
                    });

                    // Preview kecil saja yang disimpan ke draft, agar autosave tetap ringan.
                    const smallPreview = await createSmallPhotoPreviewDataUrl(optimizedFile);
                    localPreviews.push(smallPreview || '');
                } catch (err) {
                    console.warn('⚠️ Optimasi foto gagal, upload original:', err);
                    uploadFiles.push(file);
                    optimizationStats.push({
                        originalSize: file.size || 0,
                        optimizedSize: file.size || 0,
                        optimized: false
                    });
                    localPreviews.push('');
                }
            }

            const totalOriginal = optimizationStats.reduce((sum, item) => sum + Number(item.originalSize || 0), 0);
            const totalOptimized = optimizationStats.reduce((sum, item) => sum + Number(item.optimizedSize || 0), 0);

            if (totalOriginal > 0 && totalOptimized > 0) {
                console.log('🖼️ Optimasi foto:', {
                    original: formatBytes(totalOriginal),
                    upload: formatBytes(totalOptimized),
                    hemat: `${Math.max(0, Math.round((1 - totalOptimized / totalOriginal) * 100))}%`
                });
            }

            showToast(`⏳ Upload ${files.length} foto (${formatBytes(totalOptimized)})...`);

            for (let index = 0; index < uploadFiles.length; index++) {
                const file = uploadFiles[index];
                const originalFile = files[index];
                const temp = tempPreviews[index];
                const stat = optimizationStats[index] || {};

                try {
                    const uploadedPhoto = await uploadPhotoToDrive(file);
                    const uploadedUrl = typeof uploadedPhoto === 'string' ? normalizeDrivePhotoUrl(uploadedPhoto) : uploadedPhoto.url;

                    photos.push({
                        ...(typeof uploadedPhoto === 'object' ? uploadedPhoto : {}),
                        url: uploadedUrl,
                        photo_url: uploadedUrl,
                        viewUrl: typeof uploadedPhoto === 'object' ? (uploadedPhoto.viewUrl || getPhotoOpenUrl(uploadedPhoto)) : uploadedUrl,
                        // Preview lokal kecil untuk UI form. Foto asli tetap dari Google Drive.
                        previewUrl: localPreviews[index] || uploadedUrl,
                        fileName: originalFile?.name || file.name || `inspection_photo_${Date.now()}.jpg`,
                        uploadedFileName: file.name || '',
                        mimeType: file.type || 'image/jpeg',
                        originalSize: stat.originalSize || originalFile?.size || 0,
                        optimizedSize: stat.optimizedSize || file.size || 0,
                        optimized: Boolean(stat.optimized),
                        maxLongEdge: INSPECTION_PHOTO_OPTIMIZE_CONFIG.maxLongEdge,
                        uploadedAt: new Date().toISOString()
                    });
                    clearTemporaryPhotoPreview(temp);
                } catch (err) {
                    console.error('Upload error:', err);
                    failed.push(`${originalFile?.name || file.name || 'foto'}: ${err.message || err}`);
                    markTemporaryPhotoFailed(temp);
                }
            }

            if (photos.length > 0) {
                const itemMeta = touchInspectionItemData(itemId);

                if (!Array.isArray(itemMeta.photos)) {
                    itemMeta.photos = [];
                }

                itemMeta.photos.push(...photos);
                itemMeta.updatedAt = new Date().toISOString();

                const itemElement = document.querySelector(`[data-itemid="${itemId}"]`);

                if (itemElement) {
                    const item = sheetItems.find(i => i.id === itemId);

                    if (item) {
                        const newElement = createInspectionItemElement(item);
                        itemElement.replaceWith(newElement);
                    }
                }

                updateProgressBar();
                saveCurrentInspectionDraft();
                lucide.createIcons();

                if (failed.length > 0) {
                    showToast(`⚠️ ${photos.length} foto tersimpan, ${failed.length} gagal`, 'error');
                } else {
                    const savingText = totalOriginal && totalOptimized && totalOptimized < totalOriginal
                        ? ` • hemat ${Math.round((1 - totalOptimized / totalOriginal) * 100)}%`
                        : '';
                    showToast(`✓ ${photos.length} foto berhasil upload${savingText}`);
                }
            } else if (failed.length > 0) {
                showToast('❌ Upload foto gagal. Cek Console/GAS.', 'error');
            }
        }

        window.handlePhotoCapture = async (itemId, e) => {
            const input = e?.target;
            const files = Array.from(input?.files || []);

            if (files.length === 0) return;
            if (input) input.value = '';

            await processInspectionPhotoFiles(itemId, files);
        };


        window.removePhoto = (itemId, photoIndex) => {
            if (inspectionItemsData[itemId + '_data'] && inspectionItemsData[itemId + '_data'].photos) {
                inspectionItemsData[itemId + '_data'].photos.splice(photoIndex, 1);
                inspectionItemsData[itemId + '_data'].updatedAt = new Date().toISOString();
            }
            
            const itemElement = document.querySelector(`[data-itemid="${itemId}"]`);
            if (itemElement) {
                const item = sheetItems.find(i => i.id === itemId);
                if (item) {
                    const newElement = createInspectionItemElement(item);
                    itemElement.replaceWith(newElement);
                }
            }
            
            updateProgressBar();
            saveCurrentInspectionDraft();
            lucide.createIcons();
        };

        function updateProgressBar() {
            const total = sheetItems.length;
            const completed = Object.values(inspectionItemsData).filter(s => typeof s === 'string').length;
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
            
            document.getElementById('progressBar').style.width = percentage + '%';
            document.getElementById('progressText').textContent = `${completed} / ${total}`;

            // Update progress kecil di setiap dropdown kategori tanpa merender ulang item.
            try {
                (sheetCategories || []).forEach((cat, index) => {
                    const safeCategoryKey = String(cat.id || cat.name || index).replace(/[^a-zA-Z0-9_-]/g, '_');
                    const itemsInCat = (sheetItems || []).filter(item => item.category === cat.name);
                    const catProgress = typeof getInspectionCategoryProgress === 'function'
                        ? getInspectionCategoryProgress(itemsInCat)
                        : { total: itemsInCat.length, completed: 0, percentage: 0 };

                    const fill = document.querySelector(`[data-category-progress-fill="${safeCategoryKey}"]`);
                    const text = document.querySelector(`[data-category-progress-text="${safeCategoryKey}"]`);
                    if (fill) fill.style.width = catProgress.percentage + '%';
                    if (text) text.textContent = `${catProgress.completed}/${catProgress.total}`;
                });
            } catch (err) {
                console.warn('⚠️ Update progress kategori gagal:', err);
            }
        }

        function getCurrentInspectionScoreResult() {
            // v59: logika penilaian dipindah ke js/inspection-score.js.
            // Fungsi ini hanya menjadi jembatan agar inspection.js tetap ringan.
            if (window.LianInspectionScore && typeof window.LianInspectionScore.evaluateInspection === 'function') {
                return window.LianInspectionScore.evaluateInspection({
                    items: sheetItems || [],
                    itemsData: inspectionItemsData || {},
                    documentsData: typeof getDocumentFormData === 'function' ? getDocumentFormData() : {},
                    accessoriesData: typeof getAccessoryFormData === 'function' ? getAccessoryFormData() : {}
                });
            }

            return null;
        }

        function calculateValue() {
            const scoreResult = getCurrentInspectionScoreResult();
            if (scoreResult && Number.isFinite(Number(scoreResult.finalScore))) {
                console.log('📊 Score engine result:', scoreResult);
                return Number(scoreResult.finalScore);
            }

            // Fallback lama jika inspection-score.js belum termuat.
            const total = sheetItems.length;
            if (total === 0) return 100;
            
            let goodCount = 0, warningCount = 0, badCount = 0;
            
            Object.entries(inspectionItemsData).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    if (value === 'good') goodCount++;
                    else if (value === 'warning') warningCount++;
                    else if (value === 'bad') badCount++;
                }
            });
            
            return Math.round((goodCount * 100 + warningCount * 60 + badCount * 20) / total);
        }

        function createFinalInspectionUuid() {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                return window.crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

        function mergeNonEmptyVehicleData(base = {}, override = {}) {
            const merged = { ...(base || {}) };
            Object.entries(override || {}).forEach(([key, value]) => {
                const text = String(value ?? '').trim();
                if (text !== '') merged[key] = text;
            });
            return merged;
        }

        async function hydrateInspectionStateBeforeSubmit() {
            ensureOfflineInspectionId();

            let draft = null;
            if (currentOfflineInspectionId && typeof getOfflineInspectionById === 'function') {
                try {
                    draft = await getOfflineInspectionById(currentOfflineInspectionId);
                } catch (err) {
                    console.warn('⚠️ Gagal membaca draft sebelum submit:', err);
                }
            }

            const formVehicle = getVehicleFormData();
            inspectionFormData = mergeNonEmptyVehicleData(
                draft?.vehicleData || inspectionFormData || {},
                formVehicle
            );

            const draftItems = draft?.itemsData || {};
            const currentItems = inspectionItemsData || {};

            // Jangan biarkan state kosong di memori menimpa item yang sudah aman di IndexedDB.
            if (Object.keys(currentItems).length === 0 && Object.keys(draftItems).length > 0) {
                inspectionItemsData = { ...draftItems };
            } else {
                inspectionItemsData = { ...draftItems, ...currentItems };
            }

            return draft;
        }

        function getCompletedInspectionItemCount() {
            return (sheetItems || []).filter(item => {
                const value = inspectionItemsData?.[item.id];
                return value === 'good' || value === 'warning' || value === 'bad';
            }).length;
        }

        async function submitInspection(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            console.log('📤 [1] STARTING: submitInspection() called');

            const btn = document.getElementById('submitInspectionBtn');
            if (btn?.disabled) return;

            const hydratedDraft = await hydrateInspectionStateBeforeSubmit();
            const editTargetInspectionId = getEditingInspectionIdFromDraft(hydratedDraft);

            console.log(editTargetInspectionId ? '✏️ Submit revisi inspeksi' : '📤 Submit inspeksi baru');
            console.log('[2] Form data:', inspectionFormData);
            console.log('[3] Items data keys:', Object.keys(inspectionItemsData || {}));
            console.log('[4] Items data:', inspectionItemsData);
            
            const total = (sheetItems || []).length;
            const completed = getCompletedInspectionItemCount();
            
            console.log(`[5] Progress check - completed: ${completed}, total: ${total}`);
            
            if (total === 0) {
                showToast('⚠️ Item inspeksi belum dimuat', 'error');
                return;
            }

            if (completed < total) {
                const remaining = total - completed;
                console.log(`[6] NOT READY: ${remaining} items still need completion`);
                showToast(`⚠️ Selesaikan ${remaining} item lagi`, 'error');
                return;
            }
            
            console.log('[7] ALL ITEMS COMPLETED - proceeding with submission');
            const scoreResult = getCurrentInspectionScoreResult();
            console.log('📊 Final score before submit:', scoreResult);
            const inspectionId = editTargetInspectionId || createFinalInspectionUuid();
            const inspectionRecord = {
                id: inspectionId,
                inspection_id: inspectionId,
                inspector: currentUser?.username || currentUser?.name || 'unknown',
                customer_name: inspectionFormData.customerName || '',
                customer_phone: inspectionFormData.customerPhone || '',
                vehicle_type: inspectionFormData.vehicleType || '',
                vehicle_plate: inspectionFormData.vehiclePlate || '',
                vehicle_year: inspectionFormData.vehicleYear || '',
                vehicle_color: inspectionFormData.vehicleColor || '',
                vehicle_transmission: inspectionFormData.vehicleTransmission || '',
                vehicle_fuel: inspectionFormData.vehicleFuel || '',
                // Data tambahan ini tidak dikirim sebagai kolom langsung ke Supabase.
                // offline-sync.js akan mengambilnya untuk membuat inspection_details.
                _vehicleData: { ...(inspectionFormData || {}) },
                _itemsData: { ...(inspectionItemsData || {}) },
                _documentsData: getDocumentFormData(),
                _accessoriesData: getAccessoryFormData(),
                _inspectionDate: new Date().toISOString(),
                _value: scoreResult?.finalScore ?? calculateValue(),
                _scoreResult: scoreResult || null,
                _grade: scoreResult?.grade || null,
                _status: 'completed',
                _editMode: Boolean(editTargetInspectionId),
                existingInspectionId: editTargetInspectionId || null,
                editingInspectionId: editTargetInspectionId || null
            };
            
            console.log('[8] Inspection record created with UUID:', inspectionId);
            console.log('[9] Record ready for offline/supabase sync:', inspectionRecord);
            console.log('[10] Calling submitInspectionData()...');
            await submitInspectionData(inspectionRecord);
        }

        async function submitInspectionData(record) {
    console.log('💾 [1] OFFLINE-FIRST: menyimpan inspection...');
    console.log('[2] Inspection record:', record);

    const btn = document.getElementById('submitInspectionBtn');
    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = `
      <div style="display:inline-block;width:16px;height:16px;
      border:2px solid white;border-top-color:transparent;
      border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <span>Menyimpan...</span>
    `;

    try {
        ensureOfflineInspectionId();
        const submittedDraftId = currentOfflineInspectionId;

        await markInspectionReadyToSync(record);

        let syncResult = { ok: false, offline: true };

        if (navigator.onLine) {
            syncResult = await syncOfflineInspectionById(submittedDraftId);
        }

        btn.disabled = false;
        btn.innerHTML = originalHTML;

        const finalInspectionId = syncResult.inspectionId || record.id || record.inspection_id;

        if (syncResult.ok) {
            showToast('✓ Inspeksi final berhasil tersimpan!');
            await cleanupAfterSuccessfulSubmit(submittedDraftId, finalInspectionId);
        } else {
            // Kalau offline/gagal sync, draft tetap disimpan sebagai pending_sync dan boleh direstore.
            showToast('✓ Inspeksi tersimpan offline. Akan sync saat online.');
            hideDraftMonitoringCards();
        }

    } catch (error) {
        console.error('💥 Exception:', error);

        btn.disabled = false;
        btn.innerHTML = originalHTML;

        showToast('❌ Error: ' + (error.message || error), 'error');
    }
}
        function showReportModal(inspectionRecord) {
            console.log('🎯 Showing report modal for inspection:', inspectionRecord.inspectionId || inspectionRecord.id || inspectionRecord.inspection_id);
            generateAndShowReport(inspectionRecord);
            attachReportEventListeners();
        }

        function attachReportEventListeners() {
            const modal = document.getElementById('reportModal');
            const closeBtn = document.getElementById('closeReportBtn');
            const printBtn = document.getElementById('printReportBtn');
            const downloadBtn = document.getElementById('downloadReportBtn');
            const closeActionBtn = document.getElementById('closeReportBtnAction');
            
            if (closeBtn) closeBtn.addEventListener('click', closeReportModalAction);
            if (printBtn) printBtn.addEventListener('click', printReportAction);
            if (downloadBtn) downloadBtn.addEventListener('click', downloadReportAction);
            if (closeActionBtn) closeActionBtn.addEventListener('click', closeReportModalAction);
            
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) closeReportModalAction();
                });
            }
        }

        function closeReportModalAction(e) {
            if (e) e.preventDefault();
            
            const modal = document.getElementById('reportModal');
            modal.classList.remove('active');
            modal.classList.add('hidden');
            modal.style.display = 'none';
            modal.style.visibility = 'hidden';
            document.body.style.overflow = 'auto';
            
            inspectionStep = 0;
            inspectionFormData = null;
            inspectionItemsData = {};
            currentOfflineInspectionId = null;
            lastVehicleDraft = '';
            clearEditingInspectionMode();
            clearInspectionFormUi();
            setInspectionFlowActive(false);
            setInspectionUiIdle({ showMonitoring: true });
            
            showToast('✓ Inspeksi baru siap dimulai');
        }

        function printReportAction(e) {
            if (e) e.preventDefault();
            window.print();
        }

        function downloadReportAction(e) {
            if (e) e.preventDefault();
            
            const reportContent = document.getElementById('reportContent');
            const text = reportContent.innerText || reportContent.textContent;
            const link = document.createElement('a');
            link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
            link.download = `laporan_inspeksi_${Date.now()}.txt`;
            link.click();
            
            showToast('✓ Laporan diunduh!');
        }

        function cancelInspection() {
            resetInspectionRuntime({ clearForm: true, deleteDraft: true });
            
            document.getElementById('inspectionNavTabs').classList.add('hidden');
            document.getElementById('vehicleDataSection').classList.add('hidden');
            document.getElementById('activeInspectionSection').classList.add('hidden');
            document.getElementById('startNewInspectionBtn').classList.remove('hidden');
            setInspectionFlowActive(false);
            showIdleInspectionState();
            
            showToast('Inspeksi dibatalkan');
        }

        

        // ================= V31: DELETE + EDIT REPORT =================
        function collectDriveFileIdsFromDetails(details = []) {
            const ids = new Set();
            (details || []).forEach(detail => {
                const urls = String(detail.photo_url || detail.photoUrl || '')
                    .split(/\n|,/) 
                    .map(v => v.trim())
                    .filter(Boolean);
                urls.forEach(url => {
                    const id = extractGoogleDriveFileId(url);
                    if (id) ids.add(id);
                });
            });
            return Array.from(ids);
        }

        async function deleteDriveFilesViaGas(fileIds = []) {
            const ids = [...new Set((fileIds || []).filter(Boolean))];
            if (ids.length === 0) return { ok: true, deleted: 0 };
            if (typeof GAS_UPLOAD_URL === 'undefined' || !GAS_UPLOAD_URL) {
                return { ok: false, deleted: 0, error: 'GAS_UPLOAD_URL belum tersedia' };
            }

            try {
                const response = await fetch(GAS_UPLOAD_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'deleteFiles', fileIds: ids })
                });
                const text = await response.text();
                const result = JSON.parse(text);
                return {
                    ok: Boolean(result.success),
                    deleted: result.deleted || 0,
                    results: result.results || [],
                    error: result.error || null
                };
            } catch (err) {
                console.warn('⚠️ Hapus foto Drive via GAS gagal:', err);
                return { ok: false, deleted: 0, error: err?.message || String(err) };
            }
        }

        async function getInspectionRowForAction(inspectionId) {
            let inspection = (allInspections || []).find(i => {
                const n = normalizeInspectionForReport(i);
                return String(n.id) === String(inspectionId) || String(n.inspectionId) === String(inspectionId);
            });

            if (!inspection && typeof supabaseClient !== 'undefined' && supabaseClient) {
                const { data, error } = await supabaseClient
                    .from('inspections')
                    .select('*')
                    .eq('id', inspectionId)
                    .maybeSingle();
                if (error) throw error;
                inspection = data;
            }

            if (!inspection) throw new Error('Laporan tidak ditemukan');
            inspection = normalizeInspectionForReport(inspection);
            if (!canCurrentUserSeeInspection(inspection)) throw new Error('Akses laporan ditolak');
            return inspection;
        }

        window.deleteInspectionReport = async (inspectionId) => {
            if (!inspectionId) return;

            const confirmed = confirm('Hapus laporan inspeksi ini? Data laporan, detail item, dan foto Google Drive akan dihapus/dipindahkan ke Trash.');
            if (!confirmed) return;

            try {
                showToast('⏳ Menghapus laporan...');
                const inspection = await getInspectionRowForAction(inspectionId);
                const finalId = inspection.inspectionId || inspection.id;
                const details = await fetchInspectionDetailsForReport(finalId);
                const fileIds = collectDriveFileIdsFromDetails(details);

                if (fileIds.length > 0) {
                    await deleteDriveFilesViaGas(fileIds);
                }

                if (typeof supabaseClient === 'undefined' || !supabaseClient) {
                    throw new Error('Supabase belum tersedia');
                }

                const { error: detailError } = await supabaseClient
                    .from('inspection_details')
                    .delete()
                    .eq('inspection_id', finalId);
                if (detailError) throw detailError;

                const { error: inspectionError } = await supabaseClient
                    .from('inspections')
                    .delete()
                    .eq('id', finalId);
                if (inspectionError) throw inspectionError;

                allInspections = (allInspections || []).filter(i => {
                    const n = normalizeInspectionForReport(i);
                    return String(n.id) !== String(finalId) && String(n.inspectionId) !== String(finalId);
                });

                renderInspectionHistory();
                showToast('✓ Laporan berhasil dihapus');
            } catch (err) {
                console.error('❌ Hapus laporan gagal:', err);
                showToast('❌ Hapus laporan gagal: ' + (err.message || err), 'error');
            }
        };

        window.editInspectionReport = async (inspectionId) => {
            if (!inspectionId) return;

            try {
                showToast('⏳ Membuka data untuk revisi...');
                const inspection = await getInspectionRowForAction(inspectionId);
                const finalId = inspection.inspectionId || inspection.id;
                const details = await fetchInspectionDetailsForReport(finalId);
                const itemsData = buildItemsDataFromInspectionDetails(details);
                const { documentsData, accessoriesData } = buildMetaCheckboxDataFromInspectionDetails(details);

                const vehicleData = {
                    customerName: inspection.customerName || '',
                    customerPhone: inspection.customerPhone || '',
                    vehicleType: inspection.vehicleType || '',
                    vehiclePlate: inspection.vehiclePlate || '',
                    vehicleYear: inspection.vehicleYear || '',
                    vehicleColor: inspection.vehicleColor || '',
                    vehicleTransmission: inspection.vehicleTransmission || '',
                    vehicleFuel: inspection.vehicleFuel || '',
                    vehicleMileage: inspection.vehicleMileage || ''
                };

                const draftId = typeof createOfflineInspectionId === 'function'
                    ? createOfflineInspectionId()
                    : `edit_${finalId}_${Date.now()}`;

                // Tutup modal report dulu agar state modal bersih, baru aktifkan mode revisi.
                closeReportModalAction();

                setEditingInspectionMode(finalId, draftId);
                currentOfflineInspectionId = draftId;
                inspectionFormData = vehicleData;
                inspectionItemsData = itemsData;
                lastVehicleDraft = JSON.stringify(vehicleData || {});

                if (typeof saveInspectionOffline === 'function') {
                    await saveInspectionOffline({
                        id: draftId,
                        vehicleData,
                        itemsData,
                        documentsData,
                        accessoriesData,
                        status: 'draft',
                        syncStatus: 'draft',
                        remotePayload: {
                            id: finalId,
                            inspection_id: finalId,
                            existingInspectionId: finalId,
                            editingInspectionId: finalId,
                            _editMode: true
                        }
                    });
                }

                if (typeof switchView === 'function') switchView('inspectionView');

                applyOfflineDraftToInspection({
                    id: draftId,
                    vehicleData,
                    itemsData,
                    documentsData,
                    accessoriesData,
                    remotePayload: {
                        id: finalId,
                        existingInspectionId: finalId,
                        editingInspectionId: finalId,
                        _editMode: true
                    }
                }, { showUi: true, preferChecklist: true });

                showToast('✓ Mode revisi aktif. Perbaiki data lalu Submit ulang.');
            } catch (err) {
                console.error('❌ Edit laporan gagal:', err);
                showToast('❌ Edit laporan gagal: ' + (err.message || err), 'error');
            }
        };

        // Render inspection history
        function renderInspectionHistory() {
    const list = document.getElementById('inspectionHistoryList');
    if (!list) return;

    list.innerHTML = '';

    updateHistoryHeaderLabel();

    // Admin melihat semua riwayat. Inspector hanya melihat riwayat miliknya sendiri.
    const validInspections = getVisibleHistoryInspections();

    // 🔥 EMPTY STATE (FIX UTAMA)
    if (validInspections.length === 0) {
        list.innerHTML = `
            <div class="col-span-full">
                <div class="relative overflow-hidden rounded-2xl shadow-lg bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-700 p-12 text-center text-white">
                    <div class="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
                    <div class="relative z-10">
                        <div class="mb-4 text-6xl">📋</div>
                        <h3 class="text-3xl font-black mb-2">Belum Ada Riwayat</h3>
                        <p class="text-white/90 mb-6">Mulai inspeksi kendaraan untuk melihat riwayatnya di sini</p>
                        <button onclick="switchView('inspectionView')" class="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-700 rounded-xl font-bold transition-all transform hover:scale-105 shadow-lg">
                            <i data-lucide="play-circle" style="width: 20px; height: 20px;"></i>
                            <span>Mulai Inspeksi Pertama</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // 🔥 RENDER DATA NORMAL
    validInspections.slice().reverse().forEach(inspection => {
        const inspDate = new Date(inspection.inspectionDate);
        const formattedDate = inspDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const formattedTime = inspDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        const statusEmoji = inspection.value >= 80 ? '🟢' : inspection.value >= 50 ? '🟡' : '🔴';
        const statusText = inspection.value >= 80 ? 'Baik' : inspection.value >= 50 ? 'Sedang' : 'Perlu Perbaikan';
        const borderColor = inspection.value >= 80 ? '#10b981' : inspection.value >= 50 ? '#f59e0b' : '#ef4444';

        const card = document.createElement('div');
        card.className = 'card-modern rounded-lg shadow-md hover:shadow-lg transition-all border-l-4 overflow-hidden cursor-pointer group';
        card.style.borderColor = borderColor;

        card.innerHTML = `
            <div class="bg-gradient-to-r from-blue-50 to-cyan-50 p-3 flex items-center justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <h3 class="font-bold text-gray-900 text-sm truncate">${inspection.vehiclePlate}</h3>
                        <span class="text-xl group-hover:scale-110 transition-transform flex-shrink-0">${statusEmoji}</span>
                    </div>
                    <p class="text-xs text-gray-600">${inspection.vehicleType || '-'} • ${inspection.vehicleYear || '-'}</p>
                </div>
                <div class="text-right flex-shrink-0">
                    <p class="text-lg font-black" style="color: ${borderColor};">${inspection.value || 0}%</p>
                    <p class="text-xs font-bold text-gray-600 mt-0.5">${statusText}</p>
                </div>
            </div>
            <div class="px-3 py-2 bg-white border-t border-gray-100 space-y-2">
                <div class="flex items-center justify-between text-xs">
                    <div class="flex items-center gap-1 text-gray-700 min-w-0">
                        <i data-lucide="user" style="width: 14px; height: 14px; color: #6b7280;"></i>
                        <span class="font-semibold truncate">${inspection.customerName || '-'}</span>
                    </div>
                    <span class="text-gray-500 font-medium flex-shrink-0">${formattedDate}</span>
                </div>
                <div class="flex items-center gap-1 text-xs text-gray-600">
                    <i data-lucide="badge-check" style="width: 14px; height: 14px; color: #2563eb;"></i>
                    <span class="font-semibold">Inspector:</span>
                    <span class="font-bold truncate">@${inspection.inspectorUsername || inspection.inspector || '-'}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-gradient-to-r h-full rounded-full transition-all" style="background: linear-gradient(to right, ${borderColor}); width: ${inspection.value || 0}%;"></div>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <button onclick="viewInspectionReport('${inspection.id || ''}')" class="px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-bold text-xs transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 shadow-sm">
                        <i data-lucide="file-text" style="width: 14px; height: 14px;"></i>
                        <span>Laporan</span>
                    </button>
                    <button onclick="editInspectionReport('${inspection.id || ''}')" class="px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg font-bold text-xs transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 shadow-sm">
                        <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                        <span>Edit</span>
                    </button>
                    <button onclick="deleteInspectionReport('${inspection.id || ''}')" class="px-3 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-lg font-bold text-xs transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 shadow-sm">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        <span>Hapus</span>
                    </button>
                </div>
            </div>
        `;

        list.appendChild(card);
    });

    lucide.createIcons();
}

        function generateAndShowReport(inspection) {
            inspection = normalizeInspectionForReport(inspection);
            console.log('📊 [1] STARTING: Generating v25 responsive report for inspection:', inspection.inspectionId);

            const reportModal = ensureReportModalAtBodyRoot();
            const reportContent = document.getElementById('reportContent');
            if (!reportModal || !reportContent) {
                console.error('❌ Report modal elements not found');
                return;
            }

            const reportCard = reportModal.querySelector(':scope > div') || reportModal.firstElementChild;
            if (reportCard) {
                reportCard.style.setProperty('max-width', '1120px', 'important');
                reportCard.style.setProperty('width', '96vw', 'important');
                reportCard.style.setProperty('max-height', '95vh', 'important');
                reportCard.style.setProperty('padding', '18px', 'important');
            }
            reportContent.style.setProperty('max-height', 'calc(95vh - 140px)', 'important');
            reportContent.style.setProperty('overflow-y', 'auto', 'important');
            reportContent.style.setProperty('padding-right', '6px', 'important');

            let itemsData = {};
            try {
                if (inspection._reportItemsData) {
                    itemsData = inspection._reportItemsData;
                } else if (Array.isArray(inspection._details)) {
                    itemsData = buildItemsDataFromInspectionDetails(inspection._details);
                } else {
                    itemsData = JSON.parse(inspection.issues || '{}');
                }
            } catch (e) {
                console.warn('⚠️ Could not parse/build report item data:', e);
                itemsData = {};
            }

            const statusMeta = {
                good: { label: 'OK', longLabel: 'Baik', emoji: '🟢', dot: '#079455', bg: '#dcfce7', color: '#166534', border: '#22c55e', point: 100 },
                warning: { label: 'Perlu diperhatikan', longLabel: 'Perhatian', emoji: '🟡', dot: '#f59e0b', bg: '#fef3c7', color: '#92400e', border: '#f59e0b', point: 60 },
                bad: { label: 'Perlu perbaikan', longLabel: 'Rusak', emoji: '🔴', dot: '#ef4444', bg: '#fee2e2', color: '#991b1b', border: '#ef4444', point: 20 }
            };

            const reportItems = [];
            const categoryMap = new Map();
            (sheetCategories || []).forEach(cat => {
                const itemsInCat = (sheetItems || []).filter(item => item.category === cat.name);
                if (itemsInCat.length > 0) categoryMap.set(cat.name, { category: cat, items: itemsInCat });
            });

            categoryMap.forEach(({ category, items }) => {
                items.forEach(item => {
                    const status = itemsData[item.id];
                    if (!(status === 'good' || status === 'warning' || status === 'bad')) return;
                    const detail = itemsData[item.id + '_data'] || {};
                    const photos = Array.isArray(detail.photos) ? detail.photos : [];
                    reportItems.push({ category, item, status, detail, photos });
                });
            });

            // Fallback jika detail datang dari inspection_details tetapi item master sudah berubah/hilang.
            Object.entries(itemsData || {}).forEach(([key, status]) => {
                if (String(key).endsWith('_data')) return;
                if (!(status === 'good' || status === 'warning' || status === 'bad')) return;
                if (reportItems.some(row => String(row.item.id) === String(key))) return;
                const detail = itemsData[key + '_data'] || {};
                const photos = Array.isArray(detail.photos) ? detail.photos : [];
                reportItems.push({
                    category: { name: detail.category || detail.categoryName || 'Lainnya' },
                    item: { id: key, name: detail.itemName || detail.item_name || key, critical_level: '-' },
                    status,
                    detail,
                    photos
                });
            });

            const total = reportItems.length;
            const goodCount = reportItems.filter(r => r.status === 'good').length;
            const warningCount = reportItems.filter(r => r.status === 'warning').length;
            const badCount = reportItems.filter(r => r.status === 'bad').length;
            const calculatedScore = total > 0 ? Math.round(((goodCount * 100) + (warningCount * 60) + (badCount * 20)) / total) : 0;
            const score = Number.isFinite(Number(inspection.value)) && Number(inspection.value) > 0 ? Number(inspection.value) : calculatedScore;
            const finalStatus = score >= 80 ? 'Layak' : score >= 50 ? 'Layak dengan Catatan' : 'Perlu Perbaikan';
            const scoreColor = score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
            const inspDate = new Date(inspection.inspectionDate || new Date());

            // Temuan penting hanya warna kuning dan merah.
            const importantFindings = reportItems.filter(row => row.status === 'warning' || row.status === 'bad');

            const photoRows = [];
            reportItems.forEach(row => {
                row.photos.forEach((photo, idx) => {
                    const pieces = [row.item.name];
                    if (row.detail?.selectedDamage) pieces.push(row.detail.selectedDamage);
                    if (row.detail?.notes) pieces.push(row.detail.notes);
                    photoRows.push({ photo, caption: pieces.filter(Boolean).join(' — ') || `Foto ${idx + 1}` });
                });
            });

            const grouped = new Map();
            reportItems.forEach(row => {
                const key = row.category?.name || 'Lainnya';
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(row);
            });

            const buildCategoryScore = (rows = []) => {
                if (!rows.length) return 0;
                const totalPoint = rows.reduce((sum, row) => sum + (statusMeta[row.status]?.point || 0), 0);
                return Math.round(totalPoint / rows.length);
            };

            const categoryScoreCards = Array.from(grouped.entries()).map(([categoryName, rows]) => {
                const catScore = buildCategoryScore(rows);
                const catColor = catScore >= 80 ? '#16a34a' : catScore >= 50 ? '#d97706' : '#dc2626';
                const cGood = rows.filter(r => r.status === 'good').length;
                const cWarn = rows.filter(r => r.status === 'warning').length;
                const cBad = rows.filter(r => r.status === 'bad').length;
                return `
                    <div class="report-category-score" style="background:#ffffff; border:1px solid #dbeafe; border-radius:16px; padding:12px; break-inside:avoid; box-shadow:0 8px 20px rgba(15,23,42,.04);">
                        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:9px;">
                            <div style="min-width:0;">
                                <div style="font-size:12px; font-weight:950; color:#0f172a; line-height:1.25;">${escapeHtml(categoryName)}</div>
                                <div style="font-size:10.5px; color:#64748b; font-weight:750; margin-top:4px;">${rows.length} item • ${cGood} baik • ${cWarn} perhatian • ${cBad} rusak</div>
                            </div>
                            <div style="font-size:22px; font-weight:1000; color:${catColor}; line-height:1; white-space:nowrap;">${catScore}%</div>
                        </div>
                        <div style="height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
                            <div style="height:100%; width:${Math.max(0, Math.min(100, catScore))}%; background:${catColor}; border-radius:999px;"></div>
                        </div>
                    </div>
                `;
            }).join('');

            const reportMetaCompleteness = (() => {
                try {
                    if (Array.isArray(inspection._details)) {
                        return buildMetaCheckboxDataFromInspectionDetails(inspection._details);
                    }
                } catch (_) {}

                return {
                    documentsData: inspection._documentsData || inspection.documentsData || {},
                    accessoriesData: inspection._accessoriesData || inspection.accessoriesData || {}
                };
            })();

            const documentReportLabels = [
                ['doc_bpkb', 'BPKB'],
                ['doc_stnk', 'STNK'],
                ['doc_faktur', 'Faktur'],
                ['doc_forma', 'Form A'],
                ['doc_kir', 'KIR'],
                ['doc_manual', 'Buku Manual'],
                ['doc_servis', 'Buku Servis']
            ];

            const accessoryReportLabels = [
                ['acc_kunci_serep', 'Kunci Serep'],
                ['acc_kunci_roda', 'Kunci Roda'],
                ['acc_ban_serep', 'Ban Serep'],
                ['acc_dongkrak', 'Dongkrak']
            ];

            const buildCompletenessChip = (label, isAvailable) => {
                const bg = isAvailable ? '#dcfce7' : '#f1f5f9';
                const color = isAvailable ? '#166534' : '#64748b';
                const border = isAvailable ? '#bbf7d0' : '#e2e8f0';
                const icon = isAvailable ? '✓' : '—';
                return `<span style="display:inline-flex; align-items:center; gap:5px; padding:5px 8px; border-radius:999px; border:1px solid ${border}; background:${bg}; color:${color}; font-size:10.5px; font-weight:900; line-height:1; white-space:nowrap;"><b>${icon}</b>${escapeHtml(label)}</span>`;
            };

            const buildCompletenessGroup = (title, labels = [], data = {}, accent = '#2563eb') => {
                const total = labels.length;
                const checked = labels.filter(([key]) => Boolean(data?.[key])).length;
                return `
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:11px 12px; min-width:0; break-inside:avoid;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:9px;">
                            <div style="font-size:12px; font-weight:1000; color:#0f172a;">${escapeHtml(title)}</div>
                            <div style="font-size:11px; font-weight:1000; color:${accent}; background:#eff6ff; border:1px solid #dbeafe; border-radius:999px; padding:4px 8px; white-space:nowrap;">${checked}/${total} ada</div>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                            ${labels.map(([key, label]) => buildCompletenessChip(label, Boolean(data?.[key]))).join('')}
                        </div>
                    </div>
                `;
            };

            const completenessReportHtml = `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:18px; padding:12px; margin:-4px 0 16px; break-inside:avoid;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:9px;">
                        <div style="font-size:13px; font-weight:1000; color:#0f172a;">Kelengkapan</div>
                        <div style="font-size:10.5px; font-weight:850; color:#64748b;">✓ Ada &nbsp; — Tidak ada</div>
                    </div>
                    <div class="report-completeness-grid" style="display:grid; grid-template-columns:1.3fr .9fr; gap:10px;">
                        ${buildCompletenessGroup('📄 Dokumen', documentReportLabels, reportMetaCompleteness.documentsData || {}, '#7c3aed')}
                        ${buildCompletenessGroup('🔧 Aksesoris', accessoryReportLabels, reportMetaCompleteness.accessoriesData || {}, '#ea580c')}
                    </div>
                </div>`;

            const buildVehicleInfoBlock = () => `
                <div class="report-vehicle-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:0; background:#eef2f7; border-radius:18px; overflow:hidden; border:1px solid #e2e8f0; margin-bottom:16px;">
                    <div style="padding:16px 20px; border-right:1px solid #0f172a33; display:grid; gap:10px;">
                        <div class="report-field-row" style="display:grid; grid-template-columns:120px 1fr; gap:8px; font-size:13px;"><b>No. Polisi</b><span>: ${escapeHtml(String(inspection.vehiclePlate || '-').toUpperCase())}</span></div>
                        <div class="report-field-row" style="display:grid; grid-template-columns:120px 1fr; gap:8px; font-size:13px;"><b>Merk/Tipe</b><span>: ${escapeHtml(inspection.vehicleType || '-')}</span></div>
                        <div class="report-field-row" style="display:grid; grid-template-columns:120px 1fr; gap:8px; font-size:13px;"><b>Tahun</b><span>: ${escapeHtml(inspection.vehicleYear || '-')}</span></div>
                        <div class="report-field-row" style="display:grid; grid-template-columns:120px 1fr; gap:8px; font-size:13px;"><b>Transmisi</b><span>: ${escapeHtml(inspection.vehicleTransmission || '-')}</span></div>
                    </div>
                    <div style="padding:16px 20px; display:grid; gap:10px;">
                        <div class="report-field-row" style="display:grid; grid-template-columns:140px 1fr; gap:8px; font-size:13px;"><b>Warna</b><span>: ${escapeHtml(inspection.vehicleColor || '-')}</span></div>
                        <div class="report-field-row" style="display:grid; grid-template-columns:140px 1fr; gap:8px; font-size:13px;"><b>Bahan Bakar</b><span>: ${escapeHtml(inspection.vehicleFuel || '-')}</span></div>
                        <div class="report-field-row" style="display:grid; grid-template-columns:140px 1fr; gap:8px; font-size:13px;"><b>Odometer</b><span>: ${escapeHtml(inspection.vehicleMileage || '-')} km</span></div>
                        <div class="report-field-row" style="display:grid; grid-template-columns:140px 1fr; gap:8px; font-size:13px;"><b>Status Akhir</b><span>: ${escapeHtml(finalStatus)} (${score}%)</span></div>
                    </div>
                </div>`;

            const reportGuaranteeImages = {
                tabrak: 'report-badge-tabrak.jpg',
                banjir: 'report-badge-banjir.jpg',
                rangka: 'report-badge-rangka-mesin.jpg'
            };

            const guaranteeBadge = (imageSrc, title) => `
                <div class="report-guarantee-badge" style="position:relative; min-width:0; border:1px solid #bfdbfe; border-radius:16px; padding:8px; background:#ffffff; text-align:center; break-inside:avoid; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                    <button type="button" class="report-remove-badge" onclick="this.closest('.report-guarantee-badge').remove()" style="position:absolute; top:8px; right:8px; width:22px; height:22px; border-radius:999px; border:0; background:#fee2e2; color:#dc2626; font-weight:1000; cursor:pointer; line-height:22px; z-index:2;">×</button>
                    <img src="${imageSrc}" alt="${escapeHtml(title)}" style="width:100%; max-width:170px; height:auto; display:block; margin:0 auto; object-fit:contain;" onerror="this.closest('.report-guarantee-badge').innerHTML='<div style=&quot;padding:16px 12px; font-size:12px; font-weight:900; color:#0f172a;&quot;>'+this.alt+'</div>'">
                </div>`;

            const findingsHtml = importantFindings.length > 0 ? `
                <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:18px; padding:14px; margin-bottom:16px; break-inside:avoid;">
                    <div style="font-size:15px; font-weight:1000; color:#9a3412; margin-bottom:10px;">⚠️ Temuan Penting</div>
                    <div class="report-findings-grid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px;">
                        ${importantFindings.map(row => {
                            const s = statusMeta[row.status] || statusMeta.good;
                            const infoParts = [];
                            if (row.detail?.selectedDamage) infoParts.push(row.detail.selectedDamage);
                            if (row.detail?.notes) infoParts.push(row.detail.notes);
                            const infoText = infoParts.length > 0 ? `(${escapeHtml(infoParts.join(' - '))})` : '';
                            return `<div style="background:white; border-left:4px solid ${s.border}; border-radius:13px; padding:11px; min-width:0; box-shadow:0 6px 14px rgba(15,23,42,.04);">
                                <div style="display:flex; justify-content:space-between; gap:10px; align-items:start;">
                                    <div style="min-width:0;">
                                        <div style="font-size:12.5px; color:#0f172a; line-height:1.3;"><span style="font-weight:1000;">${escapeHtml(row.item.name)}</span> ${infoText ? `<span style="font-weight:500;color:#64748b;">${infoText}</span>` : ''}</div>
                                        <div style="font-size:10.5px; color:#64748b; margin-top:3px; font-weight:750;">${escapeHtml(row.category?.name || '-')}</div>
                                    </div>
                                    <div style="background:${s.bg}; color:${s.color}; border-radius:999px; padding:5px 8px; font-size:10.5px; font-weight:950; white-space:nowrap;">${s.emoji} ${s.longLabel}</div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>` : `
                <div style="background:#ecfdf5; border:1px solid #bbf7d0; border-radius:18px; padding:14px; margin-bottom:16px; color:#166534; font-weight:900; text-align:center; break-inside:avoid;">
                    ✅ Tidak ada temuan kuning atau merah pada inspeksi ini.
                </div>`;

            const pointLegend = `
                <div class="report-point-legend" style="display:flex; flex-wrap:wrap; justify-content:center; gap:12px; font-size:12px; font-weight:850; margin:10px 0 16px; color:#0f172a;">
                    <span><span style="display:inline-block;width:13px;height:13px;border-radius:999px;background:#079455;vertical-align:-2px;margin-right:5px;"></span>OK</span>
                    <span><span style="display:inline-block;width:13px;height:13px;border-radius:999px;background:#f59e0b;vertical-align:-2px;margin-right:5px;"></span>Perlu diperhatikan</span>
                    <span><span style="display:inline-block;width:13px;height:13px;border-radius:999px;background:#ef4444;vertical-align:-2px;margin-right:5px;"></span>Perlu perbaikan</span>
                </div>`;

            const inspectionPointsHtml = Array.from(grouped.entries()).map(([categoryName, rows]) => {
                return `
                    <div class="report-point-section" style="break-inside:avoid; page-break-inside:avoid; margin-bottom:16px;">
                        <div style="background:#173b78; color:white; padding:11px 16px; border-radius:12px 12px 0 0; font-size:14px; font-weight:1000; text-align:center;">Poin Inspeksi — ${escapeHtml(categoryName)}</div>
                        <div style="border:1px solid #dbeafe; border-top:0; border-radius:0 0 14px 14px; padding:13px 14px; background:#fff;">
                            <div class="report-point-grid" style="display:grid; grid-template-columns:1fr 1fr; column-gap:36px; row-gap:8px;">
                                ${rows.map(row => {
                                    const s = statusMeta[row.status] || statusMeta.good;
                                    const inlineInfoParts = [];
                                    if (row.detail?.selectedDamage) inlineInfoParts.push(row.detail.selectedDamage);
                                    if (row.detail?.notes) inlineInfoParts.push(row.detail.notes);
                                    const inlineInfo = inlineInfoParts.length > 0
                                        ? ` <span style="font-weight:500;color:#64748b;">(${escapeHtml(inlineInfoParts.join(' - '))})</span>`
                                        : '';
                                    return `<div class="report-point-row" style="display:grid; grid-template-columns:minmax(0,1fr) 18px; gap:8px; align-items:center; min-height:24px; break-inside:avoid;">
                                        <div style="font-size:12.2px; line-height:1.3; color:#111827; min-width:0; overflow-wrap:anywhere;"><span style="font-weight:900;">${escapeHtml(row.item.name)}</span>${inlineInfo}</div>
                                        <span title="${escapeAttr(s.label)}" style="width:14px;height:14px;border-radius:999px;background:${s.dot};display:inline-block;justify-self:end;box-shadow:0 0 0 2px #fff,0 0 0 3px ${s.dot}33;"></span>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>`;
            }).join('');

            const photoSectionHtml = photoRows.length > 0 ? `
                <div style="margin-top:18px; break-inside:avoid;">
                    <div style="background:#1e3a8a; color:white; padding:12px 16px; border-radius:16px; font-size:16px; font-weight:950; text-align:center; margin-bottom:12px;">📸 Foto Dokumentasi</div>
                    <div class="report-photo-grid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px;">
                        ${photoRows.map((row, idx) => buildReportPhotoHtml(row.photo, idx, row.caption)).join('')}
                    </div>
                </div>` : `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:16px; padding:18px; text-align:center; color:#64748b; font-size:13px; font-weight:800;">📷 Belum ada foto dokumentasi pada laporan ini.</div>`;

            const html = `
            <div class="report-v25" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#0f172a; max-width:980px; margin:0 auto;">
                <style>
                    @keyframes lianReportPhotoSpin { to { transform: rotate(360deg); } }
                    @media print {
                        .report-remove-badge, .report-no-print { display:none !important; }
                        .report-v25 { max-width:100% !important; }
                    }
                    @media (max-width: 720px) {
                        .report-v25 { max-width:100% !important; }
                        .report-v25 .report-top,
                        .report-v25 .report-client-bar,
                        .report-v25 .report-vehicle-grid,
                        .report-v25 .report-completeness-grid,
                        .report-v25 .report-category-grid,
                        .report-v25 .report-findings-grid,
                        .report-v25 .report-point-grid,
                        .report-v25 .report-photo-grid { grid-template-columns:1fr !important; }
                        .report-v25 .report-top { gap:10px !important; }
                        .report-v25 .report-top img { height:58px !important; max-width:210px !important; }
                        .report-v25 .report-detail-box { min-width:0 !important; width:100% !important; }
                        .report-v25 .report-client-bar { gap:6px !important; padding:12px !important; font-size:13px !important; }
                        .report-v25 .report-vehicle-grid > div { border-right:none !important; border-bottom:1px solid #0f172a22; padding:14px !important; }
                        .report-v25 .report-vehicle-grid > div:last-child { border-bottom:none !important; }
                        .report-v25 .report-field-row { grid-template-columns:105px 1fr !important; font-size:12px !important; }
                        .report-v25 .report-badges { grid-template-columns:repeat(3,minmax(0,1fr)) !important; gap:6px !important; }
                        .report-v25 .report-guarantee-badge { padding:5px !important; border-radius:12px !important; }
                        .report-v25 .report-guarantee-badge img { width:100% !important; max-width:100% !important; height:auto !important; object-fit:contain !important; }
                        .report-v25 .report-point-row { grid-template-columns:minmax(0,1fr) 18px !important; }
                    }
                </style>

                <div class="report-top" style="display:grid; grid-template-columns:minmax(0,1fr) minmax(215px,300px); gap:14px; align-items:center; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <img src="Untitled-1.png" alt="Lian Inspector" style="height:72px; max-width:260px; object-fit:contain; object-position:left center; display:block; margin-bottom:4px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                        <div style="display:none; color:#1e40af; font-size:26px; font-weight:1000; letter-spacing:.3px; margin-bottom:8px;">LIAN INSPEKTOR</div>
                        <div style="font-size:11.5px; font-weight:900; color:#475569; margin-left:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Laporan Hasil Inspeksi Kendaraan</div>
                    </div>
                    <div class="report-detail-box" style="background:#153b7c; color:white; border-radius:14px; padding:11px 13px; min-width:215px; box-shadow:0 10px 24px rgba(21,59,124,.18);">
                        <div style="display:grid; grid-template-columns:90px 1fr; gap:6px; font-size:12px; line-height:1.45;"><span>Tanggal</span><b>: ${inspDate.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })}</b></div>
                        <div style="display:grid; grid-template-columns:90px 1fr; gap:6px; font-size:12px; line-height:1.45;"><span>Jam</span><b>: ${inspDate.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })}</b></div>
                        <div style="display:grid; grid-template-columns:90px 1fr; gap:6px; font-size:12px; line-height:1.45;"><span>Inspector</span><b>: @${escapeHtml(inspection.inspectorUsername || '-')}</b></div>
                    </div>
                </div>

                <div class="report-client-bar" style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,.85fr); gap:10px; background:#173b78; color:white; border-radius:12px; padding:13px 16px; margin-bottom:16px; font-weight:900; align-items:center;">
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Nama Client : ${escapeHtml(inspection.customerName || '-')}</div>
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">No. WhatsApp : ${escapeHtml(inspection.customerPhone || '-')}</div>
                </div>

                ${buildVehicleInfoBlock()}

                ${completenessReportHtml}

                <div class="report-guarantee-wrap" style="border:1px solid #cbd5e1; border-radius:18px; padding:12px; margin-bottom:18px; background:white; break-inside:avoid;">
                    <div class="report-badges" style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px;">
                        ${guaranteeBadge(reportGuaranteeImages.tabrak, 'Bebas Tabrak')}
                        ${guaranteeBadge(reportGuaranteeImages.banjir, 'Bebas Banjir')}
                        ${guaranteeBadge(reportGuaranteeImages.rangka, 'Nomor Rangka & Mesin Asli')}
                    </div>
                </div>

                <div style="margin-bottom:18px; break-inside:avoid;">
                    <div style="font-size:17px; font-weight:1000; margin-bottom:12px; color:#0f172a;">Kondisi per Kategori</div>
                    <div class="report-category-grid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px;">
                        ${categoryScoreCards || '<div style="grid-column:1/-1; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:14px; padding:16px; text-align:center; color:#64748b; font-weight:800;">Belum ada data kategori yang dapat dihitung.</div>'}
                    </div>
                </div>

                ${findingsHtml}

                <div style="margin-top:18px; margin-bottom:18px;">
                    <div style="background:#173b78; color:white; padding:12px 16px; border-radius:16px; font-size:16px; font-weight:1000; text-align:center;">Poin Inspeksi</div>
                    ${pointLegend}
                    ${inspectionPointsHtml || '<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:14px; padding:16px; text-align:center; color:#64748b; font-weight:800;">Belum ada poin inspeksi yang tersimpan.</div>'}
                </div>

                ${photoSectionHtml}

                <div style="background:#0f172a; color:white; padding:14px; border-radius:16px; margin-top:18px; text-align:center; font-size:12px; break-inside:avoid;">
                    <div style="font-weight:950;">© Lian Inspector 2026</div>
                    <div style="color:#cbd5e1; margin-top:4px;">Laporan hasil inspeksi kendaraan</div>
                </div>
            </div>`;

            reportContent.innerHTML = html;
            reportModal.classList.remove('hidden');
            reportModal.classList.add('active');
            reportModal.style.display = 'flex';
            reportModal.style.visibility = 'visible';
            reportModal.style.opacity = '1';
            reportModal.style.position = 'fixed';
            reportModal.style.inset = '0px';
            reportModal.style.zIndex = '999999';
            document.body.style.overflow = 'hidden';

            attachReportEventListeners();
            lucide.createIcons();
            setTimeout(() => hydrateReportDrivePhotos(), 80);
            showToast('✓ Laporan ditampilkan!');
            console.log('✅ Report ditampilkan');
        }
        window.viewInspectionReport = async (inspectionId) => {
            console.log('👀 Buka laporan:', inspectionId);

            let inspection = (allInspections || []).find(i => {
                const n = normalizeInspectionForReport(i);
                return String(n.id) === String(inspectionId) || String(n.inspectionId) === String(inspectionId);
            });

            if (!inspection && typeof supabaseClient !== 'undefined' && supabaseClient) {
                try {
                    const { data, error } = await supabaseClient
                        .from('inspections')
                        .select('*')
                        .eq('id', inspectionId)
                        .maybeSingle();
                    if (error) throw error;
                    inspection = data;
                } catch (err) {
                    console.warn('⚠️ Gagal ambil inspection dari Supabase:', err);
                }
            }

            if (!inspection) {
                console.error('❌ Inspection not found:', inspectionId);
                showToast('Laporan tidak ditemukan', 'error');
                return;
            }

            inspection = normalizeInspectionForReport(inspection);

            if (!canCurrentUserSeeInspection(inspection)) {
                console.warn('⛔ Akses laporan ditolak untuk user aktif:', {
                    currentUser: currentUser?.username,
                    inspector: inspection.inspectorUsername
                });
                showToast('Laporan ini bukan milik akun Anda', 'error');
                return;
            }

            const details = await fetchInspectionDetailsForReport(inspection.inspectionId || inspection.id);
            inspection._details = details;
            inspection._reportItemsData = buildItemsDataFromInspectionDetails(details);

            console.log('✅ Data laporan siap');

            generateAndShowReport(inspection);
        };

// V27 init guard: pastikan switchView inspection selalu menampilkan landing/monitoring dengan benar.
setTimeout(() => {
    try { installInspectionSwitchViewGuard(); } catch (err) { console.warn('⚠️ installInspectionSwitchViewGuard gagal:', err); }
}, 0);


// V29 console guard: tampilkan console yang lebih ringkas saat aplikasi dipakai harian.
(function installQuietProductionConsole(){
    if (window.__LIAN_QUIET_CONSOLE_INSTALLED) return;
    window.__LIAN_QUIET_CONSOLE_INSTALLED = true;

    const noisyPatterns = [
        'Button elements:',
        'Field values:',
        'Rendering items...',
        'Generated HTML length:',
        'Setting reportContent.innerHTML',
        'HTML injected into reportContent',
        'Report content has',
        'Setting modal visibility styles',
        'FINAL Modal computed styles',
        'Report event listeners attached',
        'Lucide icons created',
        'STARTING: Generating report',
        'Full inspection object',
        'DOM Elements found',
        'Building HTML report',
        'Inspection data:',
        'Draft tersinkron ke active_inspections:',
        'Draft offline tersimpan:',
        'INPUT KETEMU',
        'CLICK WORKING',
        'INITIAL RENDER SELESAI',
        'USERS DARI SUPABASE:',
        'CATEGORIES RAW:',
        'ITEMS RAW:',
        'INSPECTIONS RAW:',
        'sheetItems:',
        'sheetCategories:',
        'itemsToDisplay:'
    ];

    const originalLog = console.log.bind(console);
    console.log = (...args) => {
        const first = String(args[0] || '');
        if (noisyPatterns.some(pattern => first.includes(pattern))) return;
        originalLog(...args);
    };
})();

console.log('✅ inspection.js v30 batch photo report loaded');

// ================= V32: SAFE DELETE/EDIT + APP CONFIRM + ACTIVE QUERY FIX =================
(function() {
    const V32_LOG_PREFIX = 'LIAN';

    function v32Info(message, data) {
        try {
            if (data !== undefined) console.log(`${V32_LOG_PREFIX}: ${message}`, data);
            else console.log(`${V32_LOG_PREFIX}: ${message}`);
        } catch (_) {}
    }

    // Tambahan filter console agar log lama tidak terlalu ramai.
    try {
        if (!window.__lianConsoleFilterV32) {
            window.__lianConsoleFilterV32 = true;
            const previousLog = console.log.bind(console);
            const moreNoisyPatterns = [
                'Confirm button clicked',
                'Proceeding to Step 2',
                'All fields valid',
                'Form data saved',
                'Hiding vehicle section',
                'Step 2 ready',
                'Rendered 5 items successfully',
                'Displaying 5 items',
                'HAS USER:',
                'RENDER STAFF:',
                'Users loaded:',
                'Initializing inspection system',
                'Inspection system ready',
                'Draft aktif tersinkron',
                'Draft revisi direstore',
                'Draft ditemukan dan direstore',
                'Viewing inspection report',
                'Inspection found, generating report',
                'Buka inspection laporan',
                'Data laporan siap',
                'Load foto laporan',
                'Foto laporan selesai',
                'STARTING: Generating v25 responsive report',
                'COMPLETE: v25 responsive report displayed successfully'
            ];

            console.log = (...args) => {
                const first = String(args[0] || '');
                if (moreNoisyPatterns.some(pattern => first.includes(pattern))) return;
                previousLog(...args);
            };
        }
    } catch (_) {}

    function escapeV32(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function closeReportModalOnlyV32() {
        const modal = document.getElementById('reportModal');
        if (!modal) return;
        modal.classList.remove('active');
        modal.classList.add('hidden');
        modal.style.display = 'none';
        modal.style.visibility = 'hidden';
        document.body.style.overflow = 'auto';
    }

    function showAppConfirmDialogV32({
        title = 'Konfirmasi',
        message = '',
        confirmText = 'Ya',
        cancelText = 'Batal',
        danger = false
    } = {}) {
        return new Promise(resolve => {
            const existing = document.getElementById('lianConfirmOverlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'lianConfirmOverlay';
            overlay.className = 'fixed inset-0 z-[1000001] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';
            overlay.innerHTML = `
                <div class="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-200">
                    <div class="p-5">
                        <div class="flex items-start gap-3">
                            <div class="w-11 h-11 rounded-2xl ${danger ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'} flex items-center justify-center text-xl flex-shrink-0">
                                ${danger ? '🗑️' : '❔'}
                            </div>
                            <div class="flex-1 min-w-0">
                                <h3 class="text-lg font-black text-slate-900 leading-tight">${escapeV32(title)}</h3>
                                <p class="mt-2 text-sm text-slate-600 leading-relaxed">${escapeV32(message)}</p>
                            </div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 p-4 pt-0">
                        <button type="button" data-confirm-cancel class="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-all">${escapeV32(cancelText)}</button>
                        <button type="button" data-confirm-ok class="px-4 py-3 rounded-xl ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold transition-all shadow-md">${escapeV32(confirmText)}</button>
                    </div>
                </div>
            `;

            const done = (value) => {
                overlay.remove();
                resolve(value);
            };

            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) done(false);
            });
            overlay.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => done(false));
            overlay.querySelector('[data-confirm-ok]')?.addEventListener('click', () => done(true));
            document.body.appendChild(overlay);
        });
    }

    // Perbaiki warning .catch is not a function dari query active_inspections.
    try {
        getCloudActiveInspectionDrafts = async function() {
            if (currentUser?.role !== 'admin') return [];
            if (typeof supabaseClient === 'undefined' || !supabaseClient || !navigator.onLine) return [];

            try {
                const activeResult = await supabaseClient
                    .from('active_inspections')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (activeResult?.error) throw activeResult.error;

                let finalRows = [];
                const finalResult = await supabaseClient
                    .from('inspections')
                    .select('*')
                    .limit(200);
                if (!finalResult?.error) finalRows = finalResult?.data || [];

                const visibleDrafts = [];
                for (const row of (activeResult?.data || [])) {
                    const draft = typeof normalizeCloudActiveInspectionRow === 'function'
                        ? normalizeCloudActiveInspectionRow(row)
                        : row;

                    const isActive = typeof isStrictActiveInspectionCloudDraft === 'function'
                        ? isStrictActiveInspectionCloudDraft(draft)
                        : true;
                    const finalized = typeof isCloudDraftAlreadyFinalized === 'function'
                        ? isCloudDraftAlreadyFinalized(draft, finalRows)
                        : false;

                    if (!isActive || finalized) {
                        if (typeof cleanupCloudActiveInspectionRow === 'function') {
                            cleanupCloudActiveInspectionRow(row.id, finalized ? 'already_finalized' : 'not_active_draft');
                        }
                        continue;
                    }
                    visibleDrafts.push(draft);
                }
                return visibleDrafts;
            } catch (err) {
                console.warn('⚠️ Monitoring cloud tidak bisa dimuat:', err?.message || err);
                return [];
            }
        };
    } catch (_) {}

    function normalizeActionInspectionIdV32(inspection) {
        const normalized = typeof normalizeInspectionForReport === 'function'
            ? normalizeInspectionForReport(inspection)
            : inspection;
        return normalized?.inspectionId || normalized?.id || inspection?.inspection_id || inspection?.id || null;
    }

    async function refreshHistoryDataV32() {
        try {
            if (typeof loadInitialData === 'function') {
                await loadInitialData();
                return;
            }
        } catch (err) {
            console.warn('⚠️ Refresh data via loadInitialData gagal:', err?.message || err);
        }

        try {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                const { data, error } = await supabaseClient
                    .from('inspections')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (!error && Array.isArray(data)) {
                    allInspections = data;
                    if (typeof sheetInspections !== 'undefined') sheetInspections = data;
                }
            }
        } catch (err) {
            console.warn('⚠️ Refresh history manual gagal:', err?.message || err);
        }
    }

    async function deleteReportRowsFromSupabaseV32(finalId) {
        if (!finalId) throw new Error('ID laporan kosong');
        if (typeof supabaseClient === 'undefined' || !supabaseClient) throw new Error('Supabase belum tersedia');

        const detailDelete = await supabaseClient
            .from('inspection_details')
            .delete()
            .eq('inspection_id', finalId)
            .select('id');
        if (detailDelete?.error) throw detailDelete.error;

        const inspectionDelete = await supabaseClient
            .from('inspections')
            .delete()
            .eq('id', finalId)
            .select('id');
        if (inspectionDelete?.error) throw inspectionDelete.error;

        const verify = await supabaseClient
            .from('inspections')
            .select('id')
            .eq('id', finalId)
            .maybeSingle();
        if (verify?.data?.id) {
            throw new Error('Data laporan masih ada di Supabase setelah proses hapus. Cek RLS/permission tabel inspections.');
        }

        return {
            deletedDetails: Array.isArray(detailDelete?.data) ? detailDelete.data.length : 0,
            deletedInspection: Array.isArray(inspectionDelete?.data) ? inspectionDelete.data.length : 0
        };
    }

    window.deleteInspectionReport = async function(inspectionId) {
        if (!inspectionId) return;

        const ok = await showAppConfirmDialogV32({
            title: 'Hapus laporan inspeksi?',
            message: 'Data laporan, detail item, dan foto Google Drive akan dihapus/dipindahkan ke Trash.',
            confirmText: 'Hapus',
            cancelText: 'Batal',
            danger: true
        });
        if (!ok) return;

        try {
            showToast('⏳ Menghapus laporan...');

            const inspection = await getInspectionRowForAction(inspectionId);
            const finalId = normalizeActionInspectionIdV32(inspection);
            if (!finalId) throw new Error('ID laporan tidak ditemukan');

            const details = await fetchInspectionDetailsForReport(finalId);
            const fileIds = typeof collectDriveFileIdsFromDetails === 'function'
                ? collectDriveFileIdsFromDetails(details)
                : [];

            const deletedRows = await deleteReportRowsFromSupabaseV32(finalId);

            let photoResult = { ok: true, deleted: 0 };
            if (fileIds.length > 0 && typeof deleteDriveFilesViaGas === 'function') {
                photoResult = await deleteDriveFilesViaGas(fileIds);
            }

            allInspections = (allInspections || []).filter(item => {
                const n = normalizeInspectionForReport(item);
                return String(n.id) !== String(finalId) && String(n.inspectionId) !== String(finalId);
            });
            if (typeof sheetInspections !== 'undefined') {
                sheetInspections = (sheetInspections || []).filter(item => {
                    const n = normalizeInspectionForReport(item);
                    return String(n.id) !== String(finalId) && String(n.inspectionId) !== String(finalId);
                });
            }

            await refreshHistoryDataV32();
            if (typeof renderInspectionHistory === 'function') renderInspectionHistory();

            if (photoResult?.ok === false) {
                showToast('✓ Data laporan terhapus. Foto Drive perlu dicek manual.', 'error');
            } else {
                showToast(`✓ Laporan dihapus (${deletedRows.deletedDetails || 0} detail, ${photoResult.deleted || 0} foto)`);
            }
        } catch (err) {
            console.error('❌ Hapus laporan gagal:', err);
            showToast('❌ Hapus laporan gagal: ' + (err.message || err), 'error');
        }
    };

    async function hydrateEditPhotoPreviewsV32(itemsData = {}) {
        const photos = [];
        Object.entries(itemsData || {}).forEach(([key, meta]) => {
            if (!key.endsWith('_data')) return;
            (meta?.photos || []).forEach(photo => {
                const fileId = photo.fileId || (typeof extractGoogleDriveFileId === 'function' ? extractGoogleDriveFileId(photo.url || photo.viewUrl || '') : '');
                if (fileId) {
                    photo.fileId = fileId;
                    photos.push(photo);
                }
            });
        });

        const ids = [...new Set(photos.map(p => p.fileId).filter(Boolean))];
        if (ids.length === 0) return itemsData;

        try {
            if (typeof fetchReportPhotoBatchDataUrls === 'function') {
                const chunks = typeof chunkArray === 'function' ? chunkArray(ids, 6) : [ids];
                for (const chunk of chunks) await fetchReportPhotoBatchDataUrls(chunk);
            }

            photos.forEach(photo => {
                if (typeof REPORT_PHOTO_CACHE !== 'undefined' && REPORT_PHOTO_CACHE.has(photo.fileId)) {
                    photo.previewUrl = REPORT_PHOTO_CACHE.get(photo.fileId);
                }
            });
        } catch (err) {
            console.warn('⚠️ Preview foto revisi belum bisa dimuat:', err?.message || err);
        }

        return itemsData;
    }

    function buildItemsDataFromInspectionDetailsV32(details = []) {
        const result = {};
        (details || []).forEach(detail => {
            const itemName = detail.item_name || detail.itemName || '';
            const normalizedName = String(itemName || '').trim().toLowerCase();
            if (!itemName || normalizedName.startsWith('dokumen -') || normalizedName.startsWith('aksesori -')) return;

            const item = (sheetItems || []).find(i => String(i.name || '').trim().toLowerCase() === normalizedName);
            const itemId = item?.id || itemName;
            const status = detail.status || 'good';
            result[itemId] = status;

            const meta = typeof parseDetailNoteToMeta === 'function'
                ? parseDetailNoteToMeta(detail.note || '')
                : { notes: detail.note || '' };

            const photoUrls = String(detail.photo_url || detail.photoUrl || '')
                .split(/\n|,/)
                .map(url => url.trim())
                .filter(Boolean)
                .map(url => {
                    const fileId = typeof extractGoogleDriveFileId === 'function' ? extractGoogleDriveFileId(url) : '';
                    return { url, viewUrl: url, fileId };
                });

            if (photoUrls.length > 0) meta.photos = photoUrls;
            result[itemId + '_data'] = meta;
        });
        return result;
    }

    window.editInspectionReport = async function(inspectionId) {
        if (!inspectionId) return;

        try {
            showToast('⏳ Membuka mode revisi...');

            const inspection = await getInspectionRowForAction(inspectionId);
            const finalId = normalizeActionInspectionIdV32(inspection);
            const details = await fetchInspectionDetailsForReport(finalId);

            let itemsData = buildItemsDataFromInspectionDetailsV32(details);
            itemsData = await hydrateEditPhotoPreviewsV32(itemsData);
            const { documentsData, accessoriesData } = typeof buildMetaCheckboxDataFromInspectionDetails === 'function'
                ? buildMetaCheckboxDataFromInspectionDetails(details)
                : { documentsData: {}, accessoriesData: {} };

            const vehicleData = {
                customerName: inspection.customerName || '',
                customerPhone: inspection.customerPhone || '',
                vehicleType: inspection.vehicleType || '',
                vehiclePlate: inspection.vehiclePlate || '',
                vehicleYear: inspection.vehicleYear || '',
                vehicleColor: inspection.vehicleColor || '',
                vehicleTransmission: inspection.vehicleTransmission || '',
                vehicleFuel: inspection.vehicleFuel || '',
                vehicleMileage: inspection.vehicleMileage || '-'
            };

            const draftId = typeof createOfflineInspectionId === 'function'
                ? createOfflineInspectionId()
                : `edit_${finalId}_${Date.now()}`;

            closeReportModalOnlyV32();

            if (typeof setEditingInspectionMode === 'function') setEditingInspectionMode(finalId, draftId);
            currentOfflineInspectionId = draftId;
            inspectionFormData = vehicleData;
            inspectionItemsData = itemsData;
            lastVehicleDraft = JSON.stringify(vehicleData || {});
            inspectionStep = 1;

            if (typeof saveInspectionOffline === 'function') {
                await saveInspectionOffline({
                    id: draftId,
                    vehicleData,
                    itemsData,
                    documentsData,
                    accessoriesData,
                    status: 'draft',
                    syncStatus: 'draft',
                    remotePayload: {
                        id: finalId,
                        inspection_id: finalId,
                        existingInspectionId: finalId,
                        editingInspectionId: finalId,
                        _editMode: true
                    }
                });
            }

            if (typeof switchView === 'function') switchView('inspectionView');

            setTimeout(() => {
                try {
                    if (typeof setInspectionFlowActive === 'function') setInspectionFlowActive(true);
                    if (typeof hideDraftMonitoringCards === 'function') hideDraftMonitoringCards();

                    document.getElementById('startNewInspectionBtn')?.classList.add('hidden');
                    document.getElementById('emptyInspectionState')?.classList.add('hidden');
                    document.getElementById('draftInspectionContainer')?.classList.add('hidden');
                    document.getElementById('inspectionNavTabs')?.classList.remove('hidden');
                    document.getElementById('vehicleDataSection')?.classList.add('hidden');
                    document.getElementById('activeInspectionSection')?.classList.remove('hidden');

                    if (typeof fillVehicleForm === 'function') fillVehicleForm(vehicleData);
                    if (typeof fillInspectionMetaData === 'function') fillInspectionMetaData({ documentsData, accessoriesData });
                    if (typeof renderInspectionItems === 'function') renderInspectionItems();
                    if (typeof updateTabUI === 'function') updateTabUI('checklist');
                    if (typeof lucide !== 'undefined') lucide.createIcons();

                    showToast('✓ Mode revisi aktif. Perbaiki data lalu Submit ulang.');
                } catch (innerErr) {
                    console.error('❌ Gagal menampilkan form revisi:', innerErr);
                }
            }, 80);
        } catch (err) {
            console.error('❌ Edit laporan gagal:', err);
            showToast('❌ Edit laporan gagal: ' + (err.message || err), 'error');
        }
    };

    // Override thumbnail source agar foto revisi tidak tampil sebagai broken image jika preview cache sudah tersedia.
    try {
        getPhotoSrc = function(photo) {
            if (!photo) return '';
            if (typeof photo === 'string') return photo;
            if (photo.previewUrl || photo.localPreview || photo.dataUrl) return photo.previewUrl || photo.localPreview || photo.dataUrl;
            const fileId = photo.fileId || (typeof extractGoogleDriveFileId === 'function' ? extractGoogleDriveFileId(photo.url || photo.viewUrl || '') : '');
            if (fileId && typeof REPORT_PHOTO_CACHE !== 'undefined' && REPORT_PHOTO_CACHE.has(fileId)) {
                return REPORT_PHOTO_CACHE.get(fileId);
            }
            return photo.url || photo.photo_url || photo.photoUrl || photo.viewUrl || '';
        };
    } catch (_) {}

    v32Info('v32 delete/edit cleanup aktif');
})();


// =============================================================
// V33 - Delete optimistic + edit flow fix + odometer restore
// =============================================================
(function () {
    const TAG = '[v33]';
    const log = (...args) => console.log(TAG, ...args);
    const warn = (...args) => console.warn(TAG, ...args);

    function esc(v) {
        if (typeof escapeHtml === 'function') return escapeHtml(v);
        return String(v ?? '').replace(/[&<>'"]/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
        }[ch]));
    }

    function getNormalizedInspectionV33(raw) {
        return typeof normalizeInspectionForReport === 'function'
            ? normalizeInspectionForReport(raw)
            : (raw || {});
    }

    function getInspectionIdV33(raw) {
        const n = getNormalizedInspectionV33(raw);
        return n?.inspectionId || n?.id || raw?.inspection_id || raw?.id || null;
    }

    function getCurrentHistoryItemsV33() {
        if (typeof getVisibleHistoryInspections === 'function') return getVisibleHistoryInspections() || [];
        return allInspections || [];
    }

    function removeInspectionFromLocalStateV33(finalId) {
        const keep = item => {
            const id = getInspectionIdV33(item);
            return String(id) !== String(finalId);
        };
        if (typeof allInspections !== 'undefined') allInspections = (allInspections || []).filter(keep);
        if (typeof sheetInspections !== 'undefined') sheetInspections = (sheetInspections || []).filter(keep);
    }

    function removeHistoryCardDomV33(finalId) {
        const selector = `[data-history-inspection-id="${String(finalId).replace(/"/g, '\\"')}"]`;
        document.querySelectorAll(selector).forEach(el => el.remove());

        // Fallback untuk card lama yang belum punya data attribute.
        document.querySelectorAll('button').forEach(btn => {
            const attr = btn.getAttribute('onclick') || '';
            if (attr.includes(String(finalId))) {
                const card = btn.closest('[data-history-inspection-id], .card-modern, .rounded-lg, .rounded-2xl');
                if (card) card.remove();
            }
        });
    }

    function findInspectionInMemoryV33(finalId) {
        return (allInspections || []).find(item => {
            const id = getInspectionIdV33(item);
            return String(id) === String(finalId);
        }) || null;
    }

    async function getInspectionRowForActionV33(inspectionId) {
        let inspection = null;
        if (typeof getInspectionRowForAction === 'function') {
            try { inspection = await getInspectionRowForAction(inspectionId); } catch (_) {}
        }
        if (!inspection) inspection = findInspectionInMemoryV33(inspectionId);
        if (!inspection && typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { data, error } = await supabaseClient
                .from('inspections')
                .select('*')
                .eq('id', inspectionId)
                .maybeSingle();
            if (error) throw error;
            inspection = data;
        }
        if (!inspection) throw new Error('Laporan tidak ditemukan');
        inspection = getNormalizedInspectionV33(inspection);
        if (typeof canCurrentUserSeeInspection === 'function' && !canCurrentUserSeeInspection(inspection)) {
            throw new Error('Akses laporan ditolak');
        }
        return inspection;
    }

    async function appConfirmV33({ title, message, confirmText = 'Hapus', cancelText = 'Batal', danger = true } = {}) {
        if (typeof showAppConfirmDialogV32 === 'function') {
            return showAppConfirmDialogV32({ title, message, confirmText, cancelText, danger });
        }
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 z-[1000001] bg-black/60 flex items-center justify-center p-4';
            overlay.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                    <div class="p-5 border-b border-slate-100">
                        <h3 class="text-lg font-black text-slate-900">${esc(title || 'Konfirmasi')}</h3>
                        <p class="text-sm text-slate-600 mt-2 leading-relaxed">${esc(message || '')}</p>
                    </div>
                    <div class="grid grid-cols-2 gap-3 p-4 bg-slate-50">
                        <button type="button" data-cancel class="px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold">${esc(cancelText)}</button>
                        <button type="button" data-ok class="px-4 py-3 rounded-xl ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold">${esc(confirmText)}</button>
                    </div>
                </div>`;
            const done = (value) => { overlay.remove(); resolve(value); };
            overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
            overlay.querySelector('[data-cancel]')?.addEventListener('click', () => done(false));
            overlay.querySelector('[data-ok]')?.addEventListener('click', () => done(true));
            document.body.appendChild(overlay);
        });
    }

    async function fetchDetailsV33(finalId) {
        if (typeof fetchInspectionDetailsForReport === 'function') {
            try { return await fetchInspectionDetailsForReport(finalId); } catch (err) { warn('detail fetch fallback', err?.message || err); }
        }
        if (typeof supabaseClient === 'undefined' || !supabaseClient) return [];
        const { data, error } = await supabaseClient
            .from('inspection_details')
            .select('*')
            .eq('inspection_id', finalId);
        if (error) throw error;
        return data || [];
    }

    async function deleteRowsV33(finalId) {
        if (typeof supabaseClient === 'undefined' || !supabaseClient) throw new Error('Supabase belum tersedia');
        const detailDelete = await supabaseClient
            .from('inspection_details')
            .delete()
            .eq('inspection_id', finalId);
        if (detailDelete?.error) throw detailDelete.error;

        const inspectionDelete = await supabaseClient
            .from('inspections')
            .delete()
            .eq('id', finalId);
        if (inspectionDelete?.error) throw inspectionDelete.error;

        return { ok: true };
    }

    async function trashPhotosV33(details) {
        const fileIds = typeof collectDriveFileIdsFromDetails === 'function'
            ? collectDriveFileIdsFromDetails(details || [])
            : [];
        if (fileIds.length === 0) return { ok: true, deleted: 0 };
        if (typeof deleteDriveFilesViaGas === 'function') return deleteDriveFilesViaGas(fileIds);
        return { ok: false, deleted: 0, error: 'Fungsi hapus foto GAS belum tersedia' };
    }

    window.deleteInspectionReport = async function (inspectionId) {
        if (!inspectionId) return;

        const ok = await appConfirmV33({
            title: 'Hapus laporan inspeksi?',
            message: 'Data laporan dan foto akan dihapus permanen.',
            confirmText: 'Hapus',
            cancelText: 'Batal',
            danger: true
        });
        if (!ok) return;

        const finalId = String(inspectionId);
        removeInspectionFromLocalStateV33(finalId);
        removeHistoryCardDomV33(finalId);
        if (typeof renderInspectionHistory === 'function') renderInspectionHistory();
        showToast('✓ Laporan dihapus dari tampilan. Menghapus data dan foto...');

        (async () => {
            try {
                let realId = finalId;
                try {
                    const row = await getInspectionRowForActionV33(finalId);
                    realId = getInspectionIdV33(row) || finalId;
                } catch (_) {
                    // Kalau sudah hilang dari local state, pakai id tombol sebagai finalId.
                }

                const details = await fetchDetailsV33(realId);
                await deleteRowsV33(realId);
                const photoResult = await trashPhotosV33(details);

                try {
                    if (typeof refreshHistoryDataV32 === 'function') await refreshHistoryDataV32();
                } catch (_) {}

                if (photoResult?.ok === false) {
                    showToast('⚠️ Data laporan terhapus. Foto perlu dicek manual.', 'error');
                } else {
                    showToast('✓ Data laporan dan foto berhasil dihapus');
                }
            } catch (err) {
                console.error('Hapus laporan gagal:', err);
                showToast('❌ Hapus laporan gagal: ' + (err.message || err), 'error');
                try {
                    if (typeof refreshHistoryDataV32 === 'function') await refreshHistoryDataV32();
                    if (typeof renderInspectionHistory === 'function') renderInspectionHistory();
                } catch (_) {}
            }
        })();
    };

    function getMileageFromDetailsV33(details = []) {
        const row = (details || []).find(d => {
            const name = String(d.item_name || d.itemName || '').toLowerCase();
            return name.includes('odometer') || name.includes('kilometer') || name.includes('km kendaraan');
        });
        if (!row) return '';
        const note = String(row.note || row.status || '').trim();
        const match = note.match(/[-+]?\d[\d.,]*/);
        return match ? match[0].replace(',', '.') : note;
    }

    function getMissingVehicleFieldsV33(data = {}) {
        const labels = {
            customerName: 'Nama Pemesan', customerPhone: 'No. WhatsApp', vehicleType: 'Merk/Tipe',
            vehiclePlate: 'No. Polisi', vehicleYear: 'Tahun', vehicleColor: 'Warna',
            vehicleTransmission: 'Transmisi', vehicleFuel: 'Bahan Bakar', vehicleMileage: 'Odometer'
        };
        return Object.entries(labels)
            .filter(([key]) => String(data?.[key] ?? '').trim() === '')
            .map(([, label]) => label);
    }

    function getVehicleDataFromInputsV33() {
        return typeof getVehicleFormData === 'function' ? getVehicleFormData() : {
            customerName: document.getElementById('customerName')?.value?.trim() || '',
            customerPhone: document.getElementById('customerPhone')?.value?.trim() || '',
            vehicleType: document.getElementById('vehicleType')?.value?.trim() || '',
            vehiclePlate: document.getElementById('vehiclePlate')?.value?.trim() || '',
            vehicleYear: document.getElementById('vehicleYear')?.value?.trim() || '',
            vehicleColor: document.getElementById('vehicleColor')?.value?.trim() || '',
            vehicleTransmission: document.getElementById('vehicleTransmission')?.value?.trim() || '',
            vehicleFuel: document.getElementById('vehicleFuel')?.value?.trim() || '',
            vehicleMileage: document.getElementById('vehicleMileage')?.value?.trim() || ''
        };
    }

    function showVehicleMissingToastV33(data) {
        const missing = getMissingVehicleFieldsV33(data);
        if (missing.length > 0) {
            showToast(`⚠️ Lengkapi: ${missing.join(', ')}`, 'error');
            const focusMap = {
                'Nama Pemesan': 'customerName', 'No. WhatsApp': 'customerPhone', 'Merk/Tipe': 'vehicleType',
                'No. Polisi': 'vehiclePlate', 'Tahun': 'vehicleYear', 'Warna': 'vehicleColor',
                'Transmisi': 'vehicleTransmission', 'Bahan Bakar': 'vehicleFuel', 'Odometer': 'vehicleMileage'
            };
            const firstId = focusMap[missing[0]];
            if (firstId) setTimeout(() => document.getElementById(firstId)?.focus(), 50);
            return false;
        }
        return true;
    }

    try {
        switchToChecklistTab = function () {
            const data = getVehicleDataFromInputsV33();
            if (!showVehicleMissingToastV33(data)) return;
            inspectionFormData = data;
            document.getElementById('vehicleDataSection')?.classList.add('hidden');
            document.getElementById('activeInspectionSection')?.classList.remove('hidden');
            if (!inspectionItemsData || Object.keys(inspectionItemsData).length === 0) renderInspectionItems();
            if (typeof updateTabUI === 'function') updateTabUI('checklist');
            if (typeof hideDraftMonitoringCards === 'function') hideDraftMonitoringCards();
        };

        proceedToStep2 = function (e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            const data = getVehicleDataFromInputsV33();
            if (!showVehicleMissingToastV33(data)) return;
            inspectionFormData = data;
            inspectionStep = 1;
            if (typeof saveCurrentInspectionDraft === 'function') saveCurrentInspectionDraft();
            document.getElementById('vehicleDataSection')?.classList.add('hidden');
            document.getElementById('activeInspectionSection')?.classList.remove('hidden');
            if (typeof renderInspectionItems === 'function') renderInspectionItems();
            if (typeof updateTabUI === 'function') updateTabUI('checklist');
            if (typeof hideDraftMonitoringCards === 'function') hideDraftMonitoringCards();
            showToast('✓ Lanjut ke checklist item inspeksi');
        };
    } catch (err) {
        warn('Gagal pasang validasi vehicle', err?.message || err);
    }

    async function hydrateEditPhotoPreviewsV33(itemsData = {}) {
        const photos = [];
        Object.entries(itemsData || {}).forEach(([key, meta]) => {
            if (!String(key).endsWith('_data')) return;
            (meta?.photos || []).forEach(photo => {
                const fileId = photo.fileId || (typeof extractGoogleDriveFileId === 'function' ? extractGoogleDriveFileId(photo.url || photo.viewUrl || '') : '');
                if (fileId) {
                    photo.fileId = fileId;
                    photos.push(photo);
                }
            });
        });
        const ids = [...new Set(photos.map(p => p.fileId).filter(Boolean))];
        if (ids.length === 0) return itemsData;
        try {
            if (typeof fetchReportPhotoBatchDataUrls === 'function') {
                const chunks = typeof chunkArray === 'function' ? chunkArray(ids, 6) : [ids];
                for (const chunk of chunks) await fetchReportPhotoBatchDataUrls(chunk);
            }
            photos.forEach(photo => {
                if (typeof REPORT_PHOTO_CACHE !== 'undefined' && REPORT_PHOTO_CACHE.has(photo.fileId)) {
                    photo.previewUrl = REPORT_PHOTO_CACHE.get(photo.fileId);
                }
            });
        } catch (err) {
            warn('Preview foto revisi belum bisa dimuat', err?.message || err);
        }
        return itemsData;
    }

    function buildItemsDataFromDetailsV33(details = []) {
        if (typeof buildItemsDataFromInspectionDetailsV32 === 'function') {
            return buildItemsDataFromInspectionDetailsV32(details);
        }
        if (typeof buildItemsDataFromInspectionDetails === 'function') {
            return buildItemsDataFromInspectionDetails(details);
        }
        return {};
    }

    function openEditUiV33({ draftId, vehicleData, itemsData, documentsData, accessoriesData }) {
        if (typeof setInspectionFlowActive === 'function') setInspectionFlowActive(true);
        if (typeof hideDraftMonitoringCards === 'function') hideDraftMonitoringCards();

        document.getElementById('startNewInspectionBtn')?.classList.add('hidden');
        document.getElementById('emptyInspectionState')?.classList.add('hidden');
        document.getElementById('draftInspectionContainer')?.classList.add('hidden');
        document.getElementById('inspectionNavTabs')?.classList.remove('hidden');

        if (typeof fillVehicleForm === 'function') fillVehicleForm(vehicleData);
        if (typeof fillInspectionMetaData === 'function') fillInspectionMetaData({ documentsData, accessoriesData });

        currentOfflineInspectionId = draftId;
        inspectionFormData = vehicleData;
        inspectionItemsData = itemsData || {};
        lastVehicleDraft = JSON.stringify(vehicleData || {});

        const missing = getMissingVehicleFieldsV33(vehicleData);
        if (missing.length > 0) {
            document.getElementById('vehicleDataSection')?.classList.remove('hidden');
            document.getElementById('activeInspectionSection')?.classList.add('hidden');
            if (typeof updateTabUI === 'function') updateTabUI('vehicle');
            showVehicleMissingToastV33(vehicleData);
            return;
        }

        document.getElementById('vehicleDataSection')?.classList.add('hidden');
        document.getElementById('activeInspectionSection')?.classList.remove('hidden');
        if (typeof renderInspectionItems === 'function') renderInspectionItems();
        if (typeof updateTabUI === 'function') updateTabUI('checklist');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        showToast('✓ Mode revisi aktif. Perbaiki data lalu Submit ulang.');
    }

    window.editInspectionReport = async function (inspectionId) {
        if (!inspectionId) return;
        window.__LIAN_EDIT_OPENING = true;

        try {
            showToast('⏳ Membuka mode revisi...');
            if (typeof setInspectionFlowActive === 'function') setInspectionFlowActive(true);
            if (typeof hideDraftMonitoringCards === 'function') hideDraftMonitoringCards();

            const inspection = await getInspectionRowForActionV33(inspectionId);
            const finalId = getInspectionIdV33(inspection);
            const details = await fetchDetailsV33(finalId);

            let itemsData = buildItemsDataFromDetailsV33(details);
            itemsData = await hydrateEditPhotoPreviewsV33(itemsData);

            const meta = typeof buildMetaCheckboxDataFromInspectionDetails === 'function'
                ? buildMetaCheckboxDataFromInspectionDetails(details)
                : { documentsData: {}, accessoriesData: {} };

            const vehicleData = {
                customerName: inspection.customerName || inspection.customer_name || '',
                customerPhone: inspection.customerPhone || inspection.customer_phone || '',
                vehicleType: inspection.vehicleType || inspection.vehicle_type || '',
                vehiclePlate: inspection.vehiclePlate || inspection.vehicle_plate || '',
                vehicleYear: inspection.vehicleYear || inspection.vehicle_year || '',
                vehicleColor: inspection.vehicleColor || inspection.vehicle_color || '',
                vehicleTransmission: inspection.vehicleTransmission || inspection.vehicle_transmission || '',
                vehicleFuel: inspection.vehicleFuel || inspection.vehicle_fuel || '',
                vehicleMileage: inspection.vehicleMileage || inspection.vehicle_mileage || inspection.odometer || getMileageFromDetailsV33(details) || ''
            };

            const draftId = typeof createOfflineInspectionId === 'function'
                ? createOfflineInspectionId()
                : `edit_${finalId}_${Date.now()}`;

            if (typeof closeReportModalOnlyV32 === 'function') closeReportModalOnlyV32();
            else document.getElementById('reportModal')?.classList.add('hidden');

            if (typeof setEditingInspectionMode === 'function') setEditingInspectionMode(finalId, draftId);

            currentOfflineInspectionId = draftId;
            inspectionFormData = vehicleData;
            inspectionItemsData = itemsData;
            lastVehicleDraft = JSON.stringify(vehicleData || {});
            inspectionStep = 1;

            if (typeof saveInspectionOffline === 'function') {
                await saveInspectionOffline({
                    id: draftId,
                    vehicleData,
                    itemsData,
                    documentsData: meta.documentsData || {},
                    accessoriesData: meta.accessoriesData || {},
                    status: 'edit_draft',
                    syncStatus: 'edit_draft',
                    remotePayload: {
                        id: finalId,
                        inspection_id: finalId,
                        existingInspectionId: finalId,
                        editingInspectionId: finalId,
                        _editMode: true
                    }
                });
            }

            if (typeof switchView === 'function') switchView('inspectionView');
            setTimeout(() => openEditUiV33({
                draftId,
                vehicleData,
                itemsData,
                documentsData: meta.documentsData || {},
                accessoriesData: meta.accessoriesData || {}
            }), 120);
        } catch (err) {
            console.error('Edit laporan gagal:', err);
            showToast('❌ Edit laporan gagal: ' + (err.message || err), 'error');
        } finally {
            setTimeout(() => { window.__LIAN_EDIT_OPENING = false; }, 500);
        }
    };

    // Jangan tampilkan monitoring saat mode edit sedang dibuka/aktif.
    try {
        const oldRenderDrafts = renderDraftInspectionCards;
        renderDraftInspectionCards = async function () {
            if (window.__LIAN_EDIT_OPENING || (typeof getEditingInspectionId === 'function' && getEditingInspectionId())) {
                if (typeof hideDraftMonitoringCards === 'function') hideDraftMonitoringCards();
                return;
            }
            return oldRenderDrafts.apply(this, arguments);
        };
    } catch (_) {}

    // Source thumbnail: gunakan cache GAS dulu agar edit tidak tampil broken image.
    try {
        getPhotoSrc = function (photo) {
            if (!photo) return '';
            if (typeof photo === 'string') return photo;
            if (photo.previewUrl || photo.localPreview || photo.dataUrl) return photo.previewUrl || photo.localPreview || photo.dataUrl;
            const fileId = photo.fileId || (typeof extractGoogleDriveFileId === 'function' ? extractGoogleDriveFileId(photo.url || photo.viewUrl || '') : '');
            if (fileId && typeof REPORT_PHOTO_CACHE !== 'undefined' && REPORT_PHOTO_CACHE.has(fileId)) return REPORT_PHOTO_CACHE.get(fileId);
            if (fileId && typeof GAS_UPLOAD_URL !== 'undefined') return `${GAS_UPLOAD_URL}?action=getImage&fileId=${encodeURIComponent(fileId)}`;
            return photo.url || photo.photo_url || photo.photoUrl || photo.viewUrl || '';
        };
    } catch (_) {}

    log('delete/edit/odometer fix aktif');
})();


// =============================================================
// V34 - EDIT BUTTON STABILITY + ODOMETER RESTORE + HISTORY ACTIONS
// =============================================================
(function () {
    const TAG = '[v34]';
    const log = (...args) => console.log(TAG, ...args);
    const warn = (...args) => console.warn(TAG, ...args);

    function escV34(v) {
        if (typeof escapeHtml === 'function') return escapeHtml(v);
        return String(v ?? '').replace(/[&<>'"]/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
        }[ch]));
    }

    function normalizeTextV34(v) { return String(v ?? '').trim(); }

    function parseMileageDisplayV34(value) {
        if (value === null || value === undefined) return '';
        const raw = String(value).trim();
        if (!raw || raw === '-' || raw.toLowerCase() === 'null') return '';
        const digits = raw.replace(/[^0-9]/g, '');
        return digits || '';
    }

    function getMileageFromDetailsV34(details = []) {
        const row = (details || []).find(d => {
            const name = String(d.item_name || d.itemName || '').toLowerCase();
            return name.includes('odometer') || name.includes('kilometer') || name.includes('km kendaraan');
        });
        if (!row) return '';
        return parseMileageDisplayV34(row.note || row.status || '');
    }

    // Normalisasi report: ambil vehicle_mileage dari kolom Supabase kalau ada.
    try {
        const previousNormalizeInspectionForReport = normalizeInspectionForReport;
        normalizeInspectionForReport = function (raw = {}) {
            const normalized = previousNormalizeInspectionForReport.apply(this, arguments) || {};
            const mileage = parseMileageDisplayV34(
                raw.vehicleMileage ?? raw.vehicle_mileage ?? raw.odometer ?? normalized.vehicleMileage
            );
            normalized.vehicleMileage = mileage || '';
            return normalized;
        };
    } catch (err) {
        warn('normalize override gagal', err?.message || err);
    }

    async function fetchInspectionRowV34(inspectionId) {
        const target = String(inspectionId || '');
        let row = null;

        try {
            row = (allInspections || []).find(item => {
                const n = typeof normalizeInspectionForReport === 'function' ? normalizeInspectionForReport(item) : item;
                return String(n.id || n.inspectionId || item.id || item.inspection_id) === target;
            }) || null;
        } catch (_) {}

        if (!row && typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { data, error } = await supabaseClient
                .from('inspections')
                .select('*')
                .eq('id', target)
                .maybeSingle();
            if (error) throw error;
            row = data;
        }

        if (!row) throw new Error('Laporan tidak ditemukan');
        return typeof normalizeInspectionForReport === 'function' ? normalizeInspectionForReport(row) : row;
    }

    async function fetchDetailsV34(finalId) {
        if (typeof fetchInspectionDetailsForReport === 'function') {
            try { return await fetchInspectionDetailsForReport(finalId); } catch (err) { warn('fallback fetch detail', err?.message || err); }
        }
        if (typeof supabaseClient === 'undefined' || !supabaseClient) return [];
        const { data, error } = await supabaseClient
            .from('inspection_details')
            .select('*')
            .eq('inspection_id', finalId);
        if (error) throw error;
        return data || [];
    }

    async function hydrateEditPhotoPreviewsV34(itemsData = {}) {
        const photos = [];
        Object.entries(itemsData || {}).forEach(([key, meta]) => {
            if (!String(key).endsWith('_data')) return;
            (meta?.photos || []).forEach(photo => {
                const fileId = photo.fileId || (typeof extractGoogleDriveFileId === 'function' ? extractGoogleDriveFileId(photo.url || photo.viewUrl || photo.photo_url || '') : '');
                if (fileId) {
                    photo.fileId = fileId;
                    photos.push(photo);
                }
            });
        });
        const ids = [...new Set(photos.map(p => p.fileId).filter(Boolean))];
        if (ids.length === 0) return itemsData;
        try {
            if (typeof fetchReportPhotoBatchDataUrls === 'function') {
                const chunks = typeof chunkArray === 'function' ? chunkArray(ids, 6) : [ids];
                for (const chunk of chunks) await fetchReportPhotoBatchDataUrls(chunk);
            }
            photos.forEach(photo => {
                if (typeof REPORT_PHOTO_CACHE !== 'undefined' && REPORT_PHOTO_CACHE.has(photo.fileId)) {
                    photo.previewUrl = REPORT_PHOTO_CACHE.get(photo.fileId);
                }
            });
        } catch (err) {
            warn('preview foto revisi belum termuat', err?.message || err);
        }
        return itemsData;
    }

    function buildVehicleDataFromInspectionV34(inspection, details) {
        return {
            customerName: normalizeTextV34(inspection.customerName || inspection.customer_name),
            customerPhone: normalizeTextV34(inspection.customerPhone || inspection.customer_phone),
            vehicleType: normalizeTextV34(inspection.vehicleType || inspection.vehicle_type),
            vehiclePlate: normalizeTextV34(inspection.vehiclePlate || inspection.vehicle_plate),
            vehicleYear: normalizeTextV34(inspection.vehicleYear || inspection.vehicle_year),
            vehicleColor: normalizeTextV34(inspection.vehicleColor || inspection.vehicle_color),
            vehicleTransmission: normalizeTextV34(inspection.vehicleTransmission || inspection.vehicle_transmission),
            vehicleFuel: normalizeTextV34(inspection.vehicleFuel || inspection.vehicle_fuel),
            vehicleMileage: parseMileageDisplayV34(inspection.vehicleMileage || inspection.vehicle_mileage || inspection.odometer) || getMileageFromDetailsV34(details)
        };
    }

    function hideMonitoringHardV34() {
        try { if (typeof setInspectionFlowActive === 'function') setInspectionFlowActive(true); } catch (_) {}
        try { if (typeof hideDraftMonitoringCards === 'function') hideDraftMonitoringCards(); } catch (_) {}
        const c = document.getElementById('draftInspectionContainer');
        if (c) { c.classList.add('hidden'); c.innerHTML = ''; }
        document.getElementById('emptyInspectionState')?.classList.add('hidden');
    }

    function focusFirstMissingVehicleFieldV34(vehicleData) {
        const fieldLabels = {
            customerName: 'Nama Pemesan', customerPhone: 'No. WhatsApp', vehicleType: 'Merk/Tipe',
            vehiclePlate: 'No. Polisi', vehicleYear: 'Tahun', vehicleColor: 'Warna',
            vehicleTransmission: 'Transmisi', vehicleFuel: 'Bahan Bakar', vehicleMileage: 'Odometer'
        };
        const ids = Object.keys(fieldLabels);
        const missing = ids.filter(id => !String(vehicleData?.[id] || '').trim());
        if (missing.length > 0) {
            showToast(`⚠️ Lengkapi: ${missing.map(id => fieldLabels[id]).join(', ')}`, 'error');
            const el = document.getElementById(missing[0]);
            if (el) setTimeout(() => { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150);
            return false;
        }
        return true;
    }

    function openEditUiV34({ draftId, vehicleData, itemsData, documentsData, accessoriesData }) {
        hideMonitoringHardV34();
        document.getElementById('startNewInspectionBtn')?.classList.add('hidden');
        document.getElementById('inspectionNavTabs')?.classList.remove('hidden');

        currentOfflineInspectionId = draftId;
        inspectionFormData = vehicleData;
        inspectionItemsData = itemsData || {};
        lastVehicleDraft = JSON.stringify(vehicleData || {});
        inspectionStep = 1;

        if (typeof fillVehicleForm === 'function') fillVehicleForm(vehicleData);
        if (typeof fillInspectionMetaData === 'function') fillInspectionMetaData({ documentsData, accessoriesData });

        if (!focusFirstMissingVehicleFieldV34(vehicleData)) {
            document.getElementById('vehicleDataSection')?.classList.remove('hidden');
            document.getElementById('activeInspectionSection')?.classList.add('hidden');
            if (typeof updateTabUI === 'function') updateTabUI('vehicle');
            return;
        }

        document.getElementById('vehicleDataSection')?.classList.add('hidden');
        document.getElementById('activeInspectionSection')?.classList.remove('hidden');
        if (typeof renderInspectionItems === 'function') renderInspectionItems();
        if (typeof updateTabUI === 'function') updateTabUI('checklist');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        showToast('✓ Mode revisi aktif. Perbaiki data lalu Submit ulang.');
    }


    // V35 SIMPLE FIX: tampilkan loading spinner saat tombol Edit sedang memuat data.
    // Alur edit tetap seperti sekarang: halaman edit baru dibuka setelah data + thumbnail siap.
    // Perubahan ini hanya membuat user tahu bahwa aplikasi sedang bekerja, bukan mengubah cara foto dimuat.
    function ensureEditLoadingStyleV35() {
        if (document.getElementById('lianEditLoadingStyleV35')) return;
        const style = document.createElement('style');
        style.id = 'lianEditLoadingStyleV35';
        style.textContent = `
            @keyframes lianEditSpinV35 { to { transform: rotate(360deg); } }
            @keyframes lianEditFadeV35 { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        `;
        document.head.appendChild(style);
    }

    function showEditLoadingToastV35(message = 'Memuat data revisi...') {
        ensureEditLoadingStyleV35();

        let overlay = document.getElementById('lianEditLoadingOverlayV35');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'lianEditLoadingOverlayV35';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:10000000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.28);backdrop-filter:blur(3px);padding:16px;';
            overlay.innerHTML = `
                <div style="width:min(360px,92vw);background:white;border-radius:20px;box-shadow:0 24px 70px rgba(15,23,42,.28);padding:18px 20px;border:1px solid rgba(226,232,240,.9);animation:lianEditFadeV35 .18s ease-out;">
                    <div style="display:flex;align-items:center;gap:14px;">
                        <div style="width:34px;height:34px;border-radius:999px;border:4px solid #dbeafe;border-top-color:#2563eb;animation:lianEditSpinV35 .8s linear infinite;flex-shrink:0;"></div>
                        <div style="min-width:0;">
                            <div data-edit-loading-title style="font-size:14px;font-weight:900;color:#0f172a;line-height:1.25;">Memuat data revisi...</div>
                            <div style="font-size:12px;font-weight:650;color:#64748b;line-height:1.35;margin-top:3px;">Mohon tunggu sebentar, foto dan checklist sedang disiapkan.</div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        const title = overlay.querySelector('[data-edit-loading-title]');
        if (title) title.textContent = message;
        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
        return overlay;
    }

    function updateEditLoadingToastV35(message) {
        const overlay = document.getElementById('lianEditLoadingOverlayV35');
        if (!overlay) return showEditLoadingToastV35(message);
        const title = overlay.querySelector('[data-edit-loading-title]');
        if (title) title.textContent = message;
        return overlay;
    }

    function hideEditLoadingToastV35() {
        const overlay = document.getElementById('lianEditLoadingOverlayV35');
        if (!overlay) return;
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity .16s ease';
        setTimeout(() => overlay.remove(), 180);
    }

    window.editInspectionReport = async function (inspectionId) {
        if (!inspectionId || window.__LIAN_EDIT_OPENING) return;
        window.__LIAN_EDIT_OPENING = true;
        window.__LIAN_EDIT_MODE_ACTIVE = true;
        hideMonitoringHardV34();

        let hideLoaderInFinally = true;

        try {
            showEditLoadingToastV35('Memuat data revisi...');

            const inspection = await fetchInspectionRowV34(inspectionId);
            const finalId = inspection.inspectionId || inspection.id || inspectionId;

            if (typeof canCurrentUserSeeInspection === 'function' && !canCurrentUserSeeInspection(inspection)) {
                throw new Error('Laporan ini bukan milik akun Anda');
            }

            updateEditLoadingToastV35('Memuat checklist & foto...');
            const details = await fetchDetailsV34(finalId);
            let itemsData = typeof buildItemsDataFromInspectionDetails === 'function'
                ? buildItemsDataFromInspectionDetails(details)
                : {};

            // Tetap tunggu proses thumbnail seperti alur saat ini agar foto tetap tampil normal.
            // Bedanya, user sekarang melihat loading spinner sampai proses selesai.
            itemsData = await hydrateEditPhotoPreviewsV34(itemsData);

            const meta = typeof buildMetaCheckboxDataFromInspectionDetails === 'function'
                ? buildMetaCheckboxDataFromInspectionDetails(details)
                : { documentsData: {}, accessoriesData: {} };
            const vehicleData = buildVehicleDataFromInspectionV34(inspection, details);
            const draftId = typeof createOfflineInspectionId === 'function'
                ? createOfflineInspectionId()
                : `edit_${finalId}_${Date.now()}`;

            try {
                if (typeof closeReportModalOnlyV32 === 'function') closeReportModalOnlyV32();
                else document.getElementById('reportModal')?.classList.add('hidden');
            } catch (_) {}

            if (typeof setEditingInspectionMode === 'function') setEditingInspectionMode(finalId, draftId);
            currentOfflineInspectionId = draftId;
            inspectionFormData = vehicleData;
            inspectionItemsData = itemsData;
            lastVehicleDraft = JSON.stringify(vehicleData || {});
            inspectionStep = 1;

            updateEditLoadingToastV35('Menyiapkan halaman edit...');
            if (typeof saveInspectionOffline === 'function') {
                await saveInspectionOffline({
                    id: draftId,
                    vehicleData,
                    itemsData,
                    documentsData: meta.documentsData || {},
                    accessoriesData: meta.accessoriesData || {},
                    status: 'edit_draft',
                    syncStatus: 'edit_draft',
                    remotePayload: {
                        id: finalId,
                        inspection_id: finalId,
                        existingInspectionId: finalId,
                        editingInspectionId: finalId,
                        _editMode: true
                    }
                });
            }

            if (typeof switchView === 'function') switchView('inspectionView');

            hideLoaderInFinally = false;
            setTimeout(() => {
                try {
                    openEditUiV34({
                        draftId,
                        vehicleData,
                        itemsData,
                        documentsData: meta.documentsData || {},
                        accessoriesData: meta.accessoriesData || {}
                    });
                } catch (innerErr) {
                    console.error('Gagal membuka UI edit:', innerErr);
                    showToast('❌ Gagal membuka halaman edit: ' + (innerErr.message || innerErr), 'error');
                    window.__LIAN_EDIT_MODE_ACTIVE = false;
                } finally {
                    hideEditLoadingToastV35();
                    setTimeout(() => { window.__LIAN_EDIT_OPENING = false; }, 250);
                }
            }, 80);
        } catch (err) {
            console.error('Edit laporan gagal:', err);
            showToast('❌ Edit laporan gagal: ' + (err.message || err), 'error');
            window.__LIAN_EDIT_MODE_ACTIVE = false;
        } finally {
            if (hideLoaderInFinally) hideEditLoadingToastV35();
            setTimeout(() => { window.__LIAN_EDIT_OPENING = false; }, 600);
        }
    };

    // Jangan render monitoring saat mode edit aktif.
    try {
        const previousRenderDraftInspectionCards = renderDraftInspectionCards;
        renderDraftInspectionCards = async function () {
            if (window.__LIAN_EDIT_OPENING || window.__LIAN_EDIT_MODE_ACTIVE || (typeof getEditingInspectionId === 'function' && getEditingInspectionId())) {
                hideMonitoringHardV34();
                return;
            }
            return previousRenderDraftInspectionCards.apply(this, arguments);
        };
    } catch (_) {}

    // Validasi tab checklist: toast + focus saat ada field kosong.
    try {
        const originalSwitchToChecklistTab = switchToChecklistTab;
        switchToChecklistTab = function () {
            const data = typeof getVehicleFormData === 'function' ? getVehicleFormData() : {};
            if (!focusFirstMissingVehicleFieldV34(data)) return;
            return originalSwitchToChecklistTab.apply(this, arguments);
        };
    } catch (_) {}

    // Render history lebih stabil + tombol menggunakan event delegation.
    try {
        renderInspectionHistory = function () {
            const list = document.getElementById('inspectionHistoryList');
            if (!list) return;
            list.innerHTML = '';
            if (typeof updateHistoryHeaderLabel === 'function') updateHistoryHeaderLabel();
            const rows = (typeof getVisibleHistoryInspections === 'function' ? getVisibleHistoryInspections() : (allInspections || [])) || [];
            const valid = rows.map(row => typeof normalizeInspectionForReport === 'function' ? normalizeInspectionForReport(row) : row)
                .filter(row => row && (row.id || row.inspectionId) && (row.vehiclePlate || row.customerName));

            if (valid.length === 0) {
                list.innerHTML = `<div class="col-span-full rounded-2xl bg-blue-50 border border-blue-100 p-8 text-center text-slate-600 font-bold">Belum ada riwayat inspeksi.</div>`;
                return;
            }

            valid.slice().reverse().forEach(row => {
                const id = row.inspectionId || row.id;
                const d = new Date(row.inspectionDate || row.created_at || Date.now());
                const formattedDate = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                const score = Number(row.value || 0);
                const statusEmoji = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';
                const statusText = score >= 80 ? 'Baik' : score >= 50 ? 'Layak dengan Catatan' : 'Perlu Perbaikan';
                const borderColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
                const card = document.createElement('div');
                card.className = 'card-modern rounded-lg shadow-md hover:shadow-lg transition-all border-l-4 overflow-hidden group';
                card.dataset.historyInspectionId = id;
                card.style.borderColor = borderColor;
                card.innerHTML = `
                    <div class="bg-gradient-to-r from-blue-50 to-cyan-50 p-3 flex items-center justify-between gap-3">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <h3 class="font-bold text-gray-900 text-sm truncate">${escV34(String(row.vehiclePlate || '-').toUpperCase())}</h3>
                                <span class="text-xl flex-shrink-0">${statusEmoji}</span>
                            </div>
                            <p class="text-xs text-gray-600">${escV34(row.vehicleType || '-')} • ${escV34(row.vehicleYear || '-')}</p>
                        </div>
                        <div class="text-right flex-shrink-0">
                            <p class="text-lg font-black" style="color:${borderColor};">${score}%</p>
                            <p class="text-xs font-bold text-gray-600 mt-0.5">${escV34(statusText)}</p>
                        </div>
                    </div>
                    <div class="px-3 py-2 bg-white border-t border-gray-100 space-y-2">
                        <div class="flex items-center justify-between text-xs gap-2">
                            <div class="flex items-center gap-1 text-gray-700 min-w-0">
                                <i data-lucide="user" style="width:14px;height:14px;color:#6b7280;"></i>
                                <span class="font-semibold truncate">${escV34(row.customerName || '-')}</span>
                            </div>
                            <span class="text-gray-500 font-medium flex-shrink-0">${escV34(formattedDate)}</span>
                        </div>
                        <div class="flex items-center gap-1 text-xs text-gray-600">
                            <i data-lucide="badge-check" style="width:14px;height:14px;color:#2563eb;"></i>
                            <span class="font-semibold">Inspector:</span>
                            <span class="font-bold truncate">@${escV34(row.inspectorUsername || row.inspector || '-')}</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div style="height:100%;width:${Math.max(0, Math.min(100, score))}%;background:${borderColor};border-radius:999px;"></div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" data-history-action="report" data-inspection-id="${escV34(id)}" class="px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"><i data-lucide="file-text" style="width:14px;height:14px;"></i><span>Laporan</span></button>
                            <button type="button" data-history-action="edit" data-inspection-id="${escV34(id)}" class="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"><i data-lucide="pencil" style="width:14px;height:14px;"></i><span>Edit</span></button>
                            <button type="button" data-history-action="delete" data-inspection-id="${escV34(id)}" class="px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"><i data-lucide="trash-2" style="width:14px;height:14px;"></i><span>Hapus</span></button>
                        </div>
                    </div>`;
                list.appendChild(card);
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };
    } catch (err) {
        warn('render history override gagal', err?.message || err);
    }

    if (!window.__LIAN_HISTORY_ACTION_DELEGATE_V34) {
        window.__LIAN_HISTORY_ACTION_DELEGATE_V34 = true;
        document.addEventListener('click', function (event) {
            const btn = event.target.closest('[data-history-action][data-inspection-id]');
            if (!btn) return;
            event.preventDefault();
            event.stopPropagation();
            const id = btn.dataset.inspectionId;
            const action = btn.dataset.historyAction;
            if (action === 'report' && typeof viewInspectionReport === 'function') viewInspectionReport(id);
            if (action === 'edit' && typeof window.editInspectionReport === 'function') window.editInspectionReport(id);
            if (action === 'delete' && typeof window.deleteInspectionReport === 'function') window.deleteInspectionReport(id);
        }, true);
    }

    // Broken favicon di localhost tidak terkait data. Ini hanya membersihkan error UI.
    try {
        if (!document.querySelector('link[rel="icon"]')) {
            const link = document.createElement('link');
            link.rel = 'icon';
            link.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='50' font-size='52'%3E%F0%9F%9A%97%3C/text%3E%3C/svg%3E";
            document.head.appendChild(link);
        }
    } catch (_) {}

    log('edit stabil + odometer restore aktif');
})();


// =============================================================
// V38 - SAFE USER ISOLATION GUARD (logout, refresh, HP mati, internet putus)
// =============================================================
// Tujuan:
// 1) Data draft IndexedDB tetap aman dan tidak dihapus.
// 2) Draft/form user A tidak boleh tampil di user B, meskipun user A tidak logout.
// 3) currentOfflineInspectionId yang tersisa dari user lama tidak boleh dipakai user baru.
// 4) Edit draft admin tidak boleh auto-restore sebagai inspeksi inspector.
(function () {
    const TAG = '[v38 user isolation]';

    function getOwnerKeyV38() {
        return String(currentUser?.id || currentUser?.username || '').trim();
    }

    function getInspectionViewV38() {
        return document.getElementById('inspectionView');
    }

    function isInspectionUiVisibleV38() {
        const vehicleSection = document.getElementById('vehicleDataSection');
        const activeSection = document.getElementById('activeInspectionSection');
        return Boolean(
            (vehicleSection && !vehicleSection.classList.contains('hidden')) ||
            (activeSection && !activeSection.classList.contains('hidden'))
        );
    }

    function isEditDraftV38(draft = {}) {
        return Boolean(
            draft?.remotePayload?._editMode ||
            draft?.remotePayload?.editingInspectionId ||
            draft?.remotePayload?.existingInspectionId ||
            draft?.status === 'edit_draft' ||
            draft?.syncStatus === 'edit_draft'
        );
    }

    function markInspectionOwnerV38(active = true) {
        const view = getInspectionViewV38();
        if (!view) return;

        if (active) {
            const owner = getOwnerKeyV38();
            if (owner) view.dataset.ownerId = owner;
        } else {
            delete view.dataset.ownerId;
        }
    }

    function clearAutosaveTimersV38() {
        try {
            if (vehicleAutosaveTimer) clearTimeout(vehicleAutosaveTimer);
            vehicleAutosaveTimer = null;
        } catch (_) {}

        try {
            Object.values(itemAutosaveTimers || {}).forEach(timer => clearTimeout(timer));
            itemAutosaveTimers = {};
        } catch (_) {}
    }

    function clearInspectionUiOnlyV38() {
        try { if (typeof fillVehicleForm === 'function') fillVehicleForm({}); } catch (_) {}
        try { if (typeof fillInspectionMetaData === 'function') fillInspectionMetaData({ documentsData: {}, accessoriesData: {} }); } catch (_) {}

        const categoriesContainer = document.getElementById('categoriesInspectionList');
        if (categoriesContainer) categoriesContainer.innerHTML = '';

        const progressText = document.getElementById('progressText');
        if (progressText) progressText.textContent = '0 / 0';

        const progressBar = document.getElementById('progressBar');
        if (progressBar) progressBar.style.width = '0%';

        const vehicleDisplay = document.getElementById('vehicleNameDisplay');
        if (vehicleDisplay) vehicleDisplay.textContent = '🚗 Kendaraan: -';

        document.getElementById('inspectionNavTabs')?.classList.add('hidden');
        document.getElementById('vehicleDataSection')?.classList.add('hidden');
        document.getElementById('activeInspectionSection')?.classList.add('hidden');
        document.getElementById('startNewInspectionBtn')?.classList.remove('hidden');
        document.getElementById('draftInspectionContainer')?.classList.add('hidden');
        document.getElementById('emptyInspectionState')?.classList.remove('hidden');

        try { if (typeof hideDraftMonitoringCards === 'function') hideDraftMonitoringCards(); } catch (_) {}

        const view = getInspectionViewV38();
        if (view) view.dataset.flowActive = 'false';
        markInspectionOwnerV38(false);
    }

    window.resetInspectionRuntimeForUserSwitchV38 = function resetInspectionRuntimeForUserSwitchV38(options = {}) {
        clearAutosaveTimersV38();

        try { inspectionStep = 0; } catch (_) {}
        try { inspectionFormData = null; } catch (_) {}
        try { inspectionItemsData = {}; } catch (_) {}
        try { currentOfflineInspectionId = null; } catch (_) {}
        try { lastVehicleDraft = ''; } catch (_) {}
        try { if (typeof clearEditingInspectionMode === 'function') clearEditingInspectionMode(); } catch (_) {}
        try { editingInspectionId = null; editingSourceDraftId = null; } catch (_) {}

        window.__LIAN_EDIT_OPENING = false;
        window.__LIAN_EDIT_MODE_ACTIVE = false;

        try { if (typeof hideEditLoadingToastV35 === 'function') hideEditLoadingToastV35(); } catch (_) {}

        if (options.clearUi !== false) clearInspectionUiOnlyV38();

        console.log(TAG, 'runtime dibersihkan untuk pergantian user / reload aman', options.reason || 'user-switch');
    };

    function assertVisibleUiOwnerV38(reason = 'guard') {
        const view = getInspectionViewV38();
        if (!view || !isInspectionUiVisibleV38()) return true;

        const currentOwner = getOwnerKeyV38();
        const uiOwner = String(view.dataset.ownerId || '').trim();

        // Jika UI inspeksi masih terbuka dari user sebelumnya, bersihkan tanpa menghapus draft IndexedDB.
        if (uiOwner && currentOwner && uiOwner !== currentOwner) {
            console.warn(TAG, 'UI inspeksi user lama dibersihkan', { reason, uiOwner, currentOwner });
            window.resetInspectionRuntimeForUserSwitchV38({ reason, clearUi: true });
            return false;
        }

        // Jika UI terlihat tetapi belum punya penanda owner, tandai dengan user saat ini agar perpindahan berikutnya terbaca.
        if (!uiOwner && currentOwner) markInspectionOwnerV38(true);
        return true;
    }

    // Tandai pemilik UI setiap kali flow inspeksi dibuat aktif.
    try {
        const originalSetInspectionFlowActive = setInspectionFlowActive;
        setInspectionFlowActive = function (active) {
            const result = originalSetInspectionFlowActive.apply(this, arguments);
            markInspectionOwnerV38(Boolean(active));
            return result;
        };
    } catch (err) {
        console.warn(TAG, 'setInspectionFlowActive guard gagal:', err?.message || err);
    }

    // Guard utama restore: draft user lain dan edit_draft tidak boleh auto masuk ke form.
    try {
        const originalApplyOfflineDraftToInspection = applyOfflineDraftToInspection;
        applyOfflineDraftToInspection = function (draft, options = {}) {
            if (!draft) return false;

            if (typeof isDraftOwnedByCurrentUser === 'function' && !isDraftOwnedByCurrentUser(draft)) {
                console.warn(TAG, 'restore draft ditolak karena bukan milik user aktif', draft.id);
                return false;
            }

            if (isEditDraftV38(draft) && !options.allowEditDraft) {
                console.warn(TAG, 'restore edit_draft otomatis ditolak', draft.id);
                return false;
            }

            const result = originalApplyOfflineDraftToInspection.apply(this, arguments);
            if (result) markInspectionOwnerV38(true);
            return result;
        };
    } catch (err) {
        console.warn(TAG, 'applyOfflineDraftToInspection guard gagal:', err?.message || err);
    }

    // Jangan biarkan prepare landing berhenti karena form user lama masih terlihat.
    try {
        const originalPrepareInspectionLandingView = prepareInspectionLandingView;
        prepareInspectionLandingView = function () {
            assertVisibleUiOwnerV38('prepareInspectionLandingView');
            return originalPrepareInspectionLandingView.apply(this, arguments);
        };
    } catch (err) {
        console.warn(TAG, 'prepareInspectionLandingView guard gagal:', err?.message || err);
    }

    // Saat klik mulai inspeksi, cek lagi UI yang terlihat masih milik user aktif atau bukan.
    try {
        const originalStartNewInspection = startNewInspection;
        startNewInspection = async function () {
            assertVisibleUiOwnerV38('startNewInspection');
            return originalStartNewInspection.apply(this, arguments);
        };
    } catch (err) {
        console.warn(TAG, 'startNewInspection guard gagal:', err?.message || err);
    }

    // Saat render checklist, owner UI wajib user aktif.
    try {
        const originalRenderInspectionItems = renderInspectionItems;
        renderInspectionItems = function () {
            markInspectionOwnerV38(true);
            return originalRenderInspectionItems.apply(this, arguments);
        };
    } catch (_) {}

    console.log('✅ inspection.js v38 safe user isolation loaded');
})();


// =============================================================
// V60 - SCORE ENGINE DISPLAY IN REPORT + HISTORY
// =============================================================
(function () {
    'use strict';

    const TAG = '[score v60]';
    const SCORE_CACHE = window.__LIAN_SCORE_CACHE_V60 || (window.__LIAN_SCORE_CACHE_V60 = new Map());

    function escV60(value) {
        if (typeof escapeHtml === 'function') return escapeHtml(value);
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getGradeColorV60(result = {}) {
        const grade = String(result.grade || '').toUpperCase();
        if (grade === 'A') return '#16a34a';
        if (grade === 'B') return '#22c55e';
        if (grade === 'C') return '#f59e0b';
        if (grade === 'D') return '#f97316';
        return '#ef4444';
    }

    function getGradeBgV60(result = {}) {
        const grade = String(result.grade || '').toUpperCase();
        if (grade === 'A' || grade === 'B') return '#ecfdf5';
        if (grade === 'C') return '#fffbeb';
        if (grade === 'D') return '#fff7ed';
        return '#fef2f2';
    }

    function normalizeStatusV60(status) {
        const text = String(status || '').trim().toLowerCase();
        if (['good', 'baik', 'hijau', 'ok', 'aman'].includes(text)) return 'good';
        if (['warning', 'perlu', 'perhatian', 'perlu perhatian', 'kuning', 'catatan'].includes(text)) return 'warning';
        if (['bad', 'rusak', 'merah', 'parah'].includes(text)) return 'bad';
        return '';
    }

    function buildScoreInputFromInspectionV60(inspection = {}, details = []) {
        let itemsData = inspection._itemsData || inspection.itemsData || {};
        let documentsData = inspection._documentsData || inspection.documentsData || {};
        let accessoriesData = inspection._accessoriesData || inspection.accessoriesData || {};

        const sourceDetails = Array.isArray(details) && details.length > 0
            ? details
            : (Array.isArray(inspection._details) ? inspection._details : []);

        if (sourceDetails.length > 0) {
            try {
                if (typeof buildItemsDataFromInspectionDetails === 'function') {
                    itemsData = buildItemsDataFromInspectionDetails(sourceDetails);
                }
            } catch (err) {
                console.warn(TAG, 'buildItemsDataFromInspectionDetails gagal:', err?.message || err);
            }

            try {
                if (typeof buildMetaCheckboxDataFromInspectionDetails === 'function') {
                    const meta = buildMetaCheckboxDataFromInspectionDetails(sourceDetails);
                    documentsData = meta.documentsData || documentsData || {};
                    accessoriesData = meta.accessoriesData || accessoriesData || {};
                }
            } catch (err) {
                console.warn(TAG, 'buildMetaCheckboxDataFromInspectionDetails gagal:', err?.message || err);
            }
        }

        const itemIds = Object.entries(itemsData || {})
            .filter(([key, value]) => !String(key).endsWith('_data') && normalizeStatusV60(value))
            .map(([key]) => String(key));

        const items = itemIds.map((itemId, index) => {
            const meta = itemsData[itemId + '_data'] || {};
            const master = (typeof sheetItems !== 'undefined' ? (sheetItems || []) : [])
                .find(item =>
                    String(item.id || '') === String(itemId) ||
                    String(item.name || '').trim().toLowerCase() === String(meta.itemName || meta.item_name || itemId).trim().toLowerCase()
                );

            if (master) return { ...master, id: String(master.id || itemId) };

            return {
                id: itemId || `score_item_${index}`,
                name: meta.itemName || meta.item_name || itemId || `Item ${index + 1}`,
                category: meta.category || meta.categoryName || 'Lainnya',
                critical_level: meta.critical_level || meta.criticalLevel || 'Low'
            };
        });

        return { items, itemsData, documentsData, accessoriesData };
    }

    function evaluateInspectionForDisplayV60(inspection = {}, details = []) {
        if (!window.LianInspectionScore || typeof window.LianInspectionScore.evaluateInspection !== 'function') {
            return null;
        }

        const input = buildScoreInputFromInspectionV60(inspection, details);
        return window.LianInspectionScore.evaluateInspection(input);
    }

    async function getInspectionDetailsCachedV60(inspectionId) {
        if (!inspectionId) return [];
        const key = `details_${inspectionId}`;
        if (SCORE_CACHE.has(key)) return SCORE_CACHE.get(key);

        let details = [];
        if (typeof fetchInspectionDetailsForReport === 'function') {
            details = await fetchInspectionDetailsForReport(inspectionId).catch(err => {
                console.warn(TAG, 'gagal fetch details:', err?.message || err);
                return [];
            });
        }

        SCORE_CACHE.set(key, details || []);
        return details || [];
    }

    async function getScoreForInspectionV60(inspection = {}) {
        const normalized = typeof normalizeInspectionForReport === 'function'
            ? normalizeInspectionForReport(inspection)
            : inspection;
        const inspectionId = normalized?.inspectionId || normalized?.id || inspection?.inspection_id;
        const scoreKey = `score_${inspectionId || JSON.stringify(normalized).slice(0, 80)}`;

        if (inspectionId && SCORE_CACHE.has(scoreKey)) return SCORE_CACHE.get(scoreKey);

        let details = Array.isArray(normalized?._details) ? normalized._details : [];
        if ((!details || details.length === 0) && inspectionId) {
            details = await getInspectionDetailsCachedV60(inspectionId);
        }

        const scoreResult = evaluateInspectionForDisplayV60(normalized, details);
        if (inspectionId && scoreResult) SCORE_CACHE.set(scoreKey, scoreResult);
        return scoreResult;
    }

    function buildScoreMetricCardV60(label, value, accent = '#2563eb') {
        const safeValue = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
        return `
            <div style="background:#ffffff; border:1.5px solid #0f172a; border-radius:14px; padding:12px 10px; text-align:center; min-width:0; break-inside:avoid;">
                <div style="font-size:28px; font-weight:1000; color:#0f172a; line-height:1; letter-spacing:-.5px;">${safeValue}%</div>
                <div style="font-size:12px; font-weight:850; color:#111827; margin-top:7px; line-height:1.25;">${escV60(label)}</div>
                <div style="height:5px; background:#e5e7eb; border-radius:999px; overflow:hidden; margin-top:10px;">
                    <div style="height:100%; width:${Math.max(0, Math.min(100, safeValue))}%; background:${accent}; border-radius:999px;"></div>
                </div>
            </div>`;
    }

    function buildReportScoreHtmlV60(scoreResult = {}) {
        const gradeColor = getGradeColorV60(scoreResult);
        const gradeBg = getGradeBgV60(scoreResult);
        const hardRules = Array.isArray(scoreResult.hardRules) ? scoreResult.hardRules : [];
        const summary = Array.isArray(scoreResult.summary) ? scoreResult.summary : [];
        const lockedLabel = scoreResult.locked
            ? `<span style="display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:5px 9px;font-size:10.5px;font-weight:1000;">⚠️ Grade Lock Aktif</span>`
            : `<span style="display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:5px 9px;font-size:10.5px;font-weight:1000;">✓ Tidak Ada Hard Rule Fatal</span>`;

        return `
            <div id="reportScoreEngineBlock" style="background:${gradeBg}; border:1px solid ${gradeColor}55; border-radius:18px; padding:14px; margin:0 0 16px; break-inside:avoid; box-shadow:0 10px 26px rgba(15,23,42,.06);">
                <div style="display:grid; grid-template-columns:minmax(145px,.62fr) minmax(0,1.38fr); gap:12px; align-items:stretch;">
                    <div style="background:#ffffff; border:2px solid ${gradeColor}; border-radius:16px; padding:14px; text-align:center; display:flex; flex-direction:column; justify-content:center;">
                        <div style="font-size:13px;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Grade Mobil</div>
                        <div style="font-size:54px; line-height:1; font-weight:1000; color:${gradeColor}; margin-top:3px;">${escV60(scoreResult.grade || '-')}</div>
                        <div style="font-size:13px; font-weight:1000; color:#0f172a; margin-top:4px;">${escV60(scoreResult.gradeLabel || '-')}</div>
                        <div style="font-size:11px; font-weight:750; color:#64748b; margin-top:6px; line-height:1.35;">Skor akhir: <b style="color:${gradeColor};font-size:15px;">${Math.round(Number(scoreResult.finalScore || 0))}%</b></div>
                    </div>
                    <div style="display:grid; gap:10px;">
                        <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px;">
                            ${buildScoreMetricCardV60('Kondisi Fisik', scoreResult.physicalScore, '#2563eb')}
                            ${buildScoreMetricCardV60('Kelengkapan Dokumen', scoreResult.documentScore, '#7c3aed')}
                            ${buildScoreMetricCardV60('Kelengkapan Aksesoris', scoreResult.accessoryScore, '#ea580c')}
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; background:#ffffffcc; border:1px solid #e2e8f0; border-radius:14px; padding:10px 11px;">
                            ${lockedLabel}
                            <span style="font-size:11px;font-weight:850;color:#64748b;">Raw score: ${Math.round(Number(scoreResult.rawScore || 0))}%</span>
                        </div>
                    </div>
                </div>
                ${summary.length ? `<div style="margin-top:11px; display:grid; gap:6px;">${summary.slice(0, 4).map(text => `<div style="font-size:11.5px; line-height:1.35; color:#334155; font-weight:750; background:#ffffffaa; border:1px solid #e2e8f0; border-radius:10px; padding:7px 9px;">• ${escV60(text)}</div>`).join('')}</div>` : ''}
                ${hardRules.length ? `<div style="margin-top:10px; font-size:11px; color:#991b1b; font-weight:900; line-height:1.45;">${hardRules.slice(0, 3).map(rule => `⚠️ ${escV60(rule.message)}`).join('<br>')}</div>` : ''}
            </div>`;
    }

    function injectReportScoreBlockV60(scoreResult) {
        if (!scoreResult) return;
        const reportContent = document.getElementById('reportContent');
        if (!reportContent) return;

        const existing = reportContent.querySelector('#reportScoreEngineBlock');
        if (existing) existing.remove();

        const scoreHtml = buildReportScoreHtmlV60(scoreResult);
        const vehicleGrid = reportContent.querySelector('.report-vehicle-grid');
        const clientBar = reportContent.querySelector('.report-client-bar');
        const insertAfter = vehicleGrid || clientBar;
        if (insertAfter) insertAfter.insertAdjacentHTML('afterend', scoreHtml);
        else reportContent.insertAdjacentHTML('afterbegin', scoreHtml);

        // Update field Status Akhir lama agar tidak lagi terlihat seperti rumus lama.
        try {
            const statusRow = Array.from(reportContent.querySelectorAll('.report-field-row'))
                .find(row => String(row.textContent || '').toLowerCase().includes('status akhir'));
            const valueSpan = statusRow?.querySelector('span');
            if (valueSpan) {
                valueSpan.innerHTML = `: <b style="color:${getGradeColorV60(scoreResult)};">Grade ${escV60(scoreResult.grade)} - ${escV60(scoreResult.gradeLabel)}</b> (${Math.round(Number(scoreResult.finalScore || 0))}%)`;
            }
        } catch (err) {
            console.warn(TAG, 'update Status Akhir report gagal:', err?.message || err);
        }
    }

    async function enhanceCurrentReportV60(inspection = {}) {
        try {
            const scoreResult = await getScoreForInspectionV60(inspection);
            if (!scoreResult) return;
            injectReportScoreBlockV60(scoreResult);
            console.log(TAG, 'report score ditampilkan', scoreResult);
        } catch (err) {
            console.warn(TAG, 'enhance report gagal:', err?.message || err);
        }
    }

    function updateHistoryCardScoreV60(card, scoreResult) {
        if (!card || !scoreResult) return;
        const score = Math.round(Number(scoreResult.finalScore || 0));
        const color = getGradeColorV60(scoreResult);

        card.style.borderColor = color;

        const scoreNode = card.querySelector('p.text-lg.font-black');
        if (scoreNode) {
            scoreNode.textContent = `${score}%`;
            scoreNode.style.color = color;
        }

        const statusNode = scoreNode?.nextElementSibling;
        if (statusNode) {
            statusNode.textContent = `Grade ${scoreResult.grade}`;
            statusNode.style.color = '#475569';
        }

        const emojiNode = card.querySelector('h3 + span');
        if (emojiNode) {
            const grade = String(scoreResult.grade || '').toUpperCase();
            emojiNode.textContent = (grade === 'A' || grade === 'B') ? '🟢' : (grade === 'C' ? '🟡' : '🔴');
        }

        const progress = Array.from(card.querySelectorAll('div'))
            .find(el => String(el.getAttribute('style') || '').includes('height:100%') && String(el.getAttribute('style') || '').includes('width:'));
        if (progress) {
            progress.style.width = `${Math.max(0, Math.min(100, score))}%`;
            progress.style.background = color;
        }
    }

    async function enhanceHistoryScoresV60() {
        const cards = Array.from(document.querySelectorAll('[data-history-inspection-id]'));
        if (!cards.length) return;

        for (const card of cards) {
            const id = card.dataset.historyInspectionId;
            if (!id) continue;
            try {
                const row = (typeof allInspections !== 'undefined' ? (allInspections || []) : [])
                    .find(item => String(item.id || item.inspection_id || item.inspectionId || '') === String(id));
                const scoreResult = await getScoreForInspectionV60(row || { id, inspectionId: id });
                updateHistoryCardScoreV60(card, scoreResult);
            } catch (err) {
                console.warn(TAG, 'enhance history score gagal:', id, err?.message || err);
            }
        }
    }

    try {
        const originalGenerateAndShowReport = generateAndShowReport;
        generateAndShowReport = function (inspection) {
            const result = originalGenerateAndShowReport.apply(this, arguments);
            setTimeout(() => enhanceCurrentReportV60(inspection), 120);
            return result;
        };
    } catch (err) {
        console.warn(TAG, 'generateAndShowReport override gagal:', err?.message || err);
    }

    try {
        const previousRenderInspectionHistory = renderInspectionHistory;
        renderInspectionHistory = function () {
            const result = previousRenderInspectionHistory.apply(this, arguments);
            setTimeout(enhanceHistoryScoresV60, 150);
            return result;
        };
    } catch (err) {
        console.warn(TAG, 'renderInspectionHistory override gagal:', err?.message || err);
    }

    // Jika halaman history sedang terbuka saat file ini selesai load, perbarui kartu yang sudah ada.
    setTimeout(enhanceHistoryScoresV60, 600);

    window.LianInspectionScoreDisplayV60 = {
        getScoreForInspection: getScoreForInspectionV60,
        enhanceCurrentReport: enhanceCurrentReportV60,
        enhanceHistoryScores: enhanceHistoryScoresV60
    };

    console.log('✅ inspection.js v60 score display loaded');
})();


// ================= V61: EDITABLE FINAL GRADE CARD IN REPORT =================
(function installEditableReportFinalGradeV61(){
    if (window.__LIAN_V61_EDITABLE_REPORT_GRADE_INSTALLED) return;
    window.__LIAN_V61_EDITABLE_REPORT_GRADE_INSTALLED = true;

    const TAG = '[report grade v61]';

    function escapeHtmlV61(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function clampPercentV61(value) {
        const cleaned = String(value ?? '').replace(/[^0-9]/g, '');
        const number = Number(cleaned || 0);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function gradeFromScoreV61(score) {
        const n = Number(score || 0);
        if (n >= 90) return 'A';
        if (n >= 80) return 'B';
        if (n >= 70) return 'C';
        if (n >= 60) return 'D';
        return 'E';
    }

    function gradeLabelV61(grade) {
        const g = String(grade || '').trim().toUpperCase();
        if (g === 'A') return 'Sangat Layak';
        if (g === 'B') return 'Layak';
        if (g === 'C') return 'Layak dengan Catatan';
        if (g === 'D') return 'Berisiko';
        if (g === 'E') return 'Tidak Direkomendasikan';
        return 'Belum Dinilai';
    }

    function gradeColorV61(gradeOrScore) {
        const text = String(gradeOrScore ?? '').trim().toUpperCase();
        const grade = /^[A-E]$/.test(text) ? text : gradeFromScoreV61(Number(gradeOrScore || 0));
        if (grade === 'A') return '#059669';
        if (grade === 'B') return '#16a34a';
        if (grade === 'C') return '#d97706';
        if (grade === 'D') return '#ea580c';
        return '#dc2626';
    }

    function normalizeGradeV61(value, fallbackScore = 0) {
        const text = String(value ?? '').trim().toUpperCase();
        const match = text.match(/[A-E]/);
        return match ? match[0] : gradeFromScoreV61(fallbackScore);
    }

    function buildEditableFinalGradeCardV61(scoreResult = {}) {
        const score = clampPercentV61(scoreResult.finalScore ?? scoreResult.score ?? scoreResult.value ?? 0);
        const grade = normalizeGradeV61(scoreResult.grade, score);
        const label = scoreResult.gradeLabel || gradeLabelV61(grade);
        const color = gradeColorV61(grade);
        const physical = clampPercentV61(scoreResult.physicalScore ?? score);
        const raw = clampPercentV61(scoreResult.rawScore ?? score);
        const isLocked = Boolean(scoreResult.locked || (Array.isArray(scoreResult.hardRules) && scoreResult.hardRules.length));
        return `
            <div id="reportEditableFinalGradeCard" class="report-no-print-control" style="margin-top:14px; background:linear-gradient(135deg,#ffffff 0%,#eff6ff 45%,#ecfeff 100%); border:1.5px solid #bfdbfe; border-left:7px solid ${color}; border-radius:18px; padding:16px; box-shadow:0 12px 30px rgba(15,23,42,.08); break-inside:avoid; page-break-inside:avoid;">
                <div style="margin-bottom:13px;">
                    <div style="font-size:16px; font-weight:1000; color:#0f172a; line-height:1.2;">Penilaian Akhir Mobil</div>
                    <div style="font-size:11.5px; font-weight:750; color:#64748b; margin-top:4px; line-height:1.35;">Penilaian akhir mobil setelah dilakukan pengecekan secara keseluruhan.</div>
                </div>

                <div style="display:grid; grid-template-columns:minmax(0,1.15fr) minmax(115px,.85fr); gap:12px; align-items:stretch;">
                    <div style="background:#ffffff; border:1.5px solid #dbeafe; border-radius:16px; padding:13px; display:grid; align-content:center;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:10px;">
                            <div>
                                <div style="font-size:11px; font-weight:950; color:#64748b; text-transform:uppercase; letter-spacing:.04em;">Persentase Grade Mobil</div>
                                <div style="display:flex; align-items:baseline; gap:4px; margin-top:4px;">
                                    <span id="reportEditableScorePercent" contenteditable="true" spellcheck="false" inputmode="numeric" style="outline:none; cursor:text; color:${color}; font-size:44px; line-height:.98; font-weight:1000; letter-spacing:-1px; border-bottom:2px dashed ${color}55; min-width:58px; display:inline-block;" title="Klik untuk edit persentase">${score}</span>
                                    <span style="font-size:23px; font-weight:1000; color:${color};">%</span>
                                </div>
                            </div>
                            <div style="text-align:right; min-width:94px;">
                                <div style="font-size:11px; font-weight:900; color:#64748b;">Sistem</div>
                                <div style="font-size:13px; font-weight:1000; color:#0f172a; margin-top:3px;">${raw}%</div>
                                <div style="font-size:10px; font-weight:750; color:#64748b;">Raw score</div>
                            </div>
                        </div>
                        <div style="height:9px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-top:13px;">
                            <div id="reportEditableScoreBar" style="height:100%; width:${score}%; background:${color}; border-radius:999px; transition:.2s ease;"></div>
                        </div>
                    </div>

                    <div style="background:#ffffff; border:2px solid ${color}; border-radius:16px; padding:13px; text-align:center; display:flex; flex-direction:column; justify-content:center;">
                        <div style="font-size:11px; font-weight:950; color:#64748b; text-transform:uppercase; letter-spacing:.04em;">Grade</div>
                        <div id="reportEditableScoreGrade" contenteditable="true" spellcheck="false" style="outline:none; cursor:text; color:${color}; font-size:54px; line-height:.95; font-weight:1000; border-bottom:2px dashed ${color}55; display:inline-block; align-self:center; min-width:54px;" title="Klik untuk edit grade A-E">${escapeHtmlV61(grade)}</div>
                        <div id="reportEditableScoreLabel" style="font-size:12px; font-weight:1000; color:#0f172a; margin-top:8px; line-height:1.25;">${escapeHtmlV61(label)}</div>
                    </div>
                </div>
            </div>`;
    }

    function updateLegacyStatusAkhirV61(percent, grade) {
        const reportContent = document.getElementById('reportContent');
        if (!reportContent) return;
        const gradeText = normalizeGradeV61(grade, percent);
        const color = gradeColorV61(gradeText);
        try {
            const statusRow = Array.from(reportContent.querySelectorAll('.report-field-row'))
                .find(row => String(row.textContent || '').toLowerCase().includes('status akhir'));
            const valueSpan = statusRow?.querySelector('span');
            if (valueSpan) {
                valueSpan.innerHTML = `: <b style="color:${color};">Grade ${escapeHtmlV61(gradeText)} - ${escapeHtmlV61(gradeLabelV61(gradeText))}</b> (${clampPercentV61(percent)}%)`;
            }
        } catch (_) {}
    }

    function refreshEditableCardStyleV61(percent, grade) {
        const card = document.getElementById('reportEditableFinalGradeCard');
        if (!card) return;
        const score = clampPercentV61(percent);
        const normalizedGrade = normalizeGradeV61(grade, score);
        const color = gradeColorV61(normalizedGrade);

        const percentEl = document.getElementById('reportEditableScorePercent');
        const gradeEl = document.getElementById('reportEditableScoreGrade');
        const labelEl = document.getElementById('reportEditableScoreLabel');
        const barEl = document.getElementById('reportEditableScoreBar');
        card.style.borderLeftColor = color;
        if (percentEl) {
            percentEl.textContent = String(score);
            percentEl.style.color = color;
            percentEl.style.borderBottomColor = `${color}55`;
        }
        const percentSymbol = percentEl?.nextElementSibling;
        if (percentSymbol) percentSymbol.style.color = color;
        if (gradeEl) {
            gradeEl.textContent = normalizedGrade;
            gradeEl.style.color = color;
            gradeEl.style.borderBottomColor = `${color}55`;
            const gradePanel = gradeEl.closest('div[style*="border:2px"]');
            if (gradePanel) gradePanel.style.borderColor = color;
        }
        if (labelEl) labelEl.textContent = gradeLabelV61(normalizedGrade);
        if (barEl) {
            barEl.style.width = `${score}%`;
            barEl.style.background = color;
        }
        updateLegacyStatusAkhirV61(score, normalizedGrade);
    }

    function bindEditableFinalGradeCardV61() {
        const percentEl = document.getElementById('reportEditableScorePercent');
        const gradeEl = document.getElementById('reportEditableScoreGrade');
        if (!percentEl || !gradeEl || percentEl.dataset.boundV61 === 'true') return;

        percentEl.dataset.boundV61 = 'true';
        gradeEl.dataset.boundV61 = 'true';

        const sanitizePercent = () => {
            const score = clampPercentV61(percentEl.textContent);
            const grade = normalizeGradeV61(gradeEl.textContent, score);
            refreshEditableCardStyleV61(score, grade);
        };

        const sanitizeGrade = () => {
            const score = clampPercentV61(percentEl.textContent);
            const grade = normalizeGradeV61(gradeEl.textContent, score);
            refreshEditableCardStyleV61(score, grade);
        };

        percentEl.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                percentEl.blur();
            }
        });
        gradeEl.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                gradeEl.blur();
            }
        });

        percentEl.addEventListener('blur', sanitizePercent);
        gradeEl.addEventListener('blur', sanitizeGrade);
        percentEl.addEventListener('input', () => {
            const raw = String(percentEl.textContent || '').replace(/[^0-9]/g, '').slice(0, 3);
            if (String(percentEl.textContent || '') !== raw) percentEl.textContent = raw;
        });
        gradeEl.addEventListener('input', () => {
            const raw = String(gradeEl.textContent || '').toUpperCase().replace(/[^A-E]/g, '').slice(0, 1);
            if (String(gradeEl.textContent || '') !== raw) gradeEl.textContent = raw;
        });
    }

    function injectEditableFinalGradeCardV61(scoreResult = {}) {
        const reportContent = document.getElementById('reportContent');
        if (!reportContent) return;

        const categoryGrid = reportContent.querySelector('.report-category-grid');
        if (!categoryGrid) return;

        const existing = reportContent.querySelector('#reportEditableFinalGradeCard');
        if (existing) existing.remove();

        categoryGrid.insertAdjacentHTML('afterend', buildEditableFinalGradeCardV61(scoreResult));
        bindEditableFinalGradeCardV61();
    }

    async function enhanceEditableFinalGradeCardV61(inspection = {}) {
        let scoreResult = null;
        try {
            if (window.LianInspectionScoreDisplayV60 && typeof window.LianInspectionScoreDisplayV60.getScoreForInspection === 'function') {
                scoreResult = await window.LianInspectionScoreDisplayV60.getScoreForInspection(inspection);
            }
        } catch (err) {
            console.warn(TAG, 'ambil score engine gagal:', err?.message || err);
        }

        if (!scoreResult) {
            const fallbackScore = Number(inspection?.value || inspection?._value || 0) || 0;
            scoreResult = {
                finalScore: fallbackScore,
                rawScore: fallbackScore,
                physicalScore: fallbackScore,
                grade: gradeFromScoreV61(fallbackScore),
                gradeLabel: gradeLabelV61(gradeFromScoreV61(fallbackScore))
            };
        }

        injectEditableFinalGradeCardV61(scoreResult);
        console.log(TAG, 'editable final grade card tampil');
    }

    try {
        const previousGenerateAndShowReport = generateAndShowReport;
        generateAndShowReport = function (inspection) {
            const result = previousGenerateAndShowReport.apply(this, arguments);
            setTimeout(() => enhanceEditableFinalGradeCardV61(inspection), 280);
            return result;
        };
    } catch (err) {
        console.warn(TAG, 'override generateAndShowReport gagal:', err?.message || err);
    }

    window.LianReportEditableGradeV61 = {
        inject: injectEditableFinalGradeCardV61,
        enhance: enhanceEditableFinalGradeCardV61,
        bind: bindEditableFinalGradeCardV61
    };

    console.log('✅ inspection.js v61 editable final grade card loaded');
})();


// ================= V62: ROBUST SCORE RECALC FROM INSPECTION DETAILS =================
// Tujuan: history/report tidak lagi membaca value lama 0%, tetapi menghitung ulang
// langsung dari inspection_details + master sheetItems. Ini menjaga grade tetap benar
// untuk data lama dan data baru walaupun kolom value di tabel inspections kosong.
(function installRobustScoreRecalcV62(){
    if (window.__LIAN_V62_SCORE_RECALC_INSTALLED) return;
    window.__LIAN_V62_SCORE_RECALC_INSTALLED = true;

    const TAG = '[score v62]';
    const CACHE = window.__LIAN_SCORE_CACHE_V62 || (window.__LIAN_SCORE_CACHE_V62 = new Map());

    function escV62(value) {
        if (typeof escapeHtml === 'function') return escapeHtml(value);
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normTextV62(value) {
        return String(value ?? '').trim().toLowerCase();
    }

    function normalizeStatusV62(value) {
        const text = normTextV62(value);
        if (['good', 'baik', 'hijau', 'ok', 'aman', 'ada'].includes(text)) return 'good';
        if (['warning', 'perlu', 'perhatian', 'perlu perhatian', 'kuning', 'catatan', 'perlu_diperhatikan'].includes(text)) return 'warning';
        if (['bad', 'rusak', 'merah', 'parah', 'tidak baik', 'tidak_baik'].includes(text)) return 'bad';
        return '';
    }

    function gradeColorV62(grade) {
        const g = String(grade || '').toUpperCase();
        if (g === 'A') return '#16a34a';
        if (g === 'B') return '#22c55e';
        if (g === 'C') return '#f59e0b';
        if (g === 'D') return '#f97316';
        return '#ef4444';
    }

    function gradeFromScoreV62(score) {
        const n = Number(score || 0);
        if (n >= 90) return 'A';
        if (n >= 80) return 'B';
        if (n >= 70) return 'C';
        if (n >= 60) return 'D';
        return 'E';
    }

    function gradeLabelV62(grade) {
        const g = String(grade || '').toUpperCase();
        if (g === 'A') return 'Sangat layak';
        if (g === 'B') return 'Layak';
        if (g === 'C') return 'Cukup layak';
        if (g === 'D') return 'Berisiko';
        return 'Tidak layak';
    }

    const DOC_MAP_V62 = {
        'dokumen - bpkb': 'doc_bpkb',
        'dokumen - stnk': 'doc_stnk',
        'dokumen - faktur': 'doc_faktur',
        'dokumen - form a': 'doc_forma',
        'dokumen - kir': 'doc_kir',
        'dokumen - buku manual': 'doc_manual',
        'dokumen - buku servis': 'doc_servis'
    };

    const ACC_MAP_V62 = {
        'aksesori - kunci serep': 'acc_kunci_serep',
        'aksesori - kunci roda': 'acc_kunci_roda',
        'aksesori - ban serep': 'acc_ban_serep',
        'aksesori - dongkrak': 'acc_dongkrak'
    };

    function isAvailableMetaStatusV62(status) {
        const text = normTextV62(status);
        return ['ada', 'good', 'baik', 'true', '1', 'yes', 'ya'].includes(text);
    }

    function getMasterItemsV62() {
        try { return Array.isArray(sheetItems) ? sheetItems : []; }
        catch (_) { return []; }
    }

    function findMasterItemByNameV62(itemName) {
        const target = normTextV62(itemName);
        if (!target) return null;
        return getMasterItemsV62().find(item => normTextV62(item.name || item.item_name || item.title) === target) || null;
    }

    function parseDetailMetaV62(detail = {}, master = null) {
        let meta = {};
        try {
            meta = typeof parseDetailNoteToMeta === 'function'
                ? parseDetailNoteToMeta(detail.note || '')
                : { notes: String(detail.note || '') };
        } catch (_) {
            meta = { notes: String(detail.note || '') };
        }

        const photoUrls = String(detail.photo_url || detail.photoUrl || '')
            .split('\n')
            .map(url => url.trim())
            .filter(Boolean)
            .map(url => ({ url, viewUrl: url }));
        if (photoUrls.length) meta.photos = photoUrls;

        meta.itemName = detail.item_name || detail.itemName || master?.name || '';
        meta.category = master?.category || detail.category || detail.category_name || detail.categoryName || 'Lainnya';
        meta.critical_level = master?.critical_level || master?.criticalLevel || detail.critical_level || detail.criticalLevel || 'Low';
        return meta;
    }

    function buildScoreInputFromDetailsV62(details = [], inspection = {}) {
        const itemsData = {};
        const items = [];
        const documentsData = { ...(inspection._documentsData || inspection.documentsData || {}) };
        const accessoriesData = { ...(inspection._accessoriesData || inspection.accessoriesData || {}) };
        const usedIds = new Set();

        (details || []).forEach((detail, index) => {
            const itemName = String(detail.item_name || detail.itemName || '').trim();
            if (!itemName) return;
            const lowerName = normTextV62(itemName);

            if (DOC_MAP_V62[lowerName]) {
                documentsData[DOC_MAP_V62[lowerName]] = isAvailableMetaStatusV62(detail.status);
                return;
            }
            if (ACC_MAP_V62[lowerName]) {
                accessoriesData[ACC_MAP_V62[lowerName]] = isAvailableMetaStatusV62(detail.status);
                return;
            }

            const status = normalizeStatusV62(detail.status);
            if (!status) return;

            const master = findMasterItemByNameV62(itemName);
            const itemId = String(master?.id || detail.item_id || detail.itemId || itemName || `detail_${index}`).trim();
            if (!itemId) return;

            itemsData[itemId] = status;
            itemsData[itemId + '_data'] = parseDetailMetaV62(detail, master);

            if (!usedIds.has(itemId)) {
                usedIds.add(itemId);
                items.push({
                    ...(master || {}),
                    id: itemId,
                    name: master?.name || itemName,
                    category: master?.category || detail.category || detail.category_name || detail.categoryName || 'Lainnya',
                    critical_level: master?.critical_level || master?.criticalLevel || detail.critical_level || detail.criticalLevel || 'Low'
                });
            }
        });

        // Fallback untuk report yang sudah membawa _reportItemsData/_itemsData tetapi detail belum ada.
        const fallbackItemsData = inspection._reportItemsData || inspection._itemsData || inspection.itemsData || {};
        if (items.length === 0 && fallbackItemsData && Object.keys(fallbackItemsData).length) {
            Object.entries(fallbackItemsData).forEach(([key, status], index) => {
                if (String(key).endsWith('_data')) return;
                const cleanStatus = normalizeStatusV62(status);
                if (!cleanStatus) return;
                const meta = fallbackItemsData[key + '_data'] || {};
                const master = getMasterItemsV62().find(item =>
                    String(item.id || '') === String(key) ||
                    normTextV62(item.name || '') === normTextV62(meta.itemName || meta.item_name || key)
                );
                const itemId = String(master?.id || key || `fallback_${index}`);
                itemsData[itemId] = cleanStatus;
                itemsData[itemId + '_data'] = {
                    ...meta,
                    itemName: meta.itemName || meta.item_name || master?.name || key,
                    category: meta.category || meta.categoryName || master?.category || 'Lainnya',
                    critical_level: meta.critical_level || meta.criticalLevel || master?.critical_level || 'Low'
                };
                if (!usedIds.has(itemId)) {
                    usedIds.add(itemId);
                    items.push({
                        ...(master || {}),
                        id: itemId,
                        name: master?.name || meta.itemName || meta.item_name || key,
                        category: master?.category || meta.category || meta.categoryName || 'Lainnya',
                        critical_level: master?.critical_level || meta.critical_level || 'Low'
                    });
                }
            });
        }

        return { items, itemsData, documentsData, accessoriesData };
    }

    async function fetchDetailsV62(inspectionId, inspection = {}) {
        if (Array.isArray(inspection._details) && inspection._details.length) return inspection._details;
        if (!inspectionId) return [];
        const cacheKey = `details_v62_${inspectionId}`;
        if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);

        let details = [];
        try {
            if (typeof fetchInspectionDetailsForReport === 'function') {
                details = await fetchInspectionDetailsForReport(inspectionId);
            }
        } catch (err) {
            console.warn(TAG, 'fetchInspectionDetailsForReport gagal:', err?.message || err);
        }

        CACHE.set(cacheKey, details || []);
        return details || [];
    }

    async function getScoreForInspectionV62(inspection = {}) {
        const normalized = typeof normalizeInspectionForReport === 'function'
            ? normalizeInspectionForReport(inspection)
            : inspection;
        const inspectionId = normalized?.inspectionId || normalized?.id || inspection?.inspection_id || inspection?.id;
        const cacheKey = `score_v62_${inspectionId || JSON.stringify(normalized).slice(0, 80)}`;

        // Jangan pakai cache kosong ketika user baru submit/edit lalu data berubah.
        if (inspectionId && CACHE.has(cacheKey)) return CACHE.get(cacheKey);

        const details = await fetchDetailsV62(inspectionId, { ...normalized, _details: inspection?._details });
        const input = buildScoreInputFromDetailsV62(details, { ...normalized, ...inspection });

        let scoreResult = null;
        if (window.LianInspectionScore && typeof window.LianInspectionScore.evaluateInspection === 'function') {
            scoreResult = window.LianInspectionScore.evaluateInspection(input);
        }

        if (!scoreResult) {
            const itemStatuses = Object.entries(input.itemsData || {})
                .filter(([key, value]) => !String(key).endsWith('_data') && normalizeStatusV62(value))
                .map(([, value]) => normalizeStatusV62(value));
            const total = itemStatuses.length;
            const good = itemStatuses.filter(v => v === 'good').length;
            const warning = itemStatuses.filter(v => v === 'warning').length;
            const bad = itemStatuses.filter(v => v === 'bad').length;
            const fallbackScore = total ? Math.round(((good * 100) + (warning * 60) + (bad * 0)) / total) : Number(normalized?.value || 0) || 0;
            const grade = gradeFromScoreV62(fallbackScore);
            scoreResult = {
                finalScore: fallbackScore,
                rawScore: fallbackScore,
                physicalScore: fallbackScore,
                documentScore: 0,
                accessoryScore: 0,
                grade,
                gradeLabel: gradeLabelV62(grade),
                summary: [`${good} item baik, ${warning} perlu perhatian, ${bad} rusak.`],
                counts: { total, good, warning, bad }
            };
        }

        // Debug ringan agar bisa dipastikan bukan membaca value 0 dari inspections.
        console.log(TAG, 'score dihitung ulang dari details', {
            inspectionId,
            details: details.length,
            items: input.items.length,
            score: scoreResult.finalScore,
            grade: scoreResult.grade
        });

        if (inspectionId) CACHE.set(cacheKey, scoreResult);
        return scoreResult;
    }

    function setHistoryCardLoadingV62(card) {
        const scoreNode = card?.querySelector('p.text-lg.font-black');
        if (scoreNode && String(scoreNode.textContent || '').trim() === '0%') {
            scoreNode.textContent = '...';
        }
        const statusNode = scoreNode?.nextElementSibling;
        if (statusNode && String(statusNode.textContent || '').toLowerCase().includes('perlu')) {
            statusNode.textContent = 'Menghitung nilai';
        }
    }

    function updateHistoryCardScoreV62(card, scoreResult) {
        if (!card || !scoreResult) return;
        const score = Math.round(Number(scoreResult.finalScore || 0));
        const grade = String(scoreResult.grade || gradeFromScoreV62(score)).toUpperCase();
        const color = gradeColorV62(grade);

        card.style.borderColor = color;

        const scoreNode = card.querySelector('p.text-lg.font-black');
        if (scoreNode) {
            scoreNode.textContent = `${score}%`;
            scoreNode.style.color = color;
        }

        const statusNode = scoreNode?.nextElementSibling;
        if (statusNode) {
            statusNode.textContent = `Grade ${grade}`;
            statusNode.style.color = '#475569';
        }

        const emojiNode = card.querySelector('h3 + span');
        if (emojiNode) {
            emojiNode.textContent = (grade === 'A' || grade === 'B') ? '🟢' : (grade === 'C' ? '🟡' : '🔴');
        }

        const progress = Array.from(card.querySelectorAll('div'))
            .find(el => String(el.getAttribute('style') || '').includes('height:100%') && String(el.getAttribute('style') || '').includes('width:'));
        if (progress) {
            progress.style.width = `${Math.max(0, Math.min(100, score))}%`;
            progress.style.background = color;
        }
    }

    async function enhanceHistoryScoresV62() {
        const cards = Array.from(document.querySelectorAll('[data-history-inspection-id]'));
        if (!cards.length) return;

        for (const card of cards) {
            const id = card.dataset.historyInspectionId;
            if (!id) continue;
            setHistoryCardLoadingV62(card);
            try {
                const row = (typeof allInspections !== 'undefined' ? (allInspections || []) : [])
                    .find(item => String(item.id || item.inspection_id || item.inspectionId || '') === String(id));
                const scoreResult = await getScoreForInspectionV62(row || { id, inspectionId: id });
                updateHistoryCardScoreV62(card, scoreResult);
            } catch (err) {
                console.warn(TAG, 'enhance history gagal:', id, err?.message || err);
            }
        }
    }

    function updateReportStatusAkhirV62(scoreResult = {}) {
        const reportContent = document.getElementById('reportContent');
        if (!reportContent) return;
        const score = Math.round(Number(scoreResult.finalScore || 0));
        const grade = String(scoreResult.grade || gradeFromScoreV62(score)).toUpperCase();
        const color = gradeColorV62(grade);
        try {
            const statusRow = Array.from(reportContent.querySelectorAll('.report-field-row'))
                .find(row => String(row.textContent || '').toLowerCase().includes('status akhir'));
            const valueSpan = statusRow?.querySelector('span');
            if (valueSpan) {
                valueSpan.innerHTML = `: <b style="color:${color};">Grade ${escV62(grade)} - ${escV62(scoreResult.gradeLabel || gradeLabelV62(grade))}</b> (${score}%)`;
            }
        } catch (_) {}
    }

    async function enhanceCurrentReportV62(inspection = {}) {
        try {
            const scoreResult = await getScoreForInspectionV62(inspection);
            if (!scoreResult) return;

            // Supaya tidak ada dua blok grade yang saling bertentangan, blok v60 atas dihapus.
            const reportContent = document.getElementById('reportContent');
            reportContent?.querySelector('#reportScoreEngineBlock')?.remove();

            // Card akhir yang editable tetap dipakai, tetapi nilainya dipaksa dari hasil hitung v62.
            if (window.LianReportEditableGradeV61 && typeof window.LianReportEditableGradeV61.inject === 'function') {
                window.LianReportEditableGradeV61.inject(scoreResult);
            }
            updateReportStatusAkhirV62(scoreResult);
            console.log(TAG, 'report final grade diperbaiki', scoreResult);
        } catch (err) {
            console.warn(TAG, 'enhance report gagal:', err?.message || err);
        }
    }

    // Override fungsi display global agar v61 juga memakai perhitungan v62.
    window.LianInspectionScoreDisplayV62 = {
        getScoreForInspection: getScoreForInspectionV62,
        enhanceHistoryScores: enhanceHistoryScoresV62,
        enhanceCurrentReport: enhanceCurrentReportV62,
        buildScoreInputFromDetails: buildScoreInputFromDetailsV62
    };

    if (window.LianInspectionScoreDisplayV60) {
        window.LianInspectionScoreDisplayV60.getScoreForInspection = getScoreForInspectionV62;
        window.LianInspectionScoreDisplayV60.enhanceHistoryScores = enhanceHistoryScoresV62;
        window.LianInspectionScoreDisplayV60.enhanceCurrentReport = enhanceCurrentReportV62;
    }

    try {
        const previousRenderInspectionHistory = renderInspectionHistory;
        renderInspectionHistory = function () {
            const result = previousRenderInspectionHistory.apply(this, arguments);
            setTimeout(enhanceHistoryScoresV62, 80);
            setTimeout(enhanceHistoryScoresV62, 700);
            return result;
        };
    } catch (err) {
        console.warn(TAG, 'override renderInspectionHistory gagal:', err?.message || err);
    }

    try {
        const previousGenerateAndShowReport = generateAndShowReport;
        generateAndShowReport = function (inspection) {
            const result = previousGenerateAndShowReport.apply(this, arguments);
            setTimeout(() => enhanceCurrentReportV62(inspection), 650);
            setTimeout(() => enhanceCurrentReportV62(inspection), 1400);
            return result;
        };
    } catch (err) {
        console.warn(TAG, 'override generateAndShowReport gagal:', err?.message || err);
    }

    // Jika history sudah terbuka saat modul ini selesai load.
    setTimeout(enhanceHistoryScoresV62, 1000);

    console.log('✅ inspection.js v62 robust score recalculation loaded');
})();


// ================= V69: CLEAN PDF EXPORT CONNECTOR =================
// Export PDF dipindahkan ke js/report-pdf.js agar inspection.js tidak terus membesar.
// Connector ini hanya menyimpan data report terakhir, memuat modul PDF, dan menghubungkan tombol Export PDF.
(function () {
    const TAG = '[pdf connector v69]';
    const PDF_SCRIPT_ID = 'lian-report-pdf-v69-script';
    const PDF_SCRIPT_SRC = 'js/report-pdf.js';

    function loadReportPdfModuleV69() {
        return new Promise((resolve, reject) => {
            try {
                if (window.LianReportPdf?.exportPdf) {
                    resolve(window.LianReportPdf);
                    return;
                }

                const existing = document.getElementById(PDF_SCRIPT_ID);
                if (existing) {
                    existing.addEventListener('load', () => resolve(window.LianReportPdf), { once: true });
                    existing.addEventListener('error', () => reject(new Error('Gagal memuat modul PDF.')), { once: true });
                    return;
                }

                const script = document.createElement('script');
                script.id = PDF_SCRIPT_ID;
                script.src = PDF_SCRIPT_SRC;
                script.async = true;
                script.onload = () => resolve(window.LianReportPdf);
                script.onerror = () => reject(new Error('Gagal memuat js/report-pdf.js. Pastikan file sudah ada di folder js/.'));
                document.head.appendChild(script);
            } catch (err) {
                reject(err);
            }
        });
    }

    async function runReportPdfExportV69(event) {
        if (event) event.preventDefault();
        try {
            const module = await loadReportPdfModuleV69();
            if (!module || typeof module.exportPdf !== 'function') {
                throw new Error('Modul PDF belum siap.');
            }
            await module.exportPdf();
        } catch (err) {
            console.error(TAG, err);
            if (typeof showToast === 'function') showToast('Gagal export PDF: ' + (err?.message || err), 'error');
            else alert('Gagal export PDF: ' + (err?.message || err));
        }
    }

    async function configureReportPdfButtonsV69() {
        try {
            const module = await loadReportPdfModuleV69();
            if (module && typeof module.configureButtons === 'function') {
                module.configureButtons({ exportHandler: runReportPdfExportV69 });
            }
        } catch (err) {
            console.warn(TAG, 'configure button gagal:', err?.message || err);
        }
    }

    try {
        if (typeof generateAndShowReport === 'function' && !window.__lianPdfV69GenerateHooked) {
            const previousGenerateAndShowReport = generateAndShowReport;
            generateAndShowReport = function (inspection) {
                try {
                    window.__lianReportPdfLastInspectionV69 = typeof normalizeInspectionForReport === 'function'
                        ? normalizeInspectionForReport(inspection || {})
                        : (inspection || {});
                } catch (_) {
                    window.__lianReportPdfLastInspectionV69 = inspection || {};
                }

                const result = previousGenerateAndShowReport.apply(this, arguments);
                [250, 700, 1400, 2600].forEach(delay => setTimeout(configureReportPdfButtonsV69, delay));
                return result;
            };
            window.__lianPdfV69GenerateHooked = true;
        }

        printReportAction = runReportPdfExportV69;
        downloadReportAction = runReportPdfExportV69;

        window.LianReportPdfConnectorV69 = {
            load: loadReportPdfModuleV69,
            exportPdf: runReportPdfExportV69,
            configureButtons: configureReportPdfButtonsV69
        };

        [500, 1500, 3000].forEach(delay => setTimeout(configureReportPdfButtonsV69, delay));
        console.log('✅ inspection.js v69 clean PDF connector loaded');
    } catch (err) {
        console.warn(TAG, 'init gagal:', err?.message || err);
    }
})();

// =============================================================
// V102 - Targeted mobile fixes: safe progress count, yellow category bars,
//       clean final grade card without raw score block
// =============================================================
(function installLianV102MobileProgressAndGradeFix(){
    if (window.__LIAN_V102_MOBILE_PROGRESS_GRADE_FIX_INSTALLED) return;
    window.__LIAN_V102_MOBILE_PROGRESS_GRADE_FIX_INSTALLED = true;

    const TAG = '[v102 mobile progress + grade]';
    const VALID_STATUS = new Set(['good', 'warning', 'bad']);

    function isValidInspectionStatusV102(value) {
        return VALID_STATUS.has(String(value || '').trim());
    }

    function getActiveSheetItemsV102() {
        return Array.isArray(sheetItems) ? sheetItems : [];
    }

    function getCategoryKeyV102(category, index = 0) {
        return String(category?.id || category?.name || index).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function installStyleV102() {
        if (document.getElementById('lian-v102-mobile-progress-grade-style')) return;

        const style = document.createElement('style');
        style.id = 'lian-v102-mobile-progress-grade-style';
        style.textContent = `
            /* Bar progress kategori dibuat kuning agar kontras di card biru. */
            [data-category-progress-fill] {
                background: linear-gradient(90deg, #facc15 0%, #f59e0b 100%) !important;
                background-image: linear-gradient(90deg, #facc15 0%, #f59e0b 100%) !important;
            }

            /* Final grade card: raw score/sistem disembunyikan, card dibuat aman untuk layar sempit. */
            #reportEditableFinalGradeCard {
                overflow: hidden !important;
            }
            #reportEditableFinalGradeCard #reportEditableScoreBar {
                max-width: 100% !important;
                min-width: 0 !important;
                box-sizing: border-box !important;
            }
            #reportEditableFinalGradeCard [data-lian-raw-score-block="true"] {
                display: none !important;
            }

            @media (max-width: 720px) {
                #reportEditableFinalGradeCard {
                    padding: 14px !important;
                }
                #reportEditableFinalGradeCard [data-lian-grade-main-grid="true"] {
                    grid-template-columns: minmax(0, 1fr) minmax(112px, .62fr) !important;
                    gap: 10px !important;
                    align-items: stretch !important;
                }
                #reportEditableFinalGradeCard [data-lian-grade-score-card="true"] {
                    min-width: 0 !important;
                    overflow: hidden !important;
                    padding: 12px !important;
                }
                #reportEditableFinalGradeCard [data-lian-grade-bar-wrap="true"] {
                    width: 100% !important;
                    max-width: 100% !important;
                    overflow: hidden !important;
                    box-sizing: border-box !important;
                }
                #reportEditableScorePercent {
                    font-size: 42px !important;
                    min-width: 0 !important;
                }
                #reportEditableScoreGrade {
                    font-size: 52px !important;
                    min-width: 42px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function patchCategoryProgressBarColorV102(root = document) {
        try {
            root.querySelectorAll?.('[data-category-progress-fill]')?.forEach(fill => {
                fill.classList.remove('from-green-500', 'to-emerald-600', 'from-blue-500', 'to-cyan-600');
                fill.style.setProperty('background', 'linear-gradient(90deg, #facc15 0%, #f59e0b 100%)', 'important');
                fill.style.setProperty('background-image', 'linear-gradient(90deg, #facc15 0%, #f59e0b 100%)', 'important');
            });
        } catch (err) {
            console.warn(TAG, 'patch warna progress kategori gagal:', err?.message || err);
        }
    }

    function getInspectionCategoryProgressV102(items = []) {
        const list = Array.isArray(items) ? items : [];
        const total = list.length;
        const completed = list.filter(item => isValidInspectionStatusV102(inspectionItemsData?.[item.id])).length;
        const safeCompleted = Math.min(completed, total);
        const percentage = total > 0 ? Math.round((safeCompleted / total) * 100) : 0;
        return { total, completed: safeCompleted, percentage };
    }

    try {
        getInspectionCategoryProgress = getInspectionCategoryProgressV102;
    } catch (err) {
        console.warn(TAG, 'override getInspectionCategoryProgress gagal:', err?.message || err);
    }

    try {
        const previousUpdateProgressBar = typeof updateProgressBar === 'function' ? updateProgressBar : null;
        updateProgressBar = function updateProgressBarV102() {
            const items = getActiveSheetItemsV102();
            const total = items.length;
            const completed = items.filter(item => isValidInspectionStatusV102(inspectionItemsData?.[item.id])).length;
            const safeCompleted = Math.min(completed, total);
            const percentage = total > 0 ? Math.round((safeCompleted / total) * 100) : 0;

            const progressBar = document.getElementById('progressBar');
            if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;

            const progressText = document.getElementById('progressText');
            if (progressText) progressText.textContent = `${safeCompleted} / ${total}`;

            try {
                (sheetCategories || []).forEach((cat, index) => {
                    const safeCategoryKey = getCategoryKeyV102(cat, index);
                    const itemsInCat = items.filter(item => item.category === cat.name);
                    const catProgress = getInspectionCategoryProgressV102(itemsInCat);

                    const fill = document.querySelector(`[data-category-progress-fill="${safeCategoryKey}"]`);
                    const text = document.querySelector(`[data-category-progress-text="${safeCategoryKey}"]`);
                    if (fill) {
                        fill.style.width = `${Math.max(0, Math.min(100, catProgress.percentage))}%`;
                        fill.style.setProperty('background', 'linear-gradient(90deg, #facc15 0%, #f59e0b 100%)', 'important');
                        fill.style.setProperty('background-image', 'linear-gradient(90deg, #facc15 0%, #f59e0b 100%)', 'important');
                    }
                    if (text) text.textContent = `${catProgress.completed}/${catProgress.total}`;
                });
            } catch (err) {
                console.warn('⚠️ Update progress kategori gagal:', err);
            }

            patchCategoryProgressBarColorV102();
        };
    } catch (err) {
        console.warn(TAG, 'override updateProgressBar gagal:', err?.message || err);
    }

    function cleanEditableFinalGradeCardV102() {
        const card = document.getElementById('reportEditableFinalGradeCard');
        const percentEl = document.getElementById('reportEditableScorePercent');
        const barEl = document.getElementById('reportEditableScoreBar');
        if (!card || !percentEl) return;

        try {
            const scoreLine = percentEl.parentElement;
            const scoreColumn = scoreLine?.parentElement;
            const scoreHeaderRow = scoreColumn?.parentElement;
            const rawBlock = Array.from(scoreHeaderRow?.children || []).find(child => {
                if (child === scoreColumn) return false;
                const text = String(child.textContent || '').toLowerCase();
                return text.includes('sistem') || text.includes('raw score');
            });

            if (rawBlock) {
                rawBlock.dataset.lianRawScoreBlock = 'true';
                rawBlock.style.setProperty('display', 'none', 'important');
            }

            if (scoreHeaderRow) {
                scoreHeaderRow.style.setProperty('display', 'block', 'important');
                scoreHeaderRow.style.setProperty('min-width', '0', 'important');
                scoreHeaderRow.style.setProperty('overflow', 'visible', 'important');
            }

            const scoreCard = scoreHeaderRow?.parentElement;
            if (scoreCard) {
                scoreCard.dataset.lianGradeScoreCard = 'true';
                scoreCard.style.setProperty('min-width', '0', 'important');
                scoreCard.style.setProperty('overflow', 'hidden', 'important');
                scoreCard.style.setProperty('box-sizing', 'border-box', 'important');
            }

            const mainGrid = scoreCard?.parentElement;
            if (mainGrid) {
                mainGrid.dataset.lianGradeMainGrid = 'true';
                mainGrid.style.setProperty('grid-template-columns', 'minmax(0, 1.1fr) minmax(112px, .68fr)', 'important');
                mainGrid.style.setProperty('gap', '10px', 'important');
                mainGrid.style.setProperty('align-items', 'stretch', 'important');
            }

            const barWrap = barEl?.parentElement;
            if (barWrap) {
                barWrap.dataset.lianGradeBarWrap = 'true';
                barWrap.style.setProperty('width', '100%', 'important');
                barWrap.style.setProperty('max-width', '100%', 'important');
                barWrap.style.setProperty('min-width', '0', 'important');
                barWrap.style.setProperty('overflow', 'hidden', 'important');
                barWrap.style.setProperty('box-sizing', 'border-box', 'important');
            }
            if (barEl) {
                const numeric = Number(String(percentEl.textContent || '').replace(/[^0-9]/g, '')) || 0;
                barEl.style.width = `${Math.max(0, Math.min(100, numeric))}%`;
                barEl.style.setProperty('max-width', '100%', 'important');
                barEl.style.setProperty('min-width', '0', 'important');
                barEl.style.setProperty('box-sizing', 'border-box', 'important');
            }
        } catch (err) {
            console.warn(TAG, 'cleanup final grade gagal:', err?.message || err);
        }
    }

    function scheduleReportCleanupV102() {
        [80, 220, 420, 760, 1200, 1800].forEach(delay => {
            setTimeout(() => {
                cleanEditableFinalGradeCardV102();
                patchCategoryProgressBarColorV102(document);
            }, delay);
        });
    }

    try {
        const previousGenerateAndShowReport = typeof generateAndShowReport === 'function' ? generateAndShowReport : null;
        if (previousGenerateAndShowReport && !window.__LIAN_V102_GENERATE_HOOKED) {
            generateAndShowReport = function generateAndShowReportV102() {
                const result = previousGenerateAndShowReport.apply(this, arguments);
                scheduleReportCleanupV102();
                return result;
            };
            window.__LIAN_V102_GENERATE_HOOKED = true;
        }
    } catch (err) {
        console.warn(TAG, 'hook generateAndShowReport gagal:', err?.message || err);
    }

    try {
        if (window.LianReportEditableGradeV61) {
            const previousInject = window.LianReportEditableGradeV61.inject;
            if (typeof previousInject === 'function' && !window.LianReportEditableGradeV61.__v102InjectWrapped) {
                window.LianReportEditableGradeV61.inject = function injectV102() {
                    const result = previousInject.apply(this, arguments);
                    scheduleReportCleanupV102();
                    return result;
                };
                window.LianReportEditableGradeV61.__v102InjectWrapped = true;
            }
        }
    } catch (err) {
        console.warn(TAG, 'wrap grade inject gagal:', err?.message || err);
    }

    installStyleV102();
    setTimeout(() => {
        try {
            if (typeof updateProgressBar === 'function') updateProgressBar();
            patchCategoryProgressBarColorV102(document);
            cleanEditableFinalGradeCardV102();
        } catch (_) {}
    }, 300);

    window.LianV102MobileProgressGradeFix = {
        updateProgressBar,
        getInspectionCategoryProgress: getInspectionCategoryProgressV102,
        cleanEditableFinalGradeCard: cleanEditableFinalGradeCardV102,
        patchCategoryProgressBarColor: patchCategoryProgressBarColorV102
    };

    console.log('✅ inspection.js v102 mobile progress + final grade cleanup loaded');
})();



// =============================================================
// V108 - SAFE CLEANUP: snapshot text hidden + mobile grade/progress cleanup
// =============================================================
// Catatan:
// - Tidak mengubah alur submit, sync, edit, delete, upload foto, atau database.
// - Patch ini hanya merapikan tampilan laporan/progress dan menyembunyikan metadata internal.
(function installLianV108SafeReportUiCleanup() {
    if (window.__LIAN_V108_SAFE_REPORT_UI_CLEANUP_INSTALLED) return;
    window.__LIAN_V108_SAFE_REPORT_UI_CLEANUP_INSTALLED = true;

    const TAG = '[v108-safe-report-ui]';
    const SNAPSHOT_TEXT_RE = /[\s\[(]*LIAN_REPORT_SNAPSHOT:\{[\s\S]*?\}[\s\])]*/gi;

    function cleanSnapshotTextV108(value) {
        return String(value ?? '')
            .replace(SNAPSHOT_TEXT_RE, ' ')
            .replace(/\(\s*\)/g, '')
            .replace(/\[\s*\]/g, '')
            .replace(/\s+([—–-])\s+/g, ' $1 ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function escapeV108(value) {
        if (typeof escapeHtml === 'function') return escapeHtml(value);
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function clampPercentV108(value) {
        const num = Number(String(value ?? '').replace(/[^0-9]/g, ''));
        if (!Number.isFinite(num)) return 0;
        return Math.max(0, Math.min(100, Math.round(num)));
    }

    function gradeFromScoreV108(score) {
        const n = Number(score || 0);
        if (n >= 90) return 'A';
        if (n >= 80) return 'B';
        if (n >= 70) return 'C';
        if (n >= 60) return 'D';
        return 'E';
    }

    function gradeLabelV108(grade) {
        const g = String(grade || '').toUpperCase();
        if (g === 'A') return 'Sangat layak';
        if (g === 'B') return 'Layak';
        if (g === 'C') return 'Cukup layak';
        if (g === 'D') return 'Berisiko';
        return 'Tidak layak';
    }

    function gradeColorV108(grade) {
        const g = String(grade || '').toUpperCase();
        if (g === 'A') return '#16a34a';
        if (g === 'B') return '#22c55e';
        if (g === 'C') return '#f59e0b';
        if (g === 'D') return '#f97316';
        return '#ef4444';
    }

    function normalizeGradeV108(value, score = 0) {
        const text = String(value || '').toUpperCase();
        const match = text.match(/[A-E]/);
        return match ? match[0] : gradeFromScoreV108(score);
    }

    function isCompletedStatusV108(value) {
        return value === 'good' || value === 'warning' || value === 'bad';
    }

    function applyCategoryProgressColorV108() {
        try {
            document.querySelectorAll('[data-category-progress-fill]').forEach(fill => {
                fill.classList.remove('from-green-500', 'to-emerald-600', 'from-blue-500', 'to-cyan-600');
                fill.style.background = 'linear-gradient(90deg, #facc15, #f59e0b)';
            });
        } catch (_) {}
    }

    function updateCategoryProgressTextV108() {
        try {
            (sheetCategories || []).forEach((cat, index) => {
                const safeCategoryKey = String(cat.id || cat.name || index).replace(/[^a-zA-Z0-9_-]/g, '_');
                const itemsInCat = (sheetItems || []).filter(item => item.category === cat.name);
                const total = itemsInCat.length;
                const completed = itemsInCat.filter(item => isCompletedStatusV108(inspectionItemsData?.[item.id])).length;
                const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

                const fill = document.querySelector(`[data-category-progress-fill="${safeCategoryKey}"]`);
                const text = document.querySelector(`[data-category-progress-text="${safeCategoryKey}"]`);

                if (fill) {
                    fill.style.width = `${percentage}%`;
                    fill.style.background = 'linear-gradient(90deg, #facc15, #f59e0b)';
                }
                if (text) text.textContent = `${completed}/${total}`;
            });
        } catch (err) {
            console.warn(TAG, 'update kategori progress dilewati:', err?.message || err);
        }
    }

    // Fix progress 14/13: hanya hitung item resmi dari sheetItems, bukan metadata/string lain.
    try {
        const previousUpdateProgressBar = typeof updateProgressBar === 'function' ? updateProgressBar : null;
        updateProgressBar = function () {
            const total = (sheetItems || []).length;
            const completed = (sheetItems || []).filter(item => isCompletedStatusV108(inspectionItemsData?.[item.id])).length;
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

            const progressBar = document.getElementById('progressBar');
            const progressText = document.getElementById('progressText');
            if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
            if (progressText) progressText.textContent = `${completed} / ${total}`;

            updateCategoryProgressTextV108();
            applyCategoryProgressColorV108();
        };
        updateProgressBar.__previousUpdateProgressBarV108 = previousUpdateProgressBar;
    } catch (err) {
        console.warn(TAG, 'patch updateProgressBar gagal:', err?.message || err);
    }

    // Setelah kategori dirender, paksa warna progress kategori menjadi kuning/oranye.
    try {
        const previousRenderInspectionItems = typeof renderInspectionItems === 'function' ? renderInspectionItems : null;
        if (previousRenderInspectionItems) {
            renderInspectionItems = function () {
                const result = previousRenderInspectionItems.apply(this, arguments);
                setTimeout(() => {
                    try {
                        updateProgressBar();
                        applyCategoryProgressColorV108();
                    } catch (_) {}
                }, 0);
                return result;
            };
        }
    } catch (err) {
        console.warn(TAG, 'patch renderInspectionItems gagal:', err?.message || err);
    }

    // Bersihkan metadata snapshot dari parser note agar tidak muncul di item, temuan, poin, dan caption.
    try {
        const previousParseDetailNoteToMeta = typeof parseDetailNoteToMeta === 'function' ? parseDetailNoteToMeta : null;
        parseDetailNoteToMeta = function (note = '') {
            const cleanNote = cleanSnapshotTextV108(note);
            const base = previousParseDetailNoteToMeta
                ? previousParseDetailNoteToMeta.call(this, cleanNote)
                : { notes: cleanNote };

            ['notes', 'selectedDamage', 'itemName', 'item_name', 'category', 'categoryName', 'critical_level'].forEach(key => {
                if (base && base[key] !== undefined) base[key] = cleanSnapshotTextV108(base[key]);
            });

            return base || { notes: cleanNote };
        };
    } catch (err) {
        console.warn(TAG, 'patch parseDetailNoteToMeta gagal:', err?.message || err);
    }

    try {
        const previousSplitInspectionCaption = typeof splitInspectionCaption === 'function' ? splitInspectionCaption : null;
        if (previousSplitInspectionCaption) {
            splitInspectionCaption = function (caption = '', fallback = '') {
                return previousSplitInspectionCaption.call(
                    this,
                    cleanSnapshotTextV108(caption),
                    cleanSnapshotTextV108(fallback)
                );
            };
        }
    } catch (err) {
        console.warn(TAG, 'patch splitInspectionCaption gagal:', err?.message || err);
    }

    try {
        const previousBuildCaptionHtml = typeof buildCaptionHtml === 'function' ? buildCaptionHtml : null;
        if (previousBuildCaptionHtml) {
            buildCaptionHtml = function (caption = '', fallback = '') {
                return previousBuildCaptionHtml.call(
                    this,
                    cleanSnapshotTextV108(caption),
                    cleanSnapshotTextV108(fallback)
                );
            };
        }
    } catch (err) {
        console.warn(TAG, 'patch buildCaptionHtml gagal:', err?.message || err);
    }

    function sanitizeReportSnapshotDomV108() {
        const root = document.getElementById('reportContent');
        if (!root) return;

        try {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            nodes.forEach(node => {
                if (String(node.nodeValue || '').includes('LIAN_REPORT_SNAPSHOT')) {
                    node.nodeValue = cleanSnapshotTextV108(node.nodeValue);
                }
            });

            root.querySelectorAll('*').forEach(el => {
                Array.from(el.attributes || []).forEach(attr => {
                    if (String(attr.value || '').includes('LIAN_REPORT_SNAPSHOT')) {
                        el.setAttribute(attr.name, cleanSnapshotTextV108(attr.value));
                    }
                });
            });
        } catch (err) {
            console.warn(TAG, 'sanitize DOM report gagal:', err?.message || err);
        }
    }

    function buildFinalGradeCardV108(scoreResult = {}) {
        const score = clampPercentV108(scoreResult.finalScore ?? scoreResult.score ?? scoreResult.value ?? 0);
        const grade = normalizeGradeV108(scoreResult.grade, score);
        const label = scoreResult.gradeLabel || gradeLabelV108(grade);
        const color = gradeColorV108(grade);

        return `
            <div id="reportEditableFinalGradeCard" class="report-no-print-control" style="margin-top:14px; background:linear-gradient(135deg,#ffffff 0%,#eff6ff 45%,#ecfeff 100%); border:1.5px solid #bfdbfe; border-left:7px solid ${color}; border-radius:18px; padding:16px; box-shadow:0 12px 30px rgba(15,23,42,.08); break-inside:avoid; page-break-inside:avoid; overflow:hidden;">
                <style>
                    @media (max-width: 420px) {
                        #reportEditableFinalGradeCard .lian-final-grade-grid-v108 {
                            grid-template-columns:minmax(0,1fr) minmax(92px,.72fr) !important;
                            gap:10px !important;
                        }
                        #reportEditableFinalGradeCard .lian-score-panel-v108,
                        #reportEditableFinalGradeCard .lian-grade-panel-v108 {
                            padding:12px 10px !important;
                            min-width:0 !important;
                        }
                        #reportEditableFinalGradeCard #reportEditableScorePercent {
                            font-size:42px !important;
                            min-width:0 !important;
                        }
                        #reportEditableFinalGradeCard #reportEditableScoreGrade {
                            font-size:52px !important;
                        }
                    }
                </style>
                <div style="margin-bottom:13px;">
                    <div style="font-size:16px; font-weight:1000; color:#0f172a; line-height:1.2;">Penilaian Akhir Mobil</div>
                    <div style="font-size:11.5px; font-weight:750; color:#64748b; margin-top:4px; line-height:1.35;">Penilaian akhir mobil setelah dilakukan pengecekan secara keseluruhan.</div>
                </div>

                <div class="lian-final-grade-grid-v108" style="display:grid; grid-template-columns:minmax(0,1.15fr) minmax(110px,.85fr); gap:12px; align-items:stretch;">
                    <div class="lian-score-panel-v108" style="min-width:0; background:#ffffff; border:1.5px solid #dbeafe; border-radius:16px; padding:13px; display:grid; align-content:center; overflow:hidden;">
                        <div style="min-width:0;">
                            <div style="font-size:11px; font-weight:950; color:#64748b; text-transform:uppercase; letter-spacing:.04em; line-height:1.35;">Persentase Grade Mobil</div>
                            <div style="display:flex; align-items:baseline; gap:4px; margin-top:4px; min-width:0;">
                                <span id="reportEditableScorePercent" contenteditable="true" spellcheck="false" inputmode="numeric" style="outline:none; cursor:text; color:${color}; font-size:44px; line-height:.98; font-weight:1000; letter-spacing:-1px; border-bottom:2px dashed ${color}55; min-width:58px; display:inline-block;" title="Klik untuk edit persentase">${score}</span>
                                <span style="font-size:23px; font-weight:1000; color:${color};">%</span>
                            </div>
                        </div>
                        <div style="height:9px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-top:13px; width:100%;">
                            <div id="reportEditableScoreBar" style="height:100%; width:${score}%; max-width:100%; background:${color}; border-radius:999px; transition:.2s ease;"></div>
                        </div>
                    </div>

                    <div class="lian-grade-panel-v108" style="min-width:0; background:#ffffff; border:2px solid ${color}; border-radius:16px; padding:13px; text-align:center; display:flex; flex-direction:column; justify-content:center; overflow:hidden;">
                        <div style="font-size:11px; font-weight:950; color:#64748b; text-transform:uppercase; letter-spacing:.04em;">Grade</div>
                        <div id="reportEditableScoreGrade" contenteditable="true" spellcheck="false" style="outline:none; cursor:text; color:${color}; font-size:54px; line-height:.95; font-weight:1000; border-bottom:2px dashed ${color}55; display:inline-block; align-self:center; min-width:54px;" title="Klik untuk edit grade A-E">${escapeV108(grade)}</div>
                        <div id="reportEditableScoreLabel" style="font-size:12px; font-weight:1000; color:#0f172a; margin-top:8px; line-height:1.25;">${escapeV108(label)}</div>
                    </div>
                </div>
            </div>`;
    }

    function updateLegacyStatusAkhirV108(percent, grade) {
        const reportContent = document.getElementById('reportContent');
        if (!reportContent) return;

        const score = clampPercentV108(percent);
        const normalizedGrade = normalizeGradeV108(grade, score);
        const color = gradeColorV108(normalizedGrade);

        try {
            const statusRow = Array.from(reportContent.querySelectorAll('.report-field-row'))
                .find(row => String(row.textContent || '').toLowerCase().includes('status akhir'));
            const valueSpan = statusRow?.querySelector('span');
            if (valueSpan) {
                valueSpan.innerHTML = `: <b style="color:${color};">Grade ${escapeV108(normalizedGrade)} - ${escapeV108(gradeLabelV108(normalizedGrade))}</b> (${score}%)`;
            }
        } catch (_) {}
    }

    function refreshFinalGradeCardV108(percent, grade) {
        const card = document.getElementById('reportEditableFinalGradeCard');
        if (!card) return;

        const score = clampPercentV108(percent);
        const normalizedGrade = normalizeGradeV108(grade, score);
        const color = gradeColorV108(normalizedGrade);

        const percentEl = document.getElementById('reportEditableScorePercent');
        const gradeEl = document.getElementById('reportEditableScoreGrade');
        const labelEl = document.getElementById('reportEditableScoreLabel');
        const barEl = document.getElementById('reportEditableScoreBar');
        const gradePanel = card.querySelector('.lian-grade-panel-v108');

        card.style.borderLeftColor = color;
        if (percentEl) {
            percentEl.textContent = String(score);
            percentEl.style.color = color;
            percentEl.style.borderBottomColor = `${color}55`;
        }
        const percentSymbol = percentEl?.nextElementSibling;
        if (percentSymbol) percentSymbol.style.color = color;

        if (gradeEl) {
            gradeEl.textContent = normalizedGrade;
            gradeEl.style.color = color;
            gradeEl.style.borderBottomColor = `${color}55`;
        }
        if (gradePanel) gradePanel.style.borderColor = color;
        if (labelEl) labelEl.textContent = gradeLabelV108(normalizedGrade);
        if (barEl) {
            barEl.style.width = `${Math.max(0, Math.min(100, score))}%`;
            barEl.style.maxWidth = '100%';
            barEl.style.background = color;
        }

        updateLegacyStatusAkhirV108(score, normalizedGrade);
    }

    function bindFinalGradeCardV108() {
        const percentEl = document.getElementById('reportEditableScorePercent');
        const gradeEl = document.getElementById('reportEditableScoreGrade');
        if (!percentEl || !gradeEl || percentEl.dataset.boundV108 === 'true') return;

        percentEl.dataset.boundV108 = 'true';
        gradeEl.dataset.boundV108 = 'true';

        const sanitizePercent = () => {
            const score = clampPercentV108(percentEl.textContent);
            const grade = normalizeGradeV108(gradeEl.textContent, score);
            refreshFinalGradeCardV108(score, grade);
        };

        const sanitizeGrade = () => {
            const score = clampPercentV108(percentEl.textContent);
            const grade = normalizeGradeV108(gradeEl.textContent, score);
            refreshFinalGradeCardV108(score, grade);
        };

        percentEl.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                percentEl.blur();
            }
        });
        gradeEl.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                gradeEl.blur();
            }
        });

        percentEl.addEventListener('blur', sanitizePercent);
        gradeEl.addEventListener('blur', sanitizeGrade);
        percentEl.addEventListener('input', () => {
            const raw = String(percentEl.textContent || '').replace(/[^0-9]/g, '').slice(0, 3);
            if (String(percentEl.textContent || '') !== raw) percentEl.textContent = raw;
        });
        gradeEl.addEventListener('input', () => {
            const raw = String(gradeEl.textContent || '').toUpperCase().replace(/[^A-E]/g, '').slice(0, 1);
            if (String(gradeEl.textContent || '') !== raw) gradeEl.textContent = raw;
        });
    }

    function injectFinalGradeCardV108(scoreResult = {}) {
        const reportContent = document.getElementById('reportContent');
        if (!reportContent) return;

        const categoryGrid = reportContent.querySelector('.report-category-grid');
        if (!categoryGrid) return;

        reportContent.querySelectorAll('#reportEditableFinalGradeCard, #reportScoreEngineBlock').forEach(el => el.remove());

        categoryGrid.insertAdjacentHTML('afterend', buildFinalGradeCardV108(scoreResult));
        bindFinalGradeCardV108();
        sanitizeReportSnapshotDomV108();
    }

    async function reinjectCurrentReportGradeV108(inspection = {}) {
        let scoreResult = null;

        try {
            if (window.LianInspectionScoreDisplayV62 && typeof window.LianInspectionScoreDisplayV62.getScoreForInspection === 'function') {
                scoreResult = await window.LianInspectionScoreDisplayV62.getScoreForInspection(inspection);
            } else if (window.LianInspectionScoreDisplayV60 && typeof window.LianInspectionScoreDisplayV60.getScoreForInspection === 'function') {
                scoreResult = await window.LianInspectionScoreDisplayV60.getScoreForInspection(inspection);
            }
        } catch (err) {
            console.warn(TAG, 'ambil score gagal:', err?.message || err);
        }

        if (!scoreResult) {
            const fallback = Number(inspection?.value || inspection?._value || 0) || 0;
            const grade = gradeFromScoreV108(fallback);
            scoreResult = {
                finalScore: fallback,
                grade,
                gradeLabel: gradeLabelV108(grade)
            };
        }

        injectFinalGradeCardV108(scoreResult);
    }

    // Ganti injector v61 agar card akhir hanya berisi 2 card: persentase dan grade.
    try {
        window.LianReportEditableGradeV61 = {
            ...(window.LianReportEditableGradeV61 || {}),
            inject: injectFinalGradeCardV108,
            bind: bindFinalGradeCardV108,
            enhance: reinjectCurrentReportGradeV108
        };
    } catch (err) {
        console.warn(TAG, 'override editable grade injector gagal:', err?.message || err);
    }

    // Setelah report selesai dirender oleh patch lama, rapikan ulang supaya tidak ada raw score dan snapshot text.
    try {
        const previousGenerateAndShowReport = typeof generateAndShowReport === 'function' ? generateAndShowReport : null;
        if (previousGenerateAndShowReport) {
            generateAndShowReport = function (inspection) {
                const result = previousGenerateAndShowReport.apply(this, arguments);

                [80, 360, 760, 1500, 2600].forEach(delay => {
                    setTimeout(() => {
                        sanitizeReportSnapshotDomV108();
                        reinjectCurrentReportGradeV108(inspection || {});
                    }, delay);
                });

                return result;
            };
        }
    } catch (err) {
        console.warn(TAG, 'patch generateAndShowReport gagal:', err?.message || err);
    }

    window.LianV108SafeReportUi = {
        cleanSnapshotText: cleanSnapshotTextV108,
        sanitizeReportSnapshotDom: sanitizeReportSnapshotDomV108,
        injectFinalGradeCard: injectFinalGradeCardV108,
        updateProgressBar: () => {
            try { updateProgressBar(); } catch (_) {}
        }
    };

    console.log('✅ inspection.js v108 safe report UI cleanup loaded');
})();

// =============================================================
// V109 - EDIT RESAVE ORPHAN ITEM/CATEGORY CLEANUP ONLY
// =============================================================
// Tujuan:
// - Report lama yang hanya dibuka tidak disentuh.
// - Jika report lama diedit lalu Submit ulang, item yang sudah tidak ada
//   di master aktif tidak ikut tersimpan lagi ke inspection_details.
// - Jika kategori sudah dihapus dari master aktif, item dalam kategori itu
//   juga tidak ikut tersimpan lagi.
(function () {
    const TAG = '[v109]';

    function normalizeTextV109(value) {
        return String(value ?? '').trim().toLowerCase();
    }

    function isFinalItemStatusV109(value) {
        return value === 'good' || value === 'warning' || value === 'bad';
    }

    function isEditSubmitRecordV109(record = {}) {
        return Boolean(
            record &&
            (record._editMode || record.existingInspectionId || record.editingInspectionId)
        );
    }

    function getActiveMasterItemsV109() {
        const items = Array.isArray(sheetItems) ? sheetItems : [];
        const categories = Array.isArray(sheetCategories) ? sheetCategories : [];

        if (categories.length === 0) return items;

        const activeCategoryNames = new Set(
            categories
                .map(category => normalizeTextV109(category?.name || category?.category || category?.title))
                .filter(Boolean)
        );

        if (activeCategoryNames.size === 0) return items;

        return items.filter(item => {
            const categoryName = normalizeTextV109(item?.category || item?.categoryName);
            return categoryName && activeCategoryNames.has(categoryName);
        });
    }

    function getAllowedMasterItemIdsV109() {
        return new Set(
            getActiveMasterItemsV109()
                .map(item => String(item?.id || '').trim())
                .filter(Boolean)
        );
    }

    function filterItemsDataForEditResaveV109(itemsData = {}) {
        const allowedIds = getAllowedMasterItemIdsV109();

        // Kalau master belum termuat, jangan bersihkan agar tidak menghapus data karena loading terlambat.
        if (allowedIds.size === 0) return itemsData || {};

        const filtered = {};

        Object.entries(itemsData || {}).forEach(([key, value]) => {
            const itemId = String(key || '').trim();
            if (!itemId || itemId.endsWith('_data')) return;
            if (!isFinalItemStatusV109(value)) return;

            // Hanya item yang masih ada di master aktif yang boleh ikut tersimpan ulang.
            if (!allowedIds.has(itemId)) return;

            filtered[itemId] = value;

            const metaKey = itemId + '_data';
            if (itemsData[metaKey] && typeof itemsData[metaKey] === 'object') {
                filtered[metaKey] = { ...itemsData[metaKey] };
            }
        });

        return filtered;
    }

    function countValidItemsV109(itemsData = {}) {
        return Object.entries(itemsData || {})
            .filter(([key, value]) => !String(key).endsWith('_data') && isFinalItemStatusV109(value))
            .length;
    }

    try {
        const previousSubmitInspectionData = typeof submitInspectionData === 'function'
            ? submitInspectionData
            : null;

        if (previousSubmitInspectionData && !window.__LIAN_V109_EDIT_RESAVE_CLEANUP_INSTALLED) {
            submitInspectionData = async function submitInspectionDataV109(record) {
                if (isEditSubmitRecordV109(record)) {
                    const beforeCount = countValidItemsV109(record._itemsData || inspectionItemsData || {});
                    const cleanedItemsData = filterItemsDataForEditResaveV109(record._itemsData || inspectionItemsData || {});
                    const afterCount = countValidItemsV109(cleanedItemsData);

                    record._itemsData = cleanedItemsData;

                    // Samakan juga state memori agar draft edit yang sedang submit tidak membawa orphan item.
                    try {
                        inspectionItemsData = { ...cleanedItemsData };
                    } catch (_) {}

                    if (beforeCount !== afterCount) {
                        console.log(TAG, 'item/kategori lama dibersihkan saat edit-save', { beforeCount, afterCount });
                    }
                }

                return previousSubmitInspectionData.apply(this, arguments);
            };

            window.__LIAN_V109_EDIT_RESAVE_CLEANUP_INSTALLED = true;
        }
    } catch (err) {
        console.warn(TAG, 'patch submitInspectionData dilewati:', err?.message || err);
    }

    window.LianEditResaveCleanupV109 = {
        filterItemsDataForEditResave: filterItemsDataForEditResaveV109,
        getActiveMasterItems: getActiveMasterItemsV109,
        getAllowedMasterItemIds: getAllowedMasterItemIdsV109
    };

    console.log('✅ inspection.js v109 edit-resave orphan cleanup loaded');
})();


console.log('✅ inspection.js v113 report indicators one-row mobile loaded');
