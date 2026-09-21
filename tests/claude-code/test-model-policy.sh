#!/usr/bin/env bash
# Regression check: skill and agent frontmatter, the dispatch templates, and
# references/model-policy.md must agree on which model and effort each stage
# runs on, and the context guard hook must stay wired.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILLS="$REPO_ROOT/skills"
AGENTS="$REPO_ROOT/agents"
POLICY="$SKILLS/using-rs-power/references/model-policy.md"
HOOKS="$REPO_ROOT/hooks/hooks.json"

failures=0

pass() { echo "  [PASS] $1"; }
fail() {
    echo "  [FAIL] $1"
    failures=$((failures + 1))
}

expect_eq() {
    if [ "$1" = "$2" ]; then pass "$3"; else fail "$3 (got '$1', want '$2')"; fi
}

assert_contains() {
    if grep -Fq -- "$2" "$1"; then pass "$3"; else fail "$3 (missing '$2' in $1)"; fi
}

assert_not_contains() {
    if grep -Fq -- "$2" "$1"; then fail "$3 (found '$2' in $1)"; else pass "$3"; fi
}

# frontmatter FILE KEY — value of KEY in the leading --- block
frontmatter() {
    awk -v k="$2:" 'NR == 1 && $0 == "---" { fm = 1; next } fm && $0 == "---" { exit } fm && $1 == k { print $2 }' "$1"
}

display() {
    case "$1" in
        opus) echo "Opus 5" ;;
        sonnet) echo "Sonnet 5" ;;
        haiku) echo "Haiku 4.5" ;;
        *) echo "unknown model '$1'" ;;
    esac
}

# policy_row ROW — "<set by>|<model / effort>" cells of that stage's table row
policy_row() {
    awk -F' *[|] *' -v r="$1" '$2 == r { print $3 "|" $4 }' "$POLICY"
}

# check_stage FILE MODEL EFFORT SET_BY ROW — the frontmatter holds the expected
# values, and the policy table row shows what the frontmatter actually says.
check_stage() {
    local file="$1" model="$2" effort="$3" set_by="$4" row="$5"
    local name fm_model fm_effort
    name="${file#"$REPO_ROOT"/}"
    fm_model="$(frontmatter "$file" model)"
    fm_effort="$(frontmatter "$file" effort)"
    expect_eq "$fm_model" "$model" "$name model"
    expect_eq "$fm_effort" "$effort" "$name effort"
    expect_eq "$(policy_row "$row")" "$set_by|$(display "$fm_model")${fm_effort:+ / $fm_effort}" "model-policy.md row '$row' matches $name"
}

echo "=== Model Policy Test ==="
echo ""

echo "Stage table vs frontmatter:"
check_stage "$SKILLS/rs-brainstorming/SKILL.md" opus medium "skill frontmatter" "rs-brainstorming"
check_stage "$SKILLS/rs-writing-plans/SKILL.md" opus xhigh "skill frontmatter" "rs-writing-plans"
check_stage "$SKILLS/rs-systematic-debugging/SKILL.md" opus high "skill frontmatter" "rs-systematic-debugging"
check_stage "$SKILLS/rs-executing-plans/SKILL.md" opus medium "skill frontmatter" "rs-executing-plans"
check_stage "$SKILLS/rs-finishing-a-development-branch/SKILL.md" haiku "" "skill frontmatter" "rs-finishing-a-development-branch"
check_stage "$AGENTS/implementer.md" sonnet medium '`rs-power:implementer`' "implementer"
check_stage "$AGENTS/reviewer.md" sonnet high '`rs-power:reviewer`' "task review"
check_stage "$AGENTS/reviewer.md" sonnet high '`rs-power:reviewer`' "plan and spec document review"
check_stage "$AGENTS/re-reviewer.md" sonnet medium '`rs-power:re-reviewer`' "re-review"
check_stage "$AGENTS/final-reviewer.md" opus high '`rs-power:final-reviewer`' "final code review"
for agent in implementer reviewer re-reviewer final-reviewer; do
    expect_eq "$(frontmatter "$AGENTS/$agent.md" name)" "$agent" "agents/$agent.md name"
