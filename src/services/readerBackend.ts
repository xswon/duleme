/**
 * Environment boundary for browser-to-backend communication.
 *
 * Feature code should use this adapter instead of calling fetch directly for
 * application APIs. The default implementation keeps the existing browser
 * behavior unchanged, while allowing ChatGPT Sites (or another supported web
 * runtime) to install an adapter without rewriting product features.
 */
export interface ReaderBackend {
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

const webReaderBackend: ReaderBackend = {
  request: (input, init) => globalThis.fetch(input, init),
};

let activeReaderBackend: ReaderBackend = webReaderBackend;

export function setReaderBackend(backend: ReaderBackend): void {
  activeReaderBackend = backend;
}

export function resetReaderBackend(): void {
  activeReaderBackend = webReaderBackend;
}

export function backendRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return activeReaderBackend.request(input, init);
}
