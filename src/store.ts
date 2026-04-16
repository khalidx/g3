/** Content-addressable object store using SHA-256. */

import { createHash } from "crypto";
import { join } from "path";
import { mkdir, readFile, writeFile, access } from "fs/promises";

const OBJECTS_DIR = "objects";

/** Compute SHA-256 hex digest of a buffer. */
export function hashContent(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Store a blob, returning its hash. */
export async function storeObject(
  vDir: string,
  data: Uint8Array
): Promise<string> {
  const hash = hashContent(data);
  const dir = join(vDir, OBJECTS_DIR, hash.slice(0, 2));
  const file = join(dir, hash.slice(2));
  await mkdir(dir, { recursive: true });
  await writeFile(file, data);
  return hash;
}

/** Retrieve a blob by its hash. Returns null if not found. */
export async function loadObject(
  vDir: string,
  hash: string
): Promise<Uint8Array | null> {
  const file = join(vDir, OBJECTS_DIR, hash.slice(0, 2), hash.slice(2));
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

/** Check if an object exists. */
export async function hasObject(
  vDir: string,
  hash: string
): Promise<boolean> {
  const file = join(vDir, OBJECTS_DIR, hash.slice(0, 2), hash.slice(2));
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
