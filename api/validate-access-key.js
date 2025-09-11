// api/validate-access-key.js
import { connectToDatabase } from '../utils/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ isValid: false, message: 'Method Not Allowed.' });
  }

  const { accessKey } = req.query;

  if (!accessKey) {
    return res.status(400).json({ isValid: false, message: 'Access Key is required.' });
  }

  try {
    const db = await connectToDatabase();
    const collection = db.collection('accessKeys');
    
    const foundKey = await collection.findOne({ key: accessKey });

    if (!foundKey) {
      return res.status(401).json({ isValid: false, message: 'Access Key tidak valid atau tidak ditemukan.' });
    }

    // Periksa jika suspension temporary sudah berakhir
    if (foundKey.status === 'suspended' && foundKey.suspensionUntil && new Date() > new Date(foundKey.suspensionUntil)) {
        await collection.updateOne({ _id: foundKey._id }, { $set: { status: 'active', reason: null, suspensionUntil: null } });
        return res.status(200).json({ isValid: true, message: 'Access Key valid.' });
    }

    // Periksa status kunci
    if (foundKey.status === 'suspended') {
        return res.status(403).json({
            isValid: false,
            message: 'Access Key ini telah disuspend.',
            details: {
                status: 'Suspended',
                reason: foundKey.reason || 'Tidak ada alasan yang diberikan.',
                suspensionUntil: foundKey.suspensionUntil || 'Permanen'
            }
        });
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

    // Jika statusnya 'active', lanjutkan proses
    if (foundKey.status === 'active') {
        await collection.updateOne(
            { _id: foundKey._id },
            { $inc: { usageCount: 1 }, $set: { lastUsed: new Date() } }
        );
        return res.status(200).json({ isValid: true, message: 'Access Key valid.' });
    } else {
        return res.status(403).json({ isValid: false, message: 'Access Key tidak dapat digunakan.' });
    }

  } catch (error) {
    console.error('Database error during access key validation:', error);
    return res.status(500).json({ isValid: false, message: 'Server error during validation.' });
  }
}