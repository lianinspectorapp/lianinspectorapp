// ===============================
// OFFLINE DATABASE SYSTEM - FIXED PER USER
// ===============================

const DB_NAME = 'inspection_offline_db';
const DB_VERSION = 4;
const STORE_NAME = 'pending_inspections';

let offlineDB = null;

function getCurrentOfflineUser() {
    if (!currentUser) {
        return {
            ownerId: null,
            username: null,
            role: null
        };
    }

    const ownerId = String(currentUser.id || currentUser.username || '').trim();

    return {
        ownerId,
        username: currentUser.username || ownerId,
        role: currentUser.role || 'inspector'
    };
}


function getActiveDraftStorageKey() {
    const user = getCurrentOfflineUser();
    if (!user.ownerId) return null;
    return `active_inspection_draft_${user.ownerId}`;
}

function saveActiveDraftId(id) {
    try {
        const key = getActiveDraftStorageKey();
        if (key && id) localStorage.setItem(key, id);
    } catch (err) {
        console.warn('⚠️ Gagal menyimpan active draft id:', err);
    }
}

function getActiveDraftId() {
    try {
        const key = getActiveDraftStorageKey();
        return key ? localStorage.getItem(key) : null;
    } catch (err) {
        return null;
    }
}

function clearActiveDraftId(id = null) {
    try {
        const key = getActiveDraftStorageKey();
        if (!key) return;
        if (!id || localStorage.getItem(key) === id) {
            localStorage.removeItem(key);
        }
    } catch (err) {
        console.warn('⚠️ Gagal membersihkan active draft id:', err);
    }
}

async function getActiveOfflineInspection() {
    const activeId = getActiveDraftId();

    if (activeId) {
        const activeDraft = await getOfflineInspectionById(activeId).catch(() => null);
        if (activeDraft && isDraftOwnedByCurrentUser(activeDraft) &&
            activeDraft.status === 'draft' && (activeDraft.syncStatus || 'draft') === 'draft') {
            return activeDraft;
        }
    }

    return getLastOfflineInspection();
}

function createOfflineInspectionId() {
    const user = getCurrentOfflineUser();
    const ownerId = user.ownerId || 'anonymous';
    const safeOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const random = Math.random().toString(36).slice(2, 8);

    return `draft_${safeOwner}_${Date.now()}_${random}`;
}

function isDraftOwnedByCurrentUser(draft) {
    const user = getCurrentOfflineUser();

    if (!user.ownerId || !draft) return false;

    // New format: ownerId.
    if (String(draft.ownerId || '') === user.ownerId) return true;

    // Legacy format: inspectorId / inspectorName.
    if (String(draft.inspectorId || '') === user.ownerId) return true;
    if (draft.inspectorName && draft.inspectorName === user.username) return true;

    return false;
}

function initOfflineDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('❌ IndexedDB gagal dibuat', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            offlineDB = request.result;
            console.log('✅ IndexedDB ready');
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            let store;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                console.log('✅ Store IndexedDB dibuat');
            } else {
                store = event.target.transaction.objectStore(STORE_NAME);
            }

            // Index tidak wajib untuk jalan, tapi membantu pemisahan user dan sync.
            if (!store.indexNames.contains('by_owner')) {
                store.createIndex('by_owner', 'ownerId', { unique: false });
            }
            if (!store.indexNames.contains('by_status')) {
                store.createIndex('by_status', 'status', { unique: false });
            }
            if (!store.indexNames.contains('by_sync_status')) {
                store.createIndex('by_sync_status', 'syncStatus', { unique: false });
            }
        };
    });
}

function putOfflineDraft(draft) {
    return new Promise((resolve, reject) => {
        if (!offlineDB) {
            reject(new Error('IndexedDB belum ready'));
            return;
        }

        const transaction = offlineDB.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(draft);

        request.onsuccess = () => resolve(draft);
        request.onerror = () => reject(request.error);
    });
}

