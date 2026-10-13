import sys, itertools
from multiprocessing import Pool
sys.path.insert(0, '.')
from v2toy import stats
import os
SC = eval(os.environ.get('SC',"[('puff',9,0.0),('puff',12,0.0),('puff',15,0.0),('puff',20,0.0),('long',7,0.0),('long',7,0.04),('long',9,0.0),('long',9,0.04),('long',9,0.08),('long',12,0.04)]"))
POSES=os.environ.get('POSES','chin,eye').split(',')
def job(args):
    N, pose, (kind,jpk,sw), aim_k = args
    return (N,pose,kind,jpk,sw,aim_k) + stats(N,pose,kind,jpk,aim_k,sw,seeds=int(sys.argv[2]) if len(sys.argv)>2 else 30)
if __name__=='__main__':
    Ns=[int(x) for x in sys.argv[1].split(',')]
    tasks=[]
    for N in Ns:
        aims=sorted(set(a for a in [1,2,3,4,6,8,12,16,24,32,N] if a<=N))
        for pose in POSES:
            for sc in SC:
                for a in aims: tasks.append((N,pose,sc,a))
    with Pool(4) as p:
        res=p.map(job,tasks,chunksize=2)
    from collections import defaultdict
    d=defaultdict(list)
    for r in res: d[r[:5]].append(r)
    for key in sorted(d, key=lambda k:(k[0],k[1],k[2],k[3],k[4])):
        rows=sorted(d[key],key=lambda r:r[5])
        best=max(rows,key=lambda r:r[6])
        N,pose,kind,jpk,sw=key
        print(f"N={N:2d} {pose:4s} {kind:4s} j={jpk:2d} sw={sw:.2f} | best k={best[5]:2d} mean {best[6]:5.2f} zero {best[7]:.2f} out {best[8]:.2f} || "+' '.join(f"{r[5]}:{r[6]:.1f}" for r in rows), flush=True)
