import * as THREE from "three";
import {
  makeKitTexture,
  makeShortsTexture,
  makeBandTexture,
  makeNumberDecal,
  makeCrestDecal,
} from "./textures";

/** +1 = character's left (+x when facing +z), -1 = character's right. */
export type Side = 1 | -1;

export interface Hand {
  group: THREE.Group;
  fingers: { prox: THREE.Group; dist: THREE.Group }[];
  thumb: THREE.Group;
  side: Side;
}
export interface Eye {
  socket: THREE.Group;
  ball: THREE.Group;
  lidUp: THREE.Mesh;
  lidLow: THREE.Mesh;
}
export interface Brow {
  mesh: THREE.Mesh;
  baseY: number;
  side: Side;
}
export interface Mouth {
  group: THREE.Group;
  inner: THREE.Mesh;
  teeth: THREE.Mesh;
  tongue: THREE.Mesh;
  smile: THREE.Group;
  frown: THREE.Group;
}

/** Numeric, blendable pose channels (face + hands). */
export interface Extras {
  mouthOpen: number;
  smile: number; // -1 frown … +1 smile
  browRaise: number; // -1 … +1
  browInner: number; // -1 angry … +1 sad
  eyeClose: number; // 0 open … 1 closed
  tongue: number;
  gazeX: number;
  gazeY: number;
  curlL: number;
  curlR: number;
}

export const EXTRA_KEYS: (keyof Extras)[] = [
  "mouthOpen",
  "smile",
  "browRaise",
  "browInner",
  "eyeClose",
  "tongue",
  "gazeX",
  "gazeY",
  "curlL",
  "curlR",
];

export function defaultExtras(): Extras {
  return {
    mouthOpen: 0.04,
    smile: 0.3,
    browRaise: 0,
    browInner: 0,
    eyeClose: 0,
    tongue: 0,
    gazeX: 0,
    gazeY: 0,
    curlL: 0.3,
    curlR: 0.3,
  };
}

type NodeKey =
  | "root"
  | "hips"
  | "spine"
  | "head"
  | "shoulderL"
  | "elbowL"
  | "wristL"
  | "shoulderR"
  | "elbowR"
  | "wristR"
  | "hipL"
  | "kneeL"
  | "ankleL"
  | "hipR"
  | "kneeR"
  | "ankleR";

export type Rig = Record<NodeKey, THREE.Group> & {
  nodes: THREE.Group[];
  handL: Hand;
  handR: Hand;
  eyeL: Eye;
  eyeR: Eye;
  browL: Brow;
  browR: Brow;
  mouth: Mouth;
  meshes: THREE.Mesh[];
};

/** Rest transforms for every blendable node (local space). */
const BASE: Record<NodeKey, { p: [number, number, number]; r: [number, number, number] }> = {
  root: { p: [0, 0, 0], r: [0, 0, 0] },
  hips: { p: [0, 3.05, 0], r: [0, 0, 0] },
  spine: { p: [0, 0.25, 0], r: [0, 0, 0] },
  head: { p: [0, 2.15, 0], r: [0, 0, 0] },
  shoulderL: { p: [0.8, 1.68, 0], r: [0, 0, 0.1] },
  elbowL: { p: [0, -1.15, 0], r: [-0.12, 0, 0] },
  wristL: { p: [0, -1.0, 0], r: [0, 0, 0] },
  shoulderR: { p: [-0.8, 1.68, 0], r: [0, 0, -0.1] },
  elbowR: { p: [0, -1.15, 0], r: [-0.12, 0, 0] },
  wristR: { p: [0, -1.0, 0], r: [0, 0, 0] },
  hipL: { p: [0.33, 0, 0], r: [0, 0, 0.03] },
  kneeL: { p: [0, -1.3, 0], r: [0.05, 0, 0] },
  ankleL: { p: [0, -1.41, 0], r: [0, 0, 0] },
  hipR: { p: [-0.33, 0, 0], r: [0, 0, -0.03] },
  kneeR: { p: [0, -1.3, 0], r: [0.05, 0, 0] },
  ankleR: { p: [0, -1.41, 0], r: [0, 0, 0] },
};

const NODE_KEYS = Object.keys(BASE) as NodeKey[];

