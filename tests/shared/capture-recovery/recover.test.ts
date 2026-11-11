import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, utimesSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findCaptureGaps, readLastLine, recoverCaptureGaps, recoveredEntry, indexTranscripts, claudeConfigRoots, type CaptureGap,
} from "../../../src/capture-recovery/recover.js";
import { maybeSpawnCaptureRecovery, captureRecoveryDisabled } from "../../../src/capture-recovery/trigger.js";

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 10, 12, 0);
const iso = (ms: number) => new Date(ms).toISOString();

let root: string;
let cacheDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cap-rec-"));
  cacheDir = join(root, "session-cache");
  mkdirSync(cacheDir);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const setMtime = (p: string, ms: number) => utimesSync(p, ms / 1000, ms / 1000);

/** A session that captured until `lastMs`, plus its transcript. */
function session(id: string, lastMs: number, transcript: string[], opts: { hook?: string; transcriptMtime?: number; hint?: string; cwd?: string; hooksFailed?: boolean } = {}) {
  const tp = join(root, `${id}.transcript.jsonl`);
  const lines = opts.hooksFailed === false ? transcript : [...transcript, hookFail(lastMs + 30_000)];
  writeFileSync(tp, lines.join("\n") + "\n");
  setMtime(tp, opts.transcriptMtime ?? NOW - 1 * MIN);
  const cp = join(cacheDir, `${id}.jsonl`);
  writeFileSync(cp, JSON.stringify({ id: "x", session_id: id, transcript_path: opts.hint ?? tp, cwd: opts.cwd ?? "/w/game", hook_event_name: opts.hook ?? "PostToolUse", timestamp: iso(lastMs) }) + "\n");
  setMtime(cp, lastMs);
  return { tp, cp };
}

const hookFail = (ms: number) =>
  JSON.stringify({ type: "attachment", timestamp: iso(ms), attachment: { type: "hook_non_blocking_error", command: 'node "${CLAUDE_PLUGIN_ROOT}/bundle/capture.js"', stderr: "Failed to run: Plugin directory does not exist" } });
const userLine = (ms: number, text: string, uuid = `u${ms}`) =>
  JSON.stringify({ type: "user", uuid, timestamp: iso(ms), cwd: "/w/game", message: { content: text } });

describe("findCaptureGaps", () => {
  it("finds a quiet session whose transcript kept growing", () => {
    const last = NOW - 3 * 86_400_000;
    session("dead", last, [userLine(last + MIN, "after")]);
    const gaps = findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ sessionId: "dead", cwd: "/w/game", lastCapturedMs: last });
  });

  it("leaves sessions that are capturing, finished, too old, not Claude, or the current one", () => {
    session("live", NOW - 5 * MIN, [userLine(NOW - 2 * MIN, "x")]);
    session("finished", NOW - 60 * MIN, [userLine(NOW - 61 * MIN, "x")], { transcriptMtime: NOW - 60 * MIN });
    session("ancient", NOW - 20 * 86_400_000, [userLine(NOW - 2 * MIN, "x")]);
    session("cursor", NOW - 60 * MIN, [userLine(NOW - 2 * MIN, "x")], { hook: "beforeSubmitPrompt" });
    session("me", NOW - 60 * MIN, [userLine(NOW - 2 * MIN, "x")]);
    writeFileSync(join(cacheDir, "notes.txt"), "x");
    const broken = join(cacheDir, "broken.jsonl");
    writeFileSync(broken, "{not json\n");
    setMtime(broken, NOW - 60 * MIN);
    expect(findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW, skipSessionId: "me" })).toEqual([]);
  });

  it("finds the transcript by session id when the cached path was redacted", () => {
    const last = NOW - 3 * 86_400_000;
    const projects = join(root, "cfg", "projects", "-home-u-game");
    mkdirSync(projects, { recursive: true });
    const real = join(projects, "dead.jsonl");
    writeFileSync(real, userLine(last + MIN, "after") + "\n");
    setMtime(real, NOW - MIN);
    session("dead", last, [], { hint: "/home/u/.claude/projects/********/********", cwd: "/home/u/********" });
    const idx = indexTranscripts([join(root, "cfg"), join(root, "nope")]);
    expect(idx.get("dead")).toBe(real);
    const gaps = findCaptureGaps({ cacheDir, transcripts: idx, now: NOW });
    expect(gaps).toEqual([{ sessionId: "dead", transcriptPath: real, cwd: "", lastCapturedMs: last }]);
    // A redacted hint with no indexed transcript is not a gap.
    expect(findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW })).toEqual([]);
  });

  it("looks for transcripts under CLAUDE_CONFIG_DIR and ~/.claude", () => {
    expect(claudeConfigRoots({ CLAUDE_CONFIG_DIR: "/cfg" })[0]).toBe("/cfg");
    expect(claudeConfigRoots({}).length).toBe(1);
  });

  it("returns nothing when the cache dir does not exist", () => {
    expect(findCaptureGaps({ cacheDir: join(root, "missing"), transcripts: new Map(), now: NOW })).toEqual([]);
  });
});

