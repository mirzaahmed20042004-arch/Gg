import * as THREE from "three";
import {
  Batch, tex, speckle, archPath, archWall, archPanel, prism, lathe, tilePlane, std, mapped,
  boxCol, circleCol, rng, type Collider, type Seat,
} from "./kit";

export interface Door {
  left: THREE.Group;
  right: THREE.Group;
  open: boolean;
  /** 0 closed … 1 open */
  t: number;
  x: number;
  z: number;
}
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface Hall {
  door: Door;
  heights: [number, number, number, number, number][];
  interior: Bounds & { ceil: number };
  outer: Bounds;
  winExt: THREE.MeshStandardMaterial;
  interiorLights: THREE.PointLight[];
  tubeMaterial: THREE.MeshStandardMaterial;
}

/* ------------------------------ textures ------------------------------ */
const limestoneTex = () =>
  tex(512, 512, (c, w, h) => {
    speckle(c, w, h, "#d8bd84", ["#c6a76a", "#e8d4a2", "#b9995c", "#efe0b6"], 5200, 7, 11);
    const r = rng(5);
    for (let y = 0; y < h; y += 64) {
      let x = (y / 64) % 2 ? -50 : 0;
      while (x < w) {
        const bw = 92 + r() * 70;
        c.fillStyle = r() > 0.5 ? `rgba(255,240,200,${r() * 0.1})` : `rgba(110,80,35,${r() * 0.12})`;
        c.fillRect(x, y, bw, 64);
        c.fillStyle = "rgba(105,80,42,0.5)";
        c.fillRect(x, y, 2.5, 64);
        x += bw;
      }
      c.fillStyle = "rgba(105,80,42,0.55)";
      c.fillRect(0, y, w, 3);
      c.fillStyle = "rgba(255,246,214,0.25)";
      c.fillRect(0, y + 3, w, 2);
    }
  });

const roofTex = () =>
  tex(256, 256, (c, w, h) => {
    speckle(c, w, h, "#5c8e7b", ["#4b7968", "#73a593", "#3f6a5a"], 1800, 9, 3);
    for (let y = 0; y < h; y += 32) {
      c.fillStyle = "rgba(20,48,38,0.55)";
      c.fillRect(0, y, w, 4);
      for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) c.fillRect(x, y, 2, 32);
      c.fillStyle = "rgba(220,255,240,0.14)";
      c.fillRect(0, y + 4, w, 2);
    }
  });

