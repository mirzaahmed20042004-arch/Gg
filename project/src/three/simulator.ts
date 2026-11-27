import * as THREE from "three";
import { buildCharacter, resetPose, applyExtras, defaultExtras, RIG_METRICS, type Rig } from "./character";
import { buildHall, type Bounds } from "./hall";
import { buildPark } from "./park";
import { tex, type Collider, type Seat } from "./kit";
import { createSky, buildOpenWorld, SUN_DIR, MOON_DIR, WORLD_LIMIT } from "./world";

export type Action = "jump" | "crouch" | "clap" | "kick" | "punch" | "interact";
export interface SimState { prompt: string | null; crouching: boolean; sitting: boolean; night: boolean; jet: boolean }
export interface SimOptions { onReady?: () => void; onState?: (s: SimState) => void }
export interface SimApi {
  setMove: (x: number, y: number) => void;
  setAltitude: (v: number) => void;
  act: (a: Action) => void;
  toggleJet: () => void;
  toggleDay: () => void;
  dispose: () => void;
}

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const c01 = (v: number) => clamp(v, 0, 1);
const sm = (a: number, b: number, v: number) => { const s = c01((v - a) / (b - a)); return s * s * (3 - 2 * s); };
const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const inBox = (b: Bounds, x: number, z: number, m = 0) => x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m;

const { L1, L2, HIP, ANK, TOE_Y, TOE_Z, SOLE_THICK, HEEL_BACK_Z, HIP_X } = RIG_METRICS;
const R = 1.12, TAU = Math.PI * 2;
const DUR = { clap: 1.9, kick: 0.95, punch: 0.6 };

