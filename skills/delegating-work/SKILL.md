---
name: delegating-work
description: Delegate token-heavy, low-reasoning work to a cheaper worker model instead of loading it into context. Use when about to read a large file, triage long test/build/CI output, or check whether documentation still matches the code.
---

# Delegating work to cheap workers

Most of what a coding agent does is not thinking — it is I/O. Reading a 900-line
file to answer one question spends thousands of tokens of expensive context on
material you will never refer to again. A cheap worker can read it instead and
hand back only the answer.

Run delegations with:

```
node "${CLAUDE_PLUGIN_ROOT}/src/interfaces/cli/main.js" <task> -i "<instruction>" [-f <file>...] [--stdin]
```

## The three tasks

| Task | Use it for |
|---|---|
| `read` | Answering a question about one or more large files. |
| `log-analysis` | Pulling root-cause failures out of long test, build or CI output. |
| `docs-audit` | Checking whether documentation still matches the code. |

```bash
node "$CLI" read -i "where is the session token validated" -f src/auth/session.js
npm test 2>&1 | node "$CLI" log-analysis -i "which tests failed and why" --stdin
node "$CLI" docs-audit -i "check the examples and signatures" -f README.md -f src/index.js
```

## When it pays

One question decides it: **is the material large and the answer small?**

Delegation costs 10-30 seconds of latency and a fixed prompt overhead. Below
roughly 300 lines a direct read is cheaper on both. The footer reports tokens
*and* elapsed time so the trade stays visible — check it.

Answers cite `path:line`. Use those citations to `Read` the few lines that
matter instead of reopening the whole file.

## What NOT to delegate

- Business logic, architecture decisions, cross-file refactors. Here the work
  *is* the judgment.
- The **why** behind code — the decision, the incident, the constraint. That is
  not in the source, so a worker will invent something plausible, which is worse
  than silence because it reads as authoritative.
- Small files, and text you need verbatim to edit. Use `Read` with
  `offset`/`limit` for the slice you will modify.
- Anything you cannot verify more cheaply than you could do it yourself.

## Reading the results

Workers are told to stay strictly inside the material they are given:

- **`NOT_IN_SOURCE`** means the answer is genuinely absent. Widen the file set
  and delegate again — do not assume the worker missed it.
- **`NO_DISCREPANCIES`** (from `docs-audit`) means the docs still hold. It costs
  almost nothing, so run it after any change to a public interface.

`docs-audit` reports only claims the code *contradicts*. A claim the sources do
not cover is not a finding, and it proposes no rewrites.

Treat a worker answer as a report from a junior teammate: reliable on
extraction, worth verifying before you build something load-bearing on it.

## Checking the payoff

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/interfaces/cli/main.js" stats
```

Every delegation records the tokens it avoided and the tokens its answer cost.
