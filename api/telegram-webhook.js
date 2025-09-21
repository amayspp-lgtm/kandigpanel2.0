// api/telegram-webhook.js

import fetch from 'node-fetch';
import { connectToDatabase } from '../utils/db.js';

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

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS;
const VERCEL_BASE_URL = process.env.VERCEL_BASE_URL;

if (!VERCEL_BASE_URL || !VERCEL_BASE_URL.startsWith('http')) {
    console.error("VERCEL_BASE_URL environment variable is missing or invalid. Please set it in Vercel Dashboard (e.g., https://your-project.vercel.app)");
}

const AUTHORIZED_ADMIN_IDS = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

export default async function handler(req, res) {
  console.log(`[Webhook] Received ${req.method} request.`);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Only POST is supported.' });
  }

  const { message } = req.body;

  if (!message || !message.text) {
    console.log("[Webhook] No message text or invalid update. Ignoring.");
    return res.status(200).json({ success: true, message: 'No message text or invalid update.' });
  }

  const chatId = message.chat.id;
  const text = message.text;
  const fromId = message.from.id;

  if (!AUTHORIZED_ADMIN_IDS.includes(fromId.toString()) && !AUTHORIZED_ADMIN_IDS.includes(chatId.toString())) {
    console.warn(`[Webhook] Unauthorized access attempt from chatId: ${chatId} (fromId: ${fromId}), text: ${text}`);
    await sendTelegramMessage(chatId, 'Maaf, Anda tidak memiliki izin untuk menggunakan bot ini.');
    return res.status(200).json({ success: false, message: 'Unauthorized user.' });
  }

  console.log(`[Webhook] Processing command from authorized user (${chatId}): ${text}`);

  let responseMessage = 'Perintah tidak dikenal.'; 

  if (text === '/start') {
    responseMessage = `
👋 Halo, Owner! Selamat datang di bot Panel Creator.
------------------------------------------------
Berikut adalah daftar perintah yang bisa Anda gunakan:

🔑 <b>Manajemen Access Key:</b>
• <code>/addkey [key_opsional] [public|private|both]</code>
  - Menambahkan Access Key baru. Jika <code>[key_opsional]</code> tidak diberikan, akan di-generate otomatis.
  - <code>[public|private|both]</code>: Batasan tipe panel untuk key ini (default: both).
  - Contoh: <code>/addkey</code>
  - Contoh: <code>/addkey myCustomKey private</code>
  - Contoh: <code>/addkey public</code>

• <code>/listkeys</code>
  - Menampilkan semua Access Key yang terdaftar beserta status dan batasannya.

• <code>/removekey [key_yang_ingin_dihapus]</code>
  - Menghapus Access Key tertentu dari database.
  - Contoh: <code>/removekey myCustomKey</code>

⚙️ <b>Manajemen Konfigurasi Panel:</b>
• <code>/setconfig &lt;tipe_panel&gt; &lt;konfigurasi&gt; &lt;nilai_baru&gt;</code>
  - Mengubah konfigurasi panel (PTLA, PTLC, domain, egg_id, nest_id, loc).
  - <code>&lt;tipe_panel&gt;</code>: public atau private
  - <code>&lt;konfigurasi&gt;</code>: ptla, ptlc, domain, egg_id, nest_id, atau loc
  - Contoh: <code>/setconfig public ptla my_new_ptla_key</code>

🛡️ <b>Manajemen Ban Access Key:</b>
• <code>/ban &lt;key&gt; &lt;durasi&gt; &lt;alasan&gt;</code>
  - Ban Access Key untuk durasi tertentu (1h, 1d, 1w) atau permanen (permanent).
  - Contoh: <code>/ban myCustomKey 1d spam</code>
  - Contoh: <code>/ban myCustomKey permanent spam</code>
• <code>/unban &lt;key&gt;</code>
  - Hapus ban dari Access Key.
  - Contoh: <code>/unban myCustomKey</code>
`;
  } else if (text.startsWith('/addkey')) {
    const args = text.substring('/addkey'.length).trim().split(/\s+/).filter(arg => arg !== '');
    let customKey = undefined;
    let panelTypeRestriction = 'both';

    if (args.length > 0) {
        const lastArg = args[args.length - 1].toLowerCase();
        const validRestrictions = ['public', 'private', 'both'];
        if (validRestrictions.includes(lastArg)) {
            panelTypeRestriction = lastArg;
            if (args.length > 1) {
                customKey = args.slice(0, args.length - 1).join(' ');
            }
        } else {
            customKey = args.join(' ');
        }
    }
    
    if (typeof customKey === 'string' && customKey.trim() === '') {
        customKey = undefined;
    }

    try {
      console.log(`[Webhook] Calling /api/manage-access-keys (POST) for /addkey. Key: ${customKey || 'random'}, Restriction: ${panelTypeRestriction}`);
      const addKeyResponse = await fetch(`${VERCEL_BASE_URL}/api/manage-access-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'addkey',
            key: customKey,
            createdByTelegramId: fromId.toString(),
            panelTypeRestriction: panelTypeRestriction
        }),
      });
      const addKeyData = await addKeyResponse.json();

      if (addKeyData.success) {
        responseMessage = `
✅ <b>Access Key Berhasil Dibuat!</b>
------------------------------------
🔑 Key: <code>${escapeHTML(addKeyData.key)}</code>
⚙️ Batasan Panel: <b>${escapeHTML(addKeyData.panelTypeRestriction || 'both')}</b>
------------------------------------
`;
      } else {
        responseMessage = `❌ Gagal menambahkan Access Key: ${escapeHTML(addKeyData.message || 'Respons API tidak sukses')}`;
        console.error("[Webhook] Add Key API returned error:", addKeyData);
      }
    } catch (error) {
      console.error('[Webhook] Error calling add-key API:', error);
      responseMessage = `Terjadi kesalahan internal saat menambahkan Access Key: ${escapeHTML(error.message)}`;
    }
  } else if (text.startsWith('/listkeys')) {
    try {
      console.log("[Webhook] Calling /api/manage-access-keys (GET) for /listkeys.");
      const listKeysResponse = await fetch(`${VERCEL_BASE_URL}/api/manage-access-keys?requestedByTelegramId=${fromId.toString()}`, {
        method: 'GET',
      });
      const listKeysData = await listKeysResponse.json();

      if (listKeysData.success && listKeysData.keys.length > 0) {
        responseMessage = '🔑 <b>Daftar Access Keys:</b>\n------------------------------------\n';
        listKeysData.keys.forEach((k, index) => {
          responseMessage += `<b>${index + 1}.</b> <code>${escapeHTML(k.key)}</code>\n`;
          responseMessage += `   Status: <b>${k.isActive ? 'Aktif ✅' : 'Nonaktif ❌'}</b>\n`;
          responseMessage += `   Ban: <b>${k.isBanned ? 'Terban 🚫' : 'Aman ✅'}</b>\n`;
          responseMessage += `   Batasan: <b>${escapeHTML(k.panelTypeRestriction || 'both')}</b>\n`;
          responseMessage += `   Dibuat: ${escapeHTML(k.createdAt.split('T')[0])}\n`;
          responseMessage += `   Digunakan: ${k.usageCount} kali\n`;
          if (index < listKeysData.keys.length - 1) {
            responseMessage += `------------------------------------\n`;
          }
        });
        responseMessage += `------------------------------------`;
      } else if (listKeysData.success && listKeysData.keys.length === 0) {
        responseMessage = 'Tidak ada Access Key yang terdaftar. Gunakan /addkey untuk membuat yang baru.';
      } else {
        responseMessage = `❌ Gagal mengambil daftar Access Key: ${escapeHTML(listKeysData.message || 'Respons API tidak sukses')}`;
        console.error("[Webhook] List Keys API returned error:", listKeysData);
      }
    } catch (error) {
      console.error('[Webhook] Error calling list-keys API:', error);
      responseMessage = `Terjadi kesalahan internal saat mengambil daftar Access Key: ${escapeHTML(error.message)}`;
    }
  } else if (text.startsWith('/removekey')) {
    const keyToRemove = text.substring('/removekey'.length).trim();
    if (!keyToRemove) {
      responseMessage = 'Mohon sertakan Access Key yang ingin dihapus. Contoh: <code>/removekey myCustomKey</code>';
    } else {
      try {
        console.log(`[Webhook] Calling /api/manage-access-keys (DELETE) for /removekey. Key: ${keyToRemove}`);
        const removeKeyResponse = await fetch(`${VERCEL_BASE_URL}/api/manage-access-keys`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: keyToRemove, deletedByTelegramId: fromId.toString() }),
        });
        const removeKeyData = await removeKeyResponse.json();

        if (removeKeyData.success) {
          responseMessage = `🗑️ Access Key <code>${escapeHTML(keyToRemove)}</code> berhasil dihapus.`;
        } else {
          responseMessage = `❌ Gagal menghapus Access Key: ${escapeHTML(removeKeyData.message || 'Respons API tidak sukses')}`;
          console.error("[Webhook] Remove Key API returned error:", removeKeyData);
        }
      } catch (error) {
        console.error('Error calling remove-key API:', error);
        responseMessage = `Terjadi kesalahan internal saat menghapus Access Key: ${escapeHTML(error.message)}`;
      }
    }
  } else if (text.startsWith('/setconfig')) {
    const args = text.substring('/setconfig'.length).trim().split(/\s+/).filter(arg => arg !== '');
    if (args.length < 3) {
        responseMessage = 'Format salah. Gunakan: /setconfig &lt;tipe_panel&gt; &lt;konfigurasi&gt; &lt;nilai_baru&gt;\nContoh: <code>/setconfig public ptla my_new_ptla_key</code>';
    } else {
        const [panelType, configKey, ...newValueParts] = args;
        const newValue = newValueParts.join(' ');
        
        try {
            console.log(`[Webhook] Calling /api/set-panel-config (POST) for /setconfig. Panel Type: ${panelType}, Config Key: ${configKey}, New Value: ${newValue}`);
            const setConfigResponse = await fetch(`${VERCEL_BASE_URL}/api/set-panel-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestedByTelegramId: fromId.toString(),
                    panelType: panelType,
                    configKey: configKey,
                    newValue: newValue
                }),
            });
            const setConfigData = await setConfigResponse.json();

            if (setConfigData.success) {
                responseMessage = `✅ Konfigurasi <b>${escapeHTML(configKey.toUpperCase())}</b> untuk panel <b>${escapeHTML(panelType.toUpperCase())}</b> berhasil diubah.`;
            } else {
                responseMessage = `❌ Gagal mengubah konfigurasi: ${escapeHTML(setConfigData.message)}`;
            }
        } catch (error) {
            console.error('[Webhook] Error calling set-panel-config API:', error);
            responseMessage = `Terjadi kesalahan internal saat mengubah konfigurasi: ${escapeHTML(error.message)}`;
        }
    }
  } else if (text.startsWith('/ban')) {
    const args = text.substring('/ban'.length).trim().split(' ');
    if (args.length < 2) {
      responseMessage = 'Format salah. Contoh: <code>/ban &lt;key&gt; 1d &lt;alasan&gt;</code>';
    } else {
      const keyToBan = args[0];
      const duration = args[1];
      const reason = args.slice(2).join(' ') || 'Tidak ada alasan.';

      try {
        const banResponse = await fetch(`${VERCEL_BASE_URL}/api/manage-access-keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ban',
            key: keyToBan,
            duration: duration,
            reason: reason,
            createdByTelegramId: fromId.toString()
          }),
        });
        const banData = await banResponse.json();
        responseMessage = banData.success ? `✅ ${banData.message}` : `❌ Gagal: ${banData.message}`;
      } catch (error) {
        responseMessage = `❌ Kesalahan API: ${error.message}`;
      }
    }
  } else if (text.startsWith('/unban')) {
    const args = text.substring('/unban'.length).trim().split(' ');
    if (args.length === 0 || !args[0]) {
      responseMessage = 'Format salah. Contoh: <code>/unban &lt;key&gt;</code>';
    } else {
      const keyToUnban = args[0];
      try {
        const unbanResponse = await fetch(`${VERCEL_BASE_URL}/api/manage-access-keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'unban',
            key: keyToUnban,
            createdByTelegramId: fromId.toString()
          }),
        });
        const unbanData = await unbanResponse.json();
        responseMessage = unbanData.success ? `✅ ${unbanData.message}` : `❌ Gagal: ${unbanData.message}`;
      } catch (error) {
        responseMessage = `❌ Kesalahan API: ${error.message}`;
      }
    }
  }
  else {
      console.log(`[Webhook] Unrecognized command: ${text}`);
      responseMessage = 'Perintah tidak dikenal. Ketik /start untuk melihat daftar perintah.';
  }

  await sendTelegramMessage(chatId, responseMessage);
  console.log("[Webhook] Response sent to Telegram.");

  return res.status(200).json({ success: true, message: 'Webhook processed.' });
}

async function sendTelegramMessage(chatId, messageText) {
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'HTML', 
      }),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error('Failed to send message to Telegram:', data);
    }
  } catch (error) {
    console.error('Error sending message via Telegram API:', error);
  }
}