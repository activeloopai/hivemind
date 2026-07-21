/**
 * Race a promise against a deadline. Returns `fallback` ONLY when the deadline
 * elapses; a resolution or rejection of `p` propagates unchanged. This keeps a
 * real failure distinguishable from a true timeout (callers must not conflate
 * the two — e.g. recall telemetry counts `timeout` vs `error` separately).
 *
 * It is the CALLER's job to be failure-isolated if it can't tolerate a throw on
 * a latency-critical path (recall's findHit catches its own I/O errors).
 */
export function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  if (!(ms > 0)) return p; // no deadline → behave exactly like p (incl. rejection)
  return new Promise<T>((resolve, reject) => {
    // A Promise settles once: whichever of the timer or `p` lands first wins,
    // and the later call is a silent no-op — so no `settled` flag is needed.
    // We still clearTimeout when `p` lands first so a pending timer can't keep
    // a worker alive; .unref() covers the reverse (process exit) case.
    const timer = setTimeout(() => resolve(fallback), ms);
    timer.unref(); // Node Timeout — don't keep the process alive for the timer
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
