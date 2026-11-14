/**
 * Dama ClassMana — núcleo determinístico de regras brasileiras (tabuleiro 8x8).
 * Sem DOM, rede, dependências e sem dados de estudantes.
 * O núcleo poderá ser usado no backend para validar jogadas oficiais.
 */
const SIZE = 8;
const SIDES = Object.freeze({ WHITE: 'white', BLACK: 'black' });
const DIAGONALS = [[-1,-1],[-1,1],[1,-1],[1,1]];

const inside = (r,c) => r>=0 && r<SIZE && c>=0 && c<SIZE;
const isDark = (r,c) => (r+c)%2===1;
const opposite = side => side===SIDES.WHITE ? SIDES.BLACK : SIDES.WHITE;
const copyBoard = board => board.map(row => row.map(p => p ? {...p, king:!!p.king} : null));
const keyOf = (r,c) => `${r},${c}`;
const copyPoint = p => ({r:p.r,c:p.c});

function initialBoard(whiteHero=0, blackHero=1) {
  // Um conjunto completo de 12 peças do mesmo personagem por jogador.
  const board = Array.from({length:SIZE},()=>Array(SIZE).fill(null));
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) {
    if(!isDark(r,c)) continue;
    if(r<=2) board[r][c]={side:SIDES.BLACK,king:false,hero:blackHero};
    if(r>=5) board[r][c]={side:SIDES.WHITE,king:false,hero:whiteHero};
  }
  return board;
}

function targets(board, r, c, captured) {
  const p=board[r][c];
  if(!p) return [];
  const results=[];
  for(const [dr,dc] of DIAGONALS) {
    if(!p.king) {
      const mr=r+dr, mc=c+dc, nr=r+2*dr, nc=c+2*dc;
      if(!inside(nr,nc) || !inside(mr,mc)) continue;
      const victim=board[mr][mc];
      if(victim && victim.side!==p.side && !captured.has(keyOf(mr,mc)) && !board[nr][nc]) {
        results.push({to:{r:nr,c:nc}, taken:{r:mr,c:mc}});
      }
      continue;
    }
    // Dama voadora: uma única peça adversária na trajetória e pouso
    // em qualquer casa vazia posterior. Peças já capturadas bloqueiam
    // a trajetória até o fim da sequência, como nas regras brasileiras.
    let rr=r+dr, cc=c+dc;
    while(inside(rr,cc) && !board[rr][cc]) {rr+=dr;cc+=dc;}
    if(!inside(rr,cc)) continue;
    const victim=board[rr][cc];
    if(!victim || victim.side===p.side || captured.has(keyOf(rr,cc))) continue;
    const taken={r:rr,c:cc};
    rr+=dr; cc+=dc;
    while(inside(rr,cc) && !board[rr][cc]) {
      results.push({to:{r:rr,c:cc},taken});
      rr+=dr;cc+=dc;
    }
  }
  return results;
}

function capturePaths(board, from) {
  const p=board[from.r][from.c];
  if(!p) return [];
  const results=[];
  const dfs=(b,at,path,captures,marked)=>{
    const options=targets(b,at.r,at.c,marked);
    if(!options.length) {
      if(captures.length) results.push({from:copyPoint(from),to:copyPoint(at),path:path.map(copyPoint),captures:captures.map(copyPoint)});
      return;
    }
    for(const {to,taken} of options) {
      const next=copyBoard(b);
      next[at.r][at.c]=null;
      next[to.r][to.c]={...p};
      // A peça capturada permanece fisicamente até acabar a sequência.
      const nextMarked=new Set(marked);
      nextMarked.add(keyOf(taken.r,taken.c));
      dfs(next,to,[...path,to],[...captures,taken],nextMarked);
    }
  };
  dfs(board,from,[from],[],new Set());
  return results;
}

function quietMoves(board,from) {
  const p=board[from.r][from.c], moves=[];
  if(!p) return moves;
  const dirs=p.king ? DIAGONALS : (p.side===SIDES.WHITE ? DIAGONALS.slice(0,2):DIAGONALS.slice(2,4));
  for(const [dr,dc] of dirs) {
    let r=from.r+dr,c=from.c+dc;
    while(inside(r,c) && !board[r][c]) {
      const to={r,c};
      moves.push({from:copyPoint(from),to,path:[copyPoint(from),to],captures:[]});
      if(!p.king) break;
      r+=dr;c+=dc;
    }
  }
  return moves;
}

