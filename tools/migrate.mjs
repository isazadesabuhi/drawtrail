#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const direction = process.argv[2] ?? 'up';
if (direction !== 'up' && direction !== 'down') {
  throw new Error('Usage: node tools/migrate.mjs [up|down]');
}
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgres://drawtrail:drawtrail@127.0.0.1:5432/drawtrail',
});
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const names = (await readdir(new URL('../db/migrations/', import.meta.url)))
    .filter((name) => name.endsWith(`.${direction}.sql`))
    .sort();
  if (direction === 'down') names.reverse();
  for (const filename of names) {
    const name = filename.replace(`.${direction}.sql`, '');
    const existing = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name],
    );
    if (direction === 'up' && existing.rowCount) continue;
    if (direction === 'down' && !existing.rowCount) continue;
    const sql = await readFile(
      new URL(`../db/migrations/${filename}`, import.meta.url),
      'utf8',
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      if (direction === 'up')
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [
          name,
        ]);
      else
        await client.query('DELETE FROM schema_migrations WHERE name = $1', [
          name,
        ]);
      await client.query('COMMIT');
      console.log(`${direction.toUpperCase()} ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
