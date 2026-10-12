// fx.js — 연출: 바람 줄기, 먼지, 반짝이, 컨페티(3D) + 떠오르는 글자(DOM)
import * as THREE from 'three';

export class Fx {
  constructor(scene, camera, layer) {
    this.scene = scene;
    this.camera = camera;
    this.layer = layer; // DOM 오버레이
    this.parts = [];
    const max = 1600;
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: { scale: { value: 1 } },
      vertexShader: `attribute float size; varying vec3 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*(320.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 p=gl_PointCoord-0.5; float d=length(p); if(d>0.5) discard; float a=smoothstep(0.5,0.25,d); gl_FragColor=vec4(vC,a); }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    // 바람 줄기(선)
    this.streaks = [];
    this.streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
  }

  emit({ at, n = 20, color = 0xffffff, speed = 3, up = 2, life = 0.8, size = 0.25, gravity = 6, spread = 1 }) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.parts.push({
        x: at.x + (Math.random() - 0.5) * 0.2 * spread, y: at.y, z: at.z + (Math.random() - 0.5) * 0.2 * spread,
        vx: Math.cos(a) * s, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s,
        life, t: 0, r: c.r, g: c.g, b: c.b, size: size * (0.6 + Math.random() * 0.8), gravity,
      });
    }
  }

  confetti(center, n = 160) {
    const cols = [0xff4f6e, 0xffd23f, 0x3dd6ff, 0x5ad43b, 0xb36bff, 0xffffff];
    for (let i = 0; i < n; i++) {
      this.emit({ at: { x: center.x + (Math.random() - 0.5) * 6, y: center.y + 4 + Math.random() * 2, z: center.z + (Math.random() - 0.5) * 4 }, n: 1, color: cols[i % cols.length], speed: 1.5, up: 1, life: 2.4, size: 0.32, gravity: 3 });
    }
  }

  // 입 → 조준점으로 바람 줄기
  wind(from, to, power = 1, color = 0xffffff) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    dir.normalize();
    for (let i = 0; i < 14; i++) {
      const g = new THREE.CylinderGeometry(0.025, 0.025, 1, 5, 1, true);
      g.rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(g, this.streakMat.clone());
      m.material.color.set(color);
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const off = side.multiplyScalar((Math.random() - 0.5) * 0.9).add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.5, 0));
      m.userData = { from: from.clone().add(off), dir: dir.clone(), len, t: -i * 0.012, dur: 0.22 + Math.random() * 0.08, power };
      m.lookAt(m.position.clone().add(dir));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      m.scale.set(0.8 + power * 1.4, 1, 1);
      this.scene.add(m);
      this.streaks.push(m);
    }
  }

  // 3D 위치 위에 떠오르는 글자
  text(world, html, cls = '') {
    const v = world.clone().project(this.camera);
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.innerHTML = html;
    el.style.left = ((v.x * 0.5 + 0.5) * 100).toFixed(2) + '%';
    el.style.top = ((-v.y * 0.5 + 0.5) * 100).toFixed(2) + '%';
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  update(dt) {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.98; p.vz *= 0.98;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; }
    }
    for (const p of this.parts) {
      const k = 1 - p.t / p.life;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.r; this.col[n * 3 + 1] = p.g; this.col[n * 3 + 2] = p.b;
      this.size[n] = p.size * (0.4 + 0.6 * k);
      n++;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const m = this.streaks[i];
      const u = m.userData;
      u.t += dt;
      const k = u.t / u.dur;
      if (k >= 1) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); this.streaks.splice(i, 1); continue; }
      if (k < 0) { m.visible = false; continue; }
      m.visible = true;
      m.position.copy(u.from).addScaledVector(u.dir, u.len * k);
      m.material.opacity = 0.85 * (1 - k);
    }
  }
}
