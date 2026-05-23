      function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            const toastMsg = document.getElementById('toastMessage');
            toastMsg.textContent = message;
            if (type === 'error') {
                toast.classList.remove('bg-green-600');
                toast.classList.add('bg-red-600');
            } else {
                toast.classList.remove('bg-red-600');
                toast.classList.add('bg-green-600');
            }
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 3000);
        }

        function setButtonLoading(button, isLoading, originalText = null) {
            if (isLoading) {
                button.disabled = true;
                const currentText = button.textContent;
                button.dataset.originalText = button.dataset.originalText || currentText;
                button.innerHTML = `<div class="spinner"></div> <span>Memproses...</span>`;
            } else {
                button.disabled = false;
                button.innerHTML = button.dataset.originalText || originalText || button.textContent;
            }
        }

        function switchView(viewId) {
    document.querySelectorAll('[id$="View"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');

    // 🔥 WAJIB: trigger render saat buka history
    if (viewId === 'historyView') {
        renderInspectionHistory();
    }

    closeSidebar();
}


		 
        function closeSidebar() {
            document.getElementById('sidebar').classList.add('-translate-x-full');
            document.getElementById('sidebarOverlay').classList.add('hidden');
        }

        function openSidebar() {
            document.getElementById('sidebar').classList.remove('-translate-x-full');
            document.getElementById('sidebarOverlay').classList.remove('hidden');
        }
