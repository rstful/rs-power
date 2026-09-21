# Model Policy

Which model and reasoning effort each stage runs on. The goal is cost: the
cheapest seat that still holds the stage's quality floor. Fable reviewed
this table (see the plan that introduced it); the values below are what
the skill frontmatter and the `rs-power:` agent definitions set, and
`tests/claude-code/test-model-policy.sh` fails when the two drift apart.

## Stage table

| Stage | Set by | Model / effort | Optional Codex |
|---|---|---|---|
| rs-brainstorming | skill frontmatter | Opus 5 / medium | none |
| rs-writing-plans | skill frontmatter | Opus 5 / xhigh | once after the plan is complete, medium |
| plan and spec document review | `rs-power:reviewer` | Sonnet 5 / high | none |
| implementer | `rs-power:implementer` | Sonnet 5 / medium | none |
| task review | `rs-power:reviewer` | Sonnet 5 / high | none |
| re-review | `rs-power:re-reviewer` | Sonnet 5 / medium | none |
| final code review | `rs-power:final-reviewer` | Opus 5 / high | once on the finished branch, high |
| rs-systematic-debugging | skill frontmatter | Opus 5 / high | none |
| rs-executing-plans | skill frontmatter | Opus 5 / medium | none |
| rs-finishing-a-development-branch | skill frontmatter | Haiku 4.5 | none |

Exceptions go through the Agent call's `model` argument, which overrides
the agent definition's model; the effort stays the definition's. Never add
an agent per effort level.

- **Mechanical implementer tasks** — the plan text holds the complete code
  to write: dispatch `rs-power:implementer` with `model: haiku`.
- **Risky task reviews** — auth, migrations, data-loss paths, or a task
  whose implementer ran on Opus: dispatch `rs-power:reviewer` with
  `model: opus`.

## Escalation ladder

- **Implementer fix rounds 1-3** — resume the same implementer agent.
- **Implementer fix rounds 4-5** — dispatch a fresh `rs-power:implementer`
  with `model: opus`.
- **Reviewers** — `model: opus` for the risky paths above; otherwise the
  definition's model.

## Where Fable is allowed

Fable costs the most, so it has exactly two seats:

1. **rs-systematic-debugging after two failed hypotheses** — switch the
   session to Fable at xhigh (`/model fable`, `/effort xhigh`).
2. **Final review of a security-sensitive branch** (auth, crypto, secrets,
   permissions) — dispatch `rs-power:final-reviewer` with `model: fable`.

## Multi-turn stages

A skill's `model` and `effort` frontmatter applies only to the rest of the
turn that invoked it; the next prompt runs on the session model again.
rs-brainstorming and rs-systematic-debugging span many turns, so when the
session model differs from the table, say once, in one line, which
`/model` and `/effort` commands would match it. Do not switch for your
human partner.

## Codex cross-check (optional)

Run only when `command -v codex` finds the Codex CLI; otherwise skip
silently. Each point runs once — never loop on Codex output.

- **After rs-writing-plans completes the plan:**

  ```bash
  codex exec -m gpt-6-astra -c model_reasoning_effort=medium -s read-only \
    "Review the implementation plan at PLAN_PATH against the spec at SPEC_PATH. List gaps, wrong assumptions, and missing tests, most severe first. Do not edit files."
  ```

- **Final code review:**

  ```bash
  codex exec -m gpt-6-astra -c model_reasoning_effort=high -s read-only \
    "Review the changes in git diff BASE_SHA..HEAD_SHA against PLAN_PATH. List bugs, security issues, and requirement gaps, most severe first. Do not edit files."
  ```

Treat Codex findings like any reviewer's: verify each one against the code
before acting on it.
