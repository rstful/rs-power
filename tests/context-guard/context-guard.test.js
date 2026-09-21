/**
 * Tests for hooks/context-guard.js — warn at 400k, block at 600k context tokens.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const REPO_ROOT = path.join(__dirname, '../..');
const GUARD = path.join(REPO_ROOT, 'hooks/context-guard.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'context-guard-'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

// Main-thread assistant turn whose context adds up to `tokens`.
function main(tokens) {
  return {
    type: 'assistant',
    isSidechain: false,
    message: { usage: { input_tokens: 2, cache_creation_input_tokens: 1000, cache_read_input_tokens: tokens - 1002, output_tokens: 50 } }
  };
}

function side(tokens) {
  return { ...main(tokens), isSidechain: true };
}

function boundary(meta) {
  return { type: 'system', subtype: 'compact_boundary', isSidechain: false, ...meta };
}

const SUMMARY = { type: 'user', isSidechain: false, isCompactSummary: true, message: { role: 'user', content: 'summary' } };
const FILLER = { type: 'attachment', isSidechain: false, content: 'x'.repeat(1000) };

let n = 0;
function transcript(entries, raw = '') {
  const file = path.join(TMP, `t${n++}.jsonl`);
  fs.writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n' + raw);
  return file;
}

function run(event, transcriptPath, extra = {}) {
  const input = { session_id: 's', transcript_path: transcriptPath, cwd: REPO_ROOT, hook_event_name: event, ...extra };
  return spawnSync('node', [GUARD], { input: JSON.stringify(input), encoding: 'utf8' });
}

const prompt = (p) => ({ prompt: p });
const tool = { tool_name: 'Bash', tool_input: { command: 'ls' } };

function assertSilent(r) {
  assert.strictEqual(r.status, 0, `exit ${r.status}, stderr: ${r.stderr}`);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(r.stderr, '');
}

function assertBlocked(r) {
  assert.strictEqual(r.status, 2, `exit ${r.status}, stdout: ${r.stdout}`);
  assert.ok(r.stderr.includes('/compact'), `stderr lacks /compact: ${r.stderr}`);
}

console.log('\n--- context-guard ---');

test('missing transcript or broken lines pass silently', () => {
  assertSilent(run('UserPromptSubmit', path.join(TMP, 'nope.jsonl'), prompt('hi')));
  assertSilent(run('PreToolUse', transcript([], '{not json\n{"type":"assistant"\n'), tool));
  const r = spawnSync('node', [GUARD], { input: 'garbage', encoding: 'utf8' });
  assertSilent(r);
});

test('300k passes silently', () => {
  assertSilent(run('UserPromptSubmit', transcript([main(300000)]), prompt('hi')));
});

test('UserPromptSubmit at 450k warns user and model', () => {
  const r = run('UserPromptSubmit', transcript([main(450000)]), prompt('hi'));
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.ok(out.systemMessage.includes('450k'), out.systemMessage);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('/compact'));
});

test('UserPromptSubmit at 650k blocks with /compact guidance', () => {
  assertBlocked(run('UserPromptSubmit', transcript([main(650000)]), prompt('keep going')));
});

test('/compact and /clear prompts pass at 650k', () => {
  const t = transcript([main(650000)]);
  for (const p of ['/compact', '  /clear', '/compact keep the API notes', '/clear\n']) {
    assertSilent(run('UserPromptSubmit', t, prompt(p)));
  }
});

test('look-alike prompts do not bypass at 650k', () => {
  const t = transcript([main(650000)]);
  for (const p of ['/compactx', '/clear-x', 'please /compact', '/compact-now']) {
    assertBlocked(run('UserPromptSubmit', t, prompt(p)));
  }
});

test('PreToolUse at 650k denies the tool call', () => {
  const r = run('PreToolUse', transcript([main(650000)]), tool);
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.strictEqual(out.hookEventName, 'PreToolUse');
  assert.strictEqual(out.permissionDecision, 'deny');
  assert.ok(out.permissionDecisionReason.includes('/compact'));
});

test('PreToolUse at 450k passes silently', () => {
  assertSilent(run('PreToolUse', transcript([main(450000)]), tool));
});

test('large sidechain usage is ignored', () => {
  assertSilent(run('PreToolUse', transcript([main(100000), side(900000)]), tool));
});

test('small sidechain usage after a large main usage still blocks', () => {
  assertBlocked(run('UserPromptSubmit', transcript([main(650000), side(10000)]), prompt('hi')));
});

test('compact_boundary after a large usage resets the count', () => {
  const pre = { pre_tokens: 650000, post_tokens: 30000 };
  assertSilent(run('PreToolUse', transcript([main(650000), boundary({ compactMetadata: pre }), SUMMARY]), tool));
  assertSilent(run('PreToolUse', transcript([main(650000), boundary({ compact_metadata: pre })]), tool));
  assertSilent(run('PreToolUse', transcript([main(650000), boundary({})]), tool));
});

test('compact summary entry alone resets the count', () => {
  assertSilent(run('UserPromptSubmit', transcript([main(650000), SUMMARY]), prompt('hi')));
});

test('compact_boundary with post_tokens >= 600k still blocks', () => {
  const t = transcript([main(900000), boundary({ compact_metadata: { pre_tokens: 900000, post_tokens: 650000 } }), SUMMARY]);
  assertBlocked(run('UserPromptSubmit', t, prompt('hi')));
});

test('usage after a compaction counts again', () => {
  assertBlocked(run('UserPromptSubmit', transcript([main(650000), boundary({}), SUMMARY, main(620000)]), prompt('hi')));
});

test('last usage more than 1MB from the end is still found', () => {
  const filler = Array(1500).fill(FILLER);
  const oneLongLine = { ...FILLER, content: 'y'.repeat(1500000) };
  assertBlocked(run('UserPromptSubmit', transcript([main(650000), ...filler]), prompt('hi')));
  assertBlocked(run('UserPromptSubmit', transcript([main(650000), oneLongLine]), prompt('hi')));
});

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exitCode = 1;
