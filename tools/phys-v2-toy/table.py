import math
rho=1.2; g=9.81
R=0.025; t=0.0008; rb=750.0; m=math.pi*R*R*t*rb; W=m*g; p=0.0012
mu_pp=0.45; mu_desk=0.40   # assumed (paper/paper ~ tan 24deg; paper/desk)
def J(U,A): return rho*U*U*A
breaths={'casual puff':(12,1.0e-4,0.12,'puff'),'strong puff':(30,1.0e-4,0.12,'puff'),'strong wide puff':(30,1.8e-4,0.12,'puff'),'max puff':(50,1.0e-4,0.10,'puff'),
         'long normal':(15,2.0e-4,0.7,'long'),'long strong':(22,2.0e-4,0.7,'long')}
def Fimp_factor(k,T,lever):
    M=k*m; h=k*p; I=M*(1.25*R*R+h*h/3); dE=M*g*(math.sqrt(R*R+h*h/4)-h/2); wmin=math.sqrt(2*dE/I)
    return (I*wmin+M*g*R*T)/(lever*R*T)/(k*W)
def kmax(Fpos, T, mode, lever):
    # largest k with F >= threshold
    best=0
    for k in range(1,81):
        need = (k*W/lever) if mode=='qs' else Fimp_factor(k,T,lever)*k*W
        if Fpos>=need: best=k
    return best
# technique efficiencies (fraction of jet momentum flux J that becomes useful lifting force) -- ASSUMPTIONS
# chin: horizontal jet rams an inter-disc gap: eta_gap (low, mid, high)
eta_gap=(0.2,0.35,0.6)
# under-desk: jet hits exposed underside of overhanging bottom disc at elevation th: eta_u*sin(th)
eta_u=(0.4,0.6,0.8); th_u=math.radians(50)
# eye: jet descends at -40deg: ram ~cos^2, press ~ sin -> net
th_e=math.radians(40)
print("disc m=%.2fg W=%.4fN; adult breaths; numbers = max lid size k (discs) that physics allows (low/mid/high efficiency)\n"%(m*1e3,W))
rows=[]
for name,(U,A,T,kind) in breaths.items():
    j=J(U,A)
    # chin + puff (impulsive, lever 1.75R)
    if kind=='puff':
        chin=[kmax(e*j,T,'imp',1.75) for e in eta_gap]
        under=[kmax(e*j*math.sin(th_u),T,'imp',1.85) for e in eta_u]
        eye=[kmax(max(0,e*j*math.cos(th_e)**2-0.5*e*j*math.sin(th_e)),T,'imp',1.75) for e in eta_gap]
        print("%-17s J=%.3fN | chin(gap ram)  k<= %s | under-desk whole pile n<= %s | eye(-40deg) k<= %s"%(name,j,chin,under,eye))
    else:
        # long blow: with head sweep -> quasi-static threshold (tracked), opening phase uses eta_gap; without sweep -> behaves like a puff of ~0.1s with the long-blow J
        chin_s=[kmax(e*j,T,'qs',1.75) for e in eta_gap]
        chin_n=[kmax(e*j,0.10,'imp',1.75) for e in eta_gap]
        under_s=[kmax(e*j*math.sin(th_u),T,'qs',1.85) for e in eta_u]
        under_n=[kmax(e*j*math.sin(th_u),0.10,'imp',1.85) for e in eta_u]
        print("%-17s J=%.3fN | chin+SWEEP k<= %s (no sweep %s) | under-desk+SWEEP n<= %s (no sweep %s)"%(name,j,chin_s,chin_n,under_s,under_n))
print()
# whole-pile slide threshold (blast): horizontal momentum on face f*J*cos > mu_desk*n*W ; f ~ 0.5 of jet on the face
for n in (1,5,10,20,40):
    Fs=mu_desk*n*W
    print("n=%2d pile: weight %.3fN, whole-pile slide needs horizontal force > %.3fN -> J > %.3fN at f=0.5 (U0=%.0f m/s @1cm2)"%(n,n*W,Fs,Fs/0.5,math.sqrt(Fs/0.5/(rho*1e-4))))
print()
# lid-on-pile slide vs lift: lid of k slides off if F_H > mu_pp*(kW - F_L)
# tracked rotation time for surplus factor s (F = s*Fqs) with force following the rim (lever 1.75R) and weight arm R cos(a) - h/2 sin(a)
for k in (3,10,20):
    for s in (1.2,1.5,2.0):
        M=k*m; h=k*p; I=M*(1.25*R*R+h*h/3); F=s*M*g/1.75
        a=0.0; w=0.0; tt=0.0; dt=1e-4; rim0=0.0
        while a<math.pi/2 and tt<2:
            tau=F*1.75*R - M*g*(R*math.cos(a)-h/2*math.sin(a)); w+=tau/I*dt; a+=w*dt; tt+=dt
        rimrise=2*R*math.sin(min(a,math.pi/2))
        print("tracked lift k=%2d surplus x%.1f: time to vertical %.3fs, rim rises %.0fmm -> aim must rise ~%.2f m/s; at 8cm mouth distance ~%.0f deg/s jet pitch"%(k,s,tt,rimrise*1e3,rimrise/tt,math.degrees(math.atan(rimrise/0.08))/tt))