describe("readLastLine", () => {
  it("reads the last line across chunk boundaries and ignores trailing newlines", () => {
    const p = join(root, "f.jsonl");
    writeFileSync(p, "first\n" + "x".repeat(5000) + "\nlast-line\n\n");
    expect(readLastLine(p, 64)).toBe("last-line");
    writeFileSync(p, "only");
    expect(readLastLine(p, 2)).toBe("only");
    writeFileSync(p, "");
    expect(readLastLine(p)).toBeNull();
    expect(readLastLine(join(root, "nope"))).toBeNull();
  });
});

describe("recoverCaptureGaps", () => {
  it("writes the missing events in order and reports per session", async () => {
    const last = NOW - 2 * 86_400_000;
    session("dead", last, [userLine(last - MIN, "before"), userLine(last + MIN, "one"), userLine(last + 2 * MIN, "two")]);
    const written: string[] = [];
    const recovered: Array<[string, number]> = [];
    const r = await recoverCaptureGaps(findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW }), {
      writeEvent: async (_g, ev) => { written.push(ev.body.content as string); },
      onRecovered: (g, n) => recovered.push([g.sessionId, n]),
    });
    expect(written).toEqual(["one", "two"]);
    expect(r).toMatchObject({ sessions: 1, events: 2, failed: 0 });
    expect(recovered).toEqual([["dead", 2]]);
  });

  it("stops a session at the first failed write so the marker never skips an event", async () => {
    const last = NOW - 2 * 86_400_000;
    session("dead", last, [userLine(last + MIN, "one"), userLine(last + 2 * MIN, "two"), userLine(last + 3 * MIN, "three")]);
    const written: string[] = [];
    const logs: string[] = [];
    const r = await recoverCaptureGaps(findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW }), {
      log: (m) => logs.push(m),
      writeEvent: async (_g, ev) => {
        if (ev.body.content === "two") throw new Error("503");
        written.push(ev.body.content as string);
      },
    });
    expect(written).toEqual(["one"]);
    expect(r).toMatchObject({ events: 1, failed: 1 });
    expect(logs.join("\n")).toContain("write failed");
  });

  it("skips a session the accept hook rejects (directory opted out)", async () => {
    const last = NOW - 2 * 86_400_000;
    session("dead", last, [userLine(last + MIN, "one")]);
    const written: string[] = [];
    const seen: string[] = [];
    const r = await recoverCaptureGaps(findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW }), {
      accept: (_g, evs) => { seen.push(...evs.map((e) => e.cwd ?? "")); return false; },
      writeEvent: async (_g, ev) => { written.push(ev.body.content as string); },
    });
    expect(seen).toEqual(["/w/game"]);
    expect(written).toEqual([]);
    expect(r.events).toBe(0);
  });

  it("reports how far an opted-out session was skipped, and later runs never go behind it", async () => {
    const last = NOW - 2 * 86_400_000;
    session("dead", last, [userLine(last + MIN, "while opted out"), userLine(last + 5 * MIN, "also opted out")]);
    const skipped: Record<string, number> = {};
    await recoverCaptureGaps(findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW }), {
      accept: () => false,
      onSkipped: (g, upto) => { skipped[g.sessionId] = upto; },
      writeEvent: async () => {},
    });
    expect(skipped).toEqual({ dead: last + 5 * MIN });
    // Opt-out removed later: the skipped stretch is not uploaded.
    const written: string[] = [];
    await recoverCaptureGaps(findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW, floors: skipped }), {
      accept: () => true,
      writeEvent: async (_g, ev) => { written.push(String(ev.body.content)); },
    });
    expect(written).toEqual([]);
  });

  it("leaves uncaptured events alone when the capture hook never failed (opt-out, disabled, print mode)", async () => {
    const last = NOW - 2 * 86_400_000;
    session("printmode", last, [
      userLine(last + MIN, "typed while opted out"),
      JSON.stringify({ type: "assistant", uuid: "a1", timestamp: iso(last + 2 * MIN), message: { id: "m1", stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] } }),
    ], { hooksFailed: false });
    const written: string[] = [];
    const logs: string[] = [];
    const r = await recoverCaptureGaps(findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW }), {
      log: (m) => logs.push(m),
      writeEvent: async (_g, ev) => { written.push(String(ev.body.content)); },
    });
    expect(written).toEqual([]);
    expect(r.events).toBe(0);
    expect(logs.join("\n")).toContain("no failed capture hook");
  });

  it("caps events per run", async () => {
    const last = NOW - 2 * 86_400_000;
    session("dead", last, [1, 2, 3, 4].map((i) => userLine(last + i * MIN, `p${i}`)));
    const written: string[] = [];
    await recoverCaptureGaps(findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW }), {
      maxEvents: 2,
      writeEvent: async (_g, ev) => { written.push(ev.body.content as string); },
    });
    expect(written).toEqual(["p1", "p2"]);
  });

  it("is idempotent: once recovered events are in the cache, the next run finds nothing", async () => {
    const last = NOW - 2 * 86_400_000;
    const { cp } = session("dead", last, [userLine(last + MIN, "one"), userLine(last + 2 * MIN, "two")]);
    const writeEvent = async (g: CaptureGap, ev: Parameters<typeof recoveredEntry>[2]) => {
      appendFileSync(cp, JSON.stringify(recoveredEntry(g.sessionId, g, ev)) + "\n");
    };
    expect((await recoverCaptureGaps(findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW }), { writeEvent })).events).toBe(2);
    // Later run (cache now quiet again, transcript unchanged since).
    setMtime(cp, NOW - 30 * MIN);
    const again = findCaptureGaps({ cacheDir, transcripts: new Map(), now: NOW });
    const r = await recoverCaptureGaps(again, { writeEvent });
    expect(r.events).toBe(0);
    const lines = readFileSync(cp, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[2])).toMatchObject({ type: "user_message", content: "two", recovered: true, hook_event_name: "UserPromptSubmit", session_id: "dead" });
  });

  it("counts an unreadable transcript as failed and moves on", async () => {
    const gap: CaptureGap = { sessionId: "x", transcriptPath: root /* a directory */, cwd: "", lastCapturedMs: 0 };
    const r = await recoverCaptureGaps([gap, { ...gap, transcriptPath: join(root, "missing") }], { writeEvent: async () => {} });
    expect(r).toMatchObject({ events: 0, failed: 1 });
  });
});