/** Apenas lances completos legais, respeitando a captura obrigatória e a Lei da Maioria. */
function legalMoves(board, side) {
  const captures=[], quiet=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) {
    if(board[r][c]?.side!==side) continue;
    const pos={r,c};
    captures.push(...capturePaths(board,pos));
    quiet.push(...quietMoves(board,pos));
  }
  if(captures.length) {
    const max=Math.max(...captures.map(m=>m.captures.length));
    return captures.filter(m=>m.captures.length===max);
  }
  return quiet;
}

function serializeMove(m) {
  return m.path.map(p=>keyOf(p.r,p.c)).join('>')+'|'+m.captures.map(p=>keyOf(p.r,p.c)).join(';');
}

/** Valida novamente o lance recebido, antes de alterar o estado. */
function applyMove(board,side,move) {
  const valid=legalMoves(board,side).find(m=>serializeMove(m)===serializeMove(move));
  if(!valid) throw new Error('Jogada inválida: respeite a captura obrigatória e a Lei da Maioria.');
  const next=copyBoard(board);
  const piece=next[valid.from.r][valid.from.c];
  next[valid.from.r][valid.from.c]=null;
  for(const at of valid.captures) next[at.r][at.c]=null;
  const final={...piece};
  if(!piece.king && ((piece.side===SIDES.WHITE && valid.to.r===0)||(piece.side===SIDES.BLACK && valid.to.r===7))) final.king=true;
  next[valid.to.r][valid.to.c]=final;
  return next;
}

const boardSignature=(b,side)=>side+':'+b.map(row=>row.map(p=>p ? (p.side==='white'?'W':'B')+(p.king?'K':'m') : '--').join('')).join('/');

class LocalMatch {
  constructor() {this.reset();}
  reset(whiteHero=0, blackHero=1) {
    if(!Number.isInteger(whiteHero)||!Number.isInteger(blackHero)||whiteHero===blackHero||whiteHero<0||blackHero<0||whiteHero>5||blackHero>5) throw new Error('Selecione duas equipes de personagens diferentes.');
    this.teams={white:whiteHero,black:blackHero};
    this.board=initialBoard(whiteHero,blackHero); this.turn=SIDES.WHITE; this.ply=0; this.outcome=null;
    this.moves=[]; this.history=[]; this.positions=new Map();
    this.positions.set(boardSignature(this.board,this.turn),1);
  }
  possible() {return this.outcome ? [] : legalMoves(this.board,this.turn);}
  play(move) {
    if(this.outcome) throw new Error('A partida já foi encerrada.');
    const valid=this.possible().find(m=>serializeMove(m)===serializeMove(move));
    if(!valid) throw new Error('Jogada inválida.');
    this.history.push({board:copyBoard(this.board),turn:this.turn,ply:this.ply,outcome:this.outcome,moves:this.moves.slice(),positions:new Map(this.positions)});
    const crowned = !this.board[valid.from.r][valid.from.c].king && ((this.turn==='white'&&valid.to.r===0)||(this.turn==='black'&&valid.to.r===7));
    this.board=applyMove(this.board,this.turn,valid);
    this.moves.push({side:this.turn,move:valid,crowned});
    this.turn=opposite(this.turn);this.ply++;
    const signature=boardSignature(this.board,this.turn);
    const count=(this.positions.get(signature)||0)+1;
    this.positions.set(signature,count);
    if(!legalMoves(this.board,this.turn).length) this.outcome={type:'win',winner:opposite(this.turn),reason:'captura total ou bloqueio das jogadas'};
    else if(count>=5) this.outcome={type:'draw',reason:'posição repetida cinco vezes'};
    else if(this.ply>=300) this.outcome={type:'draw',reason:'limite de 300 meios-lances do protótipo'};
    return {move:valid,outcome:this.outcome};
  }
  undo() {
    if(!this.history.length) return false;
    const h=this.history.pop();
    this.board=h.board;this.turn=h.turn;this.ply=h.ply;this.outcome=h.outcome;
    this.moves=h.moves;this.positions=h.positions;
    return true;
  }
}
