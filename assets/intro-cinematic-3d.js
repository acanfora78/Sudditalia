/* ==========================================================================
   Sudditalia Clothing — intro-cinematic-3d.js
   "APNEA" — scena WebGL dell'intro cinematografica.

   Principio di art direction: sottrazione. Lo schermo è quasi nero, lo
   squalo non viene mai illuminato del tutto — si legge perché OCCLUDE i
   coni di luce, non perché è in piena luce. La foschia esponenziale lo
   dissolve nel nulla oltre una certa distanza: "mai completamente
   visibile" è ottenuto dalla fisica della scena, non da trucchi di regia.

   Tutto è procedurale (nessun asset da scaricare): corpo, pinne, coni di
   luce volumetrici, caustiche, particolato. Se l'utente configura un GLB
   nel Theme Editor, quello sostituisce la mesh procedurale.

   La catena di post-processing è scritta a mano (bright-pass → blur →
   composite con distorsione barile, aberrazione cromatica, grana e
   vignettatura): è ciò che separa "girato con un obiettivo" da "renderizzato
   in un browser", e costa 5 quad fullscreen invece dell'intera pipeline
   di EffectComposer + passi di esempio.
   ========================================================================== */
import * as THREE from 'three';

/* ---------------------------------------------------------------- utils -- */
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
/* Catmull-Rom scalare: usato per interpolare il profilo del corpo in modo
   morbido invece che a spezzata (una spezzata si legge come "low-poly"). */
