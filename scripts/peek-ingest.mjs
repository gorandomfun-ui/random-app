import { MongoClient } from 'mongodb';

const type = (process.argv[2] || 'video').trim();
const limitRaw = Number(process.argv[3]);
const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(20, Math.max(1, Math.floor(limitRaw))) : 5;

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const dbName = process.env.MONGODB_DB || 'randomapp';

if (!uri) {
  console.error('Missing MONGODB_URI');
  process.exit(1);
}

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const cursor = db
      .collection('items')
      .find({ type })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit);

    const docs = await cursor.toArray();
    if (!docs.length) {
      console.log(`No documents found for type "${type}".`);
      return;
    }

    console.log(`Last ${docs.length} documents for type "${type}":`);
    console.log('');
    docs.forEach((doc, idx) => {
      const provider = doc.provider || 'unknown';
      const title = doc.title || doc.text || '(no title)';
      const url = doc.url || doc.videoId || doc.source?.url || '(no url)';
      const tags = Array.isArray(doc.tags) ? doc.tags.slice(0, 6).join(', ') : '';
      const keywords = Array.isArray(doc.keywords) ? doc.keywords.slice(0, 6).join(', ') : '';
      console.log(`#${idx + 1}`);
      console.log(`  provider: ${provider}`);
      console.log(`  title   : ${title}`);
      console.log(`  url     : ${url}`);
      if (tags) console.log(`  tags    : ${tags}`);
      if (keywords) console.log(`  keywords: ${keywords}`);
      console.log('');
    });
  } catch (error) {
    console.error('peek-ingest failed:', error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
