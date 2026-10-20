import { readdir, readFile } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const directory = new URL('../migrations/', import.meta.url)
const files = (await readdir(directory)).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort()
// Self-hosted (FX0_LOCAL=1): plain Postgres, one transaction per file on one client.
const local = process.env.FX0_LOCAL === '1'
const sql = local ? null : neon(process.env.DATABASE_URL)
const client = local ? new (await import('pg')).default.Client({ connectionString: process.env.DATABASE_URL }) : null
await client?.connect()
for (const file of files) {
  try {
    const migration = await readFile(new URL(file, directory), 'utf8')
    // Every statement is idempotent, so reapplying earlier files is safe.
    const statements = migration.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n')
      .split(';').map((text) => text.trim()).filter(Boolean)
    // One Neon HTTP transaction per file; never BEGIN/COMMIT on separate connections.
    if (client) {
      await client.query('BEGIN')
      try {
        for (const text of statements) await client.query(text)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    } else await sql.transaction(statements.map((text) => sql.query(text)))
    console.log(`${file} applied`)
  } catch {
    // Driver errors may contain connection details; never print them.
    console.error(`${file} failed; verify DATABASE_URL and database permissions`)
    process.exitCode = 1
    break
  }
}
await client?.end()
