# review-tests — verification chain status

**Branch:** `review/pass` off main HEAD `8be4a21`
**Date:** 2026-04-11

## Result

**CHAIN GREEN** — 357 tests passed, branches 78.53%.

## Summary

| Step | Result | Duration / Counts |
|---|---|---|
| 1. typecheck | PASS | — |
| 2. lint | PASS | 0 errors, 0 warnings |
| 3. prettier | PASS | all files conformant |
| 4. unit tests | PASS | 21 files, 357 tests |
| 5. coverage thresholds | PASS | all four metrics above threshold |

## Coverage vs. thresholds

| Metric | Threshold | Actual | Margin |
|---|---|---|---|
| Statements | 80% | 89.61% | +9.6 pp |
| Branches | 75% | 78.53% | +3.5 pp |
| Functions | 80% | 95.37% | +15.4 pp |
| Lines | 80% | 91.37% | +11.4 pp |

Branch coverage is the tightest margin at 3.5 pp above threshold. The lowest-coverage individual files on the branch dimension are:

- `app/api/needs-attention/[id]/route.ts` — 33.3%
- `app/api/overrides/route.ts` — 33.3%
- `app/api/overrides/[id]/route.ts` — 37.5%

All are error-path branches in API route handlers. Not a failing concern today, but the nearest place a new branch could tip the threshold.

## Notes

- The `next lint` deprecation warning is cosmetic — it does not affect the exit code and will resolve when the project migrates to the ESLint CLI per the Next.js 16 migration path.
- The three `Not implemented: Window's scrollTo()` lines are jsdom noise from component tests; they do not affect any assertion.
- Integration tests (`lib/__integration__/`) were NOT run — they require a real Anthropic API key and real MinIO and are excluded from regular CI.
