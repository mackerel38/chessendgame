import { Chess, type Square, type PieceSymbol, type Color } from 'chess.js';
import { outcome, preservesGoal, type Tablebase } from './trainer.ts';
export type Problem = {fen:string;goal:'win'|'draw';pieces:number};
export function randomPosition(count:number,random:()=>number=Math.random):string {
 if(!Number.isInteger(count)||count<3||count>7)throw new Error('駒数は3〜7です');
 const pick=(n:number)=>Math.floor(random()*n);
 for(let attempt=0;attempt<1000;attempt++){
  const chess=new Chess();chess.clear();const squares=Array.from({length:64},(_,i)=>('abcdefgh'[i%8]+(1+Math.floor(i/8))) as Square);
  const put=(type:PieceSymbol,color:Color)=>{const valid=squares.filter(s=>type!=='p'||(s[1]!=='1'&&s[1]!=='8'));const square=valid[pick(valid.length)];squares.splice(squares.indexOf(square),1);chess.put({type,color},square);};
  put('k','w');put('k','b');
  for(let i=2;i<count;i++)put(['p','p','r','q','b','n'][pick(6)] as PieceSymbol,pick(2)?'w':'b');
  const fen=chess.fen().split(' ');fen[1]=pick(2)?'w':'b';fen[2]='-';fen[3]='-';fen[4]='0';fen[5]='1';
  const candidate=new Chess(fen.join(' '));
  const kings=candidate.board().flat().filter(p=>p?.type==='k');
  if(kings.some(k=>k&&candidate.isAttacked(k.square,k.color==='w'?'b':'w')))continue;
  if(candidate.isGameOver())continue;
  return candidate.fen();
 }
 throw new Error('局面の生成に失敗しました。もう一度お試しください。');
}
export function acceptProblem(fen:string,data:Tablebase,filter:'any'|'win'|'draw'):Problem|null{
 const value=outcome(data.category);if(value===null||value<0||data.moves.length<2)return null;
 const goal=value===1?'win':'draw';if(filter!=='any'&&filter!==goal)return null;
 // Require a real decision: at least one move maintains and one loses the objective.
 if(!data.moves.some(m=>preservesGoal(m,goal))||!data.moves.some(m=>outcome(m.category)!==null&&!preservesGoal(m,goal)))return null;
 if(data.moves.some(m=>m.checkmate))return null;
 return {fen,goal,pieces:new Chess(fen).board().flat().filter(Boolean).length};
}
