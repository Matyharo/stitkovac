import { it, expect } from 'vitest';
import { createServer, connect, type AddressInfo } from 'node:net';
import { createPinnedLookup } from '../feedFetch';

it.each([true, false])('connects through a pinned DNS address with autoSelectFamily=%s', async autoSelectFamily => {
  const server = createServer(socket => socket.end());
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ host: 'pinned-test.invalid', port: (server.address() as AddressInfo).port, autoSelectFamily, lookup: createPinnedLookup({ address: '127.0.0.1', family: 4 }) });
      socket.once('error', reject);
      socket.once('connect', () => { expect(socket.remoteAddress).toBe('127.0.0.1'); socket.destroy(); resolve(); });
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
