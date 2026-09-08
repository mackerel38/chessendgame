import { useEffect, useState } from 'react';
import { piecePath, type PieceSet } from '../lib/pieces';

const STORAGE_KEY = 'endgame-piece-set';
const EVENT_NAME = 'endgame-piece-set-change';

export function getPieceSet(): PieceSet {
  if (typeof window === 'undefined') return 'cburnett';
  return window.localStorage.getItem(STORAGE_KEY) === 'neo' ? 'neo' : 'cburnett';
}

export function setPieceSet(set: PieceSet) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, set);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: set }));
  }
}

/** Tiny local SVG data images also work under a GitHub Pages subdirectory. */
export default function Piece({ code }: { code: string }) {
  const [set, setCurrent] = useState<PieceSet>('cburnett');
  useEffect(() => {
    setCurrent(getPieceSet());
    const onChange = (event: Event) => {
      const value = (event as CustomEvent<PieceSet>).detail;
      if (value === 'cburnett' || value === 'neo') setCurrent(value);
    };
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="piece-image" src={piecePath(set, code)} alt="" aria-hidden="true" draggable={false} />;
}
