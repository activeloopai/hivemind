# Philosophy of Beekeeper-Suit

Beekeeper-Suit is the smallest part of the Army and the most important. It does no work; it only routes. That constraint is load-bearing.

---

## Why routing matters more than generalization

The primary orchestrator in any agentic system has a choice: try to be a polymath, or delegate to specialists. Polymath agents are confident, fast, and wrong often. Specialists are slower to invoke but produce outputs their authors can actually trust.

The Army is built on the second bet. Every Bee has a single, narrow domain; every Stinger is forged specifically for that domain; and Beekeeper-Suit exists so the orchestrator never has to guess which specialist owns which problem.

---

## The two rules

1. **The right Bee for the right job.** Never generalize work a specialist owns. If the user's request touches security, `security-worker-bee` is not a nice-to-have; it is the answer.
2. **Every Bee wields a Stinger.** Invoking an Bee without its Stinger is invoking an unarmed persona. Always pass the Stinger path when delegating.

---

## The ritual

When the `hive-registrar` skill forges a new Bee, registration with Beekeeper-Suit is the final step. Unregistered Bees are invisible. The pipeline is:

1. Command Brief.
2. Stinger (the paired Cursor skill under `.cursor/skills/`).
3. Subagent file (the Bee under `.cursor/agents/`).
4. Beekeeper-Suit registration (update roster + add guide).

Each phase produces an auditable artifact. Each phase is rerunnable. The whole pipeline is designed so that an Bee can be traced from idea to deployment without anyone opening a terminal log.

---

## Why guides, not a manifest

Beekeeper-Suit could be a one-page manifest: here's the roster, here are the routing rules, go. The guides exist because routing is judgment work. Knowing when a recall concern is actually an embeddings concern (invoke `embeddings-runtime-worker-bee`, not `retrieval-worker-bee`), or when a documentation task is actually a QA task (invoke `quality-worker-bee`, not `library-worker-bee`), requires context the manifest can't carry. That context lives in the guides.

A manifest tells the orchestrator what exists. A guide tells it what each Bee actually does, when it should be used, and what to do when someone routes it incorrectly. The second is what produces good delegations.

---

## The cost of getting routing wrong

Misrouting is worse than not routing at all. A wrong specialist will:

1. Do work the request didn't call for.
2. Produce an output in the wrong format, which the user then has to reconcile.
3. Exhaust the user's patience with the agentic system as a whole.

The cost of reading a guide before delegating is seconds. The cost of a misroute is a wasted turn plus a trust debit. Always read the guide.
