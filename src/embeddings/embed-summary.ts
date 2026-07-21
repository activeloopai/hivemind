// Robust summary embedding for the finalize (wiki-worker) path.
//
// Background: ~75% of production summary rows have a NULL summary_embedding,
// so proactive recall silently degrades to weak lexical matching for most of
// the corpus. A large share of those NULLs are NOT "embeddings disabled" — they
// are ENABLED users whose embed daemon was cold at the one moment finalize ran.
//
// EmbedClient.embed() is built for the latency-critical capture hook: on a cold
// daemon it returns null IMMEDIATELY while spawning the daemon in the
// background ("fire-and-forget on miss"). The wiki-worker is a detached
// background process, NOT latency-critical — so paying a one-time warmup +
// retry here turns the common cold-start NULL into a real embedding, with no
// effect on the hot capture path and no change to the opt-in semantics
// (callers still gate on embeddingsDisabled() before invoking this).
//
// Returns the embedding vector, or null when the daemon truly cannot be
// reached / embeddings are unavailable. Never throws — finalize must always
// proceed and write the summary, with NULL embedding as the graceful fallback.

import { EmbedClient } from "./client.js";
import type { EmbedKind } from "./protocol.js";

/** Subset of EmbedClient the helper depends on — lets tests inject a fake. */
export interface SummaryEmbedder {
  warmup(): Promise<boolean>;
  embed(text: string, kind?: EmbedKind): Promise<number[] | null>;
}

export interface EmbedSummaryOptions {
  /** Inject a client for testing. Defaults to a real EmbedClient. */
  client?: SummaryEmbedder;
  /** Path to the bundled embed-daemon.js, forwarded to the default client. */
  daemonEntry?: string;
  /** Optional log sink (wiki-worker's wlog). */
  log?: (msg: string) => void;
}

/**
 * Warm the daemon, then embed `text` with a single retry. The warmup spawns a
 * cold daemon and waits for its socket, so the subsequent embed() finds a ready
 * daemon instead of racing the fire-and-forget spawn and returning null.
 *
 * Flow:
 *   1. warmup() — spawn + wait for the daemon socket (best-effort).
 *   2. embed()  — first attempt against the (now hopefully warm) daemon.
 *   3. if null  — one retry, since warmup's own spawn may still have been
 *      settling when attempt 1 connected (recycle/handshake paths).
 */
export async function embedSummaryWithWarmup(
  text: string,
  kind: EmbedKind = "document",
  opts: EmbedSummaryOptions = {},
): Promise<number[] | null> {
  const log = opts.log ?? (() => {});
  const client = opts.client ?? new EmbedClient(opts.daemonEntry ? { daemonEntry: opts.daemonEntry } : {});

  try {
    const warm = await client.warmup();
    if (!warm) log("embed-summary: daemon warmup did not confirm ready; attempting embed anyway");

    let vec = await client.embed(text, kind);
    if (vec && vec.length > 0) return vec;

    // One retry: warmup may have spawned a daemon that became ready only after
    // the first connect attempt. The retry is cheap relative to losing the
    // embedding for the lifetime of the row.
    log("embed-summary: first attempt returned no vector; retrying once");
    vec = await client.embed(text, kind);
    return vec && vec.length > 0 ? vec : null;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`embed-summary: failed, writing NULL embedding: ${msg}`);
    return null;
  }
}
