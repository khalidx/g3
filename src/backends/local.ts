/** Local backend — native v VCS with content-addressable object store. */

import { join, relative } from "path";
import { mkdir, readFile, writeFile, readdir, stat, access } from "fs/promises";
import { createHash } from "crypto";
import type { Backend, Commit, FileEntry, FileDiff, WorkingStatus, VConfig } from "../types.js";
import { hashContent, storeObject, loadObject } from "../store.js";

const V_DIR = ".v";
const COMMITS_DIR = "commits";
const STAGING_FILE = "staging.json";
const HEAD_FILE = "HEAD";
const CONFIG_FILE = "config.json";

/** Recursively list all files under a directory, excluding .v and hidden dirs. */
async function walkFiles(dir: string, root: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(full, root)));
    } else if (entry.isFile()) {
      results.push(relative(root, full));
    }
  }
  return results;
}

function vDir(root: string): string {
  return join(root, V_DIR);
}

async function readJSON<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function writeJSON(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function getHead(root: string): Promise<string | null> {
  try {
    return (await readFile(join(vDir(root), HEAD_FILE), "utf-8")).trim() || null;
  } catch {
    return null;
  }
}

async function setHead(root: string, commitId: string): Promise<void> {
  await writeFile(join(vDir(root), HEAD_FILE), commitId);
}

async function getStaging(root: string): Promise<string[]> {
  return (await readJSON<string[]>(join(vDir(root), STAGING_FILE))) ?? [];
}

async function setStaging(root: string, paths: string[]): Promise<void> {
  await writeJSON(join(vDir(root), STAGING_FILE), paths);
}

async function getCommit(root: string, id: string): Promise<Commit | null> {
  return readJSON<Commit>(join(vDir(root), COMMITS_DIR, `${id}.json`));
}

async function saveCommit(root: string, commit: Commit): Promise<void> {
  const dir = join(vDir(root), COMMITS_DIR);
  await mkdir(dir, { recursive: true });
  await writeJSON(join(dir, `${commit.id}.json`), commit);
}

/** Walk the commit chain from HEAD backwards. */
async function walkCommits(root: string, limit: number): Promise<Commit[]> {
  const commits: Commit[] = [];
  let id = await getHead(root);
  while (id && commits.length < limit) {
    const c = await getCommit(root, id);
    if (!c) break;
    commits.push(c);
    id = c.parentIds[0] ?? null;
  }
  return commits;
}

export const localBackend: Backend = {
  name: "local",

  async init(root: string): Promise<void> {
    const v = vDir(root);
    await mkdir(join(v, "objects"), { recursive: true });
    await mkdir(join(v, COMMITS_DIR), { recursive: true });
    const config: VConfig = { backend: "local", remotes: {} };
    await writeJSON(join(v, CONFIG_FILE), config);
    await writeFile(join(v, HEAD_FILE), "");
    await writeJSON(join(v, STAGING_FILE), []);
  },

  async detect(root: string): Promise<boolean> {
    try {
      await access(join(root, V_DIR, CONFIG_FILE));
      const cfg = await readJSON<VConfig>(join(root, V_DIR, CONFIG_FILE));
      return cfg?.backend === "local";
    } catch {
      return false;
    }
  },

  async add(root: string, paths: string[]): Promise<void> {
    const existing = await getStaging(root);
    const allFiles = await walkFiles(root, root);
    const toAdd: string[] = [];
    for (const p of paths) {
      if (p === ".") {
        toAdd.push(...allFiles);
      } else {
        const matching = allFiles.filter(
          (f) => f === p || f.startsWith(p + "/")
        );
        toAdd.push(...matching);
      }
    }
    const unique = [...new Set([...existing, ...toAdd])];
    await setStaging(root, unique);
  },

  async commit(root: string, message: string, author: string): Promise<Commit> {
    const staged = await getStaging(root);
    if (staged.length === 0) {
      throw new Error("Nothing to commit — stage files first with `v add`");
    }

    const files: FileEntry[] = [];
    for (const p of staged) {
      const fullPath = join(root, p);
      const content = await readFile(fullPath);
      const hash = await storeObject(vDir(root), content);
      const s = await stat(fullPath);
      files.push({ path: p, hash, size: s.size, mode: s.mode });
    }

    const headId = await getHead(root);
    const parentIds = headId ? [headId] : [];
    const timestamp = Date.now();
    const commitData = `${message}|${author}|${timestamp}|${parentIds.join(",")}|${files.map((f) => f.hash).join(",")}`;
    const id = createHash("sha256").update(commitData).digest("hex").slice(0, 12);

    const commit: Commit = { id, parentIds, message, author, timestamp, files };
    await saveCommit(root, commit);
    await setHead(root, id);
    await setStaging(root, []);
    return commit;
  },

  async log(root: string, limit = 20): Promise<Commit[]> {
    return walkCommits(root, limit);
  },

  async status(root: string): Promise<WorkingStatus> {
    const staged = await getStaging(root);
    const allFiles = await walkFiles(root, root);
    const headId = await getHead(root);

    let lastFiles = new Map<string, string>();
    if (headId) {
      const headCommit = await getCommit(root, headId);
      if (headCommit) {
        for (const f of headCommit.files) {
          lastFiles.set(f.path, f.hash);
        }
      }
    }

    const stagedDiffs: FileDiff[] = [];
    for (const p of staged) {
      const content = await readFile(join(root, p));
      const hash = hashContent(content);
      const old = lastFiles.get(p);
      if (!old) {
        stagedDiffs.push({ path: p, status: "added", newHash: hash });
      } else if (old !== hash) {
        stagedDiffs.push({ path: p, status: "modified", oldHash: old, newHash: hash });
      }
    }

    const unstagedDiffs: FileDiff[] = [];
    const stagedSet = new Set(staged);
    for (const [path, oldHash] of lastFiles) {
      if (!allFiles.includes(path)) {
        unstagedDiffs.push({ path, status: "deleted", oldHash });
      } else if (!stagedSet.has(path)) {
        const content = await readFile(join(root, path));
        const hash = hashContent(content);
        if (hash !== oldHash) {
          unstagedDiffs.push({ path, status: "modified", oldHash, newHash: hash });
        }
      }
    }

    const trackedSet = new Set([...staged, ...lastFiles.keys()]);
    const untracked = allFiles.filter((f) => !trackedSet.has(f));

    return { staged: stagedDiffs, unstaged: unstagedDiffs, untracked };
  },

  async diff(root: string): Promise<FileDiff[]> {
    const allFiles = await walkFiles(root, root);
    const headId = await getHead(root);
    const diffs: FileDiff[] = [];

    let lastFiles = new Map<string, string>();
    if (headId) {
      const headCommit = await getCommit(root, headId);
      if (headCommit) {
        for (const f of headCommit.files) {
          lastFiles.set(f.path, f.hash);
        }
      }
    }

    for (const p of allFiles) {
      const content = await readFile(join(root, p));
      const hash = hashContent(content);
      const old = lastFiles.get(p);
      if (!old) {
        diffs.push({ path: p, status: "added", newHash: hash });
      } else if (old !== hash) {
        diffs.push({ path: p, status: "modified", oldHash: old, newHash: hash });
      }
    }

    for (const [path] of lastFiles) {
      if (!allFiles.includes(path)) {
        diffs.push({ path, status: "deleted", oldHash: lastFiles.get(path) });
      }
    }

    return diffs;
  },

  async sync(_root: string, _remote?: string): Promise<void> {
    // Local-only backend: sync is a no-op unless remotes are configured.
    // For now, this is a placeholder for future remote push/pull.
    console.log("Local backend: nothing to sync (no remote configured).");
  },
};
