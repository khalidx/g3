/** SVN backend — wraps svn CLI to expose svn repos through the v interface. */

import { join } from "path";
import { access } from "fs/promises";
import type { Backend, Commit, FileDiff, WorkingStatus } from "../types.js";

async function svn(root: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["svn", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`svn ${args.join(" ")} failed: ${stderr.trim()}`);
  }
  return stdout.trim();
}

interface SvnLogEntry {
  revision: string;
  author: string;
  date: string;
  msg: string;
}

function parseSvnLog(xml: string): SvnLogEntry[] {
  const entries: SvnLogEntry[] = [];
  const logEntryRegex = /<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g;
  let match: RegExpExecArray | null;
  while ((match = logEntryRegex.exec(xml)) !== null) {
    const body = match[2];
    const author = body.match(/<author>(.*?)<\/author>/)?.[1] ?? "unknown";
    const date = body.match(/<date>(.*?)<\/date>/)?.[1] ?? "";
    const msg = body.match(/<msg>([\s\S]*?)<\/msg>/)?.[1]?.trim() ?? "";
    entries.push({ revision: match[1], author, date, msg });
  }
  return entries;
}

function parseSvnStatus(raw: string): WorkingStatus {
  const staged: FileDiff[] = [];
  const unstaged: FileDiff[] = [];
  const untracked: string[] = [];

  for (const line of raw.split("\n").filter(Boolean)) {
    const status = line[0];
    const path = line.slice(8).trim();
    if (!path) continue;
    if (status === "?") {
      untracked.push(path);
    } else if (status === "A") {
      unstaged.push({ path, status: "added" });
    } else if (status === "M") {
      unstaged.push({ path, status: "modified" });
    } else if (status === "D") {
      unstaged.push({ path, status: "deleted" });
    }
  }
  return { staged, unstaged, untracked };
}

export const svnBackend: Backend = {
  name: "svn",

  async init(root: string): Promise<void> {
    // svnadmin create is for server-side repos. For working copies, use checkout.
    throw new Error(
      "SVN init is not supported directly. Use `svn checkout <url>` to create a working copy, then `v` will detect it."
    );
  },

  async detect(root: string): Promise<boolean> {
    try {
      await access(join(root, ".svn"));
      return true;
    } catch {
      return false;
    }
  },

  async add(root: string, paths: string[]): Promise<void> {
    await svn(root, ["add", "--force", ...paths]);
  },

  async commit(root: string, message: string, _author: string): Promise<Commit> {
    const out = await svn(root, ["commit", "-m", message]);
    // Parse "Committed revision X."
    const revMatch = out.match(/Committed revision (\d+)/);
    const revision = revMatch?.[1] ?? "0";
    return {
      id: `r${revision}`,
      parentIds: [],
      message,
      author: _author,
      timestamp: Date.now(),
      files: [],
    };
  },

  async log(root: string, limit = 20): Promise<Commit[]> {
    const raw = await svn(root, ["log", "--xml", `-l`, `${limit}`]);
    return parseSvnLog(raw).map((e) => ({
      id: `r${e.revision}`,
      parentIds: [],
      message: e.msg,
      author: e.author,
      timestamp: new Date(e.date).getTime(),
      files: [],
    }));
  },

  async status(root: string): Promise<WorkingStatus> {
    const raw = await svn(root, ["status"]);
    return parseSvnStatus(raw);
  },

  async diff(root: string): Promise<FileDiff[]> {
    const raw = await svn(root, ["status"]);
    return parseSvnStatus(raw).unstaged;
  },

  async sync(root: string, _remote?: string): Promise<void> {
    await svn(root, ["update"]);
    // SVN commit is separate — sync here just means update (pull).
    console.log("SVN: updated working copy to latest revision.");
  },
};
