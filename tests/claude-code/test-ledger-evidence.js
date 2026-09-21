/**
 * Tests for tests/claude-code/ledger-evidence.js — count SDD ledger writes that
 * landed, and only those.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const SCRIPT = path.join(__dirname, 'ledger-evidence.js');
const SKILL = path.join(__dirname, '../../skills/rs-subagent-driven-development/SKILL.md');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-evidence-'));

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

function assistant(...blocks) {
  return { type: 'assistant', message: { content: blocks } };
}

function result(id, isError) {
  const block = { type: 'tool_result', tool_use_id: id, content: isError ? 'EACCES' : 'ok' };
  if (isError) block.is_error = true;
  return { type: 'user', message: { content: [block] } };
}

function count(entries) {
  const file = path.join(TMP, `t-${Math.random().toString(36).slice(2)}.jsonl`);
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const run = spawnSync('node', [SCRIPT, file], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, run.stderr);
  return run.stdout.trim();
}

const append = (id, task) => ({
  type: 'tool_use',
  id,
  name: 'Bash',
  input: { command: `cat >> .rs-power/sdd/plan/progress.md <<'EOF'\nTask ${task}: complete (commits aaaaaaa..bbbbbbb, review clean)\nEOF` }
});

test('counts an append that landed', () => {
  assert.strictEqual(count([assistant(append('t1', 1)), result('t1', false)]), '1 1');
});

test('counts a Write tool that landed', () => {
  const write = { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '.rs-power/sdd/plan/progress.md', content: 'Task 1: complete (commits a..b)' } };
  assert.strictEqual(count([assistant(write), result('t1', false)]), '1 1');
});

test('ignores a write that errored', () => {
  assert.strictEqual(count([assistant(append('t1', 1)), result('t1', true)]), '0 0');
});

test('ignores a write with no result at all', () => {
  assert.strictEqual(count([assistant(append('t1', 1))]), '0 0');
});

test('ignores reading the ledger', () => {
  const read = { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '.rs-power/sdd/plan/progress.md' } };
  assert.strictEqual(count([assistant(read), result('t1', false)]), '0 0');
});

test('ignores the skill text that names the ledger', () => {
  const skill = fs.readFileSync(SKILL, 'utf8');
  assert.match(skill, /progress\.md/, 'fixture assumes the skill names the ledger');
  assert.strictEqual(count([assistant({ type: 'text', text: skill })]), '0 0');
});

test('sums several appends', () => {
  assert.strictEqual(count([
    assistant(append('t1', 1)), result('t1', false),
    assistant(append('t2', 2)), result('t2', false)
  ]), '2 2');
});

fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
