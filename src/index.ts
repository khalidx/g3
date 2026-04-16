/** Public API for programmatic usage of v. */

export type { Backend, Commit, FileEntry, FileDiff, WorkingStatus, VConfig, SyncEvent } from "./types.js";
export { registerBackend, getBackend, detectBackend, listBackends } from "./registry.js";
export { hashContent, storeObject, loadObject, hasObject } from "./store.js";
export { localBackend } from "./backends/local.js";
export { gitBackend } from "./backends/git.js";
export { svnBackend } from "./backends/svn.js";
export { SyncEngine } from "./sync.js";
