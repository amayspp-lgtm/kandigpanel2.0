// api/manage-access-keys.js
import { connectToDatabase } from '../utils/db.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  try {
    const db = await connectToDatabase();
    const collection = db.collection('accessKeys');

    const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS;
    const AUTHORIZED_ADMIN_IDS = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

    const authorizeOwner = (ownerId) => {
      return ownerId && typeof ownerId === 'string' && ownerId.trim() !== '' && AUTHORIZED_ADMIN_IDS.includes(ownerId.trim());
    };

    if (req.method === 'POST') {
      const { key, createdByTelegramId, panelTypeRestriction, dailyLimit } = req.body;
      if (!authorizeOwner(createdByTelegramId) || !key) {
        return res.status(403).json({ success: false, message: 'Unauthorized or invalid key.' });
      }

      const existingKey = await collection.findOne({ key: key });
      if (existingKey) {
        return res.status(409).json({ success: false, message: 'Access Key already exists.' });
      }

      const newKey = {
        key: key,
        panelTypeRestriction: panelTypeRestriction || 'public',
        createdAt: new Date(),
        createdByTelegramId: createdByTelegramId,
        usageCount: 0,
        status: 'active',
        reason: null,
        suspensionUntil: null,
        dailyLimit: dailyLimit || 0,
        dailyUsage: 0,
        lastUsedDate: null,
        usedDevices: [],
        pendingDevices: []
      };

      const result = await collection.insertOne(newKey);
      if (result.acknowledged) {
        return res.status(201).json({ success: true, message: 'Access Key created successfully.' });
      } else {
        return res.status(500).json({ success: false, message: 'Failed to create Access Key.' });
      }
    } else if (req.method === 'GET') {
      const { requestedByTelegramId } = req.query;
      if (!authorizeOwner(requestedByTelegramId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized.' });
      }
      const keys = await collection.find({}).project({ _id: 0 }).toArray();
      return res.status(200).json({ success: true, keys: keys });
    } else if (req.method === 'PATCH') {
      const { key, status, reason, duration, deviceId, action, updatedByTelegramId } = req.body;
      if (!authorizeOwner(updatedByTelegramId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized.' });
      }
      if (!key) {
        return res.status(400).json({ success: false, message: 'Access Key is required.' });
      }

      const updatePayload = {};

      if (action === 'unauthorize_device') {
        if (!deviceId) {
          return res.status(400).json({ success: false, message: 'Device ID is required for this action.' });
        }
        updatePayload.$pull = { usedDevices: deviceId };
      } else {
        if (!status) {
          return res.status(400).json({ success: false, message: 'Status is required for this action.' });
        }
        const validStatuses = ['active', 'suspended', 'banned'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ success: false, message: 'Invalid status provided.' });
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

        updatePayload.$set = {
          status: status,
          updatedAt: new Date(),
          reason: reason || null,
          suspensionUntil: suspensionUntil
        };
      }
      
      const result = await collection.updateOne({ key: key }, updatePayload);

      if (result.matchedCount === 1) {
        return res.status(200).json({ success: true, message: `Access Key updated successfully.` });
      } else {
        return res.status(404).json({ success: false, message: 'Access Key not found.' });
      }
    } else if (req.method === 'DELETE') {
      const { key, deletedByTelegramId } = req.body;
      if (!authorizeOwner(deletedByTelegramId)) {
        return res.status(403).json({ success: false, message: 'Unauthorized.' });
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
      return res.status(405).json({ success: false, message: 'Method Not Allowed.' });
    }
  } catch (error) {
    console.error('CRITICAL SERVER ERROR:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error.' });
  }
}