import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { cloneGame,outcome,preservesGoal,applyUci,terminal,type TBMove } from '../lib/trainer.ts';
import { exercises } from './fixtures.ts';
const move=(category:string)=>({category,uci:'e6d6',san:'Kd6',dtz:0,checkmate:false}) as TBMove;
test('move evaluations use the opponents perspective',()=>{assert.equal(preservesGoal(move('loss'),'win'),true);assert.equal(preservesGoal(move('win'),'win'),false);assert.equal(preservesGoal(move('draw'),'win'),false);assert.equal(preservesGoal(move('draw'),'draw'),true);assert.equal(preservesGoal(move('win'),'draw'),false);assert.equal(preservesGoal(move('loss'),'draw'),true)});
test('50-move exceptions are drawn; uncertain categories fail closed',()=>{assert.equal(outcome('cursed-win'),0);assert.equal(outcome('blessed-loss'),0);for(const category of ['unknown','maybe-win','maybe-loss','syzygy-win','syzygy-loss']){assert.equal(outcome(category),null);assert.equal(preservesGoal(move(category),'draw'),false)}});
test('all curated exercises are playable legal 3-piece positions',()=>{for(const e of exercises){const c=new Chess(e.fen);assert.equal(c.board().flat().filter(Boolean).length,3);assert.equal(c.isGameOver(),false,e.id);assert.ok(c.moves().length)}});
test('checkmate and stalemate have different training outcomes',()=>{const c=new Chess(exercises[2].fen);applyUci(c,'g1g7');assert.equal(c.isCheckmate(),true);assert.equal(terminal(c,'w','win')?.success,true);assert.equal(terminal(c,'b','draw')?.success,false);const stale=new Chess('k7/P7/1K6/8/8/8/8/8 b - - 0 1');assert.equal(terminal(stale,'b','draw')?.success,true);assert.equal(terminal(stale,'w','win')?.success,false)});
test('promotion handles all four piece choices',()=>{for(const p of ['q','r','b','n']){const c=new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');applyUci(c,'a7a8'+p);assert.equal(c.get('a8')?.type,p)}});
test('repetition history and 50-move draw are respected',()=>{const c=new Chess('7k/8/8/8/8/8/R7/K7 w - - 0 1');for(let i=0;i<2;i++)for(const m of ['a2b2','h8g8','b2a2','g8h8'])applyUci(c,m);assert.equal(c.isThreefoldRepetition(),true);assert.equal(terminal(c,'b','draw')?.success,true);assert.equal(terminal(c,'w','win')?.success,false);const fifty=new Chess('7k/8/8/8/8/8/R7/K7 w - - 100 51');assert.equal(terminal(fifty,'b','draw')?.success,true)});

test('generator returns exact piece counts, safe kings, and valid pawn ranks',async()=>{
 const {randomPosition}=await import('../lib/generator.ts');
 let seed=20260907;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const unique=new Set<string>();
 for(let count=3;count<=7;count++)for(let i=0;i<100;i++){
  const fen=randomPosition(count,random),c=new Chess(fen);unique.add(fen);
  const pieces=c.board().flat().filter(p=>p!==null);assert.equal(pieces.length,count);
  assert.equal(c.isGameOver(),false);assert.equal(c.isCheck(),false);
  for(const p of pieces){if(p.type==='p')assert.ok(p.square[1]!=='1'&&p.square[1]!=='8');if(p.type==='k')assert.equal(c.isAttacked(p.square,p.color==='w'?'b':'w'),false);}
 }
 assert.ok(unique.size>490);
});
test('generated problems exclude losses, trivial decisions, and immediate mates',async()=>{
 const {acceptProblem}=await import('../lib/generator.ts');
 const d={category:'win',moves:[move('loss'),{...move('draw'),uci:'e6d5'},{...move('draw'),uci:'e6f5'}]} as any;
 assert.equal(acceptProblem(exercises[0].fen,d,'win')?.goal,'win');
 assert.equal(acceptProblem(exercises[0].fen,{...d,moves:d.moves.slice(0,2)},'win'),null);
 assert.equal(acceptProblem(exercises[0].fen,d,'draw'),null);
 assert.equal(acceptProblem(exercises[0].fen,{...d,category:'loss'},'any'),null);
 assert.equal(acceptProblem(exercises[0].fen,{...d,moves:[move('loss'),move('loss')]},'any'),null);
 assert.equal(acceptProblem(exercises[0].fen,{...d,moves:[{...move('loss'),checkmate:true},move('draw')]},'any'),null);
});
test('mistake continuation can be played without changing the original history',()=>{
 const original=new Chess(exercises[0].fen);const originalFen=original.fen();
 const replay=cloneGame(original,exercises[0].fen);
 applyUci(replay,'e6d5');applyUci(replay,'e8d7');
 assert.equal(original.fen(),originalFen);assert.equal(original.history().length,0);assert.equal(replay.history().length,2);
});

test('pointer coordinates and annotation positions agree on both board orientations',async()=>{
 const {screenPoint,squareAt}=await import('../lib/board.ts');
 for(const flipped of [false,true])for(let f=0;f<8;f++)for(let r=1;r<=8;r++){
  const square='abcdefgh'[f]+r;const p=screenPoint(square,flipped);
  assert.equal(squareAt(p.x+.5,p.y+.5,flipped),square);
 }
 assert.equal(squareAt(-.01,3,false),'');assert.equal(squareAt(8,3,false),'');
 assert.equal(squareAt(2,8,false),'');assert.equal(squareAt(2,-1,false),'');
});
