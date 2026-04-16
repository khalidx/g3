/** Real-time sync engine — CRDT-like live file synchronization via WebSocket. */

import { watch } from "fs";
import { readFile, writeFile, mkdir, unlink } from "fs/promises";
import { join, relative, dirname } from "path";
import { randomUUID } from "crypto";
import type { SyncEvent } from "./types.js";

const IGNORE_DIRS = new Set([".v", ".git", ".svn", "node_modules", ".DS_Store"]);

function shouldIgnore(path: string): boolean {
  const parts = path.split("/");
  return parts.some((p) => IGNORE_DIRS.has(p) || p.startsWith("."));
}

type PeerConnection = {
  id: string;
  send: (data: string) => void;
  close: () => void;
};

/**
 * SyncEngine manages real-time file synchronization.
 */
export class SyncEngine {
  private peers: Map<string, PeerConnection> = new Map();
  private root: string;
  private peerId: string;
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(root: string) {
    this.root = root;
    this.peerId = randomUUID().slice(0, 8);
  }

  /** Start watching the local directory for changes. */
  startWatching(): void {
    if (this.watcher) return;
    this.watcher = watch(this.root, { recursive: true }, async (_event, filename) => {
      if (!filename || shouldIgnore(filename)) return;
      try {
        const fullPath = join(this.root, filename);
        const content = await readFile(fullPath);
        const evt: SyncEvent = {
          type: "file-change",
          path: filename,
          content: new Uint8Array(content),
          timestamp: Date.now(),
          peer: this.peerId,
        };
        this.broadcast(evt);
      } catch {
        // File was deleted
        const evt: SyncEvent = {
          type: "file-delete",
          path: filename,
          timestamp: Date.now(),
          peer: this.peerId,
        };
        this.broadcast(evt);
      }
    });
    console.log(`[sync] Watching ${this.root} for changes (peer: ${this.peerId})`);
  }

  /** Stop watching. */
  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  /** Add a peer connection. */
  addPeer(peer: PeerConnection): void {
    this.peers.set(peer.id, peer);
    console.log(`[sync] Peer connected: ${peer.id}`);
  }

  /** Remove a peer. */
  removePeer(id: string): void {
    this.peers.delete(id);
    console.log(`[sync] Peer disconnected: ${id}`);
  }

  /** Broadcast an event to all peers. */
  private broadcast(evt: SyncEvent): void {
    const payload = JSON.stringify({
      ...evt,
      content: evt.content ? Buffer.from(evt.content).toString("base64") : undefined,
    });
    for (const peer of this.peers.values()) {
      try {
        peer.send(payload);
      } catch {
        this.removePeer(peer.id);
      }
    }
  }

  /** Apply an incoming sync event to the local filesystem. */
  async applyEvent(evt: SyncEvent): Promise<void> {
    if (evt.peer === this.peerId) return; // Ignore our own events

    const fullPath = join(this.root, evt.path);

    if (evt.type === "file-delete") {
      try {
        await unlink(fullPath);
        console.log(`[sync] Deleted: ${evt.path}`);
      } catch {
        // Already gone
      }
    } else if (evt.type === "file-change" && evt.content) {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, evt.content);
      console.log(`[sync] Updated: ${evt.path}`);
    }
  }

  /** Start a WebSocket sync server. */
  serve(port: number): void {
    this.startWatching();

    const engine = this;
    const wsPeerIds = new WeakMap<object, string>();

    Bun.serve({
      port,
      fetch(req, server) {
        if (server.upgrade(req)) return;
        return new Response("v sync server", { status: 200 });
      },
      websocket: {
        open(ws) {
          const id = randomUUID().slice(0, 8);
          wsPeerIds.set(ws, id);
          engine.addPeer({
            id,
            send: (data: string) => ws.send(data),
            close: () => ws.close(),
          });
        },
        message(ws, msg) {
          try {
            const raw = JSON.parse(typeof msg === "string" ? msg : new TextDecoder().decode(msg));
            const evt: SyncEvent = {
              ...raw,
              content: raw.content ? new Uint8Array(Buffer.from(raw.content, "base64")) : undefined,
            };
            engine.applyEvent(evt);
            const senderId = wsPeerIds.get(ws);
            for (const peer of engine.peers.values()) {
              if (peer.id !== senderId) {
                peer.send(typeof msg === "string" ? msg : new TextDecoder().decode(msg));
              }
            }
          } catch {
            // Malformed message, ignore
          }
        },
        close(ws) {
          const id = wsPeerIds.get(ws);
          if (id) engine.removePeer(id);
        },
      },
    });

    console.log(`[sync] Server listening on ws://localhost:${port}`);
  }

  /** Connect to a remote sync server as a client. */
  connect(url: string): void {
    this.startWatching();

    const engine = this;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log(`[sync] Connected to ${url}`);
      engine.addPeer({
        id: "server",
        send: (data: string) => ws.send(data),
        close: () => ws.close(),
      });
    };

    ws.onmessage = async (evt) => {
      try {
        const raw = JSON.parse(evt.data);
        const syncEvt: SyncEvent = {
          ...raw,
          content: raw.content ? new Uint8Array(Buffer.from(raw.content, "base64")) : undefined,
        };
        await engine.applyEvent(syncEvt);
      } catch {
        // Malformed
      }
    };

    ws.onclose = () => {
      console.log(`[sync] Disconnected from ${url}`);
      engine.removePeer("server");
    };
  }
}
