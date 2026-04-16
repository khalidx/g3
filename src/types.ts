/** Core types for the v version control system. */

export interface FileEntry {
  path: string;
  hash: string;
  size: number;
  mode: number;
}

/** A commit in the version history. */
export interface Commit {
  id: string;
  parentIds: string[];
  message: string;
  author: string;
  timestamp: number;
  files: FileEntry[];
}

/** Diff of a single file between two states. */
export interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted";
  oldHash?: string;
  newHash?: string;
}

/** Status of the working directory relative to last commit. */
export interface WorkingStatus {
  staged: FileDiff[];
  unstaged: FileDiff[];
  untracked: string[];
}

/** Configuration stored in .v/config.json */
export interface VConfig {
  backend: string;
  remotes: Record<string, string>;
  sync?: { url: string; enabled: boolean };
}

/** Event emitted during real-time sync. */
export interface SyncEvent {
  type: "file-change" | "file-delete";
  path: string;
  content?: Uint8Array;
  timestamp: number;
  peer: string;
}

/**
 * Backend interface — the core abstraction.
 * Each VCS backend (local, git, svn) implements this interface.
 */
export interface Backend {
  readonly name: string;

  /** Initialize a new repository at the given root path. */
  init(root: string): Promise<void>;

  /** Return true if root is a valid repo for this backend. */
  detect(root: string): Promise<boolean>;

  /** Stage files (by path patterns). */
  add(root: string, paths: string[]): Promise<void>;

  /** Create a commit from staged changes. */
  commit(root: string, message: string, author: string): Promise<Commit>;

  /** Return the commit log. */
  log(root: string, limit?: number): Promise<Commit[]>;

  /** Return the working directory status. */
  status(root: string): Promise<WorkingStatus>;

  /** Return the diff of current working tree vs last commit. */
  diff(root: string): Promise<FileDiff[]>;

  /** Sync with a remote (push+pull equivalent). */
  sync(root: string, remote?: string): Promise<void>;
}
