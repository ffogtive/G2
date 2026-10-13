import math
rho=1.2; g=9.81
R=0.025; t=0.0008; rb=750.0; m=math.pi*R*R*t*rb; W=m*g; p=0.0012; A_d=math.pi*R*R
mu_desk=0.40
def jet(U0,A0,x):
    d0=math.sqrt(4*A0/math.pi); Uc=U0*min(1.0,5.8*d0/x); rh=max(0.5*d0,0.094*x)
    return dict(J=rho*U0*U0*A0, ps=0.5*rho*Uc*Uc, rh=rh)
B={'casual puff 12m/s':(12,1e-4,0.12,'puff'),'strong puff 30m/s':(30,1e-4,0.12,'puff'),'max puff 50m/s':(50,1e-4,0.10,'puff'),
   'long normal 15m/s 2cm2':(15,2e-4,0.7,'long'),'long strong 22m/s 2cm2':(22,2e-4,0.7,'long')}
IMP=0.93; QS=1/1.75   # force per lid weight needed (impulsive 0.12s / quasi-static tracked)
def k_open(J,eta,fac): return int(eta*J/(fac*W))                    # open/uniform gap: momentum-limited
def k_cav(ps,fac):                                                   # front-open sealed wedge: pressure-limited (C=0.4, front half area, centroid 1.4R)
    pc=0.4*ps; return int(pc*0.5*A_d*1.4/(W*R)*(QS/fac)*1.0/1.0*R/R/(1.75*QS)) if False else int(pc*0.5*A_d*1.4*R/(fac*1.75*W*R))
print("lid factor: puff needs %.2f*kW, tracked long needs %.2f*kW (lever 1.75R)"%(IMP,QS))
for x,label in ((0.05,'chin 5cm'),(0.08,'chin 8cm'),(0.15,'eye 15cm')):
    print("\n== %s =="%label)
    for name,(U,A,T,kind) in B.items():
        j=jet(U,A,x); fac = IMP if kind=='puff' else QS
        ko=[k_open(j['J'],e,fac) for e in (0.2,0.35)]
        kc=k_cav(j['ps'],fac)
        slide=[n for n in (1,5,10,20,40) if 0.5*j['J']>mu_desk*n*W]
        print("  %-24s J=%.3f ps=%4.0fPa  open-gap lid k<=%s  front-open wedge k<=%d  | whole pile slides (blast) for n in %s"%(name,j['J'],j['ps'],ko,kc,slide))
# under desk: overhang segment area
def seg(delta):
    return R*R*math.acos((R-delta)/R)-(R-delta)*math.sqrt(2*R*delta-delta*delta)
print("\n== under desk (mouth 5cm below top, 4cm in front -> theta~50deg, x~6.5cm) ==")
for delta in (0.003,0.005,0.010):
    a=seg(delta)
    for name,(U,A,T,kind) in B.items():
        j=jet(U,A,0.065); fac=(0.9 if kind=='puff' else 0.54)
        F=min(0.7*j['ps']*a, 0.8*j['J']*math.sin(math.radians(50)))   # stagnation on exposed underside, capped by momentum
        n=int(F/(fac*W))
        print("  overhang %2.0fmm (A=%.2fcm2) %-24s F_up=%.3fN -> whole pile n<=%d %s"%(delta*1e3,a*1e4,name,F,n,"(needs sweep)" if kind=='long' else ""))
