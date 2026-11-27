---
name: put-out-the-fire
description: Contains a production incident caused by a feature flag, using the Flagsmith CLI. Traces the symptom to the flag in code, finds the narrowest segment that covers the affected users, previews the blast radius, waits for a human yes, applies a segment override, verifies it with real flag evaluation, and leaves a rollback trail. Use when someone reports that a feature is broken for some users ("payments failing for EU customers", "checkout broken on Android") and the code is behind a Flagsmith flag.
license: MIT
compatibility: Needs the Flagsmith CLI v2 (`flagsmith`) authenticated against the project, plus git/grep. Optional gh for a follow-up issue.
metadata:
  author: Shooting Stars (DrillSwitch)
  version: "1.0"
---

# Put out the fire

Contain a flag-caused incident with the smallest change that stops the harm, and prove it worked.
You never write to Production until a person has said yes to the exact change.

## Inputs

The incident report: the symptom, when it started, and identifiers of affected and healthy users with their traits.
If you have no healthy examples, ask for at least one. You cannot prove a change is scoped without one.

## 1. Orient (read-only)

```bash
flagsmith config                                                  # API, project and where each value comes from
flagsmith env list --jq '.[] | "\(.name)\t\(.api_key)"'           # environment names and client-side keys
```

Set `PROD` to the Production environment's key. If no environment is clearly Production, ask. Pass `-e "$PROD"` on every flag command.
If `flagsmith env get "$PROD" --jq .minimum_change_request_approvals` is above 0, Production needs change requests:
stop before step 5 and hand the person the exact command to raise one instead.

## 2. Trace the symptom to a flag (read-only)

Find the code path named in the report, then the flag checks on it:

```bash
git grep -nE 'isFeatureEnabled|hasFeature|getFeatureValue|getValue|useFlags|is_feature_enabled|get_feature_value' -- <paths from the report>
flagsmith flag get <flag> -e "$PROD"            # state, value, override counts
git log -S'<flag>' --since='7 days ago' --oneline   # recent code changes around this flag
```

Pick the flag whose ON branch contains the failing behaviour. If several qualify, show them and ask.

## 3. Reproduce with real evaluation (read-only)

Evaluate every example user transiently (no `--persist`). Use the traits from the report:

```bash
flagsmith eval <flag> -e "$PROD" --identity <id> --trait region=eu --trait plan=growth --jq .enabled
```

Affected users should get the broken branch. If they don't, the flag is not the cause: stop and say so.

## 4. Scope (read-only)

```bash
flagsmith segment list --jq '.[] | "\(.id)\t\(.name)"'
flagsmith segment get <segment> --jq .rules
```

Choose the narrowest existing segment whose rules match every affected example and no healthy one.
Check the flag's existing overrides, because a higher-priority override would beat yours:

```bash
ENV_ID=$(flagsmith env get "$PROD" --jq .id); FEATURE_ID=$(flagsmith feature get <flag> --jq .id)
flagsmith api "api/v1/features/feature-segments/?environment=$ENV_ID&feature=$FEATURE_ID" --jq '.results[] | {segment_name, priority}'
```

No segment fits? Do not create one or fall back to a global kill on your own. Offer the options with their collateral
(new segment, identity overrides for a short list, or disabling for everyone) and let the person choose.

## 5. Propose and wait (approval gate)

Show one change card and stop:

- **Change:** `<flag>` OFF for segment `<segment>` in Production
- **Blast radius:** a table of every example user, before → predicted after. Healthy users must stay unchanged.
- **Command:** `flagsmith flag update <flag> --disable --segment <segment> -e "$PROD" --yes`
- **Rollback:** `flagsmith flag delete <flag> --segment <segment> -e "$PROD" --yes`

Apply only after an explicit yes to this card. The CLI refuses Production writes without `--yes` when it can't prompt.
That `--yes` stands for the person's answer, so never add it before they give one. A new request means a new card.

## 6. Apply and verify

```bash
flagsmith flag update <flag> --disable --segment <segment> -e "$PROD" --yes
flagsmith flag reorder <flag> <segment> <other overrides, in their current order> -e "$PROD" --yes   # only if other overrides exist
```

Do not use `--priority 0` to move it: it returns "Duplicate priority" when another override holds 0, and no change is made. Use `reorder`.
Re-run step 3 for every example user. Affected users must now be off and healthy users unchanged.
If not, report what you see, offer the rollback, and make no further changes without a new yes.

## 7. Leave a trail

Append to the feature description; don't replace it:

```bash
OLD=$(flagsmith feature get <flag> --jq .description)
flagsmith feature update <flag> --description "$OLD | <INC-id> <UTC time>: off for <segment> in Production. Rollback: flagsmith flag delete <flag> --segment <segment>"
```

Write `incidents/<INC-id>-<flag>.md` with:

- the timeline
- the evidence (which code path and why)
- the change and who approved it
- the verification table
- the rollback command
- follow-ups: fix the root cause, then delete the override

If `gh auth status` succeeds and the person agrees, open an issue from that file:
`gh issue create --title "<INC-id> follow-up: <flag>" --body-file incidents/<INC-id>-<flag>.md`.

## Rules

- Read before you write. Steps 1–4 never change anything.
- One change per approval. Prefer a segment override to a global kill, and never delete features or segments.
- Never write to Production without a yes to the exact command, and never use `--yes` before that.
- Record the rollback before applying. If verification fails, stop and report.
- Finish with a short summary: the flag, the segment, the verification result, where the trail is, and the rollback command.

## Rehearse

`scripts/stage-incident.sh` stages demo incident INC-2041 (`new_checkout` breaking EU card payments) on a local Flagsmith.
The brief is in `demo/INC-2041.md` and the code is in `demo/shop/`.