function getOfflineInspectionById(id) {
    return new Promise((resolve, reject) => {
        if (!offlineDB) {
            reject(new Error('IndexedDB belum ready'));
            return;
        }

        const transaction = offlineDB.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

function getRawOfflineInspections() {
    return new Promise((resolve, reject) => {
        if (!offlineDB) {
            reject(new Error('IndexedDB belum ready'));
            return;
        }

        const transaction = offlineDB.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function saveInspectionOffline(data = {}) {
    if (!currentUser) {
        console.warn('⚠️ Tidak ada currentUser, draft tidak disimpan');
        return null;
    }

    const user = getCurrentOfflineUser();
    const now = new Date().toISOString();
    const id = data.id || currentOfflineInspectionId || createOfflineInspectionId();
    const existing = await getOfflineInspectionById(id).catch(() => null);

    const draft = {
        ...(existing || {}),
        id,
        ownerId: user.ownerId,
        inspectorId: user.ownerId,
        inspectorName: user.username,
        role: user.role,
        vehicleData: data.vehicleData ?? existing?.vehicleData ?? {},
        itemsData: data.itemsData ?? existing?.itemsData ?? {},
        // v5b: simpan checkbox kelengkapan dokumen dan aksesoris di IndexedDB.
        // Sebelumnya data ini dikirim dari inspection.js, tetapi terbuang di sini,
        // sehingga setelah refresh checkbox kembali kosong.
        documentsData: data.documentsData ?? existing?.documentsData ?? {},
        accessoriesData: data.accessoriesData ?? existing?.accessoriesData ?? {},
        remotePayload: data.remotePayload ?? existing?.remotePayload ?? null,
        status: data.status || existing?.status || 'draft',
        syncStatus: data.syncStatus || existing?.syncStatus || 'draft',
        createdAt: existing?.createdAt || data.createdAt || now,
        updatedAt: now,
        appVersion: 3
    };

    currentOfflineInspectionId = id;
    saveActiveDraftId(id);

    const savedDraft = await putOfflineDraft(draft);
    console.log('💾 Draft tersimpan:', savedDraft.status);

    // Cloud draft backup ringan:
    // IndexedDB tetap menjadi sumber utama offline, tetapi ketika online draft juga
    // di-upsert ke Supabase active_inspections agar tidak hilang bila device bermasalah.
    // Cloud draft backup hanya untuk draft aktif.
    // Saat Submit, status berubah menjadi pending_sync; jangan kirim lagi ke active_inspections
    // karena payload submit bisa besar dan tujuan active_inspections hanya monitoring draft berjalan.
    if (savedDraft.status === 'draft' && savedDraft.syncStatus === 'draft' && typeof scheduleActiveInspectionSync === 'function') {
        scheduleActiveInspectionSync(savedDraft.id);
    }

    return savedDraft;
}

// Compatibility dengan kode lama.
function updateInspectionOffline(vehicleData) {
    if (!currentUser) return;

    if (!currentOfflineInspectionId) {
        currentOfflineInspectionId = createOfflineInspectionId();
    }

    return saveInspectionOffline({
        id: currentOfflineInspectionId,
        vehicleData: vehicleData || {},
        itemsData: inspectionItemsData || {},
        documentsData: typeof getDocumentFormData === 'function' ? getDocumentFormData() : {},
        accessoriesData: typeof getAccessoryFormData === 'function' ? getAccessoryFormData() : {},
        status: 'draft',
        syncStatus: 'draft'
    });
}

async function getLastOfflineInspection() {
    const data = await getRawOfflineInspections();

    const ownedDrafts = data.filter(draft => {
        if (!isDraftOwnedByCurrentUser(draft)) return false;
        // Restore hanya untuk draft yang masih aktif. Pending final sync tidak dibuka lagi sebagai form.
        return draft.status === 'draft' && (draft.syncStatus || 'draft') === 'draft';
    });

    if (ownedDrafts.length === 0) return null;

    ownedDrafts.sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
    });

    return ownedDrafts[0];
}

async function getAllOfflineInspections() {
    const data = await getRawOfflineInspections();

    let result = data;

    // Admin boleh melihat semua draft lokal di browser yang sama,
    // tetapi getLastOfflineInspection tetap hanya milik user aktif.
    if (currentUser?.role !== 'admin') {
        result = data.filter(isDraftOwnedByCurrentUser);
    }

    result.sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
    });

    return result;
}

function deleteOfflineInspection(id) {
    return new Promise((resolve, reject) => {
        if (!offlineDB || !id) {
            resolve(false);
            return;
        }

        const transaction = offlineDB.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
            clearActiveDraftId(id);

            // Jika draft lokal dibatalkan/dihapus dan sedang online, bersihkan juga cloud draft.
            if (typeof deleteActiveInspectionFromSupabase === 'function') {
                deleteActiveInspectionFromSupabase(id).catch(console.warn);
            }

            resolve(true);
        };
        request.onerror = () => reject(request.error);
    });
}

async function markInspectionReadyToSync(record) {
    if (!record) throw new Error('Record inspeksi kosong');

    const vehicleData = record._vehicleData || (typeof getVehicleFormData === 'function' ? getVehicleFormData() : (inspectionFormData || {}));
    const itemsData = record._itemsData || inspectionItemsData || {};
    const documentsData = record._documentsData || (typeof getDocumentFormData === 'function' ? getDocumentFormData() : {});
    const accessoriesData = record._accessoriesData || (typeof getAccessoryFormData === 'function' ? getAccessoryFormData() : {});

    return saveInspectionOffline({
        id: currentOfflineInspectionId || createOfflineInspectionId(),
        vehicleData,
        itemsData,
        documentsData,
        accessoriesData,
        remotePayload: record,
        status: 'pending_sync',
        syncStatus: 'pending',
        submittedAt: new Date().toISOString()
    });
}

function buildRecordFromOfflineDraft(draft) {
    const vehicle = draft.vehicleData || {};

    return {
        type: 'inspection',
        id: draft.remotePayload?.id || `insp_${Date.now()}`,
        inspectionId: draft.remotePayload?.inspectionId || draft.remotePayload?.id || `insp_${Date.now()}`,
        inspectorUsername: draft.inspectorName,
        customerName: vehicle.customerName || '',
        customerPhone: vehicle.customerPhone || '',
        vehicleType: vehicle.vehicleType || '',
        vehiclePlate: vehicle.vehiclePlate || '',
        vehicleYear: vehicle.vehicleYear || '',
        vehicleColor: vehicle.vehicleColor || '',
        vehicleTransmission: vehicle.vehicleTransmission || '',
        vehicleFuel: vehicle.vehicleFuel || '',
        vehicleMileage: vehicle.vehicleMileage || '',
        issues: JSON.stringify(draft.itemsData || {}),
        value: 0,
        status: 'completed',
        inspectionDate: new Date().toISOString(),
        createdAt: draft.createdAt || new Date().toISOString()
    };
}


// ===============================
// ACTIVE INSPECTION CLOUD DRAFT SYNC
// ===============================
// Tujuan:
// - Draft tetap utama di IndexedDB agar aman saat offline.
// - Saat online, draft di-backup ke Supabase public.active_inspections.
// - Tabel final public.inspections dan public.inspection_details tetap dipakai nanti saat Submit final.

function getActiveInspectionSyncTimers() {
    if (!window.__activeInspectionSyncTimers) {
        window.__activeInspectionSyncTimers = {};
    }
    return window.__activeInspectionSyncTimers;
}


function createValidUuid() {
    // Supabase active_inspections.id bertipe UUID.
    // Local draft id seperti draft_xxx tidak boleh dikirim ke kolom id UUID.
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    // Fallback UUID v4 sederhana untuk browser lama.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getRemoteActiveInspectionId(draft) {
    if (!draft) return null;
    return draft.activeInspectionId || draft.remoteActiveInspectionId || draft.supabaseActiveInspectionId || null;
}

function getJsonSafeClone(value) {
    // Hindari error/timeout saat sync active_inspections.
    // Foto lokal/base64 hanya boleh hidup di IndexedDB untuk preview cepat, bukan dikirim ke Supabase JSONB.
    try {
        return JSON.parse(JSON.stringify(value, (key, val) => {
            const blockedKeys = [
                'blob',
                'file',
                'rawFile',
                'base64',
                'dataUrl',
                'previewDataUrl',
                'localBase64',
                'previewUrl',      // biasanya data:image/base64 dari preview lokal
                'localPreview',    // preview lokal besar
                'localDataUrl',
                'objectUrl',       // blob: URL browser
                'thumbnailDataUrl',
                'thumbDataUrl'
            ];

            if (blockedKeys.includes(key)) return undefined;

            // File/Blob tidak aman dimasukkan ke JSONB Supabase.
            if (typeof Blob !== 'undefined' && val instanceof Blob) return undefined;
            if (typeof File !== 'undefined' && val instanceof File) return undefined;

            // String base64/blob URL berukuran besar dapat membuat active_inspections timeout.
            if (typeof val === 'string') {
                const trimmed = val.trim();
                if (trimmed.startsWith('data:image/')) return undefined;
                if (trimmed.startsWith('blob:')) return undefined;
                if (trimmed.length > 20000 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed.slice(0, 500))) {
                    return undefined;
                }
            }

            return val;
        }));
    } catch (err) {
        console.warn('⚠️ Gagal clone JSON draft, fallback object kosong:', err);
        return {};
    }
}

