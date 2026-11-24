/** Gera somente os arquivos públicos (não expõe dados, API Node nem configuração interna). */
import {cpSync,rmSync,mkdirSync,existsSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(new URL('../',import.meta.url).pathname);
const out=resolve(root,'dist');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const allow=['index.html','online.html','online-app.js','online-config.js','online.css','online-v3.css','online-clean.css','online-approved.css','bot-ai.js','regras.js','regras-classico.js','treino.html','app.js','styles.css','assets'];
for(const name of allow){
 const src=resolve(root,name);
 if(existsSync(src))cpSync(src,resolve(out,name),{recursive:true});
}
// A arte oficial da Batalha dos Monstros também passa a ser servida pelo Cloudflare.
// Assim a versão publicada não depende de GitHub Raw para os rostos das peças.
const portraits=['fada','chama','lobo','cavaleiro','dragao','maga'];
const destination=resolve(out,'assets','monstros');
mkdirSync(destination,{recursive:true});
for(const hero of portraits){
 const filename='hero_'+hero+'.png';
 const url='https://raw.githubusercontent.com/drjcs2020/classmana-batalha-dos-monstros-V2/main/assets/'+filename;
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Falha ao preparar arte oficial '+filename+': HTTP '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length<10000||bytes.length>25000000)throw Error('Arte inválida: '+filename);
 writeFileSync(resolve(destination,filename),bytes);
}
// Usa exclusivamente os três brasões que o professor atualizou neste repositório.
// Não sobrescrever com arquivos antigos de outro jogo.
const officialCrests=['aguia','leao','dragao'];
for(const house of officialCrests){
 const file=resolve(out,'assets','brasao_'+house+'.png');
 if(!existsSync(file))throw Error('Brasão oficial não encontrado: '+house);
 const bytes=readFileSync(file);
 const png=Buffer.from([137,80,78,71,13,10,26,10]);
 if(bytes.length<100000||bytes.length>10000000||!bytes.subarray(0,8).equals(png))
  throw Error('Brasão atualizado inválido: '+house);
}
console.log('Cloudflare: 6 retratos e 3 brasões atualizados do próprio ClassDamas disponíveis em dist/.');
