# Toy DP with the bible's UNIFIED breath cost (cost = 2.0*V + 4.5*((q-0.8)+/0.2)^2, rec +3, cap 10,
# inhale capped by stamina, gasp(<1 left) => next turn no long breath). Yields: physics-v2 toy chin table
# remapped to K_breath j_max=14 (q -> j=14 q^2), plus small-pile slide penalty. TOY ON TOY: direction only.
import math, sys
from functools import lru_cache
NS=[5,10,20,40]
def interp(tab,n):
    if n<=0: return 0.0
    if n<5: return min(n, tab[0]*n/5)
    for i in range(3):
        a,b=NS[i],NS[i+1]
        if n<=b: return tab[i]+(tab[i+1]-tab[i])*(n-a)/(b-a)
    return tab[3]+(tab[3]-tab[2])/20*0.5*(n-40)
SW=float(sys.argv[1]) if len(sys.argv)>1 else 1.0   # sweep multiplier at N>=20 (B4 pass => 1.2)
REC=float(sys.argv[2]) if len(sys.argv)>2 else 3.0
CP=float(sys.argv[3]) if len(sys.argv)>3 else 4.5
def slide(n,q,mult=1.0): return 0.35*max(0.0,17.4*q*q-n)*mult
OPT={ # name: (yield table, q, kind, T)
 'mid':([1.9,2.6,2.9,3.0],0.7,'p',0), 'strong':([3.0,2.7,3.6,4.6],0.85,'p',0), 'MAX':([3.4,3.4,4.2,9.7],1.0,'p',0),
 'L1.6':([3.6,5.0,6.0,8.2],1.0,'l',0.6), 'L1.3':([2.7,3.75,4.5,6.15],1.0,'l',0.3),
 'L.8.6':([2.9,4.0,4.6,6.2],0.8,'l',0.6), 'L.8.3':([2.2,3.0,3.45,4.65],0.8,'l',0.3)}
def cost(q,kind,T):
    V=3.9*q*(0.085 if kind=='p' else T+0.04)
    return 2.0*V+CP*(max(0.0,q-0.8)/0.2)**2
def yld(name,n):
    tab,q,kind,T=OPT[name]; y=interp(tab,n)
    if kind=='l' and n>=20: y*=SW
    y-=slide(n,q,1.5 if kind=='l' else 1.0)
    return max(0.0,min(n,y))
@lru_cache(None)
def V(n,k,s2,gasp,pol):
    if k==0 or n<=0: return 0.0
    st=s2/2; best=0.0
    for name in pol.split(','):
        tab,q,kind,T=OPT[name]; c=cost(q,kind,T)
        if c>st+1e-9: continue
        if kind=='l' and gasp: continue
        y=yld(name,n); left=st-c; ng=left<1.0; ns=min(10.0,left+REC)
        lo=math.floor(y); p=y-lo; v=0.0
        for yy,pr in ((lo,1-p),(lo+1,p)):
            if pr>0: v+=pr*(yy+V(max(0,n-yy),k-1,int(round(ns*2)),ng,pol))
        best=max(best,v)
    return best
def trace(n,k,pol):
    st=10.0; g=False; seq=[]
    while k>0 and n>0:
        bestv=-1;bo=None
        for name in pol.split(','):
            tab,q,kind,T=OPT[name]; c=cost(q,kind,T)
            if c>st+1e-9 or (kind=='l' and g): continue
            y=yld(name,n); left=st-c; ns=min(10.0,left+REC); lo=math.floor(y); p=y-lo
            v=sum(pr*(yy+V(max(0,n-yy),k-1,int(round(ns*2)),left<1.0,pol)) for yy,pr in ((lo,1-p),(lo+1,p)) if pr>0)
            if v>bestv: bestv=v;bo=(name,y,c)
        seq.append(f'{n}:{bo[0]}'); n-=round(bo[1]); left=st-bo[2]; g=left<1.0; st=min(10.0,left+REC); k-=1
    return ' '.join(seq)
print(f'sweep x{SW} rec {REC} effort coef {CP}; costs:',{k:round(cost(v[1],v[2],v[3]),2) for k,v in OPT.items()})
P_PUFF='mid,strong'; P_MAX='mid,strong,MAX'; P_LONG='mid,strong,L1.6,L1.3,L.8.6,L.8.3'; ALL=P_MAX+',L1.6,L1.3,L.8.6,L.8.3'
for N,P in [(20,4),(30,5),(40,6),(46,7),(58,8)]:
    r={nm:V(N,P,20,False,pol) for nm,pol in (('puff',P_PUFF),('+max',P_MAX),('+long',P_LONG),('all',ALL))}
    print(f' N{N} P{P}: puff {r["puff"]:.1f} | +max {r["+max"]:.1f} | +long {r["+long"]:.1f} | all {r["all"]:.1f} | {trace(N,P,ALL)}')
