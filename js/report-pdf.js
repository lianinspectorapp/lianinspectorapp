// ===============================
// LIAN INSPECTOR - REPORT PDF ENGINE (V99 HEADER SAFE SPACING)
// ===============================
// Fokus versi ini:
// - Tidak memakai A4 dan tidak memotong halaman.
// - PDF dibuat sebagai 1 halaman panjang sesuai hasil screen capture report.
// - Layout mengikuti tampilan .report-v25 di aplikasi apa adanya.
// - Menghindari masalah page break, section terpotong, dan foto masuk 3 kolom.

(function () {
    'use strict';

    const TAG = '[report-pdf v99-header-safe-spacing]';
    const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    const HTML2CANVAS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

    const CFG = {
        // Lebar desain report di aplikasi. Jika report yang tampil punya lebar aktual,
        // script akan memakai lebar aktual tersebut; nilai ini hanya fallback.
        fallbackReportWidthPx: 780,
        fixedExportWidthPx: 780,
        renderWindowWidthPx: 1100,
        canvasScale: 2,
        jpegQuality: 0.96,
        backgroundColor: '#ffffff',
        pdfWidthMm: 210,
        pdfSafePaddingMm: 3,
        maxPdfHeightMm: 14000,
        minPdfHeightMm: 120,
        // V98: tambahan ruang aman di bawah footer agar copyright tidak terpotong
        // pada hasil long screenshot PDF.
        footerSafeExtraPx: 44,
        // V99: ruang aman halus di header paling atas/kiri-kanan saat export PDF.
        headerSafeTopPx: 5,
        headerSafeSidePx: 2
    };

    function cleanText(value) {
        return String(value ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/[\t\r]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function sanitizeFilePart(value, fallback = '-') {
        const cleaned = cleanText(value)
            .replace(/[\\/:*?"<>|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned || fallback;
    }

    function getReportContent() {
        return document.getElementById('reportContent');
    }

    function getReportRoot() {
        const reportContent = getReportContent();
        if (!reportContent) {
            throw new Error('Report belum tersedia. Buka laporan terlebih dahulu.');
        }

        const root = reportContent.querySelector('.report-v25') || reportContent.firstElementChild;
        if (!root || !cleanText(root.innerText || root.textContent || '')) {
            throw new Error('Isi laporan masih kosong. Tunggu laporan selesai tampil.');
        }
        return root;
    }

    function getLastInspection() {
        return window.__lianReportPdfLastInspectionV69 ||
            window.__lianLastReportInspectionV64 ||
            window.__lianLastReportInspectionV65 ||
            window.__lianLastReportInspectionV66 ||
            window.__lianLastReportInspectionV67 ||
            window.__lianLastReportInspectionV68 ||
            {};
    }

    function textMatch(pattern, fallback = '') {
        const text = getReportContent()?.innerText || '';
        const match = text.match(pattern);
        return cleanText(match?.[1] || fallback);
    }

    function getFileName() {
        const inspection = getLastInspection();
        const client = sanitizeFilePart(
            inspection.customerName || inspection.customer_name || textMatch(/Nama Client\s*:\s*([^\n]+)/i),
            'Client'
        );
        const vehicle = sanitizeFilePart(
            inspection.vehicleType || inspection.vehicle_type || inspection.vehiclePlate || inspection.vehicle_plate || textMatch(/Merk\/Tipe\s*:\s*([^\n]+)/i),
            'Mobil'
        );

        let dateText = '';
        try {
            const rawDate = inspection.inspectionDate || inspection.inspection_date || inspection.created_at || inspection.createdAt || '';
            const d = rawDate ? new Date(rawDate) : new Date();
            dateText = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
        } catch (_) {}
        if (!dateText) dateText = new Date().toISOString().slice(0, 10);

        return `${client} - ${vehicle} - ${dateText}`;
    }

    function ensureUiStyle() {
        if (document.getElementById('lianReportPdfV84Style')) return;

        const style = document.createElement('style');
        style.id = 'lianReportPdfV84Style';
        style.textContent = `
            .lian-pdf-overlay-v84 {
                position: fixed; inset: 0; z-index: 9999999;
                display: none; align-items: center; justify-content: center;
                background: rgba(15,23,42,.52); backdrop-filter: blur(6px);
                padding: 20px;
            }
            .lian-pdf-box-v84 {
                width: min(450px, 92vw); background: #fff; border-radius: 24px;
                padding: 28px 24px; text-align: center;
                box-shadow: 0 24px 70px rgba(15,23,42,.30);
                border: 1px solid rgba(226,232,240,.95);
                font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            }
            .lian-pdf-spinner-v84 {
                width: 58px; height: 58px; margin: 0 auto 16px; border-radius: 999px;
                border: 5px solid #dbeafe; border-top-color: #2563eb;
                animation: lianPdfSpinV84 .75s linear infinite;
            }
            @keyframes lianPdfSpinV84 { to { transform: rotate(360deg); } }
            .lian-pdf-title-v84 { font-size: 18px; font-weight: 950; color:#0f172a; margin-bottom:8px; }
            .lian-pdf-subtitle-v84 { font-size: 12px; font-weight:750; color:#64748b; line-height:1.55; }

            .lian-pdf-export-sandbox-v84 {
                position: fixed !important;
                left: -12000px !important;
                top: 0 !important;
                background: #ffffff !important;
                pointer-events: none !important;
                z-index: 1 !important;
                overflow: visible !important;
                padding: 0 !important;
                margin: 0 !important;
            }
            .lian-pdf-export-sandbox-v84,
            .lian-pdf-export-sandbox-v84 * {
                box-sizing: border-box !important;
                animation: none !important;
                transition: none !important;
                -webkit-font-smoothing: antialiased !important;
                text-rendering: geometricPrecision !important;
            }
            .lian-pdf-export-sandbox-v84 .report-v25 {
                margin: 0 !important;
                background: #ffffff !important;
                overflow: visible !important;
                transform: none !important;
                padding: 5px 2px 0 2px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-remove-badge,
            .lian-pdf-export-sandbox-v84 .report-no-print {
                display: none !important;
            }
            /* Kunci foto tetap 2 kolom seperti tampilan report aplikasi, bukan 3 kolom. */
            .lian-pdf-export-sandbox-v84 .report-photo-grid {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 16px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-photo-card {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
                overflow: hidden !important;
            }
            .lian-pdf-export-sandbox-v84 .report-photo-card img {
                width: 100% !important;
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                aspect-ratio: auto !important;
                object-fit: contain !important;
                object-position: center center !important;
                display: block !important;
                background: #ffffff !important;
            }

            /* V90: kunci export ke layout desktop 780px seperti PDF1 meskipun aplikasi dibuka dari HP. */
            .lian-pdf-export-sandbox-v84 {
                width: 780px !important;
                min-width: 780px !important;
                max-width: 780px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-v25 {
                width: 780px !important;
                min-width: 780px !important;
                max-width: 780px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-top {
                display: grid !important;
                grid-template-columns: minmax(0, 1fr) minmax(215px, 300px) !important;
                gap: 14px !important;
                align-items: center !important;
            }
            .lian-pdf-export-sandbox-v84 .report-top img {
                height: 72px !important;
                max-width: 260px !important;
                object-fit: contain !important;
                object-position: left center !important;
            }
            .lian-pdf-export-sandbox-v84 .report-detail-box {
                min-width: 215px !important;
                width: auto !important;
            }
            .lian-pdf-export-sandbox-v84 .report-client-bar {
                display: grid !important;
                grid-template-columns: minmax(0, 1fr) minmax(0, .85fr) !important;
                gap: 10px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-vehicle-grid {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
            }
            .lian-pdf-export-sandbox-v84 .report-vehicle-grid > div {
                padding: 16px 20px !important;
                border-bottom: 0 !important;
            }
            .lian-pdf-export-sandbox-v84 .report-vehicle-grid > div:first-child {
                border-right: 1px solid #0f172a33 !important;
            }
            .lian-pdf-export-sandbox-v84 .report-vehicle-grid > div:last-child {
                border-right: 0 !important;
            }
            .lian-pdf-export-sandbox-v84 .report-field-row {
                font-size: 13px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-completeness-grid {
                display: grid !important;
                grid-template-columns: 1.3fr .9fr !important;
                gap: 10px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-badges {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                gap: 10px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-category-grid {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 12px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-findings-grid {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                gap: 10px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-point-grid {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                column-gap: 36px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-point-row {
                display: grid !important;
                grid-template-columns: minmax(0, 1fr) 18px !important;
            }

            /* Tambahan aman tanpa mengubah desain besar: cegah teks kecil di area logo terklip. */
            .lian-pdf-export-sandbox-v84 .report-top,
            .lian-pdf-export-sandbox-v84 .report-top * {
                overflow: visible !important;
            }

            /* V91: koreksi baseline html2canvas secara agresif tapi hanya di sandbox export PDF.
               Masalah utama di beberapa device: teks hasil capture turun ke batas bawah kolom.
               Solusi: beri ruang vertikal aman + angkat elemen teks, tanpa mengubah UI aplikasi. */
            .lian-pdf-export-sandbox-v84 .__lian-export-text-lift {
                position: relative !important;
                top: -2.6px !important;
                line-height: 1.36 !important;
                vertical-align: middle !important;
            }
            .lian-pdf-export-sandbox-v84 .report-client-bar,
            .lian-pdf-export-sandbox-v84 .report-detail-box,
            .lian-pdf-export-sandbox-v84 .report-field-row,
            .lian-pdf-export-sandbox-v84 .report-completeness-grid,
            .lian-pdf-export-sandbox-v84 .report-badges,
            .lian-pdf-export-sandbox-v84 .report-category-score,
            .lian-pdf-export-sandbox-v84 .report-findings-grid,
            .lian-pdf-export-sandbox-v84 .report-point-row,
            .lian-pdf-export-sandbox-v84 .report-photo-card {
                line-height: 1.36 !important;
            }
            .lian-pdf-export-sandbox-v84 .report-client-bar {
                min-height: 42px !important;
                padding-top: 10px !important;
                padding-bottom: 10px !important;
                align-items: center !important;
                overflow: visible !important;
            }
            .lian-pdf-export-sandbox-v84 .report-client-bar > div {
                display: flex !important;
                align-items: center !important;
                min-height: 22px !important;
                line-height: 1.36 !important;
                overflow: visible !important;
                transform: translateY(-2.2px) !important;
            }
            .lian-pdf-export-sandbox-v84 .report-detail-box > div,
            .lian-pdf-export-sandbox-v84 .report-field-row,
            .lian-pdf-export-sandbox-v84 .report-field-row > b,
            .lian-pdf-export-sandbox-v84 .report-field-row > span {
                align-items: center !important;
                line-height: 1.36 !important;
                overflow: visible !important;
            }
            .lian-pdf-export-sandbox-v84 .report-detail-box > div,
            .lian-pdf-export-sandbox-v84 .report-field-row {
                min-height: 22px !important;
            }
            .lian-pdf-export-sandbox-v84 .report-completeness-grid span {
                min-height: 23px !important;
                line-height: 1.25 !important;
                align-items: center !important;
                overflow: visible !important;
            }
            .lian-pdf-export-sandbox-v84 .report-guarantee-badge > div:first-of-type {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                line-height: 1 !important;
                overflow: visible !important;
            }
            .lian-pdf-export-sandbox-v84 .report-guarantee-badge > div:first-of-type {
                transform: translateY(-2px) !important;
            }


            /* V93: baseline aman tanpa mengubah bentuk komponen.
               Jangan mengubah display elemen teks menjadi flex/block karena itu merusak ikon indikator.
               Cukup angkat teks sedikit dan pastikan overflow tidak memotong. */
            .lian-pdf-export-sandbox-v84 .report-v25 {
                font-family: Arial, Helvetica, sans-serif !important;
                text-size-adjust: 100% !important;
                -webkit-text-size-adjust: 100% !important;
            }
            .lian-pdf-export-sandbox-v84 .__lian-export-text-center {
                position: relative !important;
                top: -3px !important;
                line-height: 1.28 !important;
                vertical-align: middle !important;
                overflow: visible !important;
            }
            .lian-pdf-export-sandbox-v84 .report-detail-box > div,
            .lian-pdf-export-sandbox-v84 .report-field-row,
            .lian-pdf-export-sandbox-v84 .report-point-row {
                align-items: center !important;
            }
            .lian-pdf-export-sandbox-v84 .report-detail-box > div > *,
            .lian-pdf-export-sandbox-v84 .report-field-row > *,
            .lian-pdf-export-sandbox-v84 .report-point-row > div,
            .lian-pdf-export-sandbox-v84 .report-category-score div,
            .lian-pdf-export-sandbox-v84 .report-findings-grid div,
            .lian-pdf-export-sandbox-v84 .report-v25 h1,
            .lian-pdf-export-sandbox-v84 .report-v25 h2,
            .lian-pdf-export-sandbox-v84 .report-v25 h3,
            .lian-pdf-export-sandbox-v84 .report-v25 p {
                line-height: 1.28 !important;
                overflow: visible !important;
            }
            /* Kembalikan indikator seperti tampilan aplikasi: lingkaran, bukan pill. */
            .lian-pdf-export-sandbox-v84 .report-guarantee-badge {
                text-align: center !important;
                overflow: visible !important;
            }
            .lian-pdf-export-sandbox-v84 .report-guarantee-badge > div:first-of-type {
                width: 44px !important;
                height: 44px !important;
                min-width: 44px !important;
                max-width: 44px !important;
                min-height: 44px !important;
                max-height: 44px !important;
                border-radius: 999px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                margin-left: auto !important;
                margin-right: auto !important;
                margin-bottom: 8px !important;
                line-height: 1 !important;
                overflow: hidden !important;
                transform: none !important;
            }
            .lian-pdf-export-sandbox-v84 .report-guarantee-badge > div:first-of-type * {
                line-height: 1 !important;
            }
            .lian-pdf-export-sandbox-v84 .report-guarantee-badge > div:not(:first-of-type) {
                line-height: 1.28 !important;
            }
            .lian-pdf-export-sandbox-v84 [data-photo-loading="true"],
            .lian-pdf-export-sandbox-v84 [data-photo-fallback="true"] {
                display: none !important;
            }
            .lian-pdf-export-sandbox-v84 .report-photo-grid {
                align-items: start !important;
            }
            .lian-pdf-export-sandbox-v84 .report-photo-card a {
                background: #ffffff !important;
            }

            /* V97: final micro-adjustment terarah.
               Area yang sudah benar (logo, meta tanggal, client bar, data kendaraan) tidak disentuh. */
            .lian-pdf-export-sandbox-v84 .__lian-chip-inner-lift {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 5px !important;
                line-height: 1 !important;
                transform: translateY(-1px) !important;
                white-space: nowrap !important;
            }
            .lian-pdf-export-sandbox-v84 .__lian-guarantee-icon-lift {
                display: inline-block !important;
                line-height: 1 !important;
                transform: translateY(-5px) !important;
            }
            .lian-pdf-export-sandbox-v84 .__lian-final-score-lift {
                display: inline-block !important;
                transform: translateY(-4px) !important;
                line-height: .98 !important;
            }
            .lian-pdf-export-sandbox-v84 .__lian-final-grade-lift {
                display: inline-block !important;
                transform: translateY(-6px) !important;
                line-height: .98 !important;
            }
            .lian-pdf-export-sandbox-v84 .__lian-finding-chip-inner-lift {
                display: inline-block !important;
                transform: translateY(-0.7px) !important;
                line-height: 1 !important;
                white-space: nowrap !important;
            }
            .lian-pdf-export-sandbox-v84 .__lian-point-main-title-lift,
            .lian-pdf-export-sandbox-v84 .__lian-point-section-title-lift,
            .lian-pdf-export-sandbox-v84 .__lian-photo-title-lift {
                display: inline-block !important;
                transform: translateY(-3px) !important;
                line-height: 1.15 !important;
            }
            .lian-pdf-export-sandbox-v84 .__lian-legend-label-lift {
                display: inline-block !important;
                transform: translateY(-2px) !important;
                line-height: 1.15 !important;
            }

            /* V98: ruang aman terakhir agar footer/copyright tidak terpotong di batas bawah PDF. */
            .lian-pdf-export-sandbox-v84 .__lian-export-footer-spacer-v98 {
                display: block !important;
                height: 44px !important;
                min-height: 44px !important;
                width: 100% !important;
                background: #ffffff !important;
                clear: both !important;
            }
            .lian-pdf-export-sandbox-v84 .__lian-export-footer-card-v98 {
                overflow: visible !important;
                min-height: 42px !important;
                box-sizing: border-box !important;
            }
        `;
        document.head.appendChild(style);
    }

    function showOverlay(message = 'Menyiapkan laporan...', fileName = getFileName()) {
        ensureUiStyle();
        let overlay = document.getElementById('lianPdfOverlayV84');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'lianPdfOverlayV84';
            overlay.className = 'lian-pdf-overlay-v84';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div class="lian-pdf-box-v84">
                <div class="lian-pdf-spinner-v84"></div>
                <div class="lian-pdf-title-v84">Menyiapkan PDF...</div>
                <div class="lian-pdf-subtitle-v84"></div>
            </div>`;
        overlay.style.display = 'flex';
        updateOverlay(message, fileName);
    }

    function updateOverlay(message, fileName = getFileName()) {
        const overlay = document.getElementById('lianPdfOverlayV84');
        if (!overlay) return showOverlay(message, fileName);
        const subtitle = overlay.querySelector('.lian-pdf-subtitle-v84');
        if (subtitle) subtitle.innerHTML = `${escapeHtml(fileName)}.pdf<br>${escapeHtml(message)}`;
    }

    function hideOverlay() {
        const overlay = document.getElementById('lianPdfOverlayV84');
        if (overlay) overlay.style.display = 'none';
    }

    function loadScriptOnce(src, globalCheck, id) {
        return new Promise((resolve, reject) => {
            try {
                if (globalCheck()) return resolve(true);

                const existing = document.getElementById(id);
                if (existing) {
                    existing.addEventListener('load', () => resolve(true), { once: true });
                    existing.addEventListener('error', () => reject(new Error('Gagal memuat library PDF.')), { once: true });
                    return;
                }

                const script = document.createElement('script');
                script.id = id;
                script.src = src;
                script.async = true;
                script.onload = () => resolve(true);
                script.onerror = () => reject(new Error('Gagal memuat library PDF. Pastikan internet aktif.'));
                document.head.appendChild(script);
            } catch (err) {
                reject(err);
            }
        });
    }

    async function ensureLibraries() {
        await loadScriptOnce(JSPDF_CDN, () => Boolean(window.jspdf?.jsPDF), 'lian-jspdf-v84');
        await loadScriptOnce(HTML2CANVAS_CDN, () => Boolean(window.html2canvas), 'lian-html2canvas-v84');
        if (!window.jspdf?.jsPDF) throw new Error('jsPDF belum tersedia.');
        if (!window.html2canvas) throw new Error('html2canvas belum tersedia.');
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
            /uc\?id=([^&#]+)/i,
            /thumbnail\?id=([^&#]+)/i
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) return decodeURIComponent(match[1]);
        }
        if (/^[a-zA-Z0-9_-]{20,}$/.test(text) && !text.includes('http')) return text;
        return '';
    }

    function getImageFileId(img) {
        if (!img) return '';
        return img.dataset.reportDriveFileId ||
            img.dataset.driveFileId ||
            img.dataset.fileId ||
            extractGoogleDriveFileId(img.getAttribute('src') || img.src || '') ||
            extractGoogleDriveFileId(img.getAttribute('data-src') || '');
    }

    async function waitForImages(root, timeout = 26000) {
        const images = Array.from(root.querySelectorAll('img'))
            .filter(img => String(img.getAttribute('src') || img.src || '').trim());
        if (images.length === 0) return;

        await Promise.race([
            Promise.all(images.map(img => {
                if (img.complete && img.naturalWidth > 0) return Promise.resolve(true);
                return new Promise(resolve => {
                    const done = () => resolve(true);
                    img.addEventListener('load', done, { once: true });
                    img.addEventListener('error', done, { once: true });
                    setTimeout(done, 9000);
                });
            })),
            new Promise(resolve => setTimeout(resolve, timeout))
        ]);
    }

    async function hydratePhotosForExport(fileName) {
        const reportRoot = getReportRoot();

        if (typeof hydrateReportDrivePhotos === 'function') {
            try {
                updateOverlay('Memuat foto dokumentasi...', fileName);
                await hydrateReportDrivePhotos();
            } catch (err) {
                console.warn(TAG, 'hydrateReportDrivePhotos gagal, lanjut manual:', err?.message || err);
            }
        }

        const driveImages = Array.from(reportRoot.querySelectorAll('img')).filter(img => {
            const src = String(img.getAttribute('src') || img.src || '').trim();
            if (!src || src.startsWith('data:image/')) return false;
            return Boolean(getImageFileId(img)) || src.includes('drive.google.com') || src.includes('googleusercontent.com');
        });

        let loaded = 0;
        for (const img of driveImages) {
            const fileId = getImageFileId(img);
            if (!fileId || typeof fetchReportPhotoDataUrl !== 'function') continue;
            try {
                updateOverlay(`Memuat foto ${loaded + 1}/${driveImages.length}...`, fileName);
                const dataUrl = await fetchReportPhotoDataUrl(fileId);
                if (String(dataUrl || '').startsWith('data:image/')) {
                    img.src = dataUrl;
                    img.removeAttribute('data-report-drive-file-id');
                    img.style.display = 'block';
                    img.closest('a')?.querySelector?.('[data-photo-loading="true"]')?.remove();
                    img.closest('a')?.querySelector?.('[data-photo-fallback="true"]')?.remove();
                    loaded += 1;
                }
            } catch (err) {
                console.warn(TAG, 'foto gagal di-inline:', fileId, err?.message || err);
            }
        }

        await waitForImages(reportRoot, 26000);
    }

    function getActualReportWidth(root) {
        // V90: jangan pakai lebar aktual modal/device.
        // Jika export dilakukan dari HP, lebar aktual report menjadi mobile layout
        // dan hasil PDF ikut seperti HP. Kunci export ke lebar desktop report yang lebih zoom-in.
        return CFG.fixedExportWidthPx || CFG.fallbackReportWidthPx || 780;
    }

    function applyTextBaselineCorrection(clone) {
        // V93: perbaikan baseline yang aman.
        // Masalah sebelumnya: semua text container diubah menjadi flex sehingga ikon indikator berubah bentuk.
        // Sekarang hanya leaf text yang diangkat sedikit, dan ikon/foto/loading tidak disentuh.
        if (!clone || typeof clone.querySelectorAll !== 'function') return;

        const textCandidateTags = new Set(['DIV', 'SPAN', 'B', 'STRONG', 'EM', 'SMALL', 'P', 'LABEL', 'H1', 'H2', 'H3', 'H4']);
        const iconLikeText = new Set(['✓', '—', '-', '•', '●', '🛡️', '🌊', '🔎', '📸', '📷', '⚠️', '✅']);

        clone.querySelectorAll('*').forEach(el => {
            const tag = el.tagName;
            if (!textCandidateTags.has(tag)) return;
            if (el.closest('.report-photo-grid [data-photo-loading="true"], .report-photo-grid [data-photo-fallback="true"]')) return;
            if (el.closest('.report-guarantee-badge') && el.matches('.report-guarantee-badge > div:first-of-type, .report-guarantee-badge > div:first-of-type *')) return;
            if (el.closest('svg, canvas, video')) return;

            const rawText = cleanText(el.textContent || '');
            if (!rawText) return;
            if (iconLikeText.has(rawText)) return;

            const children = Array.from(el.children || []);
            const isLeaf = children.length === 0;
            const hasOnlyInlineTextChildren = children.length > 0 && children.every(child => {
                const childTag = child.tagName;
                return ['SPAN', 'B', 'STRONG', 'EM', 'SMALL'].includes(childTag);
            });
            const hasLayoutChild = children.some(child => {
                const display = (window.getComputedStyle(child).display || '').toLowerCase();
                return display.includes('grid') || display.includes('flex') || display === 'block';
            });
            const isSafeTextContainer = hasOnlyInlineTextChildren && !hasLayoutChild && rawText.length <= 160;

            if (!isLeaf && !isSafeTextContainer) return;

            el.classList.add('__lian-export-text-center');
            el.style.setProperty('position', 'relative', 'important');
            el.style.setProperty('top', '-3px', 'important');
            el.style.setProperty('line-height', '1.28', 'important');
            el.style.setProperty('vertical-align', 'middle', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
        });
    }

    function wrapElementContentsForLift(el, className) {
        if (!el || el.querySelector(`:scope > .${className}`)) return null;
        const wrapper = document.createElement('span');
        wrapper.className = className;
        while (el.firstChild) wrapper.appendChild(el.firstChild);
        el.appendChild(wrapper);
        return wrapper;
    }

    function wrapTextNodesAfterIconForLift(el, className) {
        if (!el || el.querySelector(`:scope > .${className}`)) return null;
        const textNodes = Array.from(el.childNodes || []).filter(node => {
            return node.nodeType === Node.TEXT_NODE && cleanText(node.nodeValue || '');
        });
        if (!textNodes.length) return null;
        const wrapper = document.createElement('span');
        wrapper.className = className;
        el.insertBefore(wrapper, textNodes[0]);
        textNodes.forEach(node => wrapper.appendChild(node));
        return wrapper;
    }


    function ensureFooterSafeBottomV98(clone) {
        if (!clone || typeof clone.querySelectorAll !== 'function') return;

        // Hapus spacer lama agar tidak dobel karena normalizeCloneForLongPdf dipanggil lagi pada onclone html2canvas.
        clone.querySelectorAll('.__lian-export-footer-spacer-v98').forEach(el => el.remove());

        // Tandai card footer terakhir supaya tidak terpotong secara internal.
        const directChildren = Array.from(clone.children || []);
        const footerCard = directChildren.slice().reverse().find(el => {
            const text = cleanText(el.textContent || '');
            const style = String(el.getAttribute('style') || '').toLowerCase();
            return text.includes('Lian Inspector') || style.includes('#0f172a') || style.includes('background:#0f172a');
        });

        if (footerCard) {
            footerCard.classList.add('__lian-export-footer-card-v98');
            footerCard.style.setProperty('overflow', 'visible', 'important');
            footerCard.style.setProperty('min-height', '42px', 'important');
            footerCard.style.setProperty('margin-bottom', '0', 'important');
        }

        const spacer = document.createElement('div');
        spacer.className = '__lian-export-footer-spacer-v98';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.cssText = `display:block;height:${CFG.footerSafeExtraPx || 44}px;min-height:${CFG.footerSafeExtraPx || 44}px;width:100%;background:#ffffff;clear:both;`;
        clone.appendChild(spacer);
    }

    function applyTargetedMicroAdjustmentsV97(clone) {
        if (!clone || typeof clone.querySelectorAll !== 'function') return;

        // 1) Dokumen & Aksesoris: isi chip diturunkan kembali 1px dari V96 (net naik ±1px), agar tepat di tengah.
        clone.querySelectorAll('.report-completeness-grid span').forEach(chip => {
            const marker = chip.querySelector(':scope > b');
            if (!marker) return;
            wrapElementContentsForLift(chip, '__lian-chip-inner-lift');
        });

        // 2) Indikator Bebas Tabrak/Banjir/Nomor Rangka: naikkan ikon saja ±5px,
        // lingkaran tetap di posisi dan bentuk aslinya.
        clone.querySelectorAll('.report-guarantee-badge > div:first-of-type').forEach(iconCircle => {
            wrapElementContentsForLift(iconCircle, '__lian-guarantee-icon-lift');
        });

        // 3) Penilaian Akhir: 64% diturunkan 2px dari V96 (net naik ±4px), Grade D tetap di posisi V96.
        const scoreEl = clone.querySelector('#reportEditableScorePercent');
        if (scoreEl) {
            scoreEl.classList.add('__lian-final-score-lift');
            const percentEl = scoreEl.nextElementSibling;
            if (percentEl && cleanText(percentEl.textContent || '') === '%') {
                percentEl.classList.add('__lian-final-score-lift');
            }
        }
        const gradeEl = clone.querySelector('#reportEditableScoreGrade');
        if (gradeEl) gradeEl.classList.add('__lian-final-grade-lift');

        // 3b) Temuan Penting: teks chip Rusak/Perhatian dinaikkan ±0.7px di dalam chip.
        clone.querySelectorAll('.report-findings-grid > div > div:first-child > div:last-child').forEach(statusChip => {
            const text = cleanText(statusChip.textContent || '');
            if (/Rusak|Perhatian/i.test(text)) {
                wrapElementContentsForLift(statusChip, '__lian-finding-chip-inner-lift');
            }
        });

        // 4) Poin Inspeksi: judul utama naik ±3px.
        clone.querySelectorAll('div').forEach(el => {
            const text = cleanText(el.textContent || '');
            const children = Array.from(el.children || []);
            const isSimpleText = children.length === 0 || children.every(child => child.tagName === 'SPAN');
            if (text === 'Poin Inspeksi' && !el.closest('.report-point-section') && isSimpleText) {
                wrapElementContentsForLift(el, '__lian-point-main-title-lift');
            }
        });

        // 5) Legend: teksnya saja naik ±2px agar sejajar dengan dot warna.
        clone.querySelectorAll('.report-point-legend > span').forEach(item => {
            wrapTextNodesAfterIconForLift(item, '__lian-legend-label-lift');
        });

        // 6) Judul kategori Poin Inspeksi — interior/Lainnya naik ±3px.
        clone.querySelectorAll('.report-point-section > div:first-child').forEach(titleBar => {
            wrapElementContentsForLift(titleBar, '__lian-point-section-title-lift');
        });

        // 7) Judul Foto Dokumentasi naik ±3px, tanpa mengubah grid/foto.
        clone.querySelectorAll('div').forEach(el => {
            const text = cleanText(el.textContent || '');
            const isPhotoTitle = text.includes('Foto Dokumentasi') && !el.closest('.report-photo-card');
            if (!isPhotoTitle) return;
            const children = Array.from(el.children || []);
            if (children.length > 1) return;
            wrapElementContentsForLift(el, '__lian-photo-title-lift');
        });
    }

    function normalizeCloneForLongPdf(clone, widthPx) {
        clone.style.width = `${widthPx}px`;
        clone.style.maxWidth = `${widthPx}px`;
        clone.style.minWidth = `${widthPx}px`;
        clone.style.margin = '0';
        // V99: beri napas header atas 5px dan kiri-kanan 2px tanpa mengubah layout utama.
        clone.style.setProperty('padding', `${CFG.headerSafeTopPx || 5}px ${CFG.headerSafeSidePx || 2}px 0 ${CFG.headerSafeSidePx || 2}px`, 'important');
        clone.style.setProperty('--lian-export-width', `${widthPx}px`);
        clone.style.background = CFG.backgroundColor;
        clone.style.overflow = 'visible';
        clone.style.transform = 'none';

        // Hapus tombol/badge editor yang tidak perlu tercetak kalau ada.
        clone.querySelectorAll('.report-remove-badge, .report-no-print').forEach(el => el.remove());

        // V93: setelah foto berhasil dihydrate, placeholder loading/fallback tidak boleh ikut tercapture.
        clone.querySelectorAll('[data-photo-loading="true"], [data-photo-fallback="true"]').forEach(el => el.remove());

        // Pastikan tidak ada lazy image yang belum kebaca.
        // Penting: foto dokumentasi kendaraan tidak boleh di-stretch/crop paksa.
        clone.querySelectorAll('img').forEach(img => {
            img.setAttribute('loading', 'eager');
            img.style.setProperty('max-width', '100%', 'important');
        });
        clone.querySelectorAll('.report-photo-card img').forEach(img => {
            img.style.setProperty('width', '100%', 'important');
            img.style.setProperty('height', 'auto', 'important');
            img.style.setProperty('min-height', '0', 'important');
            img.style.setProperty('max-height', 'none', 'important');
            img.style.setProperty('aspect-ratio', 'auto', 'important');
            img.style.setProperty('object-fit', 'contain', 'important');
            img.style.setProperty('object-position', 'center center', 'important');
            img.style.setProperty('display', 'block', 'important');
        });

        // Kunci layout desktop agar hasil export tidak berubah saat dibuka dari HP.
        const forceGrid = (selector, columns, gap = null) => {
            clone.querySelectorAll(selector).forEach(el => {
                el.style.setProperty('display', 'grid', 'important');
                el.style.setProperty('grid-template-columns', columns, 'important');
                if (gap) el.style.setProperty('gap', gap, 'important');
            });
        };

        forceGrid('.report-top', 'minmax(0, 1fr) minmax(215px, 300px)', '14px');
        forceGrid('.report-client-bar', 'minmax(0, 1fr) minmax(0, .85fr)', '10px');
        forceGrid('.report-vehicle-grid', '1fr 1fr');
        forceGrid('.report-completeness-grid', '1.3fr .9fr', '10px');
        forceGrid('.report-badges', 'repeat(3, minmax(0, 1fr))', '10px');
        forceGrid('.report-category-grid', 'repeat(2, minmax(0, 1fr))', '12px');
        forceGrid('.report-findings-grid', 'repeat(3, minmax(0, 1fr))', '10px');
        forceGrid('.report-point-grid', '1fr 1fr');
        forceGrid('.report-photo-grid', 'repeat(2, minmax(0, 1fr))', '16px');

        clone.querySelectorAll('.report-top img').forEach(img => {
            img.style.setProperty('height', '72px', 'important');
            img.style.setProperty('max-width', '260px', 'important');
        });

        clone.querySelectorAll('.report-detail-box').forEach(el => {
            el.style.setProperty('min-width', '215px', 'important');
            el.style.setProperty('width', 'auto', 'important');
        });

        clone.querySelectorAll('.report-vehicle-grid > div').forEach((el, index) => {
            el.style.setProperty('padding', '16px 20px', 'important');
            el.style.setProperty('border-bottom', '0', 'important');
            el.style.setProperty('border-right', index === 0 ? '1px solid #0f172a33' : '0', 'important');
        });

        // V91: normalisasi layout export agar teks tidak jatuh ke bawah saat di-capture.
        clone.querySelectorAll('.report-client-bar').forEach(el => {
            el.style.setProperty('min-height', '42px', 'important');
            el.style.setProperty('padding-top', '10px', 'important');
            el.style.setProperty('padding-bottom', '10px', 'important');
            el.style.setProperty('align-items', 'center', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
        });
        clone.querySelectorAll('.report-client-bar > div').forEach(el => {
            el.style.setProperty('display', 'flex', 'important');
            el.style.setProperty('align-items', 'center', 'important');
            el.style.setProperty('min-height', '22px', 'important');
            el.style.setProperty('line-height', '1.36', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
            el.style.setProperty('transform', 'translateY(-2.2px)', 'important');
        });
        clone.querySelectorAll('.report-detail-box > div, .report-field-row').forEach(el => {
            el.style.setProperty('min-height', '22px', 'important');
            el.style.setProperty('align-items', 'center', 'important');
            el.style.setProperty('line-height', '1.36', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
        });
        clone.querySelectorAll('.report-field-row > b, .report-field-row > span').forEach(el => {
            el.style.setProperty('line-height', '1.36', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
        });
        clone.querySelectorAll('.report-completeness-grid span').forEach(el => {
            el.style.setProperty('min-height', '23px', 'important');
            el.style.setProperty('line-height', '1.25', 'important');
            el.style.setProperty('align-items', 'center', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
        });
        clone.querySelectorAll('.report-guarantee-badge').forEach(el => {
            el.style.setProperty('text-align', 'center', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
        });
        clone.querySelectorAll('.report-guarantee-badge > div:first-of-type').forEach(el => {
            el.style.setProperty('width', '44px', 'important');
            el.style.setProperty('height', '44px', 'important');
            el.style.setProperty('min-width', '44px', 'important');
            el.style.setProperty('max-width', '44px', 'important');
            el.style.setProperty('min-height', '44px', 'important');
            el.style.setProperty('max-height', '44px', 'important');
            el.style.setProperty('border-radius', '999px', 'important');
            el.style.setProperty('display', 'flex', 'important');
            el.style.setProperty('align-items', 'center', 'important');
            el.style.setProperty('justify-content', 'center', 'important');
            el.style.setProperty('margin-left', 'auto', 'important');
            el.style.setProperty('margin-right', 'auto', 'important');
            el.style.setProperty('margin-bottom', '8px', 'important');
            el.style.setProperty('line-height', '1', 'important');
            el.style.setProperty('overflow', 'hidden', 'important');
            el.style.setProperty('transform', 'none', 'important');
        });
        clone.querySelectorAll('.report-guarantee-badge > div:not(:first-of-type)').forEach(el => {
            el.style.setProperty('line-height', '1.28', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
            el.style.removeProperty('transform');
        });

        applyTextBaselineCorrection(clone);
        applyTargetedMicroAdjustmentsV97(clone);
        ensureFooterSafeBottomV98(clone);
    }

    function createExportClone() {
        const root = getReportRoot();
        const widthPx = getActualReportWidth(root);
        const clone = root.cloneNode(true);

        const sandbox = document.createElement('div');
        sandbox.className = 'lian-pdf-export-sandbox-v84';
        sandbox.style.width = `${widthPx}px`;

        normalizeCloneForLongPdf(clone, widthPx);
        sandbox.appendChild(clone);
        document.body.appendChild(sandbox);

        return { sandbox, clone, widthPx };
    }

    function removeExportClone(sandbox) {
        try {
            if (sandbox?.parentNode) sandbox.parentNode.removeChild(sandbox);
        } catch (_) {}
    }

    async function renderLongCanvas(clone, widthPx) {
        await waitForImages(clone, 26000);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const measuredHeight = Math.max(
            clone.scrollHeight || 0,
            clone.offsetHeight || 0,
            clone.getBoundingClientRect().height || 0,
            1
        );
        const heightPx = Math.ceil(measuredHeight + Math.max(0, CFG.footerSafeExtraPx || 0));

        return window.html2canvas(clone, {
            backgroundColor: CFG.backgroundColor,
            scale: CFG.canvasScale,
            useCORS: true,
            allowTaint: true,
            logging: false,
            imageTimeout: 26000,
            width: widthPx,
            height: heightPx,
            windowWidth: Math.max(widthPx, CFG.renderWindowWidthPx || widthPx),
            windowHeight: Math.max(heightPx, 1600),
            scrollX: 0,
            scrollY: 0,
            onclone: (doc) => {
                const clonedRoot = doc.querySelector('.lian-pdf-export-sandbox-v84 .report-v25') ||
                    doc.querySelector('.lian-pdf-export-sandbox-v84 > *');
                if (clonedRoot) normalizeCloneForLongPdf(clonedRoot, widthPx);
            }
        });
    }

    function calculateLongPdfSize(canvas) {
        const pdfW = CFG.pdfWidthMm;
        const padding = CFG.pdfSafePaddingMm;
        const contentW = pdfW - padding * 2;
        let contentH = (canvas.height / canvas.width) * contentW;
        contentH = Math.max(1, contentH);

        let pdfH = contentH + padding * 2;
        pdfH = Math.max(CFG.minPdfHeightMm, Math.min(CFG.maxPdfHeightMm, pdfH));

        // Kalau sangat panjang dan mencapai limit PDF, skalakan tinggi konten agar tetap masuk.
        if (contentH + padding * 2 > CFG.maxPdfHeightMm) {
            contentH = CFG.maxPdfHeightMm - padding * 2;
            pdfH = CFG.maxPdfHeightMm;
        }

        return { pdfW, pdfH, padding, contentW, contentH };
    }

    async function exportPdf() {
        const fileName = getFileName();
        let sandbox = null;

        showOverlay('Menyiapkan library PDF...', fileName);
        try {
            await ensureLibraries();
            await hydratePhotosForExport(fileName);

            updateOverlay('Mengambil tampilan penuh report...', fileName);
            const cloneInfo = createExportClone();
            sandbox = cloneInfo.sandbox;
            const clone = cloneInfo.clone;
            const widthPx = cloneInfo.widthPx;

            updateOverlay('Membuat screen capture...', fileName);
            const canvas = await renderLongCanvas(clone, widthPx);
            const imgData = canvas.toDataURL('image/jpeg', CFG.jpegQuality);
            const size = calculateLongPdfSize(canvas);

            updateOverlay('Membuat file PDF...', fileName);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [size.pdfW, size.pdfH],
                compress: true
            });

            pdf.setProperties({
                title: fileName,
                subject: 'Laporan Inspeksi Kendaraan - Long Screenshot PDF',
                creator: 'LianInspector'
            });

            pdf.addImage(
                imgData,
                'JPEG',
                size.padding,
                size.padding,
                size.contentW,
                size.contentH,
                undefined,
                'FAST'
            );
            pdf.save(`${fileName}.pdf`);

            if (typeof showToast === 'function') {
                showToast('✓ PDF berhasil dibuat dari tampilan report');
            }
        } catch (err) {
            console.error(TAG, 'export gagal:', err);
            if (typeof showToast === 'function') showToast('Gagal export PDF: ' + (err?.message || err), 'error');
            else alert('Gagal export PDF: ' + (err?.message || err));
        } finally {
            removeExportClone(sandbox);
            hideOverlay();
        }
    }

    function replaceButton(button, html, className, handler) {
        if (!button || !button.parentNode) return null;
        const clone = button.cloneNode(false);
        clone.id = button.id;
        clone.className = className || button.className;
        clone.innerHTML = html;
        clone.addEventListener('click', handler || exportPdf);
        button.parentNode.replaceChild(clone, button);
        return clone;
    }

    function configureButtons(options = {}) {
        const handler = options.exportHandler || function (event) {
            if (event) event.preventDefault();
            exportPdf();
        };

        const printBtn = document.getElementById('printReportBtn');
        const downloadBtn = document.getElementById('downloadReportBtn');
        const closeBtn = document.getElementById('closeReportBtnAction');

        if (printBtn) printBtn.style.display = 'none';

        replaceButton(
            downloadBtn,
            '<i data-lucide="file-down" style="width:18px;height:18px;"></i><span>Export PDF</span>',
            'flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-bold transition-all shadow-lg',
            handler
        );

        replaceButton(
            closeBtn,
            '<span>Tutup</span>',
            'flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 rounded-xl font-bold transition-all bg-white',
            function (event) {
                event.preventDefault();
                if (typeof closeReportModalAction === 'function') closeReportModalAction(event);
            }
        );

        try { if (window.lucide) lucide.createIcons(); } catch (_) {}
    }

    window.LianReportPdf = {
        exportPdf,
        configureButtons,
        getFileName,
        version: 'v99-header-safe-spacing-export-pdf'
    };

    ensureUiStyle();
    setTimeout(() => configureButtons(), 250);
    console.log('✅ report-pdf.js v99 header safe spacing loaded');
})();
