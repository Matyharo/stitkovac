import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
export default function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'stitkovac-tests-'));
  const database = join(directory, 'test.db'); writeFileSync(database, '');
  const schema = readFileSync('prisma/schema.prisma', 'utf8').replace(/url\s*=\s*[^\n]+/, `url = "file:${database}"`);
  const schemaPath = join(directory, 'schema.prisma'); writeFileSync(schemaPath, schema);
  process.env.SESSION_SECRET = 'isolated-test-session-secret-at-least-32-characters';
  process.env.DATABASE_URL = `file:${database}`;
  process.env.STITKOVAC_TEST_DATABASE_URL = process.env.DATABASE_URL;
  execFileSync('node_modules/.bin/prisma', ['db', 'push', '--schema', schemaPath, '--skip-generate'], { stdio: 'pipe' });
  return () => rmSync(directory, { recursive: true, force: true });
}
