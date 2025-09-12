// api/telegram-webhook.js

import fetch from 'node-fetch';
import { connectToDatabase } from '../utils/db.js';

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>\"']/g, function(tag) {
    var charsToReplace = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '\"': '&quot;',
      '\'': '&#039;'
    };
    return charsToReplace[tag] || tag;
  });
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS;
const AUTHORIZED_ADMIN_IDS = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
  }

  const { body } = req;
  const db = await connectToDatabase();
  const collection = db.collection('accessKeys');
  const chatId = body.message?.chat.id || body.callback_query?.message.chat.id;
  const fromId = body.message?.from.id || body.callback_query?.from.id;

  if (!chatId || !fromId || !AUTHORIZED_ADMIN_IDS.includes(String(fromId))) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
  }

  let responseMessage = '';
  let commandProcessed = false;

  // --- Handle Callback Query (Button Clicks) ---
  if (body.callback_query) {
    commandProcessed = true;
    const callbackData = body.callback_query.data;
    const messageId = body.callback_query.message.message_id;
    const parts = callbackData.split('_');
    const action = parts[0];
    const key = parts[1];
    const deviceId = parts[2];
    const escapedKey = escapeHTML(key);
    const escapedDeviceId = escapeHTML(deviceId);

    try {
      if (action === 'authorize' && key && deviceId) {
        const result = await collection.updateOne(
          { key: key, "pendingDevices.deviceId": deviceId },
          {
            $pull: { pendingDevices: { deviceId: deviceId } },
            $push: { usedDevices: deviceId }
          }
        );
        if (result.modifiedCount > 0) {
          responseMessage = `✅ **Perangkat diotorisasi!**\n\n**Kunci**: \`${escapedKey}\`\n**ID Perangkat**: \`${escapedDeviceId}\``;
        } else {
          responseMessage = `⚠️ **Gagal Otorisasi.**\n\nID Perangkat \`${escapedDeviceId}\` sudah diotorisasi atau tidak ditemukan pada kunci \`${escapedKey}\`.`;
        }
      } else if (action === 'reject' && key && deviceId) {
        const result = await collection.updateOne(
          { key: key, "pendingDevices.deviceId": deviceId },
          { $pull: { pendingDevices: { deviceId: deviceId } } }
        );
        if (result.modifiedCount > 0) {
          responseMessage = `❌ **Otorisasi ditolak.**\n\nID Perangkat \`${escapedDeviceId}\` untuk kunci \`${escapedKey}\` telah ditolak.`;
        } else {
          responseMessage = `⚠️ **Gagal Menolak.**\n\nID Perangkat \`${escapedDeviceId}\` tidak ditemukan pada kunci \`${escapedKey}\`.`;
        }
      } else if (action === 'start') {
         // Handle start button click
        const startMessage = `
Selamat datang, Admin! 👋
Anda dapat mengelola Access Key dengan perintah di bawah ini.
        `;
        const inlineKeyboard = {
            inline_keyboard: [
                [ { text: "🔑 Tambah Kunci", callback_data: "/addkey" }, { text: "📋 Daftar Kunci", callback_data: "/listkeys" } ],
                [ { text: "🗑️ Hapus Kunci", callback_data: "/removekey" } ],
                [ { text: "⚙️ Pengaturan Kunci", callback_data: "/settings" } ]
            ]
        };
        await sendTelegramMessage(chatId, startMessage, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
        return res.status(200).json({ success: true, message: 'Start menu sent.' });
      }
      
      await editTelegramMessage(chatId, messageId, responseMessage);
      
    } catch (error) {
      console.error('Error handling callback query:', error);
      await editTelegramMessage(chatId, messageId, `Terjadi kesalahan internal saat memproses permintaan: ${escapeHTML(error.message)}`);
    }

    return res.status(200).json({ success: true, message: 'Callback query processed.' });
  }

  // --- Handle Standard Commands ---
  const text = body.message?.text;
  if (!text) {
      return res.status(200).json({ success: true, message: 'No text message to process.' });
  }
  
  const [command, ...args] = text.trim().split(/\s+/);
  const key = args[0];
  const value = args[1];

  switch (command) {
    case '/start':
        const startMessage = `
Selamat datang, Admin! 👋
Anda dapat mengelola Access Key dengan perintah di bawah ini.
        `;
        const inlineKeyboard = {
            inline_keyboard: [
                [ { text: "🔑 Tambah Kunci", callback_data: "/addkey" }, { text: "📋 Daftar Kunci", callback_data: "/listkeys" } ],
                [ { text: "🗑️ Hapus Kunci", callback_data: "/removekey" } ],
                [ { text: "⚙️ Pengaturan Kunci", callback_data: "/settings" } ]
            ]
        };
        await sendTelegramMessage(chatId, startMessage, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
        commandProcessed = true;
        break;

    case '/addkey':
      if (args.length < 1) {
          responseMessage = 'Format salah. Gunakan: `/addkey [key] [type] [limit]`\n\nType: `public` atau `private`.\nLimit: Batas harian.';
          break;
      }
      const newKey = args[0];
      const panelTypeRestriction = args[1] || 'public';
      const dailyLimit = parseInt(args[2], 10) || 0;
      try {
          const addResult = await fetch(`${process.env.VERCEL_BASE_URL}/api/manage-access-keys`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: newKey, createdByTelegramId: String(fromId), panelTypeRestriction, dailyLimit })
          });
          const addData = await addResult.json();
          responseMessage = addData.success ? `✅ Access Key \`${escapeHTML(newKey)}\` berhasil ditambahkan!` : `❌ Gagal: ${escapeHTML(addData.message)}`;
      } catch (error) {
          responseMessage = `Terjadi kesalahan internal: ${escapeHTML(error.message)}`;
      }
      break;

    case '/listkeys':
      try {
          const listResult = await fetch(`${process.env.VERCEL_BASE_URL}/api/manage-access-keys?requestedByTelegramId=${fromId}`);
          const listData = await listResult.json();
          if (listData.success && listData.keys && listData.keys.length > 0) {
              const keys = listData.keys;
              const formattedKeys = keys.map(key => {
                  const usedDevicesCount = key.usedDevices ? key.usedDevices.length : 0;
                  const pendingDevicesCount = key.pendingDevices ? key.pendingDevices.length : 0;
                  const dailyLimitText = key.dailyLimit > 0 ? `${key.dailyUsage}/${key.dailyLimit}` : 'Tidak terbatas';
                  
                  return `
🔑 Kunci: \`${escapeHTML(key.key)}\`
Status: ${key.status === 'active' ? '🟢 Aktif' : key.status === 'suspended' ? '🟡 Ditangguhkan' : '🔴 Diblokir'}
Dibuat: ${new Date(key.createdAt).toLocaleString()}
Digunakan: ${key.usageCount}
Batas Harian: ${dailyLimitText}
Tipe: ${key.panelTypeRestriction}
Perangkat: ${usedDevicesCount} terotorisasi, ${pendingDevicesCount} menunggu
${key.status !== 'active' ? `Alasan: ${escapeHTML(key.reason)}` : ''}
                  `.trim();
              }).join('\n\n');
              
              responseMessage = `--- Daftar Access Key ---\n<pre>${formattedKeys}</pre>`;
          } else {
              responseMessage = 'Tidak ada Access Key yang terdaftar.';
          }
      } catch (error) {
          responseMessage = `Terjadi kesalahan internal: ${escapeHTML(error.message)}`;
      }
      break;

    case '/removekey':
      if (!key) {
        responseMessage = 'Format salah. Gunakan: `/removekey [key]`';
        break;
      }
      try {
        const removeResult = await fetch(`${process.env.VERCEL_BASE_URL}/api/manage-access-keys`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: key, deletedByTelegramId: String(fromId) })
        });
        const removeData = await removeResult.json();
        responseMessage = removeData.success ? `✅ Access Key \`${escapeHTML(key)}\` berhasil dihapus.` : `❌ Gagal: ${escapeHTML(removeData.message)}`;
      } catch (error) {
        responseMessage = `Terjadi kesalahan internal: ${escapeHTML(error.message)}`;
      }
      break;
    
    case '/suspendkey':
      if (args.length < 2) {
        responseMessage = 'Format salah. Gunakan: `/suspendkey [key] [durasi] [alasan]`';
        break;
      }
      const suspendKey = args[0];
      const suspendDuration = args[1];
      const suspendReason = args.slice(2).join(' ');
      try {
        const setStatusResult = await fetch(`${process.env.VERCEL_BASE_URL}/api/manage-access-keys`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: suspendKey, status: 'suspended', reason: suspendReason, duration: suspendDuration, updatedByTelegramId: String(fromId) })
        });
        const setStatusData = await setStatusResult.json();
        responseMessage = setStatusData.success ? `🟡 Kunci \`${escapeHTML(suspendKey)}\` berhasil **ditangguhkan**.\nAlasan: ${escapeHTML(suspendReason)}` : `❌ Gagal: ${escapeHTML(setStatusData.message)}`;
      } catch (error) {
        responseMessage = `Terjadi kesalahan internal: ${escapeHTML(error.message)}`;
      }
      break;

    case '/bankey':
      if (args.length < 2) {
        responseMessage = 'Format salah. Gunakan: `/bankey [key] [alasan]`';
        break;
      }
      const banKey = args[0];
      const banReason = args.slice(1).join(' ');
      try {
        const setStatusResult = await fetch(`${process.env.VERCEL_BASE_URL}/api/manage-access-keys`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: banKey, status: 'banned', reason: banReason, updatedByTelegramId: String(fromId) })
        });
        const setStatusData = await setStatusResult.json();
        responseMessage = setStatusData.success ? `🔴 Kunci \`${escapeHTML(banKey)}\` berhasil **diblokir**.\nAlasan: ${escapeHTML(banReason)}` : `❌ Gagal: ${escapeHTML(setStatusData.message)}`;
      } catch (error) {
        responseMessage = `Terjadi kesalahan internal: ${escapeHTML(error.message)}`;
      }
      break;

    case '/unbankey':
      if (args.length < 1) {
        responseMessage = 'Format salah. Gunakan: `/unbankey [key]`';
        break;
      }
      const unbanKey = args[0];
      try {
        const setStatusResult = await fetch(`${process.env.VERCEL_BASE_URL}/api/manage-access-keys`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: unbanKey, status: 'active', updatedByTelegramId: String(fromId) })
        });
        const setStatusData = await setStatusResult.json();
        responseMessage = setStatusData.success ? `✅ Kunci \`${escapeHTML(unbanKey)}\` berhasil **diaktifkan kembali**.` : `❌ Gagal: ${escapeHTML(setStatusData.message)}`;
      } catch (error) {
        responseMessage = `Terjadi kesalahan internal: ${escapeHTML(error.message)}`;
      }
      break;
    
    case '/setdailylimit':
      if (args.length < 2 || isNaN(parseInt(args[1], 10))) {
        responseMessage = 'Format salah. Gunakan: `/setdailylimit [key] [limit]`';
        break;
      }
      const dailyLimitKey = args[0];
      const dailyLimitValue = parseInt(args[1], 10);
      try {
        const updateResult = await collection.updateOne({ key: dailyLimitKey }, { $set: { dailyLimit: dailyLimitValue } });
        responseMessage = updateResult.modifiedCount > 0 ? `✅ Batas harian kunci \`${escapeHTML(dailyLimitKey)}\` berhasil diubah menjadi ${dailyLimitValue}.` : '❌ Kunci tidak ditemukan.';
      } catch (error) {
        responseMessage = `Terjadi kesalahan internal: ${escapeHTML(error.message)}`;
      }
      break;
      
    case '/authorize_device':
        if (args.length < 2) {
            responseMessage = 'Format salah. Gunakan: `/authorize_device [key] [deviceId]`';
            break;
        }
        const authKey = args[0];
        const authDeviceId = args[1];
        try {
            const authResult = await collection.updateOne(
                { key: authKey, "pendingDevices.deviceId": authDeviceId },
                {
                    $pull: { pendingDevices: { deviceId: authDeviceId } },
                    $push: { usedDevices: authDeviceId }
                }
            );
            responseMessage = authResult.modifiedCount > 0 ? `✅ ID Perangkat \`${escapeHTML(authDeviceId)}\` berhasil diotorisasi untuk kunci \`${escapeHTML(authKey)}\`.` : '❌ Otorisasi gagal. Perangkat mungkin sudah diotorisasi atau tidak ditemukan dalam antrean.';
        } catch (error) {
            responseMessage = `Terjadi kesalahan internal: ${escapeHTML(error.message)}`;
        }
        break;

    default:
        responseMessage = 'Perintah tidak dikenal. Ketik /start untuk melihat daftar perintah.';
        break;
  }

  if (commandProcessed) {
    return res.status(200).json({ success: true, message: 'Webhook processed.' });
  } else {
    await sendTelegramMessage(chatId, responseMessage);
    return res.status(200).json({ success: true, message: 'Webhook processed.' });
  }
}

async function sendTelegramMessage(chatId, messageText, options = {}) {
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: options.parse_mode || 'HTML',
        reply_markup: options.reply_markup
      }),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error('Failed to send message to Telegram:', data);
    }
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
}

async function editTelegramMessage(chatId, messageId, newText) {
    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
    try {
        await fetch(telegramApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                text: newText,
                parse_mode: 'HTML'
            }),
        });
    } catch (error) {
        console.error('Error editing Telegram message:', error);
    }
}