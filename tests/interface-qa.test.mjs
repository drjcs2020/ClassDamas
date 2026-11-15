import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('tabuleiro mantém 8 linhas e 8 colunas iguais no layout',()=>{
 const css=read('online-clean.css');
 assert.match(css,/grid-template-columns:\s*repeat\(8,minmax\(0,1fr\)\)/);
 assert.match(css,/grid-template-rows:\s*repeat\(8,minmax\(0,1fr\)\)/);
 assert.match(css,/aspect-ratio:\s*1\s*\/\s*1/);
 const code=read('online-app.js');
 assert.match(code,/for\(let r=0;r<8;r\+\+\)for\(let c=0;c<8;c\+\+\)/);
});
test('resultado humano e treino usam dados reais da partida',()=>{
 const html=read('online.html'),code=read('online-app.js');
 for(const id of ['result-modal','result-title','result-subtitle','result-new','result-close']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(code,/match\.outcome\?\.result/);
 assert.match(code,/showResultIfFinished\(\)/);
 assert.match(code,/lastShownResultId=match\.id/);
 assert.match(code,/match\.ply\+' jogadas/);
 assert.doesNotMatch(code,/Clara Ferreira venceu o duelo!/);
});
test('identidade visual utiliza somente brasões e cenários do repositório',()=>{
 const html=read('online.html'),css=read('online-clean.css');
 for(const name of ['brasao_aguia.png','brasao_leao.png']){
  assert.match(html,new RegExp(name.replace('.','\\.')));
 }
 assert.match(css,/assets\/cenario_aguia\.webp/);
 assert.doesNotMatch(css,/url\([^)]*(?:flores|parchment|pergaminho|papyrus)/i);
});
