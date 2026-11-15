/** Injeta o ID do banco somente no deploy, sem gravá-lo no Git. */
import {readFileSync,writeFileSync} from 'node:fs';
const value=(process.env.CLOUDFLARE_D1_DATABASE_ID||'').trim();
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)){
 console.error('CLOUDFLARE_D1_DATABASE_ID ausente ou inválido. Crie o D1 classdamas-db e configure o GitHub Secret.');
 process.exit(1);
}
const configPath='wrangler.jsonc';
const config=JSON.parse(readFileSync(configPath,'utf8'));
if(config.name!=='classdamas'||config.d1_databases[0].database_name!=='classdamas-db')throw Error('Configuração inesperada: abortando para proteger outros bancos.');
config.d1_databases[0].database_id=value;
writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
console.log('Configuração temporária do D1 atualizada com segurança.');
