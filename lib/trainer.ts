import { Chess } from 'chess.js';
export type TBMove = {uci:string;san:string;category:string;dtz:number|null;checkmate:boolean};
export type Tablebase = {category:string;dtz:number|null;dtm:number|null;checkmate:boolean;stalemate:boolean;insufficient_material:boolean;moves:TBMove[]};
export type Exercise = {id:string;title:string;material:string;fen:string;goal:'win'|'draw';tip:string;level:string};
export const exercises:Exercise[] = [
{id:'opposition',title:'ポーンを昇格させよう',material:'キング ＋ ポーン vs キング',fen:'4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',goal:'win',tip:'キングを先に進めて、ポーンの通り道を確保しましょう。相手のキングとの距離が鍵です。',level:'基本'},
{id:'rook',title:'ルークで包囲する',material:'キング ＋ ルーク vs キング',fen:'7k/8/5K2/8/8/8/8/6R1 w - - 0 1',goal:'win',tip:'ルークで逃げ道を狭め、キングと協力して盤端に追い込みましょう。',level:'基本'},
{id:'queen',title:'クイーンで仕上げる',material:'キング ＋ クイーン vs キング',fen:'7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',goal:'win',tip:'相手の合法手をすべて奪うとステイルメイトになることも。チェックをかけて仕留めましょう。',level:'基本'},
{id:'defense',title:'オポジションを守る',material:'キング vs キング ＋ ポーン',fen:'8/8/8/8/4k3/4p3/4K3/8 w - - 0 1',goal:'draw',tip:'相手のキングの進路を塞ぎ、ポーンの前を守りましょう。引き分けを守る手は限られます。',level:'実践'},
{id:'rook-pawn',title:'隅で引き分けを守る',material:'キング vs キング ＋ 端ポーン',fen:'1k6/8/PK6/8/8/8/8/8 b - - 0 1',goal:'draw',tip:'端ポーンの昇格マスをキングで守りましょう。盤の隅が安全な場所になることがあります。',level:'基本'}
];
// Categories in moves are from the opponent's perspective AFTER the move.
export function outcome(category:string):number|null{
 if(category==='win')return 1;
 if(category==='loss')return -1;
 if(['draw','cursed-win','blessed-loss'].includes(category))return 0;
 return null; // Uncertain/unsupported categories must never be graded as exact.
}
export function preservesGoal(move:TBMove,goal:Exercise['goal']){const result=outcome(move.category);return result!==null&&(goal==='win'?result===-1:result<=0)}
export function applyUci(chess:Chess,uci:string){return chess.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci[4]?{promotion:uci[4]}:{})})}
export function terminal(chess:Chess,player:'w'|'b',goal:Exercise['goal']):{success:boolean;text:string}|null{
 if(chess.isCheckmate()){const won=chess.turn()!==player;return {success:won,text:won?'チェックメイト！ 勝ち切りました。':'チェックメイト。もう一度挑戦しましょう。'}}
 if(chess.isDraw()){let reason='引き分けが成立しました。';if(chess.isStalemate())reason='ステイルメイトで引き分けです。';else if(chess.isInsufficientMaterial())reason='詰ませる駒が足りないため引き分けです。';else if(chess.isThreefoldRepetition())reason='同一局面が3回現れ、引き分けです。';else if(chess.isDrawByFiftyMoves())reason='50手ルールで引き分けです。';return {success:goal==='draw',text:reason}}
 return null;
}
