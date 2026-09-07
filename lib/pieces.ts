/** Original vector artwork. No fonts, CDN, external references or platform emoji. */
const shapes: Record<string, string> = {
  p: '<circle cx="32" cy="17" r="9"/><path d="M25 26h14l-3 13 7 10H21l7-10Z"/>',
  r: '<path d="M18 9h8v9h6V9h7v9h7V9h5v18l-8 5 2 17H19l2-17-7-5V9Z"/><path d="M21 28h22M22 42h20" fill="none"/>',
  n: '<path d="m20 10 8 5 13-3 9 14-9 9-3 14H17l3-12 15-15-9 4-6 8-9-4 8-13Z"/><path d="m26 17 8 4M18 41h16" fill="none"/><circle cx="26" cy="22" r="1.5" fill="STROKE" stroke="none"/>',
  b: '<path d="M32 7C13 23 18 31 28 34l-7 15h22l-7-15C47 31 50 23 32 7Z"/><path d="m34 16-8 10M25 38h14" fill="none"/><circle cx="32" cy="7" r="2"/>',
  q: '<path d="m14 19 8 27h20l8-27-12 13-6-17-7 17Z"/><circle cx="13" cy="16" r="4"/><circle cx="32" cy="12" r="4"/><circle cx="51" cy="16" r="4"/><path d="M23 39h18M21 47h22" fill="none"/>',
  k: '<path d="M29 6h6v7h7v6h-7v8h-6v-8h-7v-6h7Z"/><path d="M32 32C18 17 10 30 20 40l3 9h18l3-9c10-10 2-23-12-8Z"/><path d="M23 42h18" fill="none"/>',
};
export const pieceImages: Record<string, string> = Object.fromEntries(
  ['w', 'b'].flatMap(color => Object.entries(shapes).map(([type, shape]) => {
    const fill = color === 'w' ? '#fffdf4' : '#26372e';
    const stroke = color === 'w' ? '#26372e' : '#e9edda';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="${fill}" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${shape.replaceAll('STROKE', stroke)}<path d="M20 49h24l5 8H15Z"/></g></svg>`;
    return [color + type, 'data:image/svg+xml,' + encodeURIComponent(svg)];
  })),
);
