import * as THREE from "three";
import {
  makeArmorTexture,
  makeArmorRoughnessMap,
  makeCarbonTechTexture,
  makeCarbonNormalMap,
  makeEnergyGlowTexture,
} from "./textures";

/** +1 = character's left (+x when facing +z), -1 = character's right. */
export type Side = 1 | -1;

export interface FingerChain {
  prox: THREE.Group;
  mid: THREE.Group;
  dist: THREE.Group;
}

export interface ThumbChain {
  prox: THREE.Group;
  dist: THREE.Group;
}

export interface Hand {
  group: THREE.Group;
  fingers: FingerChain[];
  thumb: ThumbChain;
  side: Side;
}

/** Numeric, blendable pose & cybernetic energy channels. */
export interface Extras {
  curlL: number;
  curlR: number;
  spreadL: number;
  spreadR: number;
  energyPulse: number;
  mouthOpen: number;
  smile: number;
  browRaise: number;
  browInner: number;
  eyeClose: number;
  tongue: number;
  gazeX: number;
  gazeY: number;
}

export const EXTRA_KEYS: (keyof Extras)[] = [
  "curlL",
  "curlR",
  "spreadL",
  "spreadR",
  "energyPulse",
  "mouthOpen",
  "smile",
  "browRaise",
  "browInner",
  "eyeClose",
  "tongue",
  "gazeX",
  "gazeY",
];

export function defaultExtras(): Extras {
  return {
    curlL: 0.22,
    curlR: 0.22,
    spreadL: 0.08,
    spreadR: 0.08,
    energyPulse: 0.5,
    mouthOpen: 0,
    smile: 0,
    browRaise: 0,
    browInner: 0,
    eyeClose: 0,
    tongue: 0,
    gazeX: 0,
    gazeY: 0,
  };
}

export type NodeKey =
  | "root"
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "clavicleL"
  | "shoulderL"
  | "elbowL"
  | "wristL"
  | "clavicleR"
  | "shoulderR"
  | "elbowR"
  | "wristR"
  | "hipL"
  | "kneeL"
  | "ankleL"
  | "toeL"
  | "hipR"
  | "kneeR"
  | "ankleR"
  | "toeR";

export type Rig = Record<NodeKey, THREE.Group> & {
  nodes: THREE.Group[];
  bones: Record<string, THREE.Group>;
  handL: Hand;
  handR: Hand;
  energyMat: THREE.MeshStandardMaterial;
  meshes: THREE.Mesh[];
};

/** Proper human world-scale metrics (~7.26 units tall, calibrated to 8.6-unit doors, 5.5-unit cars & 4.2-unit chairs).
 *  Exact IK identity: L1 (1.64) + L2 (1.70) + ANK (0.42) === HIP (3.76). */
export const RIG_METRICS = {
  HIP: 3.76,
  L1: 1.64,
  L2: 1.70,
  ANK: 0.42,
  TOE_Y: -0.32,
  TOE_Z: 0.25,
  SOLE_THICK: 0.10,
  HEEL_BACK_Z: -0.22,
  HIP_X: 0.39,
} as const;

const BASE: Record<NodeKey, { p: [number, number, number]; r: [number, number, number] }> = {
  root: { p: [0, 0, 0], r: [0, 0, 0] },
  hips: { p: [0, RIG_METRICS.HIP, 0], r: [0, 0, 0] },
  spine: { p: [0, 0.34, 0], r: [0, 0, 0] },
  chest: { p: [0, 0.84, 0], r: [0, 0, 0] },
  neck: { p: [0, 1.08, -0.02], r: [0, 0, 0] },
  head: { p: [0, 0.42, 0.02], r: [0, 0, 0] },
  clavicleL: { p: [0.24, 0.92, 0], r: [0, 0, 0] },
  shoulderL: { p: [0.59, -0.04, 0], r: [0, 0, 0.085] },
  elbowL: { p: [0, -1.30, 0], r: [-0.12, 0, 0] },
  wristL: { p: [0, -1.18, 0], r: [0, 0, 0] },
  clavicleR: { p: [-0.24, 0.92, 0], r: [0, 0, 0] },
  shoulderR: { p: [-0.59, -0.04, 0], r: [0, 0, -0.085] },
  elbowR: { p: [0, -1.30, 0], r: [-0.12, 0, 0] },
  wristR: { p: [0, -1.18, 0], r: [0, 0, 0] },
  hipL: { p: [RIG_METRICS.HIP_X, 0, 0], r: [-0.02, 0, 0.022] },
  kneeL: { p: [0, -RIG_METRICS.L1, 0], r: [0.04, 0, 0] },
  ankleL: { p: [0, -RIG_METRICS.L2, 0], r: [-0.02, 0, -0.022] },
  toeL: { p: [0, RIG_METRICS.TOE_Y, RIG_METRICS.TOE_Z], r: [0, 0, 0] },
  hipR: { p: [-RIG_METRICS.HIP_X, 0, 0], r: [-0.02, 0, -0.022] },
  kneeR: { p: [0, -RIG_METRICS.L1, 0], r: [0.04, 0, 0] },
  ankleR: { p: [0, -RIG_METRICS.L2, 0], r: [-0.02, 0, 0.022] },
  toeR: { p: [0, RIG_METRICS.TOE_Y, RIG_METRICS.TOE_Z], r: [0, 0, 0] },
};

const NODE_KEYS = Object.keys(BASE) as NodeKey[];

export function resetPose(rig: Rig) {
  for (const k of NODE_KEYS) {
    const b = BASE[k];
    const n = rig[k];
    n.position.set(b.p[0], b.p[1], b.p[2]);
    n.rotation.set(b.r[0], b.r[1], b.r[2]);
  }
}

