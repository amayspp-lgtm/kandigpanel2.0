// main.js - Kode ini hanya untuk pengujian.

document.addEventListener('DOMContentLoaded', () => {
    console.log('Script main.js berhasil dimuat.');

    const createPanelForm = document.getElementById('createPanelForm');

    if (createPanelForm) {
        console.log('Formulir ditemukan. Menambahkan event listener...');
        createPanelForm.addEventListener('submit', (event) => {
            event.preventDefault();
            console.log('Formulir berhasil dicegah untuk dikirim. Ini berfungsi!');
            
            // Hapus kode di atas ini dan masukkan kembali kode asli Anda
            // jika tes ini berhasil.
        });
    } else {
        console.log('Error: Formulir dengan ID "createPanelForm" tidak ditemukan.');
    }
});
