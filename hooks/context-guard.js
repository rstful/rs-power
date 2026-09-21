#!/usr/bin/env node
'use strict';

// Context guard for UserPromptSubmit and PreToolUse.
// Reads the session transcript, takes the context size of the newest main-thread
// turn, warns at 400k and blocks at 600k. Any error lets the call through: the
// guard must never stop work because of its own failure.

const fs = require('fs');

const WARN_TOKENS = 400000;
const BLOCK_TOKENS = 600000;
const FIRST_WINDOW = 1024 * 1024;
const RELEASE_PROMPT = /^\s*\/(compact|clear)(\s|$)/;

// Newest-first scan of complete lines. Returns the context size, or undefined
// when these lines do not settle it.
function scan(lines) {
  let compacted = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    let e;
    try { e = JSON.parse(lines[i]); } catch (_) { continue; }
    if (!e || e.isSidechain) continue;
    if (e.type === 'system' && e.subtype === 'compact_boundary') {
      const meta = e.compactMetadata || e.compact_metadata || {};
      return meta.post_tokens || 0;
    }
    // Second compaction marker: if the boundary entry ever changes shape, a
    // compacted session still resets instead of staying blocked.
    if (e.type === 'user' && e.isCompactSummary) compacted = true;
    const u = e.type === 'assistant' && e.message && e.message.usage;
    if (u) {
      if (compacted) return 0;
      return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    }
  }
  return compacted ? 0 : undefined;
}

// Reads the transcript tail, doubling the window until the size is settled.
function contextTokens(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    for (let win = FIRST_WINDOW; ; win *= 2) {
      const start = Math.max(0, size - win);
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      const lines = buf.toString('utf8').split('\n');
      if (start > 0) lines.shift(); // cut mid-line
      const tokens = scan(lines);
      if (tokens !== undefined || start === 0) return tokens || 0;
    }
  } finally {
    fs.closeSync(fd);
  }
}

function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const event = input.hook_event_name;
  if (event === 'UserPromptSubmit' && RELEASE_PROMPT.test(input.prompt || '')) return;

  const tokens = contextTokens(input.transcript_path);
  if (tokens < WARN_TOKENS) return;
  const k = `${Math.round(tokens / 1000)}k`;

  if (event === 'UserPromptSubmit') {
    if (tokens >= BLOCK_TOKENS) {
      process.stderr.write(`[rs-power] 컨텍스트 ${k} — 600k 를 넘어 진행을 막았습니다. /compact 로 줄이거나 /clear 로 새로 시작하세요.\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(JSON.stringify({
      systemMessage: `[rs-power] 컨텍스트 ${k} — 600k 에서 차단됩니다. 단계가 끝나면 /compact 를 권합니다.`,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `Context is at ${k} tokens; prompts and tool calls are blocked at 600k. Finish the current step and suggest /compact to the user.`
      }
    }));
    return;
  }

  // ponytail: no 400k warning mid-turn — without a state file it would repeat on
  // every tool call. Add one with a per-session marker if long turns need it.
  if (event === 'PreToolUse' && tokens >= BLOCK_TOKENS) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Context is at ${k} tokens, over the 600k limit. Stop and ask the user to run /compact or /clear.`
      }
    }));
  }
}

try { main(); } catch (_) { /* fail open */ }
