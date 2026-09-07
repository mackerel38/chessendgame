'use client';
import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board, { glyphs, names, type Animation } from '../components/Board';
import { cloneGame, applyUci, outcome, preservesGoal, terminal, type Tablebase, type TBMove } from '../lib/trainer';
import { randomPosition, acceptProblem, type Problem } from '../lib/generator';
const EMPTY='8/7k/8/8/8/8/K7/8 w - - 0 1';
const cache=new Map<string,Tablebase>();
const delay=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}const done=()=>{signal.removeEventListener('abort',abort);resolve();};const timer=setTimeout(done,ms);const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};signal.addEventListener('abort',abort,{once:true});});
async function probe(fen:string,signal:AbortSignal){
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 const cached=cache.get(fen);if(cached)return cached;
 const response=await fetch((process.env.NEXT_PUBLIC_TABLEBASE_ENDPOINT||'/api/tablebase')+'?fen='+encodeURIComponent(fen),{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
 if(!response.ok)throw new Error(response.status===429?'照会が混み合っています。少し待って再試行してください。':'テーブルベースに接続できません。再試行してください。');
 const data=await response.json() as Tablebase;
 if(!Array.isArray(data.moves)||outcome(data.category)===null)throw new Error('厳密な評価を取得できませんでした。再試行してください。');
 if(cache.size>=500)cache.delete(cache.keys().next().value!);cache.set(fen,data);return data;
}
type Entry={san:string;player:boolean;quality:string};
export default function Home(){
 const [problem,setProblem]=useState<Problem|null>(null),[fen,setFen]=useState(EMPTY),[count,setCount]=useState(4),[filter,setFilter]=useState<'any'|'win'|'draw'>('any');
 const [phase,setPhase]=useState<'generating'|'ready'|'thinking'|'replay'|'done'|'error'>('generating'),[attempt,setAttempt]=useState(0),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
 const [selected,setSelected]=useState(''),[data,setData]=useState<Tablebase|null>(null),[history,setHistory]=useState<Entry[]>([]),[promotion,setPromotion]=useState<TBMove[]>([]),[hint,setHint]=useState(''),[flipped,setFlipped]=useState(false),[mistakes,setMistakes]=useState(0),[solved,setSolved]=useState(0),[serial,setSerial]=useState(0);
 const [animation,setAnimation]=useState<Animation|null>(null),[replayLine,setReplayLine]=useState<string[]>([]),[replayStatus,setReplayStatus]=useState(''),[paused,setPaused]=useState(false),[speed,setSpeed]=useState(800),[help,setHelp]=useState(false);
 const game=useRef(new Chess(EMPTY)),current=useRef<Problem|null>(null),controller=useRef(new AbortController()),animationId=useRef(0),locked=useRef(true),pauseRef=useRef(false),speedRef=useRef(800),replaying=useRef(false),beforeReplay=useRef<Tablebase|null>(null),failureAction=useRef<'generate'|'sync'>('generate');
 const player=(problem?.fen.split(' ')[1]||'w') as 'w'|'b';const blackBottom=(player==='b')!==flipped;
 function cancel(){controller.current.abort();controller.current=new AbortController();setAnimation(null);setPromotion([]);setSelected('');setHint('');pauseRef.current=false;setPaused(false);replaying.current=false;return controller.current.signal;}
 function report(e:unknown,signal:AbortSignal){if(signal.aborted)return;setError(e instanceof Error?e.message:'接続に失敗しました。');setPhase('error');locked.current=true;}
 function endGame(c:Chess,p:Problem){const end=terminal(c,p.fen.split(' ')[1] as 'w'|'b',p.goal);if(!end)return false;setPhase('done');setFeedback(end.text);setData(null);locked.current=true;if(end.success)setSolved(v=>{const n=v+1;try{localStorage.setItem('endgame-generated-solved',String(n));}catch{}return n;});return true;}
 async function animate(c:Chess,uci:string,signal:AbortSignal){if(signal.aborted)return;const piece=c.get(uci.slice(0,2) as Parameters<Chess['get']>[0]);applyUci(c,uci);setFen(c.fen());setAnimation({id:++animationId.current,from:uci.slice(0,2),to:uci.slice(2,4),piece:piece!.color+piece!.type});await delay(300,signal);if(!signal.aborted)setAnimation(null);}
 async function sync(c:Chess,p:Problem,signal:AbortSignal,known?:Tablebase){
  failureAction.current='sync';locked.current=true;setPhase('thinking');setError('');
  try{if(endGame(c,p))return;let tb=known||await probe(c.fen(),signal);if(signal.aborted)return;
   if(c.turn()!==p.fen.split(' ')[1]){const best=tb.moves[0];if(!best||outcome(best.category)===null)throw new Error('最善応手を確認できません。');await delay(200,signal);await animate(c,best.uci,signal);if(signal.aborted)return;setHistory(h=>[...h,{san:best.san,player:false,quality:'最善応手'}]);if(endGame(c,p))return;tb=await probe(c.fen(),signal);}
   if(signal.aborted)return;setData(tb);setPhase('ready');locked.current=false;
  }catch(e){report(e,signal);}
 }
 async function generate(){
  const signal=cancel();failureAction.current='generate';setFen(game.current.fen());locked.current=true;setPhase('generating');setError('');setFeedback('');setData(null);setReplayLine([]);setAttempt(0);
  try{for(let i=1;i<=60;i++){setAttempt(i);const candidate=randomPosition(count);const tb=await probe(candidate,signal);if(signal.aborted)return;const p=acceptProblem(candidate,tb,filter);if(!p){await delay(200,signal);continue;}
    current.current=p;game.current=new Chess(p.fen);setProblem(p);setFen(p.fen);setHistory([]);setMistakes(0);setFlipped(false);setSerial(n=>n+1);setData(tb);setPhase('ready');locked.current=false;return;
   }throw new Error('条件に合う局面が見つかりませんでした。もう一度生成するか、目標を「どちらでも」にしてください。');
  }catch(e){report(e,signal);}
 }
 useEffect(()=>{try{const n=Number(localStorage.getItem('endgame-generated-solved'));if(Number.isSafeInteger(n)&&n>=0)setSolved(n);}catch{}void generate();return ()=>controller.current.abort();
 // Initial generation only; controls apply when the generate button is pressed.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 function restoreReplay(message='元の局面に戻りました。別の手を試してください。'){
  if(!replaying.current)return;cancel();setFen(game.current.fen());setData(beforeReplay.current);setReplayLine([]);setFeedback(message);setPhase('ready');locked.current=false;
 }
 async function replay(move:TBMove,p:Problem,tb:Tablebase){
  const signal=controller.current.signal;replaying.current=true;beforeReplay.current=tb;locked.current=true;setPhase('replay');setMistakes(v=>v+1);setReplayLine([move.san]);setReplayStatus(`${p.goal==='win'?'勝ち':'引き分け'} → ${outcome(move.category)===1?'負け':'引き分け'}`);setFeedback('誤った手からの最善進行を再生中');
  const c=cloneGame(game.current,p.fen);
  try{await animate(c,move.uci,signal);let plies=0;
   while(!c.isGameOver()&&plies<400){while(pauseRef.current)await delay(100,signal);await delay(speedRef.current,signal);const next=await probe(c.fen(),signal);if(signal.aborted)return;while(pauseRef.current)await delay(100,signal);const best=next.moves[0];if(!best||outcome(best.category)===null)throw new Error('続きの最善手を確認できませんでした。');await animate(c,best.uci,signal);setReplayLine(line=>[...line,best.san]);plies++;}
   const end=terminal(c,player,p.goal);setReplayStatus(end?.text||'400手分で再生を区切りました（終局前）');await delay(1800,signal);if(!signal.aborted)restoreReplay(end?`${end.text} 元の局面に戻りました。`:'長い手順のため再生を区切り、元の局面に戻しました。');
  }catch(e){if(!signal.aborted)restoreReplay(`${e instanceof Error?e.message:'再生を取得できませんでした。'} 元の局面に戻しました。`);}
 }
 async function play(move:TBMove){const p=current.current,tb=data;if(locked.current||!p||!tb)return;if(outcome(move.category)===null){setFeedback('この手の厳密な評価を確認できません。');return;}locked.current=true;setSelected('');setHint('');setPromotion([]);const trial=cloneGame(game.current,p.fen);applyUci(trial,move.uci);const end=terminal(trial,player,p.goal);
  if(!preservesGoal(move,p.goal)||(end&&!end.success)){void replay(move,p,tb);return;}
  const signal=controller.current.signal;setPhase('thinking');setData(null);try{await animate(game.current,move.uci,signal);if(signal.aborted)return;setHistory(h=>[...h,{san:move.san,player:true,quality:'✓'}]);setFeedback(p.goal==='win'?'勝ちを維持':'引き分けを維持');await sync(game.current,p,signal);}catch(e){report(e,signal);}
 }
 function moveFrom(from:string,to:string){if(locked.current)return;const options=data?.moves.filter(m=>m.uci.slice(0,2)===from&&m.uci.slice(2,4)===to)||[];if(options.length>1)setPromotion(options);else if(options[0])void play(options[0]);}
 function clickSquare(s:string){if(locked.current)return;if(s===selected){setSelected('');return;}if(data?.moves.some(m=>m.uci.slice(0,2)===selected&&m.uci.slice(2,4)===s)){moveFrom(selected,s);return;}setSelected(game.current.get(s as Parameters<Chess['get']>[0])?.color===player?s:'');}
 function restart(){const p=current.current;if(!p)return;const signal=cancel();game.current=new Chess(p.fen);setFen(p.fen);setHistory([]);setMistakes(0);setFeedback('');setReplayLine([]);setSerial(n=>n+1);void sync(game.current,p,signal);}
 function retry(){const p=current.current;if(p&&failureAction.current==='sync')void sync(game.current,p,cancel());else void generate();}
 const legal=data?.moves.filter(m=>m.uci.slice(0,2)===selected).map(m=>m.uci.slice(2,4))||[];
 return <main><header><a className="brand" href="./">♟ <span>ENDGAME<span className="brand-light"> / 終盤道場</span></span></a><span className="header-note">最後の数駒から、強くなる。</span><button className="status-pill" onClick={()=>setHelp(true)}>操作ガイド ↗</button></header>
 <div className="workspace"><section className="heading"><div><p className="eyebrow">CHESS ENDGAME TRAINER</p><h1>最後の一手まで、最善を。</h1><p className="muted">3〜7駒のランダム局面。勝ちをつかむ、引き分けを守る。</p></div><span className="lesson-number">{solved}<small> SOLVED</small></span></section>
 <div className="play-layout"><section><div className="player-line"><span className="avatar">♚</span><div><strong>テーブルベース</strong><small>最善応手</small></div><span className="player-color">{player==='w'?'黒':'白'}</span></div>
 <Board key={serial} fen={fen} blackBottom={blackBottom} disabled={phase!=='ready'} selected={selected} legal={phase==='ready'?legal:[]} hint={hint} animation={animation} onSquare={clickSquare} onMove={moveFrom} onSelect={s=>{if(game.current.get(s as Parameters<Chess['get']>[0])?.color===player)setSelected(s);}}/>
 <div className="player-line"><span className="avatar white-avatar">♚</span><div><strong>あなた / {player==='w'?'白':'黒'}</strong><small>{phase==='replay'?'失敗手の最善進行を再生中':phase==='ready'?'駒をドラッグ、またはクリックして移動':phase==='generating'?`局面を生成中 · ${attempt} 局面を照合` :phase==='done'?'練習終了':phase==='error'?'接続待ち':'最善応手を確認中'}</small></div><span className="your-turn">● {phase==='ready'?'YOUR TURN':phase==='replay'?'REPLAY':phase==='done'?'FINISHED':'WAIT'}</span></div>
 <div className="board-tools"><button onClick={restart} disabled={!problem||phase==='generating'}>↶ 最初から</button><button onClick={()=>setFlipped(v=>!v)} disabled={!!animation}>⇅ 盤面を反転</button><span>{history.filter(h=>h.player).length} 手 / ミス {mistakes} 回</span></div>
 <div className={`feedback ${phase==='replay'?'bad':''}`} role="status" aria-live="polite">{error?<><span>{error}</span><button onClick={retry}>再試行</button></>:feedback||'右ドラッグで矢印、右クリックでマーク。左操作で注釈をクリア。'}</div>
 </section><aside><section className="panel"><div className="panel-top"><p className="eyebrow">POSITION GENERATOR</p><span className="tag">{problem?.pieces||count} 駒</span></div><h2>ランダム終盤</h2>
 <div className="generator-controls"><label>駒数（キングを含む）<select value={count} onChange={e=>setCount(Number(e.target.value))}>{[3,4,5,6,7].map(n=><option key={n} value={n}>{n} 駒</option>)}</select></label><label>目標<select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="any">どちらでも</option><option value="win">勝ち</option><option value="draw">引き分け</option></select></label></div>
 <button className="primary" onClick={()=>void generate()}>新しい局面を生成 <span>↻</span></button>{phase==='generating'&&<p className="verified">{attempt} 局面目を照合中 · もう一度押すと生成を再開</p>}
 {problem&&<div className={`objective ${problem.goal==='draw'?'draw-objective':''}`}><span>{problem.goal==='win'?'↗':'='}</span><div><small>現在の目標</small><strong>{problem.goal==='win'?'勝つ':'引き分けを守る'}</strong></div><span className="tag">{problem.goal.toUpperCase()}</span></div>}
 <button className="hint-button" disabled={phase!=='ready'} onClick={()=>{const best=data?.moves.find(m=>problem&&preservesGoal(m,problem.goal));if(best){setHint(best.uci);setSelected(best.uci.slice(0,2));}}}>{hint?`${hint.slice(0,2)} → ${hint.slice(2,4)}${hint[4]?' = '+names[hint[4]]:''}`:'✧ 最善手のヒント'}</button><p className="verified">{problem?'✓ テーブルベースで検証した局面':'局面を検証しています'}</p></section>
 {phase==='replay'&&<section className="panel replay-panel"><p className="eyebrow">MISTAKE REPLAY</p><h2>{replayStatus}</h2><p className="muted">双方が最善手を指した続き · {replayLine.length} ply</p><div className="replay-controls"><button onClick={()=>{pauseRef.current=!pauseRef.current;setPaused(pauseRef.current);}}>{paused?'▶ 再開':'Ⅱ 一時停止'}</button><select aria-label="再生速度" value={speed} onChange={e=>{speedRef.current=Number(e.target.value);setSpeed(Number(e.target.value));}}><option value={1200}>ゆっくり</option><option value={800}>標準</option><option value={300}>速い</option></select></div><p className="replay-san">{replayLine.join('　')}</p><button className="hint-button" onClick={()=>restoreReplay('再生を打ち切り、元の局面に戻りました。')}>再生を終了して戻る ↶</button></section>}
 <section className="panel moves-panel"><div className="panel-top"><p className="eyebrow">棋譜</p><span className="subtle">{history.length} ply</span></div>{history.length?<ol className="move-list">{history.map((h,i)=><li key={i}><span>{i+1}.</span><span>{h.player?'あなた':'相手'}</span><strong>{h.san}</strong><small>{h.quality}</small></li>)}</ol>:<div className="empty-moves">指した手がここに表示されます。</div>}</section>
 <p className="muted">{solved} 局面クリア · この端末に保存</p>{problem&&<details className="fen-details"><summary>局面 FEN</summary><code>{problem.fen}</code></details>}
 </aside></div><footer><span>ENDGAME / 終盤道場</span><a href="https://github.com/lichess-org/lila-tablebase" target="_blank" rel="noreferrer">Lichess · Syzygy tablebases ↗</a></footer></div>
 {promotion.length>0&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="昇格"><h2>昇格する駒を選ぶ</h2><div className="promotion-options">{promotion.map(m=><button key={m.uci} onClick={()=>void play(m)}><span>{glyphs[player+m.uci[4]]}</span>{names[m.uci[4]]}</button>)}</div><button onClick={()=>setPromotion([])} className="hint-button">キャンセル</button></section></div>}
 {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-label="操作ガイド" onClick={e=>e.stopPropagation()}><h2>操作ガイド</h2><ul className="help-list"><li>左ドラッグ／クリック2回：駒を移動</li><li>右ドラッグ：矢印を追加・削除</li><li>右クリック：丸いマークを追加・削除</li><li>左操作／「注釈を消す」：注釈をクリア</li><li>間違えた手：最善進行を再生し、終局後に元へ戻る</li></ul><p className="muted">再生は一時停止・速度変更・打ち切りができます。長い進行は400 plyで区切ります。局面生成と評価にはインターネット接続が必要です。</p><button className="primary" onClick={()=>setHelp(false)}>閉じる</button></section></div>}
 </main>;
}