/** Put every node back to its rest transform (emotes then layer on top). */
export function resetPose(rig: Rig) {
  for (const k of NODE_KEYS) {
    const b = BASE[k];
    const n = rig[k];
    n.position.set(b.p[0], b.p[1], b.p[2]);
    n.rotation.set(b.r[0], b.r[1], b.r[2]);
  }
}

function setCurl(h: Hand, c: number) {
  for (const f of h.fingers) {
    f.prox.rotation.x = -c * 1.5;
    f.dist.rotation.x = -c * 1.5;
  }
  h.thumb.rotation.x = -0.4 - c * 0.9;
  h.thumb.rotation.z = h.side * (0.75 - c * 0.5);
}

/** Push numeric channels into the face + hand meshes. */
export function applyExtras(rig: Rig, x: Extras) {
  for (const eye of [rig.eyeL, rig.eyeR]) {
    eye.lidUp.rotation.x = THREE.MathUtils.lerp(-0.95, 0.7, x.eyeClose);
    eye.lidLow.rotation.x = THREE.MathUtils.lerp(0.95, -0.25, x.eyeClose);
    eye.ball.rotation.y = x.gazeX * 0.45;
    eye.ball.rotation.x = x.gazeY * 0.4;
  }
  for (const b of [rig.browL, rig.browR]) {
    b.mesh.position.y = b.baseY + x.browRaise * 0.045 + Math.min(0, x.browInner) * 0.02;
    b.mesh.rotation.z = Math.PI / 2 - b.side * x.browInner * 0.35;
  }
  const m = rig.mouth;
  const open = x.mouthOpen;
  const innerH = Math.max(0.001, open * 0.12 - 0.005);
  m.inner.scale.set(0.115 + open * 0.03 + Math.max(0, x.smile) * 0.02, innerH, 0.05);
  m.inner.position.y = -0.01 - open * 0.045;
  const top = m.inner.position.y + innerH;
  m.teeth.scale.set(1, THREE.MathUtils.clamp((open - 0.08) * 6, 0.001, 1), 1);
  m.teeth.position.y = top - 0.03;
  const tg = x.tongue;
  m.tongue.scale.set(0.055 * tg + 0.001, 0.03 * tg + 0.001, 0.07 * tg + 0.001);
  m.tongue.position.set(0, m.inner.position.y - innerH + 0.02, 0.02 + tg * 0.08);
  const grow = 1 + open * 0.3;
  m.smile.scale.set(grow, Math.max(x.smile, 0.02) * grow, 1);
  m.frown.scale.set(grow, Math.max(-x.smile, 0.02) * grow, 1);
  m.smile.position.y = m.frown.position.y = -open * 0.02;
  setCurl(rig.handL, x.curlL);
  setCurl(rig.handR, x.curlR);
}

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface AddOpts {
  r?: [number, number, number];
  s?: [number, number, number];
  tiny?: boolean;
}

