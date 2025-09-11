// api/create-panel.js

import fetch from 'node-fetch'; 
import { connectToDatabase } from '../utils/db.js'; // Pastikan ada .js

// Fungsi Helper untuk Escape HTML
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, function(tag) {
    var charsToReplace = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return charsToReplace[tag] || tag;
  });
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

const VERCEL_BASE_URL = process.env.VERCEL_BASE_URL; 
if (!VERCEL_BASE_URL || !VERCEL_BASE_URL.startsWith('http')) {
    console.error("VERCEL_BASE_URL environment variable is missing or invalid in create-panel.js. Please set it in Vercel Dashboard (e.g., https://your-project.vercel.app)");
}


export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: false, message: 'Method Not Allowed. Only GET is supported.' });
  }

  const { username, ram, disk, cpu, hostingPackage, panelType, accessKey } = req.query;

  if (!username || !ram || !disk || !cpu || !panelType || !hostingPackage || !accessKey) { // <-- accessKey sekarang wajib
    return res.status(400).json({ status: false, message: 'Missing required parameters.' });
  }

  // --- Validasi Access Key dan Batasan Panel ---
  try {
    const db = await connectToDatabase();
    const collection = db.collection('accessKeys');
    const foundKey = await collection.findOne({ key: accessKey });

    if (!foundKey || !foundKey.isActive) {
      return res.status(403).json({ status: false, message: 'Invalid or inactive Access Key.' });
    }

    // Periksa batasan panel
    const restriction = foundKey.panelTypeRestriction || 'both'; // Default ke 'both' jika tidak ada
    const requestedPanelTypeLower = panelType.toLowerCase();

    if (restriction === 'public' && requestedPanelTypeLower === 'private') {
      return res.status(403).json({ status: false, message: 'Access Key ini hanya diizinkan untuk membuat panel publik.' });
    }
    if (restriction === 'private' && requestedPanelTypeLower === 'public') {
      return res.status(403).json({ status: false, message: 'Access Key ini hanya diizinkan untuk membuat panel privat.' });
    }
    // Jika restriction 'both', maka tidak perlu validasi tambahan

    // Update usageCount
    await collection.updateOne(
      { key: accessKey },
      { $inc: { usageCount: 1 } }
    );

  } catch (dbError) {
    console.error('Error validating access key or updating usage count:', dbError);
    return res.status(500).json({ status: false, message: 'Internal server error during Access Key validation.' });
  }
  // --- Akhir Validasi Access Key dan Batasan Panel ---


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
      const accessKeyUsed = escapeHTML(accessKey || 'Tidak Diketahui'); 
      const escapedUsername = escapeHTML(apiData.result.username);
      const escapedPassword = escapeHTML(apiData.result.password);
      const escapedDomain = escapeHTML(apiData.result.domain);

      const notificationMessage = `
✅ <b>Panel Baru Dibuat!</b>
------------------------------
👤 Username: <b>${escapedUsername}</b>
🔑 Password: <b>${escapedPassword}</b>
📦 Paket: <b>${hostingPackage.toUpperCase()}</b>
⚙️ Tipe Panel: <b>${panelType.toUpperCase()}</b>
🔗 Domain: ${escapedDomain}
------------------------------
<b>Access Key Digunakan:</b> <code>${accessKeyUsed}</code>
ID User: ${apiData.result.id_user}
Server ID: ${apiData.result.id_server}
`;
      
      await fetch(`${VERCEL_BASE_URL}/api/send-telegram-notification`, { 
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
          } else {
              console.log('Telegram notification sent successfully.');
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