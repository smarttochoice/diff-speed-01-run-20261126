// Fast drop-in for makefun-diff 1.0.0 (make.fun's own line diff).
//
// run(input) returns exactly what makefun-diff 1.0.0's diffPatch returns for
// every input. The search is Myers's greedy search with the reference's rule
// (vendor/makefun-diff/index.js, header): common prefix, then common suffix,
// then the greedy search over the middle, diagonals k = -d..d in steps of 2,
// deletion winning every tie, no move past either text's end, no edge-diagonal
// pruning, every equal run followed to its end. Backtracking replays the same
// predecessor choice from the stored furthest-x trace, so the edit script —
// and the patch rendered from it — is the reference's, line for line.
//
// Speed: lines are interned to integer ids once, and the search runs in a
// small WebAssembly module (myers.wasm, embedded below as base64; compiled
// from AssemblyScript, no imports, no runtime) over typed arrays. A pure
// JavaScript implementation of the same search is kept as a fallback and runs
// when WebAssembly is unavailable or the module declines a case.

/** The patch's first word. */
const FORMAT = 'makefun-diff/1';

/** The kept lines a hunk shows before and after each change run. */
const CONTEXT = 3;

const KEEP = 0;
const DELETE = 1;
const INSERT = 2;

/** Trace sentinel: no path reaches this diagonal at this depth (x is >= -1). */
const UNDEF = -2;

// ---------------------------------------------------------------- WebAssembly core

/** The compiled myers.wasm (AssemblyScript, --runtime stub, no imports). */
const WASM_B64 =
  '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';

/** WASM memory layout (byte offsets): A at 0, B at 262144, ops at 524288. */
const WASM_A_OFF = 0;
const WASM_B_OFF = 262144;
const WASM_OPS_OFF = 524288;
/** Most lines either text may hold (A and B each get a 256 KiB slot). */
const WASM_MAX_LINES = 65536;

/** The instantiated module, or null when WebAssembly is unavailable. */
let wasm = null;
try {
  const module = new WebAssembly.Module(Buffer.from(WASM_B64, 'base64'));
  const instance = new WebAssembly.Instance(module);
  wasm = { memory: instance.exports.memory, solve: instance.exports.solve };
} catch {
  wasm = null;
}

/**
 * The edit script's runs over the full texts, [{ kind, count }], from the
 * WebAssembly core. Returns null when the core declines the case.
 */
function wasmRuns(A, B, n, m) {
  if (wasm === null || n > WASM_MAX_LINES || m > WASM_MAX_LINES) return null;
  const mem = wasm.memory;
  new Int32Array(mem.buffer, WASM_A_OFF, n).set(A);
  new Int32Array(mem.buffer, WASM_B_OFF, m).set(B);
  const opsCount = wasm.solve(n, m);
  if (opsCount < 0) return null;
  // The memory may have grown during the call: re-read its buffer.
  const opsBuf = new Int32Array(wasm.memory.buffer, WASM_OPS_OFF, opsCount * 2);
  const runs = [];
  for (let i = 0; i < opsCount; i++) {
    const kind = opsBuf[i * 2];
    const count = opsBuf[i * 2 + 1];
    const last = runs.length > 0 ? runs[runs.length - 1] : undefined;
    if (last !== undefined && last[0] === kind) last[1] += count;
    else runs.push([kind, count]);
  }
  return runs;
}

// ---------------------------------------------------------------- JavaScript fallback

/** Trace index of diagonal k at depth d: V_d lives at [d*d, d*d + d], k = 2j - d. */
function tidx(d, k) {
  return d * d + ((k + d) >> 1);
}

/**
 * Myers's greedy search over the middle slices (integer line ids), exactly
 * the reference's rule. Returns { D, kD, trace }: the first depth reaching
 * both ends, its diagonal, and the flat furthest-x trace.
 */
function myers(A, B, N, M) {
  let cap = 1 << 22;
  let trace = new Int32Array(cap);
  // Depth 0: the snake from (-1, -1) on diagonal 0.
  let x = -1;
  let y = -1;
  while (x + 1 < N && y + 1 < M && A[x + 1] === B[y + 1]) {
    x++;
    y++;
  }
  trace[0] = x;
  if (x + 1 >= N && y + 1 >= M) return { D: 0, kD: 0, trace };
  const maxEdit = N + M;
  for (let d = 1; d <= maxEdit; d++) {
    const baseCur = d * d;
    if (baseCur + d + 1 > cap) {
      cap *= 2;
      const grown = new Int32Array(cap);
      grown.set(trace);
      trace = grown;
    }
    const basePrev = (d - 1) * (d - 1);
    for (let j = 0; j <= d; j++) {
      const k = 2 * j - d;
      // The (d-1)-paths on k-1 (a deletion) and k+1 (an insertion); a diagonal
      // outside -(d-1)..(d-1) holds no path at depth d-1.
      const rm = j > 0 ? trace[basePrev + j - 1] : UNDEF;
      const ad = j < d ? trace[basePrev + j] : UNDEF;
      const canRemove = rm !== UNDEF && rm + 1 < N;
      const canAdd = ad !== UNDEF && ad - k < M;
      const byDel = canRemove ? rm + 1 : UNDEF;
      const byIns = canAdd ? ad : UNDEF;
      if (byDel === UNDEF && byIns === UNDEF) {
        trace[baseCur + j] = UNDEF;
        continue;
      }
      // Furthest into the old text wins; the deletion wins every tie.
      x = byDel >= byIns ? rm + 1 : ad;
      y = x - k;
      while (x + 1 < N && y + 1 < M && A[x + 1] === B[y + 1]) {
        x++;
        y++;
      }
      trace[baseCur + j] = x;
      if (x + 1 >= N && y + 1 >= M) return { D: d, kD: k, trace };
    }
  }
  throw new Error('makefun-diff: the search ended without reaching both ends');
}

