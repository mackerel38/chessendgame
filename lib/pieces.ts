export type PieceSet = 'cburnett' | 'neo';

export const PIECE_SETS: Array<{ id: PieceSet; label: string; source: string }> = [
  { id: 'cburnett', label: 'Cburnett', source: 'Lichess' },
  { id: 'neo', label: 'Neo', source: 'Chess.com' },
];

export const piecePath = (set: PieceSet, code: string) => set === 'cburnett'
  ? `./pieces/cburnett/${code[0]}${code[1].toUpperCase()}.svg`
  : `./pieces/neo/${code}.png`;
