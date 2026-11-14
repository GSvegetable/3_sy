/**
 * Live refractive glass for the large rail.
 * The scene is rasterized without the glass rail, then each glass face samples
 * that raster through a curved UV mesh. This bends the actual pixels behind it.
 */
export class GlassRefraction {
  constructor(stage) {
    this.stage = stage;
    this.cards = new Set();
    this.snapshot = document.createElement('canvas');
    this.ctx = this.snapshot.getContext('2d', { alpha: false });
    this.lastCapture = 0;
    this.busy = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.2);
    this.lastPaint = 0;
    this.resizeObserver = new ResizeObserver(() => { this.lastCapture = 0; });
    this.resizeObserver.observe(stage);
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  attach(face) {
    const canvas = document.createElement('canvas');
    canvas.className = 'glass-refraction';
    canvas.setAttribute('aria-hidden', 'true');
    face.prepend(canvas);
    const item = { face, canvas, ctx: canvas.getContext('2d', { alpha: true }), rect: null };
    this.cards.add(item);
    return item;
  }

  async capture(now) {
    if (this.busy || now - this.lastCapture < 140) return;
    this.busy = true;
    this.lastCapture = now;
    try {
      const rect = this.stage.getBoundingClientRect();
      const scale = Math.min(1, 600 / Math.max(rect.width, rect.height));
      const w = Math.max(1, Math.round(rect.width * scale));
      const h = Math.max(1, Math.round(rect.height * scale));
      const clone = this.stage.cloneNode(true);
      clone.querySelectorAll('.rail-back,.glass-refraction,.status,.search-dock').forEach((el) => el.remove());
      // Preserve the live 3D transform: the glass face is measured after projection,
      // so the background snapshot must use the same projected coordinate space.
      clone.style.width = rect.width + 'px';
      clone.style.height = rect.height + 'px';
      clone.style.position = 'relative';
      clone.style.overflow = 'hidden';
      const css = [...document.styleSheets].map((sheet) => {
        try { return [...sheet.cssRules].map((rule) => rule.cssText).join('\n'); }
        catch { return ''; }
      }).join('\n');
      const markup = new XMLSerializer().serializeToString(clone);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
        '" viewBox="0 0 ' + rect.width + ' ' + rect.height +
        '"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>' +
        css.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</style>' + markup +
        '</div></foreignObject></svg>';
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await image.decode();
      this.snapshot.width = w;
      this.snapshot.height = h;
      this.ctx.drawImage(image, 0, 0, w, h);
      this.scale = scale;
      this.stageRect = rect;
    } catch (error) {
      // Keep the last good optical frame if SVG rasterization is unavailable.
    } finally {
      this.busy = false;
    }
  }

  paint(item) {
    const { face, canvas, ctx } = item;
    if (!face.isConnected || !this.snapshot.width) return;
    const r = face.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
    const dpr = this.dpr;
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      canvas.style.width = '100%'; canvas.style.height = '100%';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.save();
    const radius = Math.min(26, r.width * 0.11);
    rounded(ctx, 0, 0, r.width, r.height, radius);
    ctx.clip();

    // A subdivided optical surface samples a displaced point in the live scene.
    const cols = 12, rows = 14;
    const sourceScale = this.scale || 1;
    const stage = this.stageRect || this.stage.getBoundingClientRect();
    const sourceX = (r.left - stage.left) * sourceScale;
    const sourceY = (r.top - stage.top) * sourceScale;
    const sourceW = r.width * sourceScale;
    const sourceH = r.height * sourceScale;
    // Keep lens displacement subtle so text on the covered small rail stays legible.
    const bulge = Math.min(10, Math.min(r.width, r.height) * 0.04);
    const point = (x, y) => {
      const nx = x / r.width * 2 - 1, ny = y / r.height * 2 - 1;
      const edge = Math.min(1, Math.max(0, (1 - Math.max(Math.abs(nx), Math.abs(ny))) / 0.52));
      const dome = Math.sqrt(Math.max(0, 1 - nx * nx * 0.72 - ny * ny * 0.72));
      const amount = bulge * dome * edge;
      return { x: x - nx * amount, y: y - ny * amount };
    };
    const sx = (x) => sourceX + x * sourceScale;
    const sy = (y) => sourceY + y * sourceScale;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const x0 = gx * r.width / cols, x1 = (gx + 1) * r.width / cols;
        const y0 = gy * r.height / rows, y1 = (gy + 1) * r.height / rows;
        const a = point(x0, y0), b = point(x1, y0), c = point(x1, y1), d = point(x0, y1);
        triangle(ctx, this.snapshot, [sx(a.x), sy(a.y), sx(b.x), sy(b.y), sx(c.x), sy(c.y)],
          [x0, y0, x1, y0, x1, y1]);
        triangle(ctx, this.snapshot, [sx(a.x), sy(a.y), sx(c.x), sy(c.y), sx(d.x), sy(d.y)],
          [x0, y0, x1, y1, x0, y1]);
      }
    }
    // Subtle optical caustics and a narrow polished edge; no opaque fill.
    const shine = ctx.createLinearGradient(0, 0, r.width * 0.85, r.height);
    shine.addColorStop(0, 'rgba(255,255,255,.16)');
    shine.addColorStop(.18, 'rgba(255,255,255,.025)');
    shine.addColorStop(.55, 'rgba(255,255,255,0)');
    shine.addColorStop(1, 'rgba(255,255,255,.045)');
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.restore();
  }

  async frame(now) {
    if (now - this.lastCapture > 160) await this.capture(now);
    if (now - this.lastPaint > 40) {
      this.lastPaint = now;
      for (const item of this.cards) {
        if (!item.face.isConnected) { this.cards.delete(item); continue; }
        this.paint(item);
      }
    }
    requestAnimationFrame(this.frame);
  }
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function triangle(ctx, image, src, dst) {
  const [sx0, sy0, sx1, sy1, sx2, sy2] = src;
  const [dx0, dy0, dx1, dy1, dx2, dy2] = dst;
  const den = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (Math.abs(den) < 0.0001) return;
  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / den;
  const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / den;
  const e = (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / den;
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / den;
  const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / den;
  const f = (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / den;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(dx0, dy0); ctx.lineTo(dx1, dy1); ctx.lineTo(dx2, dy2); ctx.closePath(); ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  const minX = Math.max(0, Math.floor(Math.min(sx0, sx1, sx2)) - 1);
  const minY = Math.max(0, Math.floor(Math.min(sy0, sy1, sy2)) - 1);
  const maxX = Math.min(image.width, Math.ceil(Math.max(sx0, sx1, sx2)) + 1);
  const maxY = Math.min(image.height, Math.ceil(Math.max(sy0, sy1, sy2)) + 1);
  if (maxX > minX && maxY > minY) ctx.drawImage(image, minX, minY, maxX - minX, maxY - minY, minX, minY, maxX - minX, maxY - minY);
  ctx.restore();
}
