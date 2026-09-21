#!/usr/bin/env node
// Count SDD ledger writes in a Claude Code session transcript.
//
// Usage: node ledger-evidence.js <transcript.jsonl>
// Prints "<writes> <completions>": ledger writes whose tool result came back
// without an error, and the completion lines those writes carried.
//
// Substring matching over the raw transcript does not work here. The skill text
// is in the transcript, it names progress.md, and its example workflow shows
// completion lines — so a transcript where nothing was written still matches.
// A write that was attempted and failed does not count either: the ledger is
// what the controller recovers from after compaction, so only a write that
// landed is evidence.
'use strict';

const fs = require('fs');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const LEDGER_REDIRECT = />>?\s*"?[^"\s]*progress\.md/;
const COMPLETION = /Task \d+: complete/g;

function main(file) {
  const pending = new Map(); // tool_use_id -> completion count
  let writes = 0;
  let completions = 0;

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch (_) { continue; }
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type === 'tool_use' && block.input) {
        const command = String(block.input.command || '');
        const path = String(block.input.file_path || '');
        const wrote = LEDGER_REDIRECT.test(command)
          || (WRITE_TOOLS.has(block.name) && /progress\.md$/.test(path));
        if (!wrote) continue;
        const body = command
          + String(block.input.content || '')
          + String(block.input.new_string || '');
        pending.set(block.id, (body.match(COMPLETION) || []).length);
      } else if (block.type === 'tool_result' && pending.has(block.tool_use_id)) {
        const carried = pending.get(block.tool_use_id);
        pending.delete(block.tool_use_id);
        if (block.is_error === true) continue; // attempted, did not land
        writes += 1;
        completions += carried;
      }
    }
  }

  process.stdout.write(`${writes} ${completions}`);
}

main(process.argv[2]);
