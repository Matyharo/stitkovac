let activeRequests = 0;

export async function bufferedOllamaFetch(fetcher: typeof fetch, url: string, options: RequestInit): Promise<Response> {
  if (activeRequests >= 1) throw new Error("AI právě zpracovává jiný požadavek. Zkuste to za chvíli znovu.");
  activeRequests++;
  try { return await readOllamaResponse(fetcher, url, options); } finally { activeRequests--; }
}

async function readOllamaResponse(fetcher: typeof fetch, url: string, options: RequestInit): Promise<Response> {
  const signal = options.signal;
  const response = await fetcher(url, options);
  let abortHandler: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    abortHandler = () => reject(new DOMException('Časový limit AI vypršel.', 'AbortError'));
    if (signal?.aborted) abortHandler(); else signal?.addEventListener('abort', abortHandler, { once: true });
  });
  const read = async () => {
    if (!response.body?.getReader) return response.json();
    const reader = response.body.getReader();
    let size = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > 1024 * 1024) throw new Error('Odpověď AI je příliš velká.'); chunks.push(value);
      }
      const joined = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
      return JSON.parse(new TextDecoder().decode(joined));
    } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  };
  try {
    const data = await Promise.race([read(), aborted]);
    return { ok: response.ok, status: response.status, json: async () => data } as Response;
  } finally { signal?.removeEventListener('abort', abortHandler); }
}
