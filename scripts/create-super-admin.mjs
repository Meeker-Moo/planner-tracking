// Creates a Super Admin account directly in D1: the first one after go-live, or a new one if every Super Admin
// is locked out. The password is typed here, hashed here (the same pbkdf2$ form as the app), and never stored.
//
//   npm run create-super-admin -- --remote <username> <displayName>   (the live database)
//   npm run create-super-admin -- <username> <displayName>            (the local one of `npm run api`)

import { spawnSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATABASE = 'moph-planner-db';
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/; // as auth.limits.ts
const MIN_PASSWORD_LENGTH = 8; // as password.util.ts

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** PASSWORD_ITERATIONS of wrangler.jsonc, so the hash is in the form the Worker keeps (no rehash at first sign-in). */
function iterations() {
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const value = Number(/"PASSWORD_ITERATIONS"\s*:\s*"?(\d+)/.exec(config)?.[1]);
  return Number.isInteger(value) && value > 0 ? value : 100_000;
}

/** Reads a line without echoing it. */
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) fail('Run this in a terminal: it asks for the password.');
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const sql = (text) => `'${String(text).replace(/'/g, "''")}'`;

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const [rawUsername, ...nameParts] = args.filter((a) => a !== '--remote' && a !== '--local');
const username = (rawUsername ?? '').trim().toLowerCase();
const displayName = nameParts.join(' ').trim() || 'Super Admin';
if (!USERNAME_PATTERN.test(username)) {
  fail('Usage: npm run create-super-admin -- [--remote] <username> <displayName>\n' +
    'username: 3–32 of a-z 0-9 . _ -');
}

const password = await askHidden(`Password for ${username}: `);
if (password.length < MIN_PASSWORD_LENGTH) fail(`The password must have at least ${MIN_PASSWORD_LENGTH} characters.`);
if ((await askHidden('Again: ')) !== password) fail('The passwords differ.');

const rounds = iterations();
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, rounds, 32, 'sha256');
const passwordHash = `pbkdf2$${rounds}$${salt.toString('base64')}$${hash.toString('base64')}`;
const now = new Date().toISOString();
const id = `u-${randomUUID().slice(0, 8)}`;

// must_change_password = 0: the password was just chosen by its owner.
const statement =
  'INSERT INTO users (id, username, display_name, role, password_hash, must_change_password, active, ' +
  'failed_logins, locked_until, created_by, created_at, updated_at) VALUES (' +
  [sql(id), sql(username), sql(displayName), sql('SUPER_ADMIN'), sql(passwordHash), 0, 1, 0, 'NULL', 'NULL', sql(now), sql(now)].join(', ') +
  ');';

// Through a file, so the hash is not on a command line (and no shell quoting is involved).
const dir = mkdtempSync(join(tmpdir(), 'awp-'));
const file = join(dir, 'super-admin.sql');
writeFileSync(file, statement);
try {
  const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const target = remote ? '--remote' : '--local';
  console.log(`Creating Super Admin "${username}" in ${DATABASE} (${remote ? 'remote' : 'local'})…`);
  const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', DATABASE, target, `--file=${file}`, '--yes'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) fail('wrangler failed (is the username taken, or the database not migrated yet?).');
  console.log('Done. Sign in with this username and password.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
