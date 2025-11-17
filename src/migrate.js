// src/migrate.js
// Runs all SQL files in src/migrations against Postgres

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pgQuery } from './pg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // 001_..., 002_... etc

    if (files.length === 0) {
      console.log('No migrations found.');
      return;
    }

    console.log('Running migrations:', files);

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
      console.log(`\n--- Running ${file} ---`);
      await pgQuery(sql);
      console.log(`Finished ${file}`);
    }

    console.log('\nAll migrations completed ✅');
  } catch (err) {
    console.error('Migration error ❌:', err.message);
    process.exitCode = 1;
  }
}

runMigrations();
