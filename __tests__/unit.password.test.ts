import { describe, expect, it } from 'vitest';
import { ScryptPasswordHasher } from '@/src/infrastructure/security/ScryptPasswordHasher';

/**
 * The real adapter, not the fake the rest of the suite uses. Slow on purpose —
 * a password hash that is fast to compute is fast to attack — so the coverage
 * here is deliberately small and the cases are the ones that matter.
 */
describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('verifies the password it hashed', async () => {
    const hash = await hasher.hash('correct-horse-battery');
    expect(await hasher.verify('correct-horse-battery', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hasher.hash('correct-horse-battery');
    expect(await hasher.verify('correct-horse-batteru', hash)).toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hasher.hash('same-password'), hasher.hash('same-password')]);
    expect(a).not.toBe(b);
    expect(await hasher.verify('same-password', a)).toBe(true);
    expect(await hasher.verify('same-password', b)).toBe(true);
  });

  it('never stores the plaintext', async () => {
    const hash = await hasher.hash('correct-horse-battery');
    expect(hash).not.toContain('correct-horse-battery');
  });

  it('records its parameters in the hash, so the cost can be raised later without locking anyone out', async () => {
    const hash = await hasher.hash('correct-horse-battery');
    expect(hash.split('$').slice(0, 4)).toEqual(['scrypt', '16384', '8', '1']);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    // LogIn verifies against '' when no account matched, so this path is load-bearing.
    expect(await hasher.verify('anything', '')).toBe(false);
    expect(await hasher.verify('anything', 'not-a-hash')).toBe(false);
    expect(await hasher.verify('anything', 'scrypt$x$8$1$abc$def')).toBe(false);
  });
});
