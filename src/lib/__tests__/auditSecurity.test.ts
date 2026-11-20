import { describe, it, expect, vi } from 'vitest';
import { pbkdf2Sync } from 'node:crypto';
import { hashPassword, verifyPassword, validatePassword } from '../passwords';
import { bufferedOllamaFetch } from '../ollamaRequest';
import { isPublicAddress, fetchFeedBytes } from '../feedFetch';
import { isValidGtin } from '../gtin';
import { CsvImporter } from '../importers/CsvImporter';

describe('security audit regressions', () => {
  it('uses salted slow hashes and still accepts legacy passwords for migration', async () => {
    const hash = await hashPassword('Bezpečné heslo 123');
    expect(hash).toMatch(/^scrypt\$/);
    expect(await verifyPassword('Bezpečné heslo 123', hash)).toBe(true);
    expect(await verifyPassword('špatné heslo', hash)).toBe(false);
    expect(await verifyPassword('heslo', 'invalid')).toBe(false);
    const salt = 'legacy-test'; const old = `${salt}:${pbkdf2Sync('staré', salt, 1000, 64, 'sha512').toString('hex')}`;
    expect(await verifyPassword('staré', old)).toBe(true);
    expect(() => validatePassword('short')).toThrow();
  });
  it.each(['127.0.0.1','10.1.2.3','192.168.10.1','172.16.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1'])('rejects non-public feed address %s', address => expect(isPublicAddress(address)).toBe(false));
  it('rejects unapproved destinations and insecure protocols before making any request', async () => {
    await expect(fetchFeedBytes('http://www.depilujeme.cz/')).rejects.toThrow();
    await expect(fetchFeedBytes('https://localhost/')).rejects.toThrow();
    await expect(fetchFeedBytes('https://example.com/')).rejects.toThrow();
    expect(isPublicAddress('8.8.8.8')).toBe(true);
  });
  it('aborts AI requests even when headers arrived but the JSON body hangs', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) });
    const result = bufferedOllamaFetch(fetcher, 'http://localhost', { signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('validates the GTIN checksum, not just its length', () => {
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(isValidGtin('ABCDEFGHIJKLM')).toBe(false);
  });
  it('bounds concurrent AI requests and releases the slot after cancellation', async () => {
    const controller = new AbortController();
    const first = bufferedOllamaFetch(vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) }), 'http://localhost', { signal: controller.signal });
    await expect(bufferedOllamaFetch(vi.fn(), 'http://localhost', {})).rejects.toThrow('jiný požadavek');
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(bufferedOllamaFetch(vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }), 'http://localhost', {})).resolves.toMatchObject({ ok: true });
  });
  it('does not shift CSV columns when a header is blank', async () => {
    const OriginalReader = globalThis.FileReader;
    const Reader = class { onload?: (event: { target: { result: ArrayBuffer } }) => void; async readAsArrayBuffer(file: File) { this.onload?.({ target: { result: await file.arrayBuffer() } }); } };
    vi.stubGlobal('FileReader', Reader);
    try {
      const result = await new CsvImporter().parse(new File(['SKU,,Název\nA1,ignorovat,Správný název'], 'test.csv'));
      expect(result.rows[0]['Název']).toBe('Správný název');
    } finally { if (OriginalReader) vi.stubGlobal('FileReader', OriginalReader); else vi.unstubAllGlobals(); }
  });
});
