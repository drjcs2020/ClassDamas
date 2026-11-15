/**
 * Cloudflare deploy: resolve exclusivamente o D1 classdamas-db.
 * Se ausente, cria somente este banco. Nunca modifica/deleta o D1 do Torneio V2.
 * Token e Account ID vêm de GitHub Secrets; nenhuma credencial entra no repositório.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const configPath='wrangler.jsonc';
const cfg=JSON.parse(readFileSync(configPath,'utf8'));
const name='classdamas-db';
if(cfg.name!=='classdamas'||cfg.d1_databases?.length!==1||
  cfg.d1_databases[0].database_name!==name||cfg.d1_databases[0].binding!=='DB')
 throw Error('Configuração inesperada. Não é seguro iniciar a migração.');
const cli=['node_modules/wrangler/bin/wrangler.js','d1'];
function command(...args){
 const p=spawnSync(process.execPath,[...cli,...args],{
  encoding:'utf8',timeout:60000,env:{...process.env,CI:'true'}
 });
 if(p.status!==0){
  let detail=String(p.stderr||p.stdout||'Falha sem detalhes').trim();
  for(const secret of [process.env.CLOUDFLARE_API_TOKEN,process.env.CLOUDFLARE_ACCOUNT_ID]){
   if(secret)detail=detail.replaceAll(secret,'[CREDENCIAL PROTEGIDA]');
  }
  throw Error('Cloudflare não confirmou D1 '+args[0]+': '+detail.slice(-2200));
 }
 return p.stdout.trim();
}
function list(){
 const raw=JSON.parse(command('list','--json'));
 const rows=Array.isArray(raw)?raw:Array.isArray(raw?.result)?raw.result:null;
 if(!rows)throw Error('Resposta inesperada da lista D1, cancelando por segurança.');
 return rows;
}
let found=list().filter(db=>db.name===name);
if(found.length>1)throw Error('Mais de um banco classdamas-db: não vou escolher automaticamente.');
if(!found.length){
 console.log('Nenhum classdamas-db encontrado. Criando banco exclusivo para Damas...');
 command('create',name);
 found=list().filter(db=>db.name===name);
}
if(found.length!==1)throw Error('Não foi possível verificar a criação do banco ClassDamas.');
const uuid=String(found[0].uuid||found[0].id||'').toLowerCase();
if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(uuid))
 throw Error('Cloudflare devolveu UUID inválido para o D1 do ClassDamas.');
const expected=String(process.env.CLOUDFLARE_D1_DATABASE_ID||'').toLowerCase().trim();
if(expected&&expected!==uuid)
 throw Error('O Secret D1 ID não pertence a classdamas-db. Publicação bloqueada.');
cfg.d1_databases[0].database_id=uuid;
writeFileSync(configPath,JSON.stringify(cfg,null,2)+'\n');
console.log('Configuração D1 exclusiva pronta: classdamas-db. Nenhum outro banco foi alterado.');