export function createSimulator(host: HTMLElement, opts: SimOptions = {}): SimApi {
  const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760;
  const canvas = document.createElement("canvas");
  canvas.style.touchAction = "none";
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    logarithmicDepthBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  const sky = createSky();
  scene.add(sky.mesh, sky.celestial);
  scene.fog = new THREE.Fog(0xd3e3ee, 180, 3600);
  const camera = new THREE.PerspectiveCamera(50, host.clientWidth / host.clientHeight, 1.4, 8200);

  // A procedural equirectangular environment gives metal, glass and wet surfaces stable PBR reflections.
  const environment = tex(512, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#426d9c");
    g.addColorStop(0.24, "#86aaca");
    g.addColorStop(0.49, "#d7d4c2");
    g.addColorStop(0.51, "#63714c");
    g.addColorStop(1, "#283a26");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const sx = w * 0.66, sy = h * 0.29;
    const sun = ctx.createRadialGradient(sx, sy, 1, sx, sy, 42);
    sun.addColorStop(0, "rgba(255,248,224,0.95)");
    sun.addColorStop(0.16, "rgba(255,226,166,0.48)");
    sun.addColorStop(1, "rgba(255,226,166,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(sx - 44, sy - 44, 88, 88);
  }, false);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = environment;
  scene.environmentIntensity = 0.62;

  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x7f8a60, 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d6, 2.9);
  key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -185, right: 185, top: 185, bottom: -185, near: 8, far: 480 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.06;
  scene.add(key, key.target);
  const tmpLightTarget = new THREE.Vector3();
  let lastShadowX = Infinity, lastShadowZ = Infinity, lastShadowDay = -1;

  /* ---------- world ---------- */
  const colliders: Collider[] = [];
  const seats: Seat[] = [];
  const hall = buildHall(scene, colliders, seats, mobile);
  const park = buildPark(scene, colliders, seats, mobile);
  const openWorld = buildOpenWorld(scene, colliders);
  // Fixed park-lamp lights (no reassignment while walking/flying — no exchanging).
  const lampPool = Array.from({ length: mobile ? 8 : 12 }, (_, i) => {
    const light = new THREE.PointLight(0xffd9a2, 0, 52, 2);
    const src = park.lamps[Math.floor((i * park.lamps.length) / (mobile ? 8 : 12)) % park.lamps.length];
    light.position.set(src.x, src.y - 0.6, src.z);
    scene.add(light);
    return { light };
  });
  const door = hall.door;
  const rig: Rig = buildCharacter();
  scene.add(rig.root);

  /* ---------- player state ---------- */
  const pos = new THREE.Vector3(0, 0, 6);
  const vel = new THREE.Vector3();
  let facing = Math.PI, y = 0, vy = 0, grounded = true;
  let jet = false, altitudeInput = 0;
  let day = 1, dayTarget = 1;
  let crouch = false, crouchW = 0, phase = 0, moveW = 0, airW = 0, land = 0, leanZ = 0, leanX = 0;
  let action: { name: "clap" | "kick" | "punch"; t: number } | null = null;
  let punchLeft = true;
  let sit: { seat: Seat; from: THREE.Vector3; w: number; leaving: boolean } | null = null;
  let nearSeat: Seat | null = null;
  let doorDir: 1 | -1 = 1;
  let doorHold = 0;
  let pushDoorW = 0;
  let last: SimState = { prompt: null, crouching: false, sitting: false, night: false, jet: false };
  const move = { x: 0, y: 0 };
  const allHeights = [...hall.heights, ...park.roofs];

  /** Unified solid-world height solver: stairs, terraces, pitched roofs, spires, tables, chairs, benches, cars, hedges & props! */
  const heightAt = (x: number, z: number, curY = y, maxStepUp = grounded && !jet ? 1.08 : 0.62) => {
    let h = 0;
    for (const r of allHeights) {
      if (x > r[0] && x < r[1] && z > r[2] && z < r[3] && r[4] <= curY + maxStepUp) {
        h = Math.max(h, r[4]);
      }
    }
    const pad = R * 0.52;
    for (const c of colliders) {
      if (c.top === undefined) continue;
      if (c.active && !c.active()) continue;
      if (sit && c.seatTag && c.seatTag === sit.seat.tag) continue;
      if (c.bottom !== undefined && curY < c.bottom - 1.2) continue;
      if (c.kind === "circle") {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d > c.r + pad) continue;
      } else {
        if (x < c.minX - pad || x > c.maxX + pad || z < c.minZ - pad || z > c.maxZ + pad) continue;
      }
      const ch = c.surfaceY ? c.surfaceY(x, z) : c.top;
      if (ch <= curY + maxStepUp) h = Math.max(h, ch);
    }
    return h;
  };
  const keys = new Set<string>();

  const resolve = (p: THREE.Vector3, py = 0) => {
    for (let it = 0; it < 2; it++)
      for (const c of colliders) {
        if (c.active && !c.active()) continue;
        if (sit && c.seatTag && c.seatTag === sit.seat.tag) continue;
        // Elevated slabs/roofs do not block walking underneath them
        if (c.bottom !== undefined && py + 7.25 < c.bottom) continue;
        // Standing or flying above a solid's top surface lets the player climb/walk freely across it
        const topH = c.surfaceY ? c.surfaceY(p.x, p.z) : c.top;
        if (topH !== undefined && py >= topH - 0.38) continue;
        if (c.kind === "circle") {
          const dx = p.x - c.x, dz = p.z - c.z, m = c.r + R, d2 = dx * dx + dz * dz;
          if (d2 < m * m) {
            if (d2 < 1e-8) p.x += m;
            else { const d = Math.sqrt(d2); p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
          }
          continue;
        }
        const nx = clamp(p.x, c.minX, c.maxX), nz = clamp(p.z, c.minZ, c.maxZ);
        const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 < 1e-8) {
          const l = p.x - c.minX, r = c.maxX - p.x, n = p.z - c.minZ, f = c.maxZ - p.z, m = Math.min(l, r, n, f);
          if (m === l) p.x = c.minX - R; else if (m === r) p.x = c.maxX + R; else if (m === n) p.z = c.minZ - R; else p.z = c.maxZ + R;
        } else { const d = Math.sqrt(d2); p.x = nx + (dx / d) * R; p.z = nz + (dz / d) * R; }
      }
    p.x = clamp(p.x, -WORLD_LIMIT, WORLD_LIMIT);
    p.z = clamp(p.z, -WORLD_LIMIT, WORLD_LIMIT);
  };

  /** Find a clean, unobstructed stand-up spot right in front/side of a chair or bench. */
  const findStandSpot = (s: Seat) => {
    const fwX = Math.sin(s.yaw), fwZ = Math.cos(s.yaw);
    const rtX = Math.cos(s.yaw), rtZ = -Math.sin(s.yaw);
    const candidates: [number, number][] = [
      [s.x + fwX * 1.95, s.z + fwZ * 1.95],
      [s.x + rtX * 2.15 + fwX * 0.6, s.z + rtZ * 2.15 + fwZ * 0.6],
      [s.x - rtX * 2.15 + fwX * 0.6, s.z - rtZ * 2.15 + fwZ * 0.6],
      [s.x - fwX * 2.1, s.z - fwZ * 2.1],
    ];
    const baseFloor = Math.max(0, s.y - 1.74);
    for (const [cx, cz] of candidates) {
      const test = new THREE.Vector3(cx, 0, cz);
      resolve(test, baseFloor);
      if (Math.hypot(test.x - cx, test.z - cz) < 0.32) return test;
    }
    const fallback = new THREE.Vector3(s.x + fwX * 1.8, 0, s.z + fwZ * 1.8);
    resolve(fallback, baseFloor);
    return fallback;
  };

  /* ---------- actions ---------- */
  const act = (a: Action) => {
    if (jet && a !== "interact") return;
    if (a === "interact") {
      if (sit) {
        if (!sit.leaving && sit.w >= 0.85) {
          sit.from.copy(findStandSpot(sit.seat));
          sit.leaving = true;
        }
      } else if (nearSeat && grounded) {
        sit = { seat: nearSeat, from: pos.clone(), w: 0, leaving: false };
        y = Math.max(0, nearSeat.y - 1.73);
        crouch = false; action = null; vel.set(0, 0, 0);
      }
    } else if (a === "jump") {
      if (jet) return;
      if (sit) act("interact");
      else if (grounded) { vy = 23.4; grounded = false; crouch = false; }
    } else if (a === "crouch") { if (!sit && grounded) crouch = !crouch; }
    else if (!action && (!sit || a === "clap") && grounded) {
      action = { name: a, t: 0 };
      if (a === "punch") punchLeft = !punchLeft;
      if (a === "kick") crouch = false;
    }
  };

  const toggleJet = () => {
    if (jet) {
      jet = false;
      altitudeInput = 0;
      const groundY = heightAt(pos.x, pos.z);
      if (y <= groundY + 0.08) {
        y = groundY;
        vy = 0;
        grounded = true;
      } else {
        grounded = false;
        vy = 0;
      }
    } else {
      jet = true;
      grounded = false;
      crouch = false;
      sit = null;
      action = null;
      vy = 0;
    }
  };

  /* ---------- input ---------- */
  const keyAct: Record<string, Action> = { " ": "jump", c: "crouch", e: "interact", g: "clap", k: "kick", f: "punch" };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k.startsWith("arrow") || k === " ") e.preventDefault();
    if (k === "v" && !e.repeat) toggleJet();
    if (jet && (k === "pageup" || k === " ")) altitudeInput = 1;
    if (jet && k === "pagedown") altitudeInput = -1;
    if (!e.repeat && keyAct[k]) act(keyAct[k]);
    keys.add(k);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    keys.delete(k);
    if (k === "pageup" || k === "pagedown" || (k === " " && jet)) altitudeInput = 0;
  };
  const onBlur = () => { keys.clear(); altitudeInput = 0; };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  let camYaw = 0, camPitch = 0.23, camR = mobile ? 25.5 : 22.0, camDist = camR, lastDrag = -9;
  const camTarget = new THREE.Vector3(pos.x, 5.2, pos.z);
  const ptrs = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const onDown = (e: PointerEvent) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const onMove = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (ptrs.size === 1) {
      camYaw -= (e.clientX - p.x) * 0.0055;
      camPitch = clamp(camPitch + (e.clientY - p.y) * 0.0032, -1.18, 1.15);
      lastDrag = clock.elapsedTime;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && d > 0) camR = clamp(camR * (pinch / d), 8, 38);
      pinch = d;
    }
  };
  const onUp = (e: PointerEvent) => { ptrs.delete(e.pointerId); pinch = 0; };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); camR = clamp(camR + e.deltaY * 0.012, 8, 38); };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  /* ---------- posing helpers ---------- */
  const cQ = rig.nodes.map(() => new THREE.Quaternion());
  const cP = rig.nodes.map(() => new THREE.Vector3());
  const tq = new THREE.Quaternion(), tv = new THREE.Vector3();
  const snap = () => rig.nodes.forEach((n, i) => { cQ[i].copy(n.quaternion); cP[i].copy(n.position); });
  const blend = (w: number) => rig.nodes.forEach((n, i) => {
    tq.copy(n.quaternion); n.quaternion.copy(cQ[i]).slerp(tq, w);
    tv.copy(n.position); n.position.copy(cP[i]).lerp(tv, w);
  });
  /** Two-bone IK: put the ankle `fz` ahead of and `down` below the hip joint, keeping sole level on roll. */
  const legIK = (hip: THREE.Group, knee: THREE.Group, ankle: THREE.Group, fz: number, down: number, pitch: number, splay: number, yawComp = 0, ankleRoll = 0) => {
    const d = clamp(Math.hypot(fz, down), 0.6, L1 + L2 - 0.012);
    const th = Math.atan2(fz, down);
    const al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const kn = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    hip.rotation.set(-(th + al), yawComp, splay);
    knee.rotation.x = kn;
    ankle.rotation.set(th + al - kn + pitch, 0, ankleRoll);
  };

  const clock = new THREE.Clock();
  let raf = 0, dead = false, ready = false, blinkT = 2, blink = 0;

  const tick = () => {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    const rawDt = clock.getDelta();
    const dt = clamp(rawDt, 1 / 240, 0.05);
    const t = clock.elapsedTime;

    /* ---- input → velocity ---- */
    const kx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    const ky = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const kMag = Math.hypot(kx, ky);
    const kScale = kMag ? (keys.has("shift") ? 1 : 0.8) / kMag : 0;
    const ix = clamp(move.x + kx * kScale, -1, 1), iy = clamp(move.y + ky * kScale, -1, 1);
    const mag = Math.min(1, Math.hypot(ix, iy));
    const locked = !jet && (!!sit || action?.name === "kick" || action?.name === "punch");
    let speed = 0;
    if (!locked && mag > 0.06) {
      speed = jet
        ? 48 * mag
        : crouchW > 0.5
          ? 4.0 * mag
          : mag <= 0.84
            ? 7.2 * (mag / 0.84)
            : lerp(7.2, 16.8, (mag - 0.84) / 0.16);
    }
    // Gently pace forward walk right as hands push the heavy Frere Hall doors open so hands contact & push realistically
    const nearClosedDoor =
      !jet &&
      !sit &&
      y < 6 &&
      Math.abs(pos.x - door.x) < 4.5 &&
      Math.abs(pos.z - door.z) < 4.2 &&
      door.t < 0.55;
    if (nearClosedDoor && speed > 3.6) speed = lerp(3.6, speed, door.t / 0.55);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const dirX = mag ? (fx * iy - fz * ix) / mag : 0, dirZ = mag ? (fz * iy + fx * ix) / mag : 0;
    const rate = jet ? 2.3 : grounded ? (speed > 0.1 ? 9 : 12) : 2.5;
    const pvx = vel.x, pvz = vel.z;
    vel.x = damp(vel.x, dirX * speed, rate, dt);
    vel.z = damp(vel.z, dirZ * speed, rate, dt);
    if (jet) vy = damp(vy, altitudeInput * 31, 2.5, dt);
    const spd = Math.hypot(vel.x, vel.z);
    let turn = 0;
    if (speed > 0.1 && spd > 0.3) {
      const d = wrap(Math.atan2(vel.x, vel.z) - facing);
      turn = d * (1 - Math.exp(-11 * dt));
      facing += turn;
    }
    const accel = ((vel.x - pvx) * Math.sin(facing) + (vel.z - pvz) * Math.cos(facing)) / dt;
    leanX = damp(leanX, clamp(accel * 0.012, -0.12, 0.2), 6, dt);
    leanZ = damp(leanZ, clamp((-turn / dt) * 0.02 * (0.4 + spd / 13), -0.2, 0.2), 6, dt);

    if (!sit) {
      if (jet) {
        // Flight has momentum and a lift axis, colliding cleanly with every solid wall, roof, spire & ceiling.
        pos.x = clamp(pos.x + vel.x * dt, -WORLD_LIMIT, WORLD_LIMIT);
        pos.z = clamp(pos.z + vel.z * dt, -WORLD_LIMIT, WORLD_LIMIT);
        const insideHall = inBox(hall.interior, pos.x, pos.z) && y < 1.86 + hall.interior.ceil;
        const maxFlyY = insideHall ? 1.86 + hall.interior.ceil - 7.55 : 1800;
        y = clamp(y + vy * dt, heightAt(pos.x, pos.z, y, 0.62), maxFlyY);
        resolve(pos, y);
      } else {
        // Substep fast motion so narrow props cannot be tunnelled through.
        const travel = Math.max(Math.abs(vel.x), Math.abs(vel.z)) * dt;
        const steps = Math.max(1, Math.ceil(travel / (R * 0.36)));
        const subDt = dt / steps;
        for (let i = 0; i < steps; i++) {
          const oldX = pos.x;
          pos.x += vel.x * subDt;
          resolve(pos, y);
          if (Math.abs(pos.x - oldX) < Math.abs(vel.x * subDt) * 0.18) vel.x = 0;
          const oldZ = pos.z;
          pos.z += vel.z * subDt;
          resolve(pos, y);
          if (Math.abs(pos.z - oldZ) < Math.abs(vel.z * subDt) * 0.18) vel.z = 0;
        }
      }
    }

    // Automatic Frere Hall door logic: opens when approaching/touching from either side, closes automatically once clear!
    const inDoorTrigger = !sit && y < 8 && Math.abs(pos.x - door.x) < 4.6 && Math.abs(pos.z - door.z) < 4.6;
    if (inDoorTrigger) {
      if (!door.open && door.t < 0.08) doorDir = pos.z >= door.z ? 1 : -1;
      door.open = true;
      doorHold = 0.85;
    } else if (door.open) {
      const clearOfDoor = Math.abs(pos.x - door.x) > 5.2 || Math.abs(pos.z - door.z) > 5.8 || y > 9;
      if (clearOfDoor) {
        doorHold -= dt;
        if (doorHold <= 0) door.open = false;
      }
    }

    const gy = heightAt(pos.x, pos.z, y);
    if (jet) {
      grounded = false;
    } else if (!grounded) {
      vy = Math.max(-58, vy - 58 * dt);
      const prevY = y;
      y += vy * dt;
      const ceilY = inBox(hall.interior, pos.x, pos.z) && y < 1.86 + hall.interior.ceil ? 1.86 + hall.interior.ceil - 7.55 : Infinity;
      if (y > ceilY) { y = ceilY; if (vy > 0) vy = 0; }
      const landGy = heightAt(pos.x, pos.z, Math.max(y, prevY), 0.62);
      if (vy <= 0 && y <= landGy) {
        land = Math.min(1, -vy / 25);
        y = landGy;
        vy = 0;
        grounded = true;
      }
    } else {
      // Stepping off a roof/table/bench/car edge triggers real gravity instead of teleporting through ceilings!
      if (y - gy > 1.35) {
        grounded = false;
        vy = 0;
      } else {
        y = damp(y, gy, 14, dt);
        // Natural slide off ultra-steep spire cones while pitched roofs/ramps remain comfortably walkable
        const eps = 0.35;
        const hxSlope = (heightAt(pos.x + eps, pos.z, y + 1.2, 2.2) - heightAt(pos.x - eps, pos.z, y + 1.2, 2.2)) / (2 * eps);
        const hzSlope = (heightAt(pos.x, pos.z + eps, y + 1.2, 2.2) - heightAt(pos.x, pos.z - eps, y + 1.2, 2.2)) / (2 * eps);
        const slopeMag = Math.hypot(hxSlope, hzSlope);
        if (slopeMag > 1.45 && slopeMag < 12) {
          vel.x -= (hxSlope / slopeMag) * 26 * dt;
          vel.z -= (hzSlope / slopeMag) * 26 * dt;
        }
      }
    }
    land = damp(land, 0, 7, dt);
    crouchW = damp(crouchW, crouch ? 1 : 0, 10, dt);
    moveW = damp(moveW, spd > 0.3 ? 1 : 0, 9, dt);
    airW = damp(airW, grounded ? 0 : 1, 14, dt);

    /* ---- sitting ---- */
    if (sit) {
      sit.w = c01(sit.w + ((sit.leaving ? -1 : 1) * dt) / 0.52);
      const k = sm(0, 1, sit.w);
      pos.x = lerp(sit.from.x, sit.seat.x, k);
      pos.z = lerp(sit.from.z, sit.seat.z, k);
      const seatFloorY = Math.max(0, sit.seat.y - 1.73);
      y = damp(y, seatFloorY, 14, dt);
      if (!sit.leaving) {
        facing += wrap(sit.seat.yaw - facing) * (1 - Math.exp(-10 * dt));
        if (mag > 0.62 && sit.w >= 0.95) {
          sit.from.copy(findStandSpot(sit.seat));
          sit.leaving = true;
        }
      } else if (sit.w <= 0) {
        sit = null;
        resolve(pos, y);
        y = heightAt(pos.x, pos.z, y + 0.5);
      }
    }

    /* ---- locomotion pose (54-bone realistic female humanoid biomechanics + exact heel-to-toe IK) ---- */
    resetPose(rig);
    const X = defaultExtras();
    const idleW = 1 - moveW;
    const breath = Math.sin(t * 1.65);
    const idleShift = Math.sin(t * 0.58) * idleW * (1 - crouchW) * (1 - airW);

    // Three smooth gait regimes calibrated to 1.22x human scale: walk (<=7.2), run (7.2..12.6), sprint (12.6..16.8)
    const runF = c01((spd - 7.2) / 5.4);
    const sprintF = c01((spd - 12.2) / 4.6);
    const baseC = lerp(lerp(lerp(4.32, 7.80, runF), 9.65, sprintF), 3.65, crouchW);
    // Scale stride length proportionally at low startup/braking speeds so 2*A === duty*C -> exact zero foot sliding!
    const lowSpdScale = clamp(spd / 5.8, 0.24, 1);
    const C = baseC * lerp(1, lowSpdScale, 1 - runF);
    if (grounded && spd > 0.02) phase = (phase + (spd * dt) / C) % 1;

    const duty = lerp(lerp(0.58, 0.40, runF), 0.33, sprintF);
    const A = ((duty * C) / 2) * moveW;
    const lift = lerp(lerp(0.56, 1.42, runF), 1.84, sprintF) * moveW;
    const stopBrake = c01(-accel / 32) * moveW * (1 - airW);

    const gaitBounce = -0.068 * Math.cos(phase * 2 * TAU) * lerp(1, 1.45, runF);
    const drop =
      moveW * (lerp(lerp(0.29, 0.44, runF), 0.51, sprintF) + gaitBounce) +
      stopBrake * 0.12 +
      crouchW * 1.36 +
      land * 0.82 +
      idleW * (0.026 + 0.008 * (1 + breath));
    const hipH = HIP - drop;

    const sw = Math.cos(phase * TAU);
    const sway = Math.sin((phase - duty * 0.5 + 0.25) * TAU) * moveW;
    const hipRoll = 0.046 * sway + 0.026 * idleShift;
    const hipYaw = -0.085 * sw * moveW * lerp(1, 1.25, runF);
    rig.hips.position.set(0.10 * sway + 0.052 * idleShift, hipH, 0);
    rig.hips.rotation.set(0, hipYaw, hipRoll);

    // Exact heel-strike -> flat -> toe-off foot solver: [zOffset, ankleHeight, anklePitch, toePitch]
    const foot = (p: number): [number, number, number, number] => {
      p = ((p % 1) + 1) % 1;
      if (p < duty) {
        const s = p / duty;
        const heelIn = (1 - sm(0, 0.24, s)) * moveW;
        const pushOff = sm(0.62, 1.0, s) * moveW;
        const pitch = 0.48 * pushOff - 0.26 * heelIn;
        const fy =
          pitch >= 0
            ? SOLE_THICK + (-TOE_Y) * Math.cos(pitch) + TOE_Z * Math.sin(pitch)
            : ANK * Math.cos(pitch) + HEEL_BACK_Z * Math.sin(pitch);
        return [A * (1 - 2 * s), fy, pitch, -pitch * (pitch > 0 ? 1 : 0.35)];
      }
      const s = (p - duty) / (1 - duty);
      const e = s * s * (3 - 2 * s);
      const swingArc = Math.sin(Math.PI * s) * (1 - 0.16 * s);
      const pitch = moveW * (0.46 * (1 - sm(0, 0.36, s)) - 0.26 * sm(0.66, 1.0, s));
      const fy = ANK + lift * swingArc + 0.14 * moveW * (1 - sm(0, 0.4, s));
      const toeP = moveW * (-0.38 * (1 - sm(0, 0.32, s)) + 0.14 * sm(0.65, 1.0, s));
      return [A * (2 * e - 1), fy, pitch, toeP];
    };

    const up = c01(vy / 44 + 0.5);
    const legs: [THREE.Group, THREE.Group, THREE.Group, THREE.Group, number, number][] = [
      [rig.hipL, rig.kneeL, rig.ankleL, rig.toeL, phase, 1],
      [rig.hipR, rig.kneeR, rig.ankleR, rig.toeR, phase + 0.5, -1],
    ];
    for (const [h, kn, an, toe, p, side] of legs) {
      const [z0, fy, pitch, toeP] = foot(p);
      const hipSideY = hipH + side * HIP_X * Math.sin(hipRoll);
      const hipYawZ = -side * HIP_X * Math.sin(hipYaw);
      const legSplay = side * (0.022 + crouchW * 0.11);
      const airFz = side * 0.42 - 0.14 * (1 - up);
      const airDown = 2.76 - 0.44 * up;
      const airPitch = lerp(0.42, -0.12, 1 - up);
      legIK(
        h,
        kn,
        an,
        lerp(z0 - hipYawZ + crouchW * 0.20, airFz, airW),
        lerp(hipSideY - fy, airDown, airW),
        lerp(pitch, airPitch, airW),
        -hipRoll + legSplay,
        -hipYaw * (1 - airW),
        -legSplay * (1 - airW)
      );
      toe.rotation.x = lerp(toeP, 0.25 * up, airW);
    }

    // Supple 2-segment spine + chest with natural breathing, forward sprint lean & axial counter-rotation
    const totalLeanX =
      0.025 +
      lerp(0.04, lerp(0.22, 0.34, sprintF), runF) * moveW +
      0.48 * crouchW +
      leanX +
      land * 0.24 -
      stopBrake * 0.08 +
      idleW * 0.014 * breath;
    const totalTwistY = 0.16 * sw * moveW * lerp(1, 1.25, runF) + idleW * 0.028 * Math.sin(t * 0.48);
    const totalRollZ = -0.68 * hipRoll - leanZ * 0.25;
    rig.spine.rotation.set(totalLeanX * 0.46, totalTwistY * 0.45, totalRollZ * 0.50);
    rig.chest.rotation.set(totalLeanX * 0.54 + idleW * 0.016 * breath, totalTwistY * 0.55, totalRollZ * 0.50);

    // Articulated clavicles, shoulders, elbows & wrists
    const clavBreath = (0.018 * breath + 0.015) * idleW;
    rig.clavicleL.rotation.set(0, -0.05 * sw * moveW, clavBreath + 0.03 * runF * moveW);
    rig.clavicleR.rotation.set(0, -0.05 * sw * moveW, -clavBreath - 0.03 * runF * moveW);

    const armAmp = lerp(lerp(0.42, 0.92, runF), 1.16, sprintF) * moveW * (1 - crouchW * 0.48);
    const eb =
      0.16 +
      lerp(0.14, lerp(1.18, 1.42, sprintF), runF) * moveW +
      crouchW * 0.58 +
      idleW * (0.05 + 0.025 * Math.sin(t * 1.35));
    rig.shoulderL.rotation.set(
      armAmp * sw + 0.04 - crouchW * 0.28 - airW * 0.92 * up,
      -0.06 * sw * moveW,
      0.09 + 0.05 * runF + airW * 0.34 + land * 0.16
    );
    rig.shoulderR.rotation.set(
      -armAmp * sw + 0.04 - crouchW * 0.28 - airW * 0.92 * up,
      -0.06 * sw * moveW,
      -0.09 - 0.05 * runF - airW * 0.34 - land * 0.16
    );
    rig.elbowL.rotation.x = -(eb + 0.28 * moveW * Math.max(0, -sw) + airW * 0.38 + land * 0.22);
    rig.elbowR.rotation.x = -(eb + 0.28 * moveW * Math.max(0, sw) + airW * 0.38 + land * 0.22);
    rig.wristL.rotation.set(-0.10 * sw * moveW + 0.04 * idleW * Math.sin(t * 1.5), 0, 0.04);
    rig.wristR.rotation.set(0.10 * sw * moveW + 0.04 * idleW * Math.sin(t * 1.5 + 1.2), 0, -0.04);

    // Stabilized cybernetic neck & head counter-balance + turn anticipation
    const turnLead = clamp((-turn / dt) * 0.055, -0.28, 0.28);
    const idleLook = idleW * 0.12 * Math.sin(t * 0.38);
    const headCompX = -totalLeanX * 0.76;
    const headCompY = -totalTwistY * 0.78 + turnLead + idleLook;
    const headCompZ = -(hipRoll + totalRollZ) * 0.65;
    rig.neck.rotation.set(headCompX * 0.42, headCompY * 0.38, headCompZ * 0.45);
    rig.head.rotation.set(headCompX * 0.58, headCompY * 0.62, headCompZ * 0.55);

    // Dynamic finger & thumb articulation + subtle cyan core pulse
    const baseCurl = lerp(0.22, lerp(0.55, 0.82, sprintF), runF) * moveW + idleW * 0.20 + crouchW * 0.15;
    X.curlL = clamp(baseCurl + 0.05 * Math.sin(t * 1.8) * idleW + 0.08 * Math.max(0, -sw) * moveW, 0.06, 0.95);
    X.curlR = clamp(baseCurl + 0.05 * Math.sin(t * 1.8 + 1.4) * idleW + 0.08 * Math.max(0, sw) * moveW, 0.06, 0.95);
    X.spreadL = X.spreadR = clamp(0.08 + airW * 0.28 + land * 0.22, 0.04, 0.45);
    X.energyPulse = 0.5 + 0.5 * Math.sin(t * (2.2 + runF * 2.4));

    // Two-handed automatic door-push gesture when pushing through Frere Hall's double doors
    const toDoorZ = door.z - pos.z;
    const facingDoor = Math.sin(facing) * (door.x - pos.x) + Math.cos(facing) * toDoorZ > 0.2;
    const wantPush =
      !jet &&
      !sit &&
      grounded &&
      y < 6 &&
      Math.abs(pos.x - door.x) < 4.4 &&
      Math.abs(toDoorZ) < 4.4 &&
      facingDoor &&
      door.open &&
      door.t < 0.88;
    pushDoorW = damp(pushDoorW, wantPush ? sm(0, 0.22, 1 - door.t) : 0, 12, dt);
    if (pushDoorW > 0.01) {
      const ext = sm(0, 0.75, door.t);
      rig.spine.rotation.x += 0.08 * pushDoorW;
      rig.chest.rotation.x += 0.10 * pushDoorW;
      for (const s of [1, -1] as const) {
        const sh = s > 0 ? rig.shoulderL : rig.shoulderR;
        const el = s > 0 ? rig.elbowL : rig.elbowR;
        const wr = s > 0 ? rig.wristL : rig.wristR;
        sh.rotation.x = lerp(sh.rotation.x, -1.28 - 0.28 * ext, pushDoorW);
        sh.rotation.y = lerp(sh.rotation.y, -s * (0.18 - 0.12 * ext), pushDoorW);
        sh.rotation.z = lerp(sh.rotation.z, s * (0.12 + 0.14 * ext), pushDoorW);
        el.rotation.x = lerp(el.rotation.x, -0.78 + 0.52 * ext, pushDoorW);
        wr.rotation.x = lerp(wr.rotation.x, 0.55, pushDoorW);
      }
      X.curlL = lerp(X.curlL, 0.07, pushDoorW);
      X.curlR = lerp(X.curlR, 0.07, pushDoorW);
      X.spreadL = X.spreadR = lerp(X.spreadL, 0.38, pushDoorW);
    }

    if (jet) {
      // Streamlined cybernetic flight pose: arms swept cleanly forward/alongside, spine extended, toes pointed.
      rig.hips.rotation.set(0.14, 0, 0);
      rig.hipL.rotation.set(1.16, 0, 0.04);
      rig.hipR.rotation.set(1.16, 0, -0.04);
      rig.kneeL.rotation.x = 0.10;
      rig.kneeR.rotation.x = 0.10;
      rig.ankleL.rotation.x = 0.36;
      rig.ankleR.rotation.x = 0.36;
      rig.toeL.rotation.x = 0.18;
      rig.toeR.rotation.x = 0.18;
      rig.clavicleL.rotation.set(0, 0, 0.08);
      rig.clavicleR.rotation.set(0, 0, -0.08);
      rig.shoulderL.rotation.set(-2.46, 0, 0.12);
      rig.shoulderR.rotation.set(-2.46, 0, -0.12);
      rig.elbowL.rotation.x = -0.10;
      rig.elbowR.rotation.x = -0.10;
      rig.wristL.rotation.set(-0.05, 0, 0);
      rig.wristR.rotation.set(-0.05, 0, 0);
      rig.spine.rotation.set(0.50, 0, 0);
      rig.chest.rotation.set(0.52, 0, 0);
      rig.neck.rotation.set(-0.18, 0, 0);
      rig.head.rotation.set(-0.22, 0, 0);
      X.curlL = X.curlR = 0.14;
      X.spreadL = X.spreadR = 0.06;
      X.energyPulse = 0.85 + 0.15 * Math.sin(t * 6);
    }

    /* ---- sit pose (calibrated to local seat height above floor so both benches & library chairs align 100%!) ---- */
    if (sit) {
      snap();
      const localSeatY = clamp(sit.seat.y - y, 1.2, 2.5);
      rig.hips.position.set(0, localSeatY + 0.38, -0.18);
      rig.hips.rotation.set(0, 0, 0);
      rig.spine.rotation.set(-0.04, 0, 0);
      rig.chest.rotation.set(-0.03 + 0.012 * breath, 0, 0);
      rig.neck.rotation.set(0.02, Math.sin(t * 0.4) * 0.10, 0);
      rig.head.rotation.set(0.03, Math.sin(t * 0.4) * 0.16, 0);
      // Solve exact seated thigh/knee angles so boot soles rest flush on the floor (y=0) in front of the seat!
      const thighPitch = -Math.acos(clamp((localSeatY + 0.38 - (L2 + ANK)) / L1, -0.98, 0.98));
      const kneeBend = -thighPitch;
      for (const [h, kn, an, toe, , side] of legs) {
        h.rotation.set(thighPitch, 0, side * 0.055);
        kn.rotation.x = kneeBend;
        an.rotation.set(0, 0, -side * 0.055);
        toe.rotation.x = 0;
      }
      rig.shoulderL.rotation.set(-0.36, 0, 0.11);
      rig.shoulderR.rotation.set(-0.36, 0, -0.11);
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = -0.84;
      rig.wristL.rotation.set(-0.08, 0, 0.06);
      rig.wristR.rotation.set(-0.08, 0, -0.06);
      X.curlL = X.curlR = 0.32;
      blend(sm(0, 1, sit.w));
    }

    /* ---- one-shot actions ---- */
    if (action) {
      action.t += dt;
      const a = action.t, dur = DUR[action.name];
      const w = sm(0, 0.12, a) * sm(0, 0.18, dur - a);
      snap();
      if (action.name === "clap") {
        const open = 0.5 + 0.5 * Math.cos(a * TAU * 2.7);
        for (const s of [1, -1]) {
          const sh = s > 0 ? rig.shoulderL : rig.shoulderR, el = s > 0 ? rig.elbowL : rig.elbowR;
          sh.rotation.set(-0.95, -s * (0.42 - 0.3 * open), s * 0.05);
          el.rotation.x = -1.25;
        }
        rig.head.rotation.x += 0.05;
        X.curlL = X.curlR = 0.05;
      } else if (action.name === "punch") {
        const j = Math.pow(Math.sin(Math.PI * c01(a / 0.45)), 1.4), s = punchLeft ? 1 : -1;
        rig.shoulderL.rotation.set(-1.15, 0, -0.3); rig.elbowL.rotation.x = -2.35;
        rig.shoulderR.rotation.set(-1.15, 0, 0.3); rig.elbowR.rotation.x = -2.35;
        const sh = s > 0 ? rig.shoulderL : rig.shoulderR, el = s > 0 ? rig.elbowL : rig.elbowR;
        sh.rotation.set(-1.15 - 0.42 * j, 0, -s * (0.3 - 0.22 * j));
        el.rotation.x = -2.35 + 2.2 * j;
        rig.spine.rotation.set(0.06, -s * 0.24 * j, 0);
        rig.chest.rotation.set(0.06, -s * 0.28 * j, 0);
        rig.head.rotation.set(-0.05, s * 0.4 * j, 0);
        legIK(rig.hipL, rig.kneeL, rig.ankleL, s * 0.55, hipH - 0.12 - ANK, 0, 0.08);
        legIK(rig.hipR, rig.kneeR, rig.ankleR, -s * 0.55, hipH - 0.12 - ANK, 0, -0.08);
        rig.hips.position.y = hipH - 0.12;
        X.curlL = X.curlR = 0.95;
      } else {
        const w0 = Math.sin(Math.PI * c01(a / 0.34)), k = Math.sin(Math.PI * c01((a - 0.2) / 0.6));
        rig.hipR.rotation.set(0.5 * w0 * (1 - k) - 1.6 * k, 0, -0.05);
        rig.kneeR.rotation.x = 1.5 * w0 * (1 - k) + 0.12 * k;
        rig.ankleR.rotation.x = 0.45 * k;
        legIK(rig.hipL, rig.kneeL, rig.ankleL, 0.1 * k, hipH - 0.08 - ANK, 0, 0.06);
        rig.hips.position.y = hipH - 0.08;
        rig.spine.rotation.set(-0.12 * k + 0.05 * w0 * (1 - k), 0.12 * k, 0);
        rig.chest.rotation.set(-0.12 * k + 0.05 * w0 * (1 - k), 0.13 * k, 0);
        rig.head.rotation.set(0.15 * k, -0.2 * k, 0);
        rig.shoulderL.rotation.set(-0.6 * k, 0, 0.12 + 0.75 * k); rig.elbowL.rotation.x = -0.5;
        rig.shoulderR.rotation.set(0.55 * k, 0, -0.12 - 0.5 * k); rig.elbowR.rotation.x = -0.4;
        X.curlL = X.curlR = 0.8;
      }
      blend(w);
      if (a >= dur) action = null;
    }

    // Character awareness smoothly splits across cybernetic neck & head following orbit camera.
    const lookYaw = clamp(wrap(camYaw - facing), -1.05, 1.05);
    const lookPitch = clamp(0.42 - camPitch, -0.7, 0.9);
    rig.neck.rotation.y += lookYaw * 0.16;
    rig.head.rotation.y += lookYaw * 0.28;
    rig.neck.rotation.x -= lookPitch * 0.18;
    rig.head.rotation.x -= lookPitch * 0.30;

    rig.root.position.set(pos.x, y, pos.z);
    rig.root.rotation.set(0, facing, leanZ);
    blinkT -= dt;
    if (blinkT <= 0) { blinkT = 2.5 + Math.random() * 3; blink = 0.18; }
    if (blink > 0) { blink -= dt; X.eyeClose = Math.sin(Math.PI * c01(1 - blink / 0.18)); }
    applyExtras(rig, X);

    /* ---- world: automatic door swing, prompts, fountain ---- */
    door.t = c01(door.t + ((door.open ? 1 : -1) * dt) / 0.72);
    const da = sm(0, 1, door.t) * 1.72 * doorDir;
    door.left.rotation.y = da; door.right.rotation.y = -da;
    day = damp(day, dayTarget, 1.9, Math.min(rawDt, 0.6));
    sky.uniforms.uDay.value = day;
    sky.update(t, camera.position, day);
    park.update(t, day);
    openWorld.update(t);
    hall.winExt.emissive.setHex(0xffcf94);
    hall.winExt.emissiveIntensity = (1 - day) * 0.55;
    hall.tubeMaterial.emissiveIntensity = 0.04 + (1 - day) * 2.0;
    hall.interiorLights.forEach((light) => { light.intensity = (1 - day) * 480; });
    hemi.intensity = 0.24 + 0.71 * day;
    hemi.color.setHex(0x2a3a5c).lerp(new THREE.Color(0xcfe4ff), day);
    key.intensity = 0.9 + 2.0 * day;
    key.color.setHex(0x9db6e8).lerp(new THREE.Color(0xfff0d6), day);
    const sunFrom = MOON_DIR.clone().lerp(SUN_DIR, day).normalize();
    // Snap shadow target in exact shadow-texel units so shadow edges never crawl or flicker while walking.
    const shadowStep = 370 / (mobile ? 1024 : 2048);
    const lightTarget = tmpLightTarget.set(
      Math.round(pos.x / shadowStep) * shadowStep,
      0,
      Math.round(pos.z / shadowStep) * shadowStep
    );
    key.position.copy(sunFrom).multiplyScalar(210).add(lightTarget);
    key.target.position.copy(lightTarget);
    if (lightTarget.x !== lastShadowX || lightTarget.z !== lastShadowZ || Math.abs(day - lastShadowDay) > 0.001 || spd > 0.04 || jet || door.t > 0 && door.t < 1) {
      renderer.shadowMap.needsUpdate = true;
      lastShadowX = lightTarget.x; lastShadowZ = lightTarget.z; lastShadowDay = day;
    }
    (scene.fog as THREE.Fog).color.setHex(0x0a1220).lerp(new THREE.Color(0xd3e3ee), day);
    renderer.toneMappingExposure = 1.16 - 0.14 * day;
    scene.environmentIntensity = 0.14 + day * 0.58;
    lampPool.forEach((pl) => {
      pl.light.intensity = damp(pl.light.intensity, (1 - day) * 340, 3.5, dt);
    });

    // Contextual UI prompt: doors are 100% automatic (no Open/Close door prompt); Sit & Stand up work on all benches & library chairs!
    let prompt: string | null = null;
    nearSeat = null;
    if (sit) prompt = sit.leaving ? null : "Stand up";
    else if (grounded) {
      let best = 5.6;
      for (const s of seats) {
        const seatFloor = Math.max(0, s.y - 1.74);
        if (Math.abs(y - seatFloor) > 2.4) continue;
        const d = Math.hypot(s.x - pos.x, s.z - pos.z);
        if (d < best) { best = d; nearSeat = s; }
      }
      if (nearSeat) prompt = "Sit";
    }
    const isNight = dayTarget < 0.5;
    if (prompt !== last.prompt || crouch !== last.crouching || !!sit !== last.sitting || isNight !== last.night || jet !== last.jet) {
      last = { prompt, crouching: crouch, sitting: !!sit, night: isNight, jet };
      opts.onState?.(last);
    }

    /* ---- follow camera with wall avoidance ---- */
    if (!sit && spd > 1 && t - lastDrag > 1.2 && ptrs.size === 0) {
      const d = wrap(facing + Math.PI - camYaw);
      camYaw += Math.sin(d) * Math.min(1, dt * 1.3) * c01(spd / 6);
    }
    const sitDrop = sit ? 1.55 * sm(0, 1, sit.w) : 0;
    camTarget.x = damp(camTarget.x, pos.x, 14, dt);
    camTarget.z = damp(camTarget.z, pos.z, 14, dt);
    const skyLookHeight = Math.max(0, 0.18 - camPitch) * 11;
    camTarget.y = damp(camTarget.y, 5.25 + y - crouchW * 1.25 - sitDrop + skyLookHeight, 8, dt);
    const inside = inBox(hall.interior, pos.x, pos.z) && y < 1.86 + hall.interior.ceil;
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    let rOk = 3;
    for (let r = inside ? Math.min(camR, 15) : camR; r > 3; r -= 0.7) {
      const cx = camTarget.x + Math.sin(camYaw) * cp * r, cz = camTarget.z + Math.cos(camYaw) * cp * r, cy = camTarget.y + sp * r;
      if (inside ? inBox(hall.interior, cx, cz, -1.3) && cy < 1.86 + hall.interior.ceil - 1.2 : !(inBox(hall.outer, cx, cz) && cy < 53)) { rOk = r; break; }
    }
    camDist = damp(camDist, rOk, rOk < camDist ? 20 : 3.5, dt);
    camera.position.set(camTarget.x + Math.sin(camYaw) * cp * camDist, Math.max(0.8, camTarget.y + sp * camDist), camTarget.z + Math.cos(camYaw) * cp * camDist);
    camera.lookAt(camTarget);

    renderer.render(scene, camera);
    if (!ready) { ready = true; opts.onReady?.(); }
  };
  tick();


  return {
    setMove: (x, y) => { move.x = x; move.y = y; },
    setAltitude: (v) => { altitudeInput = clamp(v, -1, 1); },
    act,
    toggleJet,
    toggleDay: () => { dayTarget = dayTarget > 0.5 ? 0 : 1; },
    dispose: () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      scene.traverse((o) => {
        const m = o as THREE.Mesh | THREE.Points;
        if (!(m instanceof THREE.Mesh) && !(m instanceof THREE.Points)) return;
        m.geometry?.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        (mat as THREE.MeshStandardMaterial).map?.dispose();
        (mat as THREE.MeshStandardMaterial).normalMap?.dispose();
          mat.dispose();
        }
      });
      environment.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
