// api/telegram-webhook.js

import fetch from 'node-fetch';
import { connectToDatabase } from '../utils/db.js';

function escapeHTML(str) {
  return str.replace(/[&<>\"']/g, function(tag) {
    var charsToReplace = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '\"': '&quot;',
      "\'": '&#039;'
    };
    return charsToReplace[tag] || tag;
  });
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS;
const VERCEL_BASE_URL = process.env.VERCEL_BASE_URL;

if (!VERCEL_BASE_URL || !VERCEL_BASE_URL.startsWith('http')) {
  console.error("VERCEL_BASE_URL environment variable is missing or invalid.");
}

const AUTHORIZED_ADMIN_IDS = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

export default async function handler(req, res) {
  console.log(`[Webhook] Received ${req.method} request.`);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
  }

  const { body } = req;
  const message = body.message;

  if (!message) {
    return res.status(200).json({ success: true, message: 'No message received.' });
  }

  const chatId = message.chat.id;
  const fromId = message.from.id.toString();
  const text = message.text || '';
  let responseMessage = 'Perintah tidak dikenal. Ketik /start untuk melihat daftar perintah.';

  if (!AUTHORIZED_ADMIN_IDS.includes(fromId)) {
    console.warn(`[Webhook] Unauthorized access attempt from ID: ${fromId}`);
    responseMessage = 'Maaf, Anda tidak memiliki izin untuk menggunakan bot ini.';
    await sendTelegramMessage(chatId, responseMessage);
    return res.status(403).json({ success: false, message: 'Unauthorized access.' });
  }

  const parts = text.split(' ');
  const command = parts[0];

  if (command === '/start') {
    responseMessage = `Halo, Admin! 🤖 Anda dapat menggunakan perintah berikut:\n\n` +
      `/addkey [kunci] (opsional: [public|private|both])\n` +
      `/listkeys\n` +
      `/removekey [kunci]\n` +
      `/suspend [kunci] [durasi] [alasan...]\n` +
      `/ban [kunci] [alasan...]\n` +
      `/unban [kunci]\n\n` +
      `Contoh Suspend: /suspend mykey 30d Akun spamming\n` +
      `Contoh Ban: /ban mykey Melanggar TOS`;
  } else if (command === '/addkey') {
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
            key: customKey,
            createdByTelegramId: fromId.toString(),
            panelTypeRestriction: panelTypeRestriction
        }),
      });
      const addKeyData = await addKeyResponse.json();

      if (addKeyData.success) {
        responseMessage = `✅ <b>Access Key Berhasil Dibuat!</b>\n------------------------------------\n🔑 Key: <code>${escapeHTML(addKeyData.key)}</code>\n⚙️ Batasan Panel: <b>${escapeHTML(addKeyData.panelTypeRestriction || 'both')}</b>\n------------------------------------`;
      } else {
        responseMessage = `❌ Gagal menambahkan Access Key: ${escapeHTML(addKeyData.message || 'Respons API tidak sukses')}`;
        console.error("[Webhook] Add Key API returned error:", addKeyData);
      }
    } catch (error) {
      console.error('[Webhook] Error calling add-key API:', error);
      responseMessage = `Terjadi kesalahan internal saat menambahkan Access Key: ${escapeHTML(error.message)}`;
    }
  } else if (command === '/listkeys') {
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
          responseMessage += `   Status: <b>${k.status === 'active' ? 'Aktif ✅' : k.status === 'suspended' ? 'Suspended ⏸️' : 'Banned 🚫'}</b>\n`;
          responseMessage += `   Batasan: <b>${escapeHTML(k.panelTypeRestriction || 'both')}</b>\n`;
          responseMessage += `   Dibuat: ${escapeHTML(new Date(k.createdAt).toISOString().split('T')[0])}\n`;
          responseMessage += `   Digunakan: ${k.usageCount} kali\n`;
          if (k.reason) {
              responseMessage += `   Alasan: ${escapeHTML(k.reason)}\n`;
          }
          if (k.suspensionUntil) {
              const untilDate = new Date(k.suspensionUntil).toISOString().split('T')[0];
              responseMessage += `   Aktif kembali: ${untilDate}\n`;
          }
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
  } else if (command === '/removekey') {
    const keyToRemove = parts[1];
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
  } else if (command === '/suspend') {
    const keyToSuspend = parts[1];
    const duration = parts[2];
    const reason = parts.slice(3).join(' ');
    
    if (!keyToSuspend || !duration || !reason) {
      responseMessage = 'Format salah. Gunakan: /suspend [kunci] [durasi] [alasan...]';
    } else {
      await updateKeyStatus(chatId, keyToSuspend, 'suspended', reason, duration, fromId);
    }
  } else if (command === '/ban') {
    const keyToBan = parts[1];
    const reason = parts.slice(2).join(' ');
    
    if (!keyToBan || !reason) {
      responseMessage = 'Format salah. Gunakan: /ban [kunci] [alasan...]';
    } else {
      await updateKeyStatus(chatId, keyToBan, 'banned', reason, null, fromId);
    }
  } else if (command === '/unban') {
    const keyToUnban = parts[1];
    if (!keyToUnban) {
      responseMessage = 'Format salah. Gunakan: /unban [kunci]';
    } else {
      await updateKeyStatus(chatId, keyToUnban, 'active', null, null, fromId);
    }
  }

  await sendTelegramMessage(chatId, responseMessage);
  console.log("[Webhook] Response sent to Telegram.");
  return res.status(200).json({ success: true, message: 'Webhook processed.' });
}

async function updateKeyStatus(chatId, key, newStatus, reason, duration, updatedByTelegramId) {
    try {
        const apiEndpoint = `${VERCEL_BASE_URL}/api/manage-access-keys`;
        const response = await fetch(apiEndpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: key,
                status: newStatus,
                reason: reason,
                duration: duration,
                updatedByTelegramId: updatedByTelegramId
            })
        });
        const data = await response.json();
        let messageText;
        if (data.success) {
            messageText = `✅ Access Key <b>${escapeHTML(key)}</b> berhasil diperbarui ke status <b>${newStatus}</b>.\nAlasan: ${escapeHTML(reason || 'N/A')}\nDurasi: ${duration ? escapeHTML(duration) : 'Permanen'}`;
        } else {
            messageText = `❌ Gagal memperbarui Access Key: ${escapeHTML(data.message || 'Respons API tidak sukses')}`;
            console.error(`[Webhook] Update Key Status API returned error for key ${key}:`, data);
        }
        await sendTelegramMessage(chatId, messageText);
    } catch (error) {
        console.error(`Error calling update-key-status API for key ${key}:`, error);
        await sendTelegramMessage(chatId, `Terjadi kesalahan internal saat memperbarui Access Key: ${escapeHTML(error.message)}`);
    }
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
    console.error('Error sending message to Telegram:', error);
  }
}