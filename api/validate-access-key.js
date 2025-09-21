// api/validate-access-key.js
import { connectToDatabase } from '../utils/db.js'; // Import koneksi database

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
    const collection = db.collection('accessKeys'); // Nama koleksi access keys

    // Cari accessKey di database dan pastikan isActive: true
    const foundKey = await collection.findOne({ key: accessKey, isActive: true });

    if (foundKey) {
      // Opsional: Perbarui counter penggunaan dan waktu terakhir digunakan
      await collection.updateOne(
        { _id: foundKey._id },
        { $inc: { usageCount: 1 }, $set: { lastUsed: new Date() } }
      );
      return res.status(200).json({ isValid: true, message: 'Access Key Valid.' });
    } else {
      return res.status(401).json({ isValid: false, message: 'Access Key Tidak Valid atau tidak aktif.' });
    }
  } catch (error) {
    console.error('Database error during access key validation:', error);
    return res.status(500).json({ isValid: false, message: 'Server error during validation.' });
  }
}
