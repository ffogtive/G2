import math
g=9.81; R=0.025; t=0.0008; rb=750; m=math.pi*R*R*t*rb; W=m*g; p=0.0012
def run(k, surplus, rate, rh=0.0075, T=0.7, dt=2e-4, a_leak=0.25, delay=0.0):
    M=k*m; h=k*p; I=M*(1.25*R*R+h*h/3)
    F0=surplus*M*g/1.75          # force when jet centred on closed slit, lever 1.75R  => torque = surplus*M g R
    sig=rh/1.1774
    ys=[(-3+6*i/80)*sig for i in range(81)]; ws=[math.exp(-0.5*(y/sig)**2) for y in ys]; S=sum(ws); ws=[w/S for w in ws]
    a=0.0; w=0.0; tt=0.0; maxa=0.0
    for_norm=sum(wi for y,wi in zip(ys,ws) if -sig<=y<=sig)
    while tt<T:
        yc=rate*max(0.0,tt-delay)
        yrim=2*R*math.sin(a)
        c=1/(1+(a/a_leak)**2)
        tq=0.0
        for y,wi in zip(ys,ws):
            Y=yc+y
            if -sig<=Y<=yrim+sig:
                if a<1e-3: s_imp=1.75*R
                else: s_imp=min(2*R,max(0.3*R,max(Y,0.0)/math.sin(a)))
                lev=c*1.75*R+(1-c)*s_imp
                tq+=F0*wi/for_norm*lev
        tau=tq - M*g*(R*math.cos(a)-h/2*math.sin(a))
        w+=tau/I*dt; a+=w*dt
        if a<0: a=0; w=0
        tt+=dt; maxa=max(maxa,a)
        if a>=math.pi/2: return (True,tt,90)
    return (False,tt,math.degrees(maxa))
rates=(0.0,0.03,0.06,0.10,0.15,0.25,0.40)
print("columns: aim rise rate m/s ->",rates,"(deg/s at 8cm:",[round(math.degrees(math.atan(r/0.08))) for r in rates],")")
for k in (3,10,20):
    print("lid k=%d"%k)
    for s in (1.0,1.1,1.3,1.6,2.2):
        out=[]
        for r in rates:
            ok,tt,ma=run(k,s,r)
            out.append(("FLIP %.2fs"%tt) if ok else ("fail %2.0f°"%ma))
        print("  surplus x%.1f: %s"%(s,' | '.join(out)))
