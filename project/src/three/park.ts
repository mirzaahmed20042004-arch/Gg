import * as THREE from "three";
import { Batch, tex, speckle, lathe, prism, tilePlane, std, mapped, boxCol, circleCol, rng, type Collider, type Seat } from "./kit";
import { PARK_BOUNDS } from "./world";

/** Is this point on a paved / built surface (so no grass or trees grow there)? */
export function paved(x: number, z: number, m = 0) {
  const ax = Math.abs(x);
  if (ax < 88 + m && z > -120 - m && z < -30 + m) return true; // Frere Hall terrace footprint
  if (ax < 40 + m && z > -56.5 - m && z < 1.5 + m) return true; // forecourt
  if (ax < 10 + m && z > -1 - m && z < 70 + m) return true; // main path
  if (Math.hypot(x, z - 30) < 18 + m) return true; // fountain plaza
  if (ax < 122 + m && Math.abs(z - 30) < 5 + m) return true; // cross path
  return z > 68 - m; // front promenade + perimeter road
}

export function buildPark(scene: THREE.Scene, colliders: Collider[], seats: Seat[], mobile: boolean) {
  const PW = PARK_BOUNDS.maxX - PARK_BOUNDS.minX;
  const PD = PARK_BOUNDS.maxZ - PARK_BOUNDS.minZ;
  const PCX = (PARK_BOUNDS.minX + PARK_BOUNDS.maxX) / 2;
  const PCZ = (PARK_BOUNDS.minZ + PARK_BOUNDS.maxZ) / 2;

  /* ---------- materials ---------- */
  const lawnM = mapped(tex(512, 512, (c, w, h) => {
    speckle(c, w, h, "#478035", ["#3c712c", "#548f3e", "#356627", "#619c48", "#4d8739"], 14000, 4, 3);
  }), 0.97);
  const paverM = mapped(tex(256, 256, (c, w, h) => {
    speckle(c, w, h, "#b9ab90", ["#a39478", "#cfc3aa", "#8f8168"], 2600, 6, 6);
    c.strokeStyle = "rgba(80,68,48,0.5)"; c.lineWidth = 2;
    for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? -64 : 0; x < w; x += 128) c.strokeRect(x, y, 128, 64);
  }), 0.95);
  const barkM = mapped(tex(128, 256, (c, w, h) => {
    speckle(c, w, h, "#5b4330", ["#3e2c1e", "#75593f", "#2f2116"], 900, 4, 12);
    const r = rng(3);
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(25,15,8,${0.2 + r() * 0.3})`; c.fillRect(r() * w, r() * h, 2 + r() * 3, 20 + r() * 60); }
  }), 1);
  const hedgeM = mapped(tex(128, 128, (c, w, h) => speckle(c, w, h, "#2f6230", ["#224a24", "#40793c", "#18381a"], 2600, 5, 5)), 1);
  const leafM = [0x3f7d34, 0x2f6a2c, 0x558f3a].map((c) => std(c, 0.95, { flatShading: true }));
  const stoneM = std(0xc9bfa6, 0.9);
  const iron = std(0x1f2428, 0.55, { metalness: 0.6 });
  const woodM = std(0x7a5230, 0.75);
  const white = std(0xf7f5ed, 0.74);
  const lampGlass = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd98a, emissiveIntensity: 0.9, roughness: 0.3 });
  const rubber = std(0x17181a, 0.9);
  const glass = std(0x1b2a33, 0.15, { metalness: 0.5 });

  /* ---------- continuous rectangular green grass park + stone pathways ---------- */
  const G = new Batch();
  const flat = (m: THREE.Material, w: number, d: number, x: number, z: number, y: number, tile: number) =>
    G.add(m, tilePlane(w, d, tile), x, y, z, [-Math.PI / 2, 0, 0]);
  // One seamless rectangular lawn extending across front, back, left & right right up to all 4 perimeter roads.
  flat(lawnM, PW, PD, PCX, PCZ, 0.02, 16);
  const F = 0.13;
  flat(paverM, 80, 58, 0, -27.5, 0.04 + F, 9);
  flat(paverM, 20, 70, 0, 35, 0.04 + F, 9);
  flat(paverM, 244, 10, 0, 30, 0.035 + F, 9);
  G.add(paverM, new THREE.CircleGeometry(18, 40), 0, 0.05 + F, 30, [-Math.PI / 2, 0, 0], [1, 1, 1]);
  // Front promenade spans the full width of the park and terminates cleanly at the z = 80 perimeter road edge.
  flat(paverM, PW, 12, PCX, 74, 0.045 + F, 9);
  for (const z of [80.35, 103.65]) flat(white, PW, 0.42, PCX, z, 0.195, 1);
  for (let x = -8; x <= 8; x += 3.2) flat(white, 1.7, 21, x, 92, 0.205, 1);
  G.build(scene, false, true);

  /* ---------- solid props ---------- */
  const P = new Batch();
  const lampPos: { x: number; y: number; z: number }[] = [];

  // Forecourt accent hedges + unbroken perimeter hedge along Back, Left & Right (stopping cleanly at the front promenade).
  for (const s of [-1, 1]) {
    P.box(hedgeM, 2.4, 2.8, 30, s * 41.5, 1.4, -19, 0, 5);
    colliders.push(boxCol(s * 41.5, -19, 2.8, 30.4, undefined, 2.8));
  }
  const hxL = PARK_BOUNDS.minX + 3.8;
  const hxR = PARK_BOUNDS.maxX - 3.8;
  const hzB = PARK_BOUNDS.minZ + 3.8;
  const hzF = 68.0;
  const hedgeW = 2.6;
  const hedgeH = 4.2;
  const sideLen = hzF - hzB + hedgeW;
  const sideMidZ = (hzB - hedgeW / 2 + hzF + hedgeW / 2) / 2;
  const backLen = hxR - hxL + hedgeW;
  P.box(hedgeM, backLen, hedgeH, hedgeW, PCX, hedgeH / 2, hzB, 0, 6);
  colliders.push(boxCol(PCX, hzB, backLen + 0.4, hedgeW + 0.4, undefined, hedgeH));
  for (const hxEdge of [hxL, hxR]) {
    P.box(hedgeM, hedgeW, hedgeH, sideLen, hxEdge, hedgeH / 2, sideMidZ, 0, 6);
    colliders.push(boxCol(hxEdge, sideMidZ, hedgeW + 0.4, sideLen + 0.4, undefined, hedgeH));
  }

  // Victorian street lamps
  const postG = lathe([[1.05, 0], [1.05, 0.5], [0.7, 0.9], [0.5, 2.4], [0.64, 2.7], [0.34, 3.2], [0.24, 11.2], [0.55, 11.6], [0.78, 12.1]], 8);
  const lamp = (x: number, z: number) => {
    P.at(x, 0, z, 0, () => {
      P.add(iron, postG);
      P.box(lampGlass, 1.25, 1.7, 1.25, 0, 13, 0);
      lampPos.push({ x, y: 13, z });
      for (const sx of [-0.66, 0.66]) for (const sz of [-0.66, 0.66]) P.box(iron, 0.14, 1.9, 0.14, sx, 13, sz);
      P.add(iron, prism(0.01, 1.25, 1.1, 4), 0, 14.45, 0);
      P.add(iron, new THREE.IcosahedronGeometry(0.26, 0), 0, 15.1, 0);
    });
    colliders.push(circleCol(x, z, 0.95));
  };
  for (const s of [-1, 1]) { for (const z of [4, 46, 66]) lamp(s * 11.5, z); lamp(s * 30, -6); lamp(s * 30, -34); lamp(s * 46, 23.5); lamp(s * 92, 23.5); lamp(s * 70, 71); lamp(s * 132, 71); }

  // park benches (seat height matched to the character)
  const bench = (x: number, z: number, yaw: number) => {
    P.at(x, 0, z, yaw, () => {
      for (const sx of [-4.2, 0, 4.2]) { P.box(iron, 0.3, 1.6, 1.9, sx, 0.8, 0.05); P.box(iron, 0.3, 2.6, 0.3, sx, 2.9, -0.95); }
      for (const sx of [-4.35, 4.35]) P.box(iron, 0.34, 0.3, 2.1, sx, 2.6, 0.05);
      for (const sz of [-0.62, -0.17, 0.28, 0.73]) P.box(woodM, 9, 0.2, 0.4, 0, 1.63, sz);
      for (const y of [2.45, 3.1, 3.75]) P.box(woodM, 9, 0.46, 0.18, 0, y, -0.98);
    });
    const side = Math.abs(Math.sin(yaw)) > 0.5;
    colliders.push(boxCol(x, z, side ? 2.6 : 9.4, side ? 9.4 : 2.6));
    for (const o of [-3, 0, 3]) seats.push({ x: x + Math.cos(yaw) * o, z: z - Math.sin(yaw) * o, y: 1.73, yaw });
  };
  for (const s of [-1, 1]) for (const z of [14, 54]) bench(s * 13.4, z, (-s * Math.PI) / 2);
  for (const s of [-1, 1]) bench(s * 36, -20, (-s * Math.PI) / 2);
  bench(-60, 23.4, 0); bench(60, 23.4, 0);

  // litter bins, bollards, park sign
  for (const [x, z] of [[14.2, 21.5], [-14.2, 46], [36, -9], [-60, 37.2]]) {
    P.box(std(0x23503a, 0.7), 1.7, 2.4, 1.7, x, 1.2, z);
    P.box(iron, 1.9, 0.3, 1.9, x, 2.55, z);
    colliders.push(circleCol(x, z, 1.15));
  }
  const bollard = lathe([[0.55, 0], [0.5, 2.6], [0.72, 2.8], [0.5, 3.2], [0.01, 3.35]], 8);
  for (const x of [-9.4, -3.1, 3.1, 9.4]) { P.add(iron, bollard, x, 0, 68.6); colliders.push(circleCol(x, 68.6, 0.7)); }
  P.box(stoneM, 17, 5.4, 1.6, -27, 2.7, 62);
  colliders.push(boxCol(-27, 62, 17, 1.9));
  const signM = new THREE.MeshStandardMaterial({
    map: tex(1024, 320, (c, w, h) => {
      c.fillStyle = "#143528"; c.fillRect(0, 0, w, h);
      c.strokeStyle = "#d3b05e"; c.lineWidth = 10; c.strokeRect(10, 10, w - 20, h - 20);
      c.textAlign = "center"; c.fillStyle = "#f1dfa6"; c.font = "700 110px Georgia, serif"; c.fillText("FRERE HALL", w / 2, 132);
      c.fillStyle = "#d3b05e"; c.font = "600 44px Georgia, serif";
      c.fillText("Liaquat National Library  ·  Galerie Sadequain", w / 2, 208);
      c.fillText("Bagh-e-Jinnah, Karachi", w / 2, 270);
    }, false),
    roughness: 0.6,
  });
  P.add(signM, new THREE.PlaneGeometry(15, 4.4), -27, 2.9, 62.82);

  // fountain
  P.add(stoneM, lathe([[7.2, 0.3], [7.2, 1.5], [8.3, 1.7], [8.5, 1.2], [8.3, 0]], 28), 0, 0, 30);
  P.add(stoneM, lathe([[1.7, 0], [1.0, 1.6], [0.7, 4], [1.2, 4.6], [3.3, 5.2], [3.5, 5.6], [0.5, 5.4], [0.4, 7.4], [1.6, 7.9], [1.7, 8.2], [0.2, 8.1]], 20), 0, 0, 30);
  colliders.push(circleCol(0, 30, 8.7));

  // parked cars
  const car = (x: number, z: number, color: number) => {
    const paint = std(color, 0.35, { metalness: 0.4 });
    const body = new THREE.Shape();
    body.moveTo(-7.7, 0.9); body.lineTo(7.7, 0.9); body.lineTo(7.9, 2.6); body.lineTo(6.6, 3.2); body.lineTo(-4.6, 3.3); body.lineTo(-7.6, 2.8); body.closePath();
    const cabin = new THREE.Shape();
    cabin.moveTo(-3.4, 3.2); cabin.lineTo(-1.7, 5.2); cabin.lineTo(3.7, 5.2); cabin.lineTo(5.8, 3.2); cabin.closePath();
    const ext = (s: THREE.Shape, d: number) => {
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.18, bevelThickness: 0.18, bevelSegments: 2 });
      g.translate(0, 0, -d / 2);
      return g;
    };
    P.at(x, 0.17, z, 0, () => {
      P.add(paint, ext(body, 6));
      P.add(glass, ext(cabin, 5.2));
      P.box(paint, 5.3, 0.3, 5.5, 1, 5.3, 0);
      for (const sx of [-4.9, 4.9]) for (const sz of [-2.95, 2.95]) {
        P.add(rubber, new THREE.CylinderGeometry(1.25, 1.25, 0.9, 16), sx, 1.25, sz, [Math.PI / 2, 0, 0]);
        P.add(white, prism(0.6, 0.6, 0.95, 6), sx, 1.25, sz, [Math.PI / 2, 0, 0]);
      }
      for (const sz of [-2.2, 2.2]) { P.box(white, 0.2, 0.5, 1.1, -7.75, 2.3, sz); P.box(std(0xb3261e, 0.5), 0.2, 0.5, 1.1, 7.95, 2.3, sz); }
    });
    colliders.push(boxCol(x, z, 16.4, 6.8, undefined, 5.6));
  };
  car(-48, 84.6, 0xe9e6dd); car(60, 84.6, 0x8e1f25); car(30, 99.4, 0x1f3f6b);

  // No buildings in front of Frere Hall (open view across the road).
  const r = rng(42);
  const roofs: [number, number, number, number, number][] = [];

  /* ---------- trees ---------- */
  const trunkG = lathe([[1.75, 0], [1.2, 0.9], [0.95, 3], [0.85, 7], [0.92, 9.6], [0.55, 12.2]], 10, true);
  const tp = trunkG.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const a = Math.atan2(tp.getZ(i), tp.getX(i));
    const f = 1 + 0.13 * Math.sin(a * 3 + tp.getY(i) * 0.6) + 0.07 * Math.sin(a * 5 - tp.getY(i));
    tp.setXYZ(i, tp.getX(i) * f, tp.getY(i), tp.getZ(i) * f);
  }
  trunkG.computeVertexNormals();
  const branchG = lathe([[0.42, 0], [0.3, 2.6], [0.14, 5.8]], 6);
  const blobs = [1, 2, 3].map((seed) => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = 1 + 0.16 * Math.sin(p.getX(i) * 5 + seed) + 0.12 * Math.sin(p.getY(i) * 7 + seed * 2) + 0.1 * Math.sin(p.getZ(i) * 6 + seed * 3);
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  });
  const tree = (x: number, z: number, s: number, solid: boolean) => {
    P.at(x, 0, z, r() * 6.28, () => {
      P.add(barkM, trunkG, 0, 0, 0, [0, 0, (r() - 0.5) * 0.12], [s * (0.9 + r() * 0.3), s, s * (0.9 + r() * 0.3)]);
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + r();
        P.add(barkM, branchG, 0, 8.6 * s, 0, [0.85 * Math.cos(a), 0, 0.85 * Math.sin(a)], [s, s, s]);
      }
      for (let i = 0; i < 8; i++) {
        const a = i * 0.9 + r() * 0.5;
        const d = i === 0 ? 0 : (2.6 + r() * 2.2) * s;
        const sc = (3.4 + r() * 1.8) * s;
        P.add(leafM[i % 3], blobs[i % 3], Math.cos(a) * d, (13 + r() * 4.5 + (i === 0 ? 3 : 0)) * s, Math.sin(a) * d, [r() * 3, r() * 3, 0], [sc, sc * 0.82, sc]);
      }
    });
    if (solid) colliders.push(circleCol(x, z, 1.5 * s, 24 * s));
  };
  const placed: [number, number][] = [];
  for (let i = 0; i < 900 && placed.length < (mobile ? 34 : 50); i++) {
    const x = (r() * 2 - 1) * 134, z = -122 + r() * 186;
    if (paved(x, z, 6) || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 17)) continue;
    placed.push([x, z]);
    tree(x, z, 0.85 + r() * 0.5, true);
  }
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 1.5 + Math.PI * 0.75;
    const tx = Math.cos(a) * 168;
    const tz = -10 + Math.sin(a) * 150;
    const ts = 1.35 + r() * 0.45;
    if (tz > 58 || paved(tx, tz, 7) || placed.some(([px, pz]) => Math.hypot(px - tx, pz - tz) < 16)) continue;
    placed.push([tx, tz]);
    tree(tx, tz, ts, true);
  }
  for (const s of [-1, 1]) {
    for (const tz of [-120, -70, -20]) {
      placed.push([s * 134, tz]);
      tree(s * 134, tz, 1.2, true);
    }
  }
  for (const [tx, ts] of [[-70, 1.25], [0, 1.4], [70, 1.25]] as const) {
    placed.push([tx, -132]);
    tree(tx, -132, ts, true);
  }

  // Landscaped Bagh-e-Jinnah perimeter shade trees & outer lawn groves across the full rectangular park.
  const rOuter = rng(9042);
  for (let x = hxL + 18; x <= hxR - 18; x += 56) {
    const tx = x + (rOuter() - 0.5) * 8;
    const tz = hzB + 15 + rOuter() * 5;
    placed.push([tx, tz]);
    tree(tx, tz, 1.15 + rOuter() * 0.4, true);
  }
  for (const hxEdge of [hxL + 15, hxR - 15]) {
    for (let z = hzB + 64; z <= 52; z += 56) {
      const tx = hxEdge + (rOuter() - 0.5) * 5;
      const tz = z + (rOuter() - 0.5) * 8;
      if (paved(tx, tz, 7)) continue;
      placed.push([tx, tz]);
      tree(tx, tz, 1.15 + rOuter() * 0.4, true);
    }
  }
  const targetOuter = placed.length + (mobile ? 48 : 85);
  for (let i = 0; i < 1600 && placed.length < targetOuter; i++) {
    const tx = hxL + 24 + rOuter() * (hxR - hxL - 48);
    const tz = hzB + 24 + rOuter() * (56 - (hzB + 24));
    if (Math.abs(tx) < 162 && tz > -138) continue; // preserve Frere Hall inner garden & front vista
    if (paved(tx, tz, 8) || placed.some(([px, pz]) => Math.hypot(px - tx, pz - tz) < 30)) continue;
    placed.push([tx, tz]);
    tree(tx, tz, 0.95 + rOuter() * 0.55, true);
  }
  P.build(scene);

  /* ---------- grass tufts + flowers (instanced) ---------- */
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  // A tuft is five thin, tapered blades; replacing the old cone tufts removes the plastic-spike lawn.
  const grassVerts: number[] = [];
  const bladeCount = 5;
  for (let blade = 0; blade < bladeCount; blade++) {
    const az = (blade / bladeCount) * Math.PI * 2;
    const dx = Math.cos(az), dz = Math.sin(az);
    const px = -dz, pz = dx;
    const height = 0.38 + (blade % 3) * 0.11;
    const lean = 0.11 + (blade % 2) * 0.055;
    const width = 0.07;
    const rows: number[][] = [];
    for (let row = 0; row <= 4; row++) {
      const f = row / 4;
      const w = width * (1 - f) ** 0.78;
      const cx = dx * lean * f;
      const cz = dz * lean * f;
      rows.push([
        cx - px * w / 2, height * f, cz - pz * w / 2,
        cx + px * w / 2, height * f, cz + pz * w / 2,
      ]);
    }
    for (let row = 0; row < 4; row++) {
      const a = rows[row];
      const b = rows[row + 1];
      grassVerts.push(a[0], a[1], a[2], a[3], a[4], a[5], b[0], b[1], b[2]);
      grassVerts.push(a[3], a[4], a[5], b[3], b[4], b[5], b[0], b[1], b[2]);
    }
  }
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute("position", new THREE.Float32BufferAttribute(grassVerts, 3));
  grassGeo.computeVertexNormals();
  const nGrass = mobile ? 3200 : 7600;
  const tufts = new THREE.InstancedMesh(grassGeo, new THREE.MeshStandardMaterial({ roughness: 0.96, side: THREE.DoubleSide }), nGrass);
  for (let i = 0; i < nGrass; i++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      if (i % 3 === 0) {
        x = (r() * 2 - 1) * 165;
        z = -145 + r() * 211;
      } else {
        x = hxL + 3 + r() * (hxR - hxL - 6);
        z = hzB + 3 + r() * (66.5 - (hzB + 3));
      }
      if (!paved(x, z, 0.7)) break;
    }
    dummy.position.set(x, 0.02, z);
    dummy.rotation.set(0, r() * 6.28, 0);
    dummy.scale.setScalar(0.65 + r() * 0.65);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
    tufts.setColorAt(i, col.setHSL(0.28 + r() * 0.04, 0.44 + r() * 0.16, 0.34 + r() * 0.11));
  }
  tufts.receiveShadow = true;
  tufts.instanceMatrix.needsUpdate = true;
  if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  tufts.computeBoundingSphere();
  scene.add(tufts);

  const nFlower = mobile ? 600 : 1400;
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.15, 0), new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), nFlower);
  const petal = [0xe2435b, 0xf5c542, 0xfaf3e6, 0xe77fb3, 0xf08a3c];
  for (let i = 0; i < nFlower; i++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 12; tries++) {
      const k = (i + tries) % 3, a = r() * 6.28, s = r() > 0.5 ? 1 : -1;
      if (k === 0) { x = Math.cos(a) * (19 + r() * 3); z = 30 + Math.sin(a) * (19 + r() * 3); }
      else if (k === 1) { x = s * (43.2 + r() * 2.2); z = -34 + r() * 30; }
      else { x = s * (11 + r() * 2.4); z = 2 + r() * 64; }
      if (!paved(x, z, 0.5)) break;
    }
    const fs = 0.8 + r() * 0.8;
    dummy.position.set(x, 0.15 * fs - 0.02, z);
    dummy.rotation.set(r(), r(), r());
    dummy.scale.setScalar(fs);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, col.setHex(petal[Math.floor(r() * petal.length)]));
  }
  scene.add(flowers);
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  flowers.computeBoundingSphere();

  /* ---------- real fountain water ---------- */
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uDay: { value: 1 } },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv; varying float vWave; varying vec3 vW;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w = sin(p.x * 1.5 + uTime * 1.8) * 0.09
                + cos(p.y * 1.9 - uTime * 1.35) * 0.075
                + sin((p.x + p.y) * 3.4 + uTime * 2.5) * 0.035;
        p.z += w;
        vWave = w;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uDay;
      varying vec2 vUv; varying float vWave; varying vec3 vW;
      void main() {
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(v.y, 0.0, 1.0), 2.4);
        vec3 deep = mix(vec3(0.015, 0.07, 0.13), vec3(0.03, 0.20, 0.28), uDay);
        vec3 shallow = mix(vec3(0.08, 0.19, 0.30), vec3(0.30, 0.60, 0.68), uDay);
        vec3 col = mix(deep, shallow, clamp(fres * 0.8 + 0.28 + vWave * 2.2, 0.0, 1.0));
        vec3 sun = normalize(vec3(0.44, 0.58, 0.69));
        float spec = pow(max(dot(reflect(-v, vec3(0.0, 1.0, 0.0)), sun), 0.0), 90.0) * 1.6;
        float glint = pow(max(sin(vUv.x * 88.0 + uTime * 2.6) * cos(vUv.y * 74.0 - uTime * 2.1), 0.0), 10.0) * 0.22;
        col += vec3(spec + glint) * mix(0.45, 1.0, uDay);
        float d = length(vUv - 0.5) * 2.0;
        if (d > 1.0) discard;
        float foam = smoothstep(0.82, 1.0, d) * (0.35 + 0.22 * sin(d * 26.0 - uTime * 4.0));
        col = mix(col, vec3(0.86, 0.94, 0.98), clamp(foam, 0.0, 0.75));
        gl_FragColor = vec4(col, 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(14.7, 14.7, 72, 72), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 1.32, 30);
  scene.add(water);

  const upperWater = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5, 40, 40), waterMat);
  upperWater.rotation.x = -Math.PI / 2;
  upperWater.position.set(0, 5.18, 30);
  scene.add(upperWater);

  const jetM = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uDay: { value: 1 } },
    vertexShader: `
      uniform float uTime; varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.x += sin(p.y * 3.4 + uTime * 2.8) * 0.035;
        p.z += cos(p.y * 2.8 - uTime * 2.2) * 0.035;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uDay; varying vec2 vUv;
      void main() {
        float edge = smoothstep(0.0, 0.22, vUv.x) * (1.0 - smoothstep(0.78, 1.0, vUv.x));
        float drops = pow(max(sin(vUv.y * 34.0 - uTime * 5.8 + vUv.x * 8.0), 0.0), 8.0);
        float alpha = edge * (0.24 + drops * 0.46) * (0.55 + 0.45 * uDay);
        vec3 color = mix(vec3(0.28, 0.50, 0.68), vec3(0.8, 0.94, 1.0), drops);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const jets: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const j = new THREE.Mesh(lathe([[0.32, 0], [0.16, 2], [0.05, 3.6]], 6), jetM);
    const a = (i / 6) * Math.PI * 2;
    j.position.set(i === 6 ? 0 : Math.cos(a) * 4.6, i === 6 ? 8.1 : 1.3, 30 + (i === 6 ? 0 : Math.sin(a) * 4.6));
    scene.add(j);
    jets.push(j);
  }

  // falling sheets from the upper bowl
  const waterfallMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uDay: { value: 1 } },
    vertexShader: `
      uniform float uTime; varying vec2 vUv; varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.x += sin(p.y * 3.1 + uTime * 2.3) * 0.045;
        p.z += cos(p.y * 2.4 - uTime * 1.8) * 0.035;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uDay;
      varying vec2 vUv; varying vec3 vWorld;
      void main() {
        float sideFade = smoothstep(0.0, 0.13, vUv.x) * (1.0 - smoothstep(0.87, 1.0, vUv.x));
        float endFade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.86, 1.0, vUv.y));
        float streak = pow(max(sin(vUv.x * 71.0 + sin(vUv.y * 18.0 - uTime * 3.0) * 0.7), 0.0), 8.0);
        float flow = 0.72 + 0.18 * sin(vUv.y * 34.0 - uTime * 5.2 + vUv.x * 6.0) + 0.16 * streak;
        vec3 col = mix(vec3(0.28, 0.54, 0.68), vec3(0.68, 0.87, 0.95), clamp(flow, 0.0, 1.0));
        col *= mix(0.7, 1.05, uDay);
        float alpha = sideFade * endFade * (0.32 + streak * 0.32) * flow;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.65, 2, 24), waterfallMat);
    sheet.position.set(Math.cos(a) * 3.18, 3.36, 30 + Math.sin(a) * 3.18);
    sheet.rotation.y = -a + Math.PI / 2;
    scene.add(sheet);
  }
  // spray droplets
  const nDrop = mobile ? 120 : 260;
  const dropGeo = new THREE.BufferGeometry();
  const dropPos = new Float32Array(nDrop * 3);
  const dropSeed = new Float32Array(nDrop * 3);
  for (let i = 0; i < nDrop; i++) {
    const a = r() * 6.28, d = r() * 5.2;
    dropSeed[i * 3] = Math.cos(a) * d;
    dropSeed[i * 3 + 1] = 0.4 + r() * 4.2;
    dropSeed[i * 3 + 2] = Math.sin(a) * d;
    dropPos[i * 3] = dropSeed[i * 3];
    dropPos[i * 3 + 1] = 1.3 + dropSeed[i * 3 + 1];
    dropPos[i * 3 + 2] = 30 + dropSeed[i * 3 + 2];
  }
  dropGeo.setAttribute("position", new THREE.BufferAttribute(dropPos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({
    color: 0xd8f2ff, size: 0.26, transparent: true, opacity: 0.75, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(drops);

  const lamps = lampPos;

  return {
    lamps,
    roofs,
    waterMat,
    lampMaterial: lampGlass,
    waterfallMat,
    update(t: number, day: number) {
      // Park lamps: fully off in daylight, bright at night (auto by day factor).
      lampGlass.emissiveIntensity = (1 - day) * 3.2;
      waterMat.uniforms.uTime.value = t;
      waterMat.uniforms.uDay.value = day;
      waterfallMat.uniforms.uTime.value = t;
      waterfallMat.uniforms.uDay.value = day;
      jetM.uniforms.uTime.value = t;
      jetM.uniforms.uDay.value = day;
      const arr = dropGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < nDrop; i++) {
        const h = ((dropSeed[i * 3 + 1] - t * 3.2 - i * 0.37) % 5.2 + 5.2) % 5.2;
        arr[i * 3 + 1] = 1.15 + h;
        arr[i * 3] = dropSeed[i * 3] * (1 + h * 0.06);
        arr[i * 3 + 2] = 30 + dropSeed[i * 3 + 2] * (1 + h * 0.06);
      }
      dropGeo.attributes.position.needsUpdate = true;
    },
  };
}
