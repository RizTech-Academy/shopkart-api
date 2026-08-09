import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PasswordHasher } from '@/src/domain/ports';

const derive = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;

/**
 * scrypt, from the Node standard library.
 *
 * Chosen over bcrypt or argon2 so the promise the README makes — clone it and
 * it runs — survives: both of those are native addons that need a compiler on
 * first install. scrypt is memory-hard and is what `node:crypto` is for.
 *
 * Parameters are stored *in* the encoded hash rather than read from a constant
 * at verify time. That is what lets the cost be raised later without locking
 * out every account created before the change: an old hash still carries the
 * parameters it was made with.
 */
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = 'scrypt';

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(plaintext, salt, KEY_LENGTH, PARAMS);
    return [PREFIX, PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join('$');
  }

  /**
   * Returns false rather than throwing on a malformed hash, because callers
   * pass `''` on purpose: `LogIn` verifies against an empty hash when no
   * account matches, so an unknown address costs the same time as a wrong
   * password and cannot be told apart from one.
   */
  async verify(plaintext: string, hash: string): Promise<boolean> {
    const parsed = parse(hash);
    if (!parsed) {
      // Still burn a derivation so the timing matches a real comparison.
      await derive(plaintext, randomBytes(SALT_LENGTH), KEY_LENGTH, PARAMS);
      return false;
    }

    const candidate = await derive(plaintext, parsed.salt, parsed.key.length, parsed.params);
    return candidate.length === parsed.key.length && timingSafeEqual(candidate, parsed.key);
  }
}

interface ParsedHash {
  readonly params: { N: number; r: number; p: number };
  readonly salt: Buffer;
  readonly key: Buffer;
}

function parse(hash: string): ParsedHash | null {
  const [prefix, n, r, p, salt, key] = hash.split('$');
  if (prefix !== PREFIX || !n || !r || !p || !salt || !key) return null;

  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Object.values(params).every(Number.isInteger)) return null;

  return { params, salt: Buffer.from(salt, 'base64url'), key: Buffer.from(key, 'base64url') };
}
