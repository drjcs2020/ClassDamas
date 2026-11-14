import test from 'node:test';
import assert from 'node:assert/strict';
import {initialBoard, legalMoves, applyMove, LocalMatch, boardSignature} from '../regras.js';
const empty=()=>Array.from({length:8},()=>Array(8).fill(null));
const white=(king=false)=>({side:'white',king});
const black=(king=false)=>({side:'black',king});

test('tabuleiro inicial: 12 brancas e 12 pretas e início pelas brancas',()=>{
 const b=initialBoard(),pieces=b.flat().filter(Boolean);
 assert.equal(pieces.filter(p=>p.side==='white').length,12);
 assert.equal(pieces.filter(p=>p.side==='black').length,12);
 assert.equal(legalMoves(b,'white').length,7);
 const g=new LocalMatch();assert.equal(g.turn,'white');
});
test('peça comum anda só para frente, mas captura para trás',()=>{
 const b=empty();b[3][2]=white();
 assert.deepEqual(legalMoves(b,'white').map(m=>m.to).sort((a,b)=>a.c-b.c),[{r:2,c:1},{r:2,c:3}]);
 b[4][3]=black();
 assert.equal(legalMoves(b,'white').length,1);
 assert.deepEqual(legalMoves(b,'white')[0].to,{r:5,c:4});
});
test('lei da maioria obriga capturar mais peças',()=>{
 const b=empty();b[5][2]=white();b[5][6]=white();
 b[4][3]=black();b[2][5]=black();b[4][7]=black();
 const moves=legalMoves(b,'white');
 assert.ok(moves.length>0);assert.ok(moves.every(m=>m.captures.length===2));
 assert.ok(moves.every(m=>m.from.c===2));
 const next=applyMove(b,'white',moves[0]);
 assert.equal(next.flat().filter(p=>p?.side==='black').length,1);
});
test('dama desliza e pode capturar à distância com múltiplos pousos',()=>{
 const b=empty();b[5][0]=white(true);
 const quiet=legalMoves(b,'white');assert.ok(quiet.length>4);
 b[3][2]=black();
 const moves=legalMoves(b,'white');
 assert.ok(moves.length>=2);
 assert.ok(moves.every(m=>m.captures.length===1));
 assert.ok(moves.some(m=>m.to.r===2&&m.to.c===3));
 assert.ok(moves.some(m=>m.to.r===0&&m.to.c===5));
});
test('coroação só no final do lance quando para na última fileira',()=>{
 const b=empty();b[2][1]=white();b[1][2]=black();
 const moves=legalMoves(b,'white');
 const next=applyMove(b,'white',moves[0]);
 assert.equal(next[0][3].king,true);
});
test('não permite lance falso e não altera estado ao rejeitar',()=>{
 const b=initialBoard(), sig=boardSignature(b,'white');
 assert.throws(()=>applyMove(b,'white',{path:[{r:5,c:0},{r:6,c:1}],captures:[]}),/inválida/);
 assert.equal(boardSignature(b,'white'),sig);
});
test('histórico de uma partida permite desfazer um lance',()=>{
 const g=new LocalMatch(),before=boardSignature(g.board,g.turn);
 g.play(g.possible()[0]);assert.equal(g.turn,'black');
 assert.ok(g.undo());assert.equal(boardSignature(g.board,g.turn),before);
 assert.equal(g.history.length,0);
});
test('uma peça capturada não é removida antes de completar múltiplas capturas',()=>{
 const b=empty();b[5][2]=white(true);b[3][4]=black();b[3][2]=black();
 const moves=legalMoves(b,'white');assert.ok(moves.length>0);
 assert.equal(b[3][4].side,'black');
});
test('passar pela casa de coroação durante a captura não promove se terminar fora dela',()=>{
 const b=empty();b[2][1]=white();b[1][2]=black();b[1][4]=black();
 const moves=legalMoves(b,'white');
 assert.ok(moves.every(m=>m.captures.length===2));
 const final=applyMove(b,'white',moves[0]);
 assert.equal(final[2][5]?.king,false);
});
test('vitória apenas quando não restam movimentos legais ao adversário',()=>{
 const g=new LocalMatch();g.board=empty();g.board[5][2]=white();g.board[4][3]=black();
 const m=g.possible()[0];
 g.play(m);
 assert.equal(g.outcome?.type,'win');
 assert.equal(g.outcome?.winner,'white');
});
