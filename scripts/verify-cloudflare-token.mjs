/**
 * Validação segura do token Cloudflare antes de modificar o banco ou publicar.
 * Somente no GitHub Actions. Não imprime nem grava tokens no repositório.
 * Tenta corrigir cópias com prefixo "Bearer", aspas, e comandos curl.
 */
import {appendFileSync} from 'node:fs';

const raw=String(process.env.CLOUDFLARE_API_TOKEN||'');
const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
if(!process.env.GITHUB_ENV || !/^[0-9a-f]{32}$/i.test(account)){
 console.error('GitHub Actions ou Account ID não estão configurados corretamente.');
 process.exit(1);
}
const found=new Set();
const add=v=>{
 if(!v)return;
 const value=String(v).trim().replace(/^[\x22\x27\x60]+|[\x22\x27\x60]+$/g,'');
 if(/^[A-Za-z0-9_.-]{35,160}$/.test(value))found.add(value);
};
add(raw);
add(raw.replace(/\s+/g,''));
add(raw.replace(/^\s*(?:Bearer|Token)\s+/i,''));
add(raw.replace(/^\s*(?:CLOUDFLARE_API_TOKEN|API_TOKEN)\s*[=:]\s*/i,''));
for(const match of raw.matchAll(/(?:cfut_|cfat_|cfoat_)[A-Za-z0-9_-]{30,130}/g))add(match[0]);
for(const match of raw.matchAll(/(?:Bearer\s+|TOKEN\s*[=:]\s*)[\x22\x27\x60]?([A-Za-z0-9_.-]{35,160})/gi))add(match[1]);

const verify=async (url,token)=>{
 try{
  const response=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token},
   signal:AbortSignal.timeout(13000)});
  const data=await response.json();
  return response.ok && data.success===true && data.result?.status==='active';
 }catch{return false;}
};
const endpoints=[
 'https://api.cloudflare.com/client/v4/user/tokens/verify',
 'https://api.cloudflare.com/client/v4/accounts/'+account+'/tokens/verify'
];
for(const candidate of [...found].slice(0,8)){
 for(const url of endpoints){
  if(await verify(url,candidate)){
   console.log('Cloudflare: token verificado como ativo. Seguindo com publicação.');
   // O GITHUB_ENV só fica no runner; a credencial nunca entra no Git.
   appendFileSync(process.env.GITHUB_ENV,'CLOUDFLARE_API_TOKEN='+candidate+'\n');
   process.exit(0);
  }
 }
}
console.error('Cloudflare rejeitou a credencial: nenhum formato seguro foi validado.');
console.error('O GitHub tem um Secret preenchido, mas o valor não é aceito como API Token ativo.');
console.error('Sem credencial válida, a publicação e as migrações D1 ficam BLOQUEADAS para preservar os dados.');
process.exit(1);
