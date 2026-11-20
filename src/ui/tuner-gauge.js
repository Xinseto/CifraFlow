/**
 * Renderizador Canvas 60 FPS do Medidor Analógico Semicircular do Afinador
 * Inspirado diretamente no layout do CifraFlow (Google Play)
 */

export class TunerGaugeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.currentCents = 0;
    this.targetCents = 0;
    this.status = 'idle'; // 'idle' | 'flat' | 'tuned' | 'sharp'
    this.animating = false;
  }

  update(cents, status = 'idle') {
    this.targetCents = Math.max(-50, Math.min(50, Number(cents) || 0));
    this.status = status;
    this._startAnimation();
  }

  _startAnimation() {
    if (this.animating || !this.ctx) return;
    this.animating = true;

    const step = () => {
      const diff = this.targetCents - this.currentCents;
      if (Math.abs(diff) > 0.15) {
        this.currentCents += diff * 0.22;
        this.draw();
        requestAnimationFrame(step);
      } else {
        this.currentCents = this.targetCents;
        this.draw();
        this.animating = false;
      }
    };

    requestAnimationFrame(step);
  }

  draw() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h - 26;
    const radius = Math.min(w * 0.36, h - 42);

    // Ângulo de -50 cents (200 graus) até +50 cents (340 graus)
    const degToRad = (deg) => (deg * Math.PI) / 180;
    const centsToAngle = (c) => degToRad(270 + (c / 50) * 72);

    // 1. Arcos coloridos de precisão (Vermelho -> Laranja -> Verde -> Laranja -> Vermelho)
    const segments = [
      { from: -50, to: -24, color: '#ef4444' },
      { from: -24, to: -6, color: '#ff7a00' },
      { from: -6, to: 6, color: '#22c55e' },
      { from: 6, to: 24, color: '#ff7a00' },
      { from: 24, to: 50, color: '#ef4444' }
    ];

    ctx.lineCap = 'butt';
    ctx.lineWidth = 8;
    for (const seg of segments) {
      ctx.beginPath();
      ctx.strokeStyle = seg.color;
      ctx.arc(cx, cy, radius, centsToAngle(seg.from), centsToAngle(seg.to));
      ctx.stroke();
    }

    // 2. Marcações (ticks) de -50 a +50 cents a cada 10 cents
    for (let c = -50; c <= 50; c += 10) {
      const angle = centsToAngle(c);
      const isCenter = c === 0;
      const innerR = radius - (isCenter ? 22 : 14);
      const outerR = radius - 5;

      ctx.beginPath();
      ctx.lineWidth = isCenter ? 2.5 : 1.6;
      ctx.strokeStyle = isCenter ? '#e2e8f0' : '#64748b';
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.stroke();
    }

    // 3. Símbolos ♭ (Bemol), 0 (Centro) e ♯ (Sustenido)
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 17px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♭', cx - radius - 26, cy - 52);
    ctx.fillText('#', cx + radius + 26, cy - 52);

    ctx.font = 'bold 12px "Cascadia Mono", monospace';
    ctx.fillText('0', cx, cy - radius - 14);

    // 4. Agulha do Afinador
    const needleAngle = centsToAngle(this.currentCents);
    const needleLen = radius - 24;
    const needleColor =
      this.status === 'tuned'
        ? '#22c55e'
        : this.status === 'idle'
        ? '#22c55e'
        : Math.abs(this.currentCents) <= 22
        ? '#ff7a00'
        : '#ef4444';

    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = needleColor;
    ctx.shadowColor = needleColor;
    ctx.shadowBlur = 10;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(needleAngle) * needleLen, cy + Math.sin(needleAngle) * needleLen);
    ctx.stroke();
    ctx.restore();

    // 5. Pivô central duplo (idêntico ao CifraFlow da Play Store)
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#475569';
    ctx.fillStyle = '#0b0d12';
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = needleColor;
    ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
