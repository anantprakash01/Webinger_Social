/**
 * Contract check (CLAUDE.md §13): fails if the committed frontend types in src/types/openapi.ts
 * no longer match docs/api/openapi.yaml, i.e. someone changed one without regenerating the other.
 *
 *   npm run check:contract
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'contract-'));
const fresh = join(dir, 'openapi.ts');
try {
  execFileSync(process.execPath, ['node_modules/openapi-typescript/bin/cli.js', 'docs/api/openapi.yaml', '-o', fresh], { stdio: 'pipe' });
  const norm = (s) => s.replace(/\r\n/g, '\n').trimEnd();
  const committed = norm(readFileSync('src/types/openapi.ts', 'utf8'));
  const generated = norm(readFileSync(fresh, 'utf8'));
  if (committed !== generated) {
    const a = committed.split('\n');
    const b = generated.split('\n');
    const i = a.findIndex((line, n) => line !== b[n]);
    console.error(`Contract drift: src/types/openapi.ts differs from docs/api/openapi.yaml (first difference at line ${i + 1}).`);
    console.error(`  committed: ${a[i] ?? '(end of file)'}\n  generated: ${b[i] ?? '(end of file)'}`);
    console.error('Run `npm run gen:api` and commit the result.');
    process.exit(1);
  }
  const version = /^\s+version:\s*(\S+)/m.exec(readFileSync('docs/api/openapi.yaml', 'utf8'))?.[1];
  console.log(`Contract OK: generated types match openapi.yaml v${version}.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
