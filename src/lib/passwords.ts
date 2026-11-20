import { randomBytes, scrypt, pbkdf2, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const legacyDerive = promisify(pbkdf2);
export function validatePassword(password: string) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Heslo musí mít 12 až 256 znaků.');
}
export async function hashPassword(password: string) {
  if (typeof password !== 'string' || !password.length || password.length > 256) throw new Error('Neplatné heslo.');
  const salt = randomBytes(16).toString('hex');
  const hash = await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (e, key) => e ? reject(e) : resolve(key)));
  return `scrypt$32768$8$3$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  if (typeof password !== 'string' || password.length > 256) return false;
  try {
    let actual: Buffer, expected: Buffer;
    if (stored.startsWith('scrypt$')) {
      const [tag, n, r, p, salt, hex] = stored.split('$');
      if (tag !== 'scrypt' || n !== '32768' || r !== '8' || p !== '3' || !salt || !hex) return false;
      expected = Buffer.from(hex, 'hex');
      actual = await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (e, key) => e ? reject(e) : resolve(key)));
    } else {
      const [salt, hex] = stored.split(':');
      if (!salt || !hex) return false;
      expected = Buffer.from(hex, 'hex');
      actual = await legacyDerive(password, salt, 1000, 64, 'sha512') as Buffer;
    }
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
// No server actions are exported from this module.
