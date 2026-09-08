'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board, { names, type Animation, type MoveMark } from '../components/Board';
import Piece, { getPieceSet, setPieceSet } from '../components/Piece';
import { PIECE_SETS, type PieceSet } from '../lib/pieces';
import StudyTools from '../components/StudyTools';
import { cloneGame, applyUci, outcome, preservesGoal, terminal, type Tablebase, type TBMove } from '../lib/trainer';
import { randomPosition, acceptProblem, type Problem } from '../lib/generator';
import { readSharedGame, repetitionRestart, undoTurn, type ImportedGame } from '../lib/study';
import { analyzeTactics } from '../lib/tactics';
import './study.css';

const EMPTY = '8/7k/8/8/8/8/K7/8 w - - 0 1';
const cache = new Map<string, Tablebase>();
const delay = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
  const done = () => { signal.removeEventListener('abort', abort); resolve(); };
  const timer = setTimeout(done, ms);
  const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
  signal.addEventListener('abort', abort, { once: true });
});
async function probe(fen: string, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const cached = cache.get(fen); if (cached) return cached;
  const response = await fetch((process.env.NEXT_PUBLIC_TABLEBASE_ENDPOINT || '/api/tablebase') + '?fen=' + encodeURIComponent(fen), { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
  if (!response.ok) throw new Error(response.status === 429 ? '照会が混み合っています。少し待って再試行してください。' : 'テーブルベースに接続できません。再試行してください。');
  const data = await response.json() as Tablebase;
  if (!Array.isArray(data.moves) || outcome(data.category) === null) throw new Error('厳密な評価を取得できませんでした。再試行してください。');
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(fen, data); return data;
}
type Entry = { san: string; player: boolean; quality: string; color?: 'w' | 'b' };
type PreparedProblem = { problem: Problem; data: Tablebase; count: number; filter: 'any' | 'win' | 'draw' };
export default function Home() {
  const [problem, setProblem] = useState<Problem | null>(null), [fen, setFen] = useState(EMPTY), [count, setCount] = useState(4), [filter, setFilter] = useState<'any' | 'win' | 'draw'>('any');
  const [phase, setPhase] = useState<'generating' | 'ready' | 'thinking' | 'replay' | 'done' | 'error' | 'review'>('generating'), [attempt, setAttempt] = useState(0), [error, setError] = useState(''), [feedback, setFeedback] = useState('');
  const [selected, setSelected] = useState(''), [data, setData] = useState<Tablebase | null>(null), [history, setHistory] = useState<Entry[]>([]), [promotion, setPromotion] = useState<TBMove[]>([]), [hint, setHint] = useState(''), [flipped, setFlipped] = useState(false), [mistakes, setMistakes] = useState(0), [solved, setSolved] = useState(0), [serial, setSerial] = useState(0);
  const [animation, setAnimation] = useState<Animation | null>(null), [replayLine, setReplayLine] = useState<string[]>([]), [replayStatus, setReplayStatus] = useState(''), [replayMode, setReplayMode] = useState<'mistake' | 'answer'>('mistake'), [paused, setPaused] = useState(false), [speed, setSpeed] = useState(800), [help, setHelp] = useState(false);
  const [previousFen, setPreviousFen] = useState(''), [showTactics, setShowTactics] = useState(true);
  const [moveMark, setMoveMark] = useState<MoveMark | null>(null);
  const [pieceSet, setCurrentPieceSet] = useState<PieceSet>('cburnett');
  const [autoNext, setAutoNext] = useState(false), [autoNextReady, setAutoNextReady] = useState(false);
  const game = useRef(new Chess(EMPTY)), current = useRef<Problem | null>(null), controller = useRef(new AbortController()), animationId = useRef(0), locked = useRef(true), pauseRef = useRef(false), speedRef = useRef(800), replaying = useRef(false), beforeReplay = useRef<Tablebase | null>(null), failureAction = useRef<'generate' | 'sync'>('generate'), redoStack = useRef<string[][]>([]);
  const initial = useRef(EMPTY), reviewing = useRef(false), credited = useRef(false), prepared = useRef<PreparedProblem | null>(null), preparing = useRef<AbortController | null>(null);
  const player = (problem?.fen.split(' ')[1] || initial.current.split(' ')[1]) as 'w' | 'b';
  const blackBottom = (player === 'b') !== flipped;
  const tactics = useMemo(() => showTactics ? analyzeTactics(fen, previousFen || undefined) : null, [fen, previousFen, showTactics]);
  function cancel() {
    controller.current.abort(); controller.current = new AbortController();
    setAnimation(null); setPromotion([]); setSelected(''); setHint(''); setMoveMark(null); pauseRef.current = false; setPaused(false); replaying.current = false;
    return controller.current.signal;
  }
  function report(e: unknown, signal: AbortSignal) {
    if (signal.aborted) return;
    setError(e instanceof Error ? e.message : '接続に失敗しました。'); setPhase('error'); locked.current = true;
  }
  function updateHistory(c: Chess, quality = '') {
    const side = initial.current.split(' ')[1];
    setHistory(c.history({ verbose: true }).map(m => ({ san: m.san, player: m.color === side, color: m.color, quality })));
    setPreviousFen(c.history({ verbose: true }).at(-1)?.before || '');
  }
  function loadStudy(loaded: ImportedGame) {
    cancel(); locked.current = true; current.current = null; reviewing.current = true; credited.current = false;
    initial.current = loaded.initialFen; game.current = loaded.game;
    setProblem(null); setFen(loaded.game.fen()); updateHistory(loaded.game, '読込');
    setData(null); setError(''); setFeedback('閲覧モードです。巻き戻しで棋譜を戻せます。「この盤面を練習」で現在局面から開始します。');
    setMistakes(0); setReplayLine([]); setFlipped(false); setSerial(n => n + 1); setPhase('review');
  }
  async function trainPosition() {
    const candidate = game.current.fen(), pieces = game.current.board().flat().filter(Boolean).length;
    if (pieces < 3 || pieces > 7 || candidate.split(' ')[2] !== '-' || game.current.isGameOver()) {
      setFeedback('練習できるのは、キャスリング権のない未終局の3〜7駒の局面です。閲覧・入出力はそのまま利用できます。'); return;
    }
    const signal = cancel(); locked.current = true; setPhase('thinking'); setError('');
    try {
      const tb = await probe(candidate, signal); if (signal.aborted) return;
      const value = outcome(tb.category);
      if (value === null || value < 0 || !tb.moves.length) {
        setFeedback('この局面は手番側の勝ち／引き分けを守る練習の対象外です。閲覧モードを続けます。'); setPhase('review'); return;
      }
      const p: Problem = { fen: candidate, goal: value === 1 ? 'win' : 'draw', pieces };
      initial.current = candidate; current.current = p; game.current = new Chess(candidate); reviewing.current = false; credited.current = false;
      setProblem(p); setFen(candidate); setPreviousFen(''); setHistory([]); setMistakes(0); setFeedback('読み込んだ盤面から練習を開始しました。');
      setData(tb); setSerial(n => n + 1); setPhase('ready'); locked.current = false;
    } catch (e) {
      if (!signal.aborted) { setFeedback(e instanceof Error ? e.message : '局面を評価できませんでした。'); setPhase('review'); }
    }
  }
  function endGame(c: Chess, p: Problem) {
    if (repetitionRestart(c, p.fen)) { restart('同一局面が3回現れたため。'); return true; }
    const end = terminal(c, p.fen.split(' ')[1] as 'w' | 'b', p.goal); if (!end) return false;
    setPhase('done'); setFeedback(end.text); setData(null); locked.current = true; if (end.success) setAutoNextReady(true);
    if (end.success && !credited.current) {
      credited.current = true;
      setSolved(v => { const n = v + 1; try { localStorage.setItem('endgame-generated-solved', String(n)); } catch {} return n; });
    }
    return true;
  }
  function moveInstantly(c: Chess, uci: string, signal: AbortSignal) {
    if (signal.aborted) return;
    setPreviousFen(c.fen()); applyUci(c, uci); setAnimation(null); setFen(c.fen());
  }
  async function animate(c: Chess, uci: string, signal: AbortSignal) {
    if (signal.aborted) return;
    const piece = c.get(uci.slice(0, 2) as Parameters<Chess['get']>[0]);
    setPreviousFen(c.fen()); applyUci(c, uci); setFen(c.fen());
    setAnimation({ id: ++animationId.current, from: uci.slice(0, 2), to: uci.slice(2, 4), piece: piece!.color + piece!.type });
    await delay(300, signal); if (!signal.aborted) setAnimation(null);
  }
  async function sync(c: Chess, p: Problem, signal: AbortSignal, known?: Tablebase) {
    if (signal.aborted) return;
    failureAction.current = 'sync'; locked.current = true; setPhase('thinking'); setError('');
    try {
      if (endGame(c, p)) return;
      let tb = known || await probe(c.fen(), signal); if (signal.aborted) return;
      if (c.turn() !== p.fen.split(' ')[1]) {
        const replyColor = c.turn(), best = tb.moves[0]; if (!best || outcome(best.category) === null) throw new Error('最善応手を確認できません。');
        moveInstantly(c, best.uci, signal); if (signal.aborted) return;
        setHistory(h => [...h, { san: best.san, player: false, color: replyColor, quality: '' }]);
        if (endGame(c, p)) return;
        tb = await probe(c.fen(), signal);
      }
      if (signal.aborted) return;
      setData(tb); setPhase('ready'); locked.current = false;
    } catch (e) { report(e, signal); }
  }
  async function prepareNext() {
    if (preparing.current || prepared.current) return;
    const task = new AbortController(); preparing.current = task;
    try {
      for (let i = 0; i < 60; i++) {
        const candidate = randomPosition(count), tb = await probe(candidate, task.signal);
        if (task.signal.aborted) return;
        const next = acceptProblem(candidate, tb, filter);
        if (next) { prepared.current = { problem: next, data: tb, count, filter }; return; }
      }
    } catch { /* Background preparation is optional and must not disturb the current exercise. */ }
    finally { preparing.current = null; }
  }
  async function generate() {
    const signal = cancel(); failureAction.current = 'generate'; setAutoNextReady(false); setFen(game.current.fen()); locked.current = true;
    setPhase('generating'); setError(''); setFeedback(''); setData(null); setReplayLine([]); setAttempt(0);
    try {
      const ready = prepared.current;
      if (ready && ready.count === count && ready.filter === filter) {
        prepared.current = null;
        current.current = ready.problem; initial.current = ready.problem.fen; game.current = new Chess(ready.problem.fen); reviewing.current = false; credited.current = false; redoStack.current = [];
        setProblem(ready.problem); setFen(ready.problem.fen); setPreviousFen(''); setHistory([]); setMistakes(0); setFlipped(false); setSerial(n => n + 1); setData(ready.data); setPhase('ready'); locked.current = false; return;
      }
      for (let i = 1; i <= 60; i++) {
        setAttempt(i); const candidate = randomPosition(count); const tb = await probe(candidate, signal); if (signal.aborted) return;
        const p = acceptProblem(candidate, tb, filter); if (!p) { await delay(200, signal); continue; }
    current.current = p; initial.current = p.fen; game.current = new Chess(p.fen); reviewing.current = false; credited.current = false; redoStack.current = [];
        setProblem(p); setFen(p.fen); setPreviousFen(''); setHistory([]); setMistakes(0); setFlipped(false); setSerial(n => n + 1);
        setData(tb); setPhase('ready'); locked.current = false; return;
      }
      throw new Error('条件に合う局面が見つかりませんでした。もう一度生成するか、目標を「どちらでも」にしてください。');
    } catch (e) { report(e, signal); }
  }
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem('endgame-generated-solved')); if (Number.isSafeInteger(n) && n >= 0) setSolved(n);
      setShowTactics(localStorage.getItem('endgame-show-tactics') !== 'false');
      setCurrentPieceSet(getPieceSet());
      setAutoNext(localStorage.getItem('endgame-auto-next') === 'true');
    } catch {}
    const readUrl = () => {
      try { const shared = readSharedGame(window.location.href); if (shared) { loadStudy(shared); return true; } }
      catch (e) { report(e, cancel()); return true; }
      return false;
    };
    if (!readUrl()) void generate();
    window.addEventListener('hashchange', readUrl);
    return () => { controller.current.abort(); window.removeEventListener('hashchange', readUrl); };
    // Initial generation only; controls apply when the generate button is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (phase === 'ready' && problem) void prepareNext();
    return () => { preparing.current?.abort(); preparing.current = null; };
  }, [phase, problem?.fen, count, filter]);
  useEffect(() => {
    if (phase !== 'done' || !autoNext || !autoNextReady) return;
    const timer = window.setTimeout(() => { setAutoNextReady(false); void generate(); }, 3000);
    return () => window.clearTimeout(timer);
  }, [phase, autoNext, autoNextReady]);
  function restoreReplay(message = '元の局面に戻りました。別の手を試してください。') {
    if (!replaying.current) return;
    cancel(); setFen(game.current.fen()); setPreviousFen(game.current.history({ verbose: true }).at(-1)?.before || '');
    setData(beforeReplay.current); setReplayLine([]); setFeedback(message); setPhase('ready'); locked.current = false;
  }
  async function replay(move: TBMove, p: Problem, tb: Tablebase, answer = false) {
    const signal = controller.current.signal; replaying.current = true; beforeReplay.current = tb; locked.current = true;
    setPhase('replay'); setReplayMode(answer ? 'answer' : 'mistake'); setSelected(''); setHint(''); setPromotion([]);
    if (!answer) setMistakes(v => v + 1);
    setReplayLine([move.san]); setReplayStatus(answer ? '答え：終局までの最善進行' : `${p.goal === 'win' ? '勝ち' : '引き分け'} → ${outcome(move.category) === 1 ? '負け' : '引き分け'}`);
    setFeedback(answer ? '答えをアニメーション再生中' : '誤った手からの最善進行を再生中');
    const c = cloneGame(game.current, p.fen);
    try {
      await animate(c, move.uci, signal); let plies = 0;
      while (!c.isGameOver() && (answer || plies < 400)) {
        while (pauseRef.current) await delay(100, signal);
        await delay(speedRef.current, signal); const next = await probe(c.fen(), signal); if (signal.aborted) return;
        while (pauseRef.current) await delay(100, signal);
        const best = next.moves[0]; if (!best || outcome(best.category) === null) throw new Error('続きの最善手を確認できませんでした。');
        await animate(c, best.uci, signal); setReplayLine(line => [...line, best.san]); plies++;
      }
      if (signal.aborted) return;
      if (repetitionRestart(c, p.fen)) { restart('同一局面が3回現れたため。'); return; }
      const end = terminal(c, player, p.goal);
      if (answer && end) {
        replaying.current = false; game.current = c; updateHistory(c, '解答'); setPhase('done'); setData(null);
        setFeedback('解答の再生が終了しました。' + end.text); return;
      }
      setReplayStatus(end?.text || '400手分で再生を区切りました（終局前）'); await delay(1800, signal);
      if (!signal.aborted) restoreReplay(end ? `${end.text} 元の局面に戻りました。` : '長い手順のため再生を区切り、元の局面に戻しました。');
    } catch (e) {
      if (!signal.aborted) restoreReplay(`${e instanceof Error ? e.message : '再生を取得できませんでした。'} 元の局面に戻しました。`);
    }
  }
  async function play(move: TBMove) {
    const p = current.current, tb = data; if (locked.current || !p || !tb) return;
    if (outcome(move.category) === null) { setFeedback('この手の厳密な評価を確認できません。'); return; }
    locked.current = true; setSelected(''); setHint(''); setPromotion([]);
    const trial = cloneGame(game.current, p.fen); applyUci(trial, move.uci);
    // Repetition is marked as a dubious move, then reset after a short pause.
    if (repetitionRestart(trial, p.fen)) {
      const signal = controller.current.signal;
      setMoveMark({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), kind: '?' });
      setFeedback('同一局面が3回現れたため。'); setPhase('thinking');
      try { await delay(3000, signal); if (!signal.aborted) restart('同一局面が3回現れたため。'); }
      catch (e) { if (!signal.aborted) report(e, signal); }
      return;
    }
    const end = terminal(trial, player, p.goal);
    if (!preservesGoal(move, p.goal) || (end && !end.success)) {
      const kind: MoveMark['kind'] = outcome(move.category) === 0 ? '?' : '??';
      setMoveMark({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), kind });
      void replay(move, p, tb); return;
    }
    redoStack.current = []; setMoveMark(null);
    const signal = controller.current.signal; setPhase('thinking'); setData(null);
    try {
      moveInstantly(game.current, move.uci, signal); if (signal.aborted) return;
      setHistory(h => [...h, { san: move.san, player: true, color: player, quality: '' }]); setFeedback('');
      await sync(game.current, p, signal);
    } catch (e) { report(e, signal); }
  }
  function moveFrom(from: string, to: string) {
    if (locked.current) return;
    const options = data?.moves.filter(m => m.uci.slice(0, 2) === from && m.uci.slice(2, 4) === to) || [];
    if (options.length > 1) setPromotion(options); else if (options[0]) void play(options[0]);
  }
  function clickSquare(s: string) {
    if (locked.current) return;
    if (s === selected) { setSelected(''); return; }
    if (data?.moves.some(m => m.uci.slice(0, 2) === selected && m.uci.slice(2, 4) === s)) { moveFrom(selected, s); return; }
    setSelected(game.current.get(s as Parameters<Chess['get']>[0])?.color === player ? s : '');
  }
  function jumpToPly(ply: number) {
    if (!ply || ply > history.length) return;
    try {
      const c = new Chess(initial.current);
      history.slice(0, ply).forEach(entry => c.move(entry.san));
      cancel(); game.current = c; current.current = null; reviewing.current = true; setProblem(null); setFen(c.fen()); setPreviousFen(c.history({ verbose: true }).at(-1)?.before || ''); setData(null); setFeedback(''); setPhase('review'); locked.current = true;
    } catch { setFeedback('この手の盤面を表示できませんでした。'); }
  }
  function restart(message = '') {
    const p = current.current; if (!p && !reviewing.current) return;
    const signal = cancel(); game.current = new Chess(initial.current); redoStack.current = []; setAutoNextReady(false); setFen(initial.current); setPreviousFen('');
    setHistory([]); setMistakes(0); setFeedback(message); setError(''); setReplayLine([]); setData(null); setSerial(n => n + 1);
    if (p) void sync(game.current, p, signal); else { setPhase('review'); locked.current = true; }
  }
  function rewind() {
    if (replaying.current) { restoreReplay('再生を取り消し、再生前の局面に戻りました。'); return; }
    if (!game.current.history().length) return;
    const signal = cancel(), p = current.current;
    const before = game.current.history({ verbose: true });
    undoTurn(game.current, player, !p);
    const afterLength = game.current.history().length;
    const removed = before.slice(afterLength).map(m => m.from + m.to + (m.promotion ?? ''));
    if (removed.length) redoStack.current.push(removed);
    setFen(game.current.fen()); setMoveMark(null);
    const length = game.current.history().length; setHistory(h => h.slice(0, length));
    setPreviousFen(game.current.history({ verbose: true }).at(-1)?.before || '');
    setData(null); setError(''); setReplayLine([]); setSerial(n => n + 1);
    setFeedback(p ? '直前のあなたの手番まで巻き戻しました。' : '棋譜を1 ply巻き戻しました。');
    if (p) void sync(game.current, p, signal); else { setPhase('review'); locked.current = true; }
  }
  function advance() {
    if (locked.current || !redoStack.current.length) return;
    const moves = redoStack.current.pop()!;
    try {
      for (const uci of moves) applyUci(game.current, uci);
      setFen(game.current.fen()); updateHistory(game.current, '復元'); setMoveMark(null);
      setFeedback('先に戻した手を進めました。');
      const p = current.current;
      if (p) { const signal = cancel(); void sync(game.current, p, signal); } else setPhase('review');
    } catch { redoStack.current.push(moves); setFeedback('この手順を進められませんでした。'); }
  }
  function retry() { const p = current.current; if (p && failureAction.current === 'sync') void sync(game.current, p, cancel()); else void generate(); }
  const legal = data?.moves.filter(m => m.uci.slice(0, 2) === selected).map(m => m.uci.slice(2, 4)) || [];
  const notationRows = Array.from({ length: Math.ceil(history.length / 2) }, (_, row) => {
    const entries = history.slice(row * 2, row * 2 + 2);
    const white = entries.find(entry => entry.color === 'w' || (entry.color === undefined && entry.player === (player === 'w')));
    const black = entries.find(entry => entry.color === 'b' || (entry.color === undefined && entry.player === (player === 'b')));
    return { number: row + 1, white, black };
  });
  return <main><header><a className="brand" href="./"><Piece code="bp" /><span>ENDGAME<span className="brand-light"> / 終盤道場</span></span></a><span className="header-note">最後の数駒から、強くなる。</span><button className="status-pill" onClick={() => setHelp(true)}>操作ガイド ↗</button></header>
    <div className="workspace"><section className="heading"><div><p className="eyebrow">CHESS ENDGAME TRAINER</p></div><span className="lesson-number">{solved}<small> SOLVED</small></span></section>
      <div className="play-layout"><section><div className="player-line"><span className="avatar"><Piece code={player === 'w' ? 'bk' : 'wk'} /></span><div><strong>テーブルベース / {player === 'w' ? '黒' : '白'}</strong>{phase === 'thinking' && <small>思考中...</small>}</div></div>
        <Board key={serial} fen={fen} blackBottom={blackBottom} disabled={phase !== 'ready'} selected={selected} legal={phase === 'ready' ? legal : []} hint={hint} animation={animation} tactics={tactics} moveMark={moveMark} onSquare={clickSquare} onMove={moveFrom} onSelect={s => { if (game.current.get(s as Parameters<Chess['get']>[0])?.color === player) setSelected(s); }} />
        <div className="player-line"><span className="avatar white-avatar"><Piece code={player + 'k'} /></span><div><strong>あなた / {player === 'w' ? '白' : '黒'}</strong><small>{phase === 'review' ? '棋譜・盤面を閲覧中（自動応手なし）' : phase === 'replay' ? (replayMode === 'answer' ? '答えの最善進行を再生中' : '失敗手の最善進行を再生中') : phase === 'ready' ? (problem?.goal === 'draw' ? '引き分けを目指してください' : '勝ちを目指してください') : phase === 'generating' ? `局面を生成中 · ${attempt} 局面を照合` : phase === 'done' ? '練習終了' : phase === 'error' ? '接続待ち' : ''}</small></div><span className="your-turn">● {phase === 'ready' ? 'YOUR TURN' : phase === 'replay' ? 'REPLAY' : phase === 'review' ? 'REVIEW' : phase === 'done' ? 'FINISHED' : 'WAIT'}</span></div>
        <div className="board-tools"><button onClick={() => restart()} disabled={phase === 'generating' || (!problem && !reviewing.current)}>↶ 最初から</button><button onClick={rewind} disabled={phase === 'generating' || (!history.length && phase !== 'replay')}>← 戻る</button><button onClick={advance} disabled={phase === 'generating' || !redoStack.current.length}>進む →</button><button onClick={() => setFlipped(v => !v)} disabled={!!animation}>⇅ 盤面を反転</button><span>{history.filter(h => h.player).length} 手 / ミス {mistakes} 回</span></div>
        {error || feedback ? <div className={`feedback ${phase === 'replay' ? 'bad' : ''}`} role="status" aria-live="polite">{error ? <><span>{error}</span><button onClick={retry}>再試行</button></> : feedback}</div> : null}
      </section><aside><section className="panel"><div className="panel-top"><p className="eyebrow">OPTION</p></div>
          <div className="generator-controls"><label>駒数（キングを含む）<select value={count} onChange={e => setCount(Number(e.target.value))}>{[3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} 駒</option>)}</select></label><label>目標<select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="any">どちらでも</option><option value="win">勝ち</option><option value="draw">引き分け</option></select></label></div>
          <button className="primary" onClick={() => void generate()}>新しい局面を生成 <span>↻</span></button>{phase === 'generating' && <p className="verified">{attempt} 局面目を照合中 · もう一度押すと生成を再開</p>}
          <div className="auto-next-setting"><label><input type="checkbox" checked={autoNext} onChange={e => { const enabled = e.target.checked; setAutoNext(enabled); try { localStorage.setItem('endgame-auto-next', String(enabled)); } catch {} }} /> 自動で次の問題に進む</label></div>
          <div className="tactic-settings"><label><input type="checkbox" checked={showTactics} onChange={e => { setShowTactics(e.target.checked); try { localStorage.setItem('endgame-show-tactics', String(e.target.checked)); } catch {} }} />戦術の自動矢印を表示</label>{showTactics && tactics?.labels.length ? <p className="tactic-description" role="status">{tactics.labels.join(' / ')}</p> : null}<div className="piece-settings"><label>駒<select value={pieceSet} onChange={e => { const next = e.target.value as PieceSet; setCurrentPieceSet(next); setPieceSet(next); }}>{PIECE_SETS.map(option => <option key={option.id} value={option.id}>{option.label} · {option.source}</option>)}</select></label></div></div>
          {phase === 'review' && <button className="hint-button" onClick={() => void trainPosition()}>この盤面を練習（3〜7駒）</button>}
          {problem && <div className={`objective ${problem.goal === 'draw' ? 'draw-objective' : ''}`}><span>{problem.goal === 'win' ? '↗' : '='}</span><div><small>現在の目標</small><strong>{problem.goal === 'win' ? '勝つ' : '引き分けを守る'}</strong></div><span className="tag">{problem.goal.toUpperCase()}</span></div>}
          <button className="hint-button" disabled={phase !== 'ready'} onClick={() => { const best = data?.moves.find(m => problem && preservesGoal(m, problem.goal)); if (best) { setHint(best.uci); setSelected(best.uci.slice(0, 2)); } }}>{hint ? `${hint.slice(0, 2)} → ${hint.slice(2, 4)}${hint[4] ? ' = ' + names[hint[4]] : ''}` : '✧ 最善手のヒント'}</button><button className="hint-button" disabled={phase !== 'ready'} onClick={() => { const best = data?.moves.find(m => problem && preservesGoal(m, problem.goal)); if (best && problem && data && !locked.current) void replay(best, problem, data, true); }}>▶ 答えを最後まで再生</button>{!problem && <p className="verified">{reviewing.current ? '閲覧モード：評価は未取得' : '局面を検証しています'}</p>}</section>
        {phase === 'replay' && <section className="panel replay-panel"><p className="eyebrow">{replayMode === 'answer' ? 'ANSWER REPLAY' : 'MISTAKE REPLAY'}</p><h2>{replayStatus}</h2><p className="muted">双方が最善手を指した続き · {replayLine.length} ply</p><div className="replay-controls"><button onClick={() => { pauseRef.current = !pauseRef.current; setPaused(pauseRef.current); }}>{paused ? '▶ 再開' : 'Ⅱ 一時停止'}</button><select aria-label="再生速度" value={speed} onChange={e => { speedRef.current = Number(e.target.value); setSpeed(Number(e.target.value)); }}><option value={1200}>ゆっくり</option><option value={800}>標準</option><option value={300}>速い</option></select></div><p className="replay-san">{replayLine.join('　')}</p><button className="hint-button" onClick={() => restoreReplay('再生を打ち切り、元の局面に戻りました。')}>再生を終了して戻る ↶</button></section>}
        <section className="panel moves-panel"><div className="panel-top"><p className="eyebrow">棋譜</p><span className="subtle">{history.length} ply</span></div>{history.length ? <><div className="move-head"><span></span><span>白</span><span>黒</span></div><ol className="move-list">{notationRows.map(row => <li key={row.number}><span className="move-number">{row.number}.</span>{row.white ? <button className="move-cell" onClick={() => jumpToPly(history.indexOf(row.white!) + 1)}>{row.white.san}</button> : <span className="move-cell" />}{row.black ? <button className="move-cell" onClick={() => jumpToPly(history.indexOf(row.black!) + 1)}>{row.black.san}</button> : <span className="move-cell" />}</li>)}</ol></> : null}</section>
        <StudyTools game={game.current} onImport={loadStudy} disabled={phase === 'replay'} />
        <p className="muted">{solved} 局面クリア · この端末に保存</p><details className="fen-details"><summary>現在の局面 FEN</summary><code>{fen}</code></details>
      </aside></div><footer><span>ENDGAME / 終盤道場</span><a href="https://github.com/lichess-org/lila-tablebase" target="_blank" rel="noreferrer">Lichess · Syzygy tablebases ↗</a></footer></div>
    {promotion.length > 0 && <div className="modal-backdrop promotion-backdrop" onClick={() => setPromotion([])}><section className="promotion-picker" role="dialog" aria-modal="true" aria-label="昇格する駒を選ぶ" onClick={e => e.stopPropagation()}><div className="promotion-options">{promotion.map(m => <button key={m.uci} aria-label={names[m.uci[4]]} onClick={() => void play(m)}><span><Piece code={player + m.uci[4]} /></span></button>)}</div></section></div>}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-label="操作ガイド" onClick={e => e.stopPropagation()}><h2>操作ガイド</h2><ul className="help-list"><li>左ドラッグ／クリック2回：駒を移動</li><li>答え：現在の局面から終局まで最善進行を再生</li><li>右ドラッグ／右クリック：手動の矢印／マーク</li><li>戦術の自動矢印：独立してON/OFF可能。設定は端末に保存</li><li>巻き戻す：練習中は前の自分の手番、閲覧中は1 ply戻す。再生中は再生を取り消す</li><li>三回同一局面：同じ問題の最初へ戻る（クリア数には加算しない）</li><li>FEN／PGNを読み込むと閲覧モード。「この盤面を練習」で現在局面を新しい開始局面にする</li><li>棋譜URLは着手履歴付き、盤面URLは現在のFENのみ。PGNファイルではコメントも保存</li></ul><p className="muted">失敗手の再生は400 plyで区切り、答えは終局まで再生します。局面生成と評価にはインターネット接続が必要です。入出力と戦術の表示は端末内で処理します。</p><button className="primary" onClick={() => setHelp(false)}>閉じる</button></section></div>}
  </main>;
}
