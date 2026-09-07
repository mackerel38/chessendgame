import assert from 'node:assert/strict';
import test from 'node:test';
import { pieceImages } from '../lib/pieces.ts';

test('all twelve pieces are distinct self-contained SVG images, not font glyphs', () => {
  assert.equal(Object.keys(pieceImages).length, 12);
  assert.equal(new Set(Object.values(pieceImages)).size, 12);
  for (const color of ['w', 'b']) for (const type of ['k', 'q', 'r', 'b', 'n', 'p']) {
    const data = pieceImages[color + type];
    assert.ok(data.startsWith('data:image/svg+xml,'));
    const svg = decodeURIComponent(data.split(',')[1]);
    assert.match(svg, /viewBox="0 0 64 64"/);
    assert.doesNotMatch(svg, /<text|<script|<image|href=|[\u2654-\u265f]/);
  }
});
