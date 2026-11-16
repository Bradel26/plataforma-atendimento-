# 16 — Evidence Classification (expanded guidance)

Mandatory for the main engineer and all asa-* specialists. Every technical finding carries exactly ONE classification. Severity (impact if true) is reported separately from evidence level (how well established).

## Classifications

| Label | Meaning | Minimum evidence to report |
|---|---|---|
| CONFIRMED_BY_EXECUTION (Confirmado por execução) | The specific claim was reproduced or checked by an executed test, command or runtime observation. | Command, environment (local/staging/production), relevant output (no secrets), limitations. |
| CONFIRMED_BY_CODE (Confirmado por código) | Directly supported by inspected source, configuration or documentation. | Exact file path and line references. Does not prove live configuration or exploitability. |
| TECHNICAL_SUSPICION (Suspeita técnica) | Plausible hypothesis from incomplete or indirect evidence. | What evidence is missing and how to verify it. |
| NOT_VERIFIED (Não verificado) | Insufficient evidence, no access, or check not performed. | The verification blocker. Never present as an established issue. |

## Rules

1. Classify every finding; never leave it unlabeled.
2. Cite file paths and line numbers; for execution cite command, result and environment. Never include secrets or sensitive output.
3. Distinguish local, staging and production evidence. Never infer production state from repository defaults, old logs, prior conversations or an agent's assertion.
4. Subagent conclusions are leads, not confirmation. The main engineer inspects the supporting evidence before elevating a classification.
5. A tool having run is not confirmation; the executed check must support the specific finding. One passing scenario does not prove all scenarios.
6. Findings mixing verified and unverified claims are split into separate findings.
7. Never invent line numbers, commands, results, timestamps, coverage or confidence percentages.
8. State explicitly what was not tested; if nothing ran, say so.

## Evidence Verification Rules (mandatory)

Applies to the main engineer and to all eight asa-* specialists. Why: a specialist once cited lines beyond the end of the file and a grep-based count was reported as confirmed coverage; both look like evidence and are not.

- CONFIRMED_BY_CODE requires that you opened the cited file with a file-reading tool in this session and read the cited lines. Cite `path:line` (or `path:start-end`) plus a short verbatim snippet of the line(s) that support the claim.
- A textual search (grep, rg, ls, wc, counting string matches) or a sample of the code base is NOT sufficient for CONFIRMED_BY_CODE. Such evidence caps the finding at TECHNICAL_SUSPICION (or NOT_VERIFIED); list the files you did not read.
- A line number beyond the file's length, or a snippet that does not appear at or near the cited line, invalidates the citation. Never estimate or reconstruct a line number from memory; re-open the file instead.
- Claims of absence or full coverage ("no route lacks auth", "input is never validated") require enumerating and reading every candidate; otherwise classify as TECHNICAL_SUSPICION.
- A report from another agent is a lead. Before repeating or elevating its CONFIRMED_BY_CODE finding, reopen the cited lines and confirm the snippet yourself; otherwise report it as an unverified lead with its original provenance.
- When `scripts/check_citations.py` is available, run it on a report: it checks only that cited files exist, line ranges are within the file and quoted snippets appear there. It does NOT validate the conclusion drawn from the code.

## Audit table format

| Finding | Severity | Evidence classification | Evidence / environment | Next verification or remediation |
|---|---|---|---|---|
| Missing input validation in route handler | High | CONFIRMED_BY_CODE | apps/api/src/routes/example.ts:42 (example only) | Add regression test and validate behavior |

For simple tasks a concise evidence note per finding is enough; use the full table for audits and high-risk work.

## Delegation

When delegating, pass these rules in the handoff and require the specialist to return classified findings. Preserve provenance in the consolidated report (who found it, how it was classified, whether the main engineer re-verified it).
