/**
 * ClassDamas Cloudflare Worker + D1.
 * Independente do Torneio das Três Casas V2. Nunca conecta ao banco do arco.
 * A API mantém o contrato /api?action=... utilizado pelo frontend ClassMana.
 */
import roster from '../duel-api/roster.json' with { type: 'json' };
import memberships from '../duel-api/teams.json' with { type: 'json' };
import {initialBoard,legalMoves,applyMove,boardSignature,opposite} from '../regras.js';

const groupHero=Object.freeze({
 'Fadas Guerreiras':0,'Chama Congelante':1,'Lobos e Gatunos':2,
 'Cavaleiros e Guerreiros':3,'Dragões de Combate':4,'Mágicos e Engenheiros':5
});
const players=Object.entries(roster).flatMap(([house,names])=>names.map((name,i)=>{
 const id=house+String(i+1).padStart(2,'0');
 const team=memberships[id]||'';
 return {id,name,house,team,hero:groupHero[team]??null};
}));
const known=new Map(players.map(p=>[p.id,p]));
const TTL=105000;                // 105 segundos sem heartbeat: offline.
const HEARTBEAT_MIN_MS=45000;   // Evita escrever na D1 em cada consulta.
const now=()=>new Date().toISOString();
function error(msg,status=400){const e=Error(msg);e.status=status;throw e;}
function uid(){return crypto.randomUUID();}
function newToken(){
 const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function sha256(value){
 const bytes=new TextEncoder().encode(String(value));
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
const normalize=(x)=>String(x||'').trim();
const statement=(db,sql,args)=>args.length?db.prepare(sql).bind(...args):db.prepare(sql);
const all=(db,sql,...args)=>statement(db,sql,args).all().then(x=>x.results);
const first=(db,sql,...args)=>statement(db,sql,args).first();
const run=(db,sql,...args)=>statement(db,sql,args).run();
async function season(db){
 let row=await first(db,'SELECT id,label,started_at AS startedAt,active FROM seasons WHERE active=1 LIMIT 1');
 if(row)return row;
 await run(db,'INSERT OR IGNORE INTO seasons(id,label,started_at,active) VALUES(?,?,?,1)',
  'season-1','Temporada 1',now());
 row=await first(db,'SELECT id,label,started_at AS startedAt,active FROM seasons WHERE active=1 LIMIT 1');
 if(!row)error('Temporada indisponível.',503);
 return row;
}
async function session(req,db){
 const raw=normalize(req.headers.get('Authorization')).replace(/^Bearer\s+/i,'');
 if(!/^[0-9a-f]{64}$/.test(raw))return null;
 const hash=await sha256(raw);
 const row=await first(db,'SELECT player_id,expires_at FROM sessions WHERE hash=?',hash);
 if(!row||row.expires_at<=Date.now())return null;
 const player=known.get(row.player_id);
 return player?{player,hash}:null;
}
async function requireStudent(req,db){
 return (await session(req,db))||error('Selecione seu nome para acessar o duelo.',401);
}
async function touch(db,auth){
 const t=Date.now();
 const row=await first(db,'SELECT seen_at FROM presence WHERE session_hash=?',auth.hash);
 if(row&&row.seen_at>t-HEARTBEAT_MIN_MS)return;
 await run(db,'INSERT INTO presence(session_hash,player_id,seen_at) VALUES(?,?,?) ON CONFLICT(session_hash) DO UPDATE SET player_id=excluded.player_id,seen_at=excluded.seen_at',
  auth.hash,auth.player.id,t);
}
async function onlineIds(db){
 const rows=await all(db,'SELECT DISTINCT player_id FROM presence WHERE seen_at>=?',Date.now()-TTL);
 return new Set(rows.map(r=>r.player_id));
}
async function isOnline(db,id){
 return !!(await first(db,'SELECT 1 AS yes FROM presence WHERE player_id=? AND seen_at>=? LIMIT 1',id,Date.now()-TTL));
}
async function playerLogin(db,id){
 const player=known.get(id);
 if(!player||player.hero===null)error('Aluno ou grupo não cadastrado.',404);
 const token=newToken(),hash=await sha256(token),expiry=Date.now()+30*86400000;
 await db.batch([
  db.prepare('INSERT INTO sessions(hash,player_id,expires_at) VALUES(?,?,?)').bind(hash,id,expiry),
  db.prepare('INSERT INTO presence(session_hash,player_id,seen_at) VALUES(?,?,?)').bind(hash,id,Date.now())
 ]);
 return {player,token,expiresInDays:30};
}
const getMatch=(db,id)=>first(db,'SELECT * FROM matches WHERE id=?',id);
async function publicMatch(db,row,includeMoves=false){
 const creator=known.get(row.creator_id),recipient=known.get(row.recipient_id);
 if(!creator||!recipient)error('Partida inconsistente.',500);
 const response={
  id:row.id,seasonId:row.season_id,creator,recipient,
  whiteHero:row.white_hero,blackHero:row.black_hero,status:row.status,
  turn:row.turn,ply:row.ply,version:row.version,board:JSON.parse(row.board_json),
  outcome:row.result?{result:row.result,reason:row.reason}:null,
  createdAt:row.created_at,updatedAt:row.updated_at,finishedAt:row.finished_at
 };
 if(includeMoves){
  const moves=await all(db,'SELECT ply,player_id,path_json,captures_json,crowned,played_at FROM moves WHERE match_id=? ORDER BY ply',row.id);
  response.moves=moves.map(m=>({
   ply:m.ply,playerId:m.player_id,path:JSON.parse(m.path_json),
   captures:JSON.parse(m.captures_json),crowned:!!m.crowned,playedAt:m.played_at
  }));
 }
 return response;
}
async function ownMatch(db,id,player){
 const row=await getMatch(db,id);
 if(!row||(row.creator_id!==player.id&&row.recipient_id!==player.id))
  error('Partida não encontrada.',404);
 return row;
}
async function inbox(db,player){
 const rows=await all(db,
  'SELECT * FROM matches WHERE creator_id=? OR recipient_id=? ORDER BY created_at DESC LIMIT 120',
  player.id,player.id);
 return Promise.all(rows.map(row=>publicMatch(db,row)));
}
async function ranking(db){
 const active=await season(db);
 const completed=await all(db,
  "SELECT creator_id,recipient_id,result FROM matches WHERE season_id=? AND status='CONCLUIDO' AND result IN ('white','black','draw')",
  active.id);
 const playerRows=new Map(players.map(p=>[p.id,{...p,plays:0,wins:0,draws:0,losses:0,points:0}]));
 const groupRows=new Map(Object.keys(groupHero).map(g=>[g,{
  name:g,hero:groupHero[g],members:players.filter(p=>p.team===g).length,
  plays:0,wins:0,draws:0,losses:0,points:0
 }]));
 for(const m of completed){
  const c=known.get(m.creator_id),r=known.get(m.recipient_id);
  if(!c||!r)continue;
  for(const [p,side] of [[c,'white'],[r,'black']]){
   const row=playerRows.get(p.id),win=m.result===side,draw=m.result==='draw';
   row.plays++;row.wins+=Number(win);row.draws+=Number(draw);
   row.losses+=Number(!win&&!draw);row.points+=win?3:draw?1:0;
  }
  // Colegas do mesmo grupo pontuam individualmente, mas não geram
  // pontos coletivos contra a própria equipe.
  if(c.team===r.team)continue;
  for(const [p,side] of [[c,'white'],[r,'black']]){
   const row=groupRows.get(p.team);
   if(!row)continue;
   const win=m.result===side,draw=m.result==='draw';
   row.plays++;row.wins+=Number(win);row.draws+=Number(draw);
   row.losses+=Number(!win&&!draw);row.points+=win?3:draw?1:0;
  }
 }
 const order=(a,b)=>b.points-a.points||b.wins-a.wins||a.losses-b.losses||a.name.localeCompare(b.name,'pt-BR');
 return {season:active,games:completed.length,
  players:[...playerRows.values()].filter(p=>p.plays>0).sort(order),
  groups:[...groupRows.values()].sort(order)};
}
function validPath(path){
 return Array.isArray(path)&&path.length>=2&&path.length<=14&&path.every(p=>
  p&&Number.isInteger(p.r)&&Number.isInteger(p.c)&&p.r>=0&&p.r<8&&p.c>=0&&p.c<8);
}
async function challenge(db,player,data){
 const recipient=known.get(normalize(data.to));
 if(!recipient||recipient.id===player.id||recipient.hero===null)error('Adversário inválido.');
 if(recipient.house!==player.house&&!(await isOnline(db,recipient.id)))
  error('Evento entre turmas: o adversário precisa estar online agora.',409);
 const active=await season(db);
 const existing=await first(db,
  "SELECT * FROM matches WHERE season_id=? AND creator_id=? AND recipient_id=? AND status IN ('PENDENTE','EM_ANDAMENTO') ORDER BY created_at DESC LIMIT 1",
  active.id,player.id,recipient.id);
 if(existing)return {match:await publicMatch(db,existing),reused:true};
 const board=initialBoard(player.hero,recipient.hero),id=uid(),at=now();
 const repetitions={[boardSignature(board,'white')]:1};
 // O índice único impede dois convites simultâneos iguais.
 await run(db,"INSERT OR IGNORE INTO matches(id,season_id,creator_id,recipient_id,white_hero,black_hero,status,board_json,turn,ply,version,repetitions_json,created_at,updated_at,no_capture) VALUES(?,?,?,?,?,?,'PENDENTE',?,'white',0,0,?,?,?,0)",
  id,active.id,player.id,recipient.id,player.hero,recipient.hero,
  JSON.stringify(board),JSON.stringify(repetitions),at,at);
 const created=await getMatch(db,id)||await first(db,
  "SELECT * FROM matches WHERE season_id=? AND creator_id=? AND recipient_id=? AND status IN ('PENDENTE','EM_ANDAMENTO') ORDER BY created_at DESC LIMIT 1",
  active.id,player.id,recipient.id);
 return {match:await publicMatch(db,created),reused:created.id!==id};
}
async function answer(db,player,data){
 const m=await getMatch(db,normalize(data.id));
 if(!m||m.recipient_id!==player.id)error('Convite não encontrado.',404);
 if(m.status!=='PENDENTE')error('Este convite já foi respondido.',409);
 if(!['accept','decline'].includes(data.decision))error('Resposta inválida.');
 if(data.decision==='accept'&&known.get(m.creator_id).house!==player.house&&!(await isOnline(db,m.creator_id)))
  error('Evento entre turmas: os dois alunos precisam estar online ao aceitar.',409);
 const newStatus=data.decision==='accept'?'EM_ANDAMENTO':'RECUSADO';
 const update=await run(db,
  "UPDATE matches SET status=?,updated_at=?,version=version+1 WHERE id=? AND recipient_id=? AND status='PENDENTE'",
  newStatus,now(),m.id,player.id);
 if(update.meta?.changes!==1)error('O convite já foi respondido em outra sessão.',409);
 return {match:await publicMatch(db,await getMatch(db,m.id))};
}
async function move(db,player,data){
 const m=await ownMatch(db,normalize(data.id),player);
 if(m.status!=='EM_ANDAMENTO')error('A partida não está ativa ou já terminou.',409);
 if(m.version!==data.expectedVersion)error('O tabuleiro mudou. Atualize a partida antes de jogar.',409);
 const side=m.creator_id===player.id?'white':'black';
 if(m.turn!==side)error('Aguarde a jogada do outro aluno.',409);
 if(!validPath(data.path))error('Trajetória inválida.',400);
 const board=JSON.parse(m.board_json),possible=legalMoves(board,m.turn);
 const sig=path=>path.map(x=>x.r+','+x.c).join('>');
 const wanted=possible.find(x=>sig(x.path)===sig(data.path));
 if(!wanted)error('Jogada ilegal: confira a captura obrigatória e a sequência.',409);
 const piece=board[wanted.from.r][wanted.from.c];
 const next=applyMove(board,m.turn,wanted);
 const crowned=!piece.king&&!!next[wanted.to.r][wanted.to.c]?.king;
 const nextTurn=opposite(m.turn),ply=m.ply+1,at=now();
 const repetitions=JSON.parse(m.repetitions_json);
 const signature=boardSignature(next,nextTurn);
 repetitions[signature]=(repetitions[signature]||0)+1;
 const noCapture=wanted.captures.length||crowned?0:m.no_capture+1;
 let result=null,reason=null;
 if(!legalMoves(next,nextTurn).length){result=m.turn;reason='O adversário ficou sem movimentos legais.';}
 else if(repetitions[signature]>=5){result='draw';reason='A posição foi repetida cinco vezes.';}
 else if(noCapture>=80){result='draw';reason='80 meios-lances sem captura ou promoção.';}
 else if(ply>=300){result='draw';reason='Limite de segurança de 300 meios-lances.';}
 // Batch é uma transação D1: se duas sessões tentarem gravar o mesmo
 // ply, a chave primária em moves aborta e reverte toda a operação.
 // O WHERE version impede sobrescrita silenciosa de um tabuleiro novo.
 try{
  const records=await db.batch([
   db.prepare("UPDATE matches SET board_json=?,turn=?,ply=?,version=version+1,repetitions_json=?,no_capture=?,result=?,reason=?,status=?,updated_at=?,finished_at=? WHERE id=? AND version=? AND turn=? AND status='EM_ANDAMENTO'")
    .bind(JSON.stringify(next),nextTurn,ply,JSON.stringify(repetitions),noCapture,
      result,reason,result?'CONCLUIDO':'EM_ANDAMENTO',at,result?at:null,m.id,m.version,m.turn),
   db.prepare('INSERT INTO moves(match_id,ply,player_id,path_json,captures_json,crowned,played_at) VALUES(?,?,?,?,?,?,?)')
    .bind(m.id,ply,player.id,JSON.stringify(wanted.path),JSON.stringify(wanted.captures),Number(crowned),at)
  ]);
  if(records[0].meta?.changes!==1)error('Partida mudou enquanto você jogava. Atualize o tabuleiro.',409);
 }catch(e){
  if(e.status)throw e;
  // Constraint na segunda operação protege contra corridas entre jogadores.
  console.warn('Conflito ao registrar movimento:',String(e?.message||e));
  error('O tabuleiro foi atualizado em outro dispositivo. Atualize a partida.',409);
 }
 return {match:await publicMatch(db,await getMatch(db,m.id),true)};
}
async function teacherLogin(req,env,data){
 const configured=normalize(env.DAMA_TEACHER_PASSWORD_SHA256).toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(configured))
  error('Senha do professor não configurada no Cloudflare.',503);
 const ip=normalize(req.headers.get('CF-Connecting-IP'))||'anonymous';
 const ipHash=await sha256(ip+':'+configured);
 const old=await first(env.DB,'SELECT failures,locked_until FROM teacher_attempts WHERE ip_hash=?',ipHash);
 if(old?.locked_until>Date.now())error('Muitas tentativas. Tente novamente em 15 minutos.',429);
 const candidate=await sha256(data.password||'');
 // Comparação sem retornar na primeira diferença.
 let delta=0;
 for(let i=0;i<64;i++)delta|=candidate.charCodeAt(i)^configured.charCodeAt(i);
 if(delta!==0){
  const n=(old?.failures||0)+1,locked=n>=5?Date.now()+900000:0;
  await run(env.DB,'INSERT INTO teacher_attempts(ip_hash,failures,locked_until) VALUES(?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until',
   ipHash,n>=5?0:n,locked);
  error('Senha inválida.',401);
 }
 await run(env.DB,'DELETE FROM teacher_attempts WHERE ip_hash=?',ipHash);
 const token=newToken(),tokenHash=await sha256(token);
 await run(env.DB,'INSERT INTO admin_sessions(token_hash,expires_at) VALUES(?,?)',tokenHash,Date.now()+1800000);
 return {token,expiresInSeconds:1800};
}
async function teacherAuth(req,db){
 const raw=normalize(req.headers.get('X-ClassMana-Teacher'));
 if(!/^[a-f0-9]{64}$/.test(raw))error('Acesso exclusivo do professor.',401);
 const row=await first(db,'SELECT expires_at FROM admin_sessions WHERE token_hash=?',await sha256(raw));
 if(!row||row.expires_at<=Date.now())error('Sessão do professor expirada.',401);
}
async function teacherRoute(req,env,action,data){
 const db=env.DB;
 if(action==='teacherLogin')return teacherLogin(req,env,data);
 await teacherAuth(req,db);
 const active=await season(db);
 if(action==='teacherStatus'){
  const rows=await all(db,'SELECT id,label,started_at AS startedAt,active FROM seasons ORDER BY started_at DESC');
  return {seasons:rows,activeSeason:active,students:players.length};
 }
 if(action==='teacherRanking')return ranking(db);
 if(action==='teacherNewSeason'){
  if(data.confirmation!=='NOVA TEMPORADA')error('Confirme digitando NOVA TEMPORADA.',400);
  const label=normalize(data.label);
  if(label.length<3||label.length>70)error('Nome da temporada deve ter 3 a 70 caracteres.');
  const count=await first(db,
   "SELECT COUNT(*) AS n FROM matches WHERE season_id=? AND status IN ('PENDENTE','EM_ANDAMENTO')",
   active.id);
  if(count.n>0)error('Existem desafios ou partidas em aberto. Conclua antes de iniciar outra temporada.',409);
  const id=uid(),at=now();
  await db.batch([
   db.prepare('UPDATE seasons SET active=0 WHERE id=?').bind(active.id),
   db.prepare('INSERT INTO seasons(id,label,started_at,active) VALUES(?,?,?,1)').bind(id,label,at),
   db.prepare('INSERT INTO admin_audit(id,event,detail,at) VALUES(?,?,?,?)')
    .bind(uid(),'new-season',JSON.stringify({old:active.id,new:id,label}),at)
  ]);
  return {season:{id,label},previousSeasonId:active.id,historyPreserved:true};
 }
 error('Ação administrativa não encontrada.',404);
}
async function route(req,env,action,data,query){
 const db=env.DB;
 if(action==='ping'){
  const schema=await first(db,'SELECT name FROM sqlite_master WHERE type=? AND name=?','table','matches');
  if(!schema)error('Migração D1 ainda não aplicada.',503);
  return {api:'dama-v2',game:'dama',persistent:true,database:'cloudflare-d1',provider:'cloudflare'};
 }
 if(action==='roster')return {players};
 if(action==='ranking')return ranking(db);
 if(action==='identify')return playerLogin(db,normalize(data.id));
 const auth=await requireStudent(req,db),player=auth.player;
 if(action==='me')return {player};
 if(action==='heartbeat'){await touch(db,auth);return {online:true,ttlSeconds:Math.ceil(TTL/1000)};}
 if(action==='presence')return {onlinePlayerIds:[...await onlineIds(db)],ttlSeconds:Math.ceil(TTL/1000)};
 if(action==='inbox')return {matches:await inbox(db,player)};
 if(action==='match'){
  return {match:await publicMatch(db,await ownMatch(db,normalize(query.get('id')),player),true)};
 }
 if(action==='sync'){
  // Uma única requisição devolve presença, sininho e tabuleiro ativo.
  // Diminui o volume de chamadas do plano Workers Free.
  await touch(db,auth);
  const matches=await inbox(db,player),present=[...await onlineIds(db)];
  const id=normalize(query.get('matchId'));
  let current=null;
  if(id)current=await publicMatch(db,await ownMatch(db,id,player),true);
  const includeRanking=query.get('ranking')==='1';
  return {matches,onlinePlayerIds:present,match:current,
   ...(includeRanking?{ranking:await ranking(db)}:{})};
 }
 if(action==='challenge')return challenge(db,player,data);
 if(action==='answer')return answer(db,player,data);
 if(action==='move')return move(db,player,data);
 error('Ação desconhecida.',404);
}
function cors(req,env){
 const origin=normalize(req.headers.get('Origin'));
 if(!origin)return {allowed:true,headers:{}};
 const own=new URL(req.url).origin;
 const configured=String(env.DAMA_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 const allowed=origin===own||configured.includes(origin);
 return {allowed,headers:allowed?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}};
}
const apiHeaders={
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff',
 'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
 'Access-Control-Allow-Headers':'Content-Type, Authorization, X-ClassMana-Teacher'
};
function respond(payload,status,headers){
 return new Response(JSON.stringify(payload),{status,headers:{...apiHeaders,...headers}});
}
async function handler(req,env){
 const check=cors(req,env);
 if(!check.allowed)return respond({ok:false,error:'Origem não autorizada.'},403,{});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...apiHeaders,...check.headers}});
 if(req.method!=='GET'&&req.method!=='POST')
  return respond({ok:false,error:'Método não aceito.'},405,check.headers);
 const url=new URL(req.url),action=url.searchParams.get('action')||'';
 const teacher=['teacherLogin','teacherStatus','teacherRanking','teacherNewSeason'];
 const readOnly=['ping','roster','ranking','me','presence','inbox','match','sync','teacherStatus','teacherRanking'];
 const writeOnly=['identify','heartbeat','challenge','answer','move','teacherLogin','teacherNewSeason'];
 if(req.method==='GET'&&!readOnly.includes(action)||req.method==='POST'&&!writeOnly.includes(action))
  return respond({ok:false,error:'Operação inválida.'},405,check.headers);
 try{
  let data={};
  if(req.method==='POST'){
   const size=Number(req.headers.get('Content-Length')||0);
   if(size>24000)error('Pedido muito grande.',413);
   const raw=await req.text();
   if(raw.length>24000)error('Pedido muito grande.',413);
   try{data=raw?JSON.parse(raw):{}}catch{error('JSON inválido.',400)}
   if(!data||typeof data!=='object'||Array.isArray(data))error('Pedido inválido.',400);
  }
  let result;
  if(teacher.includes(action))result=await teacherRoute(req,env,action,data);
  else if(req.method==='POST'&&!['identify','heartbeat'].includes(action)){
   const auth=await requireStudent(req,env.DB);
   const requestId=normalize(data.requestId);
   if(!/^[a-zA-Z0-9_-]{12,128}$/.test(requestId))error('Identificador de requisição inválido.');
   const previous=await first(env.DB,
    'SELECT response_json FROM operations WHERE player_id=? AND request_id=?',
    auth.player.id,requestId);
   if(previous)return respond(JSON.parse(previous.response_json),200,check.headers);
   result=await route(req,env,action,data,url.searchParams);
   const payload={ok:true,...result};
   await run(env.DB,'INSERT OR IGNORE INTO operations(player_id,request_id,response_json) VALUES(?,?,?)',
    auth.player.id,requestId,JSON.stringify(payload));
   return respond(payload,200,check.headers);
  }else result=await route(req,env,action,data,url.searchParams);
  return respond({ok:true,...result},200,check.headers);
 }catch(e){
  if(!e.status)console.error('ClassDamas Worker erro:',String(e?.message||e));
  const message=e.status?e.message:'Erro interno da API Cloudflare.';
  return respond({ok:false,error:message},e.status||500,check.headers);
 }
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api')return handler(request,env);
  if(url.pathname.startsWith('/api/'))return respond({ok:false,error:'Rota API não encontrada.'},404,{});
  if(!env.ASSETS)return new Response('Arquivos estáticos não configurados.',{status:503});
  return env.ASSETS.fetch(request);
 }
};
