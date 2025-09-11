// api/manage-access-keys.js

import { connectToDatabase } from '../utils/db.js';
import crypto from 'crypto';

console.log('manage-access-keys.js: Function loaded');

export default async function handler(req, res) {
  console.log(`manage-access-keys.js: Received ${req.method} request.`);

  try {
    const db = await connectToDatabase();
    console.log('manage-access-keys.js: Connected to DB.');
    const collection = db.collection('accessKeys');

    const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS; // Ambil dari daftar ID
    const AUTHORIZED_ADMIN_IDS = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

    // --- MODIFIKASI FUNGSI authorizeOwner ---
    const authorizeOwner = (ownerId) => {
      // Pastikan ownerId tidak undefined/null dan merupakan string non-kosong,
      // lalu periksa apakah ID yang sudah di-trim ada di daftar admin yang diizinkan.
      return ownerId && typeof ownerId === 'string' && ownerId.trim() !== '' && AUTHORIZED_ADMIN_IDS.includes(ownerId.trim());
    };
    // --- AKHIR MODIFIKASI ---

    if (req.method === 'POST') {
      const { key, createdByTelegramId, panelTypeRestriction } = req.body;
      console.log('manage-access-keys.js: Processing POST request.');

      if (!authorizeOwner(createdByTelegramId)) { // Ini yang menyebabkan error Unauthorized
        return res.status(403).json({ success: false, message: 'Unauthorized: Invalid or missing owner ID for key creation.' });
      }

      const newKey = key || crypto.randomBytes(16).toString('hex');
      const existingKey = await collection.findOne({ key: newKey });

      if (existingKey) {
        return res.status(409).json({ success: false, message: 'Access Key already exists.' });
      }

      const validRestrictions = ['public', 'private', 'both'];
      const finalPanelTypeRestriction = panelTypeRestriction && validRestrictions.includes(panelTypeRestriction.toLowerCase())
                                          ? panelTypeRestriction.toLowerCase()
                                          : 'both';

      const result = await collection.insertOne({
        key: newKey,
        isActive: true, // Default saat dibuat selalu aktif
        createdAt: new Date().toISOString(),
        usageCount: 0,
        createdByTelegramId: createdByTelegramId,
        panelTypeRestriction: finalPanelTypeRestriction
      });

      if (result.acknowledged) {
        return res.status(201).json({ success: true, message: 'Access Key created successfully.', key: newKey, panelTypeRestriction: finalPanelTypeRestriction });
      } else {
        return res.status(500).json({ success: false, message: 'Failed to create Access Key.' });
      }
    } else if (req.method === 'GET') {
      const { requestedByTelegramId } = req.query; // Ini bisa undefined
      console.log('manage-access-keys.js: Processing GET request.');

      if (!authorizeOwner(requestedByTelegramId)) { // Ini yang menyebabkan error
        return res.status(403).json({ success: false, message: 'Unauthorized: Invalid or missing owner ID for key listing.' });
      }

      const keys = await collection.find({}).project({ _id: 0, key: 1, isActive: 1, createdAt: 1, usageCount: 1, panelTypeRestriction: 1 }).toArray();
      return res.status(200).json({ success: true, keys: keys });
    } else if (req.method === 'DELETE') {
      const { key, deletedByTelegramId } = req.body;
      console.log('manage-access-keys.js: Processing DELETE request.');

      if (!authorizeOwner(deletedByTelegramId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Invalid or missing owner ID for key deletion.' });
      }
      if (!key) {
        return res.status(400).json({ success: false, message: 'Access Key is required for deletion.' });
      }

      const result = await collection.deleteOne({ key: key });

      if (result.deletedCount === 1) {
        return res.status(200).json({ success: true, message: 'Access Key deleted successfully.' });
      } else {
        return res.status(404).json({ success: false, message: 'Access Key not found.' });
      }
    } else { // Tidak ada PUT di sini karena fitur status dihapus
      console.log(`manage-access-keys.js: Unsupported method: ${req.method}`);
      return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
    }
  } catch (error) {
    console.error('manage-access-keys.js: CRITICAL ERROR IN HANDLER:', error);
    return res.status(500).json({ success: false, message: 'Internal server error in manage-access-keys.', error: error.message });
  }
}
