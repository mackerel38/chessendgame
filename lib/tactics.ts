import { Chess, type Square } from 'chess.js';

export type TacticKind = 'check' | 'mate' | 'stalemate' | 'fork' | 'discovered';
export type TacticArrow = { from: Square; to: Square; kind: TacticKind };
export type Tactics = { arrows: TacticArrow[]; squares: { square: Square; kind: TacticKind }[]; labels: string[] };

/** A geometric attack is not a threat when moving the attacker exposes its king. */
function safeAttack(c: Chess, from: Square, to: Square): boolean {
  const piece = c.get(from);
  if (!piece || !c.attackers(to, piece.color).includes(from)) return false;
  const copy = new Chess(c.fen());
  copy.remove(from);
  copy.remove(to);
  copy.put(piece, to);
  const king = copy.board().flat().find(p => p?.color === piece.color && p.type === 'k');
  return !!king && !copy.isAttacked(king.square, piece.color === 'w' ? 'b' : 'w');
}

/** Describes visible attack relationships, not a search or a claim of material gain. */
export function analyzeTactics(fen: string, previousFen?: string): Tactics {
  const c = new Chess(fen);
  const result: Tactics = { arrows: [], squares: [], labels: [] };
  const add = (from: Square, to: Square, kind: TacticKind) => {
    if (!result.arrows.some(a => a.from === from && a.to === to && a.kind === kind)) result.arrows.push({ from, to, kind });
  };
  const pieces = c.board().flat().filter(p => p !== null);
  const king = pieces.find(p => p.type === 'k' && p.color === c.turn())!;
  const opponent = c.turn() === 'w' ? 'b' : 'w';
  const mate = c.isCheckmate(), stale = c.isStalemate();
  if (c.isCheck()) {
    const kind = mate ? 'mate' : 'check';
    for (const from of c.attackers(king.square, opponent)) add(from, king.square, kind);
    result.squares.push({ square: king.square, kind });
    result.labels.push(mate ? 'チェックメイト' : 'チェック');
  }
  if (mate || stale) {
    const kind = stale ? 'stalemate' : 'mate';
    if (stale) { result.squares.push({ square: king.square, kind }); result.labels.push('ステイルメイト（チェックなし・合法手なし）'); }
    const file = king.square.charCodeAt(0) - 97, rank = Number(king.square[1]);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = file + dx, y = rank + dy;
      if ((!dx && !dy) || x < 0 || x > 7 || y < 1 || y > 8) continue;
      const square = ('abcdefgh'[x] + y) as Square;
      if (c.get(square)?.color === king.color) { result.squares.push({ square, kind }); continue; }
      // Remove the king and a would-be capture to reveal x-ray attacks on escape squares.
      const copy = new Chess(fen);
      copy.remove(king.square);
      copy.remove(square);
      for (const from of copy.attackers(square, opponent)) add(from, square, kind);
    }
  }
  if (!mate && !stale) {
    for (const piece of pieces) {
      if (piece.type === 'k') continue;
      const targets = pieces.filter(target => target.color !== piece.color && safeAttack(c, piece.square, target.square));
      if (targets.length >= 2) {
        for (const target of targets) add(piece.square, target.square, 'fork');
        if (!result.labels.includes('フォーク（複数の駒への利き）')) result.labels.push('フォーク（複数の駒への利き）');
      }
    }
  }
  if (previousFen) {
    const previous = new Chess(previousFen);
    for (const piece of pieces) {
      if (!['b', 'r', 'q'].includes(piece.type) || piece.color !== previous.turn()) continue;
      const before = previous.get(piece.square);
      if (!before || before.color !== piece.color || before.type !== piece.type) continue;
      for (const target of pieces) {
        const oldTarget = previous.get(target.square);
        if (target.color === piece.color || !oldTarget || oldTarget.color !== target.color || oldTarget.type !== target.type) continue;
        if (safeAttack(c, piece.square, target.square) && !previous.attackers(target.square, piece.color).includes(piece.square)) {
          add(piece.square, target.square, 'discovered');
          if (!result.labels.includes('ディスカバードアタック')) result.labels.push('ディスカバードアタック');
        }
      }
    }
  }
  return result;
}
