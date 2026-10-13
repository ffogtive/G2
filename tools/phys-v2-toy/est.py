# Order-of-magnitude estimates for blowing ddakji (round paper discs) off a stack.
# All SI. Coefficients marked as assumptions; see report.
import math
rho=1.2; g=9.81
def disc(D=0.050,t=0.0008,rb=750.0):
    R=D/2; m=math.pi*R*R*t*rb; return dict(R=R,t=t,m=m,W=m*g,w=m*g/(math.pi*R*R))
d=disc()
print("disc: R=%.1fmm t=%.2fmm m=%.2fg W=%.4fN areal=%.2fPa"%(d['R']*1e3,d['t']*1e3,d['m']*1e3,d['W'],d['w']))
for D,t in [(0.045,0.0006),(0.050,0.0010),(0.068,0.0010)]:
    dd=disc(D,t); print("  alt D=%.0fmm t=%.1fmm m=%.2fg W=%.4fN areal=%.2fPa vcr(full-area)=%.1fm/s"%(D*1e3,t*1e3,dd['m']*1e3,dd['W'],dd['w'],math.sqrt(2*dd['w']/rho)))
print("vcr full-area dp=q:", round(math.sqrt(2*d['w']/rho),2),"m/s")
# terminal velocity face-on, Cd 1.17
vt=math.sqrt(2*d['m']*g/(rho*1.17*math.pi*d['R']**2)); print("terminal velocity face-on: %.2f m/s"%vt)
# Field et al dimensionless MOI  I* = pi*rho_d*t/(64*rho_f*D)
print("I* (Field 1997 def) = %.3f"%(math.pi*750*d['t']/(64*rho*0.05)))
# jets
def jet(U0,A0,x):
    d0=math.sqrt(4*A0/math.pi); Uc=U0*min(1.0,5.8*d0/max(x,1e-6)); rh=max(0.5*d0,0.094*x)
    J=rho*U0*U0*A0; return dict(d0=d0,Uc=Uc,qc=0.5*rho*Uc*Uc,rh=rh,b=rh/math.sqrt(math.log(2)),J=J,Q=U0*A0,P=0.5*rho*U0**3*A0)
breaths={
 'puff_casual':(12,1.0e-4,0.12),
 'puff_strong':(30,1.0e-4,0.12),
 'puff_strong_wide':(30,1.8e-4,0.12),
 'puff_max':(50,1.0e-4,0.10),
 'long_normal':(15,2.0e-4,0.70),
 'long_strong':(22,2.0e-4,0.70),
}
print("\nbreath presets (adult):")
for k,(U,A,T) in breaths.items():
    j=jet(U,A,0.08)
    vol=U*A*T*(0.64 if k.startswith('puff') else 0.85)
    print("%-17s U0=%2d A=%.1fcm2 d0=%.1fmm Q=%.1fL/s J=%.3fN (=%.1f disc weights) pmouth=%.0fPa vol~%.2fL T=%.2fs | @8cm Uc=%.1f q=%.0fPa r1/2=%.1fmm (~%.0f layers FWHM @1.2mm pitch)"%(
        k,U,A*1e4,j['d0']*1e3,j['Q']*1e3,j['J'],j['J']/d['W'],0.5*rho*U*U,vol*1e3,T,j['Uc'],j['qc'],j['rh']*1e3,2*j['rh']/0.0012))
for x in (0.03,0.05,0.08,0.12,0.20):
    j=jet(30,1e-4,x); print("  strong puff at x=%3.0fmm: Uc=%.1f m/s q=%.0f Pa r1/2=%.1f mm"%(x*1e3,j['Uc'],j['qc'],j['rh']*1e3))
# tipping thresholds for a lid of k discs, pitch p
p=0.0012; R=d['R']
def thresholds(k,T,lever=1.75):
    M=k*d['m']; h=k*p
    I=M*(1.25*R*R+h*h/3)
    dE=M*g*(math.sqrt(R*R+h*h/4)-h/2)
    wmin=math.sqrt(2*dE/I)
    # quasi-static: F*lever*R >= M g R  (hinge at back bottom rim)
    Fqs=M*g/lever
    # impulsive: mean force F over T must give I*wmin + M g R T angular impulse
    Fimp=(I*wmin+M*g*R*T)/(lever*R*T)
    return dict(M=M,h=h,wmin=wmin,Fqs=Fqs,Fimp=Fimp,rim=2*R*wmin,dE=dE)
print("\nlid thresholds (pitch 1.2mm, lever 1.75R):")
for k in (1,2,3,5,10,20,40):
    a=thresholds(k,0.12); b=thresholds(k,0.06)
    print(" k=%2d M=%.1fg h=%.0fmm  wmin=%.1frad/s rimspeed=%.2fm/s  Fqs=%.3fN(%.2f kW)  Fimp(T.12)=%.3fN(%.2f kW) Fimp(T.06)=%.3fN(%.2f kW) E=%.1fmJ"%(
        k,a['M']*1e3,a['h']*1e3,a['wmin'],a['rim'],a['Fqs'],a['Fqs']/(k*d['W']),a['Fimp'],a['Fimp']/(k*d['W']),b['Fimp'],b['Fimp']/(k*d['W']),a['dE']*1e3))
# parabolic half-turn
w=math.sqrt(math.pi*g/(2*R)); print("\nair half-turn condition (vy=w*R, t=2vy/g, w*t=pi): w=%.1f rad/s, t=%.3f s, hop=%.1f mm"%(w,2*w*R/g,(w*R)**2/(2*g)*1e3))
for w in (25,35,50,70):
    vy=w*R; t=2*vy/g; print("  w=%2d: vy=%.2f t=%.3fs hop=%.0fmm halfturns=%.2f"%(w,vy,t,vy*vy/(2*g)*1e3,w*t/math.pi))
