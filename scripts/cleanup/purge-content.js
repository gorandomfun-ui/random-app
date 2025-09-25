#!/usr/bin/env node
/*
 * Purge batches of low-value content from MongoDB.
 * Usage examples:
 *   node scripts/cleanup/purge-content.js --list
 *   node scripts/cleanup/purge-content.js images-placeholders images-no-meta --dry-run
 *   node scripts/cleanup/purge-content.js all --execute
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const BATCH_DEFINITIONS = {
  'images-placeholders': {
    description: 'Images provenant de picsum/loremflickr ou providers inconnus (placeholders)',
    query: {
      type: 'image',
      $or: [
        { url: { $regex: /(picsum\.photos|loremflickr\.com)/i } },
        { 'source.name': { $regex: /(picsum|loremflickr)/i } },
        { tags: { $in: ['picsum', 'flickr', 'random'] } },
      ],
    },
  },
  'images-no-meta': {
    description: 'Images d’API externes sans tags ni keywords',
    query: {
      type: 'image',
      $and: [
        { $or: [
            { tags: { $exists: false } },
            { tags: { $size: 0 } },
          ]
        },
        { $or: [
            { keywords: { $exists: false } },
            { keywords: { $size: 0 } },
          ]
        },
        { $or: [
            { provider: { $in: ['giphy', 'tenor', 'pexels', 'pixabay', 'imgflip'] } },
            { url: { $regex: /(giphy\.com|tenor\.com|pexels\.com|pixabay\.com|imgflip\.com)/i } },
          ]
        },
      ],
    },
  },
  'videos-no-meta': {
    description: 'Vidéos sans tags ni keywords (sera reconstitué via ingestion)',
    query: {
      type: 'video',
      $and: [
        { $or: [ { tags: { $exists: false } }, { tags: { $size: 0 } } ] },
        { $or: [ { keywords: { $exists: false } }, { keywords: { $size: 0 } } ] },
      ],
    },
  },
  'text-unknown': {
    description: 'Quotes/Jokes/Facts avec provider inconnus',
    query: {
      type: { $in: ['quote', 'joke', 'fact'] },
      $or: [
        { provider: { $in: [null, '', 'unknown'] } },
        { provider: { $exists: false } },
      ],
    },
  },
};

function loadEnvFile(envFile = '.env.local') {
  const envPath = path.join(process.cwd(), envFile);
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = new Set();
  const options = {
    dryRun: true,
    list: false,
    showSample: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--execute') options.dryRun = false;
    else if (arg === '--list') options.list = true;
    else if (arg === '--sample') options.showSample = true;
    else if (arg.startsWith('--')) {
      console.warn(`Option inconnue: ${arg}`);
    } else {
      args.add(arg);
    }
  }

  return { batches: args, options };
}

async function run() {
  loadEnvFile();

  const { batches, options } = parseArgs(process.argv.slice(2));

  if (options.list) {
    console.log('Lots disponibles:');
    for (const [key, def] of Object.entries(BATCH_DEFINITIONS)) {
      console.log(`  - ${key}: ${def.description}`);
    }
    console.log('\nUtilisation :');
    console.log('  node scripts/cleanup/purge-content.js images-placeholders --dry-run');
    console.log('  node scripts/cleanup/purge-content.js all --execute');
    return;
  }

  const selectedKeys = batches.size === 0 || batches.has('all')
    ? Object.keys(BATCH_DEFINITIONS)
    : Array.from(batches).map((key) => {
        if (!BATCH_DEFINITIONS[key]) {
          console.warn(`Lot inconnu ignoré: ${key}`);
          return null;
        }
        return key;
      }).filter(Boolean);

  if (!selectedKeys.length) {
    console.error('Aucun lot sélectionné. Utilise --list pour voir les options.');
    process.exit(1);
  }

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI / MONGODB_URI absent dans l’environnement.');
    process.exit(1);
  }

  const client = new MongoClient(uri, { maxPoolSize: 1 });

  try {
    await client.connect();
    const dbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'randomapp';
    const db = client.db(dbName);
    const coll = db.collection('items');

    console.log(`Base cible: ${dbName}`);
    console.log(options.dryRun ? 'Mode: dry-run (aucune suppression)' : 'Mode: EXECUTE (suppression effective)');
    console.log('Lots sélectionnés:', selectedKeys.join(', '));
    console.log('—');

    for (const key of selectedKeys) {
      const { description, query } = BATCH_DEFINITIONS[key];
      console.log(`Lot ${key}: ${description}`);

      const count = await coll.countDocuments(query);
      console.log(`  Documents correspondants : ${count}`);

      if (count === 0) {
        console.log('  -> Aucun document, on passe.\n');
        continue;
      }

      if (options.showSample) {
        const sample = await coll.find(query).project({ type: 1, provider: 1, url: 1, title: 1, tags: 1, keywords: 1 }).limit(5).toArray();
        console.log('  Échantillon (5 max) :');
        sample.forEach((doc, idx) => {
          console.log(`    [${idx + 1}]`, JSON.stringify(doc));
        });
      }

      if (options.dryRun) {
        console.log('  Dry-run : aucune suppression exécutée.\n');
        continue;
      }

      const result = await coll.deleteMany(query);
      console.log(`  Supprimés : ${result.deletedCount}\n`);
    }

    console.log('Opérations terminées.');
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
