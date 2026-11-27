import * as THREE from "three";

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

/** Subtle pearl-ceramic armor surface texture with fine panel sheen variation. */
export function makeArmorTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 512);
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#f7f9fc");
  grad.addColorStop(0.5, "#eef2f8");
  grad.addColorStop(1, "#e3eaf3");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle metallic-pearl micro-grain
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  for (let i = 0; i < 1800; i++) {
    const x = (i * 173) % 512;
    const y = (i * 293) % 512;
    ctx.fillRect(x, y, 2, 1);
  }
  ctx.fillStyle = "rgba(155,175,200,0.08)";
  for (let i = 0; i < 1200; i++) {
    const x = (i * 311 + 19) % 512;
    const y = (i * 197 + 47) % 512;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Dark carbon-titanium weave & ribbed mechanical endoskeleton texture. */
export function makeCarbonTechTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "#141820";
  ctx.fillRect(0, 0, 256, 256);

  // Diagonal carbon-fiber micro-weave + horizontal actuator ribs
  for (let y = 0; y < 256; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? "#1d232e" : "#10141b";
    ctx.fillRect(0, y, 256, 4);
    for (let x = 0; x < 256; x += 8) {
      ctx.fillStyle = (x + y) % 16 === 0 ? "rgba(65,80,102,0.28)" : "rgba(8,10,14,0.35)";
      ctx.fillRect(x, y, 4, 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = 4;
  return tex;
}

/** Normal map giving the mechanical endoskeleton crisp machined ridges. */
export function makeCarbonNormalMap(): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    const rib = Math.sin((y / 8) * Math.PI * 2);
    for (let x = 0; x < 256; x++) {
      const weave = Math.cos(((x + y) / 8) * Math.PI * 2);
      const idx = (y * 256 + x) * 4;
      img.data[idx] = Math.round(128 + weave * 18);
      img.data[idx + 1] = Math.round(128 + rib * 26);
      img.data[idx + 2] = 242;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}
