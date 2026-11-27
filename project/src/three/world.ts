import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Batch, tex, speckle, std, mapped, boxCol, circleCol, rng, type Collider } from "./kit";

export const SUN_DIR = new THREE.Vector3(0.44, 0.58, 0.69).normalize();
export const MOON_DIR = new THREE.Vector3(-0.5, 0.78, -0.66).normalize();

/* ------------------------------ sky dome ------------------------------ */
export interface Sky {
  mesh: THREE.Mesh;
  uniforms: { uSun: { value: THREE.Vector3 }; uMoon: { value: THREE.Vector3 }; uDay: { value: number } };
  celestial: THREE.Group;
  update: (time: number, cameraPosition: THREE.Vector3, day: number) => void;
}

export function createSky(): Sky {
  const uniforms = {
    uSun: { value: SUN_DIR.clone() },
    uMoon: { value: MOON_DIR.clone() },
    uDay: { value: 1 },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSun;
      uniform vec3 uMoon;
      uniform float uDay;
      uniform float uTime;

      float hash31(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

        vec3 dayCol = mix(vec3(0.78, 0.87, 0.95), vec3(0.12, 0.33, 0.72), pow(h, 0.5));
        vec3 nightCol = mix(vec3(0.055, 0.08, 0.16), vec3(0.006, 0.013, 0.045), pow(h, 0.45));
        vec3 col = mix(nightCol, dayCol, uDay);

        float sunAmt = max(dot(dir, uSun), 0.0);
        col += vec3(1.0, 0.83, 0.58) * pow(sunAmt, 28.0) * 0.45 * uDay;
        col += vec3(1.0, 0.96, 0.84) * smoothstep(0.999904, 0.999976, sunAmt) * 3.8 * uDay;

        float moonAmt = max(dot(dir, uMoon), 0.0);
        col += vec3(0.42, 0.52, 0.86) * pow(moonAmt, 30.0) * 0.22 * (1.0 - uDay);
        col += vec3(0.90, 0.94, 1.0) * smoothstep(0.999912, 0.999978, moonAmt) * 3.0 * (1.0 - uDay);

        float horizon = pow(1.0 - abs(dir.y), 10.0);
        col += vec3(0.95, 0.55, 0.3) * horizon * 0.16 * (1.0 - uDay);

        vec3 sp = floor(dir * 240.0);
        float seed = hash31(sp);
        float twinkle = 0.72 + 0.28 * sin(uTime * (1.3 + seed * 3.1) + seed * 39.0);
        float clearOfSun = 1.0 - smoothstep(0.99980, 0.99997, sunAmt);
        float clearOfMoon = 1.0 - smoothstep(0.99980, 0.99997, moonAmt);
        float star = smoothstep(0.995, 1.0, seed) * smoothstep(-0.03, 0.3, dir.y) * (1.0 - uDay) * twinkle * clearOfSun * clearOfMoon;
        col += vec3(star * 2.4);

        gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1600, 32, 20), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;

  // Celestial sprites sit at astronomical scale around the camera-following sky dome.
  const celestial = new THREE.Group();
  const sunGroup = new THREE.Group();
  sunGroup.position.copy(SUN_DIR).multiplyScalar(1450);
  const sunDisk = new THREE.Mesh(
    new THREE.SphereGeometry(16, 24, 18),
    new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false })
  );
  const haloTexture = tex(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,247,220,0.9)");
    g.addColorStop(0.12, "rgba(255,226,160,0.48)");
    g.addColorStop(0.4, "rgba(255,195,115,0.14)");
    g.addColorStop(1, "rgba(255,195,115,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, false);
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, color: 0xffebc3, transparent: true, depthWrite: false, toneMapped: false }));
  sunHalo.scale.set(300, 300, 1);
  const sunOuterHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, color: 0xffd9a0, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
  sunOuterHalo.scale.set(520, 520, 1);
  sunGroup.add(sunOuterHalo, sunHalo, sunDisk);
  celestial.add(sunGroup);

  const moonGroup = new THREE.Group();
  moonGroup.position.copy(MOON_DIR).multiplyScalar(1450);
  const lunarMap = tex(256, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.38, h * 0.4, 2, w * 0.5, h * 0.5, w * 0.8);
    g.addColorStop(0, "#f5f4eb");
    g.addColorStop(0.55, "#d9dce2");
    g.addColorStop(1, "#8d96a7");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const craterRand = rng(1421);
    for (let i = 0; i < 85; i++) {
      const x = craterRand() * w, y = craterRand() * h;
      const radius = 1.5 + craterRand() * 10;
      if (Math.hypot(x - w * 0.5, y - h * 0.5) < radius + 16) continue;
      const cg = ctx.createRadialGradient(x - radius * 0.22, y - radius * 0.25, radius * 0.05, x, y, radius);
      cg.addColorStop(0, "rgba(255,255,250,0.22)");
      cg.addColorStop(0.72, "rgba(97,105,121,0.14)");
      cg.addColorStop(1, "rgba(42,48,62,0.3)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }, false);
  const moonDisk = new THREE.Mesh(
    new THREE.SphereGeometry(14.4, 24, 18),
    new THREE.MeshBasicMaterial({ map: lunarMap, color: 0xe8edff, toneMapped: false })
  );
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, color: 0x9dbaff, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
  moonHalo.scale.set(190, 190, 1);
  moonGroup.add(moonHalo, moonDisk);
  celestial.add(moonGroup);

  // Round star sprites twinkle independently instead of looking like a static grid.
  const starSeed = rng(84217);
  const starCount = 700;
  const starPositions = new Float32Array(starCount * 3);
  const starPhases = new Float32Array(starCount);
  const starSizes = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    let azimuth = 0, y = 0, radius = 0;
    let sunDot = 1, moonDot = 1;
    do {
      azimuth = starSeed() * Math.PI * 2;
      y = 0.03 + starSeed() * 0.97;
      radius = Math.sqrt(1 - y * y);
      sunDot = radius * Math.cos(azimuth) * SUN_DIR.x + y * SUN_DIR.y + radius * Math.sin(azimuth) * SUN_DIR.z;
      moonDot = radius * Math.cos(azimuth) * MOON_DIR.x + y * MOON_DIR.y + radius * Math.sin(azimuth) * MOON_DIR.z;
    } while (sunDot > 0.99998 || moonDot > 0.99998);
    starPositions[i * 3] = Math.cos(azimuth) * radius * 1450;
    starPositions[i * 3 + 1] = y * 1450;
    starPositions[i * 3 + 2] = Math.sin(azimuth) * radius * 1450;
    starPhases[i] = starSeed() * Math.PI * 2;
    starSizes[i] = 3.2 + starSeed() * 4.2;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute("aPhase", new THREE.BufferAttribute(starPhases, 1));
  starGeometry.setAttribute("aSize", new THREE.BufferAttribute(starSizes, 1));
  const starMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uDay: { value: 1 } },
    vertexShader: `
      attribute float aPhase; attribute float aSize;
      uniform float uTime;
      varying float vTwinkle;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vTwinkle = 0.62 + 0.38 * (0.5 + 0.5 * sin(uTime * (1.4 + aPhase * 0.3) + aPhase));
        gl_PointSize = clamp(aSize * (1250.0 / max(1.0, -mv.z)), 1.5, 8.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uDay; varying float vTwinkle;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float edge = 1.0 - smoothstep(0.28, 0.5, d);
        float glow = exp(-d * 9.0) * 0.55;
        float a = (edge + glow) * (1.0 - uDay) * vTwinkle;
        gl_FragColor = vec4(vec3(0.88, 0.94, 1.0), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  celestial.add(stars);

  return {
    mesh,
    uniforms,
    celestial,
    update: (time, cameraPosition, day) => {
      mesh.position.copy(cameraPosition);
      celestial.position.copy(cameraPosition);
      uniforms.uTime.value = time;
      uniforms.uDay.value = day;
      starMaterial.uniforms.uTime.value = time;
      starMaterial.uniforms.uDay.value = day;
      sunGroup.visible = day > 0.01;
      moonGroup.visible = day < 0.99;
    },
  };
}

/* ------------------------------ open world ------------------------------ */
const CELL = 200; // neighbourhood block pitch
const ROAD_W = 18;
const GRID = 24; // boundary-to-boundary is just under 10 km
const EDGE = GRID * CELL + 130;
export const WORLD_LIMIT = EDGE + 23;

const lineOffset = (i: number, phase: number) =>
  i === GRID ? 0 : Math.sin(i * 1.71 + phase) * 10 + Math.sin(i * 0.47 + phase) * 4;
const hx = Array.from({ length: GRID * 2 + 1 }, (_, i) => 100 + (i - GRID) * CELL + lineOffset(i, 0.4));
const hz = Array.from({ length: GRID * 2 + 1 }, (_, i) =>
  i === GRID + 1 ? 92 : -108 + (i - GRID) * CELL + lineOffset(i, 1.9)
);
const carriagewayWidth = (index: number) => index % 12 === 0 ? 46 : index % 4 === 0 ? 32 : index % 2 === 0 ? ROAD_W : 14;
const halfX = hx.map((_, i) => carriagewayWidth(i));
const halfZ = hz.map((_, i) => (i === GRID + 1 ? 24 : carriagewayWidth(i)));

/** Grid indices of the 4 uninterrupted perimeter roads bounding Frere Hall Park. */
const PARK_XI_MIN = 21;
const PARK_XI_MAX = 26;
const PARK_ZI_MIN = 22;
const PARK_ZI_MAX = 25;

/** Exact rectangular park bounds ending precisely at the inner edges of the 4 perimeter roads. */
export const PARK_BOUNDS = {
  minX: hx[PARK_XI_MIN] + halfX[PARK_XI_MIN] / 2,
  maxX: hx[PARK_XI_MAX] - halfX[PARK_XI_MAX] / 2,
  minZ: hz[PARK_ZI_MIN] + halfZ[PARK_ZI_MIN] / 2,
  maxZ: hz[PARK_ZI_MAX] - halfZ[PARK_ZI_MAX] / 2,
};

const inParkRect = (x: number, z: number, m = 0) =>
  x > PARK_BOUNDS.minX - m && x < PARK_BOUNDS.maxX + m && z > PARK_BOUNDS.minZ - m && z < PARK_BOUNDS.maxZ + m;

function freeRuns(start: number, end: number, cuts: Array<[number, number]>) {
  const sorted = cuts.map(([a, b]) => [Math.max(start, a), Math.min(end, b)] as [number, number])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const cut of sorted) {
    const last = merged[merged.length - 1];
    if (last && cut[0] <= last[1]) last[1] = Math.max(last[1], cut[1]);
    else merged.push([...cut]);
  }
  const runs: Array<[number, number]> = [];
  let at = start;
  for (const [a, b] of merged) { if (a > at) runs.push([at, a]); at = Math.max(at, b); }
  if (at < end) runs.push([at, end]);
  return runs;
}

interface WorldInstance { matrix: THREE.Matrix4; color?: THREE.Color }

/** Local batches keep the 10 km world from submitting invisible districts every frame. */
function addWorldInstances(
  scene: THREE.Scene,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  records: WorldInstance[],
  chunkSize = 800,
  castShadow = false,
  receiveShadow = false
) {
  const buckets = new Map<string, WorldInstance[]>();
  for (const record of records) {
    const e = record.matrix.elements;
    const key = `${Math.floor(e[12] / chunkSize)}:${Math.floor(e[14] / chunkSize)}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = []));
    bucket.push(record);
  }
  for (const bucket of buckets.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, bucket.length);
    bucket.forEach((record, i) => {
      mesh.setMatrixAt(i, record.matrix);
      if (record.color) mesh.setColorAt(i, record.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.frustumCulled = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    scene.add(mesh);
  }
}

export function buildOpenWorld(scene: THREE.Scene, colliders: Collider[]) {
  const r = rng(20261);
  const grass = mapped(
    tex(256, 256, (c, w, h) => speckle(c, w, h, "#4d8739", ["#3c7130", "#61a045", "#2e6126", "#79b255"], 5200, 4, 2)),
    1
  );
  const asphalt = mapped(
    tex(256, 256, (c, w, h) => speckle(c, w, h, "#3a3c40", ["#2b2d30", "#4b4e53", "#585b60"], 5200, 3, 8)),
    0.95
  );
  const asphaltNormal = tex(256, 256, (c, w, h) => {
    const img = c.createImageData(w, h);
    const rnd = rng(8801);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = 118 + Math.floor(rnd() * 28);
      img.data[i] = n;
      img.data[i + 1] = n + Math.floor(rnd() * 12);
      img.data[i + 2] = 244 + Math.floor(rnd() * 11);
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
  asphaltNormal.colorSpace = THREE.NoColorSpace;
  asphalt.normalMap = asphaltNormal;
  asphalt.normalScale.set(0.16, 0.16);
  asphalt.roughness = 0.9;
  const white = std(0xf7f5ed, 0.72);
  const signalMetal = std(0x20272b, 0.48, { metalness: 0.65 });
  // Street lights live only at Frere Hall (park lamps); the open world has none.
  const streetLights: { x: number; z: number; y: number }[] = [];

  // ground plane for the whole world
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  (ground.material as THREE.MeshStandardMaterial).map!.repeat.set(700, 700);
  scene.add(ground);

  const B = new Batch();
  const road = (x1: number, z1: number, x2: number, z2: number) => {
    const w = x2 - x1, d = z2 - z1;
    if (w <= 0 || d <= 0) return;
    B.box(asphalt, w, 0.14, d, (x1 + x2) / 2, 0.10, (z1 + z2) / 2, 0, 12);
  };

  // road grid (terminating cleanly at the 4 uninterrupted perimeter roads around Frere Hall Park)
  for (let zi = 0; zi < hz.length; zi++) {
    const z = hz[zi];
    const width = halfZ[zi];
    const cuts: Array<[number, number]> = zi > PARK_ZI_MIN && zi < PARK_ZI_MAX
      ? [[hx[PARK_XI_MIN], hx[PARK_XI_MAX]]]
      : [];
    for (const [x1, x2] of freeRuns(-EDGE, EDGE, cuts)) road(x1, z - width / 2, x2, z + width / 2);
  }
  for (let xi = 0; xi < hx.length; xi++) {
    const x = hx[xi];
    const width = halfX[xi];
    const cuts: Array<[number, number]> = xi > PARK_XI_MIN && xi < PARK_XI_MAX
      ? [[hz[PARK_ZI_MIN], hz[PARK_ZI_MAX]]]
      : [];
    for (const [z1, z2] of freeRuns(-EDGE, EDGE, cuts)) road(x - width / 2, z1, x + width / 2, z2);
  }

  // White broken centre lines clearly visible above asphalt on every single and double road.
  const dashG = new THREE.BoxGeometry(5.0, 0.045, 0.85);
  const dashes: WorldInstance[] = [];
  const m4 = new THREE.Matrix4();
  for (let zi = 0; zi < hz.length; zi++) {
    const z = hz[zi];
    const width = halfZ[zi];
    const horizontalCuts: Array<[number, number]> = hx.map((crossX, i) => [crossX - (halfX[i] / 2 + width / 2 + 3), crossX + (halfX[i] / 2 + width / 2 + 3)]);
    if (zi > PARK_ZI_MIN && zi < PARK_ZI_MAX) {
      horizontalCuts.push([hx[PARK_XI_MIN] - halfX[PARK_XI_MIN] / 2 - 3, hx[PARK_XI_MAX] + halfX[PARK_XI_MAX] / 2 + 3]);
    }
    if (zi === PARK_ZI_MAX) horizontalCuts.push([-14, 14]);
    for (const [runStart, runEnd] of freeRuns(-EDGE, EDGE, horizontalCuts)) {
      for (let x = runStart; x < runEnd; x += 15) {
        dashes.push({ matrix: m4.clone().makeTranslation(x, 0.21, z) });
      }
    }
  }
  for (let xi = 0; xi < hx.length; xi++) {
    const x = hx[xi];
    const width = halfX[xi];
    const verticalCuts: Array<[number, number]> = hz.map((crossZ, i) => [crossZ - (halfZ[i] / 2 + width / 2 + 3), crossZ + (halfZ[i] / 2 + width / 2 + 3)]);
    if (xi > PARK_XI_MIN && xi < PARK_XI_MAX) {
      verticalCuts.push([hz[PARK_ZI_MIN] - halfZ[PARK_ZI_MIN] / 2 - 3, hz[PARK_ZI_MAX] + halfZ[PARK_ZI_MAX] / 2 + 3]);
    }
    for (const [runStart, runEnd] of freeRuns(-EDGE, EDGE, verticalCuts)) {
      for (let z = runStart; z < runEnd; z += 15) {
        dashes.push({ matrix: m4.clone().makeTranslation(x, 0.21, z).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)) });
      }
    }
  }
  addWorldInstances(scene, dashG, white, dashes, 800, false, false);

  // Zebra crossings sit only at connected junctions, never drift onto the grass.
  const crossingRecords: WorldInstance[] = [];
  const crossingBar = new THREE.BoxGeometry(0.52, 0.04, 1);
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-0.36, -1.35); arrowShape.lineTo(0.36, -1.35);
  arrowShape.lineTo(0.36, 0.05); arrowShape.lineTo(0.92, 0.05);
  arrowShape.lineTo(0, 1.2); arrowShape.lineTo(-0.92, 0.05); arrowShape.lineTo(-0.36, 0.05); arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  for (let xi = 0; xi < hx.length; xi++) {
    if (xi % 4 !== 0) continue;
    for (let zi = 0; zi < hz.length; zi++) {
      if (zi % 4 !== 0) continue;
      if (xi >= PARK_XI_MIN && xi <= PARK_XI_MAX && zi >= PARK_ZI_MIN && zi <= PARK_ZI_MAX) continue;
      const x = hx[xi], z = hz[zi], widthX = halfX[xi], widthZ = halfZ[zi];
      // Four approaches: five broad bars across each carriageway (no medians, full width).
      for (const side of [-1, 1]) {
        for (let n = 0; n < 5; n++) {
          const alongX = x + side * (widthX / 2 + 3.2 + n * 0.92);
          const alongZ = z + side * (widthZ / 2 + 3.2 + n * 0.92);
          crossingRecords.push({ matrix: m4.clone().makeTranslation(alongX, 0.205, z).multiply(new THREE.Matrix4().makeScale(1, 1, Math.max(8, widthZ - 2))) });
          crossingRecords.push({ matrix: m4.clone().makeTranslation(x, 0.205, alongZ).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(1, 1, Math.max(8, widthX - 2))) });
        }
      }
      const innerX = widthX / 8;
      const outerX = (3 * widthX) / 8;
      const innerZ = widthZ / 8;
      const outerZ = (3 * widthZ) / 8;
      const arrowMarks: [number, number, number][] = [
        [x + outerX, z - widthZ / 2 - 15, 0],
        [x + innerX, z - widthZ / 2 - 15, -Math.PI / 2],
        [x - outerX, z + widthZ / 2 + 15, Math.PI],
        [x - innerX, z + widthZ / 2 + 15, Math.PI / 2],
        [x - widthX / 2 - 15, z - outerZ, Math.PI / 2],
        [x - widthX / 2 - 15, z - innerZ, 0],
        [x + widthX / 2 + 15, z + outerZ, -Math.PI / 2],
        [x + widthX / 2 + 15, z + innerZ, Math.PI],
      ];
      for (const [ax, az, yaw] of arrowMarks) B.add(white, arrowGeo, ax, 0.205, az, [Math.PI / 2, yaw, 0], [0.88, 1, 1]);
    }
  }
  addWorldInstances(scene, crossingBar, white, crossingRecords, 800, false, false);

  // Curb drains repeat along roads (street lights live only at Frere Hall).
  const drainMat = std(0x3c4142, 0.78, { metalness: 0.22 });
  const drainForHorizontal = (x: number, z: number) => B.box(drainMat, 1.35, 0.045, 0.56, x, 0.182, z);
  const drainForVertical = (x: number, z: number) => B.box(drainMat, 0.56, 0.045, 1.35, x, 0.182, z);
  for (let zi = 0; zi < hz.length; zi++) {
    const z = hz[zi], width = halfZ[zi];
    const cutRow = zi > PARK_ZI_MIN && zi < PARK_ZI_MAX;
    for (const side of [-1, 1]) {
      const curbZ = z + side * (width / 2 - 0.5);
      for (let x = -EDGE + 90; x < EDGE; x += 120) {
        if (cutRow && x > hx[PARK_XI_MIN] - 10 && x < hx[PARK_XI_MAX] + 10) continue;
        if (zi === PARK_ZI_MAX && Math.abs(x) < 16) continue;
        drainForHorizontal(x, curbZ);
      }
    }
  }
  for (let xi = 0; xi < hx.length; xi++) {
    const x = hx[xi], width = halfX[xi];
    const cutCol = xi > PARK_XI_MIN && xi < PARK_XI_MAX;
    for (const side of [-1, 1]) {
      const curbX = x + side * (width / 2 - 0.5);
      for (let z = -EDGE + 90; z < EDGE; z += 120) {
        if (cutCol && z > hz[PARK_ZI_MIN] - 10 && z < hz[PARK_ZI_MAX] + 10) continue;
        drainForVertical(curbX, z);
      }
    }
  }

  // Real 4-corner traffic lights at every road junction (strictly 30s countdown per phase, 60s full cycle).
  // No extra yellow time added outside the 30s timer: yellow lights up inside the final seconds of the 30s phase,
  // and the 3 separate bulbs (Red / Yellow / Green) physically turn ON and OFF in sync with the timer.
  const SIG_HALF = 30;
  const SIG_CYCLE = SIG_HALF * 2; // 60s total (30s per axis, timer strictly 30..1)
  const axisState = (t: number, axis: 0 | 1): { lamp: "green" | "amber" | "red"; remain: number } => {
    const inFirstHalf = t < SIG_HALF;
    const local = inFirstHalf ? t : t - SIG_HALF; // 0 .. <30
    const remain = Math.max(1, Math.min(30, Math.ceil(SIG_HALF - local)));
    const goingAxis = (axis === 0) === inFirstHalf;
    if (goingAxis) {
      if (remain > 3) return { lamp: "green", remain };
      if (remain === 3) return { lamp: "amber", remain };
      return { lamp: "red", remain };
    }
    return { lamp: remain <= 2 ? "amber" : "red", remain };
  };

  // Single merged template for pole + plinth + 3-bulb housing + weather cap + 3 visors + timer frame (facing local +Z).
  const sigPart = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.translate(x, y, z);
    for (const k of Object.keys(g.attributes)) {
      if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    }
    return g;
  };
  const sigParts: THREE.BufferGeometry[] = [
    sigPart(new THREE.BoxGeometry(0.46, 0.28, 0.46), 0, 0.14, 0),
    sigPart(new THREE.CylinderGeometry(0.13, 0.19, 5.5, 10), 0, 2.75, 0),
    sigPart(new THREE.BoxGeometry(0.96, 2.52, 0.72), 0, 6.65, 0),
    sigPart(new THREE.BoxGeometry(1.12, 0.14, 0.88), 0, 7.98, 0.04),
    sigPart(new THREE.BoxGeometry(1.06, 1.06, 0.18), 0, 4.55, 0.18),
  ];
  for (let n = 0; n < 3; n++) {
    const by = 7.40 - n * 0.75;
    sigParts.push(sigPart(new THREE.BoxGeometry(0.58, 0.08, 0.48), 0, by + 0.25, 0.48));
  }
  const signalBodyGeo = mergeGeometries(sigParts, false)!;
  sigParts.forEach((g) => g.dispose());

  const bulbGeo = new THREE.SphereGeometry(0.21, 12, 10);
  const timerGeo = new THREE.PlaneGeometry(0.96, 0.96);
  const dimRed = new THREE.Color(0x220a09), dimAmber = new THREE.Color(0x241a07), dimGreen = new THREE.Color(0x082210);
  const redLamp = new THREE.Color(0xff261b), amberLamp = new THREE.Color(0xffbe14), greenLamp = new THREE.Color(0x1ff068);
  const bulbMats: [
    [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial, THREE.MeshBasicMaterial],
    [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial, THREE.MeshBasicMaterial],
  ] = [
    [
      new THREE.MeshBasicMaterial({ color: dimRed.clone(), toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: dimAmber.clone(), toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: greenLamp.clone(), toneMapped: false }),
    ],
    [
      new THREE.MeshBasicMaterial({ color: redLamp.clone(), toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: dimAmber.clone(), toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: dimGreen.clone(), toneMapped: false }),
    ],
  ];

  const signalBodies: WorldInstance[] = [];
  const bulbsByAxisLamp: [[WorldInstance[], WorldInstance[], WorldInstance[]], [WorldInstance[], WorldInstance[], WorldInstance[]]] = [
    [[], [], []],
    [[], [], []],
  ];
  const timersByAxis: [WorldInstance[], WorldInstance[]] = [[], []];
  const rotM = new THREE.Matrix4();
  const localM = new THREE.Matrix4();

  for (let xi = 0; xi < hx.length; xi++) {
    for (let zi = 0; zi < hz.length; zi++) {
      // Skip only the interior of Frere Hall Park; all perimeter intersections & T-junctions keep 4-corner signals.
      if (xi > PARK_XI_MIN && xi < PARK_XI_MAX && zi > PARK_ZI_MIN && zi < PARK_ZI_MAX) continue;
      const x = hx[xi], z = hz[zi], wx = halfX[xi], wz = halfZ[zi];
      // Four corners of every road junction, each facing oncoming traffic along its road axis.
      const corners: Array<[number, number, 0 | 1, number]> = [
        [-1, 1, 0, Math.PI],
        [1, -1, 0, 0],
        [1, 1, 1, -Math.PI / 2],
        [-1, -1, 1, Math.PI / 2],
      ];
      for (const [sx, sz, axis, yaw] of corners) {
        const px = x + sx * (wx / 2 + 1.15);
        const pz = z + sz * (wz / 2 + 1.15);
        const baseM = m4.clone().makeTranslation(px, 0, pz).multiply(rotM.makeRotationY(yaw));
        signalBodies.push({ matrix: baseM });
        for (let n = 0; n < 3; n++) {
          const by = 7.40 - n * 0.75;
          bulbsByAxisLamp[axis][n].push({ matrix: baseM.clone().multiply(localM.makeTranslation(0, by, 0.36)) });
        }
        timersByAxis[axis].push({ matrix: baseM.clone().multiply(localM.makeTranslation(0, 4.55, 0.28)) });
        colliders.push(circleCol(px, pz, 0.5, 8.1));
      }
    }
  }

  addWorldInstances(scene, signalBodyGeo, signalMetal, signalBodies, 800, true, true);
  for (const axis of [0, 1] as const) {
    for (let n = 0; n < 3; n++) {
      addWorldInstances(scene, bulbGeo, bulbMats[axis][n], bulbsByAxisLamp[axis][n], 800, false, false);
    }
  }

  const timerDisplays: { axis: 0 | 1; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture }[] = [];
  for (const axis of [0, 1] as const) {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    timerDisplays.push({ axis, ctx, texture });
    const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    addWorldInstances(scene, timerGeo, mat, timersByAxis[axis], 800, false, false);
  }

  let lastSignalSec = -1;
  const updateSignals = (time: number) => {
    const sec = Math.floor(time);
    if (sec === lastSignalSec) return;
    lastSignalSec = sec;
    const t = sec % SIG_CYCLE;
    for (const d of timerDisplays) {
      const st = axisState(t, d.axis);
      const [mR, mA, mG] = bulbMats[d.axis];
      mR.color.copy(st.lamp === "red" ? redLamp : dimRed);
      mA.color.copy(st.lamp === "amber" ? amberLamp : dimAmber);
      mG.color.copy(st.lamp === "green" ? greenLamp : dimGreen);
      const c = d.ctx;
      c.fillStyle = "#05070a";
      c.fillRect(0, 0, 128, 128);
      c.strokeStyle = "#3a4148";
      c.lineWidth = 6;
      c.strokeRect(4, 4, 120, 120);
      c.fillStyle = st.lamp === "green" ? "#1ff068" : st.lamp === "amber" ? "#ffbe14" : "#ff261b";
      c.font = "900 76px Arial, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(String(st.remain), 64, 68);
      d.texture.needsUpdate = true;
    }
  };

  /* ---------- plots (empty, ready for future buildings) ---------- */
  const plotG = new THREE.PlaneGeometry(52, 52);
  const plots: WorldInstance[] = [];
  const col = new THREE.Color();
  const tones = [0x8a7a4e, 0x9c8a5c, 0x7d7450, 0xa8955f, 0x6f7c48, 0xb0a072];
  for (let kx = -GRID; kx < GRID; kx++) {
    for (let kz = -GRID; kz < GRID; kz++) {
      const ix = kx + GRID;
      const iz = kz + GRID;
      // Zero empty plots and zero random local lanes inside the rectangular Frere Hall Park.
      if (ix >= PARK_XI_MIN && ix < PARK_XI_MAX && iz >= PARK_ZI_MIN && iz < PARK_ZI_MAX) continue;
      const left = hx[ix] + halfX[ix] / 2;
      const right = hx[ix + 1] - halfX[ix + 1] / 2;
      const near = hz[iz] + halfZ[iz] / 2;
      const far = hz[iz + 1] - halfZ[iz + 1] / 2;
      const cellW = right - left;
      const cellD = far - near;
      // Vary parcel density block to block instead of stamping one repetitive subdivision.
      const cols = (Math.abs(kx * 7 + kz * 3) % 5 === 0) ? 2 : 3;
      const rows = (Math.abs(kx * 5 - kz * 11) % 6 === 0) ? 2 : 3;
      const plotW = Math.min(68, (cellW - (cols + 1) * 9) / cols);
      const plotD = Math.min(68, (cellD - (rows + 1) * 9) / rows);
      const gapX = (cellW - cols * plotW) / (cols + 1);
      const gapZ = (cellD - rows * plotD) / (rows + 1);
      // Short local lanes connect each parcel row directly to its surrounding streets.
      const laneX = Math.max(4.5, Math.min(6.5, gapX - 2.2));
      const laneZ = Math.max(4.5, Math.min(6.5, gapZ - 2.2));
      for (let i = 1; i < cols; i++) {
        const x = left + gapX + i * plotW + (i - 0.5) * gapX;
        B.box(asphalt, laneX, 0.14, cellD, x, 0.10, near + cellD / 2, 0, 12);
      }
      for (let j = 1; j < rows; j++) {
        const z = near + gapZ + j * plotD + (j - 0.5) * gapZ;
        B.box(asphalt, cellW, 0.14, laneZ, left + cellW / 2, 0.10, z, 0, 12);
      }
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = left + gapX + plotW / 2 + i * (plotW + gapX);
          const z = near + gapZ + plotD / 2 + j * (plotD + gapZ);
          plots.push({
            matrix: m4.clone().makeTranslation(x, 0.06, z)
              .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
              .multiply(new THREE.Matrix4().makeScale(plotW / 52, plotD / 52, 1)),
            color: col.setHex(tones[Math.floor(r() * tones.length)]).clone(),
          });
        }
      }
    }
  }
  addWorldInstances(scene, plotG, new THREE.MeshStandardMaterial({ roughness: 1 }), plots, 800, false, true);
  /* ---------- scattered street trees along the colony lanes ---------- */
  const trunkG = new THREE.CylinderGeometry(0.55, 0.95, 9, 7);
  const crownG = new THREE.IcosahedronGeometry(1, 1);
  const nTrees = 520;
  const trunkInstances: WorldInstance[] = [];
  const crownInstances: WorldInstance[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < nTrees; i++) {
    const axis = r() > 0.5;
    const line = Math.floor(r() * (2 * GRID)) - GRID;
    const along = -EDGE + r() * 2 * EDGE;
    const roadIndex = line + GRID;
    const roadWidth = axis ? halfZ[roadIndex] : halfX[roadIndex];
    const off = (roadWidth / 2 + 4.2) * (r() > 0.5 ? 1 : -1);
    const x = axis ? along : hx[roadIndex] + off;
    const z = axis ? hz[roadIndex] + off : along;
    if (inParkRect(x, z, 6)) { i--; continue; }
    const s = 0.85 + r() * 0.6;
    m4.compose(new THREE.Vector3(x, 4.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunkInstances.push({ matrix: m4.clone() });
    colliders.push(circleCol(x, z, 1.35 * s, 22 * s));
    for (let k = 0; k < 2; k++) {
      m4.compose(new THREE.Vector3(x + (r() - 0.5) * 2 * s, (10.5 + k * 3.4) * s, z + (r() - 0.5) * 2 * s), new THREE.Quaternion().setFromAxisAngle(up, r() * 6.28), new THREE.Vector3(4.6 * s, 3.5 * s, 4.6 * s));
      crownInstances.push({ matrix: m4.clone() });
    }
  }
  addWorldInstances(scene, trunkG, std(0x5b4330, 0.95), trunkInstances, 800, true, true);
  addWorldInstances(scene, crownG, std(0x3d7a35, 0.95, { flatShading: true }), crownInstances, 800, true, true);

  /* ---------- boundary walls at the map edges ---------- */
  const wallM = mapped(tex(256, 256, (c, w, h) => speckle(c, w, h, "#c9bda2", ["#b3a68b", "#d8cdb4"], 3000, 6, 15)), 0.92);
  const W = EDGE + 26;
  B.box(wallM, W * 2, 13, 3, 0, 6.5, -W, 0, 10);
  B.box(wallM, W * 2, 13, 3, 0, 6.5, W, 0, 10);
  B.box(wallM, 3, 13, W * 2, -W, 6.5, 0, 0, 10);
  B.box(wallM, 3, 13, W * 2, W, 6.5, 0, 0, 10);
  for (const s of [-1, 1]) {
    colliders.push(boxCol(0, s * W, W * 2, 4, undefined, 13));
    colliders.push(boxCol(s * W, 0, 4, W * 2, undefined, 13));
  }
  B.build(scene, true, true);
  updateSignals(0);
  return {
    grass,
    streetLights,
    update(time: number) {
      updateSignals(time);
    },
  };
}
