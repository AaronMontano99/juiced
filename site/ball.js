// JUICED · the hero baseball. Three.js, texture drawn in code, swells and glows as you scroll.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.min.js";

const host = document.getElementById("ball");
const pin = document.getElementById("hero-pin");
const hero = document.getElementById("hero");
const hint = document.getElementById("ball-hint");

if (host) {
  try { init(); } catch (e) { console.warn("ball: WebGL unavailable", e); host.remove(); }
}

function init() {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 7);

  // ---- the ball ----
  const { map, bump } = drawLeather(renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.MeshStandardMaterial({
    map, bumpMap: bump, bumpScale: 3, roughness: 0.6, metalness: 0,
    emissive: new THREE.Color(0xff5a1f), emissiveIntensity: 0,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 120), mat);
  const spin = new THREE.Group(); spin.add(ball);
  const tilt = new THREE.Group(); tilt.add(spin);
  scene.add(tilt);
  spin.rotation.set(0.5, -0.6, 0.25);

  // halo: back-faced shell, brighter toward the silhouette
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xff7a3d) }, uPower: { value: 0 } },
    vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPower; varying vec3 vN;
      // back faces: strongest just outside the ball's edge, fading to nothing at the shell's edge
      void main(){ float d = clamp(-dot(vN, vec3(0.0,0.0,1.0)) / 0.62, 0.0, 1.0); float i = pow(d, 3.0) * (1.0 - smoothstep(0.92, 1.0, d) * 0.6); gl_FragColor = vec4(uColor, i * uPower); }`,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.28, 64, 48), haloMat);
  tilt.add(halo);

  // sparks: points that stream outward faster as the ball juices up
  const N = 520;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const spawn = (i, r0) => {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(th), dy = u, dz = s * Math.sin(th);
    const r = r0 ?? 1.05 + Math.random() * 0.1;
    pos.set([dx * r, dy * r, dz * r], i * 3);
    vel.set([dx, dy, dz], i * 3);
    life[i] = Math.random();
  };
  for (let i = 0; i < N; i++) spawn(i, 1.05 + Math.random() * 2.2);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dot = document.createElement("canvas"); dot.width = dot.height = 64;
  const dg = dot.getContext("2d"), grad = dg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.35, "rgba(255,190,140,.8)"); grad.addColorStop(1, "rgba(255,120,60,0)");
  dg.fillStyle = grad; dg.fillRect(0, 0, 64, 64);
  const pmat = new THREE.PointsMaterial({ size: 0.07, map: new THREE.CanvasTexture(dot), color: 0xff7a3d,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const sparks = new THREE.Points(pgeo, pmat);
  tilt.add(sparks);

  // light
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5048, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff6a2b, 0); rim.position.set(-4, -1.5, -3); scene.add(rim);

  // ---- sizing + optional pin (desktop only, when the hero fits on screen) ----
  let pinned = false;
  function layout() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the ball a steady share of the shorter side
    camera.position.z = w < h ? 7 * (h / w) * 0.62 + 2.6 : 7.6;
    camera.updateProjectionMatrix();
    pin.style.height = "";
    pinned = false;
    if (!reduce && innerWidth >= 900 && hero.offsetHeight <= innerHeight - 52) {
      pin.style.height = hero.offsetHeight + innerHeight * 0.75 + "px";
      pinned = true;
    }
    pin.classList.toggle("pinned", pinned);
    if (hint) hint.hidden = !pinned;
    render(0);
  }

  // ---- interaction ----
  const tgt = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => {
    tgt.x = (e.clientY / innerHeight - 0.5) * 0.35;
    tgt.y = (e.clientX / innerWidth - 0.5) * 0.5;
  }, { passive: true });

  function progress() {
    const r = pin.getBoundingClientRect();
    const span = pinned ? pin.offsetHeight - hero.offsetHeight : hero.offsetHeight * 0.8;
    return Math.min(1, Math.max(0, (52 - r.top) / span));
  }
  const ease = (t) => t * t * (3 - 2 * t);

  let juice = 0, last = performance.now(), idle = 0;
  function render(dt) {
    const p = reduce ? 0 : progress();
    juice += (ease(p) - juice) * Math.min(1, dt * 6 || 1);
    idle += dt * (0.25 + juice * 1.6);
    cur.x += (tgt.x - cur.x) * Math.min(1, dt * 3); cur.y += (tgt.y - cur.y) * Math.min(1, dt * 3);
    tilt.rotation.set(cur.x, cur.y, 0);
    spin.rotation.y = -0.6 + idle + p * Math.PI * 2.5;
    spin.rotation.x = 0.5 + p * 0.9;
    const sc = 1 + juice * 0.26 + Math.sin(idle * 3) * 0.006 * juice;
    tilt.scale.setScalar(sc);
    mat.emissiveIntensity = juice * 0.22;
    haloMat.uniforms.uPower.value = 0.12 + juice * 0.85;
    rim.intensity = juice * 5;
    pmat.opacity = 0.08 + juice * 0.9;
    pmat.size = 0.05 + juice * 0.05;
    const speed = 0.12 + juice * 2.4;
    for (let i = 0; i < N; i++) {
      life[i] += dt * (0.25 + juice);
      const k = i * 3;
      pos[k] += vel[k] * speed * dt; pos[k + 1] += vel[k + 1] * speed * dt; pos[k + 2] += vel[k + 2] * speed * dt;
      if (life[i] > 1 || pos[k] * pos[k] + pos[k + 1] * pos[k + 1] + pos[k + 2] * pos[k + 2] > 12) spawn(i);
    }
    pgeo.attributes.position.needsUpdate = true;
    if (hint) hint.style.opacity = String(Math.max(0, 1 - p * 4));
    renderer.render(scene, camera);
  }

  let visible = true, raf = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    render(dt);
    raf = visible && !reduce ? requestAnimationFrame(loop) : 0;
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf && !reduce) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }).observe(host);
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 120); });
  layout();
  host.classList.add("on");
  if (!reduce) raf = requestAnimationFrame(loop);
}

// ---- leather + seams, drawn onto an equirectangular canvas ----
function drawLeather(aniso) {
  const W = 2048, H = 1024;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const b = document.createElement("canvas"); b.width = W; b.height = H;
  const g = c.getContext("2d"), bg = b.getContext("2d");
  g.fillStyle = "#f2ede3"; g.fillRect(0, 0, W, H);
  bg.fillStyle = "#808080"; bg.fillRect(0, 0, W, H);
  // leather grain + a little scuffing
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = Math.random() * 1.6 + 0.3;
    g.fillStyle = `rgba(120,100,80,${Math.random() * 0.05})`; g.fillRect(x, y, r, r);
    bg.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${Math.random() * 0.12})`; bg.fillRect(x, y, r * 1.5, r * 1.5);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(150,120,90,${Math.random() * 0.05})`;
    g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 20 + Math.random() * 90, 6 + Math.random() * 30, Math.random() * 3, 0, 7); g.fill();
  }

  // the seam: a curve that lies exactly on the unit sphere (a + b = 1), kept away from the poles
  const A = 0.72, B = 0.28;
  const seam = (t) => {
    const x = A * Math.cos(t) + B * Math.cos(3 * t);
    const z = A * Math.sin(t) - B * Math.sin(3 * t);
    const y = 2 * Math.sqrt(A * B) * Math.sin(2 * t);
    return new THREE.Vector3(x, y, z);
  };
  // match three.js SphereGeometry UVs: x = -cos(phi) sin(theta), y = cos(theta), z = sin(phi) sin(theta)
  const toUV = (p) => {
    const v = p.clone().normalize();
    const theta = Math.acos(Math.max(-1, Math.min(1, v.y)));
    let phi = Math.atan2(v.z, -v.x); if (phi < 0) phi += Math.PI * 2;
    return [(phi / (Math.PI * 2)) * W, (theta / Math.PI) * H];
  };
  const poly = (ctx, pts, fill) => {
    const uv = pts.map(toUV);
    for (let i = 1; i < uv.length; i++) if (Math.abs(uv[i][0] - uv[0][0]) > W / 2) return; // skip the wrap seam
    ctx.fillStyle = fill; ctx.beginPath(); uv.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
  };

  // dense samples with arc length so stitches are evenly spaced
  const S = 4000, pts = [], cum = [0];
  for (let i = 0; i <= S; i++) pts.push(seam((i / S) * Math.PI * 2));
  for (let i = 1; i <= S; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = cum[S];
  const at = (s) => { let lo = 0, hi = S; while (hi - lo > 1) { const m = (lo + hi) >> 1; cum[m] < s ? (lo = m) : (hi = m); } return lo; };

  // seam groove
  for (let i = 0; i < S; i++) {
    const p = pts[i], q = pts[i + 1], n = p.clone().cross(q.clone().sub(p)).normalize().multiplyScalar(0.006);
    poly(g, [p.clone().add(n), q.clone().add(n), q.clone().sub(n), p.clone().sub(n)], "rgba(150,135,118,.55)");
    poly(bg, [p.clone().add(n), q.clone().add(n), q.clone().sub(n), p.clone().sub(n)], "#3a3a3a");
  }
  // 108 double stitches, the V pattern of a real ball
  const STITCHES = 108;
  for (let k = 0; k < STITCHES; k++) {
    const i = at((k / STITCHES) * L), p = pts[i], q = pts[Math.min(S, i + 2)];
    const T = q.clone().sub(p).normalize(), Nn = p.clone().cross(T).normalize();
    for (const side of [1, -1]) {
      const base = p.clone().add(Nn.clone().multiplyScalar(0.012 * side));
      const tip = p.clone().add(Nn.clone().multiplyScalar(0.055 * side)).add(T.clone().multiplyScalar(0.022));
      const w = T.clone().multiplyScalar(0.0065);
      const quad = [base.clone().sub(w), base.clone().add(w), tip.clone().add(w), tip.clone().sub(w)];
      poly(g, quad, "#c41e2a");
      poly(bg, quad, "#e8e8e8");
    }
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = aniso;
  const bump = new THREE.CanvasTexture(b); bump.anisotropy = aniso;
  return { map, bump };
}