export function buildCharacter(): Rig {
  const meshes: THREE.Mesh[] = [];
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

  // ---------- materials ----------
  const skin = new THREE.MeshStandardMaterial({ color: 0xa8714d, roughness: 0.58 });
  const skinDark = new THREE.MeshStandardMaterial({ color: 0x8a5038, roughness: 0.6 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x8e4e40, roughness: 0.5 });
  const sheen = { sheen: 0.55, sheenRoughness: 0.75, sheenColor: new THREE.Color(0xff7a7a) };
  const kit = new THREE.MeshPhysicalMaterial({ map: makeKitTexture(), roughness: 0.72, ...sheen });
  const fabric = new THREE.MeshPhysicalMaterial({ map: makeShortsTexture(), roughness: 0.75, ...sheen });
  const teal = new THREE.MeshStandardMaterial({ color: 0x0f6d4e, roughness: 0.55 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x221409, roughness: 0.92 });
  const hairSoft = new THREE.MeshStandardMaterial({ color: 0x33200f, roughness: 0.9 });
  const hairFade = new THREE.MeshStandardMaterial({ color: 0x4d3523, roughness: 0.95 });
  const boot = new THREE.MeshPhysicalMaterial({ color: 0x141b2d, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const sole = new THREE.MeshStandardMaterial({ color: 0xf1ede3, roughness: 0.6 });
  const stud = new THREE.MeshStandardMaterial({ color: 0xd8c27a, roughness: 0.35, metalness: 0.5 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.2 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x3f2614, roughness: 0.3 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050406, roughness: 0.3 });
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const teethMat = new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.35 });
  const mouthIn = new THREE.MeshStandardMaterial({ color: 0x3e0c10, roughness: 0.7 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xc9596a, roughness: 0.55 });
  const band = new THREE.MeshStandardMaterial({ map: makeBandTexture(), roughness: 0.55 });
  const decalNum = new THREE.MeshBasicMaterial({ map: makeNumberDecal(), transparent: true, depthWrite: false, toneMapped: false });
  const decalCrest = new THREE.MeshBasicMaterial({ map: makeCrestDecal(), transparent: true, depthWrite: false, toneMapped: false });

  // ---------- skeleton groups ----------
  const root = new THREE.Group();
  root.name = "character";
  const hips = new THREE.Group();
  root.add(hips);
  const spine = new THREE.Group();
  hips.add(spine);
  const head = new THREE.Group();
  spine.add(head);

  // ---------- pelvis / shorts ----------
  const pelvisPts = new THREE.SplineCurve([
    new THREE.Vector2(0.4, -0.55),
    new THREE.Vector2(0.56, -0.45),
    new THREE.Vector2(0.63, -0.2),
    new THREE.Vector2(0.64, 0.1),
    new THREE.Vector2(0.61, 0.4),
    new THREE.Vector2(0.57, 0.48),
  ]).getSpacedPoints(16);
  add(hips, new THREE.LatheGeometry(pelvisPts, 40), fabric, 0, 0, 0, { s: [1, 1, 0.76] });

  // ---------- torso / jersey ----------
  const torsoPts = new THREE.SplineCurve([
    new THREE.Vector2(0.66, -0.38),
    new THREE.Vector2(0.64, -0.2),
    new THREE.Vector2(0.62, 0.0),
    new THREE.Vector2(0.6, 0.3),
    new THREE.Vector2(0.63, 0.6),
    new THREE.Vector2(0.7, 0.9),
    new THREE.Vector2(0.8, 1.2),
    new THREE.Vector2(0.88, 1.45),
    new THREE.Vector2(0.92, 1.62),
    new THREE.Vector2(0.86, 1.75),
    new THREE.Vector2(0.66, 1.85),
    new THREE.Vector2(0.42, 1.93),
    new THREE.Vector2(0.3, 1.98),
  ]).getSpacedPoints(36);
  add(spine, new THREE.LatheGeometry(torsoPts, 56), kit, 0, 0, 0, { r: [0, Math.PI, 0], s: [1, 1, 0.72] });
  // collar + neck
  add(spine, new THREE.TorusGeometry(0.33, 0.045, 10, 40), teal, 0, 1.97, 0, { r: [Math.PI / 2, 0, 0], s: [1, 1, 0.85], tiny: true });
  add(spine, new THREE.LatheGeometry([[0.27, -0.34], [0.215, -0.14], [0.19, 0.08], [0.2, 0.34]].map(([r, y]) => new THREE.Vector2(r, y)), 20), skin, 0, 2.0, 0, { s: [1, 1, 0.95] });
  for (const s of [-1, 1]) add(spine, new THREE.SphereGeometry(0.3, 16, 12), fabric, s * 0.44, 1.76, -0.06, { s: [1.5, 0.5, 0.9] }); // trapezius slope

  // ---------- hands ----------
  const buildHand = (side: Side, parent: THREE.Group): Hand => {
    const group = new THREE.Group();
    group.rotation.y = (-side * Math.PI) / 2; // palm faces the body at rest
    parent.add(group);
    add(group, new THREE.SphereGeometry(0.15, 16, 12), skin, 0, -0.13, 0, { s: [0.9, 1.05, 0.42] });
    const fingers: Hand["fingers"] = [];
    const fx = [-0.1, -0.034, 0.034, 0.1];
    const fl = [0.9, 1.0, 0.95, 0.8];
    for (let i = 0; i < 4; i++) {
      const prox = new THREE.Group();
      prox.position.set(fx[i], -0.26, 0);
      group.add(prox);
      add(prox, new THREE.CapsuleGeometry(0.03, 0.1 * fl[i], 4, 8), skin, 0, -0.06 * fl[i], 0, { tiny: true });
      const dist = new THREE.Group();
      dist.position.set(0, -0.12 * fl[i], 0);
      prox.add(dist);
      add(dist, new THREE.CapsuleGeometry(0.028, 0.08 * fl[i], 4, 8), skin, 0, -0.05 * fl[i], 0, { tiny: true });
      fingers.push({ prox, dist });
    }
    const thumb = new THREE.Group();
    thumb.position.set(side * 0.13, -0.17, 0.02);
    group.add(thumb);
    add(thumb, new THREE.CapsuleGeometry(0.034, 0.09, 4, 8), skin, 0, -0.065, 0, { tiny: true });
    return { group, fingers, thumb, side };
  };

  // ---------- organic limbs (muscle-profiled, never plain cylinders) ----------
  const limb = (pts: [number, number][], seg = 18) =>
    new THREE.LatheGeometry(
      new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(pts.length * 5),
      seg
    );
  const upperArmG = limb([[0.195, -1.2], [0.21, -0.95], [0.25, -0.62], [0.28, -0.32], [0.275, -0.06], [0.2, 0.14]]);
  const foreArmG = limb([[0.135, -0.98], [0.155, -0.8], [0.21, -0.44], [0.228, -0.2], [0.2, 0.0], [0.165, 0.1]]);
  const wristG = limb([[0.105, -1.1], [0.125, -0.94]]);
  const bandG = limb([[0.262, -0.7], [0.286, -0.5], [0.292, -0.34]]);
  const thighG = limb([[0.2, -1.36], [0.215, -1.15], [0.275, -0.8], [0.325, -0.42], [0.335, -0.1], [0.28, 0.1]]);
  const shortsLegG = limb([[0.385, -0.84], [0.37, -0.5], [0.35, 0.02]]);
  const calfG = limb([[0.125, -1.4], [0.15, -1.1], [0.205, -0.76], [0.245, -0.44], [0.215, -0.14], [0.185, 0.06]]);
  const sockG = limb([[0.137, -1.42], [0.162, -1.1], [0.217, -0.76], [0.252, -0.5]]);
  const sockTopG = limb([[0.252, -0.52], [0.26, -0.4]]);

  // ---------- arms ----------
  const buildArm = (side: Side) => {
    const shoulder = new THREE.Group();
    shoulder.rotation.order = "YXZ"; // twist applied last → clean horizontal swings
    spine.add(shoulder);
    add(shoulder, new THREE.SphereGeometry(0.3, 24, 18), fabric, 0, 0.02, 0, { s: [1.02, 0.92, 0.96] });
    add(shoulder, upperArmG, fabric, 0, 0, 0, { s: [1, 1, 0.94] });
    if (side === 1) add(shoulder, bandG, band, 0, 0, 0, { r: [0, Math.PI, 0], s: [1, 1, 0.94] });
    const elbow = new THREE.Group();
    shoulder.add(elbow);
    add(elbow, new THREE.SphereGeometry(0.205, 18, 14), fabric, 0, 0, -0.01, { s: [1, 1.05, 1] });
    add(elbow, foreArmG, fabric, 0, 0, 0, { s: [1, 1, 0.92] });
    add(elbow, new THREE.TorusGeometry(0.142, 0.026, 8, 28), teal, 0, -0.95, 0, { r: [Math.PI / 2, 0, 0], tiny: true });
    add(elbow, wristG, skin, 0, 0, 0, { s: [1, 1, 0.8], tiny: true });
    const wrist = new THREE.Group();
    elbow.add(wrist);
    const hand = buildHand(side, wrist);
    return { shoulder, elbow, wrist, hand };
  };
  const armL = buildArm(1);
  const armR = buildArm(-1);

  // ---------- legs ----------
  const buildLeg = (side: Side) => {
    const hip = new THREE.Group();
    hips.add(hip);
    add(hip, thighG, skin, 0, 0, 0, { s: [1, 1, 1.06] });
    add(hip, shortsLegG, fabric, 0, 0, 0, { s: [1, 1, 1.04] });
    add(hip, new THREE.TorusGeometry(0.385, 0.024, 8, 36), teal, 0, -0.83, 0, { r: [Math.PI / 2, 0, 0], s: [1, 1.04, 1], tiny: true });
    if (side === 1) add(hip, new THREE.PlaneGeometry(0.22, 0.28), decalNum, 0, -0.52, 0.395, { tiny: true });
    else add(hip, new THREE.PlaneGeometry(0.2, 0.26), decalCrest, 0, -0.52, 0.395, { tiny: true });
    const knee = new THREE.Group();
    hip.add(knee);
    add(knee, new THREE.SphereGeometry(0.215, 20, 14), skin, 0, 0, 0, { s: [1, 1.1, 1.05] });
    add(knee, new THREE.SphereGeometry(0.12, 12, 10), skin, 0, 0.02, 0.14, { s: [1.1, 1.2, 0.7], tiny: true });
    add(knee, calfG, skin, 0, 0, -0.035, { s: [0.96, 1, 1.1] });
    add(knee, sockG, fabric, 0, 0, -0.035, { s: [0.96, 1, 1.1] });
    add(knee, sockTopG, teal, 0, 0, -0.035, { s: [0.96, 1, 1.1], tiny: true });
    const ankle = new THREE.Group();
    knee.add(ankle);
    add(ankle, new THREE.SphereGeometry(0.165, 16, 12), fabric, 0, 0.02, -0.02, { tiny: true });
    add(ankle, new THREE.SphereGeometry(0.2, 22, 16), boot, 0, -0.1, 0.17, { s: [1, 0.8, 2.15] });
    add(ankle, new THREE.SphereGeometry(0.19, 18, 14), boot, 0, -0.06, -0.08, { s: [1, 1.1, 1] });
    add(ankle, new THREE.SphereGeometry(0.15, 14, 10), boot, 0, -0.13, 0.5, { s: [1.15, 0.7, 1.1], tiny: true });
    add(ankle, new THREE.BoxGeometry(0.37, 0.07, 0.86), sole, 0, -0.255, 0.15, { tiny: true });
    const studGeo = new THREE.ConeGeometry(0.04, 0.06, 6);
    for (const [sx, sz] of [[-0.12, 0.46], [0.12, 0.46], [-0.13, 0.2], [0.13, 0.2], [-0.1, -0.16], [0.1, -0.16]]) {
      add(ankle, studGeo, stud, sx, -0.31, sz, { r: [Math.PI, 0, 0], tiny: true });
    }
    return { hip, knee, ankle };
  };
  const legL = buildLeg(1);
  const legR = buildLeg(-1);

  // ---------- head ----------
  add(head, new THREE.SphereGeometry(0.5, 36, 28), skin, 0, 0.45, 0, { s: [0.84, 1.0, 0.9] });
  add(head, new THREE.SphereGeometry(0.4, 28, 20), skin, 0, 0.26, 0.04, { s: [0.9, 0.62, 0.95] }); // jaw
  for (const s of [-1, 1] as Side[]) {
    add(head, new THREE.SphereGeometry(0.1, 14, 10), skin, s * 0.42, 0.47, -0.02, { s: [0.5, 1.2, 0.8], tiny: true });
    add(head, new THREE.SphereGeometry(0.06, 10, 8), skinDark, s * 0.445, 0.47, -0.01, { s: [0.4, 1.0, 0.6], tiny: true });
  }
  // nose
  add(head, new THREE.CapsuleGeometry(0.045, 0.12, 4, 12), skin, 0, 0.45, 0.43, { r: [-0.3, 0, 0], tiny: true });
  add(head, new THREE.SphereGeometry(0.065, 14, 10), skin, 0, 0.36, 0.47, { s: [1.1, 0.9, 1], tiny: true });
  for (const s of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.035, 10, 8), skinDark, s * 0.055, 0.325, 0.445, { s: [1, 0.6, 0.8], tiny: true });
  }

  // eyes
  const buildEye = (side: Side): Eye => {
    const socket = new THREE.Group();
    socket.position.set(side * 0.175, 0.53, 0.345);
    head.add(socket);
    const ball = new THREE.Group();
    socket.add(ball);
    add(ball, new THREE.SphereGeometry(0.085, 20, 14), eyeWhite, 0, 0, 0, { tiny: true });
    add(ball, new THREE.SphereGeometry(0.047, 16, 12), irisMat, 0, 0, 0.062, { s: [1, 1, 0.45], tiny: true });
    add(ball, new THREE.SphereGeometry(0.024, 12, 8), pupilMat, 0, 0, 0.078, { s: [1, 1, 0.4], tiny: true });
    add(ball, new THREE.SphereGeometry(0.012, 8, 6), glint, 0.018, 0.02, 0.088, { tiny: true });
    const lidUp = add(socket, new THREE.SphereGeometry(0.097, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2 + 0.1), skin, 0, 0, 0, { tiny: true });
    const lidLow = add(socket, new THREE.SphereGeometry(0.097, 20, 10, 0, Math.PI * 2, Math.PI / 2 - 0.1, Math.PI / 2 + 0.1), skin, 0, 0, 0, { tiny: true });
    return { socket, ball, lidUp, lidLow };
  };
  const eyeL = buildEye(1);
  const eyeR = buildEye(-1);

  // brows
  const buildBrow = (side: Side): Brow => {
    const mesh = add(head, new THREE.CapsuleGeometry(0.022, 0.15, 4, 10), hair, side * 0.19, 0.69, 0.36, {
      r: [0, side * 0.3, Math.PI / 2],
      tiny: true,
    });
    return { mesh, baseY: 0.69, side };
  };
  const browL = buildBrow(1);
  const browR = buildBrow(-1);

  // mouth
  const mouthG = new THREE.Group();
  mouthG.position.set(0, 0.2, 0.43);
  mouthG.rotation.x = 0.12;
  head.add(mouthG);
  const inner = add(mouthG, new THREE.SphereGeometry(1, 20, 12), mouthIn, 0, -0.01, -0.06, { s: [0.115, 0.001, 0.05], tiny: true });
  const teethMesh = add(mouthG, new THREE.BoxGeometry(0.2, 0.05, 0.03), teethMat, 0, 0, 0, { tiny: true });
  const tongue = add(mouthG, new THREE.SphereGeometry(1, 12, 8), tongueMat, 0, -0.04, 0.02, { s: [0.001, 0.001, 0.001], tiny: true });
  const arcGeo = new THREE.TorusGeometry(0.135, 0.02, 8, 24, 2.2);
  const smileG = new THREE.Group();
  mouthG.add(smileG);
  add(smileG, arcGeo, lipMat, 0, 0.061, 0, { r: [0, 0, 3.61], tiny: true });
  const frownG = new THREE.Group();
  mouthG.add(frownG);
  add(frownG, arcGeo, lipMat, 0, -0.061, 0, { r: [0, 0, 0.47], tiny: true });

  // hair: faded sides, dense top, swept quiff, loose strands
  add(head, new THREE.SphereGeometry(0.5, 32, 16, 2.7, 4.0, 0, 1.5), hairFade, 0, 0.45, -0.01, { s: [0.865, 1.015, 0.925] });
  add(head, new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, 1.25), hair, 0, 0.44, -0.01, { r: [-0.28, 0, 0], s: [0.88, 1.03, 0.94] });
  add(head, new THREE.SphereGeometry(0.3, 24, 16), hair, 0, 0.9, 0.06, { s: [1.3, 0.5, 1.05] });
  add(head, new THREE.SphereGeometry(0.2, 20, 14), hairSoft, 0.04, 0.95, 0.27, { r: [-0.5, 0, 0.12], s: [1.4, 0.62, 0.9] });
  const rng = rand(987654);
  const strandGeo = new THREE.CapsuleGeometry(0.03, 0.12, 3, 6);
  for (let i = 0; i < 9; i++) {
    const x = (rng() - 0.5) * 0.6;
    const z = (rng() - 0.3) * 0.5;
    add(head, strandGeo, rng() > 0.5 ? hair : hairSoft, x, 0.97 + rng() * 0.08, z, {
      r: [(rng() - 0.5) * 1.6, rng() * Math.PI, (rng() - 0.5) * 1.6],
      tiny: true,
    });
  }

  const rig: Rig = {
    root,
    hips,
    spine,
    head,
    shoulderL: armL.shoulder,
    elbowL: armL.elbow,
    wristL: armL.wrist,
    shoulderR: armR.shoulder,
    elbowR: armR.elbow,
    wristR: armR.wrist,
    hipL: legL.hip,
    kneeL: legL.knee,
    ankleL: legL.ankle,
    hipR: legR.hip,
    kneeR: legR.knee,
    ankleR: legR.ankle,
    nodes: [],
    handL: armL.hand,
    handR: armR.hand,
    eyeL,
    eyeR,
    browL,
    browR,
    mouth: { group: mouthG, inner, teeth: teethMesh, tongue, smile: smileG, frown: frownG },
    meshes,
  };
  rig.nodes = NODE_KEYS.map((k) => rig[k]);
  resetPose(rig);
  applyExtras(rig, defaultExtras());
  return rig;
}
