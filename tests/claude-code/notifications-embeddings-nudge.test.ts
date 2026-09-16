import { describe, it, expect } from "vitest";

import { embeddingsNudgeRule } from "../../src/notifications/rules/embeddings-nudge.js";
import type { NotificationContext } from "../../src/notifications/types.js";

function ctx(over: Partial<NotificationContext>): NotificationContext {
  return { agent: "claude-code", creds: null, state: { shown: {} }, ...over };
}

const EXPECTED_BODY =
  "Run `hivemind embeddings install` to enable semantic search over your team's memory. Until then, memory search is keyword-only.";

describe("embeddingsNudgeRule", () => {
  it("fires when transformers are not installed", () => {
    const n = embeddingsNudgeRule.evaluate(ctx({ embeddingsStatus: "no-transformers" }));
    expect(n).not.toBeNull();
    expect(n!.id).toBe("embeddings-nudge");
    expect(n!.severity).toBe("warn");
    expect(n!.title).toBe("Semantic memory search is off — embeddings not enabled");
    expect(n!.body).toBe(EXPECTED_BODY);
    expect(n!.dedupKey).toEqual({ v: 1 });
  });

  it("fires on the default install, where the flag is seeded false and reads as user-disabled", () => {
    const n = embeddingsNudgeRule.evaluate(ctx({ embeddingsStatus: "user-disabled" }));
    expect(n).not.toBeNull();
    expect(n!.body).toBe(EXPECTED_BODY);
  });

  it("stays silent when embeddings are enabled", () => {
    expect(embeddingsNudgeRule.evaluate(ctx({ embeddingsStatus: "enabled" }))).toBeNull();
  });

  it("stays silent when embeddingsStatus is not provided (treat as enabled)", () => {
    expect(embeddingsNudgeRule.evaluate(ctx({}))).toBeNull();
  });
});
