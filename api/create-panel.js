// api/create-panel.js

import fetch from 'node-fetch';
import { connectToDatabase } from '../utils/db.js';

// Daftar pesan kesalahan yang bervariasi
const errorMessages = [
    'Sistem sedang sibuk. Silakan coba lagi nanti.',
    'Terlalu banyak permintaan dalam waktu singkat. Coba lagi setelah beberapa saat.',
    'Terjadi kesalahan saat membuat panel. Silakan coba lagi nanti.',
    'Permintaan Anda tidak dapat diproses saat ini. Mohon tunggu dan coba lagi.',
    'Penggunaan berlebihan terdeteksi. Silakan gunakan Access Key Anda dengan wajar.'
];

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

  if (!username || !ram || !disk || !cpu || !panelType || !hostingPackage || !accessKey) {
    return res.status(400).json({ status: false, message: 'Missing required parameters.' });
  }

  // Koneksi database
  const db = await connectToDatabase();
  const accessKeyCollection = db.collection('accessKeys');
  const configCollection = db.collection('panelConfigs');

  const userIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  // --- LOGIKA UTAMA: Pengecekan Status Ban pada Access Key ---
  let foundKey;
  try {
    foundKey = await accessKeyCollection.findOne({ key: accessKey });

    if (!foundKey) {
      return res.status(403).json({ status: false, message: 'Access Key tidak ditemukan.' });
    }

    // Periksa status ban Access Key
    if (foundKey.isBanned) {
        const isPermanent = foundKey.banDetails.isPermanent;
        const isExpired = !isPermanent && foundKey.banDetails.expiresAt && foundKey.banDetails.expiresAt < new Date();

        if (!isExpired) {
            // Access Key diban, kirim respons dengan detail ban
            const responseData = {
                status: false,
                message: 'Access Key Anda telah diblokir.',
                banDetails: {
                    reason: foundKey.banDetails.reason,
                    bannedAt: foundKey.banDetails.bannedAt.toISOString(),
                    isPermanent: isPermanent,
                    expiresAt: isPermanent ? 'Permanen' : foundKey.banDetails.expiresAt.toISOString()
                }
            };
            return res.status(403).json(responseData);
        } else {
            // Hapus ban yang sudah kedaluwarsa
            await accessKeyCollection.updateOne(
                { key: accessKey },
                { $set: { isBanned: false }, $unset: { banDetails: "" } }
            );
        }
    }
    
    // Periksa status aktif
    if (!foundKey.isActive) {
      return res.status(403).json({ status: false, message: 'Access Key tidak aktif.' });
    }

    // Periksa batasan panel
    const restriction = foundKey.panelTypeRestriction || 'both';
    const requestedPanelTypeLower = panelType.toLowerCase();

    if (restriction === 'public' && requestedPanelTypeLower === 'private') {
      return res.status(403).json({ status: false, message: 'Access Key ini hanya diizinkan untuk membuat panel publik.' });
    }
    if (restriction === 'private' && requestedPanelTypeLower === 'public') {
      return res.status(403).json({ status: false, message: 'Access Key ini hanya diizinkan untuk membuat panel privat.' });
    }
    
  } catch (dbError) {
    console.error('Error validating access key:', dbError);
    return res.status(500).json({ status: false, message: 'Internal server error during Access Key validation.' });
  }
  
  // --- Akhir Logika Pengecekan Ban ---


  // --- Logika Pencegahan Acak ---
  const currentTime = new Date();
  const recentUsageThreshold = 3; // Batasan: 3 panel dalam 10 menit
  const sessionTimeoutMin = 5 * 60 * 1000; // Minimal 5 menit
  const sessionTimeoutMax = 15 * 60 * 1000; // Maksimal 15 menit

  let lastErrorTimestamp = foundKey.lastErrorTimestamp || null;
  let lastErrorMessage = foundKey.lastErrorMessage || null;
  let sessionTimeout = foundKey.sessionTimeout || 0;

  // Cek apakah masih dalam sesi penolakan yang sama
  if (lastErrorTimestamp && (currentTime.getTime() - lastErrorTimestamp.getTime() < sessionTimeout)) {
      console.log(`Pencegahan aktif: Mengembalikan pesan kesalahan yang sama untuk Access Key ${accessKey}.`);
      return res.status(429).json({ status: false, message: lastErrorMessage });
  }

  // Hitung jumlah penggunaan dalam 10 menit terakhir
  const tenMinutesAgo = new Date(currentTime.getTime() - 10 * 60 * 1000);
  const recentUsageCount = foundKey.usageTimestamps ? foundKey.usageTimestamps.filter(ts => ts.getTime() > tenMinutesAgo.getTime()).length : 0;
  
  // Lakukan pengecekan pencegahan acak
  if (recentUsageCount >= recentUsageThreshold) {
      const randomProbability = Math.random();
      const rejectionProbability = 0.7; // 70% kemungkinan ditolak jika melewati ambang batas
      
      if (randomProbability < rejectionProbability) {
          // Pilih pesan kesalahan acak
          const randomErrorIndex = Math.floor(Math.random() * errorMessages.length);
          const selectedErrorMessage = errorMessages[randomErrorIndex];
          
          // Tentukan waktu timeout acak
          const randomTimeout = Math.floor(Math.random() * (sessionTimeoutMax - sessionTimeoutMin)) + sessionTimeoutMin;
          
          // Simpan pesan kesalahan dan timestamp ke database
          await accessKeyCollection.updateOne(
              { key: accessKey },
              { 
                $set: { 
                  lastErrorTimestamp: currentTime, 
                  lastErrorMessage: selectedErrorMessage,
                  sessionTimeout: randomTimeout
                } 
              }
          );

          console.log(`Pencegahan acak aktif: Menolak permintaan dari Access Key ${accessKey} dengan pesan: "${selectedErrorMessage}".`);
          return res.status(429).json({ status: false, message: selectedErrorMessage });
      }
  }

  // --- Akhir Logika Pencegahan Acak ---

  // Update usageCount dan usageTimestamps
  await accessKeyCollection.updateOne(
      { key: accessKey },
      { 
          $inc: { usageCount: 1 }, 
          $push: { 
              usageTimestamps: { 
                  $each: [currentTime], 
                  $slice: -20
              } 
          },
          $unset: { lastErrorTimestamp: "", lastErrorMessage: "", sessionTimeout: "" } // Hapus data sesi penolakan
      }
  );

  // Ambil konfigurasi dari database
  let currentPanelConfig;
  try {
    currentPanelConfig = await configCollection.findOne({ panelType: panelType.toLowerCase() });

    if (!currentPanelConfig) {
      return res.status(404).json({ status: false, message: `Konfigurasi untuk tipe panel '${panelType}' tidak ditemukan di database.` });
    }
  } catch (configError) {
    console.error('Error fetching panel configuration from database:', configError);
    return res.status(500).json({ status: false, message: 'Internal server error: Failed to load panel configuration.' });
  }

  const finalPteroApiUrl = BASE_URL_PTERODACTYL_API_TEMPLATE
    .replace('username=', `username=${encodeURIComponent(username)}`)
    .replace('ram=', `ram=${ram}`)
    .replace('disk=', `disk=${disk}`)
    .replace('cpu=', `cpu=${cpu}`)
    .replace('eggid=', `eggid=${currentPanelConfig.egg_id}`)
    .replace('nestid=', `nestid=${currentPanelConfig.nest_id}`)
    .replace('loc=', `loc=${currentPanelConfig.loc}`)
    .replace('domain=', `domain=${encodeURIComponent(currentPanelConfig.domain)}`)
    .replace('ptla=', `ptla=${currentPanelConfig.ptla}`)
    .replace('ptlc=', `ptlc=${currentPanelConfig.ptlc}`);

  try {
    const apiResponse = await fetch(finalPteroApiUrl);
    const apiData = await apiResponse.json();

    if (apiResponse.ok && apiData.status) {
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
<b>IP Pengguna:</b> <code>${userIp}</code>
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

      res.status(200).json(apiData);
    } else {
      res.status(apiResponse.status || 500).json(apiData || { status: false, message: 'Failed to create server via external API.' });
    }
  } catch (error) {
    console.error('Error in Vercel Serverless Function:', error);
    res.status(500).json({ status: false, message: `Internal Server Error: ${error.message}` });
  }
}