function setHandPose(h: Hand, curl: number, spread: number) {
  const splayFactors = [-1.1, -0.35, 0.35, 1.1];
  for (let i = 0; i < h.fingers.length; i++) {
    const f = h.fingers[i];
    const c = curl * (0.92 + i * 0.05);
    f.prox.rotation.set(-c * 1.15, 0, splayFactors[i] * spread * 0.28);
    f.mid.rotation.set(-c * 1.35, 0, 0);
    f.dist.rotation.set(-c * 1.05, 0, 0);
  }
  h.thumb.prox.rotation.set(-0.28 - curl * 0.65, h.side * (0.35 + curl * 0.25), h.side * (0.62 - curl * 0.42));
  h.thumb.dist.rotation.set(-0.18 - curl * 0.75, 0, 0);
}

export function applyExtras(rig: Rig, x: Extras) {
  setHandPose(rig.handL, x.curlL, x.spreadL);
  setHandPose(rig.handR, x.curlR, x.spreadR);
  rig.energyMat.emissiveIntensity = 2.35 + x.energyPulse * 0.75 - x.eyeClose * 0.35;
}

interface AddOpts {
  r?: [number, number, number];
  s?: [number, number, number];
  tiny?: boolean;
}

/** High-resolution spline-profiled LatheGeometry from [radius, y] control points. */
function sculptedLathe(pts: [number, number][], segs = 36): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)));
  return new THREE.LatheGeometry(curve.getPoints(pts.length * 7), segs);
}

