export type Exercise = {id:string;title:string;material:string;fen:string;goal:'win'|'draw';tip:string;level:string};
export const exercises:Exercise[] = [
{id:'opposition',title:'ポーンを昇格させよう',material:'キング ＋ ポーン vs キング',fen:'4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',goal:'win',tip:'キングを先に進めて、ポーンの通り道を確保しましょう。相手のキングとの距離が鍵です。',level:'基本'},
{id:'rook',title:'ルークで包囲する',material:'キング ＋ ルーク vs キング',fen:'7k/8/5K2/8/8/8/8/6R1 w - - 0 1',goal:'win',tip:'ルークで逃げ道を狭め、キングと協力して盤端に追い込みましょう。',level:'基本'},
{id:'queen',title:'クイーンで仕上げる',material:'キング ＋ クイーン vs キング',fen:'7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',goal:'win',tip:'相手の合法手をすべて奪うとステイルメイトになることも。チェックをかけて仕留めましょう。',level:'基本'},
{id:'defense',title:'オポジションを守る',material:'キング vs キング ＋ ポーン',fen:'8/8/8/8/4k3/4p3/4K3/8 w - - 0 1',goal:'draw',tip:'相手のキングの進路を塞ぎ、ポーンの前を守りましょう。引き分けを守る手は限られます。',level:'実践'},
{id:'rook-pawn',title:'隅で引き分けを守る',material:'キング vs キング ＋ 端ポーン',fen:'1k6/8/PK6/8/8/8/8/8 b - - 0 1',goal:'draw',tip:'端ポーンの昇格マスをキングで守りましょう。盤の隅が安全な場所になることがあります。',level:'基本'}
];
