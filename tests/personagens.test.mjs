import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../treino.html',import.meta.url),'utf8');
const images=readdirSync(new URL('../assets/',import.meta.url));
const characters=[['fada','Fada Guerreira'],['chama','Chama Congelante'],['lobo','Lobo Gatuno'],['cavaleiro','Cavaleiro Guerreiro'],['dragao','Dragão de Combate'],['maga','Maga Engenheira']];
test('exatamente os seis heróis oficiais no tabuleiro',()=>{
 for(const [id,name] of characters){assert.ok(js.includes(`id:'${id}',name:'${name}',file:'hero_${id}.png'`),name)}
 assert.match(js,/classmana-batalha-dos-monstros-V2\/main\/assets/);
 assert.equal((js.match(/file:'hero_/g)||[]).length,6);
});
test('não utiliza imagens de arqueiros',()=>{
 assert.doesNotMatch(js,/aguia_guerreiro|dragao_arqueiro|leao_guerreira|hero_arqueiro/);
 assert.doesNotMatch(html,/figura_blue|figura_green|figura_red|arqueiro|arqueira/i);
 assert.equal(images.some(name=>/arqueir|guerreir|figura_/i.test(name)),false);
});
