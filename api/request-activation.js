// api/request-activation.js
import { connectToDatabase } from '../utils/db.js';
import fetch from 'node-fetch';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_IDS.split(',')[0].trim();
const VERCEL_BASE_URL = process.env.VERCEL_BASE_URL;

async function sendTelegramNotification(chatId, message, key, deviceId) {
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "✅ Otorisasi", callback_data: `authorize_device_${key}_${deviceId}` },
        { text: "❌ Tolak", callback_data: `reject_device_${key}_${deviceId}` }
      ]
    ]
  };

  try {
    await fetch(telegramApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard
      }),
    });
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
  }
  
  const { accessKey, deviceId } = req.body;

  if (!accessKey || !deviceId) {
    return res.status(400).json({ success: false, message: 'Access key and device ID are required.' });
  }

  try {
    const db = await connectToDatabase();
    const collection = db.collection('accessKeys');
    
    const result = await collection.updateOne(
      { key: accessKey, "pendingDevices.deviceId": { $ne: deviceId } },
      { 
        $push: { pendingDevices: { deviceId: deviceId, requestedAt: new Date() } }
      }
    );

    if (result.matchedCount > 0) {
      const message = `
        <b>Permintaan Otorisasi Perangkat Baru!</b>
        🔑 Kunci Akses: <code>${accessKey}</code>
        🖥️ ID Perangkat: <code>${deviceId}</code>
        
        Silakan otorisasi atau tolak perangkat ini.
      `;
      await sendTelegramNotification(TELEGRAM_ADMIN_CHAT_ID, message, accessKey, deviceId);
      return res.status(200).json({ success: true, message: 'Activation request sent to admin.' });
    } else {
      return res.status(404).json({ success: false, message: 'Access Key not found or device already pending.' });
    }

  } catch (error) {
    console.error('Error processing activation request:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error.' });
  }
}