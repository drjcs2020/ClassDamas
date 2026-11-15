/** Gera somente os arquivos públicos (não expõe dados, API Node nem configuração interna). */
import {cpSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(new URL('../',import.meta.url).pathname);
const out=resolve(root,'dist');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const allow=['index.html','online.html','online-app.js','online-config.js','online.css','online-v3.css','bot-ai.js','regras.js','regras-classico.js','treino.html','app.js','styles.css','assets'];
for(const name of allow){
 const src=resolve(root,name);
 if(existsSync(src))cpSync(src,resolve(out,name),{recursive:true});
}
console.log('Cloudflare: assets públicos preparados em dist/; API e banco não são públicos.');
