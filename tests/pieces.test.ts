import assert from 'node:assert/strict';
import test from 'node:test';
import { PIECE_SETS, piecePath } from '../lib/pieces.ts';

test('Cburnett and Neo each expose all twelve bundled image paths', () => {
  assert.deepEqual(PIECE_SETS.map(set => set.id), ['cburnett', 'neo']);
  for (const set of PIECE_SETS) for (const color of ['w', 'b']) for (const type of ['k', 'q', 'r', 'b', 'n', 'p']) {
    const path = piecePath(set.id, color + type);
    assert.match(path, new RegExp(`pieces/${set.id}/`));
    assert.match(path, set.id === 'cburnett' ? /\.svg$/ : /\.png$/);
  }
});