const woodTex = (base: string, seed: number) =>
  tex(256, 256, (c, w, h) => {
    speckle(c, w, h, base, ["#2c1a0c", "#7a5232", "#40260f"], 500, 3, seed);
    const r = rng(seed);
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(${r() > 0.5 ? "20,10,4" : "150,105,60"},${0.06 + r() * 0.12})`;
      c.fillRect(0, r() * h, w, 1 + r() * 2.5);
    }
  });

const parquetTex = () =>
  tex(256, 256, (c) => {
    const tones = ["#8a5c34", "#96673c", "#7c5230", "#a17346"];
    const r = rng(9);
    for (let y = 0; y < 256; y += 32)
      for (let x = (y / 32) % 2 ? -64 : 0; x < 256; x += 128) {
        c.fillStyle = tones[Math.floor(r() * 4)];
        c.fillRect(x, y, 128, 32);
        c.strokeStyle = "rgba(40,22,8,0.55)";
        c.strokeRect(x + 0.5, y + 0.5, 128, 32);
      }
  });

const booksTex = (seed: number) =>
  tex(512, 512, (c, w, h) => {
    c.fillStyle = "#2a190d";
    c.fillRect(0, 0, w, h);
    const r = rng(seed);
    const pal = ["#7b1e22", "#1f3a5f", "#275b3a", "#8a6a1f", "#4a2c5e", "#a5432a", "#2f2f35", "#b9a37a", "#14506b", "#6b2d3e"];
    for (let row = 0; row < 5; row++) {
      const y0 = row * 102 + 96;
      c.fillStyle = "#6a4526";
      c.fillRect(0, y0, w, 8);
      let x = 6;
      while (x < w - 12) {
        const bw = 9 + r() * 17;
        const bh = 58 + r() * 30;
        if (r() > 0.94) { x += bw; continue; }
        c.fillStyle = pal[Math.floor(r() * pal.length)];
        c.fillRect(x, y0 - bh, bw, bh);
        c.fillStyle = "rgba(255,255,255,0.14)";
        c.fillRect(x, y0 - bh, 1.5, bh);
        c.fillStyle = "rgba(0,0,0,0.3)";
        c.fillRect(x + bw - 1.5, y0 - bh, 1.5, bh);
        c.fillStyle = r() > 0.4 ? "#d9b860" : "#e9e2d0";
        c.fillRect(x + 2, y0 - bh + 9, bw - 4, 2.5);
        c.fillRect(x + 2, y0 - 14, bw - 4, 1.5);
        x += bw + 0.6;
      }
    }
  }, false);

/** Gothic lancet window: striped red/buff arch, tracery, dark or glowing glass. */
const windowTex = (glow: boolean) =>
  tex(256, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const arch = (inset: number) => {
      c.beginPath();
      archPath(c, w / 2, w - inset * 2, h - 6, 190 + inset * 0.3, inset);
      c.closePath();
    };
    arch(4);
    c.fillStyle = "#eadcbb";
    c.fill();
    c.save();
    arch(15);
    c.lineWidth = 22;
    c.setLineDash([24, 24]);
    c.strokeStyle = "#a5463a";
    c.stroke();
    c.restore();
    arch(30);
    const g = c.createLinearGradient(0, 0, 0, h);
    if (glow) { g.addColorStop(0, "#fff8dc"); g.addColorStop(0.6, "#d6ecf7"); g.addColorStop(1, "#b5d3e6"); }
    else { g.addColorStop(0, "#35585c"); g.addColorStop(0.5, "#182e31"); g.addColorStop(1, "#0d1c1e"); }
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = glow ? "#6b5132" : "#e3d6b6";
    c.lineWidth = 7;
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(w / 2, 150); c.lineTo(w / 2, h - 8);
    c.moveTo(34, 330); c.lineTo(w - 34, 330);
    c.moveTo(34, 210); c.quadraticCurveTo(w / 4 + 16, 130, w / 2, 210);
    c.quadraticCurveTo((w * 3) / 4 - 16, 130, w - 34, 210);
    c.stroke();
    c.beginPath();
    c.arc(w / 2, 112, 30, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.arc(w / 2 + Math.cos((i * Math.PI) / 2) * 13, 112 + Math.sin((i * Math.PI) / 2) * 13, 11, 0, Math.PI * 2);
      c.stroke();
    }
  }, false);

const roseTex = () =>
  tex(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    c.fillStyle = "#eadcbb"; c.beginPath(); c.arc(128, 128, 124, 0, 7); c.fill();
    c.lineWidth = 20; c.setLineDash([26, 26]); c.strokeStyle = "#a5463a";
    c.beginPath(); c.arc(128, 128, 108, 0, 7); c.stroke(); c.setLineDash([]);
    c.fillStyle = "#162c2f"; c.beginPath(); c.arc(128, 128, 92, 0, 7); c.fill();
    c.strokeStyle = "#e3d6b6"; c.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); c.stroke();
      c.beginPath(); c.arc(128 + Math.cos(a + 0.39) * 62, 128 + Math.sin(a + 0.39) * 62, 20, 0, 7); c.stroke();
    }
    c.fillStyle = "#eadcbb"; c.beginPath(); c.arc(128, 128, 18, 0, 7); c.fill();
  }, false);

/** Abstract tribute to Sadequain's "Arz-o-Samawat" ceiling mural. */
const muralTex = () =>
  tex(1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#10263f"); g.addColorStop(0.5, "#1c4a52"); g.addColorStop(1, "#3a2148");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = rng(1987);
    const cols = ["#e8b44a", "#3fc1b0", "#f3ead0", "#d9603a", "#7fb4e8"];
    for (let i = 0; i < 26; i++) {
      c.fillStyle = cols[Math.floor(r() * 5)]; c.globalAlpha = 0.25 + r() * 0.5;
      c.beginPath(); c.arc(r() * w, r() * h, 8 + r() * 46, 0, 7); c.fill();
    }
    c.lineCap = "round";
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = cols[Math.floor(r() * 5)]; c.globalAlpha = 0.55 + r() * 0.45; c.lineWidth = 3 + r() * 9;
      const x = r() * w, y = r() * h;
      c.beginPath(); c.moveTo(x, y);
      c.bezierCurveTo(x + (r() - 0.5) * 260, y + (r() - 0.5) * 200, x + (r() - 0.5) * 260, y + (r() - 0.5) * 200, x + (r() - 0.5) * 320, y + (r() - 0.5) * 160);
      c.stroke();
    }
    c.globalAlpha = 1; c.strokeStyle = "#c9a24b"; c.lineWidth = 18; c.strokeRect(9, 9, w - 18, h - 18);
  }, false);

const signTex = (line1: string, line2: string) =>
  tex(1024, 160, (c, w, h) => {
    c.fillStyle = "#143528"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#d3b05e"; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = "#f1dfa6"; c.textAlign = "center"; c.textBaseline = "middle";
    let titleSize = 76;
    do {
      c.font = `700 ${titleSize}px Georgia, 'Times New Roman', serif`;
      if (c.measureText(line1).width <= w - 64) break;
      titleSize -= 2;
    } while (titleSize > 34);
    c.fillText(line1, w / 2, line2 ? 60 : 84, w - 64);
    c.fillStyle = "#d3b05e";
    let subSize = 30;
    do {
      c.font = `600 ${subSize}px Georgia, serif`;
      if (c.measureText(line2).width <= w - 64) break;
      subSize -= 1;
    } while (subSize > 16);
    c.fillText(line2, w / 2, 113, w - 64);
  }, false);

const doorTex = () =>
  tex(256, 512, (c, w, h) => {
    speckle(c, w, h, "#4b2d17", ["#2e1a0b", "#6a4425"], 600, 3, 21);
    for (let i = 0; i < 3; i++) {
      const y = 26 + i * 158;
      c.fillStyle = "rgba(20,10,4,0.55)"; c.fillRect(30, y, w - 60, 132);
      c.fillStyle = "#5a371d"; c.fillRect(40, y + 10, w - 80, 112);
      c.fillStyle = "rgba(255,220,170,0.12)"; c.fillRect(40, y + 10, w - 80, 5);
    }
    c.fillStyle = "#1b1b1e";
    for (const y of [70, 256, 442]) { c.fillRect(0, y - 9, w * 0.8, 18); }
    c.fillStyle = "#8f7a45";
    for (let y = 16; y < h; y += 40) for (const x of [14, w - 14]) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
  }, false);

const rugTex = () =>
  tex(256, 512, (c, w, h) => {
    c.fillStyle = "#7a1f24"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#d9b860"; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
    c.strokeStyle = "#1f3a5f"; c.lineWidth = 6; c.strokeRect(30, 30, w - 60, h - 60);
    c.fillStyle = "#d9b860";
    for (let y = 80; y < h - 60; y += 70) { c.save(); c.translate(w / 2, y); c.rotate(Math.PI / 4); c.fillRect(-20, -20, 40, 40); c.restore(); }
  }, false);

/* ------------------------------ build ------------------------------ */
export function buildHall(scene: THREE.Scene, colliders: Collider[], seats: Seat[], mobile: boolean): Hall {
  const stone = mapped(limestoneTex(), 0.93);
  const stonePlain = std(0xd6bb82, 0.93);
  const red = std(0xa24a3c, 0.85);
  const grey = std(0x8d887c, 0.9);
  const roofMap = roofTex();
  roofMap.repeat.set(0.09, 0.09);
  const roofM = mapped(roofMap, 0.7);
  const roofPlain = std(0x5c8e7b, 0.7, { flatShading: true });
  const wood = mapped(woodTex("#5a3a22", 4), 0.7);
  const darkWood = mapped(woodTex("#3a2414", 8), 0.6);
  const brass = std(0xc9a24b, 0.35, { metalness: 0.8 });
  const dark = std(0x14181a, 0.8);
  const winExt = new THREE.MeshStandardMaterial({ map: windowTex(false), alphaTest: 0.5, roughness: 0.5 });
  const winInt = new THREE.MeshBasicMaterial({ map: windowTex(true), alphaTest: 0.5, toneMapped: false });
  const rose = new THREE.MeshStandardMaterial({ map: roseTex(), alphaTest: 0.5, roughness: 0.5 });
  const T = 12; // stone tile size in world units

  const B = new Batch();
  const win = (b: Batch, m: THREE.Material, w: number, h: number, x: number, y: number, z: number, ry: number) =>
    b.add(m, new THREE.PlaneGeometry(w, h), x, y, z, [0, ry, 0]);

  // ---- walls (hollow shell with a door opening) ----
  B.box(stone, 46, 36, 2, -33, 18, -55, 0, T);
  B.box(stone, 46, 36, 2, 33, 18, -55, 0, T);
  B.add(stone, archWall(20, 36, 2, [{ x: 0, w: 9, spring: 9, apex: 13.5 }], T), 0, 0, -55);
  B.box(stone, 112, 36, 2, 0, 18, -101, 0, T);
  for (const s of [-1, 1]) B.box(stone, 2, 36, 48, s * 57, 18, -78, 0, T);
  colliders.push(boxCol(-31.25, -55, 53.5, 2.8, undefined, 52), boxCol(31.25, -55, 53.5, 2.8, undefined, 52), boxCol(0, -101, 116, 2.8, undefined, 52), boxCol(-57, -78, 2.8, 48, undefined, 52), boxCol(57, -78, 2.8, 48, undefined, 52));

  // plinth, string courses, parapet
  for (const [w, d, x, z] of [[118, 3.2, 0, -101.4], [3.2, 50, -57.4, -78], [3.2, 50, 57.4, -78], [47, 3.2, -34.5, -54.6], [47, 3.2, 34.5, -54.6]]) {
    B.box(grey, w, 1.8, d, x, 0.9, z);
    for (const y of [18.6, 35.6]) B.box(red, w + 0.2, 0.9, d - 0.2, x, y, z);
  }
  for (let x = -55; x <= 55; x += 5.5) for (const z of [-54.6, -101.4]) B.box(stone, 2.8, 2.2, 2.6, x, 37.1, z, 0, T);
  for (let z = -96; z <= -60; z += 6) for (const s of [-1, 1]) B.box(stone, 2.6, 2.2, 2.8, s * 57.4, 37.1, z, 0, T);

  // buttresses with pinnacles
  const buttress = (x: number, z: number, ry: number) =>
    B.at(x, 0, z, ry, () => {
      B.box(stone, 2.8, 26, 2, 0, 13, 0, 0, T);
      B.box(stone, 2.4, 8, 1.4, 0, 30, -0.3, 0, T);
      B.box(red, 3.2, 0.7, 2.4, 0, 26.2, 0);
      B.add(red, prism(0.01, 1.5, 4.5, 4), 0, 36.2, -0.3);
    });
  for (const x of [-36, -24, -12, 12, 24, 36, 48]) buttress(x, -53.4, 0);
  for (const x of [-48, -36, -24, -12, 0, 12, 24, 36, 48]) buttress(x, -102.6, Math.PI);
  for (const z of [-66, -78, -90]) { buttress(58.6, z, Math.PI / 2); buttress(-58.6, z, -Math.PI / 2); }

  // ---- roof, gables, flèche ----
  const tri = new THREE.Shape();
  tri.moveTo(-27, 0); tri.lineTo(27, 0); tri.lineTo(0, 15); tri.closePath();
  const roofG = new THREE.ExtrudeGeometry(tri, { depth: 120, bevelEnabled: false });
  roofG.translate(0, 0, -60);
  B.add(roofM, roofG, 0, 36.6, -78, [0, Math.PI / 2, 0]);
  const gable = new THREE.Shape();
  gable.moveTo(-25, 0); gable.lineTo(25, 0); gable.lineTo(0, 13.9); gable.closePath();
  for (const s of [-1, 1]) {
    B.add(stonePlain, new THREE.ShapeGeometry(gable), s * 60.05, 36.6, -78, [0, (s * Math.PI) / 2, 0]);
    win(B, rose, 8.5, 8.5, s * 60.15, 42, -78, (s * Math.PI) / 2);
  }
  B.box(red, 121, 0.8, 1.2, 0, 51.7, -78);
  B.box(stone, 6, 7, 6, 14, 53.5, -78, 0, T);
  B.box(red, 6.8, 0.8, 6.8, 14, 57.2, -78);
  B.add(roofPlain, prism(0.01, 3.4, 27, 8), 14, 71, -78);
  B.add(brass, new THREE.IcosahedronGeometry(0.7, 1), 14, 85, -78);

  // ---- octagonal clock tower ----
  const TX = -50, TZ = -46;
  B.add(grey, prism(9.4, 9.4, 2, 8), TX, 1, TZ);
  B.add(stone, prism(8.5, 8.5, 36, 8, T), TX, 18, TZ);
  B.add(red, prism(9.1, 9.1, 1.2, 8), TX, 36.6, TZ);
  B.add(stone, prism(7.8, 7.8, 22, 8, T), TX, 48.2, TZ);
  B.add(red, prism(9.5, 8.1, 1.8, 8), TX, 60.1, TZ);
  B.add(dark, prism(5.4, 5.4, 9.5, 8), TX, 65.6, TZ);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    B.box(stone, 1.2, 9.5, 1.2, TX + Math.sin(a) * 7.6, 65.6, TZ + Math.cos(a) * 7.6, a, T);
  }
  B.add(stone, prism(8.6, 8.6, 1.6, 8), TX, 71.2, TZ);
  B.add(roofPlain, prism(0.01, 9.4, 25, 8), TX, 84.5, TZ);
  B.box(brass, 0.3, 5, 0.3, TX, 98.5, TZ);
  B.add(brass, new THREE.IcosahedronGeometry(0.8, 1), TX, 97.6, TZ);
  for (const a of [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]) {
    const sx = Math.sin(a), cz = Math.cos(a);
    win(B, winExt, 4.6, 9.5, TX + sx * 7.94, 9, TZ + cz * 7.94, a);
    win(B, winExt, 4.6, 9.5, TX + sx * 7.94, 27, TZ + cz * 7.94, a);
    win(B, winExt, 4.2, 13, TX + sx * 7.29, 48.5, TZ + cz * 7.29, a);
  }
  colliders.push(circleCol(TX, TZ, 9.3));

  // ---- entrance porch ----
  const arch3 = [-9, 0, 9].map((x) => ({ x, w: 6.4, spring: 8, apex: 12.2 }));
  B.add(stone, archWall(28, 15, 2, arch3, T), 0, 0, -41);
  for (const s of [-1, 1]) {
    B.add(stone, archWall(12, 15, 2, [{ x: 0, w: 7, spring: 8, apex: 12.2 }], T), s * 13, 0, -48, [0, Math.PI / 2, 0]);
    B.add(red, prism(0.01, 1.4, 4.5, 4), s * 13, 19.6, -41);
    colliders.push(boxCol(s * 13, -52.9, 2.2, 2.6), boxCol(s * 13, -42.2, 2.2, 4.6), boxCol(s * 4.5, -41, 2.8, 2.2));
  }
  B.box(stone, 29, 1.4, 15, 0, 15.7, -47, 0, T);
  B.box(red, 29.6, 0.7, 15.4, 0, 16.6, -47);
  for (let x = -12.6; x <= 12.7; x += 4.2) B.box(stone, 2.4, 1.6, 1.6, x, 17.7, -40.6, 0, T);
  win(B, new THREE.MeshStandardMaterial({ map: signTex("FRERE HALL", "KARACHI  ·  EST. 1865"), roughness: 0.6 }), 15, 2.35, 0, 13.6, -39.94, 0);

  // ---- exterior windows ----
  for (const x of [-30, -18, 18, 30, 42, 53]) win(B, winExt, 6.5, 12, x, 8.6, -53.94, 0);
  for (const x of [-30, -18, -7.5, 7.5, 18, 30, 42, 53]) win(B, winExt, 6, 12, x, 27, -53.94, 0);
  win(B, winExt, 7.5, 14, 0, 27, -53.94, 0);
  for (const x of [-42, -30, -18, -6, 6, 18, 30, 42]) for (const y of [8.6, 27]) win(B, winExt, 6.5, 12, x, y, -102.06, Math.PI);
  for (const z of [-60, -72, -84, -96]) for (const y of [8.6, 27]) for (const s of [-1, 1]) win(B, winExt, 6.5, 12, s * 58.06, y, z, (s * Math.PI) / 2);
  /* ---------------- raised terrace + grand staircases ---------------- */
  const TR = 1.86;
  B.box(grey, 172, TR, 84, 0, TR / 2, -76, 0, T); // terrace platform
  B.box(stone, 172, 0.7, 2, 0, TR + 0.35, -33.4, 0, T); // terrace edge trim
  const STEP_D = 7.02 / 6;
  const stairs = (cx: number, w: number) => {
    for (let i = 0; i < 6; i++) {
      const zc = -27 - i * STEP_D - STEP_D / 2;
      B.box(grey, w, ((i + 1) * TR) / 6, STEP_D + 0.12, cx, ((i + 1) * TR) / 12, zc, 0, 4);
      B.box(stone, w + 0.5, 0.34, 0.7, cx, (i + 1) * (TR / 6) + 0.1, -27 - i * STEP_D, 0, 4);
    }
  };
  stairs(0, 38);
  stairs(62, 15);
  stairs(-62, 15);
  for (const s of [-1, 1]) {
    B.box(stone, 3, TR + 1.1, 24, s * 20.6, (TR + 1.1) / 2, -34, 0, T);
    B.box(stone, 3, TR + 1.1, 24, s * 71.2, (TR + 1.1) / 2, -34, 0, T);
  }
  B.build(scene);

  /* ------------------------------ doors ------------------------------ */
  const leafMat = new THREE.MeshStandardMaterial({ map: doorTex(), roughness: 0.6 });
  const makeLeaf = (side: 1 | -1) => {
    const pivot = new THREE.Group();
    pivot.position.set(-side * 4.5, 1.86, -55);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(4.46, 8.6, 0.4), leafMat);
    leaf.position.set(side * 2.25, 4.3, 0);
    leaf.castShadow = true;
    pivot.add(leaf);
    for (const z of [-0.35, 0.35]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.22), brass);
      h.position.set(side * 4.0, 4.0, z);
      pivot.add(h);
    }
    scene.add(pivot);
    return pivot;
  };
  const door: Door = { left: makeLeaf(1), right: makeLeaf(-1), open: false, t: 0, x: 0, z: -55 };
  colliders.push(boxCol(0, -55, 9, 1.4, () => door.t < 0.55));
  const tymp = new THREE.Mesh(archPanel(9, 0, 4.5), new THREE.MeshStandardMaterial({ color: 0x20363a, roughness: 0.25, metalness: 0.3, side: THREE.DoubleSide }));
  tymp.position.set(0, 10.3, -55);
  scene.add(tymp);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 0.9), red);
  lintel.position.set(0, 10.55, -55);
  scene.add(lintel);

  /* ------------------------------ interior: Liaquat National Library ------------------------------ */
  const I = new Batch();
  const IG = new THREE.Group();
  IG.position.y = 1.86;
  scene.add(IG);
  const floorM = mapped(parquetTex(), 0.55);
  I.add(floorM, tilePlane(112, 44, 9), 0, 0.06, -78, [-Math.PI / 2, 0, 0]);
  I.add(new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 0.95 }), new THREE.PlaneGeometry(13, 34), 0, 0.1, -79, [-Math.PI / 2, 0, 0]);
  I.box(std(0xe9dfc8, 0.95), 112, 1.5, 44, 0, 18.75, -78);
  I.add(new THREE.MeshBasicMaterial({ map: muralTex(), toneMapped: false, color: 0xd8d8d8 }), new THREE.PlaneGeometry(46, 23), 0, 17.94, -78, [Math.PI / 2, 0, 0]);
  for (let x = -48; x <= 48; x += 16) I.box(darkWood, 1.2, 1, 44, x, 17.6, -78);
  win(I, new THREE.MeshBasicMaterial({ map: signTex("LIAQUAT NATIONAL LIBRARY", "70,000 VOLUMES  ·  FRERE HALL"), toneMapped: false }), 30, 4.7, 0, 15, -99.6, 0);
  for (const x of [-42, -30, -18, 18, 30, 42]) win(I, winInt, 6.2, 11.5, x, 8.6, -55.94, Math.PI);
  for (const z of [-60, -68, -76, -84, -92]) for (const s of [-1, 1]) win(I, winInt, 5.6, 11.5, s * 55.94, 8.6, z, (-s * Math.PI) / 2);

  // stone piers carrying the upper floor
  for (const x of [-26, 26]) for (const z of [-64, -78, -92]) {
    I.box(stone, 2.4, 18, 2.4, x, 9, z, 0, T);
    I.box(red, 3.2, 0.8, 3.2, x, 15.4, z);
    I.box(grey, 3.2, 1.2, 3.2, x, 0.6, z);
    colliders.push(boxCol(x, z, 2.8, 2.8));
  }

  // bookshelves
  const bookMats = [1, 2, 3].map((s) => new THREE.MeshStandardMaterial({ map: booksTex(s * 13), roughness: 0.8 }));
  let bi = 0;
  const shelf = (x: number, z: number, ry: number, double: boolean) =>
    I.at(x, 0, z, ry, () => {
      I.box(darkWood, 11, 12, 2.4, 0, 6, 0);
      I.box(darkWood, 11.5, 0.6, 3, 0, 12.3, 0);
      I.add(bookMats[bi++ % 3], new THREE.PlaneGeometry(10.4, 11.2), 0, 6.1, 1.22);
      if (double) I.add(bookMats[bi++ % 3], new THREE.PlaneGeometry(10.4, 11.2), 0, 6.1, -1.22, [0, Math.PI, 0]);
    });
  for (const x of [-44, -33, -22, -11, 0, 11, 22, 33, 44]) shelf(x, -98.7, 0, false);
  colliders.push(boxCol(0, -98.7, 99, 2.6));
  for (const s of [-1, 1]) for (const z of [-64, -72, -80, -88]) {
    shelf(s * 46.5, z, 0, true);
    shelf(s * 35.5, z, 0, true);
    colliders.push(boxCol(s * 41, z, 22.2, 2.6));
  }

  // reading tables, chairs, lamps and loose books
  const pal = [0x7b1e22, 0x1f3a5f, 0x275b3a, 0x8a6a1f, 0x4a2c5e].map((c) => std(c, 0.7));
  const page = std(0xf3ecd8, 0.9);
  const shade = new THREE.MeshStandardMaterial({ color: 0x1f6a4a, emissive: 0x2f8a5f, emissiveIntensity: 0.5, roughness: 0.4 });
  const r = rng(77);
  const chair = (x: number, z: number, yaw: number) => {
    I.at(x, 0, z, yaw, () => {
      I.box(wood, 2.2, 0.26, 2.2, 0, 1.6, 0);
      I.box(wood, 2.2, 0.5, 0.24, 0, 3.9, -1.0);
      I.box(wood, 2.2, 0.5, 0.24, 0, 2.9, -1.0);
      for (const sx of [-0.95, 0.95]) { I.box(wood, 0.26, 4.2, 0.26, sx, 2.1, -1.0); I.box(wood, 0.26, 1.5, 0.26, sx, 0.75, 0.95); }
    });
    seats.push({ x, z, y: 1.73 + 1.86, yaw });
    colliders.push(circleCol(x, z, 1.05));
  };
  for (const tx of [-13, 13]) for (const tz of [-69, -85]) {
    I.at(tx, 0, tz, 0, () => {
      I.box(darkWood, 10.4, 0.4, 5.2, 0, 2.9, 0);
      I.box(darkWood, 9.4, 0.5, 4.2, 0, 2.5, 0);
      for (const sx of [-4.6, 4.6]) for (const sz of [-2.1, 2.1]) I.box(darkWood, 0.5, 2.7, 0.5, sx, 1.35, sz);
      I.box(brass, 0.18, 1.5, 0.18, 0, 3.85, 0);
      I.add(shade, prism(0.5, 1.1, 0.7, 4), 0, 4.8, 0);
      for (let i = 0; i < 5; i++) I.box(pal[Math.floor(r() * 5)], 1.5, 0.28, 1.1, -3.4, 3.24 + i * 0.28, 1.2, r() * 0.6);
      for (const sx of [-0.62, 0.62]) I.box(page, 1.2, 0.1, 1.7, 3 + sx, 3.16, -0.9, 0);
      I.box(pal[2], 2.6, 0.06, 1.8, 3, 3.12, -0.9);
      I.box(pal[0], 1.5, 0.3, 1.1, 2.4, 3.25, 1.4, 0.5);
    });
    colliders.push(boxCol(tx, tz, 10.4, 5.2));
    for (const sx of [-2.7, 2.7]) { chair(tx + sx, tz + 3.9, Math.PI); chair(tx + sx, tz - 3.9, 0); }
  }

  // librarian desk, globe, card catalogue, plants
  I.box(darkWood, 14, 3.4, 3, 26, 1.7, -61);
  I.box(wood, 14.6, 0.3, 3.6, 26, 3.5, -61);
  I.box(brass, 0.2, 1.2, 0.2, 31, 4.2, -61);
  I.add(std(0x2f6f8f, 0.5), new THREE.IcosahedronGeometry(1.1, 2), 31, 5.6, -61);
  I.box(darkWood, 9, 7, 2.6, -26, 3.5, -58);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) I.box(brass, 0.5, 0.16, 0.12, -29 + i * 2, 1.3 + j * 1.5, -56.66);
  colliders.push(boxCol(26, -61, 14.6, 3.6), boxCol(-26, -58, 9, 2.8));
  const leaf = std(0x2f6b35, 0.85, { flatShading: true });
  for (const s of [-1, 1]) {
    I.add(std(0x9c5b3b, 0.8), lathe([[0.7, 0], [1.0, 1.3], [1.15, 1.9], [1.0, 2]], 10), s * 9, 0, -58.6);
    for (let i = 0; i < 4; i++) I.add(leaf, new THREE.IcosahedronGeometry(1, 1), s * 9 + Math.sin(i * 2) * 0.6, 3 + i * 0.9, -58.6 + Math.cos(i * 2) * 0.6, [i, i, 0], [1.1, 1.3, 1.1]);
    colliders.push(circleCol(s * 9, -58.6, 1.3));
  }

  // long tube lights — visibly lit
  const tubeM = new THREE.MeshStandardMaterial({
    color: 0xfff4d6,
    emissive: 0xffd990,
    emissiveIntensity: 0.04,
    roughness: 0.42,
    toneMapped: false,
  });
  for (const [x, z, len] of [[-34, -68, 14], [0, -68, 14], [34, -68, 14], [-34, -88, 14], [0, -88, 14], [34, -88, 14]] as [number, number, number][]) {
    I.box(new THREE.MeshStandardMaterial({ color: 0x2b2b2f, roughness: 0.6 }), len, 0.34, 0.72, x, 16.6, z);
    I.add(tubeM, new THREE.BoxGeometry(len - 0.3, 0.12, 0.56), x, 16.38, z);
  }
  const interiorLights: THREE.PointLight[] = [];
  for (const [x, z] of [[-34, -68], [0, -68], [34, -68], [-34, -88], [0, -88], [34, -88]] as [number, number][]) {
    const light = new THREE.PointLight(0xffe6c2, 0, 58, 2);
    light.position.set(x, 18.05, z);
    scene.add(light);
    interiorLights.push(light);
  }
  // pendant lamps
  const glow = new THREE.MeshBasicMaterial({ color: 0xffe6b0, toneMapped: false });
  for (const [x, z] of [[-20, -66], [20, -66], [-20, -88], [20, -88], [0, -62], [0, -94], [-44, -76], [44, -76]]) {
    I.box(brass, 0.14, 3.4, 0.14, x, 16.2, z);
    I.add(brass, prism(0.3, 1.5, 0.9, 8), x, 14.6, z);
    I.add(glow, new THREE.IcosahedronGeometry(0.75, 1), x, 14, z);
  }
  I.build(IG, false, false);

  const lights: [number, number, number][] = mobile ? [[0, -67, 900], [0, -89, 900]] : [[-24, -67, 520], [24, -67, 520], [-24, -89, 520], [24, -89, 520]];
  for (const [x, z, power] of lights) {
    const p = new THREE.PointLight(0xffdfb0, power, 85, 1.7);
    p.position.set(x, 14.86, z);
    scene.add(p);
  }

  const heights: [number, number, number, number, number][] = [[-84, 84, -116, -33.6, 1.86]];
  for (const cx of [0, 62, -62]) {
    const w = cx === 0 ? 19 : 7.5;
    for (let i = 0; i < 6; i++) {
      heights.push([cx - w, cx + w, -27 - (i + 1) * STEP_D, -27 - i * STEP_D, ((i + 1) * 1.86) / 6]);
    }
  }
  // Roof slope (ridge along x at z=-78): stepped heights so the character can stand on it.
  heights.push([-60, 60, -85, -71, 51.7], [-60, 60, -98, -85, 47], [-60, 60, -71, -58, 47], [-60, 60, -105, -98, 41], [-60, 60, -58, -51, 41]);
  return {
    door,
    heights,
    winExt,
    interiorLights,
    tubeMaterial: tubeM,
    interior: { minX: -56, maxX: 56, minZ: -100, maxZ: -56, ceil: 19.4 },
    outer: { minX: -86, maxX: 86, minZ: -118, maxZ: -31 },
  };
}
