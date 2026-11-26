import * as THREE from "three";

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

/** Re-run a draw callback once the display font is actually available. */
function onFonts(redraw: () => void) {
  try {
    document.fonts?.load('400 120px "Anton"').then(redraw).catch(() => undefined);
  } catch {
    /* no FontFaceSet – ignore */
  }
}

const FONT = 'Anton, "Arial Narrow", Impact, "Arial Black", sans-serif';

/** Draw a stylized Portuguese crest (shield + star) centered at cx, cy. */
function drawCrest(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const w = size * 0.78;
  const h = size * 0.95;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.lineTo(w / 2, 0);
  ctx.quadraticCurveTo(w / 2, h * 0.38, 0, h / 2);
  ctx.quadraticCurveTo(-w / 2, h * 0.38, -w / 2, 0);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#da291c";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = "#046a38";
  ctx.fillRect(-w / 2, -h / 2, w * 0.38, h);
  ctx.strokeStyle = "#f5f2ea";
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.arc(-w * 0.31, -h * 0.02, size * 0.14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f5f2ea";
  ctx.fillRect(w * 0.02, -h * 0.16, w * 0.28, h * 0.3);
  ctx.fillStyle = "#da291c";
  ctx.fillRect(w * 0.02, -h * 0.16, w * 0.28, h * 0.07);
  ctx.restore();
  ctx.strokeStyle = "#e8c96a";
  ctx.lineWidth = size * 0.07;
  ctx.stroke();
  ctx.fillStyle = "#e8c96a";
  ctx.beginPath();
  const sy = -h / 2 - size * 0.16;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const a2 = a + Math.PI / 5;
    const r1 = size * 0.1;
    const r2 = size * 0.045;
    ctx.lineTo(Math.cos(a) * r1, sy + Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a2) * r2, sy + Math.sin(a2) * r2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Stylised leaping swoosh mark. */
function drawSwoosh(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.32);
  ctx.fillStyle = "#f7f5ef";
  ctx.beginPath();
  ctx.moveTo(-size * 0.55, size * 0.18);
  ctx.quadraticCurveTo(size * 0.05, -size * 0.55, size * 0.55, -size * 0.42);
  ctx.quadraticCurveTo(size * 0.08, -size * 0.12, -size * 0.5, size * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function kitBase(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#de2039");
  grad.addColorStop(0.55, "#c9152d");
  grad.addColorStop(1, "#ab0e25");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // subtle wavelet knit, as on the reference kit
  const rows = Math.round(h / 11.6);
  for (let i = 0; i < rows; i++) {
    const y = 6 + i * 11.6;
    ctx.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(40,0,8,0.07)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin(x * 0.042 + i * 0.72) * 3.4;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

function numberText(ctx: CanvasRenderingContext2D, text: string, px: number, stroke = true) {
  ctx.font = `400 ${px}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (stroke) {
    ctx.lineWidth = Math.max(4, px * 0.045);
    ctx.strokeStyle = "rgba(60,0,12,0.35)";
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = "#f7f5ef";
  ctx.fillText(text, 0, 0);
}

/**
 * Jersey texture wrapped around the torso. u=0.5 faces forward after the mesh is rotated;
 * the seam (u=0/1) is the centre of the back. Horizontal squeeze compensates for UV stretch.
 */
export function makeKitTexture(): THREE.CanvasTexture {
  const size = 1024;
  const { canvas, ctx } = makeCanvas(size, size);
  const sx = 0.62;

  const draw = () => {
    kitBase(ctx, size, size);
    // chest number
    ctx.save();
    ctx.translate(size * 0.5, size * 0.53);
    ctx.scale(sx, 1);
    ctx.transform(1, 0, -0.08, 1, 0, 0);
    numberText(ctx, "7", 330);
    ctx.restore();
    // crest (wearer's left chest) and swoosh (right chest)
    ctx.save();
    ctx.translate(size * 0.705, size * 0.37);
    ctx.scale(sx, 1);
    drawCrest(ctx, 0, 0, 150);
    ctx.restore();
    ctx.save();
    ctx.translate(size * 0.295, size * 0.37);
    ctx.scale(sx, 1);
    drawSwoosh(ctx, 0, 0, 118);
    ctx.restore();
    // back name + number, drawn twice so they wrap across the seam
    for (const bx of [0, size]) {
      ctx.save();
      ctx.translate(bx, size * 0.32);
      ctx.scale(sx, 1);
      numberText(ctx, "RONALDO", 96, false);
      ctx.restore();
      ctx.save();
      ctx.translate(bx, size * 0.55);
      ctx.scale(sx, 1);
      ctx.transform(1, 0, -0.08, 1, 0, 0);
      numberText(ctx, "7", 430);
      ctx.restore();
    }
  };
  draw();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  onFonts(() => {
    draw();
    tex.needsUpdate = true;
  });
  return tex;
}

/** Plain kit fabric (shorts, sleeves, socks). */
export function makeShortsTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  kitBase(ctx, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Captain armband texture. */
export function makeBandTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 96);
  ctx.fillStyle = "#f6f4ee";
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = "rgba(20,30,50,0.18)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(256, 8);
  ctx.moveTo(0, 88);
  ctx.lineTo(256, 88);
  ctx.stroke();
  ctx.save();
  ctx.translate(128, 48);
  ctx.fillStyle = "#046a38";
  ctx.fillRect(-14, -16, 11, 32);
  ctx.fillStyle = "#da291c";
  ctx.fillRect(-3, -16, 17, 32);
  ctx.fillStyle = "#e8c96a";
  ctx.beginPath();
  ctx.arc(-8.5, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Transparent thigh decal with the squad number. */
export function makeNumberDecal(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 160);
  const draw = () => {
    ctx.clearRect(0, 0, 128, 160);
    ctx.save();
    ctx.translate(64, 84);
    ctx.transform(1, 0, -0.1, 1, 0, 0);
    numberText(ctx, "7", 130);
    ctx.restore();
  };
  draw();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  onFonts(() => {
    draw();
    tex.needsUpdate = true;
  });
  return tex;
}

/** Transparent thigh decal with the crest. */
export function makeCrestDecal(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(96, 120);
  ctx.clearRect(0, 0, 96, 120);
  drawCrest(ctx, 48, 64, 58);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Classic black/white football via per-pixel icosahedral patches. */
export function makeBallTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const phi = (1 + Math.sqrt(5)) / 2;
  const verts: number[][] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      verts.push([0, a, b * phi], [a, b * phi, 0], [a * phi, 0, b]);
    }
  }
  for (const v of verts) {
    const l = Math.hypot(v[0], v[1], v[2]);
    v[0] /= l;
    v[1] /= l;
    v[2] /= l;
  }
  for (let y = 0; y < h; y++) {
    const th = ((y + 0.5) / h) * Math.PI;
    const st = Math.sin(th);
    const ct = Math.cos(th);
    for (let x = 0; x < w; x++) {
      const ph = ((x + 0.5) / w) * Math.PI * 2;
      const dx = st * Math.cos(ph);
      const dz = st * Math.sin(ph);
      let best = -1;
      for (const v of verts) {
        const dot = dx * v[0] + ct * v[1] + dz * v[2];
        if (dot > best) best = dot;
      }
      const ang = Math.acos(Math.min(1, best));
      let r = 246;
      let g = 244;
      let b = 238;
      if (ang < 0.3) {
        r = 24;
        g = 24;
        b = 30;
      } else if (ang < 0.34) {
        r = 160;
        g = 158;
        b = 152;
      }
      const i = (y * w + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const emojiCache = new Map<string, THREE.CanvasTexture>();

/** Cached sprite texture of a single emoji glyph. */
export function makeEmojiTexture(emoji: string): THREE.CanvasTexture {
  const hit = emojiCache.get(emoji);
  if (hit) return hit;
  const { canvas, ctx } = makeCanvas(128, 128);
  ctx.font = '92px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  emojiCache.set(emoji, tex);
  return tex;
}

export function disposeEmojiCache() {
  emojiCache.forEach((t) => t.dispose());
  emojiCache.clear();
}

/** Radial-gradient ground disc. */
export function makeGroundTexture(): THREE.CanvasTexture {
  const size = 1024;
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "#26374f");
  g.addColorStop(0.45, "#18263c");
  g.addColorStop(1, "#0a111f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(210,230,255,0.06)";
  for (let i = 1; i <= 6; i++) {
    ctx.lineWidth = i % 2 ? 2 : 3;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, (size / 2) * (i / 6.5), 0, Math.PI * 2);
    ctx.stroke();
  }
  const g2 = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.22);
  g2.addColorStop(0, "rgba(64,190,140,0.10)");
  g2.addColorStop(1, "rgba(64,190,140,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Vertical sky gradient with a warm horizon glow. */
export function makeBackgroundTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(32, 1024);
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, "#03050e");
  g.addColorStop(0.42, "#091324");
  g.addColorStop(0.66, "#12263f");
  g.addColorStop(0.78, "#1b3350");
  g.addColorStop(0.84, "#101d33");
  g.addColorStop(1, "#05090f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 1024);
  const glow = ctx.createRadialGradient(16, 820, 0, 16, 820, 620);
  glow.addColorStop(0, "rgba(255,150,84,0.30)");
  glow.addColorStop(0.4, "rgba(255,120,70,0.12)");
  glow.addColorStop(1, "rgba(255,120,70,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 32, 1024);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft round dot used for stars / bokeh points. */
export function makeDotTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Teal radial glow disc placed under the character. */
export function makeGlowDiscTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(86,232,178,0.85)");
  g.addColorStop(0.35, "rgba(56,200,160,0.35)");
  g.addColorStop(1, "rgba(56,200,160,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
