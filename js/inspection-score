// =====================================================
// LIANINSPEKTOR - INSPECTION SCORE ENGINE
// =====================================================
// File ini khusus untuk logika penilaian hasil inspeksi.
// Tujuan:
// 1. Menghitung skor fisik berdasarkan bobot tingkat kritis item.
// 2. Menghitung skor kelengkapan dokumen dan aksesoris.
// 3. Memberikan grade akhir A/B/C/D/E.
// 4. Menerapkan hard rule agar kerusakan fatal tidak tertutup item kecil.
//
// Catatan integrasi:
// - File ini tidak mengakses DOM.
// - Aman dipakai dari inspection.js, report, atau modul lain.
// - Semua output dibuat transparan: rawScore, finalScore, grade, reasons.

(function () {
    'use strict';

    const SCORE_ENGINE_VERSION = '1.0.1-v62';

    const DEFAULT_CONFIG = {
        criticalWeights: {
            low: 1,
            medium: 2,
            high: 4,
            critical: 8
        },
        statusScores: {
            good: 100,
            warning: 60,
            bad: 0
        },
        finalWeights: {
            physical: 0.85,
            documents: 0.10,
            accessories: 0.05
        },
        gradeThresholds: [
            { grade: 'A', min: 90, color: 'green', label: 'Sangat layak', description: 'Kondisi sangat baik, hanya ada catatan ringan.' },
            { grade: 'B', min: 80, color: 'green', label: 'Layak', description: 'Kondisi baik, ada beberapa catatan ringan.' },
            { grade: 'C', min: 70, color: 'yellow', label: 'Cukup layak', description: 'Masih dapat dipertimbangkan, tetapi perlu perhatian/perbaikan.' },
            { grade: 'D', min: 60, color: 'orange', label: 'Berisiko', description: 'Butuh perbaikan cukup besar dan perlu negosiasi kuat.' },
            { grade: 'E', min: 0, color: 'red', label: 'Tidak layak', description: 'Tidak disarankan untuk diambil/dibeli sebelum masalah utama diperbaiki.' }
        ],
        gradeScoreCaps: {
            A: 100,
            B: 89,
            C: 79,
            D: 69,
            E: 49
        },
        documentLabels: [
            ['doc_bpkb', 'BPKB'],
            ['doc_stnk', 'STNK'],
            ['doc_faktur', 'Faktur'],
            ['doc_forma', 'Form A'],
            ['doc_kir', 'KIR'],
            ['doc_manual', 'Buku Manual'],
            ['doc_servis', 'Buku Servis']
        ],
        accessoryLabels: [
            ['acc_kunci_serep', 'Kunci Serep'],
            ['acc_kunci_roda', 'Kunci Roda'],
            ['acc_ban_serep', 'Ban Serep'],
            ['acc_dongkrak', 'Dongkrak']
        ]
    };

    function clamp(value, min = 0, max = 100) {
        const number = Number(value);
        if (!Number.isFinite(number)) return min;
        return Math.max(min, Math.min(max, number));
    }

    function roundScore(value) {
        return Math.round(clamp(value, 0, 100));
    }

    function normalizeText(value) {
        return String(value ?? '').trim().toLowerCase();
    }

    function normalizeCriticalLevel(value) {
        const text = normalizeText(value);

        if (['critical', 'kritis', 'merah', 'fatal', 'sangat tinggi', 'very high'].includes(text)) {
            return 'critical';
        }
        if (['high', 'tinggi', 'orange', 'oranye'].includes(text)) {
            return 'high';
        }
        if (['medium', 'sedang', 'middle', 'moderate', 'kuning'].includes(text)) {
            return 'medium';
        }
        return 'low';
    }

    function normalizeStatus(value) {
        const text = normalizeText(value);
        if (['good', 'baik', 'hijau', 'ok', 'aman'].includes(text)) return 'good';
        if (['warning', 'perlu', 'perhatian', 'perlu perhatian', 'kuning', 'catatan'].includes(text)) return 'warning';
        if (['bad', 'rusak', 'merah', 'parah', 'tidak baik'].includes(text)) return 'bad';
        return '';
    }

    function getItemId(item = {}) {
        return String(item.id ?? item.item_id ?? item.name ?? '').trim();
    }

    function getItemName(item = {}) {
        return String(item.name ?? item.item_name ?? item.title ?? getItemId(item) ?? '-').trim() || '-';
    }

    function getGradeMeta(score, config = DEFAULT_CONFIG) {
        const cleanScore = roundScore(score);
        const threshold = (config.gradeThresholds || DEFAULT_CONFIG.gradeThresholds)
            .find(row => cleanScore >= row.min) || DEFAULT_CONFIG.gradeThresholds[DEFAULT_CONFIG.gradeThresholds.length - 1];
        return { ...threshold, score: cleanScore };
    }

    function worseGrade(gradeA, gradeB) {
        const order = ['A', 'B', 'C', 'D', 'E'];
        const aIndex = order.indexOf(gradeA);
        const bIndex = order.indexOf(gradeB);
        if (aIndex === -1) return gradeB;
        if (bIndex === -1) return gradeA;
        return order[Math.max(aIndex, bIndex)];
    }

    function capScoreByGrade(score, maxGrade, config = DEFAULT_CONFIG) {
        const caps = config.gradeScoreCaps || DEFAULT_CONFIG.gradeScoreCaps;
        const cap = Number(caps[maxGrade]);
        if (!Number.isFinite(cap)) return roundScore(score);
        return roundScore(Math.min(score, cap));
    }

    function calculateWeightedPhysicalScore(items = [], itemsData = {}, config = DEFAULT_CONFIG) {
        const itemRows = [];
        let totalWeight = 0;
        let totalWeightedScore = 0;

        (items || []).forEach(item => {
            const itemId = getItemId(item);
            if (!itemId) return;

            const status = normalizeStatus(itemsData?.[itemId]);
            if (!status) return;

            const criticalLevel = normalizeCriticalLevel(item.critical_level ?? item.criticalLevel ?? item.priority);
            const weight = Number(config.criticalWeights?.[criticalLevel] ?? 1) || 1;
            const statusScore = Number(config.statusScores?.[status] ?? 0);
            const weightedScore = statusScore * weight;

            totalWeight += weight;
            totalWeightedScore += weightedScore;

            itemRows.push({
                id: itemId,
                name: getItemName(item),
                category: item.category || item.category_name || item.categoryName || '-',
                criticalLevel,
                weight,
                status,
                statusScore,
                weightedScore,
                detail: itemsData?.[itemId + '_data'] || {}
            });
        });

        return {
            score: totalWeight > 0 ? roundScore(totalWeightedScore / totalWeight) : 100,
            totalWeight,
            totalWeightedScore,
            itemRows
        };
    }

    function calculateCompletenessScore(labels = [], data = {}) {
        const rows = (labels || []).map(([key, label]) => ({
            key,
            label,
            available: Boolean(data?.[key])
        }));

        const total = rows.length;
        const available = rows.filter(row => row.available).length;

        return {
            score: total > 0 ? roundScore((available / total) * 100) : 100,
            total,
            available,
            missing: total - available,
            rows
        };
    }

    function countByStatusAndCritical(itemRows = []) {
        const counts = {
            total: itemRows.length,
            good: 0,
            warning: 0,
            bad: 0,
            lowBad: 0,
            mediumBad: 0,
            highBad: 0,
            criticalBad: 0,
            criticalWarning: 0,
            highWarning: 0,
            mediumWarning: 0
        };

        itemRows.forEach(row => {
            if (row.status === 'good') counts.good += 1;
            if (row.status === 'warning') counts.warning += 1;
            if (row.status === 'bad') counts.bad += 1;

            if (row.status === 'bad' && row.criticalLevel === 'low') counts.lowBad += 1;
            if (row.status === 'bad' && row.criticalLevel === 'medium') counts.mediumBad += 1;
            if (row.status === 'bad' && row.criticalLevel === 'high') counts.highBad += 1;
            if (row.status === 'bad' && row.criticalLevel === 'critical') counts.criticalBad += 1;

            if (row.status === 'warning' && row.criticalLevel === 'critical') counts.criticalWarning += 1;
            if (row.status === 'warning' && row.criticalLevel === 'high') counts.highWarning += 1;
            if (row.status === 'warning' && row.criticalLevel === 'medium') counts.mediumWarning += 1;
        });

        counts.badRatio = counts.total > 0 ? counts.bad / counts.total : 0;
        return counts;
    }

    function applyHardRules(rawScore, itemRows = [], documents = {}, config = DEFAULT_CONFIG) {
        const counts = countByStatusAndCritical(itemRows);
        const rules = [];
        let maxGrade = getGradeMeta(rawScore, config).grade;

        const criticalBadItems = itemRows.filter(row => row.status === 'bad' && row.criticalLevel === 'critical');
        const criticalWarningItems = itemRows.filter(row => row.status === 'warning' && row.criticalLevel === 'critical');
        const highBadItems = itemRows.filter(row => row.status === 'bad' && row.criticalLevel === 'high');
        const highMediumBadItems = itemRows.filter(row => row.status === 'bad' && ['high', 'medium'].includes(row.criticalLevel));

        if (criticalBadItems.length >= 1) {
            maxGrade = worseGrade(maxGrade, 'E');
            rules.push({
                type: 'critical_bad',
                maxGrade: 'E',
                severity: 'fatal',
                message: `Terdapat ${criticalBadItems.length} item kritis yang rusak.`,
                items: criticalBadItems.map(row => row.name)
            });
        }

        if (criticalWarningItems.length >= 1) {
            maxGrade = worseGrade(maxGrade, 'B');
            rules.push({
                type: 'critical_warning',
                maxGrade: 'B',
                severity: 'warning',
                message: `Terdapat ${criticalWarningItems.length} item kritis yang perlu perhatian.`,
                items: criticalWarningItems.map(row => row.name)
            });
        }

        if (highBadItems.length >= 2) {
            maxGrade = worseGrade(maxGrade, 'C');
            rules.push({
                type: 'multiple_high_bad',
                maxGrade: 'C',
                severity: 'warning',
                message: `Terdapat ${highBadItems.length} item penting/High yang rusak.`,
                items: highBadItems.map(row => row.name)
            });
        }

        if (highMediumBadItems.length >= 3) {
            maxGrade = worseGrade(maxGrade, 'D');
            rules.push({
                type: 'accumulated_high_medium_bad',
                maxGrade: 'D',
                severity: 'warning',
                message: `Terdapat ${highMediumBadItems.length} item Medium/High yang rusak.`,
                items: highMediumBadItems.map(row => row.name)
            });
        }

        if (counts.badRatio >= 0.40) {
            maxGrade = worseGrade(maxGrade, 'E');
            rules.push({
                type: 'too_many_bad_items',
                maxGrade: 'E',
                severity: 'fatal',
                message: `Lebih dari 40% item inspeksi berstatus rusak.`,
                items: []
            });
        } else if (counts.badRatio >= 0.25) {
            maxGrade = worseGrade(maxGrade, 'D');
            rules.push({
                type: 'many_bad_items',
                maxGrade: 'D',
                severity: 'warning',
                message: `Lebih dari 25% item inspeksi berstatus rusak.`,
                items: []
            });
        }

        if (documents && Object.prototype.hasOwnProperty.call(documents, 'doc_bpkb') && !documents.doc_bpkb) {
            maxGrade = worseGrade(maxGrade, 'D');
            rules.push({
                type: 'missing_bpkb',
                maxGrade: 'D',
                severity: 'warning',
                message: 'BPKB tidak tersedia, grade maksimal D.',
                items: ['BPKB']
            });
        }

        if (documents && Object.prototype.hasOwnProperty.call(documents, 'doc_stnk') && !documents.doc_stnk) {
            maxGrade = worseGrade(maxGrade, 'C');
            rules.push({
                type: 'missing_stnk',
                maxGrade: 'C',
                severity: 'warning',
                message: 'STNK tidak tersedia, grade maksimal C.',
                items: ['STNK']
            });
        }

        return {
            maxGrade,
            cappedScore: capScoreByGrade(rawScore, maxGrade, config),
            rules,
            counts
        };
    }

    function buildSummary(result) {
        const summary = [];
        const counts = result.counts || {};

        summary.push(`${counts.good || 0} item baik, ${counts.warning || 0} perlu perhatian, ${counts.bad || 0} rusak.`);

        if (result.hardRules?.length) {
            result.hardRules.slice(0, 3).forEach(rule => summary.push(rule.message));
        } else {
            summary.push('Tidak ada hard rule fatal yang aktif.');
        }

        return summary;
    }

    function evaluateInspection(input = {}, customConfig = {}) {
        const config = {
            ...DEFAULT_CONFIG,
            ...(customConfig || {}),
            criticalWeights: { ...DEFAULT_CONFIG.criticalWeights, ...(customConfig.criticalWeights || {}) },
            statusScores: { ...DEFAULT_CONFIG.statusScores, ...(customConfig.statusScores || {}) },
            finalWeights: { ...DEFAULT_CONFIG.finalWeights, ...(customConfig.finalWeights || {}) },
            gradeScoreCaps: { ...DEFAULT_CONFIG.gradeScoreCaps, ...(customConfig.gradeScoreCaps || {}) }
        };

        const items = input.items || input.sheetItems || [];
        const itemsData = input.itemsData || input.inspectionItemsData || {};
        const documentsData = input.documentsData || {};
        const accessoriesData = input.accessoriesData || {};

        const physical = calculateWeightedPhysicalScore(items, itemsData, config);
        const documents = calculateCompletenessScore(config.documentLabels, documentsData);
        const accessories = calculateCompletenessScore(config.accessoryLabels, accessoriesData);

        const rawScore = roundScore(
            (physical.score * config.finalWeights.physical) +
            (documents.score * config.finalWeights.documents) +
            (accessories.score * config.finalWeights.accessories)
        );

        const hardRuleResult = applyHardRules(rawScore, physical.itemRows, documentsData, config);
        const finalScore = hardRuleResult.cappedScore;
        const gradeMeta = getGradeMeta(finalScore, config);

        const result = {
            version: SCORE_ENGINE_VERSION,
            rawScore,
            finalScore,
            grade: gradeMeta.grade,
            gradeColor: gradeMeta.color,
            gradeLabel: gradeMeta.label,
            gradeDescription: gradeMeta.description,
            physicalScore: physical.score,
            documentScore: documents.score,
            accessoryScore: accessories.score,
            physical,
            documents,
            accessories,
            hardRules: hardRuleResult.rules,
            counts: hardRuleResult.counts,
            locked: hardRuleResult.rules.length > 0 && finalScore < rawScore,
            maxGradeAfterRules: hardRuleResult.maxGrade,
            summary: []
        };

        result.summary = buildSummary(result);
        return result;
    }

    function calculateValue(input = {}, customConfig = {}) {
        return evaluateInspection(input, customConfig).finalScore;
    }

    window.LianInspectionScore = {
        VERSION: SCORE_ENGINE_VERSION,
        DEFAULT_CONFIG,
        evaluateInspection,
        calculateValue,
        getGradeMeta,
        normalizeCriticalLevel,
        normalizeStatus,
        calculateWeightedPhysicalScore,
        calculateCompletenessScore
    };
})();
