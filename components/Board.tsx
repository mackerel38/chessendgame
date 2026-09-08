import { useId, useRef, useState, type PointerEvent, type CSSProperties } from 'react';
import { Chess, type Square } from 'chess.js';
import { screenPoint, squareAt } from '../lib/board';
import Piece from './Piece';
import TacticOverlay from './TacticOverlay';
import type { Tactics } from '../lib/tactics';

export const names: Record<string, string> = { k: 'キング', q: 'クイーン', r: 'ルーク', b: 'ビショップ', n: 'ナイト', p: 'ポーン' };
export type Animation = { id: number; from: string; to: string; piece: string };
export type MoveMark = { from: string; to: string; kind: '?' | '??' };
type Props = { fen: string; blackBottom: boolean; disabled: boolean; selected: string; legal: string[]; hint: string; animation: Animation | null; tactics?: Tactics | null; moveMark?: MoveMark | null; drawMark?: boolean; onSquare: (s: string) => void; onMove: (from: string, to: string) => void; onSelect: (s: string) => void };
export default function Board(p: Props) {
  const ref = useRef<HTMLDivElement>(null), gesture = useRef<{ from: string; right: boolean; x: number; y: number; moved: boolean; pointer: number } | null>(null);
  const [drag, setDrag] = useState<{ from: string; x: number; y: number } | null>(null), [draft, setDraft] = useState<{ from: string; to: string } | null>(null), [marks, setMarks] = useState<string[]>([]), [arrows, setArrows] = useState<{ from: string; to: string }[]>([]);
  const markerId = 'manual-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const chess = new Chess(p.fen);
  function coords(e: PointerEvent) {
    const rect = ref.current!.getBoundingClientRect(), border = ref.current!.clientLeft, size = ref.current!.clientWidth;
    return { x: (e.clientX - rect.left - border) / size * 8, y: (e.clientY - rect.top - border) / size * 8 };
  }
  function down(e: PointerEvent) {
    if (e.button !== 0 && e.button !== 2) return;
    const c = coords(e), from = squareAt(c.x, c.y, p.blackBottom);
    if (!from || (e.button === 0 && p.disabled)) return;
    e.preventDefault(); ref.current!.setPointerCapture(e.pointerId);
    gesture.current = { from, right: e.button === 2, x: e.clientX, y: e.clientY, moved: false, pointer: e.pointerId };
  }
  function move(e: PointerEvent) {
    const g = gesture.current; if (!g || g.pointer !== e.pointerId) return;
    const c = coords(e); g.moved ||= Math.hypot(e.clientX - g.x, e.clientY - g.y) > 5; if (!g.moved) return;
    const to = squareAt(c.x, c.y, p.blackBottom);
    if (g.right) setDraft({ from: g.from, to: to || g.from });
    else if (!p.disabled && chess.get(g.from as Square)) { p.onSelect(g.from); setDrag({ from: g.from, ...c }); }
  }
  function up(e: PointerEvent) {
    const g = gesture.current; if (!g || g.pointer !== e.pointerId) return;
    gesture.current = null; const c = coords(e), to = squareAt(c.x, c.y, p.blackBottom); setDrag(null); setDraft(null);
    if (ref.current!.hasPointerCapture(e.pointerId)) ref.current!.releasePointerCapture(e.pointerId);
    if (g.right) {
      if (!to) return;
      if (to === g.from) setMarks(prev => prev.includes(to) ? prev.filter(s => s !== to) : [...prev, to]);
      else setArrows(prev => prev.some(a => a.from === g.from && a.to === to) ? prev.filter(a => a.from !== g.from || a.to !== to) : [...prev, { from: g.from, to }]);
    } else if (!p.disabled) {
      setMarks([]); setArrows([]);
      if (g.moved) { if (to && to !== g.from) p.onMove(g.from, to); } else p.onSquare(g.from);
    }
  }
  const renderedArrows = [...arrows, ...(draft && draft.from !== draft.to ? [draft] : [])];
  const a = p.animation, from = a ? screenPoint(a.from, p.blackBottom) : null, to = a ? screenPoint(a.to, p.blackBottom) : null;
  const draggedPiece = drag ? chess.get(drag.from as Square) : null;
  const kings = p.drawMark ? chess.board().flat().filter(piece => piece?.type === 'k') : [];
  return <><div className="board-wrap"><div ref={ref} className="board interactive-board" data-fen={p.fen} aria-label="チェス盤" onContextMenu={e => e.preventDefault()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { gesture.current = null; setDrag(null); setDraft(null); }}>
    {Array.from({ length: 64 }, (_, i) => {
      const s = squareAt(i % 8 + .5, Math.floor(i / 8) + .5, p.blackBottom), piece = chess.get(s as Square);
      return <button key={s} data-square={s} aria-label={`${s} ${piece ? (piece.color === 'w' ? '白' : '黒') + names[piece.type] : ''}`} aria-pressed={p.selected === s} onClick={e => { if (e.detail === 0 && !p.disabled) p.onSquare(s); }} className={`square ${(Number(s[1]) + 'abcdefgh'.indexOf(s[0])) % 2 === 0 ? 'dark' : 'light'} ${p.selected === s ? 'selected' : ''} ${p.hint && (s === p.hint.slice(0, 2) || s === p.hint.slice(2, 4)) ? 'hint-square' : ''}`}>
        <span className={drag?.from === s || a?.to === s ? 'hidden-piece' : ''}>{piece && <Piece code={piece.color + piece.type} />}</span>
        {p.legal.includes(s) && <i className={piece ? 'capture-dot' : 'move-dot'} />}{i % 8 === 0 && <small className="rank">{s[1]}</small>}{i >= 56 && <small className="file">{s[0]}</small>}
      </button>;
    })}
    {p.tactics && <TacticOverlay tactics={p.tactics} blackBottom={p.blackBottom} />}
    <svg className="annotations" viewBox="0 0 8 8" aria-hidden="true"><defs><marker id={markerId} markerWidth="3" markerHeight="3" refX="2.1" refY="1.5" orient="auto"><path d="M0,0 L3,1.5 L0,3 Z" fill="#1e754bdd" /></marker></defs>
      {marks.map(s => { const pt = screenPoint(s, p.blackBottom); return <circle key={s} cx={pt.x + .5} cy={pt.y + .5} r=".4" fill="none" stroke="#1e754bdd" strokeWidth=".09" />; })}
      {renderedArrows.map((ar, i) => { const f = screenPoint(ar.from, p.blackBottom), t = screenPoint(ar.to, p.blackBottom); return <line key={i} x1={f.x + .5} y1={f.y + .5} x2={t.x + .5} y2={t.y + .5} stroke="#1e754bdd" strokeWidth=".13" strokeLinecap="round" markerEnd={`url(#${markerId})`} />; })}
      {p.moveMark && (() => { const t = screenPoint(p.moveMark.to, p.blackBottom); const bad = p.moveMark.kind === '??'; return <text x={t.x + .82} y={t.y + .22} textAnchor="middle" fontSize=".42" fontWeight="800" fill={bad ? '#c13d36' : '#b88418'} stroke="#fff9" strokeWidth=".035" paintOrder="stroke">{p.moveMark.kind}</text>; })()}
      {kings.map(piece => { const t = screenPoint(piece!.square, p.blackBottom); return <text key={`draw-${piece!.square}`} x={t.x + .82} y={t.y + .22} textAnchor="middle" fontSize=".42" fontWeight="900" fill="#4b4f4d" stroke="#fff9" strokeWidth=".035" paintOrder="stroke">=</text>; })}
    </svg>
    {drag && draggedPiece && <span className="floating-piece" style={{ left: drag.x / 8 * 100 + '%', top: drag.y / 8 * 100 + '%' }}><Piece code={draggedPiece.color + draggedPiece.type} /></span>}
    {a && from && to && <span key={a.id} className="animated-piece" style={{ left: to.x / 8 * 100 + '%', top: to.y / 8 * 100 + '%', '--dx': (from.x - to.x) * 100 + '%', '--dy': (from.y - to.y) * 100 + '%' } as CSSProperties}><Piece code={a.piece} /></span>}
  </div></div></>;
}
