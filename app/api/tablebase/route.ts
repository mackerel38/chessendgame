import { Chess } from 'chess.js';
import { NextRequest, NextResponse } from 'next/server';
import type { Tablebase } from '../../../lib/trainer';
const cache=new Map<string,Tablebase>();
export async function GET(request:NextRequest){
 const fen=request.nextUrl.searchParams.get('fen');
 if(!fen||fen.length>120)return NextResponse.json({error:'局面の形式が正しくありません。'},{status:400});
 try{const chess=new Chess(fen);const pieces=chess.board().flat().filter(Boolean);if(pieces.length>7||fen.split(' ')[2]!=='-')throw new Error('unsupported');}catch{return NextResponse.json({error:'キャスリング権のない7駒以下の局面を指定してください。'},{status:400})}
 if(cache.has(fen))return NextResponse.json(cache.get(fen));
 try{
 const response=await fetch('https://tablebase.lichess.ovh/standard?fen='+encodeURIComponent(fen),{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Tablebase unavailable');
 const data=await response.json() as Tablebase;
 if(!Array.isArray(data.moves)||typeof data.category!=='string')throw new Error('Invalid response');
 if(cache.size>=500)cache.delete(cache.keys().next().value!);cache.set(fen,data);
 return NextResponse.json(data);
 }catch{return NextResponse.json({error:'テーブルベースに接続できませんでした。少し待ってから「再接続」を押してください。'},{status:503})}
}
