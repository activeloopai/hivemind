import { describe, it, expect } from "vitest";
import {
  parseBashTokens,
  bashTouchesMemory,
  touchesMemory,
  TILDE_PATH,
} from "../../src/hooks/memory-path-utils.js";

const MEM = TILDE_PATH; // ~/.deeplake/memory

describe("parseBashTokens", () => {
  it("splits a simple command into one stage of argv tokens", () => {
    expect(parseBashTokens("cat foo.md")).toEqual([["cat", "foo.md"]]);
  });

  it("splits stages on ; | || && and newline", () => {
    expect(parseBashTokens("a 1; b 2 | c 3 || d 4 && e 5\nf 6")).toEqual([
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
      ["d", "4"],
      ["e", "5"],
      ["f", "6"],
    ]);
  });

  it("keeps separators inert inside quotes", () => {
    expect(parseBashTokens("echo 'a; b | c' \"d && e\"")).toEqual([
      ["echo", "'a; b | c'", '"d && e"'],
    ]);
  });

  it("emits > and >> as their own tokens, even unspaced", () => {
    expect(parseBashTokens("echo hi >file")).toEqual([["echo", "hi", ">", "file"]]);
    expect(parseBashTokens("echo hi >> file")).toEqual([["echo", "hi", ">>", "file"]]);
  });

  it("emits < as its own token, lumping << / <<< so they are not read-redirects", () => {
    expect(parseBashTokens("cat <file")).toEqual([["cat", "<", "file"]]);
    expect(parseBashTokens("cat <<EOF")).toEqual([["cat", "<<", "EOF"]]);
    expect(parseBashTokens("cat <<< word")).toEqual([["cat", "<<<", "word"]]);
  });

  it("escape consumes the next char outside quotes", () => {
    expect(parseBashTokens("echo a\\ b")).toEqual([["echo", "a\\ b"]]);
  });

  it("treats backslash as literal inside single quotes (bash semantics)", () => {
    // `'a\'` closes at the second quote; `; cat x` is a separate stage.
    expect(parseBashTokens("echo 'a\\' ; cat x")).toEqual([
      ["echo", "'a\\'"],
      ["cat", "x"],
    ]);
  });

  it("drops empty stages from leading/duplicate separators", () => {
    expect(parseBashTokens("; cat x ;; ls")).toEqual([["cat", "x"], ["ls"]]);
  });
});

describe("bashTouchesMemory", () => {
  // ── carve-out: inert mentions pass ──
  it.each(["echo", "printf", "claude"])("passes %s with the path as inert text", (prog) => {
    expect(bashTouchesMemory(`${prog} 'use the mount at ${MEM}/'`)).toBe(false);
  });

  it("passes a quoted passthrough program name", () => {
    expect(bashTouchesMemory(`"echo" '${MEM}/'`)).toBe(false);
  });

  it("passes commands that do not mention memory at all", () => {
    expect(bashTouchesMemory("ls -la /tmp")).toBe(false);
  });

  it("does not false-positive on a sibling path", () => {
    expect(bashTouchesMemory(`cat ${MEM}-backup/x`)).toBe(false);
  });

  // ── substitutions: no carve-out ──
  it("intercepts $() substitution touching memory inside a passthrough command", () => {
    expect(bashTouchesMemory(`echo $(cat ${MEM}/index.md)`)).toBe(true);
  });

  it("intercepts backtick substitution touching memory", () => {
    expect(bashTouchesMemory(`echo \`cat ${MEM}/index.md\``)).toBe(true);
  });

  it("intercepts <() process substitution touching memory", () => {
    expect(bashTouchesMemory(`echo <(cat ${MEM}/secrets.md)`)).toBe(true);
  });

  it("passes a substitution that does not touch memory", () => {
    expect(bashTouchesMemory("echo $(date)")).toBe(false);
  });

  // ── redirects: real interactions regardless of command ──
  it("intercepts > redirect into memory (documented write path)", () => {
    expect(bashTouchesMemory(`echo 'hi' > ${MEM}/note.md`)).toBe(true);
  });

  it("intercepts >> append into memory", () => {
    expect(bashTouchesMemory(`printf '%s' x >> '${MEM}/note.md'`)).toBe(true);
  });

  it("intercepts < read from memory", () => {
    expect(bashTouchesMemory(`claude -p 'summarize' < ${MEM}/index.md`)).toBe(true);
  });

  it("passes a redirect whose target is not memory", () => {
    expect(bashTouchesMemory("echo hi > /tmp/out.md")).toBe(false);
  });

  it("passes a trailing redirect with no target token", () => {
    expect(bashTouchesMemory("echo hi >")).toBe(false);
  });

  // ── default: any other command with a memory token is a real interaction ──
  it("intercepts a reader builtin on a memory path", () => {
    expect(bashTouchesMemory(`cat ${MEM}/index.md`)).toBe(true);
  });

  it("intercepts a quoted reader path", () => {
    expect(bashTouchesMemory(`cat "${MEM}/index.md"`)).toBe(true);
  });

  it("intercepts an interpreter with a memory-path prefix even when traversal targets elsewhere", () => {
    expect(bashTouchesMemory(`python3 ${MEM}/../../etc/passwd`)).toBe(true);
  });

  it("intercepts when a later stage touches memory even if the first is passthrough", () => {
    expect(bashTouchesMemory(`echo '${MEM}/' && cat ${MEM}/index.md`)).toBe(true);
  });

  it("intercepts a reader stage hidden behind a backslash in single quotes", () => {
    expect(bashTouchesMemory(`echo 'a\\' ; cat ${MEM}/index.md`)).toBe(true);
  });

  // ── heredoc interplay: quoted heredoc bodies are inert ──
  it("ignores a memory mention inside a quoted heredoc body", () => {
    expect(bashTouchesMemory(`cat <<'EOF' > /tmp/x\n${MEM}/\nEOF`)).toBe(false);
  });

  it("agrees with touchesMemory on the bare-path shapes it builds on", () => {
    expect(touchesMemory(`${MEM}/index.md`)).toBe(true);
    expect(touchesMemory("/tmp/other.md")).toBe(false);
  });
});
