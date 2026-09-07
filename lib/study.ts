import { Chess, type Color } from 'chess.js';

export const MAX_IMPORT_LENGTH = 100_000;
export const MAX_SHARE_LENGTH = 16_000;
const MAX_PLIES = 2_048;
export type ImportedGame = { game: Chess; initialFen: string };

/** chess.js validates FEN syntax; also reject a king left in check on the previous turn. */
export function readFen(text: string): Chess {
  const fen = text.trim();
  if (fen.length > 200 || fen.split(/\s+/).length !== 6) {
    throw new Error('FENは6項目（駒配置・手番・キャスリング・アンパッサン・半手数・手数）で入力してください。');
  }
  const fields = fen.split(/\s+/);
  if (![4, 5].every(i => /^\d+$/.test(fields[i]) && Number.isSafeInteger(Number(fields[i]))) || Number(fields[5]) < 1) {
    throw new Error('FENの半手数・手数が不正です。');
  }
  const c = new Chess(fen);
  const waiting = c.turn() === 'w' ? 'b' : 'w';
  const king = c.board().flat().find(p => p?.type === 'k' && p.color === waiting);
  if (!king || c.isAttacked(king.square, c.turn())) {
    throw new Error('手番ではない側のキングがチェックされている、不正な局面です。');
  }
  return c;
}

export function initialPosition(c: Chess): string {
  return c.history({ verbose: true })[0]?.before ?? c.fen();
}

export function readGame(text: string, format: 'fen' | 'pgn'): ImportedGame {
  if (!text.trim()) throw new Error('FENまたはPGNを入力してください。');
  if (text.length > MAX_IMPORT_LENGTH) throw new Error('入力が長すぎます（最大100,000文字）。');
  if (format === 'fen') {
    const game = readFen(text);
    return { game, initialFen: game.fen() };
  }
  const game = new Chess();
  game.loadPgn(text.trim(), { strict: true });
  const moves = game.history({ verbose: true });
  if (moves.length > MAX_PLIES) throw new Error('棋譜が長すぎます（最大2,048 ply）。');
  if (moves.some(m => m.from === m.to || m.san === '--')) {
    throw new Error('パス（null move）を含む棋譜は読み込めません。');
  }
  const initialFen = initialPosition(game);
  readFen(initialFen);
  readFen(game.fen());
  return { game, initialFen };
}

/** Undo the complete previous user turn, or one ply in the PGN/FEN viewer. */
export function undoTurn(c: Chess, player: Color, singlePly = false): number {
  let undone = 0;
  if (c.undo()) {
    undone++;
    while (!singlePly && c.turn() !== player && c.undo()) undone++;
  }
  if (undone) c.setHeader('Result', '*');
  return undone;
}

/** Returning a fresh instance clears repetition counts as well as the visible board. */
export function repetitionRestart(c: Chess, initialFen: string): Chess | null {
  return c.isThreefoldRepetition() ? new Chess(initialFen) : null;
}

export function shareUrl(c: Chess, base: string, positionOnly = false): string {
  const url = new URL(base);
  const params = new URLSearchParams();
  if (positionOnly) params.set('fen', c.fen());
  else params.set('study', JSON.stringify({
    v: 1,
    fen: initialPosition(c),
    moves: c.history({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? '')),
  }));
  url.hash = params.toString();
  if (url.href.length > MAX_SHARE_LENGTH) {
    throw new Error('共有URLが長すぎます。PGNファイルで共有するか「現在盤面のURL」を使ってください。');
  }
  return url.href;
}

/** Versioned URL fragments never require sending the study to a server. */
export function readSharedGame(href: string): ImportedGame | null {
  if (href.length > MAX_SHARE_LENGTH) throw new Error('共有URLが長すぎます。');
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.slice(1));
  const payload = params.get('study');
  if (payload !== null) {
    let value: unknown;
    try { value = JSON.parse(payload); } catch { throw new Error('共有URLのデータが壊れています。'); }
    if (!value || typeof value !== 'object') throw new Error('共有URLの形式が不正です。');
    const data = value as Record<string, unknown>;
    if (data.v !== 1 || typeof data.fen !== 'string' || !Array.isArray(data.moves) || data.moves.length > MAX_PLIES) {
      throw new Error('共有URLのバージョンまたは形式に対応していません。');
    }
    const game = readFen(data.fen);
    const initialFen = game.fen();
    for (const uci of data.moves) {
      if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
        throw new Error('共有URLに不正な着手が含まれています。');
      }
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
      if (move.from + move.to + (move.promotion ?? '') !== uci) throw new Error('共有URLの昇格指定が不正です。');
    }
    return { game, initialFen };
  }
  const fen = params.get('fen') ?? url.searchParams.get('fen');
  return fen === null ? null : readGame(fen, 'fen');
}
