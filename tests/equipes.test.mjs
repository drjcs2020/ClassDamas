import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialBoard,LocalMatch} from '../regras.js';

const count=(board,side)=>board.flat().filter(p=>p?.side===side);
test('cada lado contém exatamente 12 peças do mesmo herói oficial',()=>{
  for(let white=0;white<6;white++)for(let black=0;black<6;black++){
    if(white===black)continue;
    const game=new LocalMatch();game.reset(white,black);
    assert.equal(count(game.board,'white').length,12);
    assert.equal(count(game.board,'black').length,12);
    assert.ok(count(game.board,'white').every(p=>p.hero===white));
    assert.ok(count(game.board,'black').every(p=>p.hero===black));
  }
});
test('mesmo personagem não compete contra si mesmo',()=>{
  const game=new LocalMatch();assert.throws(()=>game.reset(2,2));
});
test('ao mover, o personagem de cada peça permanece o mesmo',()=>{
  const game=new LocalMatch();game.reset(4,5);
  game.play(game.possible()[0]);
  assert.ok(count(game.board,'white').every(p=>p.hero===4));
  assert.ok(count(game.board,'black').every(p=>p.hero===5));
});
test('a seleção das duas equipes oferece os seis personagens oficiais',()=>{
  const html=readFileSync(new URL('../treino.html',import.meta.url),'utf8');
  for(const side of ['white','black']){
   const selected=html.match(new RegExp(`<select id="hero-${side}"[^>]*>([\\s\\S]*?)<\\/select>`))?.[1];
   assert.ok(selected);
   assert.equal((selected.match(/<option/g)||[]).length,6);
  }
});
