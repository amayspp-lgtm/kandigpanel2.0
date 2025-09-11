// src/main.js

document.addEventListener('DOMContentLoaded', () => {
    // --- KONFIGURASI PENTING UNTUK CLIENT-SIDE (tidak sensitif) ---
    const YOUR_VALIDATION_API_ENDPOINT = '/api/validate-access-key'; 
    const YOUR_CREATE_PANEL_API_ENDPOINT = '/api/create-panel';
    
    const PACKAGES = {
        "1gb": { ram: 1024, disk: 1024, cpu: 100, name: "1 GB" },
        "2gb": { ram: 2048, disk: 2048, cpu: 100, name: "2 GB" },
        "3gb": { ram: 3072, disk: 3072, cpu: 100, name: "3 GB" },
        "4gb": { ram: 4096, disk: 4096, cpu: 100, name: "4 GB" },
        "5gb": { ram: 5120, disk: 5120, cpu: 100, name: "5 GB" },
        "6gb": { ram: 6144, disk: 6144, cpu: 100, name: "6 GB" },
        "7gb": { ram: 7168, disk: 7168, cpu: 100, name: "7 GB" },
        "8gb": { ram: 8192, disk: 8192, cpu: 150, name: "8 GB" },
        "9gb": { ram: 9216, disk: 9216, cpu: 150, name: "9 GB" },
        "10gb": { ram: 10240, disk: 10240, cpu: 200, name: "10 GB" },
        "unlimited": { ram: 0, disk: 0, cpu: 0, name: "Unlimited" }
    };
    // --- AKHIR KONFIGURASI CLIENT-SIDE ---


    const createPanelForm = document.getElementById('createPanelForm');
    const createButton = document.getElementById('createButton');
    const createButtonText = createButton.querySelector('span:first-child');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const responseMessageDiv = document.getElementById('responseMessage');
    const toastContainer = document.getElementById('toast-notification-container');
    const panelTypeSelect = document.getElementById('panelType');
    const logoContainer = document.getElementById('logo-container');

    const banPopupOverlay = document.getElementById('ban-popup-overlay');
    const banPopupTitle = document.getElementById('popup-title');
    const banPopupStatus = document.getElementById('popup-status');
    const banPopupReason = document.getElementById('popup-reason');
    const banPopupUntil = document.getElementById('popup-until');
    const closePopupBtn = document.getElementById('close-popup-btn');

    // Fungsi untuk memuat logo kustom
    const CUSTOM_LOGO_URL = ''; // Opsional: Atur URL logo kustom Anda di sini
    function loadCustomLogo() {
        if (CUSTOM_LOGO_URL) {
            logoContainer.innerHTML = `<img src="${CUSTOM_LOGO_URL}" alt="Custom Logo" class="custom-logo">`;
        } else {
            logoContainer.innerHTML = '<i class="fas fa-microchip icon-logo"></i>';
        }
    }

    function showMainMessage(type, messageHTML) {
        responseMessageDiv.style.display = 'block';
        responseMessageDiv.className = `response-message ${type}`; 
        responseMessageDiv.innerHTML = messageHTML;
    }

    function hideMainMessage() {
        responseMessageDiv.style.display = 'none';
        responseMessageDiv.className = `response-message`;
        responseMessageDiv.innerHTML = '';
    }

    function showToast(type, message, duration = 3000) {
        const toast = document.createElement('div');
        toast.classList.add('toast-notification', type); 

        let icon = '';
        if (type === 'success') icon = '<i class="fas fa-check-circle"></i>';
        else if (type === 'error') icon = '<i class="fas fa-times-circle"></i>';
        else if (type === 'info') icon = '<i class="fas fa-info-circle"></i>';

        toast.innerHTML = `
            <span class="icon">${icon}</span>
            <span class="message">${message}</span>
            <button class="close-btn">&times;</button>
        `;

        toast.querySelector('.close-btn').addEventListener('click', () => {
            toast.remove();
        });

        toastContainer.appendChild(toast);
        void toast.offsetWidth;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, duration);
    }
    
    function showBanPopup(details) {
        banPopupTitle.textContent = details.status === 'Suspended' ? 'Access Key Ditangguhkan' : 'Access Key Diban';
        banPopupStatus.textContent = details.status;
        banPopupReason.textContent = details.reason;
        
        if (details.suspensionUntil && details.suspensionUntil !== 'Permanen') {
            const date = new Date(details.suspensionUntil);
            banPopupUntil.textContent = date.toLocaleString();
        } else {
            banPopupUntil.textContent = 'Permanen';
        }

        banPopupOverlay.classList.remove('hidden');
        banPopupOverlay.classList.add('show');
    }

    closePopupBtn.addEventListener('click', () => {
        banPopupOverlay.classList.remove('show');
        banPopupOverlay.classList.add('hidden');
    });

    loadCustomLogo(); 

    createPanelForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        createButton.disabled = true;
        createButton.classList.add('loading');
        createButtonText.textContent = 'MEMBUAT PANEL';
        loadingSpinner.style.display = 'flex';

        hideMainMessage();

        const accessKey = document.getElementById('accessKey').value;
        const selectedPanelType = panelTypeSelect.value;
        const username = document.getElementById('username').value;
        const hostingPackage = document.getElementById('hostingPackage').value;

        try {
            const validateUrl = `${YOUR_VALIDATION_API_ENDPOINT}?accessKey=${encodeURIComponent(accessKey)}`;
            const validationResponse = await fetch(validateUrl, { method: 'GET' });
            const validationData = await validationResponse.json();

            if (!validationData.isValid) {
                if (validationData.details) {
                    showBanPopup(validationData.details);
                } else {
                    showToast('error', validationData.message);
                }
                return;
            }
        } catch (error) {
            console.error('Error saat validasi Access Key:', error);
            showToast('error', 'Terjadi masalah saat memvalidasi Access Key. Coba lagi nanti.');
            return;
        }

        if (!selectedPanelType) {
            showToast('error', 'Silakan pilih tipe panel (Public/Private)!');
            return;
        }

        if (!username || !hostingPackage) {
            showToast('error', 'Username dan Paket Hosting harus diisi!');
            return;
        }

        const usernameInput = document.getElementById('username');
        if (!usernameInput.checkValidity()) {
            showToast('error', `Username tidak valid: ${usernameInput.title}`);
            return;
        }

        const selectedPackage = PACKAGES[hostingPackage];
        if (!selectedPackage) {
            showToast('error', 'Pilih paket hosting yang valid.');
            return;
        }

        const { ram, disk, cpu } = selectedPackage;
        
        const requestParams = new URLSearchParams({
            username: username,
            ram: ram,
            disk: disk,
            cpu: cpu,
            hostingPackage: hostingPackage, 
            panelType: selectedPanelType, 
            accessKey: accessKey,
        }).toString();

        const finalRequestUrl = `${YOUR_CREATE_PANEL_API_ENDPOINT}?${requestParams}`;

        try {
            const response = await fetch(finalRequestUrl, {
                method: 'GET',
            });

            const data = await response.json();

            if (response.ok && data.status) {
                const result = data.result;
                const panelDomainUrl = result.domain; 

                const fullTextToCopy = `
==============================
   DETAIL AKUN PANEL ANDA   
==============================
Username: ${result.username}
Password: ${result.password}
Paket: ${selectedPackage.name}
Tipe Panel: ${selectedPanelType.toUpperCase()}
ID User: ${result.id_user}
Server ID: ${result.id_server}
Domain: ${panelDomainUrl}
==============================
`.trim();

                const successMessageHTML = `
                    <div class="result-title">Panel Berhasil Dibuat!</div>
                    <div class="result-row"><span>Username:</span> <span id="copyUsernameValue">${result.username}</span></div>
                    <div class="result-row"><span>Password:</span> <span id="copyPasswordValue">${result.password}</span></div>
                    <div class="result-row"><span>Paket:</span> <span>${selectedPackage.name}</span></div>
                    <div class="result-row"><span>Tipe Panel:</span> <span>${selectedPanelType.toUpperCase()}</span></div>
                    <div class="result-row"><span>ID User:</span> <span>${result.id_user}</span></div>
                    <div class="result-row"><span>Server ID:</span> <span>${result.id_server}</span></div>
                    <div class="result-row"><span>Domain:</span> <span id="copyDomainValue"><a href="${panelDomainUrl}" target="_blank">${result.domain}</a></span></div>
                    
                    <div class="result-actions">
                        <button class="copy-button" data-copy-target="copyUsernameValue">Copy Username</button>
                        <button class="copy-button" data-copy-target="copyPasswordValue">Copy Password</button>
                        <button class="copy-button" data-copy-target="copyDomainValue">Copy Domain</button>
                        <button class="login-panel-button" onclick="window.open('${panelDomainUrl}', '_blank')">Login Panel</button>
                        <button class="copy-all-button" data-copy-value="${fullTextToCopy}">Copy All Details</button>
                    </div>
                    <p class="contact-message">
                        Jika tidak bisa login, silakan hubungi <a href="#">Admin</a>
                    </p>
                `;
                showMainMessage('success', successMessageHTML); 
                createPanelForm.reset(); 
                showToast('success', 'Panel berhasil dibuat!'); 

            } else {
                const errorMessage = data.message || 'Terjadi kesalahan saat membuat panel.';
                showMainMessage('error', `<b>Gagal membuat server!</b><br>Pesan: ${errorMessage}`); 
                showToast('error', 'Gagal membuat panel!'); 
            }
        } catch (error) {
            console.error('Error saat menghubungi Serverless Function Create Panel:', error);
            showMainMessage('error', `Terjadi kesalahan jaringan atau server tidak merespons: ${error.message}.`); 
            showToast('error', 'Kesalahan koneksi Serverless API (Create Panel)!'); 
        } finally {
            createButton.disabled = false;
            createButton.classList.remove('loading');
            createButtonText.textContent = 'CREATE PANEL';
            loadingSpinner.style.display = 'none';
        }
    });

    responseMessageDiv.addEventListener('click', async (event) => {
        if (event.target.classList.contains('copy-button')) {
            const targetId = event.target.dataset.copyTarget;
            const textToCopy = document.getElementById(targetId).textContent;
            
            if (textToCopy) {
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    showToast('info', `Disalin: ${textToCopy.substring(0, Math.min(25, textToCopy.length))}...`); 
                    event.target.textContent = 'Copied!';
                    setTimeout(() => {
                        if (targetId === 'copyUsernameValue') event.target.textContent = 'Copy Username';
                        else if (targetId === 'copyPasswordValue') event.target.textContent = 'Copy Password';
                        else if (targetId === 'copyDomainValue') event.target.textContent = 'Copy Domain';
                    }, 1500);
                } catch (err) {
                    console.error('Failed to copy text:', err);
                    showToast('error', 'Gagal menyalin!');
                }
            }
        } else if (event.target.classList.contains('copy-all-button')) { 
            const textToCopy = event.target.dataset.copyValue;
             if (textToCopy) {
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    showToast('info', 'Semua detail berhasil disalin!'); 
                    event.target.textContent = 'All Copied!';
                    setTimeout(() => {
                        event.target.textContent = 'Copy All Details';
                    }, 1500);
                } catch (err) {
                    console.error('Failed to copy all text:', err);
                    showToast('error', 'Gagal menyalin semua!');
                }
            }
        }
    });
});