function hasMeaningfulDraftContent(draft) {
    if (!draft) return false;

    const vehicle = draft.vehicleData || {};
    const docs = draft.documentsData || {};
    const accs = draft.accessoriesData || {};
    const items = draft.itemsData || {};

    const hasVehicle = Object.values(vehicle).some(value => String(value || '').trim() !== '');
    const hasDocs = Object.values(docs).some(Boolean);
    const hasAccs = Object.values(accs).some(Boolean);
    const hasItems = Object.keys(items).length > 0;

    return hasVehicle || hasDocs || hasAccs || hasItems;
}

function buildActiveInspectionPayload(draft, remoteActiveInspectionId) {
    const now = new Date().toISOString();
    const remoteId = remoteActiveInspectionId || getRemoteActiveInspectionId(draft) || createValidUuid();

    const data = getJsonSafeClone({
        // ID lokal tetap disimpan di JSONB, bukan di kolom id UUID Supabase.
        offlineId: draft.id,
        activeInspectionId: remoteId,
        ownerId: draft.ownerId,
        inspectorId: draft.inspectorId,
        inspectorName: draft.inspectorName,
        role: draft.role,
        status: draft.status || 'draft',
        syncStatus: draft.syncStatus || 'draft',
        vehicleData: draft.vehicleData || {},
        documentsData: draft.documentsData || {},
        accessoriesData: draft.accessoriesData || {},
        itemsData: draft.itemsData || {},
        remotePayload: draft.remotePayload || null,
        createdAt: draft.createdAt || now,
        updatedAt: draft.updatedAt || now,
        appVersion: draft.appVersion || 3
    });

    // Tabel active_inspections kamu punya kolom: id uuid, inspector text, data jsonb, created_at timestamp.
    // Jangan kirim updated_at karena kolom itu belum ada di screenshot Supabase.
    return {
        id: remoteId,
        inspector: draft.inspectorName || draft.username || draft.ownerId || 'unknown',
        data,
        created_at: draft.createdAt || now
    };
}

async function upsertActiveInspectionToSupabase(draft) {
    if (!draft || !draft.id) {
        return { ok: false, message: 'Draft kosong' };
    }

    if (!navigator.onLine) {
        return { ok: false, offline: true, message: 'Masih offline' };
    }

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        return { ok: false, message: 'Supabase client belum tersedia' };
    }

    if (draft.status !== 'draft' || draft.syncStatus !== 'draft') {
        return { ok: false, skipped: true, message: 'Bukan draft aktif, tidak dikirim ke active_inspections' };
    }

    if (!hasMeaningfulDraftContent(draft)) {
        return { ok: false, skipped: true, message: 'Draft masih kosong, tidak dikirim ke active_inspections' };
    }

    // Kolom active_inspections.id di Supabase adalah UUID.
    // Jadi ID lokal draft_xxx disimpan sebagai data.offlineId, sedangkan kolom id memakai UUID valid.
    const remoteActiveInspectionId = getRemoteActiveInspectionId(draft) || createValidUuid();
    const payload = buildActiveInspectionPayload(draft, remoteActiveInspectionId);

    try {
        const { error } = await supabaseClient
            .from('active_inspections')
            .upsert([payload], { onConflict: 'id' });

        if (error) throw error;

        await putOfflineDraft({
            ...draft,
            activeInspectionId: remoteActiveInspectionId,
            remoteActiveInspectionId,
            supabaseActiveInspectionId: remoteActiveInspectionId,
            activeSyncStatus: 'synced',
            activeSyncedAt: new Date().toISOString(),
            lastActiveSyncError: null,
            updatedAt: draft.updatedAt || new Date().toISOString()
        });

        console.log('☁️ Draft aktif tersinkron');
        return { ok: true, activeInspectionId: remoteActiveInspectionId };
    } catch (err) {
        console.error('❌ Sync active_inspections gagal:', err);

        await putOfflineDraft({
            ...draft,
            activeInspectionId: remoteActiveInspectionId,
            remoteActiveInspectionId,
            supabaseActiveInspectionId: remoteActiveInspectionId,
            activeSyncStatus: 'error',
            lastActiveSyncError: err?.message || String(err),
            updatedAt: draft.updatedAt || new Date().toISOString()
        });

        return { ok: false, error: err };
    }
}

function scheduleActiveInspectionSync(id, delay = 1200) {
    if (!id || !navigator.onLine) return;

    const timers = getActiveInspectionSyncTimers();

    if (timers[id]) {
        clearTimeout(timers[id]);
    }

    timers[id] = setTimeout(async () => {
        delete timers[id];

        try {
            const draft = await getOfflineInspectionById(id);
            if (!draft) return;

            // active_inspections hanya untuk draft berjalan. Submit final memakai pending sync terpisah.
            if (draft.status !== 'draft' || draft.syncStatus !== 'draft') return;

            await upsertActiveInspectionToSupabase(draft);
        } catch (err) {
            console.error('❌ Scheduled active sync gagal:', err);
        }
    }, delay);
}

