import { pieceImages } from '../lib/pieces';

/** Tiny local SVG data images also work under a GitHub Pages subdirectory. */
export default function Piece({ code }: { code: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="piece-image" src={pieceImages[code]} alt="" aria-hidden="true" draggable={false} />;
}
