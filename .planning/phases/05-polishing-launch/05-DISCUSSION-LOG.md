# Phase 5: Polishing & Launch - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 05-polishing-launch
**Areas discussed:** Memory footprint strategy, Permission minimization, Edge-case hardening scope, CWS launch deliverables, Cross-OS UI

---

## Memory footprint strategy

### Offscreen/ONNX lifecycle
| Option | Description | Selected |
|--------|-------------|----------|
| Tear down when idle | Close offscreen doc after N min idle; recreate on demand. Max RAM savings, cold-start latency. | |
| Keep alive always | Leave resident. Lowest latency, highest RAM. Only if already under 45MB. | |
| Idle teardown + warm threshold | Keep alive during bursts; tear down after a longer idle window (~10 min). | ✓ |

**User's choice:** Idle teardown + warm threshold (→ D-01)

### Memory measurement method
| Option | Description | Selected |
|--------|-------------|----------|
| chrome://discards + Task Manager | Manual Chrome Task Manager reading, documented procedure. | |
| performance.measureUserAgentSpecificMemory() | Programmatic per-context probe in a test/dev harness. | |
| Both | Manual Task Manager as gate of record + programmatic probe logged in dev. | ✓ |

**User's choice:** Both (→ D-02)

---

## Permission minimization

### `scripting` permission
| Option | Description | Selected |
|--------|-------------|----------|
| Remove scripting | Delete from manifest; zero usages grep-confirmed. | ✓ |
| Keep scripting | Retain for possible future injection use. | |

**User's choice:** Remove scripting (→ D-03)

### Overall permission audit stance
| Option | Description | Selected |
|--------|-------------|----------|
| Justify-each + remove unused | Drop scripting; keep the other 6 with documented justifications. | ✓ |
| Aggressive minimize to NFR-05 four | Rework features to reach offscreen/storage/tabs/alarms; removes shipped functionality. | |

**User's choice:** Justify-each + remove unused (→ D-04)

---

## Edge-case hardening scope

| Option | Description | Selected |
|--------|-------------|----------|
| Offscreen-doc crash/recreate | Recreate-on-gone + guard idle-teardown vs in-flight inference race. | ✓ |
| Restricted pages (chrome://, store) | Clean no-op on injection-blocked URLs. | ✓ |
| IDB quota + SW cold-start | Graceful quota-exceeded eviction + cold-start race handling. | ✓ |
| Rapid tab churn / startup restore | No leaked listeners / double-discard / bad badge under churn + startup. | ✓ |

**User's choice:** All four in scope (→ D-05, D-06, D-07, D-08)

---

## CWS launch deliverables

| Option | Description | Selected |
|--------|-------------|----------|
| Packaging + version + manifest polish | Build/zip script, version bump, manifest metadata, icon verification. | ✓ |
| Privacy policy + permission justifications | PRIVACY.md + per-permission justification doc. | ✓ |
| Store listing copy + screenshots | Marketing description, feature bullets, promo/screenshot assets. | ✓ |
| README + open-source polish | README/LICENSE/contributing polish. | ✓ |

**User's choice:** All four in scope (→ D-09, D-10, D-11, D-12)

---

## Cross-OS UI

| Option | Description | Selected |
|--------|-------------|----------|
| Normalize + manual screenshot pass | CSS normalization (scrollbars/fonts/native controls) THEN documented per-OS screenshot review. | ✓ |
| Manual screenshot pass only | No code changes; rely on Tailwind/shadcn, just visually check per OS. | |
| Automated viewport/visual snapshot | Playwright visual-regression; does not capture real per-OS native rendering. | |

**User's choice:** Normalize + manual screenshot pass (→ D-13)

---

## Claude's Discretion

- Exact idle-teardown constant (~10 min target) and the teardown-vs-in-flight guard mechanism.
- Memory probe placement (offscreen/SW/both) and the Task Manager runbook form.
- Doc filenames/locations (PERMISSIONS.md, PRIVACY.md) and packaging-script form.
- Restricted-URL denylist prefixes and whether to centralize the guard.
- Screenshot tooling/format and the CSS normalization approach (Tailwind base layer vs index.css).

## Deferred Ideas

- Aggressive NFR-05 four-permission ideal (rejected in favor of justify-each).
- Automated cross-OS visual-regression as the OS-coverage method (rejected; CI is single-OS).
- New features / behavior changes (out of scope — Phase 5 freezes functionality).
