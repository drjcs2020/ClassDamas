/**
 * Fail-closed preflight: nunca executar migrações do ClassDamas no banco de outro jogo.
 * Somente GitHub Actions, após receber os Secrets do usuário.
 */
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const name='classdamas-db';
const db=config.d1_databases?.find(d=>d.binding==='DB');
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
if(config.name!=='classdamas'||db?.database_name!==name||
   !uuid.test(db.database_id)||db.database_id==='00000000-0000-0000-0000-000000000000'){
 console.error('Publicação cancelada: o Worker ou o D1 não corresponde ao ClassDamas.');
 process.exit(1);
}
const result=spawnSync(process.execPath,
 ['node_modules/wrangler/bin/wrangler.js','d1','info',name,'--json'],{
  encoding:'utf8',timeout:50000,env:{...process.env,CI:'true'}
 });
if(result.status!==0){
 console.error('Não foi possível verificar o banco Cloudflare. Nenhuma migração será executada.');
 process.exit(1);
}
let remote;
try{
 const json=JSON.parse(result.stdout.trim());
 remote=json.result&&typeof json.result==='object'?json.result:json;
}catch{
 console.error('Cloudflare devolveu metadados inválidos. Nenhuma migração será executada.');
 process.exit(1);
}
const remoteId=String(remote.uuid||remote.id||'').toLowerCase();
if(remote.name!==name||remoteId!==db.database_id.toLowerCase()){
 console.error('D1 não confere: o ID configurado não pertence ao banco classdamas-db desta conta. ABORTADO.');
 process.exit(1);
}
console.log('Banco D1 classdamas-db verificado: nome e ID corretos. Migração autorizada.');