function catmull(p0, p1, p2, p3, t) {
  var t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/* ------------------------------------------------- profilo anatomico ----- */
/* [z, semi-larghezza, semi-altezza, offset verticale del centro].
   Muso a +Z, peduncolo caudale a -Z. Sezioni ellittiche leggermente
   compresse lateralmente a metà corpo, come in un carcharhinide. */
var BODY_PROFILE = [
  [2.00, 0.012, 0.010, 0.000],
  [1.80, 0.090, 0.075, -0.010],
  [1.55, 0.160, 0.140, -0.020],
  [1.25, 0.235, 0.215, -0.025],
  [0.90, 0.300, 0.290, -0.020],
  [0.50, 0.340, 0.345, -0.005],
  [0.10, 0.350, 0.370, 0.000],
  [-0.35, 0.325, 0.355, 0.005],
  [-0.80, 0.270, 0.310, 0.010],
  [-1.25, 0.195, 0.245, 0.015],
  [-1.60, 0.130, 0.180, 0.020],
  [-1.85, 0.080, 0.125, 0.022],
  [-2.05, 0.048, 0.088, 0.025]
];
var TAIL_Z = -2.05;

function sampleProfile(t) {
  var p = BODY_PROFILE;
  var n = p.length - 1;
  var f = clamp01(t) * n;
  var i = Math.min(Math.floor(f), n - 1);
  var lt = f - i;
  var i0 = Math.max(i - 1, 0), i1 = i, i2 = Math.min(i + 1, n), i3 = Math.min(i + 2, n);
  return [
    catmull(p[i0][0], p[i1][0], p[i2][0], p[i3][0], lt),
    Math.max(catmull(p[i0][1], p[i1][1], p[i2][1], p[i3][1], lt), 0.002),
    Math.max(catmull(p[i0][2], p[i1][2], p[i2][2], p[i3][2], lt), 0.002),
    catmull(p[i0][3], p[i1][3], p[i2][3], p[i3][3], lt)
  ];
}

/* Corpo: loft ad alta densità con normali morbide. */
function buildBodyGeometry(rings, radial) {
  var positions = [], normals = [], uvs = [], indices = [];
  for (var r = 0; r <= rings; r++) {
    var s = sampleProfile(r / rings);
    var z = s[0], hw = s[1], hh = s[2], cy = s[3];
    for (var a = 0; a <= radial; a++) {
      var th = (a / radial) * Math.PI * 2;
      var ct = Math.cos(th), st = Math.sin(th);
      // Ventre più piatto della schiena: rompe la simmetria da "capsula".
      var flat = st < 0 ? (1.0 + st * 0.14) : 1.0;
      positions.push(ct * hw, st * hh * flat + cy, z);
      normals.push(0, 0, 0);
      uvs.push(a / radial, r / rings);
    }
  }
  var stride = radial + 1;
  for (var r2 = 0; r2 < rings; r2++) {
    for (var a2 = 0; a2 < radial; a2++) {
      var i0 = r2 * stride + a2, i1 = i0 + 1, i2 = i0 + stride, i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* Pinna: profilo 2D estruso sottile, poi orientato con una base esplicita
   (makeBasis) invece che con rotazioni concatenate — molto più leggibile e
   impossibile da sbagliare rispetto a rotation.x/y/z accumulate. */
function makeBlade(shapePts, thickness, uAxis, vAxis) {
  var shape = new THREE.Shape();
  shape.moveTo(shapePts[0][0], shapePts[0][1]);
  for (var i = 1; i < shapePts.length; i++) {
    var p = shapePts[i];
    if (p.length === 4) shape.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else shape.lineTo(p[0], p[1]);
  }
  shape.closePath();
  var geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.5,
    bevelSize: thickness * 0.6, bevelSegments: 2, curveSegments: 14
  });
  geo.translate(0, 0, -thickness / 2);
  var u = uAxis.clone().normalize();
  var v = vAxis.clone().normalize();
  var w = new THREE.Vector3().crossVectors(u, v).normalize();
  v.crossVectors(w, u).normalize();
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(u, v, w));
  geo.computeVertexNormals();
  return geo;
}

/* --------------------------------------------------------- shader utils -- */
var NOISE_GLSL = [
  'float hash13(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }',
  'float vnoise(vec3 p){',
  '  vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);',
  '  float a = mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x),',
  '                    mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),',
  '                mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x),',
  '                    mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z);',
  '  return a;',
  '}',
  'float fbm3(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<3;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }'
].join('\n');

/* ============================================================ SCENA ====== */
export function createCinematicIntro(opts) {
  var canvas = opts.canvas;
  var tier = opts.tier || 'high';
  var deepColor = new THREE.Color(opts.waterColor || '#05070a');
  var lightColor = new THREE.Color(opts.lightColor || '#cfe6f2');
  var accentColor = new THREE.Color(opts.accentColor || '#f2a900');
  var skinColor = new THREE.Color(opts.sharkColor || '#1a2028');
  var enterDuration = clamp(opts.enterDuration || 2200, 1400, 4000) / 1000;
  var revealAt = clamp(opts.revealAt || 4500, 1500, 9000) / 1000;

  var TIERS = {
    low: { rings: 40, radial: 16, particles: 260, shafts: 3, dpr: 1.0, scale: 0.75, bloom: false, grain: 0.05 },
    mid: { rings: 60, radial: 22, particles: 700, shafts: 4, dpr: 1.5, scale: 0.9, bloom: true, grain: 0.055 },
    high: { rings: 84, radial: 30, particles: 1500, shafts: 6, dpr: 2.0, scale: 1.0, bloom: true, grain: 0.06 }
  };
  var cfg = TIERS[tier] || TIERS.high;

  /* ------------------------------------------------------------ renderer */
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas, alpha: false, antialias: false,
    powerPreference: 'high-performance', stencil: false, depth: true
  });
  renderer.setClearColor(deepColor, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.dpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  var scene = new THREE.Scene();

  var uTime = { value: 0 };
  var uSwim = { value: 1 };        // ampiezza dell'ondulazione (sale in accelerazione)
  var uSwimSpeed = { value: 1 };

  /* Fondale: gradiente verticale, più chiaro in alto (verso la superficie).
     È il pezzo che fa leggere lo squalo: un corpo scuro diventa silhouette
     solo se l'acqua dietro ha luminanza. Su fondo piatto nero sparirebbe
     davvero — "quasi invisibile" non vuol dire "assente". */
  var horizon = deepColor.clone().lerp(new THREE.Color('#16384e'), 0.85);
  /* Calcolato nello shader invece che da una texture: un gradiente così
     scuro quantizzato a 8 bit mostra bande orizzontali evidenti, qui invece
     viene dithered sotto la soglia di quantizzazione. */
  var backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(46, 24, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: horizon },
        uBottom: { value: deepColor },
        uTime: uTime
      },
      vertexShader: [
        'varying vec3 vWorldPos;',
        'void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorldPos = wp.xyz;',
        ' gl_Position = projectionMatrix * viewMatrix * wp; }'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uTop, uBottom; uniform float uTime; varying vec3 vWorldPos;',
        'float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }',
        'void main(){',
        '  float k = clamp(normalize(vWorldPos - cameraPosition).y * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 c = mix(uBottom, uTop, pow(k, 1.35));',
        '  c += (h21(gl_FragCoord.xy + fract(uTime) * 13.0) - 0.5) * 0.004;',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n'),
      side: THREE.BackSide, depthWrite: false, fog: false
    })
  );
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  // Foschia esponenziale: dissolve lo squalo nella profondità. Il colore è
  // la via di mezzo del fondale, così gli oggetti lontani ci si fondono.
  var fogColor = deepColor.clone().lerp(horizon, 0.55);
  scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.062);

  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
  camera.position.set(0, 0.25, 0);


  /* ------------------------------------------------------------- luci --- */
  // Ambiente basso ma non nullo: definisce il volume del corpo, il carattere
  // lo danno comunque i coni di luce dall'alto.
  scene.add(new THREE.HemisphereLight(0x5c93b8, 0x030910, 0.14));

  /* Il primo cono è piazzato dietro il punto in cui lo squalo attraversa
     (t≈3.0): è quello che viene occluso, la battuta in cui si capisce che
     c'è qualcosa senza ancora vederlo. */
  var shaftDefs = [
    { x: 3.6, z: -13.5, r: 1.1, tilt: 0.16, warm: 1.0, power: 1.0 },
    { x: -3.2, z: -9.5, r: 0.85, tilt: -0.2, warm: 0.0, power: 0.8 },
    { x: 3.1, z: -6.4, r: 0.7, tilt: 0.05, warm: 0.4, power: 0.5 },
    { x: 7.0, z: -16.0, r: 1.3, tilt: 0.24, warm: 0.15, power: 0.6 },
    { x: -6.8, z: -13.5, r: 1.0, tilt: -0.3, warm: 0.0, power: 0.5 },
    { x: -1.0, z: -17.5, r: 1.2, tilt: 0.08, warm: 0.5, power: 0.45 }
  ].slice(0, cfg.shafts);

  var keyLights = [];
  shaftDefs.slice(0, 3).forEach(function (d) {
    var col = lightColor.clone().lerp(accentColor, d.warm * 0.55);
    var sp = new THREE.SpotLight(col.getHex(), 0, 40, Math.PI / 7, 0.85, 1.1);
    sp.position.set(d.x, 9.5, d.z);
    sp.target.position.set(d.x + d.tilt * 8, -3, d.z);
    scene.add(sp);
    scene.add(sp.target);
    sp.userData.power = d.power;
    keyLights.push(sp);
  });

  /* ------------------------------------------ coni di luce volumetrici -- */
  var shaftMaterials = [];
  var shaftGroup = new THREE.Group();
  scene.add(shaftGroup);
  shaftDefs.forEach(function (d) {
    var h = 22;
    var rTop = d.r, rBot = d.r * 1.9;
    var geo = new THREE.CylinderGeometry(rTop, rBot, h, 32, 1, true);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uTime,
        uColor: { value: lightColor.clone().lerp(accentColor, d.warm * 0.5) },
        uOpacity: { value: 0 },
        uPower: { value: d.power },
        uHeight: { value: h },
        uRTop: { value: rTop },
        uRBot: { value: rBot }
      },
      vertexShader: [
        'varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormalW;',
        'void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position,1.0);',
        ' vWorld = wp.xyz; vNormalW = normalize(mat3(modelMatrix) * normal);',
        ' gl_Position = projectionMatrix * viewMatrix * wp; }'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime, uOpacity, uPower, uHeight, uRTop, uRBot;',
        'uniform vec3 uColor;',
        'varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormalW;',
        NOISE_GLSL,
        'void main(){',
        '  float ny = clamp(vLocal.y / uHeight + 0.5, 0.0, 1.0);',
        // Su un guscio ogni frammento sta ESATTAMENTE sulla superficie: la
        // distanza dall'asse è sempre 1 e non dice nulla. La densità
        // volumetrica è invece quanta luce attraversa il raggio, che è
        // massima al centro della silhouette (normale verso l'osservatore)
        // e nulla sui bordi radenti.
        '  float facing = clamp(dot(vNormalW, normalize(cameraPosition - vWorld)), 0.0, 1.0);',
        '  float core = pow(facing, 3.0);',
        // Il cono si spegne in basso e in alto: nessun bordo netto.
        '  float vert = smoothstep(0.06, 0.66, ny) * (1.0 - smoothstep(0.72, 1.0, ny) * 0.55);',
        '  float n = fbm3(vec3(vWorld.xz * 0.42, uTime * 0.055 + vWorld.y * 0.11));',
        '  float density = core * vert * mix(0.45, 1.35, n) * uPower;',
        '  gl_FragColor = vec4(uColor * density, density * uOpacity);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(d.x, 6.5, d.z);
    mesh.rotation.z = d.tilt;
    shaftGroup.add(mesh);
    shaftMaterials.push(mat);
  });

  /* ------------------------------------------------------- particolato -- */
  // Tre profondità con parallasse: un campo piatto di puntini si legge
  // subito come "effetto", tre strati si leggono come acqua.
  var particleLayers = [];
  var particleTex = (function () {
    var s = 48, c = document.createElement('canvas');
    c.width = c.height = s;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  })();

  [[0.35, 0.020, 7], [0.34, 0.038, 13], [0.31, 0.070, 20]].forEach(function (L, li) {
    var count = Math.round(cfg.particles * L[0]);
    var pos = new Float32Array(count * 3);
    var seed = new Float32Array(count);
    var spread = L[2];
    for (var i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread * 2.2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 1.3;
      pos[i * 3 + 2] = -1.5 - Math.random() * spread * 1.6;
      seed[i] = Math.random() * 100;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uTime, uSize: { value: L[1] * 620 },
        uOpacity: { value: 0 },
        uColor: { value: lightColor.clone().lerp(accentColor, 0.12) },
        uFogColor: { value: deepColor }, uFogDensity: { value: 0.062 }
      },
      vertexShader: [
        'attribute float aSeed; uniform float uTime, uSize;',
        'varying float vFade; varying float vDepth;',
        'void main(){',
        '  vec3 p = position;',
        '  p.x += sin(uTime * 0.16 + aSeed) * 0.32;',
        '  p.y += sin(uTime * 0.11 + aSeed * 1.7) * 0.26 + mod(uTime * 0.035 + aSeed, 4.0) * 0.10;',
        '  p.z += cos(uTime * 0.13 + aSeed) * 0.28;',
        '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
        '  vDepth = -mv.z;',
        '  vFade = 0.35 + 0.65 * abs(sin(uTime * 0.5 + aSeed * 3.1));',
        '  gl_PointSize = uSize / max(vDepth, 0.5);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor, uFogColor; uniform float uOpacity, uFogDensity;',
        'varying float vFade; varying float vDepth;',
        'void main(){',
        '  vec2 d = gl_PointCoord - 0.5;',
        '  float a = smoothstep(0.5, 0.0, length(d));',
        '  float f = 1.0 - exp(-pow(uFogDensity * vDepth, 2.0));',
        '  gl_FragColor = vec4(uColor, a * vFade * uOpacity * (1.0 - f));',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    var pts = new THREE.Points(geo, mat);
    pts.userData.parallax = 0.05 + li * 0.06;
    scene.add(pts);
    particleLayers.push(pts);
  });

  /* ------------------------------------------------------------ squalo -- */
  var sharkRoot = new THREE.Group();   // posizione + rotta nel mondo
  scene.add(sharkRoot);
  var sharkBody = new THREE.Group();   // orientamento del modello
  sharkRoot.add(sharkBody);

  /* Iniezione nello shader di MeshStandardMaterial:
     - ondulazione di nuoto nel vertex shader (una vera onda che percorre il
       corpo verso la coda: ruotare un "gruppo coda" si vede subito che è finto)
     - controombreggiatura dorso/ventre + caustiche animate nel fragment */
  function patchSkin(mat, isFin) {
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uSwim = uSwim;
      shader.uniforms.uSwimSpeed = uSwimSpeed;
      shader.uniforms.uCaustic = { value: isFin ? 0.35 : 1.0 };
      shader.uniforms.uCounter = { value: isFin ? 0.0 : 1.0 };
      shader.uniforms.uAccent = { value: accentColor };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', [
          '#include <common>',
          'uniform float uTime, uSwim, uSwimSpeed;',
          'varying vec3 vLocalPos;',
          'float swimWave(float z){',
          '  float amp = uSwim * mix(0.004, 0.135, smoothstep(1.3, -2.1, z));',
          '  return sin(z * 1.65 + uTime * 2.15 * uSwimSpeed) * amp;',
          '}',
          'float swimSlope(float z){',
          '  float amp = uSwim * mix(0.004, 0.135, smoothstep(1.3, -2.1, z));',
          '  return cos(z * 1.65 + uTime * 2.15 * uSwimSpeed) * amp * 1.65;',
          '}'
        ].join('\n'))
        .replace('#include <beginnormal_vertex>', [
          '#include <beginnormal_vertex>',
          // La normale segue la torsione dell'onda, altrimenti la luce
          // "scivola" sul corpo in modo innaturale.
          'float _sl = swimSlope(position.z);',
          'float _ca = cos(-_sl), _sa = sin(-_sl);',
          'objectNormal = vec3(objectNormal.x * _ca - objectNormal.z * _sa, objectNormal.y,',
          '                    objectNormal.x * _sa + objectNormal.z * _ca);'
        ].join('\n'))
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'transformed.x += swimWave(position.z);',
          'vLocalPos = transformed;'
        ].join('\n'));

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', [
          '#include <common>',
          'uniform float uTime, uCaustic, uCounter; uniform vec3 uAccent;',
          'varying vec3 vLocalPos;',
          NOISE_GLSL
        ].join('\n'))
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          // Controombreggiatura: dorso scurissimo, ventre appena più chiaro.
          'float _up = clamp(vLocalPos.y / 0.42, -1.0, 1.0);',
          'diffuseColor.rgb *= mix(1.0, mix(1.12, 0.40, smoothstep(-1.0, 1.0, _up)), uCounter);',
          // Caustiche: bande animate che scivolano sul dorso, mascherate
          // dall'orientamento verso l'alto. Sono in oro perché l'oro del
          // brand esiste solo come luce, mai come colore di riempimento.
          'float _c1 = fbm3(vec3(vLocalPos.xz * 2.4, uTime * 0.35));',
          'float _c2 = fbm3(vec3(vLocalPos.zx * 3.7 + 11.0, uTime * 0.27));',
          'float _caust = pow(clamp(1.0 - abs(_c1 - _c2) * 5.0, 0.0, 1.0), 2.5);',
          'float _mask = smoothstep(-0.1, 0.9, _up) * uCaustic;',
          'diffuseColor.rgb += uAccent * _caust * _mask * 0.03;'
        ].join('\n'));
    };
    mat.customProgramCacheKey = function () { return 'sudditalia-skin-' + (isFin ? 'fin' : 'body'); };
    return mat;
  }

  var skinMat = patchSkin(new THREE.MeshStandardMaterial({
    color: skinColor, roughness: 0.8, metalness: 0.04
  }), false);
  var finMat = patchSkin(new THREE.MeshStandardMaterial({
    color: skinColor.clone().multiplyScalar(0.55), roughness: 0.85,
    metalness: 0.05, side: THREE.DoubleSide
  }), true);

  var bodyMesh = new THREE.Mesh(buildBodyGeometry(cfg.rings, cfg.radial), skinMat);
  sharkBody.add(bodyMesh);

  /* Pinne. Le sagome hanno bordo d'uscita concavo (quadraticCurveTo):
     un triangolo dritto è la firma tipica del 3D "da template". */
  var X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, -1);
  var fins = [];
  function addFin(pts, thick, uAx, vAx, pos, name) {
    var m = new THREE.Mesh(makeBlade(pts, thick, uAx, vAx), finMat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.userData.z = pos[2];
    m.userData.name = name;
    sharkBody.add(m);
    fins.push(m);
    return m;
  }

  // Dorsale: alta, spiovente all'indietro, bordo d'uscita concavo.
  addFin([[0, 0], [0.30, 0.72, 0.86, 0.90], [0.72, 0.30, 0.86, 0.02], [0.40, -0.02]],
    0.045, Z, Y, [0, 0.33, 0.18], 'dorsal');
  // Seconda dorsale, molto piccola.
  addFin([[0, 0], [0.10, 0.19, 0.25, 0.22], [0.20, 0.06, 0.26, 0.0]],
    0.028, Z, Y, [0, 0.21, -1.42], 'dorsal2');
  // Pettorali: falciformi, inclinate verso il basso e all'indietro.
  var pecShape = [[0, 0], [0.30, 0.40, 0.95, 0.52], [0.62, 0.20, 0.52, -0.03]];
  addFin(pecShape, 0.036, Z, new THREE.Vector3(1, -0.42, 0), [0.27, -0.14, 0.52], 'pecR');
  addFin(pecShape, 0.036, Z, new THREE.Vector3(-1, -0.42, 0), [-0.27, -0.14, 0.52], 'pecL');
  // Pelviche e anale.
  var pelShape = [[0, 0], [0.12, 0.16, 0.34, 0.20], [0.24, 0.05, 0.20, -0.01]];
  addFin(pelShape, 0.026, Z, new THREE.Vector3(1, -0.62, 0), [0.16, -0.26, -0.95], 'pelR');
  addFin(pelShape, 0.026, Z, new THREE.Vector3(-1, -0.62, 0), [-0.16, -0.26, -0.95], 'pelL');
  addFin([[0, 0], [0.10, 0.16, 0.26, 0.18], [0.20, 0.05, 0.22, 0.0]],
    0.026, Z, new THREE.Vector3(0, -1, 0), [0, -0.20, -1.52], 'anal');
  // Caudale eterocerca: lobo superiore lungo, inferiore corto.
  var caudal = addFin(
    [[0, -0.34], [0.16, 0.30, 0.30, 0.96], [0.52, 0.52, 0.72, 0.10],
    [0.52, -0.18, 0.30, -0.50], [0.12, -0.44, 0, -0.34]],
    0.038, Z, Y, [0, 0.02, TAIL_Z], 'caudal');

  /* Branchie: cinque fessure per lato, leggermente incassate. */
  var gills = [];
  var gillMat = new THREE.MeshBasicMaterial({ color: 0x02040a, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  [1, -1].forEach(function (side) {
    for (var i = 0; i < 5; i++) {
      var gz = 0.94 - i * 0.105;
      var t = (gz - BODY_PROFILE[0][0]) / (TAIL_Z - BODY_PROFILE[0][0]);
      var s = sampleProfile(clamp01(t));
      var g = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.20), gillMat);
      g.position.set(side * s[1] * 0.985, s[3] - 0.02, gz);
      g.rotation.y = side * Math.PI / 2;
      g.rotation.z = side * 0.12;
      g.userData.phase = i * 0.34;
      g.userData.baseY = 1;
      gills.push(g);
      sharkBody.add(g);
    }
  });

  /* Occhio: l'unico punto che tiene uno speculare netto. */
  var eyes = [];
  var eyeMat = new THREE.MeshStandardMaterial({
    color: 0x05070c, roughness: 0.07, metalness: 0.0,
    emissive: accentColor, emissiveIntensity: 0.03
  });
  [1, -1].forEach(function (side) {
    var e = new THREE.Mesh(new THREE.SphereGeometry(0.042, 18, 14), eyeMat);
    e.position.set(side * 0.208, 0.055, 1.30);
    sharkBody.add(e);
    eyes.push(e);
  });

  /* Bocca. A riposo è solo una fessura scura sotto il muso: una mascella
     modellata a parte sporgerebbe dalla silhouette e si leggerebbe come un
     oggetto attaccato. L'apertura avviene solo nello scatto finale.
     Nessuna cavità modellata: qualunque volume abbastanza grande da
     leggersi si stacca dalla sagoma e diventa una palla nera sospesa.
     L'ingresso nella bocca lo raccontano l'affondo che riempie il frame e
     lo stacco al nero, non una geometria da attraversare. */
  var mouthGeo = new THREE.SphereGeometry(0.5, 20, 12);
  mouthGeo.scale(0.30, 0.038, 0.17);
  var mouth = new THREE.Mesh(mouthGeo, new THREE.MeshBasicMaterial({ color: 0x01030a }));
  mouth.position.set(0, -0.152, 1.28);
  mouth.rotation.x = -0.12;
  sharkBody.add(mouth);


  /* GLB opzionale: se configurato, sostituisce l'intera mesh procedurale
     mantenendo posizione, rotta e sequenza identiche. */
  var usingGlb = false;
  function loadGlb(url, loaderUrl, dracoPath) {
    return import(/* webpackIgnore: true */ loaderUrl).then(function (mod) {
      var loader = new mod.GLTFLoader();
      if (dracoPath) {
        return import(/* webpackIgnore: true */ dracoPath.loaderUrl).then(function (dm) {
          var d = new dm.DRACOLoader();
          d.setDecoderPath(dracoPath.decoderPath);
          loader.setDRACOLoader(d);
          return loader;
        });
      }
      return loader;
    }).then(function (loader) {
      return new Promise(function (res, rej) { loader.load(url, res, undefined, rej); });
    }).then(function (gltf) {
      var model = gltf.scene;
      // Normalizza il modello alla stessa scala/orientamento della mesh
      // procedurale, così tutta la coreografia resta valida.
      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3(); box.getSize(size);
      var center = new THREE.Vector3(); box.getCenter(center);
      var longest = Math.max(size.x, size.y, size.z);
      var s = 4.05 / (longest || 1);
      model.scale.setScalar(s);
      model.position.sub(center.multiplyScalar(s));
      if (size.x > size.z) model.rotation.y = -Math.PI / 2; // orienta il muso su +Z
      model.traverse(function (o) {
        if (o.isMesh && o.material) {
          o.material.envMapIntensity = 0.4;
          if ('roughness' in o.material) o.material.roughness = Math.max(o.material.roughness, 0.45);
        }
      });
      bodyMesh.visible = false;
      fins.forEach(function (f) { f.visible = false; });
      gills.forEach(function (g) { g.visible = false; });
      eyes.forEach(function (e) { e.visible = false; });
      jaw.visible = false;
      sharkBody.add(model);
      usingGlb = true;
      return true;
    });
  }

  /* -------------------------------------------------- post-processing --- */
  var quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var quadGeo = new THREE.PlaneGeometry(2, 2);
  var quadMesh = new THREE.Mesh(quadGeo, null);
  var quadScene = new THREE.Scene();
  quadScene.add(quadMesh);

  /* Tutta la catena di post lavora in LINEARE (il bloom sommato in spazio
     gamma produce aloni sporchi) e la conversione a sRGB avviene una volta
     sola, nel passo finale. Con target in sRGB il campionamento hardware
     riconvertirebbe in lineare e l'immagine uscirebbe scurita due volte. */
  function makeRT(w, h) {
    var rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: true, stencilBuffer: false
    });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return rt;
  }
  var rtScene = makeRT(2, 2);
  var rtBloomA = makeRT(2, 2);
  var rtBloomB = makeRT(2, 2);

  var brightMat = new THREE.RawShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.30 } },
    vertexShader: 'precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);} ',
    fragmentShader: [
      'precision highp float; uniform sampler2D tDiffuse; uniform float uThreshold; varying vec2 vUv;',
      'void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;',
      ' float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
      ' gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.32, l), 1.0); }'
    ].join('\n')
  });

  var blurMat = new THREE.RawShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: 'precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);} ',
    fragmentShader: [
      'precision highp float; uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;',
      'void main(){ vec3 s = vec3(0.0);',
      ' s += texture2D(tDiffuse, vUv - uDir * 4.0).rgb * 0.0162;',
      ' s += texture2D(tDiffuse, vUv - uDir * 3.0).rgb * 0.0540;',
      ' s += texture2D(tDiffuse, vUv - uDir * 2.0).rgb * 0.1216;',
      ' s += texture2D(tDiffuse, vUv - uDir * 1.0).rgb * 0.1946;',
      ' s += texture2D(tDiffuse, vUv).rgb                * 0.2270;',
      ' s += texture2D(tDiffuse, vUv + uDir * 1.0).rgb * 0.1946;',
      ' s += texture2D(tDiffuse, vUv + uDir * 2.0).rgb * 0.1216;',
      ' s += texture2D(tDiffuse, vUv + uDir * 3.0).rgb * 0.0540;',
      ' s += texture2D(tDiffuse, vUv + uDir * 4.0).rgb * 0.0162;',
      ' gl_FragColor = vec4(s, 1.0); }'
    ].join('\n')
  });

  var finalMat = new THREE.RawShaderMaterial({
    uniforms: {
      tScene: { value: null }, tBloom: { value: null },
      uTime: uTime, uBloom: { value: cfg.bloom ? 0.62 : 0.0 },
      uGrain: { value: cfg.grain }, uVignette: { value: 0.46 },
      uCA: { value: 0.0035 }, uBarrel: { value: 0.055 },
      uFade: { value: 0.0 }, uAspect: { value: 1 }
    },
    vertexShader: 'precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);} ',
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D tScene, tBloom;',
      'uniform float uTime, uBloom, uGrain, uVignette, uCA, uBarrel, uFade, uAspect;',
      'varying vec2 vUv;',
      'vec3 toSRGB(vec3 c){',
      '  c = max(c, vec3(0.0));',
      '  return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666)) - 0.055, step(vec3(0.0031308), c));',
      '}',
      'void main(){',
      '  vec2 uv = vUv - 0.5;',
      '  float r2 = dot(uv, uv);',
      // Distorsione barile: micro-curvatura da obiettivo reale.
      '  vec2 buv = uv * (1.0 + uBarrel * r2);',
      // Aberrazione cromatica crescente verso i bordi.
      '  vec2 dir = buv * uCA * (0.35 + r2 * 3.2);',
      '  vec2 c0 = clamp(buv + 0.5 + dir, 0.0, 1.0);',
      '  vec2 c1 = clamp(buv + 0.5,       0.0, 1.0);',
      '  vec2 c2 = clamp(buv + 0.5 - dir, 0.0, 1.0);',
      // Composizione in lineare.
      '  vec3 col = vec3(texture2D(tScene, c0).r, texture2D(tScene, c1).g, texture2D(tScene, c2).b);',
      '  col += texture2D(tBloom, c1).rgb * uBloom;',
      // Unica conversione a spazio display; grana e vignettatura dopo,
      // perché è lì che si comportano come su pellicola.
      '  col = toSRGB(col);',
      '  float v = smoothstep(0.92, 0.22, length(vec2(uv.x * uAspect, uv.y)) * 1.28);',
      '  col *= mix(1.0 - uVignette, 1.0, v);',
      // Grana: legata al tempo, altrimenti "sporca" sempre gli stessi pixel.
      '  float g = fract(sin(dot(vUv * vec2(1024.0, 768.0) + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);',
      '  col += (g - 0.5) * uGrain;',
      '  col *= uFade;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });

  function renderQuad(mat, target) {
    quadMesh.material = mat;
    renderer.setRenderTarget(target || null);
    renderer.render(quadScene, quadCam);
  }

  /* ------------------------------------------------------------ resize -- */
  var vw = 1, vh = 1;
  function resize() {
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    vw = w; vh = h;
    camera.aspect = w / h;
    // Su ritratto allarga il campo: altrimenti lo squalo esce dal frame.
    camera.fov = h > w ? 58 : 42;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    var dpr = renderer.getPixelRatio();
    var rw = Math.round(w * dpr * cfg.scale), rh = Math.round(h * dpr * cfg.scale);
    rtScene.setSize(rw, rh);
    rtBloomA.setSize(Math.round(rw / 4), Math.round(rh / 4));
    rtBloomB.setSize(Math.round(rw / 4), Math.round(rh / 4));
    finalMat.uniforms.uAspect.value = w / h;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ------------------------------------------------- coreografia ------- */
  /* Stazioni della sequenza: (t, posizione, imbardata, beccheggio).
     Il tempo è in secondi dall'avvio. Lo squalo entra da lontanissimo, taglia
     un cono di luce (occlusione), sfiora la luce di striscio, poi si ferma
     a osservare. */
  /* Il muso è su +Z, quindi yaw ≈ -π/2 mette lo squalo di profilo con la
     testa verso sinistra. Resta poco sopra: 3/4 anteriore, il taglio in cui
     si legge sia la lunghezza del corpo sia lo sguardo. Di muso o di coda
     non si leggerebbe affatto. Arriva da destra e si ferma sulla terza
     destra puntando dentro l'inquadratura. */
  var STATIONS = [
    { t: 0.00, p: [11.0, 1.80, -20.0], yaw: -1.30 },
    { t: 2.10, p: [6.20, 1.15, -14.5], yaw: -1.38 },
    { t: 3.00, p: [3.40, 0.60, -11.6], yaw: -1.44 },
    { t: 3.90, p: [2.60, 0.10, -8.40], yaw: -1.36 },
    { t: 4.70, p: [1.70, -0.26, -6.00], yaw: -1.24 },
    { t: 5.60, p: [1.20, -0.34, -5.00], yaw: -1.18 }
  ];
  var idleAnchor = new THREE.Vector3(1.20, -0.34, -5.00);

  var state = 'intro';       // intro → idle → entering → done
  var clock = new THREE.Clock();
  var elapsed = 0;
  var enterT = 0;
  var active = true;
  var rafId = null;
  var readyFired = false;
  var revealFired = false;
  var pointer = { tx: 0, ty: 0, x: 0, y: 0 };
  var camShake = { x: 0, y: 0 };
  var enterFrom = new THREE.Vector3();
  var enterYaw = 0;

  function stationAt(time) {
    var a = STATIONS[0], b = STATIONS[STATIONS.length - 1];
    for (var i = 0; i < STATIONS.length - 1; i++) {
      if (time >= STATIONS[i].t && time <= STATIONS[i + 1].t) { a = STATIONS[i]; b = STATIONS[i + 1]; break; }
      if (time > STATIONS[STATIONS.length - 1].t) { a = b = STATIONS[STATIONS.length - 1]; }
    }
    var span = (b.t - a.t) || 1;
    var k = smoothstep(0, 1, clamp01((time - a.t) / span));
    return {
      p: new THREE.Vector3(lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)),
      yaw: lerp(a.yaw, b.yaw, k)
    };
  }

  /* ------------------------------------------------------------- loop --- */
  function frame() {
    if (!active) { rafId = null; return; }
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    uTime.value = elapsed;

    pointer.x = damp(pointer.x, pointer.tx, 2.2, dt);
    pointer.y = damp(pointer.y, pointer.ty, 2.2, dt);

    /* --- Battuta 1-2: il nero, poi la luce che si risolve dal buio --- */
    var lightIn = smoothstep(0.75, 2.6, elapsed);
    shaftMaterials.forEach(function (m) { m.uniforms.uOpacity.value = lightIn * 0.3; });
    particleLayers.forEach(function (p) { p.material.uniforms.uOpacity.value = lightIn * 0.85; });
    keyLights.forEach(function (l) { l.intensity = lightIn * l.userData.power * 105; });
    finalMat.uniforms.uFade.value = smoothstep(0.15, 1.5, elapsed);

    /* --- Posizione e rotta dello squalo --- */
    if (state === 'intro' || state === 'idle') {
      var st = stationAt(elapsed);
      if (elapsed >= STATIONS[STATIONS.length - 1].t) {
        if (state === 'intro') state = 'idle';
        // Deriva lenta attorno al punto di osservazione + reazione al cursore.
        var wob = elapsed - STATIONS[STATIONS.length - 1].t;
        st.p.copy(idleAnchor);
        st.p.x += Math.sin(wob * 0.23) * 0.55 + pointer.x * 0.55;
        st.p.y += Math.sin(wob * 0.31 + 1.1) * 0.22 - pointer.y * 0.30;
        st.p.z += Math.sin(wob * 0.17) * 0.42;
        // Resta nell'intorno del 3/4: il cursore lo fa ruotare appena, non
        // lo porta mai di muso (dove la silhouette si perderebbe).
        st.yaw = -1.18 + Math.sin(wob * 0.21) * 0.10 + pointer.x * 0.16;
      }
      sharkRoot.position.lerp(st.p, 1 - Math.exp(-6 * dt));
      sharkBody.rotation.y = damp(sharkBody.rotation.y, st.yaw, 3.0, dt);
      sharkBody.rotation.z = damp(sharkBody.rotation.z, Math.sin(elapsed * 0.4) * 0.07 + pointer.x * 0.10, 2.0, dt);
      sharkBody.rotation.x = damp(sharkBody.rotation.x, pointer.y * 0.10, 2.0, dt);
      uSwim.value = damp(uSwim.value, 1.0, 2.0, dt);
      uSwimSpeed.value = damp(uSwimSpeed.value, 1.0, 2.0, dt);
    } else if (state === 'entering') {
      enterT += dt / enterDuration;
      var e = clamp01(enterT);

      // L'affondo resta di 3/4: di muso pieno il corpo scompare in
      // scorcio e restano solo occhi e bocca — un'immagine da maschera,
      // esattamente il registro che il concept esclude.
      var LUNGE_YAW = -0.44;

      if (e < 0.30) {
        // Vira dal 3/4 di riposo al 3/4 d'attacco e carica il colpo di coda.
        var k1 = smoothstep(0, 1, e / 0.30);
        sharkBody.rotation.y = lerp(enterYaw, LUNGE_YAW, k1);
        uSwim.value = lerp(1.0, 2.5, k1);
        uSwimSpeed.value = lerp(1.0, 3.4, k1);
        sharkRoot.position.lerp(enterFrom, 1 - Math.exp(-4 * dt));
      } else {
        // Scatta verso l'obiettivo. L'accelerazione è cubica: parte lenta e
        // arriva addosso — è lo scatto che deve sorprendere, non un jumpscare.
        var k2 = (e - 0.30) / 0.70;
        var acc = Math.pow(k2, 1.4);
        sharkBody.rotation.y = damp(sharkBody.rotation.y, LUNGE_YAW, 6, dt);
        sharkRoot.position.x = lerp(enterFrom.x, 0.55, smoothstep(0, 1, k2));
        sharkRoot.position.y = lerp(enterFrom.y, 0.05, smoothstep(0, 1, k2));
        sharkRoot.position.z = lerp(enterFrom.z, 0.45, acc);
        uSwim.value = lerp(2.5, 3.4, k2);
        uSwimSpeed.value = lerp(3.4, 5.0, k2);
        // La bocca si apre solo nell'ultimo terzo: prima è ancora "presenza".
        var jawK = smoothstep(0.35, 0.95, k2);
        mouth.scale.y = 1 + jawK * 2.5;
        mouth.position.y = -0.152 - jawK * 0.018;
        // Niente sguardo luminoso nell'ultimo istante: due punti d'oro nel
        // buio sono l'immagine da mostro che stiamo evitando.
        eyeMat.emissiveIntensity = 0.03 * (1 - smoothstep(0.20, 0.60, k2));
        camShake.x += (Math.random() - 0.5) * acc * 0.022;
        camShake.y += (Math.random() - 0.5) * acc * 0.022;
        finalMat.uniforms.uCA.value = 0.0035 + acc * 0.02;
        finalMat.uniforms.uBarrel.value = 0.055 + acc * 0.12;
        // Si stacca sul fotogramma forte: il nero arriva mentre l'affondo
        // è ancora leggibile, non quando la camera è dentro una mesh.
        if (k2 > 0.85 && opts.onBlackout) { opts.onBlackout(); opts.onBlackout = null; }
      }
      if (e >= 1 && state !== 'done') {
        state = 'done';
        if (opts.onComplete) opts.onComplete();
      }
    }

    /* --- Respiro, pinne, occhi --- */
    var breath = Math.sin(elapsed * 0.9);
    gills.forEach(function (g) {
      g.scale.x = 1 + Math.sin(elapsed * 1.5 + g.userData.phase) * 0.42 * (state === 'entering' ? 1.8 : 1.0);
    });
    if (!usingGlb) {
      // Le pinne seguono l'onda del corpo: senza questo "scollano" dal fianco.
      var amp = uSwim.value, spd = uSwimSpeed.value;
      fins.forEach(function (f) {
        var z = f.userData.z;
        var a = amp * lerp(0.004, 0.135, smoothstep(1.3, -2.1, z));
        f.position.x = (f.userData.name === 'pecR' ? 0.27 : f.userData.name === 'pecL' ? -0.27 :
          f.userData.name === 'pelR' ? 0.16 : f.userData.name === 'pelL' ? -0.16 : 0)
          + Math.sin(z * 1.65 + elapsed * 2.15 * spd) * a;
        f.rotation.y = -Math.cos(z * 1.65 + elapsed * 2.15 * spd) * a * 1.65;
        if (f.userData.name === 'pecR') f.rotation.z = Math.sin(elapsed * 0.7) * 0.09 + breath * 0.03;
        if (f.userData.name === 'pecL') f.rotation.z = -Math.sin(elapsed * 0.7 + 0.5) * 0.09 - breath * 0.03;
      });
      bodyMesh.scale.set(1 + breath * 0.008, 1 + breath * 0.010, 1);
    }

    /* --- Camera: micro-movimento continuo, mai bloccata --- */
    camShake.x = damp(camShake.x, 0, 3.0, dt);
    camShake.y = damp(camShake.y, 0, 3.0, dt);
    var drift = smoothstep(0, 3.0, elapsed);
    camera.position.x = damp(camera.position.x, pointer.x * 0.30 + camShake.x, 1.6, dt);
    camera.position.y = damp(camera.position.y, 0.25 - drift * 0.22 - pointer.y * 0.16 + Math.sin(elapsed * 0.42) * 0.055 + camShake.y, 1.6, dt);
    camera.position.z = damp(camera.position.z, state === 'entering' ? 0.55 : 0.0, 1.2, dt);
    camera.rotation.z = damp(camera.rotation.z, Math.sin(elapsed * 0.27) * 0.012, 1.5, dt);
    var look = state === 'done' ? sharkRoot.position :
      new THREE.Vector3(sharkRoot.position.x * 0.22, sharkRoot.position.y * 0.35 - 0.05, -6.0);
    camera.lookAt(look);
    camera.rotation.z += Math.sin(elapsed * 0.27) * 0.012;

    particleLayers.forEach(function (p) {
      p.position.x = -pointer.x * p.userData.parallax * 4.0;
      p.position.y = pointer.y * p.userData.parallax * 2.4;
    });

    /* --- Render: scena → bright → blur H/V → composite --- */
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);

    if (cfg.bloom) {
      brightMat.uniforms.tDiffuse.value = rtScene.texture;
      renderQuad(brightMat, rtBloomA);
      blurMat.uniforms.tDiffuse.value = rtBloomA.texture;
      blurMat.uniforms.uDir.value.set(1 / rtBloomA.width, 0);
      renderQuad(blurMat, rtBloomB);
      blurMat.uniforms.tDiffuse.value = rtBloomB.texture;
      blurMat.uniforms.uDir.value.set(0, 1 / rtBloomA.height);
      renderQuad(blurMat, rtBloomA);
      finalMat.uniforms.tBloom.value = rtBloomA.texture;
    } else {
      finalMat.uniforms.tBloom.value = rtScene.texture;
    }
    finalMat.uniforms.tScene.value = rtScene.texture;
    renderQuad(finalMat, null);

    if (!readyFired) { readyFired = true; if (opts.onReady) opts.onReady(); }
    if (!revealFired && elapsed >= revealAt) {
      revealFired = true;
      if (opts.onReveal) opts.onReveal();
    }
  }
  frame();

  /* --------------------------------------------------------------- API -- */
  return {
    loadModel: loadGlb,
    // Tempo di scena (secondi). Utile per QA e per diagnosticare device che
    // non reggono il framerate: la regia è a tempo, non a frame.
    getTime: function () { return elapsed; },
    updatePointer: function (nx, ny) {
      pointer.tx = clamp(nx, -1, 1);
      pointer.ty = clamp(ny, -1, 1);
    },
    trigger: function () {
      if (state === 'entering' || state === 'done') return;
      state = 'entering';
      enterT = 0;
      enterFrom.copy(sharkRoot.position);
      enterYaw = sharkBody.rotation.y;
    },
    isReadyForEnter: function () { return state === 'idle' || state === 'intro'; },
    setActive: function (on) {
      active = on;
      if (on && rafId === null) { clock.getDelta(); frame(); }
    },
    dispose: function () {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          var mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
      [brightMat, blurMat, finalMat].forEach(function (m) { m.dispose(); });
      quadGeo.dispose();
      rtScene.dispose(); rtBloomA.dispose(); rtBloomB.dispose();
      particleTex.dispose();
      renderer.dispose();
      var gl = renderer.getContext();
      var ext = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  };
}
