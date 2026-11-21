# TEST_RESULTS.md — csv-reader-speed-01-run-20261121

All runs on this VM (Node v24.22.1, 1.5 shared CPUs) unless stated otherwise.
The graded code is `solve.js` + `main.ts` as shipped in this repo.

## Correctness (must be 100% identical to csv-reader 1.0.0)

| Check | Command / method | Result |
|---|---|---|
| Practice set (6 cases, ~10.5 MB) | `node cli/makefun.mjs grade-local --kit <kit> --bot . --worktree --driver process` | **passed=1, cases_passed 6/6**; L1 regrade reproduced byte for byte |
| Practice set, direct | `bench.mjs`: `run()` vs `practice/reference/expected.json` | 6/6 identical |
| Hand-written edge cases (83) | `edge.mjs`: mine vs baseline `readCsv` | **83/83 identical** — BOM, empty input, CRLF, stray CR (mid-field, multi, at EOF, CR-only lines), blank lines, quoted fields (empty, doubled quotes, multiline LF/CRLF/lone CR), quote_junk (incl. junk with quote/CR), unterminated quote (at EOF, spanning records), short/long rows, header-only, unicode, `header: 1`/`"true"`/`0` |
| Randomized differential fuzz (13,000 cases) | `fuzz.mjs`: random soup + structured broken CSVs, mine vs baseline | **13,000/13,000 identical, 0 fail** |
| Input coercion (12 inputs) | `run({})`, `run({text: null})`, `run({text: 123})`, `run(null)`, `run({text: {toString: null}})`, array text, non-boolean header | identical to the reference, including the two identical throws |
| Determinism | `main.ts` run twice in a clean room on the practice set | **byte-identical `answers.json`**; grade-local L1 regrade reproduced byte for byte |

## Speed (practice set, 6 cases, ~10.5 MB total)

| Measurement | Mine | Baseline (csv-reader 1.0.0) | Ratio |
|---|---|---|---|
| `run()` only, in-process means over repeated runs | ~0.13–0.17 s | ~0.50–0.55 s | ~3.2–4.1x |
| `run()` only, fresh-process alternating A/B medians (7 pairs) | 0.161 s | ~0.52 s | ~3.2x |
| Whole `main.ts`, CPU time, fresh processes, rusage (7 runs each) | median **0.823 s** (0.761–0.874 s) | median **1.903 s** (1.593–2.274 s) | **~2.3x** |

## Kit checks

- `node cli/makefun.mjs check --kit <kit> --repo . --worktree`:
  **5 passed, 0 failed, 15 skipped** — `license_osi` (MIT), `entrypoint`
  (main.ts, node22), `entry_size` (12,321 bytes at check time for the
  5-file snapshot; final 6-file repo is about 17.9 KB, cap 1 MiB),
  `competition_open`, `snapshot` all pass.
- **Transcripts: NOT required for this competition.** `transcripts_present`
  (and all `thinking_*` checks) are skipped with: "the gate does not bind
  this entry (csv-reader-speed-01-run-20261121 does not require transcripts)".
  Confirmed in `competition.yaml` (`transcripts_required: false`) and in
  RULES.txt ("This competition makes them optional: no transcript gate runs").
  The entry is submittable without transcripts.
- `grade-local` result_sha256 (6-file snapshot as graded; later doc-only touch-ups to this file change the snapshot hash, not the score):
  `232dbc9fb738f53a52dfb2571e1b8e1102db850fe9885efbf4094986927d0f07`.
  Note: the server harness runs Node v26.13.1 vs v24.22.1 here, so the server
  records a different result_sha256; the score (6/6) is what matters.
- Remaining checks (`repo_public`, `repo_owner`, `repo_created_after_open`,
  `commit_in_repo`, `duplicate_snapshot`) run at submission, after the repo is
  created on GitHub and pushed. `.makefun/owner.json` (58 bytes) is included.

## 2-pass critique (gpt-6.1-sol as harshest judge)

Score **72/100**. Findings and disposition:

- `quote_junk` error order: the judge claimed `stray_cr` should follow
  `quote_junk`; the reference itself pushes `stray_cr` during the junk scan
  and `quote_junk` only after it returns — the entry matches the reference
  byte-for-byte on those inputs (covered by the 83 edge cases). No change.
- Two asymptotic (quadratic) scans in the unquoted reader (`indexOf(',')` /
  `indexOf('\n')` running to EOF when the delimiter is absent): real in
  theory, measured harmless — on the judge's own adversarial inputs
  (`'a"b\n'` x20,000; `'x,'` x50,000 + `'"y"\n'`) the entry takes 19 ms /
  39 ms, and neither input shape can occur in a generator-drawn set (every
  record has 8–18 comma-separated columns; the last line is one short record).
  A regex-bounded variant (v6) was built and measured: it fixes the
  asymptotic case but is ~12% slower on the practice set, so it was rejected
  in favour of the faster shipped code.
- Input coercion and empty-header behaviour: verified identical to the
  reference (see table above).
- Streaming `main.ts` output: not adopted — the shipped driver is the house
  baseline's driver verbatim, and the stress case (a 100k-column row) cannot
  occur in generator-drawn sets (width 8–18).

## Zero-fail QA (clean room)

Fresh directory with only the shipped files (`solve.js`, `main.ts`,
`LICENSE`, `README.md`, `TEST_RESULTS.md`, `.makefun/owner.json`): total
about 17.9 KB (cap 1,048,576). No secrets, API keys, absolute paths, or home
paths found by pattern scan. `main.ts` runs clean (exit 0) twice with
byte-identical output, and the output equals the reference on all 6 practice
cases. No dependencies to install (Node built-ins only).

## How to reproduce

```sh
# correctness + timing (needs the unpacked kit at $KIT)
node /tmp/csvtest/bench.mjs 5        # practice differential + run() timing
node /tmp/csvtest/edge.mjs           # 83 edge cases
node /tmp/csvtest/fuzz.mjs 8000 5000 # 13,000 fuzz cases
# grade + check (needs the unpacked kit at $KIT)
node $KIT/cli/makefun.mjs grade-local --kit $KIT --bot . --worktree --driver process
node $KIT/cli/makefun.mjs check --kit $KIT --repo . --worktree
```
