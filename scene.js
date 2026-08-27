/* ============================================================
   scene.js — the living world behind the page.
   A single day's flight over painted mountain ridges:
   dawn -> morning -> midday -> afternoon -> golden hour -> dusk -> night.
   Exposes window.WorldScene with .setProgress(p) and .render loop
   started internally via requestAnimationFrame.
   ============================================================ */

(function () {
  const canvas = document.getElementById('scene-canvas');
  const isSmall = window.innerWidth < 760;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmall ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 2000
  );
  camera.position.set(0, 20, 50);
  camera.rotation.x = -0.22;

  // ---------------------------------------------------------
  // Color keyframes: one "day" mapped across the whole scroll.
  // ---------------------------------------------------------
  const stops = [
    { p: 0.00, top: 0x2b2560, bot: 0xf7b189, fog: 0xc99b86, sun: 0xffe2b0, warm: 0x8d7bb0 },
    { p: 0.16, top: 0x3a5b8c, bot: 0xffd9a0, fog: 0xefc596, sun: 0xffe9c2, warm: 0x9fb0c9 },
    { p: 0.33, top: 0x4f86c6, bot: 0xffe9b8, fog: 0xffe6bf, sun: 0xfff6dd, warm: 0xb9d2e8 },
    { p: 0.50, top: 0x6a4f8c, bot: 0xf2965b, fog: 0xe6a06a, sun: 0xffbd6b, warm: 0xc98e6b },
    { p: 0.66, top: 0x5a2f5f, bot: 0xef7847, fog: 0xd0703f, sun: 0xff7a45, warm: 0xc06a4a },
    { p: 0.83, top: 0x231a42, bot: 0xa34a5e, fog: 0x5c3040, sun: 0xd1495c, warm: 0x6b4258 },
    { p: 1.00, top: 0x05050f, bot: 0x1c1638, fog: 0x0d0b1c, sun: 0xcfd8ff, warm: 0x2a2440 },
  ];

  function findStops(p) {
    for (let i = 0; i < stops.length - 1; i++) {
      if (p >= stops[i].p && p <= stops[i + 1].p) {
        const local = (p - stops[i].p) / (stops[i + 1].p - stops[i].p);
        return [stops[i], stops[i + 1], local];
      }
    }
    return [stops[stops.length - 1], stops[stops.length - 1], 0];
  }

  const _c1 = new THREE.Color(), _c2 = new THREE.Color();
  function lerpField(a, b, t, field) {
    _c1.set(a[field]); _c2.set(b[field]);
    return _c1.lerp(_c2, t).clone();
  }

  // ---------------------------------------------------------
  // Sky dome
  // ---------------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(900, 32, 18);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x2b2560) },
      bottomColor: { value: new THREE.Color(0xf7b189) },
      offset: { value: 20 },
      exponent: { value: 0.6 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main(){
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main(){
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float f = clamp(pow(max(h, 0.0), exponent), 0.0, 1.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, f), 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  scene.fog = new THREE.Fog(0xc99b86, 60, 620);

  // ---------------------------------------------------------
  // Noise (value noise, ridged) for painterly mountains
  // ---------------------------------------------------------
  function hash(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }
  function noise2D(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function ridged(x, y, octaves) {
    let sum = 0, amp = 0.55, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = noise2D(x * freq, y * freq);
      const r = 1 - Math.abs(n * 2 - 1);
      sum += r * r * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.05;
    }
    return sum / norm;
  }

  // ---------------------------------------------------------
  // Mountain ridge layers (painterly, vertex-colored, flat)
  // ---------------------------------------------------------
  const seg = isSmall ? 34 : 56;
  const layers = [];
  const layerDefs = [
    { z: -60, width: 420, depth: 340, amp: 9, freq: 0.011, baseY: -8, seed: 4.1,
      low: 0x1c2e22, high: 0xe8c07a, tint: 1.0 },
    { z: -260, width: 520, depth: 380, amp: 7, freq: 0.009, baseY: -6, seed: 19.7,
      low: 0x22314a, high: 0xd79a72, tint: 0.85 },
    { z: -460, width: 620, depth: 420, amp: 5.5, freq: 0.008, baseY: -4, seed: 41.3,
      low: 0x2c3350, high: 0xc79a86, tint: 0.7 },
    { z: -680, width: 760, depth: 460, amp: 4, freq: 0.007, baseY: -2, seed: 77.2,
      low: 0x35405f, high: 0xbfa2a0, tint: 0.55 },
  ];

  layerDefs.forEach((def) => {
    const geo = new THREE.PlaneGeometry(def.width, def.depth, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cLow = new THREE.Color(def.low);
    const cHigh = new THREE.Color(def.high);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = ridged(x * def.freq + def.seed, z * def.freq + def.seed, 4);
      const h = def.baseY + n * def.amp;
      pos.setY(i, h);
      const t = THREE.MathUtils.clamp((h - def.baseY) / def.amp, 0, 1);
      const col = cLow.clone().lerp(cHigh, Math.pow(t, 1.4));
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = def.z;
    mesh.userData.tint = def.tint;
    scene.add(mesh);
    layers.push(mesh);
  });

  // ---------------------------------------------------------
  // Rivers — glowing meandering lines through the valley
  // ---------------------------------------------------------
  function makeRiver(zStart, length, xOffset) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const z = zStart - t * length;
      const x = xOffset + Math.sin(t * Math.PI * 2.4) * 34 + Math.sin(t * 9.1) * 6;
      const y = -7.5 + Math.sin(t * 12) * 0.2;
      pts.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 90, 0.55, 6, false);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xbfe3ff, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    return new THREE.Mesh(geo, mat);
  }
  scene.add(makeRiver(20, 300, -30));
  scene.add(makeRiver(-180, 340, 60));

  // ---------------------------------------------------------
  // Sun / moon
  // ---------------------------------------------------------
  function radialTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
  const glowTex = radialTexture();
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffe2b0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sunGlow.scale.set(120, 120, 1);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff6dd, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sunCore.scale.set(28, 28, 1);
  scene.add(sunGlow, sunCore);

  // ---------------------------------------------------------
  // Stars (fade in at night)
  // ---------------------------------------------------------
  const starCount = isSmall ? 300 : 700;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 700;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * 0.5 * Math.PI;
    starPos[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
    starPos[i * 3 + 1] = Math.cos(phi) * r * 0.6 + 80;
    starPos[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, transparent: true, opacity: 0,
    depthWrite: false, sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ---------------------------------------------------------
  // Birds
  // ---------------------------------------------------------
  function birdTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(20,16,28,0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(4, 20);
    ctx.quadraticCurveTo(16, 4, 32, 16);
    ctx.quadraticCurveTo(48, 4, 60, 20);
    ctx.stroke();
    return new THREE.CanvasTexture(c);
  }
  const birdTex = birdTexture();
  const birdCount = isSmall ? 4 : 7;
  const birds = [];
  for (let i = 0; i < birdCount; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: birdTex, transparent: true, depthWrite: false,
    }));
    const scale = 2.4 + Math.random() * 1.8;
    s.scale.set(scale, scale * 0.5, 1);
    s.userData.phase = Math.random() * Math.PI * 2;
    s.userData.speed = 0.4 + Math.random() * 0.5;
    s.userData.baseY = 6 + Math.random() * 14;
    s.userData.xr = 30 + Math.random() * 50;
    s.userData.zOff = Math.random() * 200;
    scene.add(s);
    birds.push(s);
  }

  // ---------------------------------------------------------
  // Embers / floating particles
  // ---------------------------------------------------------
  const emberCount = isSmall ? 90 : 220;
  const emberGeo = new THREE.BufferGeometry();
  const emberPos = new Float32Array(emberCount * 3);
  const emberSpeed = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i++) {
    emberPos[i * 3] = (Math.random() - 0.5) * 140;
    emberPos[i * 3 + 1] = Math.random() * 30 - 8;
    emberPos[i * 3 + 2] = camera.position.z - Math.random() * 260;
    emberSpeed[i] = 0.02 + Math.random() * 0.05;
  }
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberMat = new THREE.PointsMaterial({
    color: 0xf2c572, size: 0.9, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  scene.add(embers);

  // ---------------------------------------------------------
  // Progress-driven state
  // ---------------------------------------------------------
  let progress = 0;
  let displayProgress = 0;
  const Z_START = 50;
  const Z_END = -640;

  const mouse = { x: 0, y: 0 };
  window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth - 0.5);
    mouse.y = (e.clientY / window.innerHeight - 0.5);
  });

  const clock = new THREE.Clock();

  function updateWorld(p) {
    const [a, b, t] = findStops(p);
    const top = lerpField(a, b, t, 'top');
    const bot = lerpField(a, b, t, 'bot');
    const fog = lerpField(a, b, t, 'fog');
    const sun = lerpField(a, b, t, 'sun');

    skyMat.uniforms.topColor.value.copy(top);
    skyMat.uniforms.bottomColor.value.copy(bot);
    scene.fog.color.copy(fog);
    renderer.setClearColor(bot, 1);

    sunGlow.material.color.copy(sun);
    sunCore.material.color.copy(sun);

    // sun arcs across the sky over the course of the "day"
    const arc = Math.sin(p * Math.PI);
    const sunY = -10 + arc * 130;
    const sunX = 95 + (p - 0.5) * 130;
    const sunZ = camera.position.z - 420;
    sunGlow.position.set(sunX, sunY, sunZ);
    sunCore.position.set(sunX, sunY, sunZ);
    const fade = THREE.MathUtils.clamp(arc + 0.15, 0.12, 1);
    sunGlow.material.opacity = fade;
    sunCore.material.opacity = Math.min(1, fade + 0.2);

    // stars fade in at night
    const starT = THREE.MathUtils.clamp((p - 0.72) / 0.28, 0, 1);
    starMat.opacity = starT * 0.9;

    // mountain tint warms/cools with the light
    layers.forEach((m) => {
      const tint = sun.clone().lerp(new THREE.Color(0xffffff), 0.5 + 0.3 * (1 - m.userData.tint));
      m.material.color.copy(tint);
    });
  }

  function updateCamera(p, dt) {
    const targetZ = THREE.MathUtils.lerp(Z_START, Z_END, p);
    if (reduceMotion) {
      camera.position.z = targetZ;
    } else {
      camera.position.z += (targetZ - camera.position.z) * 0.06;
    }

    const drift = Math.sin(p * Math.PI * 3) * 2.2;
    const targetY = 20 + drift;
    camera.position.y += (targetY - camera.position.y) * 0.06;

    const targetX = Math.sin(p * Math.PI * 2.2) * 4 + (reduceMotion ? 0 : mouse.x * 4);
    camera.position.x += (targetX - camera.position.x) * 0.05;

    const targetRotX = -0.22 + (reduceMotion ? 0 : mouse.y * 0.03);
    camera.rotation.x += (targetRotX - camera.rotation.x) * 0.05;
    const targetRotY = (reduceMotion ? 0 : mouse.x * 0.05);
    camera.rotation.y += (targetRotY - camera.rotation.y) * 0.05;
  }

  function updateCreatures(dt, t) {
    birds.forEach((b) => {
      const z = camera.position.z - 60 - ((b.userData.zOff + t * 10 * b.userData.speed) % 220);
      const x = Math.sin(t * b.userData.speed + b.userData.phase) * b.userData.xr;
      const y = b.userData.baseY + Math.sin(t * 2 * b.userData.speed + b.userData.phase) * 1.4;
      b.position.set(x, y, z);
    });

    const posAttr = embers.geometry.attributes.position;
    for (let i = 0; i < emberCount; i++) {
      let y = posAttr.getY(i) + emberSpeed[i] * dt * 6;
      let z = posAttr.getZ(i);
      if (y > 26) y = -8;
      if (z > camera.position.z + 20) z = camera.position.z - 260;
      posAttr.setY(i, y);
      posAttr.setZ(i, z);
    }
    posAttr.needsUpdate = true;
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    displayProgress += (progress - displayProgress) * (reduceMotion ? 1 : 0.08);

    updateWorld(displayProgress);
    updateCamera(displayProgress, dt);
    updateCreatures(dt, t);

    renderer.render(scene, camera);
  }
  animate();

  window.WorldScene = {
    setProgress(p) { progress = THREE.MathUtils.clamp(p, 0, 1); },
  };
})();
