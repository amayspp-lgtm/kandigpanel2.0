// api/validate-access-key.js
import { connectToDatabase } from '../utils/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ isValid: false, message: 'Method Not Allowed.' });
  }

  const { accessKey, deviceId } = req.query;

  if (!accessKey || !deviceId) {
    return res.status(400).json({ isValid: false, message: 'Access Key and Device ID are required.' });
  }

  try {
    const db = await connectToDatabase();
    const collection = db.collection('accessKeys');
    
    const foundKey = await collection.findOne({ key: accessKey });

    if (!foundKey) {
      return res.status(401).json({ isValid: false, message: 'Access Key tidak valid atau tidak ditemukan.' });
    }
    
    const usedDevices = foundKey.usedDevices || [];
    const pendingDevices = foundKey.pendingDevices || [];
    
    // Logika baru untuk satu perangkat per kunci
    if (usedDevices.length >= 1 && !usedDevices.includes(deviceId)) {
        return res.status(403).json({
            isValid: false,
            message: 'Access Key ini sudah terdaftar di perangkat lain. Silakan hubungi admin.',
            details: { status: 'DeviceAlreadyRegistered' }
        });
    }

    // Periksa otorisasi perangkat
    const isDeviceAuthorized = usedDevices.includes(deviceId);
    const isDevicePending = pendingDevices.some(d => d.deviceId === deviceId);

    if (!isDeviceAuthorized && !isDevicePending) {
      return res.status(403).json({
        isValid: false,
        message: 'Perangkat Anda belum diotorisasi untuk menggunakan kunci ini.',
        details: { status: 'Unauthorized', accessKey: accessKey, deviceId: deviceId }
      });
    }

    // Periksa status kunci (banned/suspended)
    if (foundKey.status === 'suspended') {
      const suspensionUntil = foundKey.suspensionUntil ? new Date(foundKey.suspensionUntil) : null;
      if (suspensionUntil && new Date() > suspensionUntil) {
        await collection.updateOne({ _id: foundKey._id }, { $set: { status: 'active', reason: null, suspensionUntil: null } });
        return res.status(200).json({ isValid: true, message: 'Access Key valid.' });
      } else {
        return res.status(403).json({
          isValid: false,
          message: 'Access Key ini telah ditangguhkan.',
          details: {
            status: 'Suspended',
            reason: foundKey.reason || 'Tidak ada alasan yang diberikan.',
            suspensionUntil: suspensionUntil?.toISOString() || 'Permanen'
          }
        });
      }
    }
    
    if (foundKey.status === 'banned') {
        return res.status(403).json({
            isValid: false,
            message: 'Access Key ini telah di-ban secara permanen.',
            details: {
                status: 'Banned',
                reason: foundKey.reason || 'Tidak ada alasan yang diberikan.',
                suspensionUntil: 'Permanen'
            }
        });
    }

    if (foundKey.status === 'active') {
      const today = new Date().toISOString().split('T')[0];
      const lastUsed = foundKey.lastUsedDate ? new Date(foundKey.lastUsedDate).toISOString().split('T')[0] : null;

      if (lastUsed !== today) {
        await collection.updateOne({ _id: foundKey._id }, { $set: { dailyUsage: 0, lastUsedDate: new Date() } });
        foundKey.dailyUsage = 0;
      }

      if (foundKey.dailyLimit > 0 && foundKey.dailyUsage >= foundKey.dailyLimit) {
        return res.status(403).json({
          isValid: false,
          message: `Maaf, batas penggunaan harian (${foundKey.dailyLimit}) untuk Access Key ini telah tercapai.`,
          details: { status: 'Daily Limit Reached' }
        });
      }
      
      return res.status(200).json({ isValid: true, message: 'Access Key valid.' });
    } else {
        return res.status(403).json({ isValid: false, message: 'Access Key tidak dapat digunakan.' });
    }

  } catch (error) {
    console.error('Database error during access key validation:', error);
    return res.status(500).json({ isValid: false, message: 'Server error during validation.' });
  }
}