done

echo ""
echo "Policy document content:"
assert_contains "$POLICY" "Implementer fix rounds 1-3" "escalation ladder: resume rounds"
assert_contains "$POLICY" "Implementer fix rounds 4-5" "escalation ladder: fresh implementer rounds"
assert_contains "$POLICY" '`model: opus`' "escalation ladder: opus override"
assert_contains "$POLICY" "rs-systematic-debugging after two failed hypotheses" "Fable seat: debugging"
assert_contains "$POLICY" "Final review of a security-sensitive branch" "Fable seat: security final review"
assert_contains "$POLICY" '`/model`' "multi-turn guidance: /model"
assert_contains "$POLICY" '`/effort`' "multi-turn guidance: /effort"
assert_contains "$POLICY" "codex exec -m gpt-6-astra -c model_reasoning_effort=medium -s read-only" "Codex plan command"
assert_contains "$POLICY" "codex exec -m gpt-6-astra -c model_reasoning_effort=high -s read-only" "Codex final review command"
expect_eq "$(grep -rlF "codex exec" "$SKILLS" "$AGENTS" || true)" "$POLICY" "Codex command lives only in model-policy.md"

echo ""
echo "Dispatch templates:"
assert_contains "$SKILLS/rs-subagent-driven-development/implementer-prompt.md" "Subagent (rs-power:implementer):" "implementer template"
assert_contains "$SKILLS/rs-subagent-driven-development/task-reviewer-prompt.md" "Subagent (rs-power:reviewer):" "task reviewer template"
assert_contains "$SKILLS/rs-subagent-driven-development/re-review-prompt.md" "Subagent (rs-power:re-reviewer):" "re-review template"
assert_contains "$SKILLS/rs-requesting-code-review/code-reviewer.md" "Subagent (rs-power:final-reviewer):" "final review template"
assert_contains "$SKILLS/rs-writing-plans/plan-document-reviewer-prompt.md" "Subagent (rs-power:reviewer):" "plan reviewer template"
assert_contains "$SKILLS/rs-brainstorming/spec-document-reviewer-prompt.md" "Subagent (rs-power:reviewer):" "spec reviewer template"
expect_eq "$(grep -rlF "MODEL — REQUIRED" "$SKILLS" || true)" "" "no MODEL — REQUIRED placeholder remains"
expect_eq "$(grep -rlF "Subagent (general-purpose)" "$SKILLS" | grep -v rs-dispatching-parallel-agents || true)" "" "no general-purpose template outside rs-dispatching-parallel-agents"
assert_not_contains "$SKILLS/rs-requesting-code-review/SKILL.md" 'Dispatch a `general-purpose` subagent' "rs-requesting-code-review dispatches final-reviewer"
assert_contains "$SKILLS/rs-requesting-code-review/SKILL.md" '`rs-power:final-reviewer`' "rs-requesting-code-review names final-reviewer"
assert_contains "$SKILLS/rs-writing-plans/SKILL.md" '`command -v codex`' "rs-writing-plans Codex step"
assert_contains "$SKILLS/rs-requesting-code-review/SKILL.md" '`command -v codex`' "rs-requesting-code-review Codex step"

echo ""
echo "Context guard hook:"
if node -e '
const h = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).hooks;
for (const ev of ["UserPromptSubmit", "PreToolUse"]) {
  const cmds = (h[ev] || []).flatMap(m => m.hooks.map(x => x.command));
  if (!cmds.some(c => c.includes("${CLAUDE_PLUGIN_ROOT}/hooks/context-guard.js"))) process.exit(1);
}' "$HOOKS"; then
    pass "hooks.json wires UserPromptSubmit and PreToolUse to context-guard.js"
else
    fail "hooks.json wires UserPromptSubmit and PreToolUse to context-guard.js"
fi

echo ""

if [ "$failures" -gt 0 ]; then
    echo "STATUS: FAILED ($failures failures)"
    exit 1
fi

echo "STATUS: PASSED"
