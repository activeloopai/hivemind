/**
 * Minimal HTTP server for `hivemind dashboard --serve`.
 *
 * Why this exists: on headless hosts (VMs over SSH, containers) the
 * default `xdg-open` path is a no-op — there's no GUI to launch.
 * Serving the rendered HTML over localhost lets the user click a URL
 * from their terminal:
 *
 * - VS Code / Cursor Remote-SSH auto-forwards the port and shows
 * "Open in browser" notification → opens in the integrated
 * Simple Browser tab.
 * - Manual SSH users can `ssh -L 8123:localhost:8123` and open in
 * their laptop browser.
 * - macOS / Linux GUI users: same flow, but the opener also
 * launches their default browser at the URL.
 *
 * Loopback-only by default: binds to 127.0.0.1 so the dashboard is
 * not exposed on the LAN even if the user runs it on a dev VM that
 * has 0.0.0.0 reachable. No --host override in v1; that would be a
 * footgun against credentials/skills counts that may be sensitive.
 *
 * Single route returns the HTML buffer that was rendered when the
 * server started. Re-running the command is cheap (sub-second);
 * "refresh while running" semantics are out of scope.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface ServeOptions {
  /** Fully-rendered HTML returned at GET /. */
  html: string;
  /** Preferred port. Defaults to 8123. Pass 0 for an ephemeral port
   * chosen by the kernel (tests use this). */
  port?: number;
  /** Bind address. Defaults to 127.0.0.1 (loopback). */
  host?: string;
}

export interface ServeHandle {
  /** Actual bound port. Differs from the requested port when the
   * caller passed 0, or when the preferred port was EADDRINUSE and
   * we fell back to an ephemeral one. */
  port: number;
  /** Bind address — surfaced so the caller can print the URL. */
  host: string;
  /** Resolves when the server stops listening (Ctrl+C, manual close). */
  stopped: Promise<void>;
  /** Stop serving. Promise resolves once all in-flight connections drain. */
  close(): Promise<void>;
}

const DEFAULT_PORT = 8123;
const DEFAULT_HOST = "127.0.0.1";

function handleRequest(html: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    // Strip the query string before route matching — `/?refresh=1` is
    // still the dashboard root, not a 404.
    const path = url.split("?")[0];
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(html);
      return;
    }
    if (req.method === "GET" && path === "/health") {
      // Plain probe surface for future "is the dashboard up?" checks
      // (e.g. a Cursor port-forward readiness gate).
      res.statusCode = 204;
      res.end();
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found. The dashboard lives at /.\n");
  };
}

/**
 * Bind `server` on `host:port`. Surfaces the actual port the kernel
 * assigned (`address().port`) — needed when caller passed 0. Errors
 * other than EADDRINUSE bubble; EADDRINUSE is handled one level up
 * via the explicit fallback in serveDashboardHtml.
 */
function tryListen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      const addr = server.address() as AddressInfo | string | null;
      if (!addr || typeof addr === "string") {
        // Unix-domain-socket bind doesn't apply here — we always
        // requested a TCP host:port — but the type union includes it,
        // so guard for the compiler and for the impossible-but-loud case.
        reject(new Error("server bound to a non-IP address"));
        return;
      }
      resolve(addr.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

/**
 * Start a dashboard server. Resolves once it's bound and ready.
 *
 * Port resolution order:
 * 1. caller-supplied opts.port
 * 2. on EADDRINUSE, fall back to port 0 (kernel-assigned)
 * 3. other errors propagate (e.g. EACCES on privileged ports)
 */
export async function serveDashboardHtml(opts: ServeOptions): Promise<ServeHandle> {
  const host = opts.host ?? DEFAULT_HOST;
  const requested = (opts.port === undefined || !Number.isFinite(opts.port) || opts.port < 0)
    ? DEFAULT_PORT
    : opts.port;

  const server = createServer(handleRequest(opts.html));

  let bound: number;
  try {
    bound = await tryListen(server, host, requested);
  } catch (e: any) {
    if (e?.code !== "EADDRINUSE") throw e;
    // Fresh server instance — the previous one already errored and is
    // in a poisoned state. createServer is cheap.
    const fallback = createServer(handleRequest(opts.html));
    bound = await tryListen(fallback, host, 0);
    // Swap the binding into the var the handle closes over so the
    // caller's `close()` actually closes the bound server.
    server.removeAllListeners();
    return makeHandle(fallback, host, bound);
  }

  return makeHandle(server, host, bound);
}

function makeHandle(server: Server, host: string, port: number): ServeHandle {
  let resolveStopped!: () => void;
  const stopped = new Promise<void>(resolve => {
    resolveStopped = resolve;
  });
  // 'close' fires after server.close() AND after every active
  // connection finishes (or is destroyed). It's the right "stopped"
  // signal — distinct from 'listening' ending.
  server.on("close", () => resolveStopped());
  return {
    host,
    port,
    stopped,
    close: () => new Promise<void>((resolve, reject) => {
      const forceQuitTimeout = setTimeout(() => {
        if (typeof server.closeAllConnections === "function") {
          server.closeAllConnections();
        }
      }, 2000);
      server.close(err => {
        clearTimeout(forceQuitTimeout);
        return err ? reject(err) : resolve();
      });
    }),
  };
}
  host?: string;
}

