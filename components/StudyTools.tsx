import { useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { MAX_IMPORT_LENGTH, readGame, shareUrl, type ImportedGame } from '../lib/study';

type Props = { game: Chess; onImport: (loaded: ImportedGame) => void; disabled: boolean };
export default function StudyTools({ game, onImport, disabled }: Props) {
  const [format, setFormat] = useState<'fen' | 'pgn'>('fen');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const fileTask = useRef(0);
  const messageOf = (e: unknown) => e instanceof Error ? e.message : '入出力に失敗しました。';
  function importText(value: string, kind = format) {
    try { onImport(readGame(value, kind)); setMessage('読み込みました。閲覧モードでは自動応手しません。'); }
    catch (e) { setMessage(messageOf(e)); }
  }
  async function copy(value: string) {
    setText(value);
    try { await navigator.clipboard.writeText(value); setMessage('クリップボードにコピーしました。'); }
    catch { setMessage('コピーできませんでした。下のテキスト欄を選択してコピーしてください。'); }
  }
  function download() {
    const value = format === 'fen' ? game.fen() : game.pgn();
    const url = URL.createObjectURL(new Blob([value], { type: format === 'pgn' ? 'application/x-chess-pgn' : 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = `endgame.${format}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function share(positionOnly: boolean) {
    try { void copy(shareUrl(game, window.location.href, positionOnly)); }
    catch (e) { setMessage(messageOf(e)); }
  }
  return <section className="panel study-panel" aria-label="棋譜・盤面の入出力">
    <p className="eyebrow">IMPORT / EXPORT / SHARE</p><h2>棋譜・盤面の入出力</h2>
    <label>形式 <select value={format} onChange={e => setFormat(e.target.value as 'fen' | 'pgn')}><option value="fen">FEN（盤面）</option><option value="pgn">PGN（棋譜）</option></select></label>
    <textarea aria-label="FEN・PGN・共有URLのテキスト" value={text} maxLength={MAX_IMPORT_LENGTH} spellCheck={false} onChange={e => { fileTask.current++; setText(e.target.value); }} placeholder={format === 'fen' ? 'FENを貼り付け' : 'PGNを貼り付け'} />
    <div className="study-actions">
      <button disabled={disabled || !text.trim()} onClick={() => importText(text)}>読み込む</button>
      <button disabled={disabled} onClick={() => void copy(format === 'fen' ? game.fen() : game.pgn())}>現在の{format.toUpperCase()}をコピー</button>
      <button disabled={disabled} onClick={download}>{format.toUpperCase()}を保存</button>
    </div>
    <label className="study-file">ファイルを選ぶ <input type="file" accept=".fen,.pgn,.txt,text/plain,application/x-chess-pgn" disabled={disabled} onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      const id = ++fileTask.current;
      if (file.size > MAX_IMPORT_LENGTH) { setMessage('ファイルが大きすぎます（最大100 KB）。'); return; }
      try {
        const value = await file.text(); if (fileTask.current !== id) return;
        const kind = file.name.toLowerCase().endsWith('.pgn') ? 'pgn' : file.name.toLowerCase().endsWith('.fen') ? 'fen' : format;
        setFormat(kind); setText(value); setMessage('内容を確認して「読み込む」を押してください。');
      } catch (error) { if (fileTask.current === id) setMessage(messageOf(error)); }
    }} /></label>
    <div className="study-actions"><button disabled={disabled} onClick={() => share(false)}>棋譜のURLをコピー</button><button disabled={disabled} onClick={() => share(true)}>現在盤面のURL</button></div>
    <p className="muted">FENは現在盤面のみ。PGN／棋譜URLは開始局面と着手履歴を保持します。URLにPGNのコメントや対局者名は含めません。</p>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