/** Build a custom ovoid/facial 3D geometry with natural human-female jaw/chin forward profile and narrow temples. */
function buildSculptedHeadVisor(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 48, 36);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i); // -1 (chin) .. +1 (crown)
    let z = pos.getZ(i); // +1 (face) .. -1 (occiput)

    // Narrow feminine jaw & delicate chin taper below mid-head, fuller smooth cranium above
    const hNorm = (y + 1) * 0.5; // 0 = chin, 1 = crown
    const jawTaper = y < 0.05 ? 0.52 + 0.48 * Math.pow(Math.max(0, (y + 1) / 1.05), 0.68) : 1.0 - 0.08 * Math.pow((y - 0.05) / 0.95, 1.8);
    x *= 0.41 * jawTaper;

    // Sculpted sagittal depth: chin projects gracefully forward (+z), back of skull tucks cleanly above neck
    const frontProj = z > 0 ? 0.46 * (0.78 + 0.22 * Math.sin(hNorm * Math.PI * 0.88)) : 0.45 * (0.62 + 0.38 * Math.pow(hNorm, 0.55));
    z *= frontProj;
    if (y < 0) {
      // Subtle forward chin sweep & lifted sub-occipital base
      z += (1 - hNorm) * (z > -0.05 ? 0.085 : 0.14);
    }
    y = (y + 1) * 0.49; // 0 (chin tip) .. 0.98 (crown)
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Build the hyper-detailed 3D female cybernetic humanoid matching both front & back reference views. */
export function buildCharacter(): Rig {
  const meshes: THREE.Mesh[] = [];
  const bones: Record<string, THREE.Group> = {};

  const regBone = (name: string, parent?: THREE.Group) => {
    const g = new THREE.Group();
    g.name = name;
    if (parent) parent.add(g);
    bones[name] = g;
    return g;
  };

  const add = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    o: AddOpts = {}
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
    m.castShadow = !o.tiny;
    m.receiveShadow = true;
    parent.add(m);
    meshes.push(m);
    return m;
  };

  // ---------- Studio-Grade PBR Materials ----------
  const armorMap = makeArmorTexture();
  const armorRough = makeArmorRoughnessMap();
  const armorWhite = new THREE.MeshPhysicalMaterial({
    map: armorMap,
    roughnessMap: armorRough,
    color: 0xf6f9fe,
    roughness: 0.17,
    metalness: 0.09,
    clearcoat: 1.0,
    clearcoatRoughness: 0.09,
    reflectivity: 0.92,
  });

  const armorTrim = new THREE.MeshPhysicalMaterial({
    map: armorMap,
    color: 0xdde6f2,
    roughness: 0.24,
    metalness: 0.20,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14,
  });

  const carbonFrame = new THREE.MeshStandardMaterial({
    map: makeCarbonTechTexture(),
    normalMap: makeCarbonNormalMap(),
    normalScale: new THREE.Vector2(0.45, 0.45),
    color: 0x161b24,
    roughness: 0.40,
    metalness: 0.78,
  });

  const darkAlloy = new THREE.MeshStandardMaterial({
    color: 0x0c0f15,
    roughness: 0.30,
    metalness: 0.88,
  });

  const titaniumTrim = new THREE.MeshStandardMaterial({
    color: 0x6f7f94,
    roughness: 0.26,
    metalness: 0.92,
  });

  const energyGlowTex = makeEnergyGlowTexture();
  const energyMat = new THREE.MeshStandardMaterial({
    map: energyGlowTex,
    emissiveMap: energyGlowTex,
    color: 0x5cd8ff,
    emissive: 0x12a8ff,
    emissiveIntensity: 2.55,
    roughness: 0.12,
    metalness: 0.08,
    toneMapped: false,
  });

  // Shared high-smoothness primitive geometries
  const ringTorusG = new THREE.TorusGeometry(1, 0.125, 14, 36);
  const thinTorusG = new THREE.TorusGeometry(1, 0.065, 10, 36);
  const hubCylG = new THREE.CylinderGeometry(1, 1, 1, 28);
  const hiSphereG = new THREE.SphereGeometry(1, 36, 28);
  const midSphereG = new THREE.SphereGeometry(1, 22, 16);
  const unitBoxG = new THREE.BoxGeometry(1, 1, 1);
  const unitCapG = new THREE.CapsuleGeometry(1, 1, 8, 18);
  const hexShieldG = new THREE.CylinderGeometry(1, 0.82, 1, 6);

  /** Precision concentric rotary cyber-joint dial (dark alloy housing + titanium bezel + glowing cyan ring + center hub). */
  const addJointDial = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    radius: number,
    rotY: number,
    rotX = 0
  ) => {
    const dial = new THREE.Group();
    dial.position.set(x, y, z);
    dial.rotation.set(rotX, rotY, 0);
    parent.add(dial);
    add(dial, hubCylG, darkAlloy, 0, 0, 0, { r: [Math.PI / 2, 0, 0], s: [radius * 1.15, 0.06, radius * 1.15], tiny: true });
    add(dial, thinTorusG, titaniumTrim, 0, 0, 0.022, { s: [radius * 1.02, radius * 1.02, 0.7], tiny: true });
    add(dial, ringTorusG, energyMat, 0, 0, 0.028, { s: [radius * 0.76, radius * 0.76, 0.72], tiny: true });
    add(dial, hubCylG, carbonFrame, 0, 0, 0.034, { r: [Math.PI / 2, 0, 0], s: [radius * 0.44, 0.036, radius * 0.44], tiny: true });
    add(dial, midSphereG, titaniumTrim, 0, 0, 0.045, { s: [radius * 0.18, radius * 0.18, radius * 0.12], tiny: true });
  };

  /** Recessed glowing cyan energy channel (dark chamfered housing + glowing inner blade). */
  const addRecessedLight = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    len: number,
    depth: number,
    rot: [number, number, number] = [0, 0, 0]
  ) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(g);
    add(g, unitCapG, darkAlloy, 0, 0, 0, { s: [w, len, depth], tiny: true });
    add(g, unitCapG, energyMat, 0, 0, depth * 0.36, { s: [w * 0.46, len * 0.90, depth * 0.48], tiny: true });
  };

  // ---------- Core Skeleton Hierarchy ----------
  const root = regBone("root");
  const hips = regBone("hips", root);
  const spine = regBone("spine", hips);
  const chest = regBone("chest", spine);
  const neck = regBone("neck", chest);
  const head = regBone("head", neck);

  /* ==========================================================================
   * 1. PELVIS, HIPS, INGUINAL VENTS & SCULPTED GLUTES (Front + Back Reference)
   * ========================================================================== */
  // Underlying dark mechanical pelvic chassis
  const pelvisCoreG = sculptedLathe([
    [0.28, -0.46],
    [0.50, -0.32],
    [0.65, -0.08],
    [0.63, 0.18],
    [0.51, 0.39],
  ], 36);
  add(hips, pelvisCoreG, carbonFrame, 0, 0, 0, { s: [1.03, 1, 0.73] });

  // Sweeping feminine iliac hip-crest white armor shells (left & right outer hip flare)
  for (const s of [-1, 1] as Side[]) {
    add(hips, hiSphereG, armorWhite, s * 0.43, 0.04, 0.01, {
      r: [0.05, s * 0.18, -s * 0.24],
      s: [0.36, 0.40, 0.36],
    });
    // Deep dark gunmetal inguinal hip-crease channel + glowing cyan-blue diagonal strip (Front reference!)
    addRecessedLight(
      hips,
      s * 0.42,
      -0.14,
      0.31,
      0.082,
      0.36,
      0.068,
      [0.24, s * 0.28, s * 0.68]
    );
    // Upper-outer hip/glute concentric rotary joint dial (Back & Side reference!)
    addJointDial(hips, s * 0.68, 0.06, -0.16, 0.152, s * 1.26, 0.10);
  }

  // Front sculpted V-shaped white pelvic shield + upper pubic armor bridge
  add(hips, hiSphereG, armorWhite, 0, -0.08, 0.26, { s: [0.31, 0.41, 0.25] });
  add(hips, hiSphereG, armorWhite, 0, 0.20, 0.31, { s: [0.39, 0.22, 0.18] });
  // Crisp dark bevel seam framing the V-shield
  for (const s of [-1, 1] as Side[]) {
    add(hips, unitCapG, darkAlloy, s * 0.24, 0.05, 0.33, {
      r: [0.16, s * 0.22, s * 0.52],
      s: [0.022, 0.34, 0.025],
      tiny: true,
    });
  }

  // Back: smooth sculpted twin white gluteal armor shells + central sacral seam + sub-gluteal dark fold
  for (const s of [-1, 1] as Side[]) {
    add(hips, hiSphereG, armorWhite, s * 0.30, -0.09, -0.22, {
      r: [0.14, -s * 0.15, 0],
      s: [0.335, 0.385, 0.315],
    });
    // Sub-gluteal dark mechanical ring crease separating glute from hamstring
    add(hips, thinTorusG, darkAlloy, s * 0.31, -0.34, -0.16, {
      r: [1.35, -s * 0.15, 0],
      s: [0.27, 0.22, 0.5],
      tiny: true,
    });
  }
  // Central sacral mechanical spine terminator & gluteal cleft seam
  add(hips, unitBoxG, darkAlloy, 0, -0.04, -0.40, { r: [-0.08, 0, 0], s: [0.085, 0.64, 0.12], tiny: true });
  add(hips, hexShieldG, titaniumTrim, 0, 0.24, -0.39, { r: [Math.PI / 2, 0, 0], s: [0.11, 0.05, 0.14], tiny: true });
  add(hips, unitBoxG, energyMat, 0, 0.24, -0.42, { s: [0.036, 0.08, 0.02], tiny: true });

  /* ==========================================================================
   * 2. HOURGLASS WAIST, ABDOMINAL CORSET & LUMBAR SPINE (Front + Back Reference)
   * ========================================================================== */
  const waistCoreG = sculptedLathe([
    [0.52, -0.06],
    [0.46, 0.18],
    [0.44, 0.42],
    [0.49, 0.68],
    [0.59, 0.90],
  ], 36);
  add(spine, waistCoreG, carbonFrame, 0, 0, 0, { s: [1.0, 1, 0.73] });

  // Front: dark segmented 3-rib carbon abdominal core + cinched white oblique corset plates + lower white V-shield
  for (const [ay, aw] of [[0.22, 0.26], [0.42, 0.28], [0.62, 0.31]] as [number, number][]) {
    add(spine, unitBoxG, darkAlloy, 0, ay, 0.33, { s: [aw, 0.125, 0.075], tiny: true });
    add(spine, unitBoxG, titaniumTrim, 0, ay + 0.055, 0.355, { s: [aw * 0.88, 0.016, 0.03], tiny: true });
  }
  // Lower-abdomen white V-tapered center plate (right below dark ab core, matching Front reference!)
  add(spine, hiSphereG, armorWhite, 0, 0.02, 0.30, { s: [0.22, 0.22, 0.14] });

  for (const s of [-1, 1] as Side[]) {
    // Sweeping hourglass white oblique side-plates
    add(spine, hiSphereG, armorWhite, s * 0.31, 0.40, 0.05, {
      r: [0, s * 0.24, -s * 0.15],
      s: [0.265, 0.51, 0.33],
    });
    // Glowing cyan-blue vertical inner oblique seam strip (Front reference!)
    addRecessedLight(spine, s * 0.165, 0.42, 0.345, 0.032, 0.42, 0.03, [0, 0, -s * 0.08]);
    // Back lumbar diagonal hydraulic rib struts & glowing blue lateral vents (Back reference!)
    addRecessedLight(spine, s * 0.19, 0.38, -0.33, 0.042, 0.30, 0.036, [0.08, -s * 0.28, s * 0.36]);
  }

  // Back: 5 stacked interlocking lumbar vertebrae with titanium spinous fins & paired glowing cyan cores
  for (let i = 0; i < 5; i++) {
    const vy = 0.08 + i * 0.185;
    add(spine, unitBoxG, darkAlloy, 0, vy, -0.34, { s: [0.165, 0.135, 0.11], tiny: true });
    add(spine, unitBoxG, titaniumTrim, 0, vy, -0.385, { s: [0.055, 0.10, 0.04], tiny: true });
    for (const s of [-1, 1] as Side[]) {
      add(spine, unitBoxG, energyMat, s * 0.056, vy, -0.402, { s: [0.028, 0.068, 0.02], tiny: true });
    }
  }

  /* ==========================================================================
   * 3. CHEST, COLLAR, SCULPTED BUST ARMOR & SCAPULAR BACK (Front + Back Reference)
   * ========================================================================== */
  const chestCoreG = sculptedLathe([
    [0.55, -0.04],
    [0.65, 0.24],
    [0.72, 0.56],
    [0.68, 0.82],
    [0.50, 1.00],
    [0.28, 1.10],
  ], 36);
  add(chest, chestCoreG, carbonFrame, 0, 0, 0, { s: [1.02, 1, 0.73] });

  // White lateral ribcage & xiphoid shell
  const ribArmorG = sculptedLathe([
    [0.53, 0.02],
    [0.66, 0.28],
    [0.74, 0.58],
    [0.67, 0.84],
    [0.44, 1.00],
  ], 36);
  add(chest, ribArmorG, armorWhite, 0, 0, 0.01, { s: [1.03, 1, 0.69] });

  // Anatomically contoured twin teardrop white breastplates + dark sternum & underbust seams + collar yoke
  for (const s of [-1, 1] as Side[]) {
    // Primary sculpted teardrop bust cup
    add(chest, hiSphereG, armorWhite, s * 0.275, 0.49, 0.30, {
      r: [-0.18, s * 0.18, -s * 0.09],
      s: [0.302, 0.328, 0.315],
    });
    // Smooth upper-bust pectoral slope blending toward collarbone seam
    add(chest, hiSphereG, armorWhite, s * 0.255, 0.68, 0.24, {
      r: [-0.46, s * 0.16, -s * 0.14],
      s: [0.26, 0.21, 0.22],
    });
    // Dark contoured underbust bevel ring
    add(chest, thinTorusG, darkAlloy, s * 0.27, 0.34, 0.25, {
      r: [1.22, s * 0.18, 0],
      s: [0.27, 0.22, 0.48],
      tiny: true,
    });
    // White clavicle / collarbone armor plate separated by a crisp dark seam above the bust
    add(chest, hiSphereG, armorWhite, s * 0.31, 0.88, 0.14, {
      r: [-0.42, s * 0.16, -s * 0.25],
      s: [0.30, 0.15, 0.21],
    });
    // Dark collar V-recess + glowing cyan-blue collar bar (Front reference!)
    addRecessedLight(chest, s * 0.19, 0.96, 0.26, 0.036, 0.18, 0.032, [-0.38, s * 0.22, -s * 0.95]);
  }
  // Central dark sternum groove + upper-sternum glowing blue core node
  add(chest, unitBoxG, darkAlloy, 0, 0.54, 0.41, { r: [-0.08, 0, 0], s: [0.056, 0.56, 0.12], tiny: true });
  add(chest, unitBoxG, energyMat, 0, 0.78, 0.43, { r: [-0.22, 0, 0], s: [0.028, 0.15, 0.024], tiny: true });

  // Back: deep exposed dark thoracic spine channel + 6 vertebrae + V-winged white scapular plates with glowing slots
  add(chest, unitBoxG, darkAlloy, 0, 0.50, -0.41, { s: [0.23, 1.02, 0.15], tiny: true });
  for (let i = 0; i < 6; i++) {
    const vy = 0.06 + i * 0.175;
    add(chest, unitBoxG, carbonFrame, 0, vy, -0.47, { s: [0.175, 0.125, 0.075], tiny: true });
    add(chest, unitBoxG, titaniumTrim, 0, vy, -0.505, { s: [0.058, 0.095, 0.035], tiny: true });
    for (const s of [-1, 1] as Side[]) {
      add(chest, unitBoxG, energyMat, s * 0.060, vy, -0.515, { s: [0.028, 0.068, 0.022], tiny: true });
    }
  }
  for (const s of [-1, 1] as Side[]) {
    // Sculpted V-wing white scapular shoulder-blade armor
    add(chest, hiSphereG, armorWhite, s * 0.35, 0.57, -0.29, {
      r: [0.12, -s * 0.26, s * 0.20],
      s: [0.285, 0.44, 0.20],
    });
    // Prominent vertical recessed glowing cyan-blue scapular slot (Back reference!)
    addRecessedLight(chest, s * 0.22, 0.58, -0.475, 0.052, 0.28, 0.042, [0.08, -s * 0.16, s * 0.06]);
  }

  /* ==========================================================================
   * 4. MULTI-PISTON CYBERNETIC NECK & SCULPTED FACELESS OVOID HEAD
   * ========================================================================== */
  const neckCoreG = sculptedLathe([
    [0.245, -0.05],
    [0.20, 0.10],
    [0.188, 0.28],
    [0.208, 0.44],
  ], 28);
  add(neck, neckCoreG, carbonFrame, 0, 0, 0, { s: [0.94, 1, 0.92] });
  for (const ny of [0.08, 0.19, 0.30, 0.40]) {
    add(neck, thinTorusG, darkAlloy, 0, ny, 0, { r: [Math.PI / 2, 0, 0], s: [0.198, 0.198, 0.65], tiny: true });
  }
  for (const s of [-1, 1] as Side[]) {
    // V-angled sternocleidomastoid hydraulic cylinders + brushed silver piston rods (Front & Back reference!)
    add(neck, unitCapG, darkAlloy, s * 0.135, 0.20, 0.10, { r: [0.18, 0, s * 0.20], s: [0.034, 0.32, 0.034], tiny: true });
    add(neck, hubCylG, titaniumTrim, s * 0.115, 0.08, 0.13, { r: [0.18, 0, s * 0.20], s: [0.018, 0.18, 0.018], tiny: true });
    // Lateral braided dark cable bundles
    add(neck, unitCapG, carbonFrame, s * 0.165, 0.21, -0.04, { r: [-0.06, 0, s * 0.08], s: [0.032, 0.34, 0.032], tiny: true });
    // Recessed glowing cyan-blue vertical fiber-optic conduits (front throat & dorsal cervical spine!)
    add(neck, unitCapG, energyMat, s * 0.066, 0.19, 0.182, { r: [0.08, 0, s * 0.06], s: [0.015, 0.28, 0.015], tiny: true });
    add(neck, unitCapG, energyMat, s * 0.058, 0.21, -0.184, { s: [0.015, 0.32, 0.015], tiny: true });
  }
  // Dorsal cervical spine vertebrae continuing up the back of the neck
  for (const ny of [0.07, 0.19, 0.31]) {
    add(neck, unitBoxG, titaniumTrim, 0, ny, -0.185, { s: [0.06, 0.075, 0.05], tiny: true });
  }

  // Head: custom sculpted feminine ovoid faceless visor dome + jawline/occipital dark seams + glowing ear pods
  const visorGeo = buildSculptedHeadVisor();
  // Dark inner skull core (slightly inset so jawline & occipital panel gaps read razor-sharp!)
  add(head, visorGeo, darkAlloy, 0, 0.005, -0.008, { s: [0.985, 0.985, 0.985] });
  // Smooth uninterrupted pearl-white front visor & upper cranium
  add(head, visorGeo, armorWhite, 0, 0, 0.012, { s: [1.0, 1.0, 1.0] });

  // Crisp dark temple/jawline separation seam & horizontal back occipital seam (Front + Back reference!)
  add(head, thinTorusG, darkAlloy, 0, 0.48, -0.02, { r: [0.12, Math.PI / 2, 0], s: [0.45, 0.47, 0.42], tiny: true });
  add(head, thinTorusG, darkAlloy, 0, 0.56, -0.08, { r: [1.34, 0, 0], s: [0.39, 0.42, 0.42], tiny: true });
  // Central rear cervical notch + twin lower occipital white cheek/jaw plates (Back reference!)
  add(head, unitBoxG, darkAlloy, 0, 0.22, -0.34, { r: [0.28, 0, 0], s: [0.08, 0.28, 0.10], tiny: true });
  for (const s of [-1, 1] as Side[]) {
    add(head, hiSphereG, armorTrim, s * 0.19, 0.29, -0.22, {
      r: [0.28, -s * 0.38, 0],
      s: [0.19, 0.24, 0.19],
      tiny: true,
    });
    // Concentric glowing cyan-blue ear/temple sensor pod + sleek white outer C-arch
    addJointDial(head, s * 0.405, 0.51, -0.02, 0.142, (s * Math.PI) / 2);
    add(head, thinTorusG, armorWhite, s * 0.395, 0.51, -0.02, {
      r: [0, (s * Math.PI) / 2, 0],
      s: [0.168, 0.168, 0.85],
      tiny: true,
    });
  }

  /* ==========================================================================
   * 5. ARTICULATED 5-DIGIT CYBERNETIC HANDS
   * ========================================================================== */
  const buildHand = (side: Side, parent: THREE.Group): Hand => {
    const sideTag = side === 1 ? "L" : "R";
    const group = regBone(`hand${sideTag}`, parent);
    group.rotation.y = (-side * Math.PI) / 2;

    // Dark mechanical palm + sculpted white dorsal hand plate + knuckle bar
    add(group, hiSphereG, carbonFrame, 0, -0.145, 0, { s: [0.138, 0.158, 0.056], tiny: true });
    add(group, hiSphereG, armorWhite, 0, -0.138, -side * 0.022, { s: [0.134, 0.148, 0.048], tiny: true });
    add(group, unitBoxG, titaniumTrim, 0, -0.26, 0, { s: [0.24, 0.032, 0.065], tiny: true });

    const fingers: FingerChain[] = [];
    const fx = [-0.102, -0.034, 0.034, 0.102];
    const fl = [0.90, 1.0, 0.94, 0.78];
    for (let i = 0; i < 4; i++) {
      const L = fl[i];
      const prox = regBone(`finger${sideTag}_${i}_prox`, group);
      prox.position.set(fx[i], -0.285, 0);
      add(prox, midSphereG, darkAlloy, 0, 0, 0, { s: [0.029, 0.029, 0.029], tiny: true });
      add(prox, unitCapG, armorWhite, 0, -0.058 * L, 0, { s: [0.026, 0.068 * L, 0.026], tiny: true });

      const mid = regBone(`finger${sideTag}_${i}_mid`, prox);
      mid.position.set(0, -0.116 * L, 0);
      add(mid, midSphereG, darkAlloy, 0, 0, 0, { s: [0.024, 0.024, 0.024], tiny: true });
      add(mid, unitCapG, armorWhite, 0, -0.046 * L, 0, { s: [0.023, 0.052 * L, 0.023], tiny: true });

      const dist = regBone(`finger${sideTag}_${i}_dist`, mid);
      dist.position.set(0, -0.092 * L, 0);
      add(dist, unitCapG, darkAlloy, 0, -0.034 * L, 0, { s: [0.019, 0.038 * L, 0.019], tiny: true });

      fingers.push({ prox, mid, dist });
    }

    const thumbProx = regBone(`thumb${sideTag}_prox`, group);
    thumbProx.position.set(-0.128, -0.165, side * 0.030);
    add(thumbProx, midSphereG, darkAlloy, 0, 0, 0, { s: [0.032, 0.032, 0.032], tiny: true });
    add(thumbProx, unitCapG, armorWhite, 0, -0.055, 0, { s: [0.029, 0.058, 0.029], tiny: true });

    const thumbDist = regBone(`thumb${sideTag}_dist`, thumbProx);
    thumbDist.position.set(0, -0.108, 0);
    add(thumbDist, unitCapG, armorWhite, 0, -0.044, 0, { s: [0.024, 0.046, 0.024], tiny: true });

    return { group, fingers, thumb: { prox: thumbProx, dist: thumbDist }, side };
  };

  /* ==========================================================================
   * 6. SHOULDERS, PAULDRONS, ARMS, ELBOWS, FOREARMS & WRISTS
   * ========================================================================== */
  const upperArmCoreG = sculptedLathe([
    [0.15, -1.27],
    [0.175, -1.00],
    [0.20, -0.58],
    [0.212, -0.20],
    [0.18, 0.05],
  ], 28);
  const upperArmArmorG = sculptedLathe([
    [0.16, -1.14],
    [0.202, -0.88],
    [0.236, -0.54],
    [0.24, -0.22],
    [0.188, -0.02],
  ], 32);
  const forearmArmorG = sculptedLathe([
    [0.122, -1.13],
    [0.152, -0.88],
    [0.204, -0.52],
    [0.214, -0.22],
    [0.172, -0.02],
  ], 32);

  const buildArm = (side: Side) => {
    const sideTag = side === 1 ? "L" : "R";
    const clavicle = regBone(`clavicle${sideTag}`, chest);
    add(clavicle, unitCapG, carbonFrame, side * 0.27, -0.01, 0, {
      r: [0, 0, Math.PI / 2],
      s: [0.102, 0.42, 0.102],
      tiny: true,
    });

    const shoulder = regBone(`shoulder${sideTag}`, clavicle);
    shoulder.rotation.order = "YXZ";

    // Dark spherical deltoid actuator + compact rounded white pauldron + concentric glowing rotary dial
    add(shoulder, hiSphereG, carbonFrame, 0, 0, 0, { s: [0.255, 0.255, 0.255] });
    add(shoulder, hiSphereG, armorWhite, side * 0.036, 0.105, 0, {
      r: [0, 0, -side * 0.36],
      s: [0.305, 0.195, 0.295],
    });
    // Dark bevel trim beneath pauldron
    add(shoulder, thinTorusG, darkAlloy, side * 0.03, 0.04, 0, {
      r: [Math.PI / 2, 0, -side * 0.36],
      s: [0.27, 0.26, 0.5],
      tiny: true,
    });
    addJointDial(shoulder, side * 0.238, -0.025, 0.02, 0.122, (side * Math.PI) / 2);

    // Upper arm sculpted white armor + dark inner channel + recessed glowing cyan lateral strip
    add(shoulder, upperArmCoreG, carbonFrame, 0, 0, 0);
    add(shoulder, upperArmArmorG, armorWhite, side * 0.014, 0, 0, { s: [1.0, 1, 0.95] });
    addRecessedLight(shoulder, side * 0.218, -0.60, 0, 0.038, 0.46, 0.045, [0, (side * Math.PI) / 2, 0]);

    // Exposed mechanical dual-drum elbow hinge + brushed piston + lateral & medial glowing cyan rings
    const elbow = regBone(`elbow${sideTag}`, shoulder);
    add(elbow, hubCylG, darkAlloy, 0, 0, 0, { r: [0, 0, Math.PI / 2], s: [0.176, 0.35, 0.176] });
    add(elbow, hubCylG, titaniumTrim, 0, 0.08, -0.11, { s: [0.035, 0.20, 0.035], tiny: true });
    add(elbow, midSphereG, armorTrim, 0, 0.01, -0.135, { s: [0.12, 0.16, 0.11], tiny: true });
    addJointDial(elbow, side * 0.18, 0, 0, 0.105, (side * Math.PI) / 2);
    addJointDial(elbow, -side * 0.18, 0, 0, 0.088, (-side * Math.PI) / 2);

    // Tapered white forearm gauntlet + sweeping recessed glowing cyan energy channel
    add(elbow, forearmArmorG, armorWhite, 0, 0, 0, { s: [0.98, 1, 0.94] });
    addRecessedLight(
      elbow,
      side * 0.162,
      -0.60,
      0.025,
      0.038,
      0.46,
      0.042,
      [0.06, (side * Math.PI) / 2, -side * 0.06]
    );

    // Spherical dark wrist actuator + glowing cyan cuff ring
    const wrist = regBone(`wrist${sideTag}`, elbow);
    add(wrist, midSphereG, darkAlloy, 0, -0.025, 0, { s: [0.118, 0.106, 0.106], tiny: true });
    add(wrist, ringTorusG, energyMat, 0, -0.012, 0, { r: [Math.PI / 2, 0, 0], s: [0.115, 0.115, 0.42], tiny: true });
    const hand = buildHand(side, wrist);
    return { clavicle, shoulder, elbow, wrist, hand };
  };
  const armL = buildArm(1);
  const armR = buildArm(-1);

  /* ==========================================================================
   * 7. LEGS: FEMININE SCULPTED THIGHS, MECHANICAL KNEES, CALVES & HIGH-HEEL BOOTS
   * ========================================================================== */
  const thighCoreG = sculptedLathe([
    [0.20, -1.61],
    [0.245, -1.28],
    [0.312, -0.84],
    [0.362, -0.38],
    [0.338, -0.04],
    [0.255, 0.12],
  ], 34);

  const thighArmorG = sculptedLathe([
    [0.215, -1.48],
    [0.282, -1.16],
    [0.362, -0.74],
    [0.415, -0.32],
    [0.386, -0.02],
    [0.295, 0.12],
  ], 38);

  const calfCoreG = sculptedLathe([
    [0.138, -1.68],
    [0.165, -1.32],
    [0.238, -0.82],
    [0.262, -0.48],
    [0.214, -0.14],
    [0.188, 0.05],
  ], 32);

  const calfArmorG = sculptedLathe([
    [0.155, -1.56],
    [0.194, -1.24],
    [0.278, -0.78],
    [0.304, -0.46],
    [0.238, -0.14],
  ], 36);

  const buildLeg = (side: Side) => {
    const sideTag = side === 1 ? "L" : "R";
    const hip = regBone(`hip${sideTag}`, hips);

    // Dark mechanical thigh core + sculpted feminine white thigh armor
    add(hip, thighCoreG, carbonFrame, 0, 0, 0, { s: [0.98, 1, 1.04] });
    add(hip, thighArmorG, armorWhite, side * 0.018, 0, 0.012, { s: [1.0, 1, 1.05] });

    // Outer thigh sweeping white armor plate + signature diagonal front panel seam + outer recessed cyan channel
    add(hip, hiSphereG, armorWhite, side * 0.16, -0.54, 0.025, {
      r: [0, 0, -side * 0.08],
      s: [0.27, 0.68, 0.305],
    });
    // Diagonal dark panel seam across front of thigh (inner knee -> outer hip, matching Front reference!)
    add(hip, unitCapG, darkAlloy, side * 0.02, -0.84, 0.34, {
      r: [-0.09, side * 0.12, -side * 0.24],
      s: [0.018, 0.88, 0.022],
      tiny: true,
    });
    addRecessedLight(hip, side * 0.365, -0.76, 0.02, 0.046, 0.66, 0.055, [0, (side * Math.PI) / 2, 0]);

    // Rear hamstring central dark mechanical channel + glowing cyan lower-hamstring slits (Back reference!)
    add(hip, unitBoxG, darkAlloy, 0, -0.76, -0.34, { s: [0.078, 1.02, 0.075], tiny: true });
    addRecessedLight(hip, side * 0.105, -0.88, -0.335, 0.036, 0.48, 0.04, [0, Math.PI, -side * 0.13]);

    // Mechanical dual-axis knee joint + sculpted hexagonal shield kneecap + concentric cyan side rings + rear hydraulics
    const knee = regBone(`knee${sideTag}`, hip);
    add(knee, hubCylG, darkAlloy, 0, 0, -0.012, { r: [0, 0, Math.PI / 2], s: [0.225, 0.43, 0.225] });
    // Sculpted white shield patella floating cleanly in front of dark knee joint
    add(knee, hiSphereG, armorWhite, 0, 0.025, 0.215, { s: [0.178, 0.255, 0.12] });
    add(knee, thinTorusG, darkAlloy, 0, 0.025, 0.18, { s: [0.17, 0.24, 0.45], tiny: true });
    // Rear popliteal hydraulic linkage + twin glowing blue rear knee nodes (Back reference!)
    add(knee, unitBoxG, carbonFrame, 0, -0.02, -0.19, { s: [0.20, 0.30, 0.12], tiny: true });
    for (const ps of [-1, 1]) {
      add(knee, hubCylG, titaniumTrim, ps * 0.065, -0.02, -0.23, { s: [0.022, 0.24, 0.022], tiny: true });
      add(knee, midSphereG, energyMat, ps * 0.065, 0.02, -0.255, { s: [0.024, 0.024, 0.018], tiny: true });
    }
    addJointDial(knee, side * 0.222, 0, -0.012, 0.130, (side * Math.PI) / 2);
    addJointDial(knee, -side * 0.222, 0, -0.012, 0.112, (-side * Math.PI) / 2);

    // Contoured feminine calf & shin armor + curved front shin cyan vents + rear calf vertical energy blade
    add(knee, calfCoreG, carbonFrame, 0, 0, -0.024, { s: [0.96, 1, 1.04] });
    add(knee, calfArmorG, armorWhite, 0, 0, -0.018, { s: [0.98, 1, 1.06] });
    // Curved glowing cyan-blue shin energy vent (Front reference!)
    addRecessedLight(knee, side * 0.142, -0.82, 0.185, 0.042, 0.50, 0.045, [-0.09, side * 0.22, -side * 0.13]);
    // Back gastrocnemius sculpted calf shells + dark upper-calf actuator + glowing lower-calf vertical fin (Back reference!)
    add(knee, hiSphereG, armorWhite, 0, -0.56, -0.135, { s: [0.245, 0.42, 0.235] });
    add(knee, unitBoxG, darkAlloy, 0, -0.32, -0.24, { s: [0.11, 0.30, 0.08], tiny: true });
    addRecessedLight(knee, 0, -1.00, -0.225, 0.052, 0.46, 0.048, [-0.10, Math.PI, 0]);

    // Mechanical ankle + architectural high-heel cyber-boot (both heel tread & forefoot tread flush at y = -0.42!)
    const ankle = regBone(`ankle${sideTag}`, knee);
    add(ankle, hubCylG, darkAlloy, 0, 0, -0.025, { r: [0, 0, Math.PI / 2], s: [0.165, 0.33, 0.165] });
    addJointDial(ankle, side * 0.17, 0, -0.025, 0.096, (side * Math.PI) / 2);
    addJointDial(ankle, -side * 0.17, 0, -0.025, 0.085, (-side * Math.PI) / 2);

    // Sculpted white heel counter cup + chunky architectural block heel (bottom flush at y = -0.42, open arch in front!)
    add(ankle, hiSphereG, armorWhite, 0, -0.11, -0.10, { s: [0.178, 0.16, 0.178] });
    add(ankle, unitBoxG, armorWhite, 0, -0.275, -0.125, { s: [0.265, 0.24, 0.22] });
    add(ankle, unitBoxG, darkAlloy, 0, -0.405, -0.125, { s: [0.272, 0.03, 0.228], tiny: true }); // heel tread bottom = -0.42!

    // High-arched dark gunmetal bridge + white armored mid-instep plate + crisp dark cross-straps (matching reference boots!)
    add(ankle, unitBoxG, carbonFrame, 0, -0.195, 0.095, { r: [0.56, 0, 0], s: [0.255, 0.075, 0.34], tiny: true });
    add(ankle, hiSphereG, armorWhite, 0, -0.175, 0.11, { r: [0.52, 0, 0], s: [0.168, 0.078, 0.172] });
    add(ankle, thinTorusG, darkAlloy, 0, -0.11, 0.04, { r: [0.95, 0, 0], s: [0.175, 0.16, 0.55], tiny: true });

    // Articulated forefoot / toe box at [0, -0.32, 0.25] -> sole bottom at -0.32 - 0.10 = -0.42 = -ANK!
    const toe = regBone(`toe${sideTag}`, ankle);
    add(toe, hiSphereG, armorWhite, 0, 0.015, 0.17, { s: [0.186, 0.105, 0.28] });
    add(toe, unitBoxG, darkAlloy, 0, 0.035, 0.055, { r: [0.22, 0, 0], s: [0.32, 0.042, 0.075], tiny: true }); // dark forefoot strap
    add(toe, unitBoxG, darkAlloy, 0, -0.082, 0.17, { s: [0.325, 0.036, 0.46], tiny: true }); // forefoot sole bottom = -0.10 -> -0.42 total!

    return { hip, knee, ankle, toe };
  };
  const legL = buildLeg(1);
  const legR = buildLeg(-1);

  const rig: Rig = {
    root,
    hips,
    spine,
    chest,
    neck,
    head,
    clavicleL: armL.clavicle,
    shoulderL: armL.shoulder,
    elbowL: armL.elbow,
    wristL: armL.wrist,
    clavicleR: armR.clavicle,
    shoulderR: armR.shoulder,
    elbowR: armR.elbow,
    wristR: armR.wrist,
    hipL: legL.hip,
    kneeL: legL.knee,
    ankleL: legL.ankle,
    toeL: legL.toe,
    hipR: legR.hip,
    kneeR: legR.knee,
    ankleR: legR.ankle,
    toeR: legR.toe,
    nodes: [],
    bones,
    handL: armL.hand,
    handR: armR.hand,
    energyMat,
    meshes,
  };
  rig.nodes = NODE_KEYS.map((k) => rig[k]);
  resetPose(rig);
  applyExtras(rig, defaultExtras());
  return rig;
}
