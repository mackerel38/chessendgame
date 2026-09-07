import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { readFen, readGame, readSharedGame, repetitionRestart, shareUrl, undoTurn, MAX_SHARE_LENGTH } from '../lib/study.ts';
import { analyzeTactics } from '../lib/tactics.ts';

const START = '7k/8/8/8/8/8/R7/K7 w - - 0 1';
const cycle = ['Rb2', 'Kg8', 'Ra2', 'Kh8'];

test('FEN imports include normal chess, but reject malformed and illegal king positions', () => {
  assert.equal(readGame(new Chess().fen(), 'fen').game.board().flat().filter(Boolean).length, 32);
  assert.throws(() => readFen('not a fen'));
  assert.throws(() => readFen('8/8/8/8/8/8/4k3/4K3 w - - 0 1'));
  assert.throws(() => readFen('7k/8/8/8/8/8/R7/K7 b - - -1 1'));
  assert.throws(() => readFen('7k/8/8/8/8/8/7R/K7 w - - 0 1'));
  assert.equal(readFen('7k/8/8/8/8/8/7R/K7 b - - 0 1').isCheck(), true);
});

test('PGN round-trip preserves black-to-move FEN, clocks, comments and history', () => {
  const c = new Chess('7k/8/8/8/8/8/R7/K7 b - - 9 37');
  const initial = c.fen(); c.move('Kg8'); c.setComment('日本語のコメント'); c.move('Rb2');
  const loaded = readGame(c.pgn(), 'pgn');
  assert.equal(loaded.initialFen, initial);
  assert.equal(loaded.game.fen(), c.fen());
  assert.deepEqual(loaded.game.history(), c.history());
  assert.match(loaded.game.pgn(), /日本語のコメント/);
  assert.throws(() => readGame('1. e4 e5 2. this-is-not-a-move', 'pgn'));
  assert.throws(() => readGame('1. --', 'pgn'));
});

test('training undo restores one complete player turn, including a pending reply', () => {
  const c = new Chess(START); c.move('Rb2'); c.move('Kg8');
  assert.equal(undoTurn(c, 'w'), 2); assert.equal(c.fen(), START);
  c.move('Rb2'); assert.equal(undoTurn(c, 'w'), 1); assert.equal(c.fen(), START);
  assert.equal(undoTurn(c, 'w'), 0);
  const black = new Chess('7k/8/8/8/8/8/R7/K7 b - - 0 1');
  const initial = black.fen(); black.move('Kg8'); black.move('Rb2');
  assert.equal(undoTurn(black, 'b'), 2); assert.equal(black.fen(), initial);
});

test('viewer undo is one ply, and undo truncates the exported continuation', () => {
  const c = new Chess(START); c.move('Rb2'); const halfway = c.fen(); c.move('Kg8');
  assert.equal(undoTurn(c, 'w', true), 1); assert.equal(c.fen(), halfway);
  assert.deepEqual(readSharedGame(shareUrl(c, 'https://example.test/chessendgame/'))!.game.history(), ['Rb2']);
});

test('undo restores en passant, castling rights and every promotion type', () => {
  const ep = new Chess('7k/8/8/3pP3/8/8/8/K7 w - d6 0 1');
  const initialEp = ep.fen(); ep.move('exd6'); undoTurn(ep, 'w'); assert.equal(ep.fen(), initialEp);
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const initialCastle = castle.fen(); castle.move('O-O'); undoTurn(castle, 'w'); assert.equal(castle.fen(), initialCastle);
  for (const promotion of ['q', 'r', 'b', 'n']) {
    const c = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1'), initial = c.fen();
    c.move({ from: 'a7', to: 'a8', promotion }); undoTurn(c, 'w'); assert.equal(c.fen(), initial);
  }
});

test('threefold reset clears history without treating other draws as repetitions', () => {
  const c = new Chess(START);
  for (let i = 0; i < 2; i++) for (const move of cycle) c.move(move);
  assert.equal(c.isThreefoldRepetition(), true);
  const reset = repetitionRestart(c, START)!;
  assert.equal(reset.fen(), START); assert.deepEqual(reset.history(), []);
  assert.equal(reset.isThreefoldRepetition(), false);
  assert.equal(c.history().length, 8, 'reset must not mutate a replay copy');
  undoTurn(c, 'w'); assert.equal(c.isThreefoldRepetition(), false);
  assert.equal(repetitionRestart(new Chess('7k/8/8/8/8/8/R7/K7 w - - 100 51'), START), null);
});

