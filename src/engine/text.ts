export interface TextSample {
  /** points relative to the visual centre of the text */
  points: { x: number; y: number; v: number }[];
  step: number;
  fontSize: number;
  width: number;
  height: number;
  /** blurred glow image of the text (no solid core), centred on the text */
  glow: HTMLCanvasElement;
  glowOffsetX: number;
  glowOffsetY: number;
}

/**
 * Rasterises text off-screen and samples it into evenly spaced points.
 * `target` is the approximate number of points wanted, so density adapts to the device.
 */
export function sampleText(
  text: string,
  family: string,
  weight: number,
  maxW: number,
  maxH: number,
  target: number,
  spacingEm = 0.06,
): TextSample {
  const mc = document.createElement('canvas');
  const g = mc.getContext('2d', { willReadFrequently: true })!;
  const chars = [...text];

  const measure = (fs: number): number => {
    g.font = `${weight} ${fs}px ${family}`;
    let w = 0;
    for (const ch of chars) w += g.measureText(ch).width;
    return w + spacingEm * fs * (chars.length - 1);
  };

  const ref = 200;
  const w0 = measure(ref);
  const fontSize = Math.max(18, Math.min((ref * maxW) / w0, maxH / 0.74));
  const tw = measure(fontSize);
  const pad = Math.ceil(fontSize * 0.2);
  mc.width = Math.ceil(tw + pad * 2);
  mc.height = Math.ceil(fontSize * 1.3 + pad * 2);
  g.font = `${weight} ${fontSize}px ${family}`;
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  let x = pad;
  for (const ch of chars) {
    g.fillText(ch, x, mc.height / 2);
    x += g.measureText(ch).width + spacingEm * fontSize;
  }

  const { data, width: W, height: H } = g.getImageData(0, 0, mc.width, mc.height);
  let filled = 0;
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let yy = 0; yy < H; yy += 2) {
    for (let xx = 0; xx < W; xx += 2) {
      if (data[(yy * W + xx) * 4 + 3] > 128) {
        filled += 4;
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        if (yy > maxY) maxY = yy;
      }
    }
  }
  const step = Math.max(2.2, Math.sqrt(filled / Math.max(50, target)));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const points: { x: number; y: number; v: number }[] = [];
  for (let yy = minY; yy <= maxY; yy += step) {
    for (let xx = minX; xx <= maxX; xx += step) {
      const jx = xx + (Math.random() - 0.5) * step * 0.7;
      const jy = yy + (Math.random() - 0.5) * step * 0.7;
      const px = Math.round(jx), py = Math.round(jy);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      if (data[(py * W + px) * 4 + 3] > 140) {
        points.push({ x: jx - cx, y: jy - cy, v: (jy - minY) / Math.max(1, maxY - minY) });
      }
    }
  }

  // Glow: draw only the shadow (source pushed off-canvas) so there is no solid "HTML text" core.
  const gp = Math.ceil(fontSize * 0.6);
  const glow = document.createElement('canvas');
  glow.width = mc.width + gp * 2;
  glow.height = mc.height + gp * 2;
  const gg = glow.getContext('2d')!;
  const off = glow.width + 50;
  gg.shadowOffsetX = off;
  gg.shadowColor = 'rgba(255,120,10,0.85)';
  gg.shadowBlur = fontSize * 0.1;
  gg.drawImage(mc, gp - off, gp);
  gg.shadowColor = 'rgba(255,106,0,0.6)';
  gg.shadowBlur = fontSize * 0.32;
  gg.drawImage(mc, gp - off, gp);

  return {
    points,
    step,
    fontSize,
    width: maxX - minX,
    height: maxY - minY,
    glow,
    glowOffsetX: -(cx + gp),
    glowOffsetY: -(cy + gp),
  };
}
