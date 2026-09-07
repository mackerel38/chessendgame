import { Chess } from 'chess.js';
export type TBMove = {uci:string;san:string;category:string;dtz:number|null;checkmate:boolean};
export type Tablebase = {category:string;dtz:number|null;dtm:number|null;checkmate:boolean;stalemate:boolean;insufficient_material:boolean;moves:TBMove[]};
// Categories in moves are from the opponent's perspective AFTER the move.
export function outcome(category:string):number|null{
 if(category==='win')return 1;
 if(category==='loss')return -1;
 if(['draw','cursed-win','blessed-loss'].includes(category))return 0;
 return null; // Uncertain/unsupported categories must never be graded as exact.
}
export function preservesGoal(move:TBMove,goal:'win'|'draw'){const result=outcome(move.category);return result!==null&&(goal==='win'?result===-1:result<=0)}
export function applyUci(chess:Chess,uci:string){return chess.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci[4]?{promotion:uci[4]}:{})})}
export function terminal(chess:Chess,player:'w'|'b',goal:'win'|'draw'):{success:boolean;text:string}|null{
 if(chess.isCheckmate()){const won=chess.turn()!==player;return {success:won,text:won?'チェックメイト！ 勝ち切りました。':'チェックメイト。もう一度挑戦しましょう。'}}
 if(chess.isDraw()){let reason='引き分けが成立しました。';if(chess.isStalemate())reason='ステイルメイトで引き分けです。';else if(chess.isInsufficientMaterial())reason='詰ませる駒が足りないため引き分けです。';else if(chess.isThreefoldRepetition())reason='同一局面が3回現れ、引き分けです。';else if(chess.isDrawByFiftyMoves())reason='50手ルールで引き分けです。';return {success:goal==='draw',text:reason}}
 return null;
}

export function cloneGame(chess:Chess,initial:string){const copy=new Chess(initial);for(const san of chess.history())copy.move(san);return copy;}
