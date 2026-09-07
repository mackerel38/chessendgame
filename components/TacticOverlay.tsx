import { useId } from 'react';
import { screenPoint } from '../lib/board';
import type { Tactics, TacticKind } from '../lib/tactics';

const colors: Record<TacticKind, string> = { check: '#c13d36', mate: '#c13d36', stalemate: '#436ca5', fork: '#a56b12', discovered: '#8548aa' };
export default function TacticOverlay({ tactics, blackBottom }: { tactics: Tactics; blackBottom: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return <svg className="annotations tactic-annotations" viewBox="0 0 8 8" aria-hidden="true">
    <defs>{Object.entries(colors).map(([kind, color]) => <marker key={kind} id={`${id}-${kind}`} markerWidth="3" markerHeight="3" refX="2.1" refY="1.5" orient="auto"><path d="M0,0 L3,1.5 L0,3 Z" fill={color} /></marker>)}</defs>
    {tactics.squares.map((mark, i) => { const p = screenPoint(mark.square, blackBottom); return <rect key={i} x={p.x + .06} y={p.y + .06} width=".88" height=".88" rx=".12" fill="none" stroke={colors[mark.kind]} strokeWidth=".07" />; })}
    {tactics.arrows.map((arrow, i) => {
      const f = screenPoint(arrow.from, blackBottom), t = screenPoint(arrow.to, blackBottom);
      return <line key={i} data-tactic={arrow.kind} x1={f.x + .5} y1={f.y + .5} x2={t.x + .5} y2={t.y + .5} stroke={colors[arrow.kind]} opacity=".8" strokeWidth=".085" strokeDasharray={arrow.kind === 'discovered' ? '.16 .08' : undefined} markerEnd={`url(#${id}-${arrow.kind})`} />;
    })}
  </svg>;
}
