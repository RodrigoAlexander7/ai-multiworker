// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsConversion } from '../src/infrastructure/content/markitdown.js';

test('binary document formats are converted rather than read as text', () => {
  for (const file of ['paper.pdf', 'notes.docx', 'deck.pptx', 'data.xlsx', 'book.epub']) {
    assert.equal(needsConversion(file), true, file);
  }
});

test('html is converted too, since its markup dwarfs its prose', () => {
  assert.equal(needsConversion('docs/index.html'), true);
  assert.equal(needsConversion('page.htm'), true);
});

test('text formats are read directly', () => {
  for (const file of ['index.js', 'README.md', 'data.json', 'rows.csv', 'config.yaml', 'log.txt']) {
    assert.equal(needsConversion(file), false, file);
  }
});

test('the extension check ignores case and path shape', () => {
  assert.equal(needsConversion('/abs/path/PAPER.PDF'), true);
  assert.equal(needsConversion('C:\\docs\\Report.DocX'), true);
  assert.equal(needsConversion('no-extension'), false);
});
