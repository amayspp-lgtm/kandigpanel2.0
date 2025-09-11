// api/create-panel.js
// Ini adalah serverless function yang akan berjalan di Vercel

import fetch from 'node-fetch'; 

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: false, message: 'Method Not Allowed. Only GET is supported.' });
  }

  const { username, ram, disk, cpu, hostingPackage, panelType } = req.query;

  if (!username || !ram || !disk || !cpu || !panelType || !hostingPackage) {
    return res.status(400).json({ status: false, message: 'Missing required parameters.' });
  }

  const PUBLIC_PANEL_DOMAIN = process.env.VITE_PUBLIC_PANEL_DOMAIN; 
  const PUBLIC_PANEL_PTLA = process.env.VITE_PUBLIC_PANEL_PTLA;
  const PUBLIC_PANEL_PTLC = process.env.VITE_PUBLIC_PANEL_PTLC;
  const PUBLIC_PANEL_EGG_ID = process.env.VITE_PUBLIC_PANEL_EGG_ID;
  const PUBLIC_PANEL_NEST_ID = process.env.VITE_PUBLIC_PANEL_NEST_ID;
  const PUBLIC_PANEL_LOC = process.env.VITE_PUBLIC_PANEL_LOC;

  const PRIVATE_PANEL_DOMAIN = process.env.VITE_PRIVATE_PANEL_DOMAIN;
  const PRIVATE_PANEL_PTLA = process.env.VITE_PRIVATE_PANEL_PTLA;
  const PRIVATE_PANEL_PTLC = process.env.VITE_PRIVATE_PANEL_PTLC;
  const PRIVATE_PANEL_EGG_ID = process.env.VITE_PRIVATE_PANEL_EGG_ID;
  const PRIVATE_PANEL_NEST_ID = process.env.VITE_PRIVATE_PANEL_NEST_ID;
  const PRIVATE_PANEL_LOC = process.env.VITE_PRIVATE_PANEL_LOC;

  const BASE_URL_PTERODACTYL_API_TEMPLATE = process.env.VITE_BASE_URL_PTERODACTYL_API;

  let currentPanelConfig;
  if (panelType === 'public') {
    currentPanelConfig = {
      domain: PUBLIC_PANEL_DOMAIN,
      ptla: PUBLIC_PANEL_PTLA,
      ptlc: PUBLIC_PANEL_PTLC,
      eggId: PUBLIC_PANEL_EGG_ID,
      nestId: PUBLIC_PANEL_NEST_ID,
      loc: PUBLIC_PANEL_LOC
    };
  } else if (panelType === 'private') {
    currentPanelConfig = {
      domain: PRIVATE_PANEL_DOMAIN,
      ptla: PRIVATE_PANEL_PTLA,
      ptlc: PRIVATE_PANEL_PTLC,
      eggId: PRIVATE_PANEL_EGG_ID,
      nestId: PRIVATE_PANEL_NEST_ID,
      loc: PRIVATE_PANEL_LOC
    };
  } else {
    return res.status(400).json({ status: false, message: 'Invalid panel type provided.' });
  }

  const finalPteroApiUrl = BASE_URL_PTERODACTYL_API_TEMPLATE
    .replace('username=', `username=${encodeURIComponent(username)}`)
    .replace('ram=', `ram=${ram}`)
    .replace('disk=', `disk=${disk}`)
    .replace('cpu=', `cpu=${cpu}`)
    .replace('eggid=', `eggid=${currentPanelConfig.eggId}`)
    .replace('nestid=', `nestid=${currentPanelConfig.nestId}`)
    .replace('loc=', `loc=${currentPanelConfig.loc}`)
    .replace('domain=', `domain=${encodeURIComponent(currentPanelConfig.domain)}`)
    .replace('ptla=', `ptla=${currentPanelConfig.ptla}`) 
    .replace('ptlc=', `ptlc=${currentPanelConfig.ptlc}`); 

  try {
    const apiResponse = await fetch(finalPteroApiUrl);
    const apiData = await apiResponse.json();

    if (apiResponse.ok && apiData.status) {
      // --- Kirim Notifikasi Telegram setelah panel berhasil dibuat ---
      const notificationMessage = `
✅ **Panel Baru Dibuat!**
------------------------------
👤 Username: <b>${apiData.result.username}</b>
🔑 Password: <b>${apiData.result.password}</b>
📦 Paket: <b>${hostingPackage.toUpperCase()}</b>
⚙️ Tipe Panel: <b>${panelType.toUpperCase()}</b>
🔗 Domain: ${apiData.result.domain}
------------------------------
ID User: ${apiData.result.id_user}
Server ID: ${apiData.result.id_server}
`;
      
      // Panggil Serverless Function Notifikasi Telegram
      // Menggunakan URL lokal karena ini panggilan antar Serverless Function di Vercel
      await fetch('http://localhost:3000/api/send-telegram-notification', { // Ganti URL ini untuk produksi di Vercel
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: notificationMessage }),
      })
      .then(notifRes => notifRes.json())
      .then(notifData => {
          if (!notifData.success) {
              console.warn('Failed to send Telegram notification:', notifData.message);
          }
      })
      .catch(notifError => {
          console.error('Error calling Telegram notification API:', notifError);
      });
      // --- Akhir Notifikasi Telegram ---

      res.status(200).json(apiData);
    } else {
      res.status(apiResponse.status || 500).json(apiData || { status: false, message: 'Failed to create server via external API.' });
    }
  } catch (error) {
    console.error('Error in Vercel Serverless Function:', error);
    res.status(500).json({ status: false, message: `Internal Server Error: ${error.message}` });
  }
}