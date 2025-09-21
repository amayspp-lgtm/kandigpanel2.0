// api/set-panel-config.js

import { connectToDatabase } from '../utils/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Only POST is supported.' });
  }

  const { requestedByTelegramId, panelType, configKey, newValue } = req.body;

  if (!requestedByTelegramId || !panelType || !configKey || !newValue) {
    return res.status(400).json({ success: false, message: 'Missing required parameters.' });
  }

  // Validasi Otorisasi Admin
  const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS;
  const AUTHORIZED_ADMIN_IDS = TELEGRAM_CHAT_IDS ? TELEGRAM_CHAT_IDS.split(',').map(id => id.trim()) : [];

  if (!AUTHORIZED_ADMIN_IDS.includes(requestedByTelegramId)) {
    return res.status(403).json({ success: false, message: 'Unauthorized.' });
  }

  // Validasi Input
  const validPanelTypes = ['public', 'private'];
  const validConfigKeys = ['ptla', 'ptlc', 'domain', 'egg_id', 'nest_id', 'loc'];
  
  if (!validPanelTypes.includes(panelType.toLowerCase()) || !validConfigKeys.includes(configKey.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'Tipe panel atau kunci konfigurasi tidak valid.' });
  }

  try {
    const db = await connectToDatabase();
    const collection = db.collection('panelConfigs');

    const updateResult = await collection.updateOne(
      { panelType: panelType.toLowerCase() },
      {
        $set: {
          [configKey.toLowerCase()]: newValue,
          lastUpdated: new Date()
        }
      },
      { upsert: true }
    );

    if (updateResult.acknowledged) {
      return res.status(200).json({ success: true, message: 'Configuration updated successfully.' });
    } else {
      return res.status(500).json({ success: false, message: 'Failed to update configuration.' });
    }

  } catch (error) {
    console.error('Error setting panel configuration:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}