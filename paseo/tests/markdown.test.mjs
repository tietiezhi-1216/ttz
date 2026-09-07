import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInline, parseMarkdown } from '../markdown-parse.ts';

test('headings, rules and paragraphs', () => {
  const blocks = parseMarkdown('# Title\n\nbody text\n\n---\n\n## Sub');
  assert.deepEqual(blocks, [
    { t: 'h', level: 1, text: 'Title' },
    { t: 'p', text: 'body text' },
    { t: 'hr' },
    { t: 'h', level: 2, text: 'Sub' },
  ]);
});

test('fenced code blocks keep newlines', () => {
  const blocks = parseMarkdown('before\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n\nafter');
  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].t, 'code');
  if (blocks[1].t === 'code') {
    assert.equal(blocks[1].lang, 'ts');
    assert.equal(blocks[1].text, 'const a = 1;\nconst b = 2;');
  }
});

test('unordered and ordered lists with indent', () => {
  const blocks = parseMarkdown('- a\n- b\n\n1. first\n2. second\n  - nested');
  assert.equal(blocks[0].t, 'ul');
  assert.equal(blocks[1].t, 'ol');
  if (blocks[1].t === 'ol') assert.equal(blocks[1].items.length, 2);
  assert.equal(blocks[2].t, 'ul');
  if (blocks[2].t === 'ul') assert.equal(blocks[2].items[0].indent, 1);
});

test('quotes and tables', () => {
  const blocks = parseMarkdown('> hello\n> world\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.equal(blocks[0].t, 'quote');
  assert.equal(blocks[1].t, 'table');
  if (blocks[1].t === 'table') {
    assert.deepEqual(blocks[1].head, ['a', 'b']);
    assert.deepEqual(blocks[1].rows, [['1', '2']]);
  }
});

test('inline styles, code and links', () => {
  const parts = parseInline('hi **bold** and *italic* with `code` and [x](https://example.com/a) end');
  assert.deepEqual(parts.map((p) => p.t), ['text', 'b', 'text', 'i', 'text', 'code', 'text', 'link', 'text']);
  const link = parts.find((p) => p.t === 'link');
  assert.equal(link && link.t === 'link' && link.url, 'https://example.com/a');
});

test('javascript: links are not linkified', () => {
  const parts = parseInline('[x](javascript:alert(1))');
  assert.ok(parts.every((p) => p.t !== 'link'));
});
