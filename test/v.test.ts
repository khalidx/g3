import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { localBackend } from "../src/backends/local.js";
import { hashContent, storeObject, loadObject, hasObject } from "../src/store.js";
import { registerBackend, getBackend, detectBackend, listBackends } from "../src/registry.js";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "v-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("store", () => {
  test("hashContent returns consistent SHA-256 hex", () => {
    const data = new TextEncoder().encode("hello world");
    const h1 = hashContent(data);
    const h2 = hashContent(data);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  test("storeObject and loadObject roundtrip", async () => {
    const vDir = join(testDir, ".v");
    await mkdir(vDir, { recursive: true });
    const data = new TextEncoder().encode("test content");
    const hash = await storeObject(vDir, data);
    const loaded = await loadObject(vDir, hash);
    expect(loaded).not.toBeNull();
    expect(new TextDecoder().decode(loaded!)).toBe("test content");
  });

  test("hasObject returns true for stored objects", async () => {
    const vDir = join(testDir, ".v");
    await mkdir(vDir, { recursive: true });
    const data = new TextEncoder().encode("exists");
    const hash = await storeObject(vDir, data);
    expect(await hasObject(vDir, hash)).toBe(true);
    expect(await hasObject(vDir, "0000000000000000000000000000000000000000000000000000000000000000")).toBe(false);
  });
});

describe("registry", () => {
  test("registerBackend and getBackend", () => {
    registerBackend(localBackend);
    expect(getBackend("local")).toBe(localBackend);
    expect(getBackend("nonexistent")).toBeUndefined();
  });

  test("listBackends includes registered backends", () => {
    registerBackend(localBackend);
    const names = listBackends();
    expect(names).toContain("local");
  });

  test("detectBackend finds local backend", async () => {
    await localBackend.init(testDir);
    registerBackend(localBackend);
    const detected = await detectBackend(testDir);
    expect(detected).toBe(localBackend);
  });
});