describe("maybeSpawnCaptureRecovery", () => {
  const prev = { ...process.env };
  afterEach(() => { process.env = { ...prev }; });

  it("spawns at most once per interval, always when the interval is 0", () => {
    const spawned: string[][] = [];
    const spawn = (p: string, a: readonly string[]) => { spawned.push([p, ...a]); };
    const stateDir = join(root, "state");
    expect(maybeSpawnCaptureRecovery("/b", "s1", spawn, { stateDir, now: NOW })).toBe(true);
    setMtime(join(stateDir, "last-run"), NOW);
    expect(maybeSpawnCaptureRecovery("/b", "s1", spawn, { stateDir, now: NOW + 10 * MIN })).toBe(false);
    setMtime(join(stateDir, "last-run"), NOW - 31 * MIN);
    expect(maybeSpawnCaptureRecovery("/b", "s2", spawn, { stateDir, now: NOW })).toBe(true);
    expect(maybeSpawnCaptureRecovery("/b", "s3", spawn, { stateDir, now: NOW, intervalMs: 0 })).toBe(true);
    expect(spawned).toEqual([
      ["/b/capture-recovery-worker.js", "s1"],
      ["/b/capture-recovery-worker.js", "s2"],
      ["/b/capture-recovery-worker.js", "s3"],
    ]);
  });

  it("does nothing when capture or recovery is turned off, and never throws", () => {
    const spawn = () => { throw new Error("boom"); };
    process.env.HIVEMIND_CAPTURE_RECOVERY = "false";
    expect(captureRecoveryDisabled()).toBe(true);
    expect(maybeSpawnCaptureRecovery("/b", "s", spawn, { stateDir: join(root, "s1") })).toBe(false);
    delete process.env.HIVEMIND_CAPTURE_RECOVERY;
    process.env.HIVEMIND_CAPTURE = "false";
    expect(maybeSpawnCaptureRecovery("/b", "s", spawn, { stateDir: join(root, "s2") })).toBe(false);
    delete process.env.HIVEMIND_CAPTURE;
    expect(maybeSpawnCaptureRecovery("/b", "s", spawn, { stateDir: join(root, "s3") })).toBe(false);
    expect(existsSync(join(root, "s3", "last-run"))).toBe(true);
  });
});
