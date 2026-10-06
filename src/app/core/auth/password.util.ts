/** PBKDF2-SHA256 rounds for new hashes; stored hashes keep their own count, and older ones are redone at sign-in. */
export const PASSWORD_ITERATIONS = 100_000;

export const MIN_PASSWORD_LENGTH = 8;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Hex SHA-256 of `username:password`, the form the single account of the first version was kept in. */
export async function credentialHash(username: string, password: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${username}:${password}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `pbkdf2$<iterations>$<salt b64>$<hash b64>` with a fresh random salt. */
export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(await pbkdf2(password, salt, iterations))}`;
}

/** Whether the password matches a stored hash of either form (`sha256$` hashes include the username). */
export async function verifyPassword(password: string, stored: string, username: string): Promise<boolean> {
  const [kind, ...rest] = stored.split('$');
  if (kind === 'sha256') return (await credentialHash(username, password)) === rest[0];
  if (kind !== 'pbkdf2' || rest.length !== 3) return false;
  const [iterations, salt, hash] = rest;
  return toBase64(await pbkdf2(password, fromBase64(salt), Number(iterations))) === hash;
}

/** True when a hash should be redone at the next successful sign-in (it is not PBKDF2 with `iterations` rounds). */
export function needsRehash(stored: string, iterations = PASSWORD_ITERATIONS): boolean {
  return !stored.startsWith(`pbkdf2$${iterations}$`);
}

/** A random one-time password for a new or reset account: 10 characters without look-alikes such as 0/O and 1/l. */
export function temporaryPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => alphabet[b % alphabet.length]).join('');
}