describe("local backend", () => {
  test("init creates .v directory structure", async () => {
    await localBackend.init(testDir);
    const config = JSON.parse(await readFile(join(testDir, ".v", "config.json"), "utf-8"));
    expect(config.backend).toBe("local");
  });

  test("detect returns true after init", async () => {
    await localBackend.init(testDir);
    expect(await localBackend.detect(testDir)).toBe(true);
  });

  test("detect returns false for empty dir", async () => {
    expect(await localBackend.detect(testDir)).toBe(false);
  });

  test("add stages files", async () => {
    await localBackend.init(testDir);
    await writeFile(join(testDir, "hello.txt"), "hello world");
    await localBackend.add(testDir, ["hello.txt"]);
    const staging = JSON.parse(await readFile(join(testDir, ".v", "staging.json"), "utf-8"));
    expect(staging).toContain("hello.txt");
  });

  test("add . stages all files", async () => {
    await localBackend.init(testDir);
    await writeFile(join(testDir, "a.txt"), "aaa");
    await writeFile(join(testDir, "b.txt"), "bbb");
    await localBackend.add(testDir, ["."]);
    const staging = JSON.parse(await readFile(join(testDir, ".v", "staging.json"), "utf-8"));
    expect(staging).toContain("a.txt");
    expect(staging).toContain("b.txt");
  });

  test("commit creates a commit with files", async () => {
    await localBackend.init(testDir);
    await writeFile(join(testDir, "file.txt"), "content");
    await localBackend.add(testDir, ["file.txt"]);
    const commit = await localBackend.commit(testDir, "first commit", "tester");
    expect(commit.id).toBeTruthy();
    expect(commit.message).toBe("first commit");
    expect(commit.author).toBe("tester");
    expect(commit.files).toHaveLength(1);
    expect(commit.files[0].path).toBe("file.txt");
  });

  test("commit fails with nothing staged", async () => {
    await localBackend.init(testDir);
    expect(localBackend.commit(testDir, "empty", "tester")).rejects.toThrow("Nothing to commit");
  });

  test("log returns commits in reverse order", async () => {
    await localBackend.init(testDir);
    await writeFile(join(testDir, "a.txt"), "v1");
    await localBackend.add(testDir, ["a.txt"]);
    await localBackend.commit(testDir, "first", "tester");

    await writeFile(join(testDir, "a.txt"), "v2");
    await localBackend.add(testDir, ["a.txt"]);
    await localBackend.commit(testDir, "second", "tester");

    const log = await localBackend.log(testDir);
    expect(log).toHaveLength(2);
    expect(log[0].message).toBe("second");
    expect(log[1].message).toBe("first");
  });

  test("status shows staged, unstaged, and untracked", async () => {
    await localBackend.init(testDir);
    await writeFile(join(testDir, "tracked.txt"), "content");
    await localBackend.add(testDir, ["tracked.txt"]);
    await localBackend.commit(testDir, "init", "tester");

    // Modify tracked file (unstaged change)
    await writeFile(join(testDir, "tracked.txt"), "changed content");
    // Add new untracked file
    await writeFile(join(testDir, "new.txt"), "new");

    const st = await localBackend.status(testDir);
    expect(st.unstaged).toHaveLength(1);
    expect(st.unstaged[0].path).toBe("tracked.txt");
    expect(st.untracked).toContain("new.txt");
  });

  test("diff shows all changes vs last commit", async () => {
    await localBackend.init(testDir);
    await writeFile(join(testDir, "file.txt"), "original");
    await localBackend.add(testDir, ["file.txt"]);
    await localBackend.commit(testDir, "init", "tester");

    await writeFile(join(testDir, "file.txt"), "modified");
    await writeFile(join(testDir, "new.txt"), "new file");

    const diffs = await localBackend.diff(testDir);
    expect(diffs).toHaveLength(2);
    const modified = diffs.find((d) => d.path === "file.txt");
    const added = diffs.find((d) => d.path === "new.txt");
    expect(modified?.status).toBe("modified");
    expect(added?.status).toBe("added");
  });

  test("multiple commits form a chain via parentIds", async () => {
    await localBackend.init(testDir);
    await writeFile(join(testDir, "a.txt"), "v1");
    await localBackend.add(testDir, ["a.txt"]);
    const c1 = await localBackend.commit(testDir, "first", "tester");

    await writeFile(join(testDir, "a.txt"), "v2");
    await localBackend.add(testDir, ["a.txt"]);
    const c2 = await localBackend.commit(testDir, "second", "tester");

    expect(c1.parentIds).toHaveLength(0);
    expect(c2.parentIds).toContain(c1.id);
  });

  test("files in subdirectories are handled correctly", async () => {
    await localBackend.init(testDir);
    await mkdir(join(testDir, "sub"), { recursive: true });
    await writeFile(join(testDir, "sub", "deep.txt"), "deep content");
    await localBackend.add(testDir, ["."]);
    const commit = await localBackend.commit(testDir, "with subdir", "tester");
    const filePaths = commit.files.map((f) => f.path);
    expect(filePaths).toContain("sub/deep.txt");
  });
});

describe("CLI", () => {
  async function runV(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const proc = Bun.spawn(["bun", "run", join(import.meta.dir, "..", "src", "cli.ts"), ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  }

  test("v --help shows help text", async () => {
    const { stdout } = await runV(["--help"], testDir);
    expect(stdout).toContain("pluggable");
    expect(stdout).toContain("v <command>");
  });

  test("v --version shows version", async () => {
    const { stdout } = await runV(["--version"], testDir);
    expect(stdout).toContain("0.1.0");
  });

  test("v init creates a repository", async () => {
    const { stdout, exitCode } = await runV(["init"], testDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Initialized local repository");
  });

  test("v backends lists available backends", async () => {
    const { stdout } = await runV(["backends"], testDir);
    expect(stdout).toContain("local");
    expect(stdout).toContain("git");
    expect(stdout).toContain("svn");
  });

  test("full workflow: init, add, commit, log, status", async () => {
    await runV(["init"], testDir);
    await writeFile(join(testDir, "hello.txt"), "hello");

    const addResult = await runV(["add", "hello.txt"], testDir);
    expect(addResult.exitCode).toBe(0);

    const commitResult = await runV(["commit", "-m", "initial commit"], testDir);
    expect(commitResult.exitCode).toBe(0);
    expect(commitResult.stdout).toContain("initial commit");

    const logResult = await runV(["log"], testDir);
    expect(logResult.stdout).toContain("initial commit");

    const statusResult = await runV(["status"], testDir);
    expect(statusResult.stdout).toContain("clean");
  });
});
