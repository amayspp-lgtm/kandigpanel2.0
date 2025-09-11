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
      const { key, createdByTelegramId, panelTypeRestriction } = req.body;
      console.log('manage-access-keys.js: Processing POST request.');

      if (!authorizeOwner(createdByTelegramId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Invalid or missing owner ID.' });
      }
      if (!key) {
        return res.status(400).json({ success: false, message: 'Access Key is required.' });
      }

      const newKey = {
        key: key,
        panelTypeRestriction: panelTypeRestriction || 'public',
        createdAt: new Date(),
        createdByTelegramId: createdByTelegramId,
        usageCount: 0,
        status: 'active',
        reason: null,
        suspensionUntil: null
      };

      const result = await collection.insertOne(newKey);
      if (result.acknowledged) {
        return res.status(201).json({ success: true, message: 'Access Key created successfully.' });
      } else {
        return res.status(500).json({ success: false, message: 'Failed to create Access Key.' });
      }

    } else if (req.method === 'GET') {
      console.log('manage-access-keys.js: Processing GET request.');
      const keys = await collection.find({}).project({ _id: 0, key: 1, status: 1, createdAt: 1, usageCount: 1, panelTypeRestriction: 1, reason: 1, suspensionUntil: 1 }).toArray();
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
    } else if (req.method === 'PATCH') {
      const { key, status, reason, duration, updatedByTelegramId } = req.body;
      console.log(`manage-access-keys.js: Processing PATCH request for key status update.`);

      if (!authorizeOwner(updatedByTelegramId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Invalid or missing owner ID for status update.' });
      }
      if (!key || !status) {
        return res.status(400).json({ success: false, message: 'Access Key and new status are required.' });
      }

      const validStatuses = ['active', 'suspended', 'banned'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status provided. Use "active", "suspended", or "banned".' });
      }

      let suspensionUntil = null;
      if (status === 'suspended' && duration) {
        const value = parseInt(duration.slice(0, -1));
        const unit = duration.slice(-1);
        const now = new Date();

        if (unit === 'd') now.setDate(now.getDate() + value);
        else if (unit === 'm') now.setMinutes(now.getMinutes() + value);
        else if (unit === 'h') now.setHours(now.getHours() + value);
        suspensionUntil = now;
      }

      const updateFields = {
        status: status,
        updatedAt: new Date(),
        reason: reason || null,
        suspensionUntil: suspensionUntil
      };
      
      const result = await collection.updateOne({ key: key }, { $set: updateFields });

      if (result.matchedCount === 1) {
        return res.status(200).json({ success: true, message: `Access Key status updated to '${status}' successfully.` });
      } else {
        return res.status(404).json({ success: false, message: 'Access Key not found.' });
      }
    } else {
      console.log(`manage-access-keys.js: Unsupported method: ${req.method}`);
      return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
    }
  } catch (error) {
    console.error('manage-access-keys.js: CRITICAL SERVER ERROR', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error.' });
  }
}