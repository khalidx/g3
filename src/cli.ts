/** v — CLI entry point for the pluggable, lightweight version control system. */

import { resolve } from "path";
import { registerBackend, detectBackend, getBackend, listBackends } from "./registry.js";
import { localBackend } from "./backends/local.js";
import { gitBackend } from "./backends/git.js";
import { svnBackend } from "./backends/svn.js";
import { SyncEngine } from "./sync.js";
import type { Backend } from "./types.js";

// Register all backends
registerBackend(localBackend);
registerBackend(gitBackend);
registerBackend(svnBackend);

const HELP = `v — a pluggable, lightweight version control system

Usage: v <command> [options]

Commands:
  init [--backend local|git]     Initialize a new repository
  add <paths...>                 Stage files for commit
  commit -m <message>            Create a commit
  log [-n <count>]               Show commit history
  status                         Show working directory status
  diff                           Show uncommitted changes
  sync [remote]                  Sync with a remote
  sync --serve [port]            Start real-time sync server
  sync --connect <url>           Connect to a real-time sync server
  backends                       List available VCS backends

Options:
  --help, -h                     Show this help
  --version                      Show version
`;

function parseArgs(argv: string[]) {
  const args = argv.slice(2); // skip bun and script path
  let command: string | undefined;
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (!command) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}

async function resolveBackend(root: string, backendName?: string): Promise<Backend> {
  if (backendName) {
    const b = getBackend(backendName);
    if (!b) throw new Error(`Unknown backend: ${backendName}`);
    return b;
  }
  const detected = await detectBackend(root);
  if (!detected) {
    throw new Error(
      "No v repository found. Run `v init` first, or specify --backend."
    );
  }
  return detected;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

async function main() {
  const { command, flags, positional } = parseArgs(process.argv);
  const root = resolve(".");

  if (flags.version) {
    console.log("v 0.1.0");
    return;
  }

  if (!command || flags.help || flags.h) {
    console.log(HELP);
    return;
  }

  try {
    switch (command) {
      case "init": {
        const backendName = (flags.backend as string) || "local";
        const backend = getBackend(backendName);
        if (!backend) {
          console.error(`Unknown backend: ${backendName}`);
          process.exit(1);
        }
        await backend.init(root);
        console.log(`Initialized ${backendName} repository in ${root}`);
        break;
      }

      case "add": {
        const paths = positional.length > 0 ? positional : ["."];
        const backend = await resolveBackend(root);
        await backend.add(root, paths);
        console.log(`Staged: ${paths.join(", ")}`);
        break;
      }

      case "commit": {
        const message = (flags.m as string) || (flags.message as string);
        if (!message) {
          console.error("Commit message required. Use: v commit -m <message>");
          process.exit(1);
        }
        const author = (flags.author as string) || process.env.USER || "anonymous";
        const backend = await resolveBackend(root);
        const commit = await backend.commit(root, message, author);
        console.log(`[${commit.id}] ${commit.message}`);
        console.log(`  ${commit.files.length} file(s) committed by ${commit.author}`);
        break;
      }

      case "log": {
        const limit = parseInt((flags.n as string) || "20", 10);
        const backend = await resolveBackend(root);
        const commits = await backend.log(root, limit);
        if (commits.length === 0) {
          console.log("No commits yet.");
        }
        for (const c of commits) {
          console.log(`\x1b[33m${c.id}\x1b[0m ${c.message}`);
          console.log(`  Author: ${c.author}  Date: ${formatTimestamp(c.timestamp)}`);
        }
        break;
      }

      case "status": {
        const backend = await resolveBackend(root);
        const st = await backend.status(root);
        if (st.staged.length > 0) {
          console.log("\x1b[32mStaged changes:\x1b[0m");
          for (const d of st.staged) console.log(`  ${d.status}: ${d.path}`);
        }
        if (st.unstaged.length > 0) {
          console.log("\x1b[31mUnstaged changes:\x1b[0m");
          for (const d of st.unstaged) console.log(`  ${d.status}: ${d.path}`);
        }
        if (st.untracked.length > 0) {
          console.log("\x1b[90mUntracked files:\x1b[0m");
          for (const f of st.untracked) console.log(`  ${f}`);
        }
        if (st.staged.length === 0 && st.unstaged.length === 0 && st.untracked.length === 0) {
          console.log("Working directory clean.");
        }
        break;
      }

      case "diff": {
        const backend = await resolveBackend(root);
        const diffs = await backend.diff(root);
        if (diffs.length === 0) {
          console.log("No changes.");
        }
        for (const d of diffs) {
          const color =
            d.status === "added" ? "\x1b[32m" :
            d.status === "deleted" ? "\x1b[31m" : "\x1b[33m";
          console.log(`${color}${d.status}\x1b[0m  ${d.path}`);
        }
        break;
      }

      case "sync": {
        if (flags.serve) {
          const port = typeof flags.serve === "string" ? parseInt(flags.serve, 10) : 4040;
          const engine = new SyncEngine(root);
          engine.serve(port);
          console.log("Press Ctrl+C to stop.");
          // Keep running
          await new Promise(() => {});
        } else if (flags.connect) {
          const url = flags.connect as string;
          const engine = new SyncEngine(root);
          engine.connect(url);
          console.log("Press Ctrl+C to disconnect.");
          await new Promise(() => {});
        } else {
          const remote = positional[0];
          const backend = await resolveBackend(root);
          await backend.sync(root, remote);
          console.log("Sync complete.");
        }
        break;
      }

      case "backends": {
        console.log("Available backends:");
        for (const name of listBackends()) {
          console.log(`  - ${name}`);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
