/** Dama ClassMana — servidor EXCLUSIVO. NÃO importa nem acessa a API/banco do arco e flecha. */
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync, statSync, createReadStream } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialBoard, legalMoves, applyMove, boardSignature, opposite } from '../regras.js';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const roster=JSON.parse(readFileSync(new URL('./roster.json',import.meta.url),'utf8'));
const teamMembership=JSON.parse(readFileSync(new URL('./teams.json',import.meta.url),'utf8'));
const groupHero=Object.freeze({
  'Fadas Guerreiras':0,'Chama Congelante':1,'Lobos e Gatunos':2,
  'Cavaleiros e Guerreiros':3,'Dragões de Combate':4,'Mágicos e Engenheiros':5
});
const players=Object.entries(roster).flatMap(([house,names])=>names.map((name,i)=>{
  const id=house+String(i+1).padStart(2,'0');
  return {id,name,house,team:teamMembership[id]||'',hero:groupHero[teamMembership[id]]??null};
}));
const known=new Map(players.map(p=>[p.id,p]));
const dbPath=resolve(process.env.DAMA_DB_PATH||resolve(root,'data','dama-classmana.sqlite'));
mkdirSync(dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS seasons(id TEXT PRIMARY KEY,label TEXT NOT NULL,started_at TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_season ON seasons(active) WHERE active=1;
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,player_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS matches(
 id TEXT PRIMARY KEY,season_id TEXT NOT NULL,creator_id TEXT NOT NULL,recipient_id TEXT NOT NULL,
 white_hero INTEGER NOT NULL,black_hero INTEGER NOT NULL,status TEXT NOT NULL,
 board_json TEXT NOT NULL,turn TEXT NOT NULL,ply INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 0,repetitions_json TEXT NOT NULL,no_capture INTEGER NOT NULL DEFAULT 0,
 result TEXT,reason TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,finished_at TEXT,
 FOREIGN KEY(season_id) REFERENCES seasons(id));
CREATE INDEX IF NOT EXISTS match_creator ON matches(creator_id,created_at);
CREATE INDEX IF NOT EXISTS match_recipient ON matches(recipient_id,created_at);
CREATE TABLE IF NOT EXISTS moves(match_id TEXT NOT NULL,ply INTEGER NOT NULL,player_id TEXT NOT NULL,
 path_json TEXT NOT NULL,captures_json TEXT NOT NULL,crowned INTEGER NOT NULL,played_at TEXT NOT NULL,
 PRIMARY KEY(match_id,ply),FOREIGN KEY(match_id) REFERENCES matches(id));
CREATE TABLE IF NOT EXISTS operations(player_id TEXT NOT NULL,request_id TEXT NOT NULL,response_json TEXT NOT NULL,
 PRIMARY KEY(player_id,request_id));
CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,event TEXT NOT NULL,detail TEXT NOT NULL,at TEXT NOT NULL);
`);
if(!db.prepare('SELECT id FROM seasons WHERE active=1').get()){
  db.prepare('INSERT INTO seasons(id,label,started_at,active) VALUES(?,?,?,1)').run(randomUUID(),'Temporada 1',new Date().toISOString());
}
const stmt={
  getMatch:db.prepare('SELECT * FROM matches WHERE id=?'),
  ownMatches:db.prepare('SELECT * FROM matches WHERE creator_id=? OR recipient_id=? ORDER BY created_at DESC LIMIT 150'),
  getSession:db.prepare('SELECT player_id,expires_at FROM sessions WHERE hash=?'),
  putSession:db.prepare('INSERT OR REPLACE INTO sessions(hash,player_id,expires_at) VALUES(?,?,?)'),
  getOperation:db.prepare('SELECT response_json FROM operations WHERE player_id=? AND request_id=?'),
  putOperation:db.prepare('INSERT INTO operations(player_id,request_id,response_json) VALUES(?,?,?)'),
  season:db.prepare('SELECT id,label,started_at FROM seasons WHERE active=1'),
  matchMoves:db.prepare('SELECT ply,player_id,path_json,captures_json,crowned,played_at FROM moves WHERE match_id=? ORDER BY ply'),
  insertMatch:db.prepare(`INSERT INTO matches(id,season_id,creator_id,recipient_id,white_hero,black_hero,status,board_json,turn,ply,version,repetitions_json,created_at,updated_at,no_capture) VALUES(?,?,?,?,?,?,?,?,?,0,0,?,?,?,0)`)
};
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const fail=(message,status=400)=>{let e=Error(message);e.status=status;throw e};
const now=()=>new Date().toISOString();
const verifyText=(a,b)=>/^[0-9a-f]{64}$/.test(a)&&/^[0-9a-f]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
// O estudante apenas seleciona o nome já cadastrado, como no Torneio das Três Casas.
// O token é uma sessão técnica temporária para distinguir as partidas entre navegadores,
// NÃO uma senha, PIN ou prova de identidade do aluno.
function identifyPlayer(id){
 const player=known.get(id);
 if(!player||player.hero===null)fail('Aluno ou grupo não cadastrado.',404);
 const token=randomBytes(32).toString('hex');
 stmt.putSession.run(hash(token),player.id,Date.now()+30*86400000);
 return {player,token,expiresInDays:30};
}
function authenticated(req){
 const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!/^[0-9a-f]{64}$/.test(raw))return null;
 const row=stmt.getSession.get(hash(raw));
 return row&&row.expires_at>Date.now()?known.get(row.player_id):null;
}
function requirePlayer(req){return authenticated(req)||fail('Identifique-se para acessar a partida.',401)}
function requireDuel(row,player){if(!row||![row.creator_id,row.recipient_id].includes(player.id))fail('Partida não encontrada.',404);return row;}
function safeMatch(row,{includeMoves=false}={}){
 const a=known.get(row.creator_id),b=known.get(row.recipient_id);
 const result={id:row.id,seasonId:row.season_id,creator:a,recipient:b,
   whiteHero:row.white_hero,blackHero:row.black_hero,status:row.status,
   turn:row.turn,ply:row.ply,version:row.version,board:JSON.parse(row.board_json),
   outcome:row.result?{result:row.result,reason:row.reason}:null,
   createdAt:row.created_at,updatedAt:row.updated_at,finishedAt:row.finished_at};
 if(includeMoves)result.moves=stmt.matchMoves.all(row.id).map(x=>({ply:x.ply,playerId:x.player_id,
   path:JSON.parse(x.path_json),captures:JSON.parse(x.captures_json),crowned:!!x.crowned,playedAt:x.played_at}));
 return result;
}
function ranking(seasonId=stmt.season.get().id){
 const concluded=db.prepare("SELECT creator_id,recipient_id,result FROM matches WHERE season_id=? AND status='CONCLUIDO' AND result IN ('white','black','draw')").all(seasonId);
 const playerRows=new Map(players.map(p=>[p.id,{...p,plays:0,wins:0,draws:0,losses:0,points:0}]));
 const groupRows=new Map(Object.keys(groupHero).map(g=>[g,{name:g,hero:groupHero[g],members:players.filter(p=>p.team===g).length,plays:0,wins:0,draws:0,losses:0,points:0}]));
 for(const m of concluded){
   const c=known.get(m.creator_id),r=known.get(m.recipient_id);
   if(!c||!r)continue;
   for(const [p,side] of [[c,'white'],[r,'black']]){
     const row=playerRows.get(p.id);
     row.plays++;const win=m.result===side,draw=m.result==='draw';
     row.wins+=+win;row.draws+=+draw;row.losses+=+(!win&&!draw);row.points+=win?3:draw?1:0;
   }
   // Só confronto entre grupos DIFERENTES pontua o ranking coletivo.
   if(c.team===r.team)continue;
   for(const [p,side] of [[c,'white'],[r,'black']]){
     const row=groupRows.get(p.team);if(!row)continue;
     row.plays++;const win=m.result===side,draw=m.result==='draw';
     row.wins+=+win;row.draws+=+draw;row.losses+=+(!win&&!draw);row.points+=win?3:draw?1:0;
   }
 }
 const sorter=(a,b)=>b.points-a.points||b.wins-a.wins||a.losses-b.losses||a.name.localeCompare(b.name,'pt-BR');
 return {season:db.prepare('SELECT id,label,started_at AS startedAt,active FROM seasons WHERE id=?').get(seasonId),
   games:concluded.length,players:[...playerRows.values()].filter(p=>p.plays>0).sort(sorter),
   groups:[...groupRows.values()].sort(sorter)};
}
function validMovePath(path){return Array.isArray(path)&&path.length>=2&&path.length<=14&&path.every(p=>p&&Number.isInteger(p.r)&&Number.isInteger(p.c)&&p.r>=0&&p.r<8&&p.c>=0&&p.c<8)}
function route(req,action,data,query){
 if(action==='ping')return {api:'dama-v2',game:'dama',persistent:true,database:'independente'};
 if(action==='roster')return {players};
 if(action==='ranking')return ranking();
 if(action==='identify')return identifyPlayer(String(data.id||''));
 const player=requirePlayer(req);
 if(action==='me')return {player};
 if(action==='inbox')return {matches:stmt.ownMatches.all(player.id,player.id).map(m=>safeMatch(m))};
 if(action==='match')return {match:safeMatch(requireDuel(stmt.getMatch.get(String(query.get('id')||'')),player),{includeMoves:true})};
 if(action==='challenge'){
   const to=String(data.to||''),recipient=known.get(to);
   if(!recipient||recipient.id===player.id||recipient.hero===null)fail('Adversário inválido.');
   if(recipient.team===player.team)fail('Desafie um integrante de OUTRO grupo de heróis.');
   const ongoing=db.prepare("SELECT * FROM matches WHERE season_id=? AND creator_id=? AND recipient_id=? AND status IN ('PENDENTE','EM_ANDAMENTO') ORDER BY created_at DESC LIMIT 1").get(stmt.season.get().id,player.id,to);
   if(ongoing)return {match:safeMatch(ongoing),reused:true};
   const initial=initialBoard(player.hero,recipient.hero);
   const id=randomUUID(),at=now(),reps={[boardSignature(initial,'white')]:1};
   stmt.insertMatch.run(id,stmt.season.get().id,player.id,to,player.hero,recipient.hero,
     'PENDENTE',JSON.stringify(initial),'white',JSON.stringify(reps),at,at);
   return {match:safeMatch(stmt.getMatch.get(id))};
 }
 if(action==='answer'){
   const m=stmt.getMatch.get(String(data.id||''));
   if(!m||m.recipient_id!==player.id)fail('Convite não encontrado.',404);
   if(m.status!=='PENDENTE')fail('Este convite já foi respondido.',409);
   if(!['accept','decline'].includes(data.decision))fail('Resposta inválida.');
   db.prepare('UPDATE matches SET status=?,updated_at=?,version=version+1 WHERE id=?')
     .run(data.decision==='accept'?'EM_ANDAMENTO':'RECUSADO',now(),m.id);
   return {match:safeMatch(stmt.getMatch.get(m.id))};
 }
 if(action==='move'){
   const m=requireDuel(stmt.getMatch.get(String(data.id||'')),player);
   if(m.status!=='EM_ANDAMENTO')fail('A partida ainda não está ativa ou já terminou.',409);
   if(m.version!==data.expectedVersion)fail('O tabuleiro mudou. Atualize a partida antes de jogar.',409);
   const expectedSide=m.creator_id===player.id?'white':'black';
   if(m.turn!==expectedSide)fail('Aguarde a jogada do adversário.',409);
   if(!validMovePath(data.path))fail('Trajetória de movimento inválida.');
   const board=JSON.parse(m.board_json),possible=legalMoves(board,m.turn);
   const sig=p=>p.map(c=>`${c.r},${c.c}`).join('>');
   const wanted=possible.find(x=>sig(x.path)===sig(data.path));
   if(!wanted)fail('Movimento ilegal: captura obrigatória ou sequência incorreta.',409);
   const piece=board[wanted.from.r][wanted.from.c];
   const next=applyMove(board,m.turn,wanted),crowned=!piece.king&&!!next[wanted.to.r][wanted.to.c]?.king;
   const nextTurn=opposite(m.turn),at=now(),ply=m.ply+1;
   const reps=JSON.parse(m.repetitions_json),boardKey=boardSignature(next,nextTurn);
   reps[boardKey]=(reps[boardKey]||0)+1;
   const noCapture=wanted.captures.length||crowned?0:m.no_capture+1;
   let result=null,reason=null;
   if(!legalMoves(next,nextTurn).length){result=m.turn;reason='O adversário ficou sem movimentos legais.';}
   else if(reps[boardKey]>=5){result='draw';reason='A posição foi repetida cinco vezes.';}
   else if(noCapture>=80){result='draw';reason='80 meios-lances sem captura nem promoção (regra do ClassMana).';}
   else if(ply>=300){result='draw';reason='Limite de segurança de 300 meios-lances.';}
   db.prepare(`UPDATE matches SET board_json=?,turn=?,ply=?,version=version+1,repetitions_json=?,no_capture=?,
      result=?,reason=?,status=?,updated_at=?,finished_at=? WHERE id=?`)
     .run(JSON.stringify(next),nextTurn,ply,JSON.stringify(reps),noCapture,result,reason,
       result?'CONCLUIDO':'EM_ANDAMENTO',at,result?at:null,m.id);
   db.prepare('INSERT INTO moves(match_id,ply,player_id,path_json,captures_json,crowned,played_at) VALUES(?,?,?,?,?,?,?)')
     .run(m.id,ply,player.id,JSON.stringify(wanted.path),JSON.stringify(wanted.captures),+crowned,at);
   return {match:safeMatch(stmt.getMatch.get(m.id),{includeMoves:true})};
 }
 fail('Ação desconhecida.',404);
}

const adminPasswordHash=String(process.env.DAMA_TEACHER_PASSWORD_SHA256||'').trim().toLowerCase();
const adminSessions=new Map();
const attempts=new Map();
function adminRoute(req,action,data){
 if(action==='teacherLogin'){
   if(!/^[a-f0-9]{64}$/.test(adminPasswordHash))fail('Senha do professor não configurada no servidor.',503);
   const ip=req.socket.remoteAddress||'local',entry=attempts.get(ip)||{n:0,until:0};
   if(entry.until>Date.now())fail('Muitas tentativas. Aguarde 15 minutos.',429);
   if(!verifyText(hash(data.password||''),adminPasswordHash)){
     entry.n++;if(entry.n>=5){entry.n=0;entry.until=Date.now()+15*60*1000;}attempts.set(ip,entry);
     fail('Senha inválida.',401);
   }
   attempts.delete(ip);const token=randomBytes(32).toString('hex');
   adminSessions.set(hash(token),Date.now()+30*60000);return {token,expiresInSeconds:1800};
 }
 const token=String(req.headers['x-classmana-teacher']||''),valid=/^[a-f0-9]{64}$/.test(token)&&adminSessions.get(hash(token))>Date.now();
 if(!valid)fail('Acesso exclusivo do professor.',401);
 if(action==='teacherStatus')return {seasons:db.prepare('SELECT id,label,started_at AS startedAt,active FROM seasons ORDER BY started_at DESC').all(),activeSeason:stmt.season.get(),students:players.length};
 if(action==='teacherRanking')return ranking();
 if(action==='teacherNewSeason'){
   if(data.confirmation!=='NOVA TEMPORADA')fail('Confirme digitando NOVA TEMPORADA.',400);
   const label=String(data.label||'').trim();if(label.length<3||label.length>70)fail('Nome da temporada deve ter 3 a 70 caracteres.');
   const active=stmt.season.get(),id=randomUUID(),at=now();
   const open=db.prepare("SELECT COUNT(*) AS n FROM matches WHERE season_id=? AND status IN ('PENDENTE','EM_ANDAMENTO')").get(active.id).n;
   if(open)fail(`Existem ${open} desafios em aberto. Conclua-os ou aguarde antes de iniciar outra temporada.`,409);
   // Não descarta nem altera resultados; somente inicia outra temporada.
   db.exec('BEGIN IMMEDIATE');
   try{
     db.prepare('UPDATE seasons SET active=0 WHERE id=?').run(active.id);
     db.prepare('INSERT INTO seasons(id,label,started_at,active) VALUES(?,?,?,1)').run(id,label,at);
     db.prepare('INSERT INTO admin_audit(id,event,detail,at) VALUES(?,?,?,?)').run(randomUUID(),'new-season',JSON.stringify({old:active.id,new:id,label}),at);
     db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   return {season:{id,label},previousSeasonId:active.id,historyPreserved:true};
 }
 fail('Ação administrativa desconhecida.',404);
}

const allowedOrigins=new Set((process.env.DAMA_ALLOWED_ORIGINS||'https://drjcs2020.github.io,http://localhost:3000,http://127.0.0.1:3000').split(',').map(s=>s.trim()).filter(Boolean));
function originAllowed(origin,request){
 if(!origin)return true;
 if(allowedOrigins.has(origin))return true;
 // Em Railway, a interface é distribuída junto com a API, pelo mesmo domínio.
 // Não requer uma URL fixa nem habilitar CORS aberto.
 try{const given=new URL(origin);return ['http:','https:'].includes(given.protocol)&&given.host===request.headers.host;}
 catch{return false;}
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json'};
function send(res,status,body,origin='',allowOrigin=false){
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization,X-ClassMana-Teacher',...(origin&&allowOrigin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})};
 res.writeHead(status,headers);res.end(JSON.stringify(body));
}
const server=http.createServer(async(req,res)=>{
 const origin=String(req.headers.origin||'');
 const allowed=originAllowed(origin,req);
 if(!allowed){send(res,403,{ok:false,error:'Origem não autorizada.'});return;}
 let url;try{url=new URL(req.url,'http://localhost')}catch{send(res,400,{ok:false,error:'URL inválida.'},origin);return;}
 if(url.pathname==='/api'){
   if(req.method==='OPTIONS'){send(res,204,{},origin,allowed);return;}
   try{
     if(!['GET','POST'].includes(req.method))fail('Método não aceito.',405);
     let raw='';if(req.method==='POST')for await(const chunk of req){raw+=chunk;if(raw.length>24000)fail('Pedido muito grande.',413);}
     const data=raw?JSON.parse(raw):{},action=url.searchParams.get('action')||'';
     const adminActions=['teacherLogin','teacherStatus','teacherRanking','teacherNewSeason'];
     if(adminActions.includes(action)){
       if(req.method==='POST'&&!['teacherLogin','teacherNewSeason'].includes(action))fail('Método inválido.',405);
       if(req.method==='GET'&&!['teacherStatus','teacherRanking'].includes(action))fail('Método inválido.',405);
       send(res,200,{ok:true,...adminRoute(req,action,data)},origin,allowed);return;
     }
     if(req.method==='POST'&&!['identify','challenge','answer','move'].includes(action))fail('Operação inválida.',405);
     if(req.method==='POST'&&action!=='identify'){
       const person=requirePlayer(req),requestId=String(data.requestId||'');
       if(!/^[a-zA-Z0-9_-]{12,128}$/.test(requestId))fail('Identificador de requisição inválido.');
       let previous=stmt.getOperation.get(person.id,requestId);
       if(previous){send(res,200,JSON.parse(previous.response_json),origin,allowed);return;}
       db.exec('BEGIN IMMEDIATE');
       let answer;
       try{previous=stmt.getOperation.get(person.id,requestId);
         answer=previous?JSON.parse(previous.response_json):{ok:true,...route(req,action,data,url.searchParams)};
         if(!previous)stmt.putOperation.run(person.id,requestId,JSON.stringify(answer));
         db.exec('COMMIT');
       }catch(error){db.exec('ROLLBACK');throw error;}
       send(res,200,answer,origin,allowed);return;
     }
     send(res,200,{ok:true,...route(req,action,data,url.searchParams)},origin,allowed);
   }catch(error){if(!error.status)console.error('Dama API:',error);send(res,error.status||500,{ok:false,error:error.status?error.message:'Erro interno do servidor.'},origin,allowed);}
   return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 const pathname=decodeURIComponent(url.pathname);const file=resolve(root,'.'+(pathname==='/'?'/online.html':pathname));
 if(!file.startsWith(root+sep)||/\/(?:data|duel-api|tests|\.git)(?:\/|$)/.test(file.replaceAll('\\','/'))||file.endsWith('.sqlite')){
   res.writeHead(404);res.end();return;
 }
 try{if(!statSync(file).isFile())throw Error('not file');
   res.writeHead(200,{'Content-Type':mime[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end('Arquivo não encontrado');}
});
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const port=Number(process.env.PORT||3000);server.listen(port,'0.0.0.0',()=>console.log(`Dama ClassMana API em http://localhost:${port} — banco ${dbPath}`));
}
export {server,db,players,groupHero};
