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

    const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS;
    const AUTHORIZED_ADMIN_IDS = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

    const authorizeOwner = (ownerId) => {
      return ownerId && typeof ownerId === 'string' && ownerId.trim() !== '' && AUTHORIZED_ADMIN_IDS.includes(ownerId.trim());
    };

    if (req.method === 'POST') {
      const { action, key, createdByTelegramId, panelTypeRestriction, duration, reason } = req.body;

      if (action === 'ban') {
        if (!authorizeOwner(createdByTelegramId)) {
          return res.status(403).json({ success: false, message: 'Unauthorized.' });
        }
        if (!key) {
          return res.status(400).json({ success: false, message: 'Access Key is required for ban.' });
        }

        let expiresAt = null;
        let isPermanent = false;
        
        if (duration === 'permanent') {
            isPermanent = true;
        } else {
            const timeValue = parseInt(duration);
            const timeUnit = duration.slice(-1);
            let milliseconds = 0;
            
            if (timeUnit === 'h') milliseconds = timeValue * 60 * 60 * 1000;
            if (timeUnit === 'd') milliseconds = timeValue * 24 * 60 * 60 * 1000;
            if (timeUnit === 'w') milliseconds = timeValue * 7 * 24 * 60 * 60 * 1000;
            
            expiresAt = new Date(new Date().getTime() + milliseconds);
        }
        
        const banDetails = {
            reason: reason || 'Tidak ada alasan.',
            bannedAt: new Date(),
            expiresAt: expiresAt,
            isPermanent: isPermanent,
            bannedBy: createdByTelegramId
        };
        
        const result = await collection.updateOne(
            { key: key },
            { $set: { isBanned: true, banDetails: banDetails } }
        );

        if (result.modifiedCount === 1) {
            return res.status(200).json({ success: true, message: `Access Key ${key} berhasil diban.` });
        } else {
            return res.status(404).json({ success: false, message: 'Access Key tidak ditemukan.' });
        }

      } else if (action === 'unban') {
        if (!authorizeOwner(createdByTelegramId)) {
            return res.status(403).json({ success: false, message: 'Unauthorized.' });
        }
        if (!key) {
            return res.status(400).json({ success: false, message: 'Access Key is required for unban.' });
        }
        
        const result = await collection.updateOne(
            { key: key },
            { $set: { isBanned: false }, $unset: { banDetails: "" } }
        );

        if (result.modifiedCount === 1) {
            return res.status(200).json({ success: true, message: `Access Key ${key} berhasil di-unban.` });
        } else {
            return res.status(404).json({ success: false, message: 'Access Key tidak ditemukan.' });
        }

      } else { // Jika action adalah 'addkey' seperti sebelumnya
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
          isActive: true,
          isBanned: false, // Default: tidak diban
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
      }
    } else if (req.method === 'GET') {
      const { requestedByTelegramId } = req.query;
      console.log('manage-access-keys.js: Processing GET request.');

      if (!authorizeOwner(requestedByTelegramId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Invalid or missing owner ID for key listing.' });
      }

      const keys = await collection.find({}).project({ _id: 0, key: 1, isActive: 1, isBanned: 1, createdAt: 1, usageCount: 1, panelTypeRestriction: 1 }).toArray();
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
    } else {
      console.log(`manage-access-keys.js: Unsupported method: ${req.method}`);
      return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
    }
  } catch (error) {
    console.error('manage-access-keys.js: CRITICAL ERROR IN HANDLER:', error);
    return res.status(500).json({ success: false, message: 'Internal server error in manage-access-keys.', error: error.message });
  }
}