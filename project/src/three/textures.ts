import * as THREE from "three";

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

/** High-resolution studio pearl-ceramic armor finish with soft AO edge shading and metallic micro-flake. */
export function makeArmorTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(1024, 1024);
  const grad = ctx.createRadialGradient(512, 420, 60, 512, 512, 680);
  grad.addColorStop(0, "#fbfcfe");
  grad.addColorStop(0.55, "#f1f5fb");
  grad.addColorStop(0.88, "#e3eaf4");
  grad.addColorStop(1, "#cfd9e8");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Ultra-fine pearlescent metallic shimmer
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  for (let i = 0; i < 4200; i++) {
    const x = (i * 313 + 29) % 1024;
    const y = (i * 571 + 13) % 1024;
    ctx.fillRect(x, y, 2, 1);
  }
  ctx.fillStyle = "rgba(145,168,198,0.07)";
  for (let i = 0; i < 2400; i++) {
    const x = (i * 467 + 91) % 1024;
    const y = (i * 283 + 53) % 1024;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 16;
  return tex;
}

/** Subtle roughness map so clearcoat & metallic highlights glide cleanly over curved armor shells. */
export function makeArmorRoughnessMap(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 110, 16, 128, 128, 175);
  g.addColorStop(0, "#242424");
  g.addColorStop(0.7, "#303030");
  g.addColorStop(1, "#464646");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** Deep obsidian-gunmetal carbon weave & machined actuator ribs for the mechanical endoskeleton. */
export function makeCarbonTechTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = "#0e1218";
  ctx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? "#181f2a" : "#0b0e14";
    ctx.fillRect(0, y, 512, 4);
    for (let x = 0; x < 512; x += 8) {
      ctx.fillStyle = (x + y) % 16 === 0 ? "rgba(82,98,124,0.28)" : "rgba(4,6,10,0.42)";
      ctx.fillRect(x, y, 4, 4);
    }
  }
  // Subtle machined titanium pinstripe seams
  ctx.fillStyle = "rgba(130,152,182,0.16)";
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(0, y, 512, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 16;
  return tex;
}

/** Normal map giving the mechanical endoskeleton crisp machined ridges and carbon micro-relief. */
export function makeCarbonNormalMap(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    const rib = Math.sin((y / 8) * Math.PI * 2);
    for (let x = 0; x < 256; x++) {
      const weave = Math.cos(((x + y) / 8) * Math.PI * 2);
      const idx = (y * 256 + x) * 4;
      img.data[idx] = Math.round(128 + weave * 22);
      img.data[idx + 1] = Math.round(128 + rib * 32);
      img.data[idx + 2] = 240;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** Hot-core sapphire-to-cyan emissive gradient so LED strips, rings & spine nodes glow like real fiber-optics. */
export function makeEnergyGlowTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, "#d8fbff");
  g.addColorStop(0.32, "#4cd4ff");
  g.addColorStop(0.72, "#0088ff");
  g.addColorStop(1, "#003c99");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
