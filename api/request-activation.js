// api/request-activation.js
import fetch from 'node-fetch';
import { connectToDatabase } from '../utils/db.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method Not Allowed. Only POST is supported.' });
    }
    
    const { accessKey, deviceId } = req.body;
    
    if (!accessKey || !deviceId) {
        return res.status(400).json({ success: false, message: 'Access Key dan Device ID diperlukan.' });
    }

    try {
        const db = await connectToDatabase();
        const collection = db.collection('accessKeys');

        // Tambahkan deviceId ke array pendingDevices
        const updateResult = await collection.updateOne(
            { key: accessKey },
            { $push: { pendingDevices: { deviceId: deviceId, requestedAt: new Date() } } }
        );

        if (updateResult.modifiedCount === 0) {
            console.warn(`Attempted to add deviceId ${deviceId} to key ${accessKey}, but key was not found or already has pending/used device.`);
        }
        
        // Kirim notifikasi ke Telegram Admin
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS;
        const AUTHORIZED_ADMIN_IDS = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];
        
        if (AUTHORIZED_ADMIN_IDS.length === 0 || !TELEGRAM_BOT_TOKEN) {
            console.error('Environment variables for Telegram are not set.');
            // Tetap kembalikan success=true ke frontend agar tidak terlihat error
            return res.status(200).json({ success: true, message: 'Permintaan aktivasi sedang diproses.' });
        }
        
        const notificationMessage = `
🔑 **Permintaan Aktivasi Baru!**
-------------------------------
**Access Key**: \`${accessKey}\`
**Device ID**: \`${deviceId}\`
-------------------------------
_Untuk mengotorisasi, ketuk tombol di bawah._
        `;
        
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "✅ Otorisasi", callback_data: `authorize_${accessKey}_${deviceId}` },
                    { text: "❌ Tolak", callback_data: `reject_${accessKey}_${deviceId}` }
                ]
            ]
        };

        const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        for (const chatId of AUTHORIZED_ADMIN_IDS) {
            await fetch(telegramApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: notificationMessage,
                    parse_mode: 'Markdown',
                    reply_markup: inlineKeyboard
                }),
            });
        }

        res.status(200).json({ success: true, message: 'Permintaan aktivasi sedang diproses.' });
        
    } catch (error) {
        console.error('Error handling activation request:', error);
        res.status(500).json({ success: false, message: 'Server error saat memproses permintaan.' });
    }
}