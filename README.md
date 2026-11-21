[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/tukiyatlampu/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/tukiyatlampu/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

# csv-reader-speed-01 — fast drop-in for csv-reader 1.0.0

`run(input)` in `solve.js` returns exactly what csv-reader 1.0.0 returns for
`{text, header}` — `{columns, rows, errors}` — including its broken-row policy:
BOM dropped, LF/CRLF record ends, empty lines are no records, stray CRs dropped
(`stray_cr`), quoted fields with `""` escapes and CR/LF normalised to LF,
junk after a closing quote (`quote_junk`), unterminated quotes read as literal
(`unterminated_quote`), short rows padded (`short_row`) and long rows cut
(`long_row`) to the first record's width, errors in encounter order with the
record's start line and row index.

## How it is faster

The reference reads one character at a time. This one parses with
`indexOf`/`slice`/`split` jumps instead:

- **Fast path:** a record whose line holds no quote and no stray CR is one
  `slice` + `split(',')`.
- **Slow path:** field by field — quoted fields found by `indexOf('"')` jumps,
  unquoted fields by `indexOf(',')`/`indexOf('\n')`. Every search is bounded
  to the current line or field, so a quote-free or CR-free text can never
  trigger an end-of-string scan. Field results travel as the value string plus
  closure variables, so the hot loop allocates nothing per field.

On the kit practice set (6 cases, ~10.5 MB): `run()` ~0.13–0.16 s vs the
baseline's ~0.52 s (about 3–4x); whole-program CPU ~0.99 s vs ~1.87 s
(median of fresh-process runs). Verified identical on all 6 practice cases,
83 hand-written edge cases, and 13,000 randomized differential fuzz cases
against the reference. See `TEST_RESULTS.md`.

## Run

Node 22+ (the grader runs Node 22.23.4). No dependencies, no install step.

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<dir> node main.ts
```

`main.ts` reads every case from `<input>/cases.json`, answers each with `run`,
and writes `<output>/answers.json`. It turns V8 incremental marking off before
importing `solve.js`, like the house baseline.

## Check

Grade locally like the server (needs the unpacked kit; no Docker here, so the
process driver):

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
node <kit>/cli/makefun.mjs check --kit <kit> --repo . --worktree
```

## Files

- `solve.js` — the parser (dependency-free ES module, exports `run`)
- `main.ts` — the harness driver (reads `/input/cases.json`, writes `/output/answers.json`)
- `TEST_RESULTS.md` — measured test, timing, and check results
- `LICENSE` — MIT
