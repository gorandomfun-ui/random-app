#!/usr/bin/env node

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const dbName = process.env.MONGODB_DB || 'randomdb';

if (!uri) {
  console.error('❌ Missing MONGODB_URI/MONGO_URI environment variable');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const collection = db.collection('items');

  console.log('--- Doublons par videoId ---');
  const byVideoId = await collection.aggregate([
    { $match: { type: 'video', videoId: { $exists: true, $ne: '' } } },
    { $group: { _id: '$videoId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]).toArray();
  console.dir(byVideoId, { depth: null });

  console.log('\n--- Doublons par URL ---');
  const byUrl = await collection.aggregate([
    { $match: { type: 'video', url: { $exists: true, $ne: '' } } },
    { $group: { _id: '$url', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]).toArray();
  console.dir(byUrl, { depth: null });

  await client.close();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