test('PGN and shared history preserve repetition; FEN-only shares deliberately do not', () => {
  const c = new Chess(START); for (let i = 0; i < 2; i++) for (const move of cycle) c.move(move);
  assert.equal(readGame(c.pgn(), 'pgn').game.isThreefoldRepetition(), true);
  const url = shareUrl(c, 'https://example.test/chessendgame/?view=board#old');
  assert.equal(new URL(url).pathname, '/chessendgame/');
  const loaded = readSharedGame(url)!;
  assert.equal(loaded.initialFen, START); assert.equal(loaded.game.fen(), c.fen());
  assert.equal(loaded.game.isThreefoldRepetition(), true);
  const position = readSharedGame(shareUrl(c, 'https://example.test/', true))!;
  assert.equal(position.game.fen(), c.fen()); assert.equal(position.game.history().length, 0);
});

test('shared underpromotion and en-passant moves survive a round trip', () => {
  for (const [fen, move] of [
    ['7k/P7/8/8/8/8/8/7K w - - 0 1', 'a8=N'],
    ['7k/8/8/3pP3/8/8/8/K7 w - d6 0 1', 'exd6'],
  ]) {
    const c = new Chess(fen); c.move(move);
    assert.equal(readSharedGame(shareUrl(c, 'https://example.test/'))!.game.fen(), c.fen());
  }
});

test('invalid URL versions, oversized data and illegal moves fail closed', () => {
  const url = (data: unknown) => 'https://example.test/#study=' + encodeURIComponent(JSON.stringify(data));
  assert.equal(readSharedGame('https://example.test/#help'), null);
  assert.throws(() => readSharedGame(url({ v: 2, fen: START, moves: [] })));
  assert.throws(() => readSharedGame(url({ v: 1, fen: START, moves: ['a2a8q'] })));
  assert.throws(() => readSharedGame(url({ v: 1, fen: START, moves: [123] })));
  assert.throws(() => readSharedGame('https://example.test/#study=%7B'));
  assert.throws(() => readSharedGame('https://example.test/#' + 'a'.repeat(MAX_SHARE_LENGTH)));
});

test('forks include two targets but exclude an absolutely pinned attacker', () => {
  const fork = analyzeTactics('7k/8/2r3q1/4N3/8/8/8/K7 w - - 0 1');
  assert.deepEqual(fork.arrows.filter(a => a.kind === 'fork' && a.from === 'e5').map(a => a.to).sort(), ['c6', 'g6']);
  const pinned = analyzeTactics('4r2k/8/2q3r1/4N3/8/8/8/4K3 w - - 0 1');
  assert.equal(pinned.arrows.some(a => a.kind === 'fork' && a.from === 'e5'), false);
});

test('discovered attacks compare the before/after position, including en passant', () => {
  const c = new Chess('r6k/8/8/8/8/8/B7/R6K w - - 0 1'), before = c.fen();
  c.move('Bb3');
  assert.ok(analyzeTactics(c.fen(), before).arrows.some(a => a.kind === 'discovered' && a.from === 'a1' && a.to === 'a8'));
  assert.equal(analyzeTactics(c.fen(), c.fen()).arrows.some(a => a.kind === 'discovered'), false);
  const ep = new Chess('7k/8/8/RPp4q/8/8/8/6K1 w - c6 0 1'), beforeEp = ep.fen(); ep.move('bxc6');
  assert.ok(analyzeTactics(ep.fen(), beforeEp).arrows.some(a => a.kind === 'discovered' && a.from === 'a5' && a.to === 'h5'));
});

test('mate and stalemate have different markers and escape-square arrows', () => {
  const mate = analyzeTactics('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1');
  assert.ok(mate.labels.includes('チェックメイト'));
  assert.ok(mate.arrows.some(a => a.kind === 'mate' && a.to === 'h8'));
  const stale = analyzeTactics('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
  assert.ok(stale.labels.some(label => label.startsWith('ステイルメイト')));
  assert.equal(stale.arrows.some(a => a.to === 'h8'), false, 'stalemate is not a check');
  assert.ok(stale.arrows.some(a => a.kind === 'stalemate'));
  const xray = analyzeTactics('Rk6/8/2K5/8/8/8/8/R7 b - - 0 1');
  assert.ok(xray.arrows.some(a => a.kind === 'mate' && a.from === 'a8' && a.to === 'c8'));
});
