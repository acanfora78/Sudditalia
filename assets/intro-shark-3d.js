/* ==========================================================================
   Sudditalia Clothing — intro-shark-3d.js
   Esperienza WebGL dell'intro: squalo low-poly "a gemma sfaccettata" (denim +
   contorno oro) in un fondale marino. Canvas trasparente: lo sfondo oceano
   resta il gradiente CSS già gestito da sections/intro-shark.liquid, così i
   colori restano configurabili dal Theme Editor senza toccare questo file.

   Caricato SOLO via dynamic import da intro-shark.js quando WebGL è
   disponibile e l'utente non ha richiesto animazioni ridotte: se il fetch di
   three.js fallisce (rete assente, CDN down), la Promise di import rifiuta e
   l'orchestratore resta sulla sequenza 2D — nessuna esperienza rotta.

   Nessun asset 3D esterno: geometria dello squalo generata proceduralmente
   (loft del corpo + pinne come coni appiattiti) per restare a impatto zero
   sul peso del tema quando il fallback 2D è in uso.
   ========================================================================== */
import * as THREE from 'https://unpkg.com/three@0.160.1/build/three.module.js';

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function easeInQuad(t) { return t * t; }
function easeInCubic(t) { return t * t * t; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/* --- Texture particella: sprite circolare morbida generata via canvas --- */
function makeParticleTexture() {
  var size = 64;
  var c = document.createElement('canvas');
  c.width = c.height = size;
  var ctx = c.getContext('2d');
  var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  var tex = new THREE.CanvasTexture(c);
  return tex;
}

/* Texture usata come alpha dei raggi di sole: opaca in cima (vicino alla
   sorgente), dissolvenza verso il basso — evita il look "cono pieno". */
function makeVerticalGradientTexture() {
  var w = 16, h = 128;
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var ctx = c.getContext('2d');
  // Texture.flipY (default true) inverte la V: v=1 (cima larga del cono,
  // vicino alla "sorgente") legge la riga y=0 di questo canvas, quindi qui
  // in alto mettiamo il bianco pieno e sfumiamo verso il basso.
  var g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return new THREE.CanvasTexture(c);
}

/* Profilo del corpo (z lungo l'asse nuoto, raggio della sezione a quella z).
   Naso a +Z, peduncolo caudale a -Z. Condiviso dal loft del corpo e
   dall'aggancio di pinne/mascella/occhi, così restano sempre a contatto
   con la superficie qualunque modifica si faccia al profilo. */
var BODY_PROFILE = [
  [-1.50, 0.090], [-1.15, 0.255], [-0.75, 0.390], [-0.30, 0.4725],
  [0.10, 0.495], [0.50, 0.465], [0.85, 0.375], [1.15, 0.255],
  [1.40, 0.150], [1.60, 0.0675], [1.75, 0.015]
];
var RING_Y_SCALE = 0.72;
var RING_Y_OFFSET = 0.08;

function radiusAt(z) {
  var p = BODY_PROFILE;
  if (z <= p[0][0]) return p[0][1];
  if (z >= p[p.length - 1][0]) return p[p.length - 1][1];
  for (var i = 0; i < p.length - 1; i++) {
    if (z >= p[i][0] && z <= p[i + 1][0]) {
      var t = (z - p[i][0]) / (p[i + 1][0] - p[i][0]);
      return p[i][1] + (p[i + 1][1] - p[i][1]) * t;
    }
  }
  return p[p.length - 1][1];
}
function surfaceTopY(z) { return radiusAt(z) * (RING_Y_SCALE - RING_Y_OFFSET); }
function surfaceBottomY(z) { return -radiusAt(z) * (RING_Y_SCALE + RING_Y_OFFSET); }
function surfaceSideX(z) { return radiusAt(z); }

/* --- Corpo squalo: loft sfaccettato da un profilo di raggi lungo l'asse Z --- */
function buildBodyGeometry() {
  var profile = BODY_PROFILE;
  var radialSegments = 8;
  var rings = profile.map(function (p) {
    var z = p[0], r = p[1], ring = [];
    for (var s = 0; s < radialSegments; s++) {
      var theta = (s / radialSegments) * Math.PI * 2;
      ring.push([Math.cos(theta) * r, Math.sin(theta) * r * RING_Y_SCALE - r * RING_Y_OFFSET, z]);
    }
    return ring;
  });
  var verts = [];
  for (var i = 0; i < rings.length - 1; i++) {
    var ringA = rings[i], ringB = rings[i + 1];
    for (var s = 0; s < radialSegments; s++) {
      var s2 = (s + 1) % radialSegments;
      var a = ringA[s], b = ringA[s2], c = ringB[s2], d = ringB[s];
      verts.push.apply(verts, a); verts.push.apply(verts, b); verts.push.apply(verts, c);
      verts.push.apply(verts, a); verts.push.apply(verts, c); verts.push.apply(verts, d);
    }
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

/* Guscio "gonfiato" lungo le normali: contorno oro tipo fresnel, da qualunque angolo. */
function buildRimGeometry(bodyGeo, offset) {
  var geo = bodyGeo.clone();
  var pos = geo.attributes.position;
  var nrm = geo.attributes.normal;
  for (var i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nrm.getX(i) * offset,
      pos.getY(i) + nrm.getY(i) * offset,
      pos.getZ(i) + nrm.getZ(i) * offset
    );
  }
  pos.needsUpdate = true;
  return geo;
}

/* Pinna: cono a 3 lati appiattito, pivot alla base (utile per dorsale/pettorali/coda). */
function makeFinMesh(height, radius, material) {
  var geo = new THREE.ConeGeometry(radius, height, 3, 1);
  geo.scale(1, 1, 0.12);
  geo.translate(0, height / 2, 0);
  return new THREE.Mesh(geo, material);
}

export function createSharkIntro(opts) {
  var canvas = opts.canvas;
  var quality = opts.quality || 'high';
  var sharkColor = new THREE.Color(opts.sharkColor || '#232f3d');
  var accentColor = new THREE.Color(opts.accentColor || '#f2a900');
  var eyeColor = new THREE.Color('#050608');
  var enterDuration = clamp(opts.duration || 2200, 1200, 4000) / 1000;

  var tierCfg = {
    low: { particles: 90, godRays: 3, dpr: 1.25, antialias: false },
    mid: { particles: 220, godRays: 4, dpr: 1.75, antialias: true },
    high: { particles: 420, godRays: 6, dpr: 2, antialias: true }
  }[quality] || tierCfgHighFallback();
  function tierCfgHighFallback() { return { particles: 420, godRays: 6, dpr: 2, antialias: true }; }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: tierCfg.antialias,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: true
    });
  } catch (e) {
    throw e;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tierCfg.dpr));

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
  var cameraBase = new THREE.Vector3(0.3, 0.55, 6.4);
  camera.position.copy(cameraBase);

  /* --- Luci: fill blu oceano + sole caldo dall'alto + rim oro --- */
  scene.add(new THREE.HemisphereLight(0x6fb8e6, 0x0a1f33, 1.1));
  var sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  var rim = new THREE.DirectionalLight(accentColor.getHex(), 0.55);
  rim.position.set(-3, 1.2, -2);
  scene.add(rim);

  /* --- Gruppo squalo. modelYaw orienta il corpo di 3/4 verso camera: di
     profilo puro o dritto verso l'obiettivo lo squalo non si leggerebbe. --- */
  var sharkGroup = new THREE.Group();
  sharkGroup.position.set(0, -1.7, 0);
  scene.add(sharkGroup);
  var modelYaw = new THREE.Group();
  modelYaw.rotation.y = 1.12;
  sharkGroup.add(modelYaw);

  var bodyGeo = buildBodyGeometry();
  var bodyMat = new THREE.MeshStandardMaterial({
    color: sharkColor, flatShading: true, roughness: 0.38, metalness: 0.18
  });
  var bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  modelYaw.add(bodyMesh);

  var rimGeo = buildRimGeometry(bodyGeo, 0.035);
  var rimMat = new THREE.MeshBasicMaterial({
    color: accentColor, transparent: true, opacity: 0.32,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
  });
  var rimMesh = new THREE.Mesh(rimGeo, rimMat);
  modelYaw.add(rimMesh);

  var finMat = new THREE.MeshStandardMaterial({ color: sharkColor, flatShading: true, roughness: 0.4, metalness: 0.15 });
  var finGoldMat = new THREE.MeshStandardMaterial({ color: accentColor, flatShading: true, roughness: 0.3, metalness: 0.6 });

  var dorsalZ = -0.05;
  var dorsal = makeFinMesh(0.48, 0.26, finMat);
  dorsal.position.set(0, surfaceTopY(dorsalZ) - 0.04, dorsalZ);
  dorsal.rotation.x = -0.34;
  modelYaw.add(dorsal);

  var pecZ = -0.5;
  var pecR = makeFinMesh(0.42, 0.14, finMat);
  pecR.position.set(surfaceSideX(pecZ) - 0.03, surfaceBottomY(pecZ) * 0.25, pecZ);
  pecR.rotation.z = -Math.PI / 2 + 0.45;
  pecR.rotation.y = -0.55;
  modelYaw.add(pecR);
  var pecL = pecR.clone();
  pecL.position.x = -pecR.position.x;
  pecL.rotation.z = Math.PI / 2 - 0.45;
  pecL.rotation.y = 0.55;
  modelYaw.add(pecL);

  var pelZ = -1.05;
  var pelR = makeFinMesh(0.18, 0.08, finMat);
  pelR.position.set(surfaceSideX(pelZ) - 0.02, surfaceBottomY(pelZ) * 0.35, pelZ);
  pelR.rotation.z = -Math.PI / 2 + 0.4;
  modelYaw.add(pelR);
  var pelL = pelR.clone();
  pelL.position.x = -pelR.position.x;
  pelL.rotation.z = Math.PI / 2 - 0.4;
  modelYaw.add(pelL);

  var tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0, -1.5);
  modelYaw.add(tailGroup);
  var tailUpper = makeFinMesh(0.68, 0.2, finMat);
  tailUpper.position.set(0, 0.02, 0);
  tailUpper.rotation.x = Math.PI - 0.55;
  tailGroup.add(tailUpper);
  var tailLower = makeFinMesh(0.36, 0.14, finMat);
  tailLower.position.set(0, -0.02, 0);
  tailLower.rotation.x = Math.PI + 0.45;
  tailGroup.add(tailLower);

  var jawZ = 1.3;
  var jawGroup = new THREE.Group();
  jawGroup.position.set(0, surfaceBottomY(jawZ) + 0.05, jawZ);
  modelYaw.add(jawGroup);
  var jawGeo = new THREE.ConeGeometry(0.15, 0.4, 3);
  jawGeo.scale(1, 0.16, 1);
  jawGeo.rotateX(Math.PI / 2);
  jawGeo.translate(0, 0, 0.2);
  var jawMat = new THREE.MeshStandardMaterial({ color: sharkColor.clone().multiplyScalar(0.82), flatShading: true, roughness: 0.5 });
  var jawMesh = new THREE.Mesh(jawGeo, jawMat);
  jawGroup.add(jawMesh);

  var eyeZ = 0.95;
  var eyesGroup = new THREE.Group();
  modelYaw.add(eyesGroup);
  [1, -1].forEach(function (side) {
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), new THREE.MeshStandardMaterial({ color: eyeColor, roughness: 0.2, metalness: 0.1 }));
    eye.position.set(surfaceSideX(eyeZ) * 0.9 * side, surfaceTopY(eyeZ) * 0.35, eyeZ);
    eyesGroup.add(eye);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 12), finGoldMat);
    ring.position.copy(eye.position);
    ring.rotation.y = Math.PI / 2;
    eyesGroup.add(ring);
  });

  var gills = [];
  var gillMat = new THREE.MeshBasicMaterial({ color: 0x0a0d10, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  [1, -1].forEach(function (side) {
    for (var i = 0; i < 3; i++) {
      var gz = 0.62 - i * 0.11;
      var g = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.2), gillMat);
      g.position.set(surfaceSideX(gz) * side, 0, gz);
      g.rotation.y = side * 1.15;
      g.userData.phase = i * 0.9 + (side > 0 ? 0 : 1.4);
      gills.push(g);
      modelYaw.add(g);
    }
  });

  /* --- Raggi di sole: coni sottili additivi che filtrano dall'alto, dietro
     lo squalo, con dissolvenza verticale (texture) per un look volumetrico
     morbido invece di forme piatte e a spigoli duri. --- */
  var godRayGroup = new THREE.Group();
  scene.add(godRayGroup);
  var godRayTexture = makeVerticalGradientTexture();
  var godRays = [];
  for (var gr = 0; gr < tierCfg.godRays; gr++) {
    var h = 6 + Math.random() * 2.5;
    var geo = new THREE.CylinderGeometry(0.4 + Math.random() * 0.3, 0.02, h, 8, 1, true);
    var mat = new THREE.MeshBasicMaterial({
      color: gr % 3 === 0 ? accentColor : 0xdff3ff,
      map: godRayTexture, transparent: true, opacity: 0.07 + Math.random() * 0.035,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random() - 0.5) * 7, 3 + Math.random(), -3 - Math.random() * 3);
    mesh.rotation.z = (Math.random() - 0.5) * 0.35;
    mesh.rotation.x = 0.3 + Math.random() * 0.15;
    mesh.userData.baseOpacity = mat.opacity;
    mesh.userData.phase = Math.random() * 10;
    godRays.push(mesh);
    godRayGroup.add(mesh);
  }

  /* --- Particelle sospese ("piccole particelle fluttuano nell'acqua") --- */
  var particleCount = tierCfg.particles;
  var particleGeo = new THREE.BufferGeometry();
  var basePos = new Float32Array(particleCount * 3);
  var phases = new Float32Array(particleCount);
  var colors = new Float32Array(particleCount * 3);
  var white = new THREE.Color(0xf6f7fb);
  for (var p = 0; p < particleCount; p++) {
    basePos[p * 3] = (Math.random() - 0.5) * 6;
    basePos[p * 3 + 1] = (Math.random() - 0.5) * 4.5;
    basePos[p * 3 + 2] = (Math.random() - 0.5) * 4 - 0.5;
    phases[p] = Math.random() * Math.PI * 2;
    var mixed = white.clone().lerp(accentColor, Math.random() * 0.4);
    colors[p * 3] = mixed.r; colors[p * 3 + 1] = mixed.g; colors[p * 3 + 2] = mixed.b;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(basePos.slice(), 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  var particleMat = new THREE.PointsMaterial({
    size: 0.05, map: makeParticleTexture(), transparent: true, opacity: 0.75,
    vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  });
  var particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  /* --- Stato animazione --- */
  var state = 'emerging';
  var stateT = 0;
  var pointerTarget = { x: 0, y: 0 };
  var pointerCurrent = { x: 0, y: 0 };
  var eyesCurrent = { x: 0, y: 0 };
  var camParallax = { x: 0, y: 0 };
  var idleTailFreq = 1.5;
  var tailFreq = idleTailFreq;
  var readyFired = false;
  var active = true;
  var rafId = null;
  var clock = new THREE.Clock();

  function resize() {
    var w = canvas.clientWidth || canvas.parentElement.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || canvas.parentElement.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  resize();
  window.addEventListener('resize', resize);

  function animate() {
    if (!active) { rafId = null; return; }
    rafId = requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    pointerCurrent.x = damp(pointerCurrent.x, pointerTarget.x, 4, dt);
    pointerCurrent.y = damp(pointerCurrent.y, pointerTarget.y, 4, dt);
    eyesCurrent.x = damp(eyesCurrent.x, pointerTarget.x, 7, dt);
    eyesCurrent.y = damp(eyesCurrent.y, pointerTarget.y, 7, dt);
    camParallax.x = damp(camParallax.x, pointerTarget.x, 2.5, dt);
    camParallax.y = damp(camParallax.y, pointerTarget.y, 2.5, dt);

    if (state === 'emerging') {
      stateT += dt / 1.6;
      var e = easeOutCubic(clamp(stateT, 0, 1));
      sharkGroup.position.y = -1.7 + e * 1.7;
      var fadeOpac = e;
      godRays.forEach(function (m) { m.material.opacity = m.userData.baseOpacity * fadeOpac; });
      particleMat.opacity = 0.75 * fadeOpac;
      if (stateT >= 1) { state = 'idle'; stateT = 0; }
    } else if (state === 'entering') {
      stateT += dt / enterDuration;
      var s = clamp(stateT, 0, 1);
      if (s < 0.5) {
        var e1 = easeInQuad(s / 0.5);
        sharkGroup.position.z = e1 * 1.7;
        var scl = 1 + e1 * 0.4;
        sharkGroup.scale.setScalar(scl);
        jawGroup.rotation.x = -e1 * 0.6;
        tailFreq = idleTailFreq + e1 * idleTailFreq * 4.5;
        if (e1 > 0.4 && opts.onSwallowStart) { opts.onSwallowStart(); opts.onSwallowStart = null; }
      } else {
        var e2 = easeInCubic((s - 0.5) / 0.5);
        camera.fov = 38 + e2 * 34;
        camera.updateProjectionMatrix();
        camera.position.z = cameraBase.z - e2 * 3.6;
        if (e2 > 0.55 && opts.onBlackout) { opts.onBlackout(); opts.onBlackout = null; }
      }
      if (s >= 1) {
        state = 'done';
        if (opts.onComplete) opts.onComplete();
      }
    }

    if (state !== 'entering' && state !== 'done') {
      sharkGroup.position.y = (state === 'idle' ? 0 : sharkGroup.position.y) + Math.sin(t * 0.5) * 0.06;
      sharkGroup.rotation.z = Math.sin(t * 0.4) * 0.025;
    }
    if (state !== 'done') {
      sharkGroup.rotation.y = damp(sharkGroup.rotation.y, pointerCurrent.x * 0.35, 3, dt);
      sharkGroup.rotation.x = clamp(-pointerCurrent.y * 0.14, -0.25, 0.25);
      eyesGroup.rotation.y = eyesCurrent.x * 0.5;
      eyesGroup.rotation.x = -eyesCurrent.y * 0.3;

      tailGroup.rotation.y = Math.sin(t * tailFreq) * (state === 'entering' ? 0.28 : 0.14);
      pecR.rotation.x = Math.sin(t * 0.8) * 0.08;
      pecL.rotation.x = -Math.sin(t * 0.8 + 0.4) * 0.08;

      gills.forEach(function (g) {
        g.scale.y = 1 + Math.sin(t * 1.1 + g.userData.phase) * 0.18;
      });

      godRays.forEach(function (m) {
        m.rotation.y += dt * 0.05;
        if (state === 'idle') {
          m.material.opacity = m.userData.baseOpacity + Math.sin(t * 0.6 + m.userData.phase) * 0.02;
        }
      });

      var posAttr = particleGeo.attributes.position;
      for (var i = 0; i < particleCount; i++) {
        posAttr.setXYZ(
          i,
          basePos[i * 3] + Math.sin(t * 0.15 + phases[i]) * 0.35,
          basePos[i * 3 + 1] + Math.sin(t * 0.22 + phases[i] * 1.3) * 0.3,
          basePos[i * 3 + 2] + Math.cos(t * 0.18 + phases[i]) * 0.3
        );
      }
      posAttr.needsUpdate = true;

      camera.position.x = damp(camera.position.x, cameraBase.x + camParallax.x * 0.4, 3, dt);
      camera.position.y = damp(camera.position.y, cameraBase.y - camParallax.y * 0.2, 3, dt);
      if (state !== 'entering') {
        camera.lookAt(0, 0.15, 0);
      } else {
        camera.lookAt(0, -0.1, sharkGroup.position.z + 1.1);
      }
    }

    renderer.render(scene, camera);
    if (!readyFired) {
      readyFired = true;
      if (opts.onReady) opts.onReady();
    }
  }
  animate();

  return {
    updatePointer: function (nx, ny) {
      pointerTarget.x = clamp(nx, -1, 1);
      pointerTarget.y = clamp(ny, -1, 1);
    },
    trigger: function () {
      if (state === 'entering' || state === 'done') return;
      state = 'entering';
      stateT = 0;
    },
    setActive: function (isActive) {
      active = isActive;
      if (active && rafId === null) { clock.getDelta(); animate(); }
    },
    dispose: function () {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      scene.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      renderer.dispose();
      var ext = renderer.getContext() && renderer.getContext().getExtension && renderer.getContext().getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  };
}
