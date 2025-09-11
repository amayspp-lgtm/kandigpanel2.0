// utils/db.js
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = new URL(uri).pathname.substring(1); // Ekstrak nama database dari URI

let cachedClient = null;
let cachedDb = null;

if (!uri) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return cachedDb;
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    cachedClient = client;
    cachedDb = db;
    console.log('Connected to MongoDB.');
    return db;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw new Error('Failed to connect to MongoDB');
  }
}