// The chip animation from the TUFF film: experts light up on the SSD, stream into unified
// memory and the GPU cores flash. The user controls playback.
(() => {
  const cv = document.getElementById("chip");
  if (!cv) return;
  const g = cv.getContext("2d");
  const VIEW = { x: 60, y: 128, w: 1190, h: 486 };          // the part of the film's 1280x720 frame it uses
  const VIOLET = "#6f4dff", GRAY = "#86868b", FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
  const BEAT = 0.5, START = 0.6, HOLD = 2.6;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (u) => u * u * (3 - 2 * u);
  const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  function rrect(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  const DIE = { x: 452, y: 158, s: 404 / 600 };
  const GRID = { x: 92, y: 248, cell: 13, gap: 4 };
  const CORES = []; for (let j = 0; j < 2; j++) for (let i = 0; i < 5; i++) CORES.push([284 + i * 61, 124 + j * 156, 55, 148]);
  const MEMS = [0, 1, 2, 3].map((k) => [284 + k * 77, 16, 71, 98]);
  const WORDS = "TUFF reads only the experts each token needs, straight from the SSD.".split(" ");
  const LOOP = START + WORDS.length * BEAT + BEAT + HOLD;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let TOKS = [];
  function newRound() {
    let prev = -1;
    TOKS = WORDS.map((word, k) => {
      let mem; do { mem = Math.floor(rnd() * 4); } while (mem === prev); prev = mem;
      const t0 = START + k * BEAT;
      return { word, t0, arrive: t0 + BEAT, mem, experts: Array.from({ length: 6 }, () => Math.floor(rnd() * 256)), cores: [0, 0, 0].map(() => Math.floor(rnd() * 10)), bend: Array.from({ length: 6 }, () => [rnd(), rnd()]) };
    });
  }
  newRound();

  // the die, drawn once at high resolution
  const art = document.createElement("canvas"); art.width = art.height = 1920;
  (() => {
    const a = art.getContext("2d"); a.scale(3, 3); a.translate(20, 20);
    const gr = a.createLinearGradient(0, 0, 600, 600);
    gr.addColorStop(0, "#c4b5fd"); gr.addColorStop(0.45, "#8b5cf6"); gr.addColorStop(0.75, VIOLET); gr.addColorStop(1, "#e879f9");
    a.strokeStyle = gr;
    const L = (x, y, w, h) => a.strokeRect(x, y, w, h);
    const vl = (x, y, w, h, s) => { for (let k = x + s; k < x + w; k += s) { a.beginPath(); a.moveTo(k, y); a.lineTo(k, y + h); a.stroke(); } };
    const hl = (x, y, w, h, s) => { for (let k = y + s; k < y + h; k += s) { a.beginPath(); a.moveTo(x, k); a.lineTo(x + w, k); a.stroke(); } };
    a.lineWidth = 2; L(16, 16, 260, 98);
    for (const [x, y, w, h] of MEMS) { L(x, y, w, h); a.lineWidth = 1; vl(x + 4, y + 6, w - 8, h - 12, 6); a.lineWidth = 2; }
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const x = 16 + i * 132, y = 124 + j * 104; L(x, y, 124, 96); a.lineWidth = 1; L(x + 12, y + 12, 100, 72); vl(x + 40, y + 18, 44, 60, 8); a.lineWidth = 2; }
    for (let i = 0; i < 4; i++) { const x = 16 + i * 66, y = 336; L(x, y, 60, 80); a.lineWidth = 1; hl(x + 10, y + 10, 40, 60, 7); a.lineWidth = 2; }
    for (const [x, y, w, h] of CORES) { L(x, y, w, h); a.lineWidth = 1; hl(x + 5, y + 5, w - 10, 36, 6); hl(x + 5, y + 106, w - 10, 36, 6); L(x + 15, y + 52, w - 30, 44); a.lineWidth = 2; }
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { const x = 16 + i * 33, y = 428 + j * 80; L(x, y, 28, 74); a.lineWidth = 1; hl(x + 4, y + 4, 20, 66, 8); a.lineWidth = 2; }
    L(300, 428, 284, 156); a.lineWidth = 1; L(308, 436, 100, 66); hl(312, 440, 92, 58, 9); L(416, 436, 76, 66); L(500, 436, 76, 66); vl(504, 440, 68, 58, 9); L(308, 510, 180, 66); vl(314, 514, 168, 58, 12); L(496, 510, 80, 66);
    a.lineWidth = 16; a.strokeRect(0, 0, 600, 600);
    a.fillStyle = gr; a.font = `600 38px ${FONT}`; a.textBaseline = "middle"; a.fillText("Apple Silicon", 34, 66);
  })();
  const cell = (e) => [GRID.x + (e % 16) * (GRID.cell + GRID.gap) + GRID.cell / 2, GRID.y + Math.floor(e / 16) * (GRID.cell + GRID.gap) + GRID.cell / 2];
  const toScreen = (x, y) => [DIE.x + x * DIE.s, DIE.y + y * DIE.s];

  function draw(t) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth, ch = cw * VIEW.h / VIEW.w;
    if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const k = cv.width / VIEW.w;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = "#0b0a10"; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(k, 0, 0, k, -VIEW.x * k, -VIEW.y * k);
    const fadeOut = 1 - smooth(prog(t, LOOP - 0.5, LOOP));
    g.globalAlpha = fadeOut;
    const flash = (pred) => TOKS.reduce((a, tk) => a + (t >= tk.arrive && pred(tk) ? Math.exp(-(t - tk.arrive) * 4) : 0), 0);
    g.save(); g.translate(DIE.x, DIE.y); g.scale(DIE.s, DIE.s);
    for (let c = 0; c < 10; c++) {
      const a = Math.min(1, flash((tk) => tk.cores.includes(c))); if (a < 0.01) continue;
      const [x, y, w, h] = CORES[c], gr = g.createLinearGradient(0, y + h, 0, y);
      gr.addColorStop(0, `rgba(111,77,255,${0.55 * a})`); gr.addColorStop(1, `rgba(196,181,253,${0.25 * a})`); g.fillStyle = gr; g.fillRect(x, y, w, h);
    }
    for (let m = 0; m < 4; m++) {
      const a = Math.min(1, flash((tk) => tk.mem === m)); if (a < 0.01) continue;
      const [x, y, w, h] = MEMS[m]; g.fillStyle = `rgba(167,139,250,${0.7 * a})`; g.fillRect(x, y, w, h); g.fillStyle = `rgba(255,255,255,${0.35 * a * a})`; g.fillRect(x, y, w, h);
    }
    g.save(); g.filter = "blur(10px)"; g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.7 * fadeOut; g.drawImage(art, -20, -20, 640, 640); g.restore();
    g.drawImage(art, -20, -20, 640, 640);
    g.restore();
    g.fillStyle = GRAY; g.font = `500 16px ${FONT}`; g.textAlign = "center";
    g.fillText("Model on SSD", GRID.x + 135, GRID.y - 22);
    g.fillText("Unified memory", ...toScreen(438, -16));
    g.textAlign = "left"; g.fillText("Output", 930, 268);
    for (let e = 0; e < 256; e++) {
      const [cx, cy] = cell(e);
      const live = Math.min(1, TOKS.reduce((a, tk) => a + (tk.experts.includes(e) && t >= tk.t0 ? Math.exp(-(t - tk.t0) * 3) : 0), 0));
      g.fillStyle = live > 0.02 ? `rgb(${lerp(34, 167, live)},${lerp(28, 139, live)},${lerp(56, 250, live)})` : "#1d1830";
      if (live > 0.05) { g.shadowColor = "rgba(139,92,246,0.9)"; g.shadowBlur = 16 * live; } else g.shadowBlur = 0;
      rrect(cx - GRID.cell / 2, cy - GRID.cell / 2, GRID.cell, GRID.cell, 3); g.fill();
    }
    g.shadowBlur = 0;
    for (const tk of TOKS) {
      const u = (t - tk.t0) / (tk.arrive - tk.t0); if (u <= 0 || u >= 1.1) continue;
      tk.experts.forEach((e, i) => {
        const [sx, sy] = cell(e), [mx, my] = MEMS[tk.mem], [tx, ty] = toScreen(mx + 8 + tk.bend[i][0] * 55, my + 50);
        const cx = lerp(sx, tx, 0.5), cy = Math.min(sy, ty) - 60 - tk.bend[i][1] * 50;
        for (let s = 0; s < 7; s++) {
          const v = clamp(easeInOut(clamp(u)) - s * 0.03), px = (1 - v) ** 2 * sx + 2 * (1 - v) * v * cx + v * v * tx, py = (1 - v) ** 2 * sy + 2 * (1 - v) * v * cy + v * v * ty;
          g.fillStyle = `rgba(196,181,253,${(1 - s / 7) * (u < 1 ? 0.95 : 0)})`; g.beginPath(); g.arc(px, py, 3 - s * 0.3, 0, 7); g.fill();
        }
      });
    }
    g.font = `500 24px ${FONT}`; let x = 930, y = 306, last = [930, 306];
    for (const tk of TOKS) {
      if (t < tk.arrive) break;
      const w = g.measureText(tk.word + " ").width; if (x + w > 1222) { x = 930; y += 34; }
      g.globalAlpha = fadeOut * smooth(prog(t, tk.arrive, tk.arrive + 0.15)); g.fillStyle = "#f5f5f7"; g.fillText(tk.word, x, y); x += w; last = [x, y];
    }
    g.globalAlpha = fadeOut * (Math.floor(t * 2.5) % 2 ? 1 : 0.2); g.fillStyle = VIOLET; g.fillRect(last[0] + 1, last[1] - 20, 2.5, 25);
    g.globalAlpha = 1;
  }

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const toggle = document.getElementById("motion-toggle");
  let playing = false, visible = false, origin = 0, round = 0, frameID = null;
  const paintStill = () => draw(LOOP - HOLD);
  function frame(now) {
    frameID = null;
    if (!playing || !visible || motion.matches) return;
    const t = (now - origin) / 1000, r = Math.floor(t / LOOP);
    if (r !== round) { round = r; newRound(); }
    draw(t - r * LOOP);
    frameID = requestAnimationFrame(frame);
  }
  function update() {
    if (frameID !== null) cancelAnimationFrame(frameID);
    frameID = null;
    toggle.disabled = motion.matches;
    toggle.textContent = motion.matches ? "Reduced motion enabled" : playing ? "Pause animation" : "Play animation";
    toggle.setAttribute("aria-pressed", String(playing && !motion.matches));
    if (playing && visible && !motion.matches) {
      origin = performance.now(); round = 0; newRound();
      frameID = requestAnimationFrame(frame);
    } else paintStill();
  }
  toggle.addEventListener("click", () => { playing = !playing; update(); });
  motion.addEventListener("change", () => { playing = false; update(); });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, {threshold:.2}).observe(cv);
  addEventListener("resize", () => { if (!playing) paintStill(); });
  update();
})();
