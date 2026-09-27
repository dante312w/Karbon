import { describe, expect, it } from 'vitest';
import { hashSecret, verifySecret } from './secret-hasher.js';

describe('secret-hasher', () => {
  it('genera hashes bcrypt con sal distinta y los verifica', async () => {
    const [first, second] = await Promise.all([hashSecret('1234'), hashSecret('1234')]);
    expect(first).toMatch(/^\$2[aby]\$12\$/);
    expect(first).not.toBe(second);
    await expect(verifySecret('1234', first)).resolves.toBe(true);
    await expect(verifySecret('4321', first)).resolves.toBe(false);
  });
});
