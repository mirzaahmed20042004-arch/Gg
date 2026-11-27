import * as THREE from "three";
import {
  makeArmorTexture,
  makeCarbonTechTexture,
  makeCarbonNormalMap,
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
  energyPulse: number; // 0..1 subtle cyan core modulation
  // Preserved compatibility channels so existing simulator code stays seamless
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
  /** Ordered array of primary articulated skeleton nodes for fast pose snapshot/blending. */
  nodes: THREE.Group[];
  /** Complete named dictionary of every articulated bone (including individual finger/thumb phalanges) for future bone control. */
  bones: Record<string, THREE.Group>;
  handL: Hand;
  handR: Hand;
  energyMat: THREE.MeshStandardMaterial;
  meshes: THREE.Mesh[];
};

/** Rest transforms for every primary skeleton node (local space).
 *  Leg lengths match exact analytical 2-bone IK: HIP = 3.08, L1 = 1.34, L2 = 1.40, ANK = 0.34 (1.34 + 1.40 + 0.34 = 3.08). */
export const RIG_METRICS = {
  HIP: 3.08,
  L1: 1.34,
  L2: 1.40,
  ANK: 0.34,
} as const;

const BASE: Record<NodeKey, { p: [number, number, number]; r: [number, number, number] }> = {
  root: { p: [0, 0, 0], r: [0, 0, 0] },
  hips: { p: [0, RIG_METRICS.HIP, 0], r: [0, 0, 0] },
  spine: { p: [0, 0.28, 0], r: [0, 0, 0] },
  chest: { p: [0, 0.68, 0], r: [0, 0, 0] },
  neck: { p: [0, 0.88, -0.015], r: [0, 0, 0] },
  head: { p: [0, 0.33, 0.015], r: [0, 0, 0] },
  clavicleL: { p: [0.20, 0.75, 0], r: [0, 0, 0] },
  shoulderL: { p: [0.49, -0.03, 0], r: [0, 0, 0.09] },
  elbowL: { p: [0, -1.06, 0], r: [-0.12, 0, 0] },
  wristL: { p: [0, -0.96, 0], r: [0, 0, 0] },
  clavicleR: { p: [-0.20, 0.75, 0], r: [0, 0, 0] },
  shoulderR: { p: [-0.49, -0.03, 0], r: [0, 0, -0.09] },
  elbowR: { p: [0, -1.06, 0], r: [-0.12, 0, 0] },
  wristR: { p: [0, -0.96, 0], r: [0, 0, 0] },
  hipL: { p: [0.32, 0, 0], r: [-0.02, 0, 0.024] },
  kneeL: { p: [0, -RIG_METRICS.L1, 0], r: [0.04, 0, 0] },
  ankleL: { p: [0, -RIG_METRICS.L2, 0], r: [-0.02, 0, -0.024] },
  toeL: { p: [0, -0.26, 0.20], r: [0, 0, 0] },
  hipR: { p: [-0.32, 0, 0], r: [-0.02, 0, -0.024] },
  kneeR: { p: [0, -RIG_METRICS.L1, 0], r: [0.04, 0, 0] },
  ankleR: { p: [0, -RIG_METRICS.L2, 0], r: [-0.02, 0, 0.024] },
  toeR: { p: [0, -0.26, 0.20], r: [0, 0, 0] },
};

const NODE_KEYS = Object.keys(BASE) as NodeKey[];

/** Reset every primary skeleton bone back to its anatomical rest transform. */
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

/** Apply articulated finger/thumb channels and subtle cyan energy modulation. */
export function applyExtras(rig: Rig, x: Extras) {
  setHandPose(rig.handL, x.curlL, x.spreadL);
  setHandPose(rig.handR, x.curlR, x.spreadR);
  rig.energyMat.emissiveIntensity = 2.1 + x.energyPulse * 0.7 - x.eyeClose * 0.5;
}

interface AddOpts {
  r?: [number, number, number];
  s?: [number, number, number];
  tiny?: boolean;
}

/** Build a smooth spline-profiled LatheGeometry from [radius, y] control points. */
function sculptedLathe(pts: [number, number][], segs = 28): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)));
  return new THREE.LatheGeometry(curve.getPoints(pts.length * 6), segs);
}

