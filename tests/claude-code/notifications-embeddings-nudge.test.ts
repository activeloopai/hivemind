import { describe, it, expect } from "vitest";

import { embeddingsNudgeRule } from "../../src/notifications/rules/embeddings-nudge.js";
import type { NotificationContext } from "../../src/notifications/types.js";

function ctx(over: Partial<NotificationContext>): NotificationContext {
  return { agent: "claude-code", creds: null, state: { shown: {} }, ...over };
}

describe("embeddingsNudgeRule", () => {
  it("fires when transformers are not installed", () => {
    const n = embeddingsNudgeRule.evaluate(ctx({ embeddingsStatus: "no-transformers" }));
    expect(n).not.toBeNull();
    expect(n!.id).toBe("embeddings-nudge");
    expect(n!.severity).toBe("warn");
    expect(n!.title).toBe("Proactive recall is off — embeddings not installed");
    expect(n!.body).toContain("hivemind embeddings install");
    expect(n!.dedupKey).toEqual({ v: 1 });
  });

  it("stays silent when embeddings are enabled", () => {
    expect(embeddingsNudgeRule.evaluate(ctx({ embeddingsStatus: "enabled" }))).toBeNull();
  });

  it("stays silent when the user explicitly disabled embeddings (intentional opt-out)", () => {
    expect(embeddingsNudgeRule.evaluate(ctx({ embeddingsStatus: "user-disabled" }))).toBeNull();
  });

  it("stays silent when embeddingsStatus is not provided (treat as enabled)", () => {
    expect(embeddingsNudgeRule.evaluate(ctx({}))).toBeNull();
  });
});
