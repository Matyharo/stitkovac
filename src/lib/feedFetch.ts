import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19));
  }
  // Permit global-unicast IPv6 only, excluding mapped IPv4 and documentation ranges.
  return isIP(address) === 6 && /^[23]/i.test(address) && !address.toLowerCase().startsWith('2001:db8:');
}
export async function fetchFeedBytes(input: string, redirects = 0): Promise<Buffer> {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw new Error('Feed musí používat veřejnou HTTPS adresu bez přihlašovacích údajů.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const allowed = (process.env.FEED_ALLOWED_HOSTS || 'depilujeme.cz,www.depilujeme.cz').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(host.toLowerCase())) throw new Error('Doména feedu není povolena v FEED_ALLOWED_HOSTS.');
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Interní síťové adresy nejsou pro feed povoleny.');
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Stitkovac-Sync/1.0', Accept: '*/*' }, lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family) }, response => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 3) { reject(new Error('Příliš mnoho přesměrování feedu.')); return; }
        fetchFeedBytes(new URL(response.headers.location, url).href, redirects + 1).then(resolve, reject); return;
      }
      if (status !== 200) { response.resume(); reject(new Error(`HTTP chyba feedu: ${status}`)); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 10 * 1024 * 1024) request.destroy(new Error('Feed přesahuje limit 10 MB.')); else chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks))); response.on('error', reject);
    });
    const timer = setTimeout(() => request.destroy(new Error('Stahování feedu překročilo 30 sekund.')), 30000);
    request.on('close', () => clearTimeout(timer)); request.on('error', reject);
  });
}