/** Build the realistic 3D female cybernetic humanoid matching both front & back reference views. */
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

  // ---------- PBR Materials matching the white-ceramic, dark-carbon & glowing-cyan reference ----------
  const armorWhite = new THREE.MeshPhysicalMaterial({
    map: makeArmorTexture(),
    color: 0xf4f7fc,
    roughness: 0.20,
    metalness: 0.08,
    clearcoat: 0.94,
    clearcoatRoughness: 0.12,
    reflectivity: 0.85,
  });

  const armorTrim = new THREE.MeshPhysicalMaterial({
    color: 0xdce4ef,
    roughness: 0.28,
    metalness: 0.18,
    clearcoat: 0.75,
    clearcoatRoughness: 0.2,
  });

  const carbonFrame = new THREE.MeshStandardMaterial({
    map: makeCarbonTechTexture(),
    normalMap: makeCarbonNormalMap(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    color: 0x181d26,
    roughness: 0.44,
    metalness: 0.74,
  });

  const darkAlloy = new THREE.MeshStandardMaterial({
    color: 0x10141b,
    roughness: 0.34,
    metalness: 0.86,
  });

  const energyMat = new THREE.MeshStandardMaterial({
    color: 0x38c8ff,
    emissive: 0x0a9cff,
    emissiveIntensity: 2.4,
    roughness: 0.18,
    metalness: 0.1,
    toneMapped: false,
  });

  // Reusable joint ring helper (dark alloy drum + concentric glowing blue ring)
  const ringTorusG = new THREE.TorusGeometry(1, 0.14, 10, 28);
  const hubCylG = new THREE.CylinderGeometry(1, 1, 1, 20);
  const unitSphereG = new THREE.SphereGeometry(1, 24, 18);
  const smallSphereG = new THREE.SphereGeometry(1, 16, 12);
  const unitBoxG = new THREE.BoxGeometry(1, 1, 1);
  const unitCapG = new THREE.CapsuleGeometry(1, 1, 6, 14);

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
    add(dial, hubCylG, darkAlloy, 0, 0, 0, { r: [Math.PI / 2, 0, 0], s: [radius * 1.12, 0.05, radius * 1.12], tiny: true });
    add(dial, ringTorusG, energyMat, 0, 0, 0.022, { s: [radius * 0.78, radius * 0.78, 0.65], tiny: true });
    add(dial, hubCylG, carbonFrame, 0, 0, 0.028, { r: [Math.PI / 2, 0, 0], s: [radius * 0.44, 0.03, radius * 0.44], tiny: true });
  };

  // ---------- Core Skeleton Hierarchy ----------
  const root = regBone("root");
  const hips = regBone("hips", root);
  const spine = regBone("spine", hips);
  const chest = regBone("chest", spine);
  const neck = regBone("neck", chest);
  const head = regBone("head", neck);

  /* ==========================================================================
   * 1. PELVIS, HIPS & GLUTES (Front V-plate + glowing inguinal strips + Back sculpted glutes)
   * ========================================================================== */
  // Inner dark mechanical pelvic core
  const pelvisCoreG = sculptedLathe([
    [0.24, -0.38],
    [0.42, -0.26],
    [0.54, -0.06],
    [0.52, 0.16],
    [0.42, 0.32],
  ], 28);
  add(hips, pelvisCoreG, carbonFrame, 0, 0, 0, { s: [1.02, 1, 0.74] });

  // Sweeping white outer iliac hip wings (feminine athletic hourglass hip flare)
  const hipShellG = sculptedLathe([
    [0.18, -0.39],
    [0.34, -0.28],
    [0.58, -0.08],
    [0.64, 0.10],
    [0.54, 0.27],
    [0.43, 0.34],
  ], 32);
  add(hips, hipShellG, armorWhite, 0, 0.02, 0.01, { s: [1.04, 0.96, 0.72] });

  // Dark inguinal leg-socket cutouts + diagonal glowing blue energy strips (front)
  for (const s of [-1, 1] as Side[]) {
    add(hips, unitCapG, darkAlloy, s * 0.34, -0.13, 0.25, {
      r: [0.22, s * 0.25, s * 0.68],
      s: [0.075, 0.28, 0.06],
      tiny: true,
    });
    add(hips, unitCapG, energyMat, s * 0.35, -0.11, 0.285, {
      r: [0.22, s * 0.25, s * 0.68],
      s: [0.022, 0.24, 0.022],
      tiny: true,
    });
    // Upper-outer hip/glute circular glowing rotary joint dial (visible in back & side views)
    addJointDial(hips, s * 0.56, 0.05, -0.14, 0.125, s * 1.25, 0.1);
  }

  // Front sculpted white V-cut pelvic shield
  add(hips, unitSphereG, armorWhite, 0, -0.06, 0.22, { s: [0.28, 0.34, 0.22] });
  add(hips, unitSphereG, armorWhite, 0, 0.16, 0.26, { s: [0.34, 0.20, 0.16] });

  // Back sculpted twin white gluteal armor shells + central dark sacral mechanical seam
  for (const s of [-1, 1] as Side[]) {
    add(hips, unitSphereG, armorWhite, s * 0.245, -0.08, -0.18, {
      r: [0.12, -s * 0.14, 0],
      s: [0.265, 0.31, 0.255],
    });
  }
  add(hips, unitBoxG, darkAlloy, 0, -0.02, -0.33, { r: [-0.08, 0, 0], s: [0.075, 0.52, 0.10], tiny: true });

  /* ==========================================================================
   * 2. WAIST / LUMBAR SPINE (Narrow hourglass midriff, dark abs core + white obliques + glowing dorsal spine)
   * ========================================================================== */
  // Dark segmented mechanical abdominal & lumbar core
  const waistCoreG = sculptedLathe([
    [0.43, -0.06],
    [0.39, 0.14],
    [0.37, 0.34],
    [0.41, 0.56],
    [0.49, 0.74],
  ], 28);
  add(spine, waistCoreG, carbonFrame, 0, 0, 0, { s: [1.0, 1, 0.74] });

  // Sculpted white oblique side-corset plates (front-left & front-right framing the dark ab panel)
  for (const s of [-1, 1] as Side[]) {
    add(spine, unitSphereG, armorWhite, s * 0.25, 0.33, 0.04, {
      r: [0, s * 0.22, -s * 0.14],
      s: [0.22, 0.42, 0.27],
    });
    // Subtle glowing blue vertical waist seam line between dark abs and white obliques
    add(spine, unitCapG, energyMat, s * 0.135, 0.34, 0.285, {
      r: [0, 0, -s * 0.08],
      s: [0.014, 0.36, 0.014],
      tiny: true,
    });
  }
  // Horizontal dark ab armor segmentation bars (front center)
  for (const ay of [0.16, 0.32, 0.48]) {
    add(spine, unitBoxG, darkAlloy, 0, ay, 0.275, { s: [0.22, 0.09, 0.06], tiny: true });
  }

  // Lumbar dorsal spine vertebrae + paired glowing blue energy nodes (back)
  for (let i = 0; i < 4; i++) {
    const vy = 0.08 + i * 0.17;
    add(spine, unitBoxG, darkAlloy, 0, vy, -0.28, { s: [0.13, 0.11, 0.09], tiny: true });
    for (const s of [-1, 1] as Side[]) {
      add(spine, unitBoxG, energyMat, s * 0.048, vy, -0.328, { s: [0.024, 0.055, 0.018], tiny: true });
    }
  }

  /* ==========================================================================
   * 3. CHEST / RIBCAGE / BUST ARMOR & SCAPULAR BACK
   * ========================================================================== */
  // Underlying dark thoracic mechanical ribcage
  const chestCoreG = sculptedLathe([
    [0.46, -0.04],
    [0.54, 0.20],
    [0.60, 0.46],
    [0.57, 0.68],
    [0.42, 0.82],
    [0.24, 0.90],
  ], 30);
  add(chest, chestCoreG, carbonFrame, 0, 0, 0, { s: [1.02, 1, 0.74] });

  // Upper ribcage white lateral & sternum shell
  const ribArmorG = sculptedLathe([
    [0.44, 0.02],
    [0.55, 0.24],
    [0.62, 0.48],
    [0.56, 0.70],
    [0.37, 0.83],
  ], 32);
  add(chest, ribArmorG, armorWhite, 0, 0, 0.01, { s: [1.03, 1, 0.70] });

  // Anatomically proportioned twin contoured white breastplate shells + central sternum seam
  for (const s of [-1, 1] as Side[]) {
    add(chest, unitSphereG, armorWhite, s * 0.225, 0.40, 0.25, {
      r: [-0.16, s * 0.18, -s * 0.08],
      s: [0.245, 0.265, 0.255],
    });
    // Upper pectoral / clavicle white bridge plate
    add(chest, unitSphereG, armorWhite, s * 0.24, 0.68, 0.13, {
      r: [-0.38, s * 0.15, -s * 0.22],
      s: [0.24, 0.15, 0.18],
    });
    // Glowing blue collar / clavicle accent bar (front)
    add(chest, unitBoxG, energyMat, s * 0.16, 0.78, 0.22, {
      r: [-0.35, s * 0.2, -s * 0.28],
      s: [0.13, 0.024, 0.024],
      tiny: true,
    });
  }
  // Dark central sternum recess between breastplates + subtle glowing core slit
  add(chest, unitBoxG, darkAlloy, 0, 0.43, 0.34, { r: [-0.08, 0, 0], s: [0.048, 0.44, 0.10], tiny: true });
  add(chest, unitBoxG, energyMat, 0, 0.62, 0.355, { r: [-0.2, 0, 0], s: [0.02, 0.12, 0.02], tiny: true });

  // Back: recessed dark thoracic spine channel + twin V-tapered white scapular plates with glowing blue slots
  add(chest, unitBoxG, darkAlloy, 0, 0.40, -0.34, { s: [0.18, 0.84, 0.12], tiny: true });
  for (let i = 0; i < 5; i++) {
    const vy = 0.06 + i * 0.17;
    add(chest, unitBoxG, carbonFrame, 0, vy, -0.39, { s: [0.14, 0.11, 0.06], tiny: true });
    for (const s of [-1, 1] as Side[]) {
      add(chest, unitBoxG, energyMat, s * 0.048, vy, -0.422, { s: [0.024, 0.06, 0.018], tiny: true });
    }
  }
  for (const s of [-1, 1] as Side[]) {
    // Sculpted white scapular wing plate
    add(chest, unitSphereG, armorWhite, s * 0.28, 0.46, -0.24, {
      r: [0.12, -s * 0.24, s * 0.18],
      s: [0.23, 0.36, 0.16],
    });
    // Vertical glowing blue scapular slot (prominent in back reference)
    add(chest, unitBoxG, darkAlloy, s * 0.18, 0.47, -0.385, {
      r: [0.08, -s * 0.15, s * 0.06],
      s: [0.048, 0.26, 0.04],
      tiny: true,
    });
    add(chest, unitBoxG, energyMat, s * 0.18, 0.47, -0.405, {
      r: [0.08, -s * 0.15, s * 0.06],
      s: [0.022, 0.21, 0.02],
      tiny: true,
    });
  }

  /* ==========================================================================
   * 4. MECHANICAL NECK & SMOOTH FACELESS CYBERNETIC HEAD
   * ========================================================================== */
  // Multi-cable dark mechanical neck + glowing blue vertical conduits
  const neckCoreG = sculptedLathe([
    [0.20, -0.04],
    [0.165, 0.08],
    [0.155, 0.22],
    [0.17, 0.35],
  ], 22);
  add(neck, neckCoreG, carbonFrame, 0, 0, 0, { s: [0.95, 1, 0.92] });
  for (const ny of [0.06, 0.16, 0.26]) {
    add(neck, ringTorusG, darkAlloy, 0, ny, 0, { r: [Math.PI / 2, 0, 0], s: [0.162, 0.162, 0.45], tiny: true });
  }
  for (const s of [-1, 1] as Side[]) {
    // Angled hydraulic neck tendons + glowing cyan fiber-optic lines (front & back)
    add(neck, unitCapG, darkAlloy, s * 0.11, 0.16, 0.08, { r: [0.16, 0, s * 0.18], s: [0.026, 0.26, 0.026], tiny: true });
    add(neck, unitCapG, energyMat, s * 0.055, 0.15, 0.145, { r: [0.08, 0, s * 0.06], s: [0.012, 0.22, 0.012], tiny: true });
    add(neck, unitCapG, energyMat, s * 0.048, 0.16, -0.148, { s: [0.012, 0.24, 0.012], tiny: true });
  }

  // Head: sleek ovoid pearl-white faceless visor dome (front) + segmented occipital plates (back) + glowing ear pods
  // Inner dark skull core (creates crisp dark panel seams between cranial & cheek plates)
  add(head, unitSphereG, darkAlloy, 0, 0.37, -0.01, { s: [0.355, 0.435, 0.395] });

  // Smooth uninterrupted white front visor mask tapering to a feminine chin
  const faceMaskG = sculptedLathe([
    [0.04, 0.0],
    [0.15, 0.06],
    [0.26, 0.18],
    [0.33, 0.34],
    [0.36, 0.52],
    [0.34, 0.68],
    [0.24, 0.80],
    [0.06, 0.85],
  ], 36);
  add(head, faceMaskG, armorWhite, 0, -0.02, 0.02, { s: [0.98, 0.96, 1.06] });

  // Back occipital upper dome & dark horizontal occipital seam + twin angled rear jaw plates
  add(head, ringTorusG, darkAlloy, 0, 0.44, -0.06, { r: [1.32, 0, 0], s: [0.352, 0.38, 0.32], tiny: true });
  for (const s of [-1, 1] as Side[]) {
    add(head, unitSphereG, armorTrim, s * 0.16, 0.24, -0.18, {
      r: [0.25, -s * 0.35, 0],
      s: [0.16, 0.20, 0.16],
      tiny: true,
    });
    // Circular glowing cyan-blue ear / temple pod on left & right sides
    addJointDial(head, s * 0.355, 0.41, -0.02, 0.115, (s * Math.PI) / 2);
  }

  /* ==========================================================================
   * 5. ARTICULATED HANDS (4 × 3-Phalanx Fingers + 2-Phalanx Thumb per Hand)
   * ========================================================================== */
  const buildHand = (side: Side, parent: THREE.Group): Hand => {
    const sideTag = side === 1 ? "L" : "R";
    const group = regBone(`hand${sideTag}`, parent);
    group.rotation.y = (-side * Math.PI) / 2; // palm faces body at rest

    // Dark mechanical palm + sculpted white dorsal armor plate
    add(group, unitSphereG, carbonFrame, 0, -0.12, 0, { s: [0.115, 0.13, 0.048], tiny: true });
    add(group, unitSphereG, armorWhite, 0, -0.115, -side * 0.018, { s: [0.112, 0.122, 0.042], tiny: true });

    const fingers: FingerChain[] = [];
    const fx = [-0.084, -0.028, 0.028, 0.084];
    const fl = [0.90, 1.0, 0.94, 0.78];
    for (let i = 0; i < 4; i++) {
      const L = fl[i];
      const prox = regBone(`finger${sideTag}_${i}_prox`, group);
      prox.position.set(fx[i], -0.235, 0);
      add(prox, smallSphereG, darkAlloy, 0, 0, 0, { s: [0.024, 0.024, 0.024], tiny: true });
      add(prox, unitCapG, armorWhite, 0, -0.048 * L, 0, { s: [0.022, 0.055 * L, 0.022], tiny: true });

      const mid = regBone(`finger${sideTag}_${i}_mid`, prox);
      mid.position.set(0, -0.095 * L, 0);
      add(mid, smallSphereG, darkAlloy, 0, 0, 0, { s: [0.02, 0.02, 0.02], tiny: true });
      add(mid, unitCapG, armorWhite, 0, -0.038 * L, 0, { s: [0.019, 0.042 * L, 0.019], tiny: true });

      const dist = regBone(`finger${sideTag}_${i}_dist`, mid);
      dist.position.set(0, -0.075 * L, 0);
      add(dist, unitCapG, darkAlloy, 0, -0.028 * L, 0, { s: [0.016, 0.032 * L, 0.016], tiny: true });

      fingers.push({ prox, mid, dist });
    }

    const thumbProx = regBone(`thumb${sideTag}_prox`, group);
    thumbProx.position.set(-0.105, -0.135, side * 0.025);
    add(thumbProx, smallSphereG, darkAlloy, 0, 0, 0, { s: [0.026, 0.026, 0.026], tiny: true });
    add(thumbProx, unitCapG, armorWhite, 0, -0.045, 0, { s: [0.024, 0.048, 0.024], tiny: true });

    const thumbDist = regBone(`thumb${sideTag}_dist`, thumbProx);
    thumbDist.position.set(0, -0.088, 0);
    add(thumbDist, unitCapG, armorWhite, 0, -0.036, 0, { s: [0.02, 0.038, 0.02], tiny: true });

    return { group, fingers, thumb: { prox: thumbProx, dist: thumbDist }, side };
  };

  /* ==========================================================================
   * 6. SHOULDERS, PAULDRONS, ARMS, ELBOWS, FOREARMS & WRISTS
   * ========================================================================== */
  const upperArmCoreG = sculptedLathe([
    [0.125, -1.04],
    [0.145, -0.82],
    [0.165, -0.48],
    [0.175, -0.16],
    [0.15, 0.04],
  ], 22);
  const upperArmArmorG = sculptedLathe([
    [0.132, -0.94],
    [0.168, -0.72],
    [0.195, -0.44],
    [0.198, -0.18],
    [0.155, -0.02],
  ], 24);
  const forearmArmorG = sculptedLathe([
    [0.102, -0.92],
    [0.126, -0.72],
    [0.168, -0.42],
    [0.176, -0.18],
    [0.142, -0.02],
  ], 24);

  const buildArm = (side: Side) => {
    const sideTag = side === 1 ? "L" : "R";
    const clavicle = regBone(`clavicle${sideTag}`, chest);
    // Mechanical clavicle bridge
    add(clavicle, unitCapG, carbonFrame, side * 0.22, -0.01, 0, {
      r: [0, 0, Math.PI / 2],
      s: [0.085, 0.34, 0.085],
      tiny: true,
    });

    const shoulder = regBone(`shoulder${sideTag}`, clavicle);
    shoulder.rotation.order = "YXZ";

    // Dark spherical deltoid actuator + sculpted white curved shoulder pauldron + glowing outer ring
    add(shoulder, unitSphereG, carbonFrame, 0, 0, 0, { s: [0.21, 0.21, 0.21] });
    add(shoulder, unitSphereG, armorWhite, side * 0.03, 0.085, 0, {
      r: [0, 0, -side * 0.38],
      s: [0.255, 0.165, 0.245],
    });
    addJointDial(shoulder, side * 0.195, -0.02, 0.02, 0.098, (side * Math.PI) / 2);

    // Upper arm
    add(shoulder, upperArmCoreG, carbonFrame, 0, 0, 0);
    add(shoulder, upperArmArmorG, armorWhite, side * 0.012, 0, 0, { s: [1.0, 1, 0.95] });
    add(shoulder, unitBoxG, darkAlloy, side * 0.175, -0.48, 0, { s: [0.035, 0.56, 0.055], tiny: true });
    add(shoulder, unitBoxG, energyMat, side * 0.192, -0.48, 0, { s: [0.014, 0.34, 0.02], tiny: true });

    // Mechanical elbow hinge drum + side glowing cyan dials
    const elbow = regBone(`elbow${sideTag}`, shoulder);
    add(elbow, hubCylG, darkAlloy, 0, 0, 0, { r: [0, 0, Math.PI / 2], s: [0.145, 0.29, 0.145] });
    add(elbow, smallSphereG, armorTrim, 0, 0.01, -0.11, { s: [0.10, 0.13, 0.09], tiny: true }); // olecranon cap
    addJointDial(elbow, side * 0.148, 0, 0, 0.085, (side * Math.PI) / 2);
    addJointDial(elbow, -side * 0.148, 0, 0, 0.072, (-side * Math.PI) / 2);

    // Tapered white forearm gauntlet + glowing blue recessed forearm channel
    add(elbow, forearmArmorG, armorWhite, 0, 0, 0, { s: [0.98, 1, 0.94] });
    add(elbow, unitCapG, darkAlloy, side * 0.125, -0.48, 0.02, {
      r: [0.06, 0, -side * 0.06],
      s: [0.032, 0.42, 0.042],
      tiny: true,
    });
    add(elbow, unitCapG, energyMat, side * 0.148, -0.50, 0.02, {
      r: [0.06, 0, -side * 0.06],
      s: [0.014, 0.34, 0.016],
      tiny: true,
    });

    // Spherical dark wrist actuator
    const wrist = regBone(`wrist${sideTag}`, elbow);
    add(wrist, smallSphereG, darkAlloy, 0, -0.02, 0, { s: [0.098, 0.088, 0.088], tiny: true });
    add(wrist, ringTorusG, energyMat, 0, -0.01, 0, { r: [Math.PI / 2, 0, 0], s: [0.095, 0.095, 0.38], tiny: true });
    const hand = buildHand(side, wrist);
    return { clavicle, shoulder, elbow, wrist, hand };
  };
  const armL = buildArm(1);
  const armR = buildArm(-1);

  /* ==========================================================================
   * 7. LEGS: SCULPTED THIGHS, MECHANICAL KNEES, CALVES, ANKLES & HEELED CYBER-BOOTS
   * ========================================================================== */
  const thighCoreG = sculptedLathe([
    [0.165, -1.32],
    [0.20, -1.04],
    [0.255, -0.68],
    [0.295, -0.32],
    [0.275, -0.04],
    [0.21, 0.10],
  ], 26);

  const thighArmorG = sculptedLathe([
    [0.175, -1.20],
    [0.23, -0.95],
    [0.295, -0.60],
    [0.338, -0.26],
    [0.315, -0.02],
    [0.24, 0.10],
  ], 30);

  const calfCoreG = sculptedLathe([
    [0.115, -1.38],
    [0.135, -1.08],
    [0.195, -0.68],
    [0.215, -0.40],
    [0.175, -0.12],
    [0.155, 0.04],
  ], 24);

  const calfArmorG = sculptedLathe([
    [0.128, -1.28],
    [0.158, -1.02],
    [0.228, -0.64],
    [0.248, -0.38],
    [0.195, -0.12],
  ], 28);

  const buildLeg = (side: Side) => {
    const sideTag = side === 1 ? "L" : "R";
    const hip = regBone(`hip${sideTag}`, hips);

    // Dark mechanical thigh core + sculpted white feminine thigh armor
    add(hip, thighCoreG, carbonFrame, 0, 0, 0, { s: [0.98, 1, 1.04] });
    add(hip, thighArmorG, armorWhite, side * 0.015, 0, 0.01, { s: [1.0, 1, 1.05] });

    // Outer thigh sweeping armor crest + recessed glowing blue vertical light channel
    add(hip, unitSphereG, armorWhite, side * 0.13, -0.44, 0.02, {
      r: [0, 0, -side * 0.08],
      s: [0.22, 0.56, 0.25],
    });
    add(hip, unitBoxG, darkAlloy, side * 0.29, -0.62, 0.02, { s: [0.04, 0.72, 0.065], tiny: true });
    add(hip, unitBoxG, energyMat, side * 0.312, -0.64, 0.02, { s: [0.016, 0.54, 0.024], tiny: true });

    // Rear hamstring dark seam + glowing cyan light slits (visible in back reference)
    add(hip, unitBoxG, darkAlloy, 0, -0.62, -0.28, { s: [0.065, 0.82, 0.06], tiny: true });
    add(hip, unitBoxG, energyMat, side * 0.08, -0.72, -0.275, {
      r: [0, 0, side * 0.12],
      s: [0.018, 0.42, 0.02],
      tiny: true,
    });

    // Mechanical dual-axis knee joint + white shield patella + lateral/medial glowing cyan rings
    const knee = regBone(`knee${sideTag}`, hip);
    add(knee, hubCylG, darkAlloy, 0, 0, -0.01, { r: [0, 0, Math.PI / 2], s: [0.185, 0.35, 0.185] });
    add(knee, unitSphereG, armorWhite, 0, 0.02, 0.175, { s: [0.145, 0.21, 0.10] }); // sculpted white kneecap
    add(knee, unitBoxG, carbonFrame, 0, -0.02, -0.155, { s: [0.16, 0.24, 0.10], tiny: true }); // rear hydraulic knee linkage
    addJointDial(knee, side * 0.18, 0, -0.01, 0.105, (side * Math.PI) / 2);
    addJointDial(knee, -side * 0.18, 0, -0.01, 0.092, (-side * Math.PI) / 2);

    // Contoured calf & shin armor + glowing cyan front shin curve & rear calf fin
    add(knee, calfCoreG, carbonFrame, 0, 0, -0.02, { s: [0.96, 1, 1.04] });
    add(knee, calfArmorG, armorWhite, 0, 0, -0.015, { s: [0.98, 1, 1.06] });
    // Front curved blue shin energy vent
    add(knee, unitCapG, darkAlloy, side * 0.11, -0.68, 0.145, {
      r: [-0.08, 0, -side * 0.12],
      s: [0.034, 0.46, 0.038],
      tiny: true,
    });
    add(knee, unitCapG, energyMat, side * 0.12, -0.70, 0.168, {
      r: [-0.08, 0, -side * 0.12],
      s: [0.015, 0.38, 0.016],
      tiny: true,
    });
    // Back calf gastrocnemius sculpted plates + glowing vertical rear calf vent
    add(knee, unitSphereG, armorWhite, 0, -0.46, -0.11, { s: [0.20, 0.34, 0.19] });
    add(knee, unitBoxG, darkAlloy, 0, -0.78, -0.175, { r: [0.1, 0, 0], s: [0.055, 0.56, 0.05], tiny: true });
    add(knee, unitBoxG, energyMat, 0, -0.84, -0.198, { r: [0.1, 0, 0], s: [0.022, 0.36, 0.02], tiny: true });

    // Mechanical ankle + sculpted heeled cyber-boot (both heel & forefoot soles rest flush at y = -0.34!)
    const ankle = regBone(`ankle${sideTag}`, knee);
    add(ankle, hubCylG, darkAlloy, 0, 0, -0.02, { r: [0, 0, Math.PI / 2], s: [0.135, 0.27, 0.135] });
    addJointDial(ankle, side * 0.138, 0, -0.02, 0.078, (side * Math.PI) / 2);
    addJointDial(ankle, -side * 0.138, 0, -0.02, 0.070, (-side * Math.PI) / 2);

    // Sculpted white heel cup + architectural block heel (bottom at y = -0.34)
    add(ankle, unitSphereG, armorWhite, 0, -0.09, -0.08, { s: [0.145, 0.13, 0.145] });
    add(ankle, unitBoxG, armorWhite, 0, -0.225, -0.095, { s: [0.22, 0.19, 0.20] });
    add(ankle, unitBoxG, darkAlloy, 0, -0.33, -0.095, { s: [0.225, 0.02, 0.205], tiny: true }); // heel tread at -0.34

    // Angled dark mechanical arch & white mid-instep armor strap bridging down to the forefoot
    add(ankle, unitBoxG, carbonFrame, 0, -0.165, 0.08, { r: [0.52, 0, 0], s: [0.21, 0.08, 0.28], tiny: true });
    add(ankle, unitSphereG, armorWhite, 0, -0.145, 0.09, { r: [0.48, 0, 0], s: [0.135, 0.065, 0.14] });

    // Articulated forefoot / toe bone at [0, -0.26, 0.20] -> sole bottom at -0.26 - 0.08 = -0.34!
    const toe = regBone(`toe${sideTag}`, ankle);
    add(toe, unitSphereG, armorWhite, 0, 0.015, 0.14, { s: [0.152, 0.085, 0.23] });
    add(toe, unitBoxG, darkAlloy, 0, 0.028, 0.05, { r: [0.2, 0, 0], s: [0.26, 0.035, 0.06], tiny: true }); // dark strap across toe base
    add(toe, unitBoxG, darkAlloy, 0, -0.065, 0.14, { s: [0.265, 0.03, 0.38], tiny: true }); // forefoot sole bottom at -0.08 -> -0.34 total!

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
