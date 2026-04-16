/** Plugin registry for VCS backends. */

import type { Backend } from "./types.js";

const backends = new Map<string, Backend>();

/** Register a backend plugin. */
export function registerBackend(backend: Backend): void {
  backends.set(backend.name, backend);
}

/** Get a backend by name. */
export function getBackend(name: string): Backend | undefined {
  return backends.get(name);
}

/** Auto-detect which backend applies to a given root directory. */
export async function detectBackend(root: string): Promise<Backend | undefined> {
  for (const backend of backends.values()) {
    if (await backend.detect(root)) {
      return backend;
    }
  }
  return undefined;
}

/** List all registered backend names. */
export function listBackends(): string[] {
  return Array.from(backends.keys());
}
