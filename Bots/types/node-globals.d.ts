/**
 * Shim Node per l’IDE senza node_modules/@types/node in locale.
 * Runtime e compile restano sulla VPS; qui serve solo a far stare zitto tsserver.
 *
 * I `declare module "…" { export = any }` (non vuoti) sono obbligatori:
 * con `declare module "fs";` TypeScript tipizza `typeof import("fs")` come
 * oggetto vuoto/rotto → readdirSync torna `string[]` e randomBytes ha 0 args.
 */
declare function require(id: string): any;
declare namespace require {
  const cache: Record<string, any>;
  function resolve(id: string, options?: any): string;
  const main: any;
}
declare var __dirname: string;
declare var __filename: string;
declare var module: { exports: any };
declare var exports: any;
declare var process: any;
declare var Buffer: any;
type Buffer = any;
type BufferEncoding = any;
declare var global: any;
declare var console: any;

declare function setTimeout(handler: any, timeout?: any, ...args: any[]): any;
declare function clearTimeout(handle?: any): void;
declare function setInterval(handler: any, timeout?: any, ...args: any[]): any;
declare function clearInterval(handle?: any): void;
declare function setImmediate(handler: any, ...args: any[]): any;
declare function clearImmediate(handle?: any): void;
declare function queue(handler: any, ...args: any[]): any;

declare var URL: any;
declare var URLSearchParams: any;
declare var fetch: any;
declare var AbortController: any;
declare var AbortSignal: any;
declare var TextDecoder: any;
declare var TextEncoder: any;
declare var atob: any;
declare var btoa: any;
declare var structuredClone: any;
declare var performance: any;
declare var queueThis: any;
declare var FormData: any;
declare var Headers: any;
declare var Request: any;
declare var Response: any;
declare var Blob: any;
declare var File: any;
declare var ReadableStream: any;
declare var WritableStream: any;
declare var TransformStream: any;
declare var MessageChannel: any;
declare var MessagePort: any;
declare var Worker: any;
declare var SharedArrayBuffer: any;
declare var Atomics: any;
declare var FinalizationRegistry: any;
declare var WeakRef: any;
declare var DOMException: any;
declare var Event: any;
declare var EventTarget: any;
declare var CustomEvent: any;
declare var crypto: any;

declare module "node:path" { const mod: any; export = mod; }
declare module "path" { const mod: any; export = mod; }
declare module "node:fs" { const mod: any; export = mod; }
declare module "fs" { const mod: any; export = mod; }
declare module "fs/promises" { const mod: any; export = mod; }
declare module "node:crypto" { const mod: any; export = mod; }
declare module "crypto" { const mod: any; export = mod; }
declare module "node:util" { const mod: any; export = mod; }
declare module "util" { const mod: any; export = mod; }
declare module "node:os" { const mod: any; export = mod; }
declare module "os" { const mod: any; export = mod; }
declare module "node:url" { const mod: any; export = mod; }
declare module "url" { const mod: any; export = mod; }
declare module "node:http" { const mod: any; export = mod; }
declare module "http" { const mod: any; export = mod; }
declare module "node:https" { const mod: any; export = mod; }
declare module "https" { const mod: any; export = mod; }
declare module "node:stream" { const mod: any; export = mod; }
declare module "stream" { const mod: any; export = mod; }
declare module "node:events" { const mod: any; export = mod; }
declare module "events" { const mod: any; export = mod; }
declare module "node:child_process" { const mod: any; export = mod; }
declare module "child_process" { const mod: any; export = mod; }
declare module "node:buffer" { const mod: any; export = mod; }
declare module "buffer" { const mod: any; export = mod; }
declare module "node:module" { const mod: any; export = mod; }
declare module "module" { const mod: any; export = mod; }
declare module "node:timers" { const mod: any; export = mod; }
declare module "timers" { const mod: any; export = mod; }
declare module "node:worker_threads" { const mod: any; export = mod; }
declare module "worker_threads" { const mod: any; export = mod; }
declare module "node:net" { const mod: any; export = mod; }
declare module "net" { const mod: any; export = mod; }
declare module "node:zlib" { const mod: any; export = mod; }
declare module "zlib" { const mod: any; export = mod; }
declare module "node:querystring" { const mod: any; export = mod; }
declare module "querystring" { const mod: any; export = mod; }
declare module "node:readline" { const mod: any; export = mod; }
declare module "readline" { const mod: any; export = mod; }
declare module "node:assert" { const mod: any; export = mod; }
declare module "assert" { const mod: any; export = mod; }
declare module "node:perf_hooks" { const mod: any; export = mod; }
declare module "perf_hooks" { const mod: any; export = mod; }
declare module "node:dns" { const mod: any; export = mod; }
declare module "dns" { const mod: any; export = mod; }
declare module "node:tty" { const mod: any; export = mod; }
declare module "tty" { const mod: any; export = mod; }
declare module "node:string_decoder" { const mod: any; export = mod; }
declare module "string_decoder" { const mod: any; export = mod; }
declare module "node:async_hooks" { const mod: any; export = mod; }
declare module "async_hooks" { const mod: any; export = mod; }
declare module "node:diagnostics_channel" { const mod: any; export = mod; }
declare module "diagnostics_channel" { const mod: any; export = mod; }