async function syncActiveDraftsToSupabase() {
    if (!navigator.onLine || !offlineDB) {
        return { synced: 0, failed: 0, skipped: 0 };
    }

    const drafts = await getRawOfflineInspections();

    // Kirim semua draft lokal yang masih berjalan agar admin bisa monitoring lintas user
    // pada browser/perangkat yang sama, tetapi restore tetap dipisah oleh ownerId.
    const activeDrafts = drafts.filter(draft => {
        const status = draft.status || 'draft';
        const syncStatus = draft.syncStatus || 'draft';

        return (
            status === 'draft' &&
            syncStatus === 'draft' &&
            hasMeaningfulDraftContent(draft)
        );
    });

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const draft of activeDrafts) {
        const result = await upsertActiveInspectionToSupabase(draft);
        if (result.ok) synced += 1;
        else if (result.skipped) skipped += 1;
        else failed += 1;
    }

    if (synced > 0) {
        console.log(`☁️ ${synced} draft aktif tersinkron`);
    }

    return { synced, failed, skipped };
}

async function deleteActiveInspectionFromSupabase(id) {
    if (!id || !navigator.onLine || typeof supabaseClient === 'undefined' || !supabaseClient) {
        return { ok: false };
    }

    try {
        const draft = await getOfflineInspectionById(id).catch(() => null);
        const remoteId = getRemoteActiveInspectionId(draft) || (isUuid(id) ? id : null);
        const deletedBy = [];

        // Cara utama: hapus berdasarkan UUID remote active_inspections.
        if (remoteId && isUuid(remoteId)) {
            const { error } = await supabaseClient
                .from('active_inspections')
                .delete()
                .eq('id', remoteId);

            if (error) throw error;
            deletedBy.push('uuid');
        }

        // Fallback penting: hapus berdasarkan data->>offlineId.
        // Ini tetap jalan walaupun draft IndexedDB sudah terhapus atau remote UUID hilang.
        const { error: jsonError } = await supabaseClient
            .from('active_inspections')
            .delete()
            .eq('data->>offlineId', String(id));

        if (jsonError) throw jsonError;
        deletedBy.push('offlineId');

        // Fallback tambahan untuk data lama yang menyimpan id lokal di field lain.
        const { error: legacyError } = await supabaseClient
            .from('active_inspections')
            .delete()
            .or(`data->>id.eq.${String(id)},data->>localId.eq.${String(id)}`);

        if (legacyError) {
            // Supabase/PostgREST kadang tidak suka filter json path pada versi tertentu.
            // Jangan gagalkan cleanup utama kalau fallback legacy gagal.
            console.warn('⚠️ Fallback legacy delete active_inspections dilewati:', legacyError);
        } else {
            deletedBy.push('legacyJson');
        }

        console.log('🧹 Draft active_inspections cleanup:', {
            offlineId: id,
            activeInspectionId: remoteId,
            deletedBy
        });
        return { ok: true, method: deletedBy.join('+') || 'none' };
    } catch (err) {
        console.warn('⚠️ Gagal hapus active_inspections:', err);
        return { ok: false, error: err };
    }
}

async function markActiveInspectionSubmittedInSupabase(id, finalInspectionId) {
    if (!id || !navigator.onLine || typeof supabaseClient === 'undefined' || !supabaseClient) {
        return { ok: false };
    }

    try {
        const draft = await getOfflineInspectionById(id).catch(() => null);
        const remoteId = getRemoteActiveInspectionId(draft);
        const now = new Date().toISOString();
        const baseData = {
            ...(draft ? buildActiveInspectionPayload(draft, remoteId || undefined).data : {}),
            offlineId: String(id),
            status: 'submitted',
            syncStatus: 'synced',
            finalInspectionId,
            submittedAt: now,
            updatedAt: now
        };

        if (remoteId && isUuid(remoteId)) {
            const { error } = await supabaseClient
                .from('active_inspections')
                .update({ data: baseData })
                .eq('id', remoteId);

            if (error) throw error;
            console.log('🏁 Draft aktif ditandai submitted');
            return { ok: true, method: 'uuid' };
        }

        const { error } = await supabaseClient
            .from('active_inspections')
            .update({ data: baseData })
            .eq('data->>offlineId', String(id));

        if (error) throw error;
        console.log('🏁 Draft aktif ditandai submitted');
        return { ok: true, method: 'offlineId' };
    } catch (err) {
        console.warn('⚠️ Gagal menandai active_inspections submitted:', err);
        return { ok: false, error: err };
    }
}

async function syncAllOfflineData() {
    const activeResult = await syncActiveDraftsToSupabase();
    const pendingResult = typeof syncPendingInspections === 'function'
        ? await syncPendingInspections()
        : { synced: 0, failed: 0 };

    return {
        active: activeResult,
        pending: pendingResult
    };
}



function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function pickFinalInspectionId(draft) {
    const remote = draft?.remotePayload || {};
    const candidates = [remote.id, remote.inspection_id, remote.inspectionId, draft?.finalInspectionId];
    for (const candidate of candidates) {
        if (isUuid(candidate)) return candidate;
    }
    return createValidUuid();
}

function cleanInspectionRow(row) {
    // Kirim hanya kolom yang terlihat/aman pada tabel public.inspections.
    // Jangan ikutkan _itemsData/_documentsData karena itu bukan kolom Supabase.
    return {
        id: row.id,
        inspector: row.inspector || row.inspectorUsername || row.inspector_name || 'unknown',
        customer_name: row.customer_name || row.customerName || '',
        customer_phone: row.customer_phone || row.customerPhone || '',
        vehicle_type: row.vehicle_type || row.vehicleType || '',
        vehicle_plate: row.vehicle_plate || row.vehiclePlate || '',
        vehicle_year: row.vehicle_year || row.vehicleYear || '',
        vehicle_color: row.vehicle_color || row.vehicleColor || '',
        vehicle_transmission: row.vehicle_transmission || row.vehicleTransmission || '',
        vehicle_fuel: row.vehicle_fuel || row.vehicleFuel || ''
    };
}

function getItemNameForDetail(itemId) {
    try {
        const item = (typeof sheetItems !== 'undefined' ? sheetItems : []).find(i => String(i.id) === String(itemId));
        return item?.name || item?.item_name || item?.title || String(itemId);
    } catch (_) {
        return String(itemId);
    }
}

function normalizeDetailStatus(status) {
    if (status === 'good') return 'good';
    if (status === 'warning') return 'warning';
    if (status === 'bad') return 'bad';
    return String(status || '');
}