/**
 * The edit script's runs over the middle slices, [{ kind, count }], by
 * walking the winning path back through the trace and replaying, at each
 * depth, the same predecessor choice the forward search made.
 */
function backtrack(N, M, D, kD, trace) {
  const ops = [];
  let x = trace[tidx(D, kD)];
  let y = x - kD;
  for (let d = D; d >= 1; d--) {
    const k = x - y;
    const basePrev = (d - 1) * (d - 1);
    const rm = k > -d ? trace[basePrev + ((k + d - 2) >> 1)] : UNDEF;
    const ad = k < d ? trace[basePrev + ((k + d) >> 1)] : UNDEF;
    const canRemove = rm !== UNDEF && rm + 1 < N;
    const canAdd = ad !== UNDEF && ad - k < M;
    const byDel = canRemove ? rm + 1 : UNDEF;
    const byIns = canAdd ? ad : UNDEF;
    if (byDel >= byIns) {
      const snake = x - (rm + 1);
      if (snake > 0) ops.push([KEEP, snake]);
      ops.push([DELETE, 1]);
      x = rm;
      y = rm - (k - 1);
    } else {
      const snake = x - ad;
      if (snake > 0) ops.push([KEEP, snake]);
      ops.push([INSERT, 1]);
      x = ad;
      y = ad - (k + 1);
    }
  }
  const firstSnake = x + 1;
  if (firstSnake > 0) ops.push([KEEP, firstSnake]);
  ops.reverse();
  // Adjacent runs of one kind are one run (the reference merges them as it
  // extends a path: a second edit of the same kind joins the first when no
  // kept line sits between them).
  const runs = [];
  for (let i = 0; i < ops.length; i++) {
    const last = runs.length > 0 ? runs[runs.length - 1] : undefined;
    if (last !== undefined && last[0] === ops[i][0]) last[1] += ops[i][1];
    else runs.push([ops[i][0], ops[i][1]]);
  }
  return runs;
}

/** The full runs over both texts via the JavaScript search. */
function jsRuns(A, B, n, m) {
  let prefix = 0;
  while (prefix < n && prefix < m && A[prefix] === B[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && A[n - 1 - suffix] === B[m - 1 - suffix]) suffix++;
  const N = n - prefix - suffix;
  const M = m - prefix - suffix;
  const { D, kD, trace } = myers(A.subarray(prefix, n - suffix), B.subarray(prefix, m - suffix), N, M);
  const runs = [];
  if (prefix > 0) runs.push([KEEP, prefix]);
  for (const r of backtrack(N, M, D, kD, trace)) runs.push(r);
  if (suffix > 0) runs.push([KEEP, suffix]);
  return runs;
}

// ---------------------------------------------------------------- rendering

/** One patch line: its op, the line, a newline, and "%" when it had none. */
function pushLine(out, op, parts, i) {
  if (i < parts.length - 1) out.push(op + parts[i] + '\n');
  else out.push(op + parts[i] + '\n%\n');
}

/** makefun-diff 1.0.0's answer for one case's input. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  // Lines: a text is cut after every "\n", the only separator; a last line
  // with no "\n" is a line too. parts[i] is line i without its "\n"; line i
  // carries one exactly when i < parts.length - 1.
  const oldParts = input.old.split('\n');
  const newParts = input.new.split('\n');
  const n = oldParts.length - 1 + (oldParts[oldParts.length - 1] !== '' ? 1 : 0);
  const m = newParts.length - 1 + (newParts[newParts.length - 1] !== '' ? 1 : 0);

  // Intern each distinct line body once; a line's id is its body id shifted
  // with its newline bit, so two lines are equal exactly when their ids are.
  const ids = new Map();
  const A = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const s = oldParts[i];
    let b = ids.get(s);
    if (b === undefined) {
      b = ids.size;
      ids.set(s, b);
    }
    A[i] = (b << 1) | (i < oldParts.length - 1 ? 0 : 1);
  }
  const B = new Int32Array(m);
  for (let j = 0; j < m; j++) {
    const s = newParts[j];
    let b = ids.get(s);
    if (b === undefined) {
      b = ids.size;
      ids.set(s, b);
    }
    B[j] = (b << 1) | (j < newParts.length - 1 ? 0 : 1);
  }

  // The edit script's runs, from the WebAssembly core or the JavaScript one.
  const runs = wasmRuns(A, B, n, m) ?? jsRuns(A, B, n, m);

  // The change runs: each a stretch of deletions and insertions between two
  // kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (let i = 0; i < runs.length; i++) {
    const kind = runs[i][0];
    const count = runs[i][1];
    if (kind === KEEP) {
      o += count;
      p += count;
      continue;
    }
    let c = changes.length > 0 ? changes[changes.length - 1] : undefined;
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (kind === DELETE) {
      c.dels += count;
      o += count;
      deleted += count;
    } else {
      c.ins += count;
      p += count;
      inserted += count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks.length > 0 ? hunks[hunks.length - 1] : undefined;
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }
  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) pushLine(out, '=', oldParts, at);
      for (let i = 0; i < c.dels; i++) pushLine(out, '-', oldParts, c.o + i);
      for (let i = 0; i < c.ins; i++) pushLine(out, '+', newParts, c.p + i);
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) pushLine(out, '=', oldParts, at);
  }
  return out.join('');
}
