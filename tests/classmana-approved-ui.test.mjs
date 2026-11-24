import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('layout aprovado conserva abas operacionais e IDs críticos do jogo',()=>{
 const html=read('online.html'),js=read('online-app.js');
 for(const view of ['casa','desafios','partida','rankings']){
  assert.match(html,new RegExp('id="view-'+view+'"'));
  assert.match(html,new RegExp('id="panel-'+view+'"'));
 }
 for(const id of ['house','player','confirm-student','change-student','challenge',
  'opponent','target-house','inbox','notification-count','challenge-notice',
  'board','white-banner','black-banner','mode-bot','mode-duel',
  'refresh-ranking','groups-ranking','houses-ranking','players-ranking',
  'result-modal','result-title','teacher-login']){
   assert.match(html,new RegExp('id="'+id+'"'),'ID ausente: '+id);
 }
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size,'IDs duplicados no HTML');
 assert.match(js,/function showView\(view\)/);
 assert.match(js,/function syncHouseVisual\(/);
 assert.match(js,/showView\('play'\)/);
 assert.doesNotMatch(html,/CONVITES ILUSTRATIVOS|EXEMPLO DE PARTIDA|PROTÓTIPO NÃO FUNCIONAL/i);
});

test('três casas, seis equipes e maga engenheira usam apenas arte oficial',()=>{
 const html=read('online.html'),css=read('online-approved.css'),js=read('online-app.js');
 const build=read('scripts/build-cloudflare.mjs');
 for(const casa of ['aguia','leao','dragao']){
  assert.ok(html.includes('assets/brasao_'+casa+'.png?v=20261124'));
  assert.ok(js.includes('assets/brasao_'+casa+'.png?v=20261124'));
  assert.match(css,new RegExp('cenario_'+casa+'\\.webp'));
  assert.ok(build.includes("'brasao_'+house+'.png'"));
 }
 assert.match(js,/\['Mágicos e Engenheiros','Maga Engenheira','maga'/);
 assert.match(js,/hero_maga\.png/);
 assert.match(css,/\.cm-house-card img/);
});

test('ranking das três turmas sem alterar grupos ou alunos',()=>{
 const html=read('online.html'),worker=read('cloudflare/worker.mjs');
 for(const tab of ['groups','houses','players']) assert.match(html,new RegExp('id="tab-'+tab+'"'));
 assert.match(worker,/houses:\[\.\.\.houseRows\.values\(\)\]\.sort\(order\)/);
 assert.match(worker,/groups:\[\.\.\.groupRows\.values\(\)\]\.sort\(order\)/);
});

test('tabuleiro protagonista não usa scrollbar interna e ganha área central',()=>{
 const css=read('online-approved.css');
 const fix=css.slice(css.lastIndexOf('/* ClassDamas — tabuleiro protagonista'));
 assert.ok(fix.length>1500,'correção de tabuleiro deve existir');
 assert.match(fix,/#panel-partida>\.arena \.board-shell\s*\{[\s\S]*?overflow:visible/);
 assert.match(fix,/#panel-partida>\.arena \.board-edge\s*\{[\s\S]*?width:min\(100%,calc\(100dvh - 265px\),870px\)/);
 assert.match(fix,/#panel-partida>\.arena \.turn\s*\{[\s\S]*?grid-column:2/);
 assert.match(fix,/@media \(max-width:900px\)\{[\s\S]*?#panel-partida>\.arena \.board-shell\s*\{\s*overflow:visible/);
 assert.match(fix,/#panel-partida>\.arena #board\s*\{[\s\S]*?aspect-ratio:1\/1;overflow:hidden/);
});

test('arena compacta conserva controles e mantém o tabuleiro sem cortar',()=>{
 const html=read('online.html'),css=read('online-approved.css');
 const start=html.indexOf('<section id="panel-partida"');
 const end=html.indexOf('<section id="panel-rankings"',start);
 const partita=html.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.doesNotMatch(partita,/ARENA DOS HERÓIS<\/h1>|TABULEIRO OFICIAL · UMA PARTIDA POR VEZ/);
 assert.doesNotMatch(partita,/<div class="cm-heading">/);
 const side=partita.indexOf('<aside class="cm-board-controls"');
 const board=partita.indexOf('<div id="board"');
 assert.ok(board>0&&side>board,'Tabuleiro deve aparecer antes dos controles secundários');
 for(const id of ['duel-status','crest-white','turn-label','message','mode-duel','mode-bot','bot-start','reload-match','open-ranking']){
  assert.ok(partita.indexOf('id="'+id+'"',side)>side,'Controle deve estar na lateral: '+id);
 }
 assert.match(partita,/<div class="cm-status-card"><img class="cm-status-crest"/);
 const current=css.slice(css.lastIndexOf('/* ClassMana — arena reorganizada'));
 assert.ok(current.length>5000,'Estilo final da arena não encontrado');
 assert.match(current,/#panel-partida>\.arena \.board-shell\s*\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(175px,245px\)/);
 assert.match(current,/width:min\(100%,calc\(100cqh - 43px\),760px\)/);
 assert.match(current,/#panel-partida\.cm-view\{padding:7px 10px;overflow:hidden\}/);
 assert.match(current,/grid-template-rows:minmax\(0,1fr\)/);
 assert.match(current,/#panel-partida>\.arena \.board-shell\{display:flex;flex-direction:column;min-height:0;max-height:none;height:auto;overflow:visible/);
});

test('GitHub Pages encaminha para o jogo Cloudflare com API no mesmo domínio',()=>{
 const html=read('online.html');
 const config=read('online-config.js');
 assert.match(html,/location\.hostname\.endsWith\('\.github\.io'\)/);
 assert.match(html,/location\.replace\('https:\/\/classdamas\.jean-silveira35\.workers\.dev\/online\.html'/);
 assert.match(config,/sameOrigin/);
});

test('publicação não sobrescreve brasões atualizados com arquivos de outros jogos',()=>{
 const html=read('online.html'),js=read('online-app.js'),build=read('scripts/build-cloudflare.mjs');
 assert.doesNotMatch(html,/_hd\.png/);
 assert.doesNotMatch(js,/_hd\.png/);
 assert.doesNotMatch(build,/classmana-torneio-arco-e-flecha-V2/);
 assert.match(build,/Brasão atualizado inválido/);
});
