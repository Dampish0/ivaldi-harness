import { z } from 'zod';
const jsonValue = z.json();

export function trackResponse(response: Response, finish: () => void) {
  if (!response.body) { finish(); return response; }
  const reader = response.body.getReader();
  let finished = false;
  const release = () => { if (finished) return; finished = true; reader.releaseLock(); finish(); };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try { const item = await reader.read(); if (item.done) { release(); controller.close(); } else controller.enqueue(item.value); }
      catch (error) { release(); controller.error(error); }
    },
    async cancel(reason) { try { await reader.cancel(reason); } finally { release(); } },
  });
  return new StreamResponse(body, { status: response.status, statusText: response.statusText, headers: response.headers }, response.url);
}

// React Native's global Response is the non-streaming whatwg-fetch polyfill.
// Expo fetch returns a stream, but cannot construct a response for relay bytes.
// This adapter implements the response operations used by the SDK and runtime.
export class StreamResponse implements Response {
  readonly headers: Headers;
  readonly ok: boolean;
  readonly redirected = false;
  readonly status: number;
  readonly statusText: string;
  readonly type: ResponseType = 'default';
  readonly url: string;
  readonly body: ReadableStream<Uint8Array<ArrayBuffer>> | null;
  private consumed = false;
  constructor(body: ReadableStream<Uint8Array> | null, init: ResponseInit, url = '') {
    this.headers = new Headers(init.headers); this.status = init.status ?? 200; this.statusText = init.statusText ?? ''; this.url = url; this.ok = this.status >= 200 && this.status < 300;
    if (!body) { this.body = null; return; }
    const reader = body.getReader();
    this.body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        try { const item = await reader.read(); if (item.done) { reader.releaseLock(); controller.close(); } else controller.enqueue(new Uint8Array(item.value)); }
        catch (error) { reader.releaseLock(); controller.error(error); }
      },
      async cancel(reason) { try { await reader.cancel(reason); } finally { reader.releaseLock(); } },
    });
  }
  get bodyUsed() { return this.consumed || this.body?.locked === true; }
  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.bodyUsed) throw new TypeError('Response body already consumed');
    this.consumed = true;
    if (!this.body) return new ArrayBuffer(0);
    const reader = this.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; chunks.push(value); length += value.byteLength; } }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes.buffer;
  }
  async bytes() { return new Uint8Array(await this.arrayBuffer()); }
  async text() { return new TextDecoder().decode(await this.arrayBuffer()); }
  async json(): Promise<z.infer<typeof jsonValue>> { return jsonValue.parse(JSON.parse(await this.text())); }
  async blob() { return new Blob([await this.arrayBuffer()], { type: this.headers.get('content-type') ?? '' }); }
  async formData(): Promise<never> { throw new TypeError('Multipart responses are not supported by the native relay'); }
  clone(): Response {
    if (this.bodyUsed) throw new TypeError('Response body already consumed');
    // Relay consumers parse each response once. Cloning must fail explicitly
    // rather than consume the original stream or quietly return an empty body.
    throw new TypeError('Native stream responses cannot be cloned');
  }
}
