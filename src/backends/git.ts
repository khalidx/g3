/** Git backend — wraps git CLI to expose git repos through the v interface. */

import { join } from "path";
import { access } from "fs/promises";
import type { Backend, Commit, FileEntry, FileDiff, WorkingStatus } from "../types.js";

async function git(root: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
  return stdout.trim();
}

function parseGitLog(raw: string): Commit[] {
  if (!raw) return [];
  return raw.split("\x00").filter(Boolean).map((entry) => {
    const [id, parentStr, author, timestampStr, message] = entry.split("\x01");
    return {
      id,
      parentIds: parentStr ? parentStr.split(" ") : [],
      author,
      timestamp: parseInt(timestampStr, 10) * 1000,
      message,
      files: [],
    };
  });
}

function parseGitStatus(raw: string): WorkingStatus {
  const staged: FileDiff[] = [];
  const unstaged: FileDiff[] = [];
  const untracked: string[] = [];

  for (const line of raw.split("\n").filter(Boolean)) {
    const x = line[0]; // index status
    const y = line[1]; // worktree status
    const path = line.slice(3);

    if (x === "?" && y === "?") {
      untracked.push(path);
    } else {
      if (x === "A") staged.push({ path, status: "added" });
      else if (x === "M") staged.push({ path, status: "modified" });
      else if (x === "D") staged.push({ path, status: "deleted" });

      if (y === "M") unstaged.push({ path, status: "modified" });
      else if (y === "D") unstaged.push({ path, status: "deleted" });
    }
  }
  return { staged, unstaged, untracked };
}

export const gitBackend: Backend = {
  name: "git",

  async init(root: string): Promise<void> {
    await git(root, ["init"]);
  },

  async detect(root: string): Promise<boolean> {
    try {
      await access(join(root, ".git"));
      return true;
    } catch {
      return false;
    }
  },

  async add(root: string, paths: string[]): Promise<void> {
    await git(root, ["add", ...paths]);
  },

  async commit(root: string, message: string, author: string): Promise<Commit> {
    const env = { GIT_AUTHOR_NAME: author, GIT_COMMITTER_NAME: author };
    const proc = Bun.spawn(
      ["git", "commit", "-m", message, "--author", `${author} <${author}@v>`],
      { cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } }
    );
    await proc.exited;
    const id = await git(root, ["rev-parse", "HEAD"]);
    const log = await git(root, [
      "log", "-1", "--format=%H%x01%P%x01%an%x01%at%x01%s",
    ]);
    const [, parentStr, auth, ts, msg] = log.split("\x01");
    return {
      id,
      parentIds: parentStr ? parentStr.split(" ") : [],
      author: auth,
      timestamp: parseInt(ts, 10) * 1000,
      message: msg,
      files: [],
    };
  },

  async log(root: string, limit = 20): Promise<Commit[]> {
    const raw = await git(root, [
      "log",
      `-${limit}`,
      "--format=%H%x01%P%x01%an%x01%at%x01%s%x00",
    ]);
    return parseGitLog(raw);
  },

  async status(root: string): Promise<WorkingStatus> {
    const raw = await git(root, ["status", "--porcelain"]);
    return parseGitStatus(raw);
  },

  async diff(root: string): Promise<FileDiff[]> {
    const raw = await git(root, ["diff", "--name-status"]);
    if (!raw) return [];
    return raw.split("\n").filter(Boolean).map((line) => {
      const [statusChar, ...pathParts] = line.split("\t");
      const path = pathParts.join("\t");
      const status =
        statusChar === "A" ? "added" :
        statusChar === "D" ? "deleted" : "modified";
      return { path, status };
    });
  },

  async sync(root: string, remote = "origin"): Promise<void> {
    try {
      await git(root, ["pull", "--rebase", remote]);
    } catch {
      // Might fail if no upstream — that's OK
    }
    try {
      await git(root, ["push", remote]);
    } catch {
      // Might fail if no remote — that's OK
    }
  },
};
