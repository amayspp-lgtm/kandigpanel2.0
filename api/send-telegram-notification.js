// api/send-telegram-notification.js
// Serverless Function untuk mengirim notifikasi ke Telegram

import fetch from 'node-fetch';

export default async function handler(req, res) {
  // Hanya izinkan metode POST untuk mengirim notifikasi
  // Ini lebih aman karena data dikirim di body request
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Only POST is supported.' });
  }

  const { message } = req.body; // Ambil pesan dari body request

  // Ambil token bot dan chat ID dari Environment Variables Vercel
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_IDS_STRING = process.env.TELEGRAM_CHAT_IDS; // Gunakan string untuk mendapatkan semua ID

  // Pastikan token bot dan string ID tidak kosong
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_IDS_STRING) {
    console.error('Telegram bot token or chat IDs string is not set in environment variables.');
    return res.status(500).json({ success: false, message: 'Server configuration error: Telegram credentials or chat IDs missing.' });
  }

  // Pisahkan string TELEGRAM_CHAT_IDS_STRING menjadi array ID
  const TELEGRAM_CHAT_IDS_ARRAY = TELEGRAM_CHAT_IDS_STRING.split(',').map(id => id.trim());

  if (!message) {
    return res.status(400).json({ success: false, message: 'Message content is required.' });
  }

  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  let allNotificationsSuccessful = true;
  let errors = [];

  // Iterate melalui setiap chat ID dan kirim pesan
  for (const chatId of TELEGRAM_CHAT_IDS_ARRAY) {
    try {
      const telegramResponse = await fetch(telegramApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId, // Kirim ke satu ID dalam iterasi
          text: message,
          parse_mode: 'HTML',
        }),
      });

      const telegramData = await telegramResponse.json();

      if (!telegramResponse.ok || !telegramData.ok) {
        allNotificationsSuccessful = false;
        const errorDetail = `Failed to send notification to chat ID ${chatId}: ${telegramData.description || 'Unknown error'}`;
        console.error(errorDetail);
        errors.push(errorDetail);
      }
    } catch (error) {
      allNotificationsSuccessful = false;
      const errorDetail = `Error sending Telegram notification to chat ID ${chatId}: ${error.message}`;
      console.error(errorDetail);
      errors.push(errorDetail);
    }
  }

  if (allNotificationsSuccessful) {
    return res.status(200).json({ success: true, message: 'Notifications sent to all authorized chat IDs.' });
  } else {
    return res.status(500).json({ success: false, message: 'Failed to send notifications to one or more chat IDs.', details: errors });
  }
}