function buildDetailNote(meta = {}) {
    const parts = [];
    if (meta.selectedDamage) parts.push(`Kerusakan: ${meta.selectedDamage}`);
    if (meta.notes) parts.push(String(meta.notes));
    return parts.join('\n');
}

function getPhotoUrlText(meta = {}) {
    const photos = Array.isArray(meta.photos) ? meta.photos : [];
    return photos.map(photo => {
        if (!photo) return '';
        if (typeof photo === 'string') return photo;

        const directUrl = photo.url || photo.photo_url || photo.photoUrl || photo.driveUrl || photo.remoteUrl || '';
        if (directUrl) return directUrl;

        const fileId = photo.fileId || photo.file_id || photo.driveFileId || photo.drive_file_id || '';
        if (fileId) return `https://drive.google.com/uc?export=view&id=${fileId}`;

        return '';
    }).filter(Boolean).join('\n');
}

function buildFinalRowsFromDraft(draft) {
    const remote = draft.remotePayload || {};
    const vehicle = remote._vehicleData || draft.vehicleData || {};
    const items = remote._itemsData || draft.itemsData || {};
    const docs = remote._documentsData || draft.documentsData || {};
    const accs = remote._accessoriesData || draft.accessoriesData || {};
    const inspectionId = pickFinalInspectionId(draft);
    const now = new Date().toISOString();

    const inspectionRow = cleanInspectionRow({
        id: inspectionId,
        inspector: remote.inspector || draft.inspectorName || draft.username || draft.ownerId,
        customer_name: remote.customer_name || vehicle.customerName,
        customer_phone: remote.customer_phone || vehicle.customerPhone,
        vehicle_type: remote.vehicle_type || vehicle.vehicleType,
        vehicle_plate: remote.vehicle_plate || vehicle.vehiclePlate,
        vehicle_year: remote.vehicle_year || vehicle.vehicleYear,
        vehicle_color: remote.vehicle_color || vehicle.vehicleColor,
        vehicle_transmission: remote.vehicle_transmission || vehicle.vehicleTransmission,
        vehicle_fuel: remote.vehicle_fuel || vehicle.vehicleFuel
    });

    const detailRows = [];

    Object.entries(items || {}).forEach(([key, status]) => {
        if (String(key).endsWith('_data')) return;
        if (!(status === 'good' || status === 'warning' || status === 'bad')) return;

        const meta = items[key + '_data'] || {};
        detailRows.push({
            id: createValidUuid(),
            inspection_id: inspectionId,
            item_name: getItemNameForDetail(key),
            status: normalizeDetailStatus(status),
            note: buildDetailNote(meta),
            photo_url: getPhotoUrlText(meta),
            created_at: now
        });
    });

    const docLabels = {
        doc_bpkb: 'Dokumen - BPKB',
        doc_stnk: 'Dokumen - STNK',
        doc_faktur: 'Dokumen - Faktur',
        doc_forma: 'Dokumen - Form A',
        doc_kir: 'Dokumen - KIR',
        doc_manual: 'Dokumen - Buku Manual',
        doc_servis: 'Dokumen - Buku Servis'
    };

    Object.entries(docLabels).forEach(([key, label]) => {
        detailRows.push({
            id: createValidUuid(),
            inspection_id: inspectionId,
            item_name: label,
            status: docs[key] ? 'ada' : 'tidak_ada',
            note: '',
            photo_url: '',
            created_at: now
        });
    });

    const accLabels = {
        acc_kunci_serep: 'Aksesori - Kunci Serep',
        acc_kunci_roda: 'Aksesori - Kunci Roda',
        acc_ban_serep: 'Aksesori - Ban Serep',
        acc_dongkrak: 'Aksesori - Dongkrak'
    };

    Object.entries(accLabels).forEach(([key, label]) => {
        detailRows.push({
            id: createValidUuid(),
            inspection_id: inspectionId,
            item_name: label,
            status: accs[key] ? 'ada' : 'tidak_ada',
            note: '',
            photo_url: '',
            created_at: now
        });
    });

    return { inspectionId, inspectionRow, detailRows };
}

async function syncOfflineInspectionById(id) {
    const draft = await getOfflineInspectionById(id);

    if (!draft) {
        return { ok: false, message: 'Draft tidak ditemukan' };
    }

    if (!navigator.onLine) {
        return { ok: false, offline: true, message: 'Masih offline' };
    }

    try {
        const { inspectionId, inspectionRow, detailRows } = buildFinalRowsFromDraft(draft);

        const { error: inspectionError } = await supabaseClient
            .from('inspections')
            .upsert([inspectionRow], { onConflict: 'id' });

        if (inspectionError) throw inspectionError;

        // Hindari detail dobel kalau sync diulang.
        const { error: deleteDetailsError } = await supabaseClient
            .from('inspection_details')
            .delete()
            .eq('inspection_id', inspectionId);

        if (deleteDetailsError) throw deleteDetailsError;

        if (detailRows.length > 0) {
            const { error: detailsError } = await supabaseClient
                .from('inspection_details')
                .insert(detailRows);

            if (detailsError) throw detailsError;
        }

        // Setelah final berhasil masuk ke inspections + inspection_details,
        // tandai dulu cloud draft sebagai submitted. Kalau delete gagal karena jaringan/RLS,
        // monitoring admin tetap tidak akan menganggapnya sedang inspeksi.
        await markActiveInspectionSubmittedInSupabase(id, inspectionId).catch(console.warn);
        await deleteActiveInspectionFromSupabase(id);
        clearActiveDraftId(id);
        await putOfflineDraft({
            ...draft,
            status: 'submitted',
            syncStatus: 'synced',
            finalInspectionId: inspectionId,
            submittedSyncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }).catch(() => null);
        await deleteOfflineInspection(id);
        console.log('✅ Inspeksi final tersinkron:', inspectionId, detailRows.length + ' detail');

        return { ok: true, inspectionId, details: detailRows.length };
    } catch (err) {
        console.error('❌ Sync final inspection gagal:', err);

        await putOfflineDraft({
            ...draft,
            syncStatus: 'error',
            lastSyncError: err.message || String(err),
            updatedAt: new Date().toISOString()
        });

        return { ok: false, error: err };
    }
}

