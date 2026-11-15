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
  assert.match(html,new RegExp('brasao_'+casa+'_hd\\.png'));
  assert.match(css,new RegExp('cenario_'+casa+'\\.webp'));
  assert.match(build,new RegExp('brasao-'+({'aguia':'aguia-dourada','leao':'leao-de-fogo','dragao':'dragao-esmeralda'})[casa]+'\\.png'));
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
