/** Inteligência artificial local de treino: não usa aluno real nem altera o ranking. */
import {legalMoves,applyMove,opposite} from './regras.js';
const score=(board,side)=>{
 let n=0;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const p=board[r][c];if(!p)continue;
  const forward=p.side==='black'?r:7-r;
  const value=p.king?310:100+forward*3;
  const center=3.5-Math.abs(c-3.5);
  n+=(p.side===side?1:-1)*(value+center*2);
 }
 return n;
};
const ordering=m=>m.captures.length*90+(m.to.r===0||m.to.r===7?8:0);
function minimax(board,turn,depth,side,alpha,beta,ctx){
 ctx.nodes++;
 if(ctx.nodes>ctx.maxNodes||depth<=0)return score(board,side);
 const moves=legalMoves(board,turn);
 if(!moves.length)return turn===side?-100000-depth:100000+depth;
 const maximizing=turn===side;
 let best=maximizing?-Infinity:Infinity;
 for(const move of moves.sort((a,b)=>ordering(b)-ordering(a)).slice(0,ctx.maxWidth)){
  const next=applyMove(board,turn,move);
  const value=minimax(next,opposite(turn),depth-1,side,alpha,beta,ctx);
  best=maximizing?Math.max(best,value):Math.min(best,value);
  if(maximizing)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);
  if(beta<=alpha||ctx.nodes>ctx.maxNodes)break;
 }
 return best;
}
export function chooseBotMove(board,side='black',difficulty='medio'){
 const moves=legalMoves(board,side);
 if(!moves.length)return null;
 if(difficulty==='facil')return moves[Math.floor(Math.random()*moves.length)];
 const hard=difficulty==='dificil';
 const ctx={nodes:0,maxNodes:hard?6000:1100,maxWidth:hard?13:9};
 const depth=hard?3:2;
 let best=-Infinity,candidates=[];
 for(const move of moves.sort((a,b)=>ordering(b)-ordering(a)).slice(0,hard?25:18)){
  const next=applyMove(board,side,move);
  const value=minimax(next,opposite(side),depth,side,-Infinity,Infinity,ctx)
   +Math.random()*(hard?0.1:4);
  if(value>best+0.01){best=value;candidates=[move];}
  else if(Math.abs(value-best)<0.01)candidates.push(move);
 }
 return candidates[Math.floor(Math.random()*candidates.length)]||moves[0];
}