async function syncPendingInspections() {
    if (syncInProgress || !navigator.onLine || !offlineDB) {
        return { synced: 0, failed: 0 };
    }

    syncInProgress = true;

    try {
        const drafts = await getRawOfflineInspections();
        const pending = drafts.filter(draft =>
            draft.status === 'pending_sync' ||
            draft.syncStatus === 'pending' ||
            draft.syncStatus === 'error'
        );

        let synced = 0;
        let failed = 0;

        for (const draft of pending) {
            const result = await syncOfflineInspectionById(draft.id);
            if (result.ok) synced += 1;
            else failed += 1;
        }

        if (synced > 0) {
            console.log(`✅ ${synced} inspeksi offline berhasil disinkronkan`);
            if (typeof loadInitialData === 'function') await loadInitialData();
        }

        return { synced, failed };
    } finally {
        syncInProgress = false;
    }
}

window.addEventListener('online', () => {
    console.log('🌐 Online, sinkronisasi dimulai');

    if (typeof syncActiveDraftsToSupabase === 'function') {
        syncActiveDraftsToSupabase().catch(console.error);
    }

    syncPendingInspections();
});

// Export eksplisit agar aman walaupun urutan script berubah.
window.initOfflineDB = initOfflineDB;
window.saveInspectionOffline = saveInspectionOffline;
window.updateInspectionOffline = updateInspectionOffline;
window.getOfflineInspectionById = getOfflineInspectionById;
window.getRawOfflineInspections = getRawOfflineInspections;
window.getLastOfflineInspection = getLastOfflineInspection;
window.getAllOfflineInspections = getAllOfflineInspections;
window.getActiveOfflineInspection = getActiveOfflineInspection;
window.getActiveDraftId = getActiveDraftId;
window.clearActiveDraftId = clearActiveDraftId;
window.createOfflineInspectionId = createOfflineInspectionId;
window.deleteOfflineInspection = deleteOfflineInspection;
window.markInspectionReadyToSync = markInspectionReadyToSync;
window.syncOfflineInspectionById = syncOfflineInspectionById;
window.syncPendingInspections = syncPendingInspections;
window.syncActiveDraftsToSupabase = syncActiveDraftsToSupabase;
window.syncAllOfflineData = syncAllOfflineData;
window.upsertActiveInspectionToSupabase = upsertActiveInspectionToSupabase;
window.deleteActiveInspectionFromSupabase = deleteActiveInspectionFromSupabase;
window.markActiveInspectionSubmittedInSupabase = markActiveInspectionSubmittedInSupabase;



console.log('✅ offline-sync.js v29 cleanup loaded');


