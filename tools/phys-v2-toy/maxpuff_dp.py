# Reviewer variant of v2sys/lungdp.py: adds a MAX PUFF option (yield fit to physics-v2 toy chin j20 column,
# with a whole-pile-slide penalty below ~33 discs from research slide threshold 0.0092*N N vs J_max 0.30 N).
# Question: with systems-doc puff cost (<=1.2) is max-puff-only dominant? with physics-doc cost (~5.1)?
import math, sys
from functools import lru_cache
def puff(n): return min(n, 6.5*(1-math.exp(-n/9)))
def maxpuff(n): return max(0.0, min(n, 10.8*(1-math.exp(-n/12)) - max(0.0,(33-n)*0.35)))
def long_sweep(n,t):
    eff = min(1.0, 0.55+0.9*(t-0.2)) if t>=0.2 else 0
    base = 11.5*(1-math.exp(-n/22))*eff
    gust = max(0.0,(14-n)*0.35)*(t/0.5)
    return max(0.0, min(n, base-gust))
CAP=10.0; REC=float(sys.argv[1]); CM=float(sys.argv[2]); CP=float(sys.argv[3]) if len(sys.argv)>3 else 1.0
DRAIN=12.0; DUR=[0.3,0.5,0.7]
def options(n, st, pol):
    o=[]
    if 'p' in pol: o.append(('P',puff(n),CP))
    if 'm' in pol and st>=CM: o.append(('M',maxpuff(n),CM))
    if 'l' in pol:
        for t in DUR:
            if st>=DRAIN*t: o.append((f'L{t}',long_sweep(n,t),DRAIN*t))
    if not o: o.append(('P',puff(n),CP))
    return o
@lru_cache(None)
def V(n,k,s,pol):
    if k==0 or n<=0: return 0.0
    st=s/2; best=0
    for name,y,c in options(n,st,pol):
        ns=min(CAP,st-c+REC)
        if ns<0: continue
        lo=math.floor(y); p=y-lo; v=0
        for yy,pr in ((lo,1-p),(lo+1,p)):
            if pr: v+=pr*(yy+V(max(0,n-yy),k-1,int(round(ns*2)),pol))
        best=max(best,v)
    return best
def trace(n,k,pol):
    st=CAP; seq=[]
    while k>0 and n>0:
        def q(o):
            name,y,c=o; ns=min(CAP,st-c+REC); lo=math.floor(y); p=y-lo
            return sum(pr*(yy+V(max(0,n-yy),k-1,int(round(ns*2)),pol)) for yy,pr in ((lo,1-p),(lo+1,p)) if pr)
        o=max(options(n,st,pol),key=q); seq.append(f'{n}:{o[0]}'); n-=round(o[1]); st=min(CAP,st-o[2]+REC); k-=1
    return ' '.join(seq)
print(f'REC {REC} maxpuff cost {CM} puff cost {CP}')
for N,P in [(31,6),(46,6),(58,7)]:
    r={pol:V(N,P,20,pol) for pol in ('p','pl','pm','pml')}
    print(f' N{N} P{P}: puff {r["p"]:.1f} | puff+long {r["pl"]:.1f} | puff+MAX {r["pm"]:.1f} | all {r["pml"]:.1f} | all-trace {trace(N,P,"pml")}')
