import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* ---------- shared world types ---------- */
export type Collider =
  | {
      kind: "box";
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      active?: () => boolean;
      top?: number;
      bottom?: number;
      surfaceY?: (x: number, z: number) => number;
      seatTag?: string;
    }
  | {
      kind: "circle";
      x: number;
      z: number;
      r: number;
      active?: () => boolean;
      top?: number;
      bottom?: number;
      surfaceY?: (x: number, z: number) => number;
      seatTag?: string;
    };

export interface Seat {
  x: number;
  z: number;
  /** world height of the seat surface */
  y: number;
  /** direction the sitter faces */
  yaw: number;
  /** optional tag matching the seat's collider so sitting/standing never collides with the seat itself */
  tag?: string;
}

export const boxCol = (
  x: number,
  z: number,
  w: number,
  d: number,
  active?: () => boolean,
  top?: number,
  bottom?: number,
  surfaceY?: (x: number, z: number) => number,
  seatTag?: string
): Collider => ({
  kind: "box",
  minX: x - w / 2,
  maxX: x + w / 2,
  minZ: z - d / 2,
  maxZ: z + d / 2,
  active,
  top,
  bottom,
  surfaceY,
  seatTag,
});
export const circleCol = (
  x: number,
  z: number,
  r: number,
  top?: number,
  bottom?: number,
  surfaceY?: (x: number, z: number) => number,
  seatTag?: string
): Collider => ({ kind: "circle", x, z, r, top, bottom, surfaceY, seatTag });

/** Deterministic random generator. */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* ---------- canvas textures ---------- */
export function tex(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeat = true
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 16;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Fill with a base colour and scatter soft speckles for a natural surface. */
export function speckle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: string,
  tones: string[],
  count: number,
  size = 6,
  seed = 7
) {
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = tones[Math.floor(r() * tones.length)];
    ctx.globalAlpha = 0.12 + r() * 0.2;
    ctx.fillRect(r() * w, r() * h, 1 + r() * size, 1 + r() * size * 0.6);
  }
  ctx.globalAlpha = 1;
}

/** Trace a pointed (Gothic) arch outline: jambs up to `spring`, then two curves meeting at the apex. */
export function archPath(
  p: THREE.Path | CanvasRenderingContext2D,
  cx: number,
  w: number,
  base: number,
  spring: number,
  apex: number
) {
  const l = cx - w / 2;
  const r = cx + w / 2;
  p.moveTo(l, base);
  p.lineTo(l, spring);
  p.quadraticCurveTo(l, spring + (apex - spring) * 0.72, cx, apex);
  p.quadraticCurveTo(r, spring + (apex - spring) * 0.72, r, spring);
  p.lineTo(r, base);
}

/* ---------- geometry helpers ---------- */
const scaleUV = (g: THREE.BufferGeometry, su: number, sv: number, from = 0, to = Infinity) => {
  const uv = g.attributes.uv;
  const end = Math.min(uv.count, to);
  for (let i = from; i < end; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
};

/** Box whose UVs repeat every `tile` world units (so textures never stretch). */
export function tileBox(w: number, h: number, d: number, tile: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  scaleUV(g, d / tile, h / tile, 0, 8);
  scaleUV(g, w / tile, d / tile, 8, 16);
  scaleUV(g, w / tile, h / tile, 16, 24);
  return g;
}

/** Plane with tiled UVs. */
export function tilePlane(w: number, h: number, tile: number) {
  const g = new THREE.PlaneGeometry(w, h);
  scaleUV(g, w / tile, h / tile);
  return g;
}

/** Flat-faced prism (octagon etc.) — faceted so it never reads as a smooth cylinder. */
export function prism(rTop: number, rBot: number, h: number, sides: number, tile = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, sides, 1, false, Math.PI / sides).toNonIndexed();
  g.computeVertexNormals();
  if (tile) scaleUV(g, (Math.PI * 2 * Math.max(rTop, rBot)) / tile, h / tile);
  return g;
}

/** Lathe from [radius, height] pairs. */
export function lathe(profile: [number, number][], seg = 12, smooth = false) {
  let pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y));
  if (smooth) pts = new THREE.SplineCurve(pts).getPoints(profile.length * 4);
  return new THREE.LatheGeometry(pts, seg);
}

export interface Opening {
  x: number;
  w: number;
  spring: number;
  apex: number;
}

/** A wall slab pierced by pointed-arch openings. Origin at bottom centre. */
export function archWall(width: number, height: number, depth: number, openings: Opening[], tile = 0) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, height);
  s.lineTo(-width / 2, height);
  s.closePath();
  for (const o of openings) {
    const hole = new THREE.Path();
    archPath(hole, o.x, o.w, 0.001, o.spring, o.apex);
    hole.closePath();
    s.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  if (tile) scaleUV(g, 1 / tile, 1 / tile);
  return g;
}

/** Solid pointed-arch panel (door tympanum, niches). */
export function archPanel(w: number, spring: number, apex: number) {
  const s = new THREE.Shape();
  archPath(s, 0, w, 0, spring, apex);
  s.closePath();
  return new THREE.ShapeGeometry(s, 10);
}

/* ---------- static batching: one draw call per material ---------- */
export class Batch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private base = new THREE.Matrix4();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  /** Run `fn` with every added piece placed relative to (x, y, z) and rotated by ry. */
  at(x: number, y: number, z: number, ry: number, fn: () => void) {
    const prev = this.base.clone();
    this.base.multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
    fn();
    this.base.copy(prev);
  }

  add(
    mat: THREE.Material,
    geo: THREE.BufferGeometry,
    x = 0,
    y = 0,
    z = 0,
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1]
  ) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    this.e.set(rot[0], rot[1], rot[2]);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(scale[0], scale[1], scale[2]));
    g.applyMatrix4(this.m.premultiply(this.base));
    for (const k of Object.keys(g.attributes)) {
      if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    }
    let list = this.groups.get(mat);
    if (!list) this.groups.set(mat, (list = []));
    list.push(g);
  }

  /** Box centred at (x, y, z). `tile` > 0 gives world-scale UVs. */
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, tile = 0) {
    this.add(mat, tile ? tileBox(w, h, d, tile) : new THREE.BoxGeometry(w, h, d), x, y, z, [0, ry, 0]);
  }

  build(parent: THREE.Object3D, cast = true, receive = true) {
    const out: THREE.Mesh[] = [];
    this.groups.forEach((list, mat) => {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast && !mat.transparent;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      out.push(mesh);
    });
    this.groups.clear();
    return out;
  }
}

export const std = (color: number, roughness = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });
export const mapped = (map: THREE.Texture, roughness = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ map, roughness, ...extra });