// =============================================================
// V33 - Edit draft guard + odometer metadata detail
// =============================================================
(function () {
    const TAG = '[offline v33]';
    const log = (...args) => console.log(TAG, ...args);

    function isEditDraftV33(draft) {
        return Boolean(
            draft?.remotePayload?._editMode ||
            draft?.remotePayload?.editingInspectionId ||
            draft?.status === 'edit_draft' ||
            draft?.syncStatus === 'edit_draft'
        );
    }

    try {
        const originalUpsertActive = upsertActiveInspectionToSupabase;
        upsertActiveInspectionToSupabase = async function (draft) {
            if (isEditDraftV33(draft)) {
                return { ok: false, skipped: true, editDraft: true, message: 'Edit draft tidak dikirim ke active_inspections' };
            }
            return originalUpsertActive.apply(this, arguments);
        };
    } catch (_) {}

    try {
        const originalBuildFinalRows = buildFinalRowsFromDraft;
        buildFinalRowsFromDraft = function (draft) {
            const result = originalBuildFinalRows.apply(this, arguments);
            try {
                const remote = draft?.remotePayload || {};
                const vehicle = remote._vehicleData || draft?.vehicleData || {};
                const mileage = String(vehicle.vehicleMileage || vehicle.vehicle_mileage || vehicle.odometer || '').trim();
                if (mileage && result?.inspectionId && Array.isArray(result.detailRows)) {
                    const alreadyExists = result.detailRows.some(row => String(row.item_name || '').toLowerCase().includes('odometer'));
                    if (!alreadyExists) {
                        result.detailRows.push({
                            id: typeof createValidUuid === 'function' ? createValidUuid() : (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
                            inspection_id: result.inspectionId,
                            item_name: 'Data Kendaraan - Odometer',
                            status: 'info',
                            note: mileage,
                            photo_url: '',
                            created_at: new Date().toISOString()
                        });
                    }
                }
            } catch (err) {
                console.warn(TAG, 'gagal menambah metadata odometer', err?.message || err);
            }
            return result;
        };
    } catch (_) {}

    // Hapus draft edit lokal kalau ada cleanup normal, tapi jangan pernah masukkan ke monitoring aktif.
    try {
        const originalGetAllOffline = getAllOfflineInspections;
        getAllOfflineInspections = async function () {
            const rows = await originalGetAllOffline.apply(this, arguments);
            return (rows || []).filter(row => !isEditDraftV33(row));
        };
    } catch (_) {}

    log('edit guard + odometer metadata aktif');
})();


// =============================================================
// V34 - ODOMETER COLUMN + EDIT CLEANUP GUARD
// =============================================================
(function () {
    const TAG = '[offline v34]';

    function parseMileageForSupabaseV34(value) {
        if (value === null || value === undefined) return null;
        const raw = String(value).trim();
        if (!raw || raw === '-' || raw.toLowerCase() === 'null') return null;
        // Terima input seperti "12.345", "12,345", "12345 km".
        const digits = raw.replace(/[^0-9]/g, '');
        if (!digits) return null;
        const number = parseInt(digits, 10);
        return Number.isFinite(number) ? number : null;
    }

    function pickMileageFromDraftV34(draft) {
        const remote = draft?.remotePayload || {};
        const vehicle = remote._vehicleData || draft?.vehicleData || {};
        return parseMileageForSupabaseV34(
            vehicle.vehicleMileage ??
            vehicle.vehicle_mileage ??
            vehicle.odometer ??
            remote.vehicle_mileage ??
            remote.vehicleMileage
        );
    }

    try {
        const previousCleanInspectionRow = cleanInspectionRow;
        cleanInspectionRow = function (row = {}) {
            const cleaned = previousCleanInspectionRow.apply(this, arguments);
            const mileage = parseMileageForSupabaseV34(row.vehicle_mileage ?? row.vehicleMileage ?? row.odometer);
            // Kolom di Supabase bertipe int4, jadi kirim number atau null.
            cleaned.vehicle_mileage = mileage;
            return cleaned;
        };
    } catch (err) {
        console.warn(TAG, 'cleanInspectionRow override gagal:', err?.message || err);
    }

    try {
        const previousBuildFinalRows = buildFinalRowsFromDraft;
        buildFinalRowsFromDraft = function (draft) {
            const result = previousBuildFinalRows.apply(this, arguments);
            const mileage = pickMileageFromDraftV34(draft);
            if (result?.inspectionRow) {
                result.inspectionRow.vehicle_mileage = mileage;
            }

            // Simpan juga sebagai detail metadata agar edit/report lama tetap bisa fallback.
            try {
                if (mileage !== null && result?.inspectionId && Array.isArray(result.detailRows)) {
                    const existingIndex = result.detailRows.findIndex(row => String(row.item_name || '').toLowerCase().includes('odometer'));
                    const odometerRow = {
                        id: typeof createValidUuid === 'function' ? createValidUuid() : (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
                        inspection_id: result.inspectionId,
                        item_name: 'Data Kendaraan - Odometer',
                        status: 'info',
                        note: String(mileage),
                        photo_url: '',
                        created_at: new Date().toISOString()
                    };
                    if (existingIndex >= 0) result.detailRows[existingIndex] = { ...result.detailRows[existingIndex], ...odometerRow, id: result.detailRows[existingIndex].id || odometerRow.id };
                    else result.detailRows.push(odometerRow);
                }
            } catch (err) {
                console.warn(TAG, 'metadata odometer gagal:', err?.message || err);
            }

            return result;
        };
    } catch (err) {
        console.warn(TAG, 'buildFinalRowsFromDraft override gagal:', err?.message || err);
    }

    console.log('✅ offline-sync.js v34 odometer column fix loaded');
})();


// =============================================================
// V38 - HARD OFFLINE DRAFT ISOLATION
// =============================================================
// Guard ini penting untuk kondisi refresh, internet mati, HP mati, atau user berpindah tanpa logout.
// Data IndexedDB user lain tidak dihapus, tetapi tidak boleh direstore / ditimpa user aktif.
(function () {
    const TAG = '[offline v38]';

    function isEditDraftV38(draft = {}) {
        return Boolean(
            draft?.remotePayload?._editMode ||
            draft?.remotePayload?.editingInspectionId ||
            draft?.remotePayload?.existingInspectionId ||
            draft?.status === 'edit_draft' ||
            draft?.syncStatus === 'edit_draft'
        );
    }

    function isStrictActiveOwnedDraftV38(draft = {}) {
        if (!draft) return false;
        if (typeof isDraftOwnedByCurrentUser === 'function' && !isDraftOwnedByCurrentUser(draft)) return false;
        if (isEditDraftV38(draft)) return false;
        return draft.status === 'draft' && (draft.syncStatus || 'draft') === 'draft';
    }

    async function getSafeDraftIdForCurrentUserV38(candidateId) {
        const user = typeof getCurrentOfflineUser === 'function' ? getCurrentOfflineUser() : { ownerId: null };
        if (!user.ownerId) return candidateId || null;

        let id = candidateId || null;
        let existing = null;

        if (id) {
            existing = await getOfflineInspectionById(id).catch(() => null);
            if (existing && typeof isDraftOwnedByCurrentUser === 'function' && !isDraftOwnedByCurrentUser(existing)) {
                console.warn(TAG, 'draft id milik user lain ditolak, membuat draft baru', {
                    rejectedId: id,
                    existingOwner: existing.ownerId || existing.inspectorId || existing.inspectorName,
                    currentOwner: user.ownerId
                });
                id = null;
            }
        }

        if (!id) id = createOfflineInspectionId();
        return id;
    }

    try {
        getLastOfflineInspection = async function () {
            const data = await getRawOfflineInspections();
            const ownedDrafts = (data || []).filter(isStrictActiveOwnedDraftV38);

            if (ownedDrafts.length === 0) return null;

            ownedDrafts.sort((a, b) => {
                const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
                const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
                return bTime - aTime;
            });

            return ownedDrafts[0];
        };
    } catch (err) {
        console.warn(TAG, 'override getLastOfflineInspection gagal:', err?.message || err);
    }

    try {
        getActiveOfflineInspection = async function () {
            const activeId = getActiveDraftId();

            if (activeId) {
                const activeDraft = await getOfflineInspectionById(activeId).catch(() => null);

                if (activeDraft && isStrictActiveOwnedDraftV38(activeDraft)) {
                    return activeDraft;
                }

                // Active key salah user / edit_draft / pending sync: bersihkan pointer user aktif saja.
                clearActiveDraftId(activeId);
                console.warn(TAG, 'active draft pointer dibersihkan karena tidak valid untuk user aktif', activeId);
            }

            return getLastOfflineInspection();
        };
    } catch (err) {
        console.warn(TAG, 'override getActiveOfflineInspection gagal:', err?.message || err);
    }

    try {
        const originalSaveInspectionOffline = saveInspectionOffline;
        saveInspectionOffline = async function (data = {}) {
            if (!currentUser) {
                console.warn(TAG, 'tidak ada currentUser, draft tidak disimpan');
                return null;
            }

            const requestedId = data.id || currentOfflineInspectionId || null;
            const safeId = await getSafeDraftIdForCurrentUserV38(requestedId);
            const safeData = { ...(data || {}), id: safeId };

            currentOfflineInspectionId = safeId;

            const saved = await originalSaveInspectionOffline.call(this, safeData);

            // edit_draft bukan active inspection draft. Jangan jadikan kandidat restore otomatis.
            if (saved && isEditDraftV38(saved)) {
                clearActiveDraftId(saved.id);
            }

            // Safety final: kalau somehow owner tersimpan berbeda, jangan dipakai runtime.
            if (saved && typeof isDraftOwnedByCurrentUser === 'function' && !isDraftOwnedByCurrentUser(saved)) {
                console.warn(TAG, 'hasil save bukan milik user aktif, runtime id dibersihkan', saved.id);
                currentOfflineInspectionId = null;
                return null;
            }

            return saved;
        };
    } catch (err) {
        console.warn(TAG, 'override saveInspectionOffline gagal:', err?.message || err);
    }

    try {
        updateInspectionOffline = async function (vehicleData) {
            if (!currentUser) return null;
            const safeId = await getSafeDraftIdForCurrentUserV38(currentOfflineInspectionId || null);
            currentOfflineInspectionId = safeId;
            return saveInspectionOffline({
                id: safeId,
                vehicleData: vehicleData || {},
                itemsData: typeof inspectionItemsData !== 'undefined' ? (inspectionItemsData || {}) : {},
                documentsData: typeof getDocumentFormData === 'function' ? getDocumentFormData() : {},
                accessoriesData: typeof getAccessoryFormData === 'function' ? getAccessoryFormData() : {},
                status: 'draft',
                syncStatus: 'draft'
            });
        };
    } catch (err) {
        console.warn(TAG, 'override updateInspectionOffline gagal:', err?.message || err);
    }

    try {
        const originalMarkInspectionReadyToSync = markInspectionReadyToSync;
        markInspectionReadyToSync = async function (record) {
            if (!record) throw new Error('Record inspeksi kosong');
            const safeId = await getSafeDraftIdForCurrentUserV38(currentOfflineInspectionId || null);
            currentOfflineInspectionId = safeId;
            return originalMarkInspectionReadyToSync.call(this, record);
        };
    } catch (err) {
        console.warn(TAG, 'override markInspectionReadyToSync gagal:', err?.message || err);
    }

    console.log('✅ offline-sync.js v38 hard user isolation loaded');
})();


// =============================================================
// V100 - REPORT DETAIL SNAPSHOT METADATA
// =============================================================
// Menyimpan snapshot nama item/kategori di note inspection_details tanpa mengubah skema tabel.
// Snapshot ini dipakai report agar laporan lama tidak berubah menjadi kategori "Lainnya"
// ketika master item/kategori sudah dihapus/diubah.
(function () {
    'use strict';

    const TAG = '[offline-sync v100 snapshot]';
    const SNAPSHOT_RE = /\n?\[LIAN_REPORT_SNAPSHOT:{[\s\S]*?}\]\s*$/i;

    function normV100(value) {
        return String(value ?? '').trim().toLowerCase();
    }

    function isReportMetaRowV100(itemName) {
        const name = normV100(itemName);
        return name.startsWith('dokumen -') ||
            name.startsWith('aksesori -') ||
            name.startsWith('data kendaraan -');
    }

    function getMasterItemsV100() {
        try { return Array.isArray(sheetItems) ? sheetItems : []; }
        catch (_) { return []; }
    }

    function findMasterItemV100({ id = '', name = '' } = {}) {
        const itemId = String(id || '').trim();
        const itemName = normV100(name);
        return getMasterItemsV100().find(item =>
            (itemId && String(item.id || '') === itemId) ||
            (itemName && normV100(item.name || item.item_name || item.title) === itemName)
        ) || null;
    }

    function getSourceItemsV100(draft = {}) {
        const remote = draft.remotePayload || {};
        return remote._itemsData || draft.itemsData || {};
    }

    function buildSnapshotMapV100(items = {}) {
        const map = new Map();

        Object.entries(items || {}).forEach(([key, status]) => {
            if (String(key).endsWith('_data')) return;
            if (!(status === 'good' || status === 'warning' || status === 'bad')) return;

            const meta = items[key + '_data'] || {};
            const master = findMasterItemV100({ id: key, name: meta.itemName || meta.item_name || key });
            const itemName = meta.itemName || meta.item_name || master?.name || master?.item_name || key;
            const category = meta.category || meta.categoryName || master?.category || 'Kategori lama';
            const criticalLevel = meta.critical_level || meta.criticalLevel || master?.critical_level || master?.criticalLevel || 'Low';

            const snapshot = {
                itemName: String(itemName || key),
                category: String(category || 'Kategori lama'),
                critical_level: String(criticalLevel || 'Low')
            };

            [key, itemName, master?.name, master?.item_name, meta.itemName, meta.item_name]
                .filter(Boolean)
                .forEach(candidate => map.set(normV100(candidate), snapshot));
        });

        return map;
    }

    function appendSnapshotToNoteV100(note = '', snapshot = {}) {
        if (!snapshot || !snapshot.itemName) return String(note || '');

        const cleanNote = String(note || '').replace(SNAPSHOT_RE, '').trim();
        const payload = JSON.stringify({
            itemName: snapshot.itemName,
            category: snapshot.category || 'Kategori lama',
            critical_level: snapshot.critical_level || 'Low'
        });

        return `${cleanNote}${cleanNote ? '\n' : ''}[LIAN_REPORT_SNAPSHOT:${payload}]`;
    }

    try {
        const previousBuildFinalRowsFromDraft = typeof buildFinalRowsFromDraft === 'function'
            ? buildFinalRowsFromDraft
            : null;

        if (previousBuildFinalRowsFromDraft) {
            buildFinalRowsFromDraft = function (draft) {
                const result = previousBuildFinalRowsFromDraft.apply(this, arguments);
                const snapshotMap = buildSnapshotMapV100(getSourceItemsV100(draft));

                (result?.detailRows || []).forEach(row => {
                    const itemName = String(row.item_name || row.itemName || '').trim();
                    if (!itemName || isReportMetaRowV100(itemName)) return;

                    const snapshot = snapshotMap.get(normV100(itemName));
                    if (!snapshot) return;

                    // Pastikan item_name final tetap nama saat submit, bukan ID fallback.
                    row.item_name = snapshot.itemName || itemName;
                    row.note = appendSnapshotToNoteV100(row.note || '', snapshot);
                });

                return result;
            };
        }
    } catch (err) {
        console.warn(TAG, 'patch buildFinalRowsFromDraft dilewati:', err?.message || err);
    }

    console.log('✅ offline-sync.js v100 report detail snapshot loaded');
})();
