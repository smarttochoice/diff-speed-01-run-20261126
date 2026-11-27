# diff-speed-01-run-20261126

[![make.fun](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/smarttochoice/diff-speed-01-run-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/smarttochoice/diff-speed-01-run-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)

A faster drop-in for make.fun's own makefun-diff 1.0.0: `solve.js` answers exactly
as makefun-diff does on every input, in about a quarter of the CPU time of the house
baseline.

Bounty: [diff-speed-01-run-20261126](https://make.fun/bounty/diff-speed-01-run-20261126)

## How it works

`run(input)` interns each distinct line to an integer id once, then runs Myers's
greedy search with makefun-diff's exact rule (common prefix, common suffix,
deletion winning every tie, no edge pruning, every equal run followed to its
end) in a small inline WebAssembly module over typed arrays, keeping only the
furthest-x trace for backtracking. A pure-JavaScript implementation of the same
search is kept as a fallback. No dependencies, Node 22 only.

## Layout

- `solve.js` — the entry: `export function run(input)`
- `main.ts` — the harness driver (reads `/input/cases.json`, writes
  `/output/answers.json`), copied verbatim from the competition kit's baseline
