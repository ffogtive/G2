// Bible v2 pile curve: B(n)=P-(P-12)e^{-n/12}; edge boards 12-16; continuous P0; L1-2 chin tutorial
import { levelSpec, slotOf } from '/home/user/G2/mockup/src/levels.js';
function mulberry32(seed){let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const CAP=+(process.env.CAP||60), PLAT=+(process.env.PLAT||40), START=12, TAU=12;
export const B=(n)=>PLAT-(PLAT-START)*Math.exp(-n/TAU);
const TUT=[8,10,8,0,14,20,16,10,0,26]; const TUT_STAKE={4:6,9:8};
const INTRO={1:'퍽+턱',3:'눈높이(말린 맨 위)',4:'라이벌',8:'황금',11:'푸어억+숨 풍선',16:'쓸기 박자*',18:'★칸',21:'책상 끝+책상 밑',31:'세 겹 딱지',35:'HARD',41:'눌린 더미',51:'유리 책상',59:'SUPER HARD'};
const P0=(N)=>Math.round(2.2+N/10);
export function v2(n){
  const rng=mulberry32(0x5bd1e995^Math.imul(n,2654435761)); const s=slotOf(n); const role=s.role; let type='flip'; const d=Math.floor(n/10);
  if(n%50===0) type='finale';
  else if(role==='rival'||role==='boss') type=n>=4?'duel':'flip';
  else if(role==='precision') type=n<18?'golden':n<21?'goldenSide':['golden','goldenSide','edge'][d%3];
  else if(role==='applied'&&n>21&&d%3!==2&&rng()<0.3) type='edge';
  if(n===21) type='edge'; if(n===8) type='golden'; if(n===18) type='goldenSide';
  const noise=(rng()-0.5)*6; let N, stake=null;
  if(type==='duel'){const k=(role==='boss')?0.575:0.5; stake=n<=10?TUT_STAKE[n]:Math.round(clamp(k*B(n)+noise/3,5,CAP/2)); N=2*stake;}
  else if(type==='finale') N=CAP;
  else if(type==='edge') N=Math.round(clamp(14+noise*2/3,12,16));
  else if(n<=10) N=TUT[n-1];
  else { const M={new:0.85,relief:1.25,reward:1.25,precision:0.7}[role]??1.0; N=Math.round(clamp(B(n)*M+noise,4,CAP)); if(n===11) N=Math.max(N,40); if(n===16) N=Math.max(N,36); }
  const hard=(s.tier==='hard'||s.tier==='superhard')?1:0;
  const P=type==='duel'?null:type==='finale'?P0(N)+1:Math.max(2,P0(N)-hard);
  return {n,role,tier:s.tier,type,N,stake,P,intro:INTRO[n]||''};
}
const ab={flip:'',duel:'d',golden:'g',goldenSide:'gs',edge:'e',finale:'F'};
if(process.argv[2]==='grid'){
  for(let r=0;r<6;r++){const cells=[];for(let c=1;c<=10;c++){const n=r*10+c,v=v2(n),o=levelSpec(n);const t=(v.type==='flip'&&v.tier==='hard')?'H':(v.type==='flip'&&v.tier==='superhard')?'S':ab[v.type];cells.push(`${v.N}${t}·${v.P??'8차례'} (${o.N})`);} console.log(`| L${r*10+1}~${r*10+10} | ${cells.join(' | ')} |`);}
}
if(process.argv[2]==='stats'){
  for(const [a,b] of [[1,10],[11,20],[21,30],[31,60],[61,1000],[1001,10000]]){let so=0,sn=0,mx=0,mn=99,c=0,mo=0;const by={};for(let n=a;n<=b;n++){const o=levelSpec(n),v=v2(n);so+=o.N;sn+=v.N;mx=Math.max(mx,v.N);mn=Math.min(mn,v.N);c++;mo=Math.max(mo,o.N);(by[v.type]??=[]).push(v.N);}
  console.log(`L${a}-${b}: old ${(so/c).toFixed(1)} (max ${mo}) | v2 ${(sn/c).toFixed(1)} [${mn}~${mx}] | ${Object.entries(by).map(([k,a])=>k+' '+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(0)).join(', ')}`);}
  console.log('B:',[1,5,10,13,20,30,40,60,100].map(n=>`${n}:${B(n).toFixed(1)}`).join(' '));
  let e=0,ee=0;for(let n=2;n<=10000;n++){if(v2(n).type==='edge'){e++;if(v2(n-1).type==='edge')ee++;}} console.log('edge share',(e/9999).toFixed(3),'consecutive',ee);
}