export interface ServeHandle {
  /** Actual bound port. Differs from the requested port when the
   *  caller passed 0, or when the preferred port was EADDRINUSE and
   *  we fell back to an ephemeral one. */
  port: number;
  /** Bind address — surfaced so the caller can print the URL. */
  host: string;
  /** Resolves when the server stops listening (Ctrl+C, manual close). */
  stopped: Promise<void>;
  /** Stop serving. Promise resolves once all in-flight connections drain. */
  close(): Promise<void>;
}

const DEFAULT_PORT = 8123;
const DEFAULT_HOST = "127.0.0.1";

function handleRequest(html: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    // Strip the query string before route matching — `/?refresh=1` is
    // still the dashboard root, not a 404.
    const path = url.split("?")[0];
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(html);
      return;
    }
    if (req.method === "GET" && path === "/health") {
      // Plain probe surface for future "is the dashboard up?" checks
      // (e.g. a Cursor port-forward readiness gate).
      res.statusCode = 204;
      res.end();
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found. The dashboard lives at /.\n");
  };
}

/**
 * Bind `server` on `host:port`. Surfaces the actual port the kernel
 * assigned (`address().port`) — needed when caller passed 0. Errors
 * other than EADDRINUSE bubble; EADDRINUSE is handled one level up
 * via the explicit fallback in serveDashboardHtml.
 */
function tryListen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      const addr = server.address() as AddressInfo | string | null;
      if (!addr || typeof addr === "string") {
        // Unix-domain-socket bind doesn't apply here — we always
        // requested a TCP host:port — but the type union includes it,
        // so guard for the compiler and for the impossible-but-loud case.
        reject(new Error("server bound to a non-IP address"));
        return;
      }
      resolve(addr.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

/**
 * Start a dashboard server. Resolves once it's bound and ready.
 *
 * Port resolution order:
 *   1. caller-supplied opts.port
 *   2. on EADDRINUSE, fall back to port 0 (kernel-assigned)
 *   3. other errors propagate (e.g. EACCES on privileged ports)
 */
export async function serveDashboardHtml(opts: ServeOptions): Promise<ServeHandle> {
  const host = opts.host ?? DEFAULT_HOST;
  const requested = (opts.port === undefined || !Number.isFinite(opts.port) || opts.port < 0)
    ? DEFAULT_PORT
    : opts.port;

  const server = createServer(handleRequest(opts.html));

  let bound: number;
  try {
    bound = await tryListen(server, host, requested);
  } catch (e: any) {
    if (e?.code !== "EADDRINUSE") throw e;
    // Fresh server instance — the previous one already errored and is
    // in a poisoned state. createServer is cheap.
    const fallback = createServer(handleRequest(opts.html));
    bound = await tryListen(fallback, host, 0);
    // Swap the binding into the var the handle closes over so the
    // caller's `close()` actually closes the bound server.
    server.removeAllListeners();
    return makeHandle(fallback, host, bound);
  }

  return makeHandle(server, host, bound);
}

function makeHandle(server: Server, host: string, port: number): ServeHandle {
  let resolveStopped!: () => void;
  const stopped = new Promise<void>(resolve => {
    resolveStopped = resolve;
  });
  // 'close' fires after server.close() AND after every active
  // connection finishes (or is destroyed). It's the right "stopped"
  // signal — distinct from 'listening' ending.
  server.on("close", () => resolveStopped());
  return {
    host,
    port,
    stopped,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    }),
  };
}
