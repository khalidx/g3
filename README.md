# v

A pluggable, lightweight version control system — compatible with git and svn.

Everything is a sync away.

## Features

- **Pluggable backends** — native local store, git, and svn backends
- **Unified interface** — same commands work across all backends
- **Content-addressable storage** — efficient object store with SHA-256 hashing
- **Real-time sync** — CRDT-like live file synchronization between peers via WebSocket
- **Small core** — under 1000 LOC of TypeScript
- **Library API** — use programmatically to store and version files

## Install

Requires [Bun](https://bun.sh).

```bash
# Clone and run directly
bun run src/cli.ts <command>

# Or link globally
bun link
v <command>
```

## Commands

```
v init [--backend local|git]     Initialize a new repository
v add <paths...>                 Stage files for commit
v commit -m <message>            Create a commit
v log [-n <count>]               Show commit history
v status                         Show working directory status
v diff                           Show uncommitted changes
v sync [remote]                  Sync with a remote
v sync --serve [port]            Start real-time sync server
v sync --connect <url>           Connect to a real-time sync server
v backends                       List available VCS backends
```

## Quick Start

```bash
# Initialize a new local repository
v init

# Add and commit files
v add .
v commit -m "initial commit"

# Check status and history
v status
v log

# Real-time sync between two directories
# Terminal 1:
v sync --serve 4040

# Terminal 2 (in another directory):
v sync --connect ws://localhost:4040
```

## Backends

| Backend | Description |
|---------|-------------|
| `local` | Native v storage with content-addressable object store |
| `git`   | Wraps git CLI — use v commands on existing git repos |
| `svn`   | Wraps svn CLI — read SVN repos through the v interface |

## Architecture

```
src/
  types.ts          Core type definitions and Backend interface
  store.ts          Content-addressable object store (SHA-256)
  registry.ts       Plugin registry for backends
  sync.ts           Real-time WebSocket sync engine
  cli.ts            CLI entry point
  index.ts          Public API exports
  backends/
    local.ts        Native local VCS backend
    git.ts          Git CLI wrapper backend
    svn.ts          SVN CLI wrapper backend
```

## API Usage

```typescript
import { localBackend, registerBackend, SyncEngine } from "v-vcs";

registerBackend(localBackend);
await localBackend.init("/path/to/repo");
await localBackend.add("/path/to/repo", ["."]);
await localBackend.commit("/path/to/repo", "my commit", "author");
const log = await localBackend.log("/path/to/repo");
```

## Testing

```bash
bun test
```

## License

MIT
