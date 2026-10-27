(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const PALETTE = ['#8052ff', '#ffb829', '#15846e', '#e04dff', '#4d7dff', '#a98bff', '#ff6fa8', '#2fd1b0', '#ffd36b'];

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------------- Nav ---------------- */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const items = document.querySelectorAll('.nav__item.has-menu');
  const closeAll = (except) => items.forEach(i => {
    if (i !== except) { i.classList.remove('is-open'); i.querySelector('.nav__link').setAttribute('aria-expanded', 'false'); }
  });
  items.forEach(item => {
    const btn = item.querySelector('.nav__link');
    let t;
    const open = () => { clearTimeout(t); closeAll(item); item.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); };
    const close = () => { t = setTimeout(() => { item.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }, 120); };
    item.addEventListener('mouseenter', open);
    item.addEventListener('mouseleave', close);
    btn.addEventListener('click', () => item.classList.contains('is-open') ? (item.classList.remove('is-open'), btn.setAttribute('aria-expanded','false')) : open());
    item.querySelectorAll('.mega a').forEach(a => a.addEventListener('click', () => closeAll()));
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

  const burger = document.querySelector('.nav__burger');
  const mobile = document.getElementById('mobileMenu');
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', String(open));
    mobile.classList.toggle('is-open', open);
  });
  mobile.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    burger.setAttribute('aria-expanded', 'false'); mobile.classList.remove('is-open');
  }));

  /* ---------------- Reveal ---------------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const sibs = [...e.target.parentElement.children].filter(c => c.classList.contains('reveal'));
        e.target.style.transitionDelay = Math.min(sibs.indexOf(e.target), 6) * 70 + 'ms';
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ---------------- FAQ: one open at a time ---------------- */
  const dets = document.querySelectorAll('.faq details');
  dets.forEach(d => d.addEventListener('toggle', () => { if (d.open) dets.forEach(o => o !== d && (o.open = false)); }));

  /* ---------------- Particle helpers ---------------- */
  /* Visibility: always trust the most recent entry, plus a scroll/resize fallback check */
  function watchVisible(el, cb) {
    const check = () => { const r = el.getBoundingClientRect(); cb(r.bottom > 0 && r.top < window.innerHeight && r.width > 0); };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => cb(entries[entries.length - 1].isIntersecting), { threshold: 0 }).observe(el);
    }
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    window.addEventListener('hashchange', () => setTimeout(check, 50));
    check();
  }

  function setup(canvas) {
    const ctx = canvas.getContext('2d');
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, r.width * DPR);
      canvas.height = Math.max(1, r.height * DPR);
    };
    resize();
    // Re-measure whenever the canvas box changes (layout shifts, fonts loading, window resize)
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    return { ctx, resize };
  }

  function tri(ctx, x, y, s, rot, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = rot + k * 2.0944;
      const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* ---------------- Hero jigsaw puzzle ---------------- */
  const puzzleCanvas = document.getElementById('brain');
  if (puzzleCanvas) {
    const { ctx, resize } = setup(puzzleCanvas);
    const small = window.innerWidth < 700;
    const N = 3;                       // 3 x 3 puzzle
    const LAST = 4;                    // centre piece lands last, in violet

    // One jigsaw edge as a polyline in local coords: u along (0..1), v perpendicular
    function edgeShape(sign) {
      const pts = [];
      const line = (u0, v0, u1, v1, n) => { for (let i = 0; i < n; i++) { const k = i / n; pts.push([u0 + (u1 - u0) * k, v0 + (v1 - v0) * k]); } };
      line(0, 0, 0.37, 0, 14);
      line(0.37, 0, 0.405, 0.1, 4);
      const cx = 0.5, cv = 0.19, r = 0.12;
      const a0 = Math.atan2(0.1 - cv, 0.405 - cx) + Math.PI * 2, a1 = Math.atan2(0.1 - cv, 0.595 - cx);
      for (let i = 0; i <= 26; i++) { const a = a0 + (a1 - a0) * (i / 26); pts.push([cx + Math.cos(a) * r, cv + Math.sin(a) * r]); }
      line(0.595, 0.1, 0.63, 0, 4);
      line(0.63, 0, 1, 0, 14);
      pts.push([1, 0]);
      return pts.map(([u, v]) => [u, v * sign]);
    }
    // Global edge polylines (grid units). Horizontal edges h[r][c] sit at y=r, vertical v[r][c] at x=c.
    const sgn = () => (Math.random() < 0.5 ? -1 : 1);
    const H = [], V = [];
    for (let r = 0; r <= N; r++) { H[r] = []; for (let c = 0; c < N; c++) {
      const flat = r === 0 || r === N, sh = edgeShape(flat ? 0 : sgn());
      H[r][c] = sh.map(([u, v]) => [c + u, r + v]);
    } }
    for (let r = 0; r < N; r++) { V[r] = []; for (let c = 0; c <= N; c++) {
      const flat = c === 0 || c === N, sh = edgeShape(flat ? 0 : sgn());
      V[r][c] = sh.map(([u, v]) => [c + v, r + u]);
    } }
    const inside = (poly, x, y) => {
      let ins = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
      }
      return ins;
    };
    const resample = (poly, step) => {   // even spacing along the outline
      const out = [];
      for (let i = 0; i < poly.length - 1; i++) {
        const [x0, y0] = poly[i], [x1, y1] = poly[i + 1];
        const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(d / step));
        for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n + gauss() * 0.006, y0 + (y1 - y0) * k / n + gauss() * 0.006]);
      }
      return out;
    };

    const pieceColors = ['#4d7dff', '#ffb829', '#15846e', '#e04dff', '#8052ff', '#2fd1b0', '#ff6fa8', '#a98bff', '#ffd36b'];
    const pieces = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const i = r * N + c;
      const poly = [
        ...H[r][c],
        ...V[r][c + 1],
        ...H[r + 1][c].slice().reverse(),
        ...V[r][c].slice().reverse()
      ];
      const base = i === LAST ? '#8052ff' : pieceColors[i];
      const pick = () => (Math.random() < 0.72 ? base : PALETTE[(Math.random() * PALETTE.length) | 0]);
      const parts = [];
      resample(poly, small ? 0.03 : 0.02).forEach(([x, y]) => parts.push({ x, y, c: pick(), s: rand(1.6, 3.2), rot: rand(0, 6.28), sp: rand(-1, 1), edge: true }));
      let tries = 0, fill = small ? 50 : 110;
      while (fill > 0 && tries++ < 5000) {
        const x = rand(c - 0.3, c + 1.3), y = rand(r - 0.3, r + 1.3);
        if (inside(poly, x, y)) { parts.push({ x, y, c: pick(), s: rand(1.2, 2.4), rot: rand(0, 6.28), sp: rand(-1, 1), edge: false }); fill--; }
      }
      const cx = c + 0.5, cy = r + 0.5;
      parts.forEach(p => { p.x -= cx; p.y -= cy; });   // local to piece centre
      const ang = Math.atan2(cy - 1.5, cx - 1.5) + rand(-0.6, 0.6) + (i === LAST ? rand(0, 6.28) : 0);
      const dist = rand(0.55, 0.95);
      pieces.push({
        i, cx, cy, parts, depth: rand(0.4, 1),
        sx: cx + Math.cos(ang) * dist, sy: cy + Math.sin(ang) * dist, srot: rand(-0.9, 0.9),
        order: i === LAST ? N * N - 1 : 0
      });
    }
    // Stagger order for all non-last pieces
    pieces.filter(p => p.i !== LAST).sort(() => Math.random() - 0.5).forEach((p, k) => p.order = k);

    let mx = 0, my = 0, tmx = 0, tmy = 0, visible = true;
    window.addEventListener('pointermove', e => {
      tmx = (e.clientX / window.innerWidth - 0.5); tmy = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });
    watchVisible(puzzleCanvas, v => visible = v);
    window.addEventListener('resize', resize);

    // Timeline: scattered -> assemble (staggered) -> hold -> scatter -> repeat
    const STAG = 0.32, FLY = 1.3;
    const ASSEMBLE = STAG * (N * N - 2) + FLY + 0.5;   // last piece gets extra beat
    const HOLD = 4.2, SCATTER = 1.6, DRIFT = 1.4;
    const CYCLE = 0.6 + ASSEMBLE + HOLD + SCATTER + DRIFT;
    let t0 = performance.now();
    puzzleCanvas.addEventListener('click', () => { t0 = performance.now() - (0.6 + ASSEMBLE + HOLD) * 1000; });
    const easeOutBack = x => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    const easeInOut = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    const clamp01 = x => Math.max(0, Math.min(1, x));

    const frame = (now) => {
      requestAnimationFrame(frame);
      if (!visible) return;
      const T = (now - t0) / 1000;
      const ct = reduce ? 0.6 + ASSEMBLE + 1 : T % CYCLE;
      mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
      const W = puzzleCanvas.width, Hh = puzzleCanvas.height, S = Math.min(W, Hh) * 0.17;
      const ox = W / 2 - 1.5 * S, oy = Hh / 2 - 1.5 * S;
      ctx.clearRect(0, 0, W, Hh);
      ctx.lineWidth = 1 * DPR;

      const aStart = 0.6, sStart = aStart + ASSEMBLE + HOLD;
      let snapFlash = 0;
      for (const pc of pieces) {
        // progress 0 = scattered, 1 = home
        let k;
        if (ct < sStart) {
          const st = aStart + pc.order * STAG + (pc.i === LAST ? 0.5 : 0);
          const raw = clamp01((ct - st) / FLY);
          k = raw <= 0 ? 0 : easeOutBack(raw);
          if (pc.i === LAST && raw >= 1) snapFlash = Math.max(0, 1 - (ct - st - FLY) / 0.9);
        } else {
          k = 1 - easeInOut(clamp01((ct - sStart) / SCATTER));
        }
        const idle = (1 - Math.min(1, k)) * 0.06;
        const wob = T * 0.6 + pc.i;
        const px = pc.sx + (pc.cx - pc.sx) * k + Math.sin(wob) * idle + mx * pc.depth * 0.12;
        const py = pc.sy + (pc.cy - pc.sy) * k + Math.cos(wob * 0.8) * idle + my * pc.depth * 0.12;
        const rot = pc.srot * (1 - k) + (k >= 0.999 ? Math.sin(T * 0.8 + pc.i) * 0.004 : 0);
        const cr = Math.cos(rot), sr = Math.sin(rot);
        const fade = 0.55 + 0.45 * Math.min(1, k);
        const glow = pc.i === LAST ? snapFlash : 0;
        for (const p of pc.parts) {
          const lx = p.x * cr - p.y * sr, ly = p.x * sr + p.y * cr;
          const X = ox + (px + lx) * S, Y = oy + (py + ly) * S;
          const a = (p.edge ? 0.95 : 0.4) * fade;
          tri(ctx, X, Y, p.s * DPR * (1 + glow * 0.6), p.rot + T * p.sp * 0.5, glow > 0.05 && p.edge ? '#ffffff' : p.c, Math.min(1, a + glow * 0.4));
        }
      }
      ctx.globalAlpha = 1;
    };
    requestAnimationFrame(frame);
  }

  /* ---------------- Core Context brain ---------------- */
  const coreCanvas = document.getElementById('coreBrain');
  if (coreCanvas) {
    const { ctx, resize } = setup(coreCanvas);
    const small = window.innerWidth < 700;
    // Model space (side profile): x = back(-) to front(+), y = top(-) to bottom(+), z = left/right
    const REGIONS = [
      { name: 'Company profile',  c: '#ffb829', p: [0.58, -0.18, 0.18], L: [1, -1] },   // frontal
      { name: 'Products',         c: '#2fd1b0', p: [0.12, -0.5, 0.12], L: [1, -1] },    // motor / top
      { name: 'Customer profiles',c: '#ff6fa8', p: [-0.38, -0.36, 0.2], L: [-1, -1] },   // parietal
      { name: 'Buying committee', c: '#4d7dff', p: [-0.7, -0.02, 0.15], L: [-1, 1.6] },   // occipital
      { name: 'Competitors',      c: '#e04dff', p: [0.22, 0.24, 0.36], L: [1, 1.8] },    // temporal
      { name: 'Brand voice',      c: '#ffd36b', p: [0.4, 0.06, 0.4], L: [1, 0.9] }       // speech area
    ];
    const CORE = [0, 0.02, 0];

    const brain = [];
    const total = small ? 1500 : 2900;
    while (brain.length < total) {
      const r = Math.random();
      let x, y, z, kind = 'shell';
      if (r < 0.8) {
        // cerebrum surface-biased shell
        const u = rand(0, Math.PI * 2), v = Math.acos(rand(-1, 1));
        const shell = Math.pow(Math.random(), 0.18);
        const fold = 1 + 0.06 * Math.sin(u * 9 + v * 5) * Math.sin(v * 13);
        x = Math.sin(v) * Math.cos(u) * 0.82 * shell * fold;
        y = Math.cos(v) * 0.56 * shell * fold;
        z = Math.sin(v) * Math.sin(u) * 0.62 * shell * fold;
        if (Math.abs(z) < 0.035 && y < 0.1) continue;        // longitudinal fissure
        if (y > 0.3) continue;                                // flat-ish base
        if (y > 0.12 && x < -0.25 && x > -0.75) continue;      // room for cerebellum
        if (y > 0.18 && x > -0.05 && x < 0.08) continue;       // lateral sulcus notch
        // temporal lobe droop
        if (x > 0 && x < 0.6 && y > 0.05) y += 0.08 * Math.sin((x / 0.6) * Math.PI);
      } else if (r < 0.93) {
        // cerebellum with fine ridges
        const u = rand(0, Math.PI * 2), v = Math.acos(rand(-1, 1)), sh = Math.pow(Math.random(), 0.3);
        x = -0.5 + Math.sin(v) * Math.cos(u) * 0.27 * sh;
        y = 0.3 + Math.cos(v) * 0.15 * sh;
        z = Math.sin(v) * Math.sin(u) * 0.42 * sh;
        y += 0.012 * Math.sin(y * 120);
        kind = 'cb';
      } else {
        // brain stem
        const k = Math.random();
        x = -0.16 - k * 0.12 + gauss() * 0.03; y = 0.24 + k * 0.48; z = gauss() * 0.06;
        kind = 'stem';
      }
      brain.push({ x, y, z, kind, s: rand(1.3, 2.8), rot: rand(0, 6.28), sp: rand(-1, 1), c: PALETTE[(Math.random() * PALETTE.length) | 0], reg: -1, w: 0 });
    }
    // Core: dense bright cluster in the centre
    const core = Array.from({ length: small ? 160 : 300 }, () => {
      const g = Math.abs(gauss()) * 0.09, u = rand(0, 6.283), v = Math.acos(rand(-1, 1));
      return { x: CORE[0] + Math.sin(v) * Math.cos(u) * g * 1.3, y: CORE[1] + Math.cos(v) * g, z: CORE[2] + Math.sin(v) * Math.sin(u) * g,
        s: rand(1.4, 3), rot: rand(0, 6.28), sp: rand(-1.5, 1.5), c: Math.random() < 0.75 ? '#8052ff' : (Math.random() < 0.5 ? '#a98bff' : '#ffffff') };
    });
    // Tag brain points to regions (mirror regions on both hemispheres)
    brain.forEach(p => {
      REGIONS.forEach((R, i) => {
        const d = Math.hypot(p.x - R.p[0], p.y - R.p[1], Math.abs(p.z) - Math.abs(R.p[2]));
        if (d < 0.3 && (p.reg < 0 || d < p.w)) { p.reg = i; p.w = d; }
      });
    });
    // Signal paths: curved from core to each region (right hemisphere side)
    const paths = REGIONS.map(R => {
      const mid = [(CORE[0] + R.p[0]) / 2 + rand(-0.08, 0.08), (CORE[1] + R.p[1]) / 2 - 0.12, (CORE[2] + R.p[2]) / 2 + 0.1];
      return t => {
        const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        return [a * CORE[0] + b * mid[0] + c * R.p[0], a * CORE[1] + b * mid[1] + c * R.p[1], a * CORE[2] + b * mid[2] + c * R.p[2]];
      };
    });

    let visible = false, appear = 0, last = performance.now(), mx = 0, tmx = 0;
    watchVisible(coreCanvas, v => visible = v);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', e => { tmx = e.clientX / window.innerWidth - 0.5; }, { passive: true });
    const STEP = 2.4;          // seconds per region
    let t0 = performance.now();

    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) return;
      appear = Math.min(1, appear + dt / 1.4);
      const e = reduce ? 1 : 1 - Math.pow(1 - appear, 3);
      const t = (now - t0) / 1000;
      mx += (tmx - mx) * 0.05;
      const W = coreCanvas.width, H = coreCanvas.height, S = Math.min(W, H) * 0.5;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1 * DPR;

      // gentle sway around a 3/4 side view so the brain silhouette stays readable
      const ay = (reduce ? 0 : Math.sin(t * 0.25) * 0.35) + 0.38 + mx * 0.5;
      const ax = -0.12;
      const cy = Math.cos(ay), sy = Math.sin(ay), cxr = Math.cos(ax), sxr = Math.sin(ax);
      const proj = (x, y, z) => {
        const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
        const y1 = y * cxr - z1 * sxr, z2 = y * sxr + z1 * cxr;
        const persp = 1 / (2 - z2 * 0.45);
        const k = (0.7 + 0.3 * e) * 1.9;
        return [W / 2 + x1 * S * persp * k, H / 2 + (y1 - 0.08) * S * persp * k, (z2 + 1) / 2];
      };

      // focus schedule
      const phase = reduce ? 0.5 : (t % STEP) / STEP;
      const active = reduce ? -1 : Math.floor(t / STEP) % REGIONS.length;
      const travel = Math.min(1, phase / 0.32);                       // signal reaches region
      const lit = phase < 0.32 ? 0 : Math.sin(Math.min(1, (phase - 0.32) / 0.68) * Math.PI); // region glow
      const levels = REGIONS.map((_, i) => reduce ? 0.75 : (i === active ? lit : 0));

      // regional glow
      REGIONS.forEach((R, i) => {
        if (levels[i] < 0.02) return;
        const [X, Y] = proj(...R.p), rad = S * 0.3;
        const g = ctx.createRadialGradient(X, Y, 0, X, Y, rad);
        const hex = R.c.slice(1), rr = parseInt(hex.slice(0,2),16), gg = parseInt(hex.slice(2,4),16), bb = parseInt(hex.slice(4,6),16);
        g.addColorStop(0, `rgba(${rr},${gg},${bb},${0.28 * levels[i] * e})`); g.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
      });

      // shell
      for (const p of brain) {
        const [X, Y, d] = proj(p.x, p.y, p.z);
        const L = p.reg >= 0 ? levels[p.reg] * Math.pow(1 - p.w / 0.3, 0.6) : 0;
        const col = L > 0.08 ? REGIONS[p.reg].c : p.c;
        const a = (0.12 + d * 0.28 + L * 1.1) * e;
        tri(ctx, X, Y, p.s * DPR * (0.75 + d * 0.5 + L * 1.1), p.rot + t * p.sp * 0.4, col, Math.min(1, a));
      }

      // signal: core -> active region
      if (active >= 0 && phase < 0.95) {
        const f = paths[active], R = REGIONS[active];
        ctx.globalAlpha = 0.5 * e * (phase < 0.32 ? 1 : 1 - (phase - 0.32) / 0.63);
        ctx.strokeStyle = R.c;
        ctx.setLineDash([2 * DPR, 5 * DPR]);
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const k = (i / 40) * travel; const [X, Y] = proj(...f(k));
          i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (phase < 0.36) {
          const [X, Y] = proj(...f(travel));
          for (let j = 0; j < 4; j++) tri(ctx, X + gauss() * 3 * DPR, Y + gauss() * 3 * DPR, 3.2 * DPR, t * 4 + j, j ? R.c : '#ffffff', 0.95 * e);
        }
      }

      // core (always on, breathing)
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
      const [CX, CY] = proj(...CORE);
      const grd = ctx.createRadialGradient(CX, CY, 0, CX, CY, S * 0.32);
      grd.addColorStop(0, `rgba(128,82,255,${0.32 * pulse * e})`);
      grd.addColorStop(1, 'rgba(128,82,255,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = grd;
      ctx.fillRect(CX - S * 0.32, CY - S * 0.32, S * 0.64, S * 0.64);
      for (const p of core) {
        const b = 1 + Math.sin(t * 2.4 + p.x * 20) * 0.08;
        const [X, Y] = proj(CORE[0] + (p.x - CORE[0]) * b, CORE[1] + (p.y - CORE[1]) * b, CORE[2] + (p.z - CORE[2]) * b);
        tri(ctx, X, Y, p.s * DPR, p.rot + t * p.sp, p.c, (0.6 + 0.4 * pulse) * e);
      }

      // labels
      ctx.font = `600 ${12 * DPR}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      const drawLabel = (txt, X, Y, color, a, dir) => {
        if (a < 0.02) return;
        ctx.globalAlpha = a;
        const right = dir[0] > 0;
        const ox = dir[0] * 40 * DPR, oy = dir[1] * 22 * DPR;
        const label = txt.toUpperCase(), tw = ctx.measureText(label).width, pad = 6 * DPR;
        let ex = X + ox;
        if (right) ex = Math.min(ex, W - tw - pad * 2); else ex = Math.max(ex, tw + pad * 2);
        ctx.strokeStyle = color; ctx.lineWidth = 1 * DPR;
        ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + ox * 0.5, Y + oy); ctx.lineTo(ex, Y + oy); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X, Y, 2.5 * DPR, 0, 6.283); ctx.fill();
        ctx.textAlign = right ? 'left' : 'right';
        ctx.fillText(label, ex + (right ? pad : -pad), Y + oy);
      };
      // core label sits above the core
      ctx.globalAlpha = e; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
      ctx.fillText('CORE CONTEXT', CX, CY - 0.17 * S - 6 * DPR);
      REGIONS.forEach((R, i) => {
        const [X, Y] = proj(...R.p);
        drawLabel(R.name, X, Y, R.c, (reduce ? 0.85 : levels[i]) * e, R.L);
      });
      ctx.globalAlpha = 1;
    };
    requestAnimationFrame(frame);
  }

  /* ---------------- Road to Win: road bends into a W ---------------- */
  const roadCanvas = document.getElementById('roadWin');
  if (roadCanvas) {
    const { ctx, resize } = setup(roadCanvas);
    const small = window.innerWidth < 700;
    const N = small ? 160 : 260;          // samples along the road

    // Arc-length sampler for any polyline
    const sampler = (poly) => {
      const segs = []; let total = 0;
      for (let i = 0; i < poly.length - 1; i++) {
        const d = Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
        segs.push(d); total += d;
      }
      return u => {
        let target = u * total;
        for (let i = 0; i < segs.length; i++) {
          if (target <= segs[i] || i === segs.length - 1) {
            const k = segs[i] ? Math.min(1, target / segs[i]) : 0;
            return [poly[i][0] + (poly[i + 1][0] - poly[i][0]) * k, poly[i][1] + (poly[i + 1][1] - poly[i][1]) * k];
          }
          target -= segs[i];
        }
      };
    };
    // Road: a winding road rising from bottom-left into the distance top-right
    const roadPoly = [];
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      roadPoly.push([-0.85 + u * 1.7 + 0.12 * Math.sin(u * Math.PI * 3), 0.55 - u * 1.0 + 0.22 * Math.sin(u * Math.PI * 2.6)]);
    }
    // W: five strokes, slightly rounded at the joints so the road "bends" rather than snaps
    const Wv = [[-0.82, -0.5], [-0.44, 0.52], [0, -0.12], [0.44, 0.52], [0.82, -0.5]];
    const wPoly = [];
    for (let i = 0; i < Wv.length - 1; i++) {
      for (let k = 0; k < 40; k++) { const t = k / 40; wPoly.push([Wv[i][0] + (Wv[i + 1][0] - Wv[i][0]) * t, Wv[i][1] + (Wv[i + 1][1] - Wv[i][1]) * t]); }
    }
    wPoly.push(Wv[Wv.length - 1]);
    const roadAt = sampler(roadPoly), wAt = sampler(wPoly);
    const roadPts = Array.from({ length: N + 1 }, (_, i) => roadAt(i / N));
    const wPts = Array.from({ length: N + 1 }, (_, i) => wAt(i / N));

    // Particles riding on the road: edges, centre dashes, asphalt texture
    const parts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      parts.push({ i, off: -1, kind: 'edge', gold: Math.random(), c: PALETTE[(Math.random() * PALETTE.length) | 0], s: rand(1.5, 2.8), rot: rand(0, 6.28), sp: rand(-1, 1), j: gauss() * 0.06 });
      parts.push({ i, off: 1,  kind: 'edge', gold: Math.random(), c: PALETTE[(Math.random() * PALETTE.length) | 0], s: rand(1.5, 2.8), rot: rand(0, 6.28), sp: rand(-1, 1), j: gauss() * 0.06 });
      if (Math.floor(u * 34) % 2 === 0 && i % 2 === 0) parts.push({ i, off: 0, kind: 'dash', c: '#ffb829', s: rand(1.6, 2.4), rot: rand(0, 6.28), sp: rand(-1, 1), j: 0 });
      if (Math.random() < 0.55) parts.push({ i, off: rand(-0.8, 0.8), kind: 'fill', c: PALETTE[(Math.random() * PALETTE.length) | 0], s: rand(1, 1.8), rot: rand(0, 6.28), sp: rand(-1, 1), j: 0 });
    }

    let visible = false, appear = 0, last = performance.now();
    watchVisible(roadCanvas, v => visible = v);
    window.addEventListener('resize', resize);
    const easeInOut = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    const clamp01 = x => Math.max(0, Math.min(1, x));
    // Timeline (s): road drives -> bends into W -> hold "WIN" -> unbends
    const T_DRIVE = 3.0, T_BEND = 1.8, T_HOLD = 3.4, T_BACK = 1.4;
    const CYCLE = T_DRIVE + T_BEND + T_HOLD + T_BACK;
    let t0 = performance.now();

    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) return;
      appear = Math.min(1, appear + dt / 1.2);
      const e = reduce ? 1 : 1 - Math.pow(1 - appear, 3);
      const t = (now - t0) / 1000;
      const ct = reduce ? T_DRIVE + T_BEND + 1 : t % CYCLE;

      // morph amount m: 0 = road, 1 = W
      let m;
      if (ct < T_DRIVE) m = 0;
      else if (ct < T_DRIVE + T_BEND) m = easeInOut((ct - T_DRIVE) / T_BEND);
      else if (ct < T_DRIVE + T_BEND + T_HOLD) m = 1;
      else m = 1 - easeInOut((ct - T_DRIVE - T_BEND - T_HOLD) / T_BACK);
      const win = reduce ? 1 : clamp01((ct - T_DRIVE - T_BEND * 0.7) / 0.5) * (1 - clamp01((ct - T_DRIVE - T_BEND - T_HOLD) / 0.5));

      const W = roadCanvas.width, H = roadCanvas.height, S = Math.min(W, H) * 0.44;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1 * DPR;

      // centreline at current morph
      const P = new Array(N + 1);
      for (let i = 0; i <= N; i++) {
        const a = roadPts[i], b = wPts[i];
        P[i] = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m];
      }
      // road narrows with distance while it's a road, uniform once it's a W
      const width = i => { const u = i / N; return (0.085 - 0.05 * u) * (1 - m) + 0.06 * m; };
      const normal = i => {
        const a = P[Math.max(0, i - 3)], b = P[Math.min(N, i + 3)];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        return [-dy / L, dx / L];
      };
      const toScreen = (x, y) => [W / 2 + x * S, H / 2 + y * S];

      // amber glow once it reads as a W
      if (win > 0.01) {
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, S * 1.1);
        g.addColorStop(0, `rgba(255,184,41,${0.16 * win * e})`); g.addColorStop(1, 'rgba(255,184,41,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }

      // traveller position along the road (drives during the road phase, then rides the W)
      const carU = reduce ? 1 : clamp01(ct / (T_DRIVE + T_BEND * 0.9));
      const reveal = reduce ? 1 : clamp01(ct / 0.9);   // road draws in at the start of each loop

      for (const p of parts) {
        const u = p.i / N;
        if (u > reveal) continue;
        const [nx, ny] = normal(p.i), w = width(p.i);
        const x = P[p.i][0] + nx * w * p.off + nx * p.j * 0.03;
        const y = P[p.i][1] + ny * w * p.off + ny * p.j * 0.03;
        const [X, Y] = toScreen(x, y);
        const depth = (1 - m) * (1 - u * 0.55) + m;                     // fade into distance as a road
        const passed = u < carU ? 1 : 0.55;                              // road lights up behind the traveller
        let col = p.c, a;
        if (p.kind === 'edge') { a = 0.85 * depth * passed; if (p.gold < win * 0.55) col = '#ffb829'; }
        else if (p.kind === 'dash') { a = 0.95 * depth * (1 - m * 0.35); }
        else a = 0.28 * depth;
        tri(ctx, X, Y, p.s * DPR * (0.75 + 0.45 * depth + win * 0.3 * (p.kind === 'edge')), p.rot + t * p.sp * 0.5, col, a * e);
      }

      // traveller: a bright cluster with a short trail
      if (!reduce && carU < 1 && ct < T_DRIVE + T_BEND) {
        for (let k = 0; k < 10; k++) {
          const uu = Math.max(0, carU - k * 0.008), i = Math.round(uu * N);
          const [X, Y] = toScreen(P[i][0], P[i][1]);
          tri(ctx, X + gauss() * 2 * DPR, Y + gauss() * 2 * DPR, (4 - k * 0.3) * DPR, t * 5 + k, k ? '#8052ff' : '#ffffff', (1 - k / 10) * e);
        }
      }

      // label
      if (m < 0.05 && win < 0.02) {
        ctx.globalAlpha = 0.6 * e * clamp01((ct - 0.6) / 0.6);
        ctx.fillStyle = '#9a9a9a';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `600 ${12 * DPR}px Inter, system-ui, sans-serif`;
        ctx.fillText('THE ROAD TO WIN', W / 2, H / 2 + 0.78 * S);
      }
      ctx.globalAlpha = 1;
    };
    requestAnimationFrame(frame);
  }

  /* ---------------- Layer shapes ---------------- */
  const SHAPES = {
    sphere(n) { // single source of truth: dense sphere
      return Array.from({ length: n }, () => {
        const u = rand(0, 6.283), v = Math.acos(rand(-1, 1)), r = 0.8 * Math.cbrt(Math.random()) * 0.3 + 0.56;
        return { x: Math.sin(v) * Math.cos(u) * r, y: Math.cos(v) * r, z: Math.sin(v) * Math.sin(u) * r };
      });
    },
    path(n) { // road: winding ribbon
      return Array.from({ length: n }, () => {
        const k = Math.random(), a = k * Math.PI * 3;
        return { x: (k - 0.5) * 1.7, y: Math.sin(a) * 0.35 + gauss() * 0.05, z: Math.cos(a) * 0.4 + gauss() * 0.08 };
      });
    },
    grid(n) { // craft: structured lattice cube
      const g = 9, out = [];
      for (let i = 0; i < n; i++) {
        const q = () => (Math.round(rand(0, g - 1)) / (g - 1) - 0.5) * 1.2;
        out.push({ x: q() + gauss() * 0.008, y: q() + gauss() * 0.008, z: q() + gauss() * 0.008 });
      }
      return out;
    },
    burst(n) { // generation: three clusters emitting
      const c = [[-0.45, -0.25, 0], [0.45, -0.25, 0], [0, 0.45, 0]];
      return Array.from({ length: n }, () => {
        const k = c[(Math.random() * 3) | 0], r = Math.abs(gauss()) * 0.14;
        const u = rand(0, 6.283), v = Math.acos(rand(-1, 1));
        return { x: k[0] + Math.sin(v) * Math.cos(u) * r, y: k[1] + Math.cos(v) * r, z: k[2] + Math.sin(v) * Math.sin(u) * r };
      });
    },
    spiral(n) { // compounding: growing spiral
      return Array.from({ length: n }, () => {
        const k = Math.pow(Math.random(), 0.7), a = k * Math.PI * 7;
        const r = 0.08 + k * 0.75;
        return { x: Math.cos(a) * r + gauss() * 0.025, y: (k - 0.5) * 0.5 + gauss() * 0.03, z: Math.sin(a) * r + gauss() * 0.025 };
      });
    }
  };

  /* ---------------- Layer animations (same particles + renderer as SHAPES, they only move them) ---------------- */
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const easeIO = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const easeOut3 = x => 1 - Math.pow(1 - x, 3);
  const dirKey = ([x, y, z]) => { const r = Math.hypot(x, y, z) || 1; return Math.floor((Math.acos(y / r)) / Math.PI * 24) * 10 + (Math.atan2(z, x) + Math.PI) / (2 * Math.PI); };
  // Pair two point sets by rank of their direction, so every particle travels a short, coherent path
  const pairByDirection = (from, to) => {
    const a = from.map((p, i) => [dirKey(p), i]).sort((m, n) => m[0] - n[0]);
    const b = to.map((p, i) => [dirKey(p), i]).sort((m, n) => m[0] - n[0]);
    const out = new Array(from.length);
    a.forEach(([, i], k) => out[i] = to[b[k][1]]);
    return out;
  };
  const fib = (n, R) => Array.from({ length: n }, (_, i) => {
    const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    return [Math.cos(th) * r * R, y * R, Math.sin(th) * r * R];
  });
  const toLL = ([x, y, z]) => { const r = Math.hypot(x, y, z) || 1; return [Math.asin(-y / r), Math.atan2(z, x)]; };
  const fromLL = (lat, lon, R) => [Math.cos(lat) * Math.cos(lon) * R, -Math.sin(lat) * R, Math.cos(lat) * Math.sin(lon) * R];

  const ANIM = {
    /* Craft: each full revolution upgrades the shape. Cube -> sphere -> globe -> best globe */
    grid: {
      speed: 0.7,                                     // one revolution ~9s
      init(pts) {
        const R = 0.7, n = pts.length;
        const cube = pts.map(p => [p.x, p.y, p.z]);
        const sphere = pairByDirection(cube.map(c => Math.hypot(...c) < 0.05 ? [gauss(), gauss(), gauss()] : c), fib(n, R));
        // Globe: snap each sphere point to the nearest latitude / longitude line (every 30deg)
        const STEP = Math.PI / 6;
        const globe = sphere.map(p => {
          let [lat, lon] = toLL(p);
          const sLat = Math.round(lat / STEP) * STEP, sLon = Math.round(lon / STEP) * STEP;
          if (Math.abs(lat - sLat) < Math.abs(lon - sLon) * Math.cos(lat) && Math.abs(sLat) < Math.PI / 2 - 0.01) lat = sLat; else lon = sLon;
          return fromLL(lat + gauss() * 0.006, lon + gauss() * 0.006, R);
        });
        // Best globe: dense continents, a finer ocean grid, an orbit ring and an atmosphere
        const land = (lat, lon) => Math.sin(1.7 * lon + 0.4) * Math.cos(2.3 * lat) + 0.6 * Math.sin(3.1 * lon - 1.2 + 2 * lat) + 0.4 * Math.cos(5 * lat + 2.2 * lon) > 0.45;
        const landPool = [];
        while (landPool.length < n) {
          const u = rand(-1, 1), lon = rand(-Math.PI, Math.PI), lat = Math.asin(u);
          if (land(lat, lon)) landPool.push(fromLL(lat, lon, R));
        }
        const order = sphere.map((p, i) => [Math.abs(toLL(p)[0]), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
        const role = new Array(n);
        order.forEach((i, k) => role[i] = k < n * 0.16 ? 'ring' : (k % 5 < 3 ? 'land' : 'grid'));
        const landIdx = [], best = new Array(n);
        sphere.forEach((p, i) => {
          if (role[i] === 'ring') { const [, lon] = toLL(p); const rr = R * rand(1.42, 1.5); best[i] = [Math.cos(lon) * rr, gauss() * 0.006, Math.sin(lon) * rr]; }
          else if (role[i] === 'grid') {
            const F = Math.PI / 12; let [lat, lon] = toLL(p);
            const sLat = Math.round(lat / F) * F, sLon = Math.round(lon / F) * F;
            if (Math.abs(lat - sLat) < Math.abs(lon - sLon) * Math.cos(lat)) lat = sLat; else lon = sLon;
            best[i] = fromLL(lat, lon, R * 1.005);
          } else landIdx.push(i);
        });
        const landT = pairByDirection(landIdx.map(i => sphere[i]), landPool.slice(0, landIdx.length));
        landIdx.forEach((i, k) => best[i] = landT[k]);
        pts.forEach((p, i) => {
          p.st = [cube[i], sphere[i], globe[i], best[i]];
          p.role = role[i];
          p.delay = (p.y + 0.6) / 1.2 * 0.6;             // morph sweeps top to bottom
        });
      },
      // revolution -> stage. Holds the best globe for two turns, then starts again from the cube
      SEQ: [0, 1, 2, 3, 3],
      update(pts, T) {
        const rev = T * this.speed / (2 * Math.PI), r = Math.floor(rev), f = (rev - r) * (2 * Math.PI) / this.speed;
        const cur = this.SEQ[r % this.SEQ.length], prev = r === 0 ? 0 : this.SEQ[(r - 1) % this.SEQ.length];
        const MORPH = 1.9;
        let bestness = 0;
        for (const p of pts) {
          const k = prev === cur ? 1 : easeIO(clamp01((f - p.delay) / MORPH));
          const a = p.st[prev], b = p.st[cur], puff = 1 + Math.sin(Math.PI * k) * 0.12;
          p.x = (a[0] + (b[0] - a[0]) * k) * puff; p.y = (a[1] + (b[1] - a[1]) * k) * puff; p.z = (a[2] + (b[2] - a[2]) * k) * puff;
          const w3 = (prev === 3 ? 1 - k : 0) + (cur === 3 ? k : 0);
          p.boost = p.role === 'grid' ? 1 - 0.45 * w3 : p.role === 'land' ? 1 + 0.25 * w3 : 1;
          p.amber = p.role === 'ring' ? w3 : 0;
          bestness = Math.max(bestness, w3);
        }
        return { glow: bestness };
      },
      final(pts) { for (const p of pts) { [p.x, p.y, p.z] = p.st[3]; p.boost = p.role === 'grid' ? 0.55 : p.role === 'land' ? 1.25 : 1; p.amber = p.role === 'ring' ? 1 : 0; } return { glow: 1 }; },
    },

    /* Generation: three balls; one by one they become a handshake (deals), $ (campaigns), a social icon (content) */
    burst: {
      CENTERS: [[-0.45, -0.25], [0.45, -0.25], [0, 0.45]],
      LABELS: ['DEALS', 'CAMPAIGNS', 'CONTENT'],
      // Line icons (24-unit SVG paths, Lucide-style, ISC licence). Stroked offscreen, then sampled as particles.
      ICONS: [
        'HANDSHAKE',                                                                                         // handshake: traced from the client's reference
        ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],                                 // dollar
        ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3', 'M8 22h8'],   // microphone
      ],
      sample(paths, n) {
        const N = 240, c = document.createElement('canvas'); c.width = c.height = N;
        const g = c.getContext('2d'), k = N / 24;
        g.setTransform(k, 0, 0, k, 0, 0);
        g.lineWidth = 1.7; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#fff';
        for (const d of paths) g.stroke(new Path2D(d));
        const data = g.getImageData(0, 0, N, N).data, on = [];
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (data[(y * N + x) * 4 + 3] > 140) on.push([x / N - 0.5, y / N - 0.5]);
        return Array.from({ length: n }, () => { const q = on[(Math.random() * on.length) | 0]; return [q[0] + gauss() * 0.003, q[1] + gauss() * 0.003]; });
      },
      // Handshake outline traced from the client's reference illustration (normalised -0.5..0.5)
      HANDSHAKE: [[0.212,-0.17],[0.248,-0.196],[0.031,0.244],[-0.317,0.044],[-0.25,0.125],[0.298,0.073],[-0.076,-0.085],[0.017,0.239],[0.069,0.244],[-0.131,0.106],[-0.255,-0.196],[-0.269,-0.18],[0.307,0.068],[-0.112,-0.185],[0.388,-0.051],[-0.398,-0.056],[0.021,-0.227],[0.379,0.049],[0.35,0.063],[0.402,-0.027],[-0.298,-0.211],[0.279,0.12],[-0.398,-0.061],[-0.131,-0.192],[0.021,0.235],[-0.107,0.13],[0.386,-0.032],[0.407,0.035],[0.06,-0.194],[0.417,0.03],[0.221,-0.156],[-0.321,0.044],[0.188,0.12],[-0.24,0.077],[-0.183,0.106],[-0.088,0.03],[0.131,-0.192],[0.183,-0.17],[-0.221,-0.18],[-0.188,0.13],[-0.036,0.035],[-0.288,0.044],[0.288,-0.023],[0.212,0.039],[-0.098,0.12],[0.121,0.03],[-0.345,0.054],[-0.129,0.206],[-0.036,-0.142],[0.412,0.044],[0.479,0.054],[-0.379,-0.004],[-0.2,0.123],[0.402,-0.004],[0.093,0.23],[-0.245,0.125],[-0.007,0.163],[0.379,-0.056],[0.145,0.225],[0.148,-0.008],[-0.274,-0.156],[0.14,-0.18],[-0.231,0.096],[0.14,-0.037],[-0.064,0.211],[0.369,0.054],[-0.336,-0.18],[0.231,0.144],[0.226,0.144],[0.193,0.02],[0.102,-0.046],[0.174,-0.18],[0.421,0.063],[-0.112,0.13],[0.493,0.054],[-0.079,-0.08],[0.293,0.054],[-0.388,-0.237],[-0.321,-0.22],[0.205,-0.165],[-0.312,-0.085],[-0.055,0.135],[-0.083,0.12],[-0.088,-0.013],[0.302,0.077],[0.36,-0.089],[0.398,-0.013],[0.155,-0.185],[-0.417,0.006],[-0.145,-0.187],[0.198,0.192],[0.212,0.154],[-0.098,-0.199],[0.321,-0.237],[-0.307,-0.208],[0.069,-0.07],[-0.112,0.139],[-0.064,0.13],[0.15,-0.044],[0.0,-0.177],[-0.045,-0.227],[0.012,-0.185],[0.298,0.068],[-0.074,0.225],[-0.093,-0.027],[0.002,0.225],[0.298,0.063],[-0.055,0.039],[0.012,0.235],[0.074,-0.189],[0.24,0.054],[0.012,-0.227],[-0.131,-0.175],[-0.288,-0.123],[-0.155,-0.175],[-0.131,0.168],[0.04,-0.223],[-0.369,-0.242],[-0.245,0.087],[-0.36,-0.142],[-0.045,-0.218],[0.307,-0.227],[0.269,0.077],[0.036,0.139],[-0.117,-0.189],[0.145,0.096],[0.214,-0.151],[-0.188,0.12],[0.179,-0.037],[0.345,0.068],[-0.036,0.254],[-0.121,0.115],[0.302,-0.194],[-0.426,0.073],[0.026,0.239],[0.112,0.158],[-0.007,-0.027],[0.226,0.154],[0.055,-0.22],[0.483,0.068],[0.107,0.011],[0.24,-0.127],[0.179,-0.004],[0.298,0.02],[-0.079,0.12],[0.426,0.058],[-0.426,0.03],[0.136,0.173],[-0.5,0.054],[0.169,0.096],[0.231,-0.189],[0.236,-0.189],[0.002,0.201],[-0.398,-0.08],[-0.231,0.087],[0.136,0.215],[0.131,0.073],[0.012,0.239],[0.179,0.192],[0.121,-0.194],[0.207,0.158],[0.05,0.187],[0.136,0.087],[0.155,-0.037],[0.107,0.154],[-0.098,0.22],[0.05,-0.204],[-0.317,0.058],[0.174,-0.004],[-0.117,0.125],[0.279,-0.018],[0.198,0.011],[0.012,0.227],[0.112,-0.189],[-0.012,0.249],[0.255,-0.189],[0.145,0.087],[0.04,0.073],[-0.302,0.049],[-0.431,0.035],[-0.317,0.035],[-0.083,-0.065],[-0.321,-0.013],[0.374,-0.07],[-0.331,-0.189],[-0.202,0.106],[-0.188,0.163],[-0.083,0.011],[0.114,0.065],[0.136,0.165],[0.155,-0.008],[0.212,0.139],[-0.16,0.089],[0.069,-0.204],[0.126,0.073],[-0.017,-0.227],[-0.174,-0.18],[-0.307,-0.099],[-0.407,-0.061],[-0.245,-0.192],[0.336,0.073],[-0.026,-0.142],[-0.16,0.18],[-0.198,0.115],[0.002,-0.237],[0.133,0.22],[0.107,-0.185],[0.05,-0.065],[0.002,-0.17],[-0.431,0.054],[-0.021,0.244],[-0.236,0.139],[0.226,0.039],[0.412,-0.018],[-0.455,0.077],[0.126,-0.18],[0.04,-0.218],[0.055,-0.199],[0.35,-0.113],[-0.05,0.244],[0.074,-0.199],[-0.383,-0.246],[0.169,0.101],[0.212,-0.165],[0.331,-0.146],[-0.017,0.254],[0.281,-0.004],[-0.39,-0.099],[-0.093,0.22],[-0.083,-0.194],[0.269,-0.056],[-0.131,0.196],[-0.379,-0.013],[0.102,0.235],[-0.293,-0.123],[-0.164,0.096],[0.226,-0.175],[-0.121,0.173],[-0.231,0.144],[0.217,-0.175],[-0.079,0.039],[0.169,0.187],[-0.012,0.163],[0.188,0.187],[-0.045,0.163],[-0.398,0.03],[-0.083,-0.204],[0.452,0.065],[-0.031,-0.223],[0.326,-0.165],[0.088,-0.189],[0.226,-0.146],[0.083,-0.075],[0.188,0.115],[-0.281,-0.163],[-0.36,-0.237],[-0.098,-0.004],[-0.04,-0.227],[0.236,0.149],[-0.083,0.044],[0.026,0.244],[0.231,0.149],[0.145,0.182],[0.083,0.235],[-0.412,-0.046],[-0.055,0.182],[0.045,0.065],[-0.117,0.13],[0.343,0.015],[-0.079,0.23],[0.333,0.056],[0.307,-0.189],[-0.036,0.244],[0.226,0.049],[-0.307,-0.089],[-0.083,0.22],[0.169,-0.013],[0.021,-0.185],[-0.364,0.054],[-0.398,0.039],[0.269,0.12],[-0.024,-0.006],[-0.102,0.125],[-0.098,0.015],[-0.021,0.163],[-0.407,-0.056],[-0.379,0.039],[-0.298,0.049],[-0.055,0.192],[0.369,0.058],[0.15,-0.037],[0.16,0.192],[-0.321,-0.037],[-0.131,0.096],[0.221,-0.18],[-0.164,0.106],[-0.24,0.144],[0.05,0.192],[0.002,-0.051],[-0.355,-0.146],[-0.121,0.125],[0.131,-0.185],[0.055,0.075],[0.212,0.023],[0.017,-0.237],[0.288,0.035],[0.06,-0.199],[0.293,0.058],[-0.236,-0.185],[0.064,0.254],[0.093,0.13],[-0.155,0.187],[-0.226,0.144],[-0.06,0.206],[0.352,0.049],[-0.074,-0.07],[0.25,-0.194],[-0.038,-0.144],[-0.279,-0.199],[0.24,-0.118],[0.045,0.177],[-0.274,0.058],[0.107,0.139],[-0.136,0.096],[-0.324,-0.051],[0.15,0.206],[0.183,-0.18],[-0.25,0.077],[-0.126,0.187],[0.393,0.044],[-0.274,-0.165],[-0.35,0.02],[0.283,-0.004],[-0.388,0.011],[-0.083,-0.027],[-0.405,-0.068],[-0.217,-0.185],[0.055,-0.194],[-0.379,0.049],[0.245,0.154],[0.055,0.258],[-0.317,-0.07],[0.202,-0.17],[-0.312,-0.061],[-0.417,0.035],[0.126,0.035],[0.05,-0.208],[0.136,0.082],[-0.324,-0.046],[0.062,0.092],[-0.326,-0.004],[0.088,0.211],[-0.307,0.049],[0.093,0.213],[0.283,0.073],[-0.326,-0.223],[-0.217,0.106],[0.469,0.068],[-0.269,-0.199],[-0.331,0.058],[0.393,-0.046],[0.16,-0.032],[0.474,0.068],[-0.188,-0.18],[0.355,-0.104],[-0.04,-0.223],[-0.119,0.13],[0.093,0.225],[0.269,0.135],[-0.06,0.211],[-0.121,0.187],[-0.179,0.168],[0.193,-0.17],[0.345,-0.137],[0.25,0.056],[-0.031,-0.146],[0.345,-0.146],[0.283,-0.042],[-0.357,0.023],[-0.119,0.139],[0.355,-0.118],[-0.414,-0.044],[0.207,-0.161],[0.436,0.077],[0.155,0.192],[-0.402,-0.065],[-0.088,-0.051],[0.429,0.077],[-0.388,-0.085],[0.226,-0.156],[0.04,-0.065],[0.107,-0.051],[-0.236,0.092],[-0.179,0.177],[0.417,0.025],[-0.379,-0.232],[-0.24,0.135],[0.302,-0.213],[-0.307,-0.094],[-0.093,0.13],[0.488,0.058],[-0.088,0.12],[-0.174,0.17],[0.117,-0.185],[0.131,-0.037],[0.412,0.054],[0.483,0.058],[0.302,-0.204],[0.179,-0.027],[0.026,0.249],[0.15,0.175],[0.202,0.149],[0.34,-0.146],[0.393,0.035],[-0.15,0.089],[0.326,-0.156],[0.138,-0.018],[-0.136,0.101],[0.293,0.015],[0.255,-0.085],[-0.064,-0.213],[0.15,0.225],[0.202,0.139],[-0.212,0.101],[0.14,0.235],[-0.431,0.049],[-0.331,-0.004],[0.021,-0.218],[-0.174,-0.175],[0.15,0.087],[-0.202,-0.175],[0.293,-0.204],[-0.145,0.106],[0.326,0.058],[0.119,0.073],[0.112,-0.194],[0.021,-0.18],[-0.388,0.006],[0.117,0.225],[0.14,0.092],[0.107,-0.194],[0.121,0.068],[0.088,0.139],[0.026,0.127],[0.126,0.156],[0.079,-0.077],[0.421,0.058],[-0.098,0.006],[0.036,-0.23],[0.231,-0.18],[-0.069,0.039],[0.15,-0.008],[0.14,-0.042],[-0.236,-0.175],[-0.126,0.111],[0.021,-0.061],[-0.002,-0.161],[0.207,0.127],[0.255,-0.104],[0.007,0.22],[-0.102,-0.204],[0.374,-0.075],[-0.298,-0.118],[-0.131,-0.18],[0.379,0.044],[-0.169,0.175],[-0.06,0.196],[0.15,-0.013],[-0.124,0.12],[-0.307,-0.075],[-0.488,0.058],[0.043,0.065],[-0.045,0.237],[-0.181,0.094],[-0.36,-0.223],[-0.074,0.12],[0.269,-0.085],[-0.117,0.115],[0.336,0.03],[0.255,0.082],[0.236,-0.127],[0.169,0.201],[-0.302,0.039],[0.276,-0.027],[0.079,0.206],[-0.002,-0.227],[-0.107,0.213],[-0.393,0.015],[-0.007,-0.018],[-0.024,-0.004],[0.274,0.12],[0.04,-0.056],[0.126,0.158],[0.14,-0.185],[0.336,-0.132],[-0.193,0.12],[0.088,-0.185],[-0.264,0.082],[-0.312,-0.07],[0.364,-0.099],[-0.074,-0.051],[-0.124,-0.194],[-0.293,-0.132],[-0.14,0.182],[0.293,0.001],[0.226,-0.185],[-0.34,-0.218],[0.143,0.196],[-0.136,0.187],[-0.15,0.182],[-0.34,-0.175],[0.04,0.192],[0.288,-0.194],[0.179,0.115],[0.007,0.187],[-0.383,0.049],[-0.112,0.211],[-0.064,-0.208],[-0.345,0.063],[-0.26,0.058],[0.14,0.23],[0.288,0.082],[-0.098,-0.194],[0.345,-0.149],[-0.188,0.144],[0.169,0.001],[-0.255,0.077],[-0.036,0.025],[-0.083,-0.013],[0.345,-0.127],[0.288,0.02],[-0.217,0.092],[0.021,-0.189],[0.045,-0.065],[-0.402,-0.258],[-0.081,-0.073],[0.012,0.12],[0.293,0.011],[0.279,0.111],[-0.088,-0.004],[-0.06,0.23],[-0.321,-0.042],[-0.079,-0.037],[-0.421,0.02],[-0.407,-0.037],[0.045,-0.18],[-0.367,0.006],[0.188,0.011],[-0.498,0.049],[-0.05,0.201],[-0.05,0.158],[-0.236,-0.189],[0.126,0.068],[-0.24,0.082],[-0.236,0.087],[-0.026,0.025],[0.388,0.044],[-0.198,0.111],[0.298,0.044],[0.34,-0.242],[0.24,0.144],[-0.036,0.015],[0.145,-0.013],[0.34,0.073],[0.35,-0.123],[-0.19,0.168],[0.076,0.22],[0.355,0.025],[0.345,-0.132],[0.217,-0.161],[0.369,-0.075],[-0.236,0.135],[-0.119,0.135],[-0.079,-0.061],[0.179,0.106],[-0.026,-0.223],[0.131,0.177],[0.136,-0.042],[-0.436,0.068],[0.255,-0.199],[0.367,-0.075],[0.398,-0.018],[-0.388,-0.089],[0.136,0.22],[0.16,0.182],[0.274,0.077],[0.264,0.13],[-0.302,0.044],[0.107,0.144],[-0.436,0.077],[0.198,0.187],[0.255,0.149],[-0.083,0.035],[-0.145,-0.185],[-0.121,-0.194],[-0.326,-0.189],[0.419,0.063],[0.383,0.037],[-0.088,-0.008],[0.16,-0.027],[0.221,0.035],[-0.338,-0.189],[-0.15,0.101],[-0.431,0.063],[-0.474,0.068],[0.179,0.187],[0.098,0.139],[0.279,0.125],[0.188,0.02],[0.074,-0.061],[-0.293,0.044],[-0.321,0.025],[0.298,-0.185],[0.25,-0.108],[-0.029,0.006],[0.012,-0.232],[0.274,-0.077],[0.031,0.13],[0.183,0.192],[0.198,-0.035],[0.064,-0.208],[-0.193,-0.175],[0.269,-0.08],[0.102,0.015],[-0.088,-0.042],[-0.212,-0.182],[-0.093,0.015],[0.326,-0.146],[-0.319,-0.075],[-0.336,-0.175],[-0.383,-0.113],[0.131,0.163],[-0.088,0.22],[-0.169,0.187],[0.236,0.042],[-0.026,0.001],[-0.107,0.225],[0.036,0.177],[0.305,-0.232],[0.355,-0.099],[-0.421,0.015],[-0.093,0.125],[0.145,0.187],[-0.036,-0.227],[0.136,-0.027],[0.238,0.063],[-0.207,-0.175],[-0.126,0.115],[0.05,-0.194],[0.16,0.201],[-0.362,-0.154],[-0.264,-0.165],[-0.398,-0.07],[0.136,-0.192],[-0.231,0.092],[-0.04,-0.127],[-0.345,-0.227],[0.06,-0.075],[0.24,-0.132],[0.388,0.049],[-0.279,-0.165],[0.06,0.201],[0.05,0.196],[-0.121,0.201],[-0.09,0.035],[0.14,0.206],[0.455,0.068],[-0.112,0.123],[0.145,0.192],[0.007,0.115],[0.117,-0.051],[0.088,0.235],[0.369,-0.07],[0.479,0.058],[0.26,0.065],[0.4,0.001],[0.017,0.13],[0.402,0.001],[0.34,0.058],[-0.488,0.063],[-0.079,-0.051],[-0.121,0.211],[0.05,0.182],[-0.302,-0.118],[-0.133,0.173],[0.045,0.244],[0.412,0.02],[-0.179,0.111],[0.398,0.035],[-0.183,0.101],[-0.088,0.011],[0.045,0.077],[0.293,-0.013],[-0.312,-0.08],[0.231,0.054],[-0.493,0.054],[-0.279,-0.156],[0.045,-0.07],[0.252,-0.199],[-0.336,-0.194],[-0.455,0.082],[-0.212,0.096],[0.007,0.244],[-0.326,-0.204],[0.336,-0.246],[-0.407,-0.018],[0.136,0.177],[0.274,-0.065],[-0.262,0.125],[0.221,0.03],[-0.288,-0.118],[-0.05,0.192],[0.012,-0.056],[-0.271,-0.18],[0.24,0.149],[0.212,0.135],[0.102,-0.056],[-0.312,0.049],[0.231,-0.146],[0.369,-0.089],[0.321,0.061],[0.34,0.068],[-0.307,-0.061],[-0.121,0.192],[-0.002,-0.023],[0.421,0.015],[-0.326,-0.185],[0.302,0.054],[-0.343,-0.182],[-0.05,-0.118],[-0.25,0.073],[0.317,-0.189],[0.307,-0.18],[0.288,0.03],[-0.017,-0.165],[-0.393,-0.061],[-0.326,0.03],[-0.255,-0.194],[0.007,0.206],[0.107,0.158],[0.345,-0.246],[0.188,-0.17],[0.155,0.18],[-0.317,-0.008],[0.021,0.13],[-0.317,-0.218],[-0.026,-0.137],[-0.412,0.039],[0.288,0.073],[-0.083,-0.208],[-0.364,0.049],[-0.369,-0.232],[0.002,-0.032],[0.279,-0.204],[0.117,-0.037],[0.1,0.008],[0.245,-0.194],[0.136,-0.18],[-0.083,-0.051],[0.331,0.025],[-0.031,0.254],[0.093,-0.196],[0.202,-0.03],[0.017,-0.18],[0.021,0.232],[0.267,0.12],[0.417,0.054],[0.293,0.044],[-0.176,0.092],[0.064,-0.211],[-0.369,-0.227],[-0.198,0.12],[-0.355,-0.142],[-0.126,0.163],[-0.364,0.046],[-0.35,0.063],[-0.198,0.154],[-0.226,0.139],[0.217,-0.18],[0.345,-0.232],[0.055,-0.065],[0.364,0.001],[-0.074,0.039],[0.036,-0.051],[-0.074,0.215],[-0.355,-0.161],[0.26,-0.08],[-0.421,0.006],[0.312,0.068],[0.369,-0.08],[0.212,0.13],[0.355,-0.113],[-0.026,0.154],[-0.098,-0.013],[-0.226,0.085],[0.164,-0.004],[0.412,0.006],[0.036,-0.218],[0.26,-0.089],[0.145,-0.023],[0.288,-0.018],[0.34,-0.237],[-0.188,0.106],[0.398,-0.023],[0.193,0.177],[0.031,0.237],[0.102,0.225],[0.207,0.177],[-0.474,0.058],[-0.05,0.168],[-0.279,-0.142],[-0.283,-0.161],[0.031,0.182],[-0.021,0.154],[-0.26,-0.175],[-0.302,-0.089],[0.15,0.08],[-0.331,0.006],[-0.195,0.158],[0.217,0.154],[0.374,0.049],[-0.179,-0.175],[0.1,0.154],[0.029,0.173],[-0.093,-0.189],[0.098,0.149],[0.131,-0.042],[0.126,0.077],[-0.15,0.096],[-0.045,0.158],[-0.06,-0.104],[0.367,0.042],[0.04,-0.185],[-0.236,0.077],[-0.155,0.101],[0.26,0.144],[0.055,-0.061],[-0.169,0.177],[0.036,0.244],[0.298,-0.223],[-0.412,0.03],[0.362,0.006],[0.026,0.135],[0.317,-0.223],[-0.15,-0.185],[0.236,-0.185],[-0.371,0.013],[0.002,0.235],[0.302,-0.18],[-0.007,0.244],[0.283,-0.204],[0.198,0.135],[-0.35,-0.151],[-0.095,-0.023],[-0.052,0.177],[-0.031,-0.137],[0.026,-0.061],[0.117,0.154],[-0.321,0.035],[-0.15,-0.187],[0.26,0.082],[0.305,-0.175],[0.112,0.144],[-0.188,0.101],[-0.26,0.092],[-0.283,-0.137],[0.112,0.225],[0.267,0.106],[0.293,-0.008],[-0.236,0.132],[-0.426,0.039],[-0.079,0.125],[0.074,-0.075],[0.198,0.125],[0.169,-0.032],[0.36,-0.094],[-0.04,0.244],[0.293,-0.02],[0.188,0.125],[0.145,0.196],[-0.312,-0.208],[-0.283,0.044],[-0.321,0.049],[0.05,-0.199],[-0.34,-0.213],[0.267,0.115],[-0.031,-0.132],[-0.379,-0.113],[0.017,-0.063],[-0.05,0.035],[-0.383,-0.237],[-0.055,-0.108],[0.25,-0.104],[-0.269,-0.161],[-0.407,0.035],[0.326,0.077],[0.274,0.13],[-0.329,-0.027],[-0.35,0.054],[-0.383,-0.008],[0.102,0.139],[-0.06,-0.099],[-0.002,0.177],[-0.183,0.177],[-0.279,0.049],[-0.417,0.039],[-0.412,-0.004],[-0.307,-0.08],[0.126,-0.046],[0.102,0.011],[0.269,0.092],[-0.312,-0.094],[-0.357,-0.161],[0.431,0.063],[-0.326,0.025],[-0.407,-0.051],[0.264,0.068],[0.364,0.015],[0.274,-0.199],[-0.188,0.168],[-0.326,-0.037],[-0.04,-0.132],[0.06,0.246],[0.407,0.049],[0.493,0.051],[0.102,-0.051],[-0.117,0.144],[-0.255,0.106],[0.15,0.215],[-0.255,-0.189],[0.317,-0.161],[-0.302,-0.213],[0.074,-0.185],[-0.06,0.235],[-0.088,-0.018],[0.102,-0.194],[0.064,-0.07],[0.045,0.182],[-0.283,-0.156],[-0.407,-0.256],[0.031,0.249],[-0.35,-0.223],[0.007,-0.165],[0.245,0.054],[0.188,-0.027],[0.326,-0.244],[-0.055,-0.218],[-0.317,-0.213],[0.04,0.068],[0.293,0.035],[-0.093,-0.023],[0.055,0.187],[0.207,0.035],[0.007,-0.175],[-0.364,-0.146],[0.26,-0.199],[-0.04,0.025],[0.0,-0.082],[0.321,-0.242],[-0.017,0.011],[0.255,0.073],[0.374,-0.08],[0.074,-0.194],[0.002,-0.223],[0.264,-0.204],[0.317,-0.239],[-0.05,0.23],[0.198,0.015],[0.421,0.03],[0.264,0.082],[0.231,-0.185],[0.06,-0.213],[-0.388,-0.246],[0.393,0.039],[0.038,-0.068],[0.126,0.163],[-0.26,0.087],[-0.314,-0.085],[-0.112,0.125],[0.048,0.082],[-0.052,0.032],[0.407,-0.03],[-0.012,0.001],[-0.383,-0.004],[0.252,-0.089],[-0.183,0.173],[-0.274,-0.17],[-0.212,-0.17],[-0.26,-0.194],[0.121,-0.185],[0.36,0.049],[0.417,0.049],[-0.279,-0.189],[0.074,-0.08],[-0.29,-0.146],[0.145,-0.037],[0.293,0.025],[0.202,0.123],[-0.405,-0.246],[0.255,-0.089],[0.002,0.187],[0.238,-0.118],[-0.002,0.168],[0.021,0.244],[-0.021,-0.227],[0.15,0.177],[0.069,-0.185],[-0.045,0.192],[0.036,-0.223],[0.05,-0.07],[-0.026,-0.227],[0.088,-0.056],[-0.431,0.03],[-0.35,-0.156],[-0.331,0.039],[0.345,-0.123],[0.14,0.187],[0.179,-0.032],[0.364,-0.08],[0.164,-0.027],[-0.245,-0.189],[0.369,-0.104],[0.264,0.125],[0.274,0.082],[0.331,0.03],[-0.44,0.082],[0.35,-0.118],[0.102,-0.185],[0.255,-0.115],[0.131,0.07],[-0.393,0.035],[0.081,0.127],[-0.388,0.037],[-0.445,0.082],[-0.069,-0.089],[0.467,0.058],[-0.079,0.025],[0.057,-0.077],[0.145,-0.018],[0.05,0.18],[-0.369,0.02],[0.107,-0.196],[0.007,-0.042],[0.164,0.196],[-0.388,0.044],[-0.298,-0.132],[0.131,0.025],[0.031,0.139],[0.274,0.092],[-0.331,0.049],[0.369,-0.108],[-0.321,0.03],[0.174,0.192],[0.217,0.163],[-0.09,-0.049],[0.317,-0.18],[0.16,0.187],[-0.05,0.196],[-0.493,0.063],[0.012,0.113],[-0.224,-0.17],[-0.045,0.177],[0.188,0.113],[0.198,0.173],[0.283,-0.208],[-0.264,-0.17],[0.026,-0.063],[0.393,-0.032],[0.055,0.196],[-0.16,0.187],[0.117,-0.194],[-0.15,0.092],[-0.493,0.049],[0.402,-0.032],[0.15,-0.18],[0.169,-0.037],[0.264,0.096],[-0.264,0.056],[-0.131,0.192],[0.314,-0.165],[0.355,-0.127],[-0.06,-0.089],[-0.279,-0.161],[0.174,-0.027],[0.112,0.008],[-0.355,-0.137],[0.031,-0.189],[-0.381,-0.232],[-0.312,-0.075],[-0.383,-0.251],[-0.002,-0.165],[0.14,0.201],[-0.345,-0.18],[-0.424,-0.013],[0.243,-0.108],[-0.333,0.015],[-0.421,-0.018],[0.079,0.254],[-0.16,-0.175],[0.281,-0.008],[-0.426,0.049],[0.164,0.106],[0.245,-0.123],[-0.019,0.173],[0.06,-0.185],[-0.069,-0.08],[-0.005,-0.175],[0.331,0.073],[0.417,0.006],[0.41,0.025],[0.031,-0.175],[0.338,-0.127],[0.298,0.025],[0.255,0.077],[-0.321,0.001],[0.069,0.196],[0.102,0.144],[0.112,0.149],[0.383,-0.061],[0.031,-0.056],[-0.06,-0.218],[0.383,-0.082],[0.286,0.035],[0.04,-0.208],[-0.436,0.054],[0.212,0.149],[0.05,-0.218],[-0.331,0.054],[0.207,0.182],[-0.398,-0.256],[-0.326,0.063],[-0.045,0.168],[0.407,0.044],[0.15,-0.189],[-0.021,0.158],[-0.007,-0.223],[0.245,-0.13],[-0.398,-0.065],[0.043,-0.07],[-0.093,0.001],[0.117,0.23],[-0.183,-0.18],[0.045,0.068],[0.288,-0.208],[0.364,-0.094],[0.298,0.039],[0.064,0.196],[0.179,-0.18],[-0.012,-0.161],[0.25,0.139],[0.283,0.106],[-0.057,0.035],[-0.133,0.17],[0.04,-0.18],[-0.364,-0.227],[0.124,0.077],[0.302,-0.206],[0.002,0.215],[-0.231,0.082],[0.017,-0.185],[-0.25,-0.194],[-0.464,0.068],[0.229,-0.189],[-0.062,0.201],[-0.052,0.175],[-0.088,0.235],[0.183,0.115],[0.455,0.073],[-0.245,0.082],[0.164,-0.18],[0.293,0.063],[0.002,0.192],[-0.433,0.03],[0.364,-0.104],[-0.036,-0.132],[-0.26,-0.199],[0.26,-0.104],[-0.355,0.025],[0.279,-0.023],[-0.36,-0.239],[-0.207,0.144],[0.326,-0.151],[-0.017,-0.146],[-0.05,0.187],[0.25,-0.118],[-0.417,-0.023],[0.379,-0.075],[0.14,-0.018],[0.371,-0.065],[0.286,0.015],[-0.021,0.011],[0.245,-0.108],[0.079,0.204],[-0.129,0.115],[-0.045,-0.118],[0.264,0.077],[-0.193,0.149],[0.04,0.177],[0.383,-0.037],[-0.298,-0.104],[0.426,0.035],[0.06,-0.065],[-0.421,0.039],[-0.183,0.115],[0.288,0.077],[-0.117,0.111],[-0.06,-0.208],[-0.055,-0.123],[0.164,0.201],[0.098,0.23],[0.045,-0.225],[0.145,-0.189],[0.283,0.077],[0.412,-0.008],[-0.24,0.087],[-0.088,-0.204],[0.217,0.035],[0.283,0.011],[-0.355,0.02],[-0.174,0.177],[-0.136,0.111],[0.031,0.254],[0.388,0.039],[-0.083,0.23],[-0.202,0.115],[-0.407,-0.027],[-0.136,-0.189],[0.045,-0.223],[-0.16,0.182],[0.436,0.063],[-0.093,-0.008],[0.121,0.073],[0.221,0.154],[-0.245,0.07],[-0.062,0.139],[0.074,0.201],[0.283,-0.051],[-0.302,-0.085],[0.04,0.242],[0.262,0.125],[-0.321,0.054],[-0.295,0.054],[0.179,0.001],[-0.019,-0.163],[-0.093,0.225],[0.412,0.035],[0.14,-0.023],[0.021,0.135],[0.21,0.039],[0.279,-0.065],[0.388,-0.027],[-0.145,0.192],[-0.24,-0.189],[-0.026,0.173],[-0.074,-0.208],[-0.255,0.087],[0.188,0.196],[-0.017,-0.232],[0.012,0.211],[0.379,-0.089],[-0.433,0.035],[0.407,-0.008],[0.183,0.02],[-0.081,-0.07],[0.202,0.182],[-0.121,0.196],[-0.298,0.037],[0.002,-0.042],[-0.031,-0.232],[0.321,-0.175],[0.336,0.063],[-0.06,0.201],[-0.069,0.215],[-0.388,-0.094],[0.331,-0.168],[-0.35,0.025],[0.333,-0.246],[0.36,0.054],[-0.231,0.135],[0.119,0.03],[0.364,-0.108],[0.274,-0.037],[0.093,-0.194],[0.245,0.063],[-0.262,0.08],[-0.374,-0.118],[0.074,-0.07],[0.288,0.039],[0.407,-0.023],[-0.412,-0.018],[-0.069,-0.218],[-0.05,0.154],[0.117,0.025],[-0.164,0.192],[-0.326,0.02],[-0.317,-0.037],[0.221,0.044],[0.26,-0.189],[-0.055,0.144],[-0.183,0.168],[0.402,-0.037],[-0.426,0.044],[-0.012,-0.018],[0.364,0.058],[0.071,0.237],[0.369,0.042],[0.107,0.23],[0.421,0.025],[-0.026,0.006],[-0.145,0.092],[0.393,-0.023],[0.06,0.08],[-0.083,-0.056],[-0.088,0.035],[0.34,-0.246],[0.421,0.011],[-0.293,-0.113],[-0.031,0.02],[-0.407,0.027],[0.102,0.23],[0.15,0.187],[0.469,0.063],[-0.324,-0.056],[0.421,0.035],[-0.331,-0.223],[-0.031,0.163],[0.46,0.068],[-0.079,0.225],[-0.193,0.13],[0.417,0.015],[0.164,-0.013],[0.188,-0.032],[0.407,-0.018],[-0.469,0.073],[-0.336,-0.218],[0.45,0.068],[0.326,-0.232],[-0.307,-0.104],[0.283,-0.037],[0.457,0.063],[-0.333,0.02],[0.202,-0.18],[0.307,-0.218],[-0.031,-0.227],[0.34,-0.132],[0.074,0.211],[-0.169,0.101],[0.198,-0.18],[0.131,0.082],[0.212,0.025],[-0.002,-0.027],[0.236,0.144],[-0.288,-0.204],[-0.179,0.101],[-0.269,-0.175],[-0.386,-0.108],[-0.026,0.254],[0.105,0.158],[0.031,-0.061],[-0.017,0.163],[0.145,-0.042],[-0.012,-0.17],[0.074,0.244],[-0.036,0.03],[-0.331,0.011],[0.064,-0.08],[-0.331,-0.185],[-0.202,-0.18],[0.036,-0.18],[-0.121,0.206],[0.002,-0.232],[0.069,0.092],[0.131,0.023],[-0.312,0.039],[0.207,0.144],[0.093,0.139],[0.136,-0.185],[0.36,-0.104],[0.479,0.068],[-0.326,-0.023],[0.093,-0.051],[-0.345,0.058],[-0.293,-0.211],[0.088,-0.196],[-0.126,0.211],[0.345,0.02],[-0.433,0.027],[0.15,-0.018],[0.236,0.049],[0.131,0.168],[-0.193,0.115],[-0.074,0.035],[-0.436,0.082],[0.483,0.051],[0.083,0.225],[-0.107,-0.201],[-0.017,0.156],[-0.321,-0.046],[0.35,-0.108],[-0.402,0.039]],
      icons(n) {
        return this.ICONS.map(paths => paths === 'HANDSHAKE'
          ? Array.from({ length: n }, () => { const q = this.HANDSHAKE[(Math.random() * this.HANDSHAKE.length) | 0]; return [q[0] + gauss() * 0.003, q[1] + gauss() * 0.003]; })
          : this.sample(paths, n));
      },
      init(pts) {
        const groups = [[], [], []];
        pts.forEach(p => {
          let best = 0, bd = 1e9;
          this.CENTERS.forEach((c, k) => { const d = Math.hypot(p.x - c[0], p.y - c[1]); if (d < bd) { bd = d; best = k; } });
          p.g = best; p.ball = [p.x, p.y, p.z]; groups[best].push(p);
        });
        const icons = this.icons(Math.max(...groups.map(g => g.length)));
        const ang = (x, y) => Math.atan2(y, x);
        groups.forEach((grp, k) => {
          const [cx, cy] = this.CENTERS[k], SIZE = k === 0 ? 0.78 : 0.6;   // handshake is wide and short, so it gets more room
          const tgt = icons[k].slice(0, grp.length).map(([x, y]) => [cx + x * SIZE, cy + y * SIZE]);
          const A = grp.map((p, i) => [ang(p.x - cx, p.y - cy), i]).sort((a, b) => a[0] - b[0]);
          const B = tgt.map((q, i) => [ang(q[0] - cx, q[1] - cy), i]).sort((a, b) => a[0] - b[0]);
          A.forEach(([, i], j) => { grp[i].icon = [tgt[B[j][1]][0], tgt[B[j][1]][1], gauss() * 0.02]; grp[i].delay = Math.random() * 0.35; });
        });
      },
      START: 1.2, GAP: 1.5, MORPH: 1.4, HOLD_UNTIL: 9.6, BACK: 1.4, CYCLE: 12.6,
      update(pts, T) {
        const t = T % this.CYCLE;
        const back = easeIO(clamp01((t - this.HOLD_UNTIL) / this.BACK));
        const ks = [0, 1, 2].map(g => t - this.START - g * this.GAP);
        for (const p of pts) {
          const q = easeIO(clamp01((ks[p.g] - p.delay) / this.MORPH)) * (1 - back);
          const puff = 1 + Math.sin(Math.PI * q) * 0.25;
          const cx = this.CENTERS[p.g][0], cy = this.CENTERS[p.g][1];
          const bx = cx + (p.ball[0] - cx) * puff, by = cy + (p.ball[1] - cy) * puff;
          p.x = bx + (p.icon[0] - bx) * q; p.y = by + (p.icon[1] - by) * q; p.z = p.ball[2] * (1 - q) + p.icon[2] * q;
          p.boost = 1 + 0.25 * q;
        }
        return { glow: 0, sway: 0.32 * Math.sin(T * 0.45) };
      },
      final(pts) {
        for (const p of pts) { [p.x, p.y, p.z] = p.icon; p.boost = 1.25; }
        return { glow: 0, sway: 0 };
      },
    },

    /* Compounding: a small tower builds, breaks, then a medium one, then a big one */
    spiral: {
      init(pts) {
        const n = pts.length, FLOOR = 0.66;
        const towers = [
          { levels: 3, h: 0.13, w: 0.2, count: Math.round(n * 0.3) },
          { levels: 5, h: 0.16, w: 0.28, count: Math.round(n * 0.6) },
          { levels: 8, h: 0.165, w: 0.36, count: Math.round(n * 0.92) },
        ];
        const towerPoint = (T) => {
          const L = (Math.random() * T.levels) | 0, y0 = FLOOR - L * T.h, y1 = y0 - T.h * 0.9;
          const w = T.w * (1 - 0.32 * L / Math.max(1, T.levels - 1));
          const sx = Math.random() < 0.5 ? -1 : 1, sz = Math.random() < 0.5 ? -1 : 1;
          const r = Math.random();
          if (r < 0.34) return [sx * w, y0 + (y1 - y0) * Math.random(), sz * w];                 // vertical edges
          if (r < 0.72) {                                                                             // horizontal edges
            const yy = Math.random() < 0.5 ? y0 : y1, u = rand(-w, w);
            return Math.random() < 0.5 ? [u, yy, sz * w] : [sx * w, yy, u];
          }
          const yy = y0 + (y1 - y0) * Math.random(), u = rand(-w, w);                                // faces (sparse fill)
          return Math.random() < 0.5 ? [u, yy, sz * w] : [sx * w, yy, u];
        };
        this.towers = towers.map(T => ({ ...T, top: FLOOR - T.levels * T.h }));
        pts.forEach((p, i) => {
          const a = rand(0, 6.283), rr = Math.sqrt(Math.random()) * 0.85;
          p.rub = [Math.cos(a) * rr, FLOOR + gauss() * 0.012, Math.sin(a) * rr];
          p.tw = towers.map(T => i < T.count ? towerPoint(T) : null);
          p.kick = [gauss() * 0.35, -rand(0.1, 0.4), gauss() * 0.35];
          p.x = p.rub[0]; p.y = p.rub[1]; p.z = p.rub[2];
        });
        this.FLOOR = FLOOR;
      },
      BUILD: 2.6, HOLD: [2.2, 2.4, 3.6], BREAK: 1.5,
      update(pts, T) {
        const durs = this.HOLD.map(h => this.BUILD + h + this.BREAK), cycle = durs.reduce((a, b) => a + b, 0);
        let t = T % cycle, s = 0;
        while (t > durs[s]) { t -= durs[s]; s++; }
        const tw = this.towers[s], H = this.FLOOR - tw.top;
        const bt = t - this.BUILD - this.HOLD[s];               // time into the break
        for (const p of pts) {
          const target = p.tw[s];
          if (!target) { [p.x, p.y, p.z] = p.rub; p.boost = 0.45; continue; }
          if (bt < 0) {                                         // build: rise from the rubble, bottom level first
            const d = (this.FLOOR - target[1]) / H * this.BUILD * 0.55;
            const k = easeOut3(clamp01((t - d) / (this.BUILD * 0.45)));
            p.x = p.rub[0] + (target[0] - p.rub[0]) * k;
            p.z = p.rub[2] + (target[2] - p.rub[2]) * k;
            p.y = p.rub[1] + (target[1] - p.rub[1]) * k - Math.sin(Math.PI * k) * 0.08;
            p.boost = 0.45 + 0.55 * k;
          } else {                                              // break: burst out, then fall back to the floor
            const u = clamp01(bt / this.BREAK);
            const x = target[0] + p.kick[0] * u, z = target[2] + p.kick[2] * u;
            const y = target[1] + p.kick[1] * u + 2.2 * u * u * 0.5;
            p.x = x + (p.rub[0] - x) * u * u; p.z = z + (p.rub[2] - z) * u * u;
            p.y = Math.min(this.FLOOR, y + (p.rub[1] - y) * u * u);
            p.boost = 1 - 0.55 * u;
          }
        }
        return { glow: 0 };
      },
      final(pts) { for (const p of pts) { const t = p.tw[2]; [p.x, p.y, p.z] = t || p.rub; p.boost = t ? 1 : 0.45; } return { glow: 0 }; },
    },
  };

  document.querySelectorAll('canvas.shape').forEach(canvas => {
    const { ctx, resize } = setup(canvas);
    const anim = ANIM[canvas.dataset.shape];
    const pts = SHAPES[canvas.dataset.shape](window.innerWidth < 700 ? 600 : 1100)
      .map(p => ({ ...p, c: PALETTE[(Math.random() * PALETTE.length) | 0], s: rand(1.4, 3.2), rot: rand(0, 6.28), sp: rand(-1, 1), boost: 1, amber: 0 }));
    if (anim) anim.init(pts);
    let visible = false, appear = 0, last = performance.now(), T = 0;
    watchVisible(canvas, v => visible = v);
    window.addEventListener('resize', resize);
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) return;
      T += dt;                                     // story time only runs while on screen, so it starts at the beginning
      appear = Math.min(1, appear + dt / 1.6);
      const e = reduce ? 1 : 1 - Math.pow(1 - appear, 3);
      const t = now / 1000;
      const W = canvas.width, H = canvas.height, S = Math.min(W, H) * 0.62;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1 * DPR;
      const fx = anim ? (reduce ? anim.final(pts) : anim.update(pts, T)) : null;
      const ay = fx && fx.sway !== undefined ? fx.sway : reduce ? 0.5 : anim && anim.speed ? T * anim.speed : t * 0.22, ax = fx && fx.sway !== undefined ? -0.12 : -0.35;
      if (fx && fx.glow > 0.01) {
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, S * 1.05);
        g.addColorStop(0, `rgba(128,82,255,${0.16 * fx.glow * e})`);
        g.addColorStop(0.55, `rgba(255,184,41,${0.06 * fx.glow * e})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
      for (const p of pts) {
        const x1 = p.x * cy - p.z * sy, z1 = p.x * sy + p.z * cy;
        const y1 = p.y * cx - z1 * sx, z2 = p.y * sx + z1 * cx;
        const persp = 1 / (1.8 - z2 * 0.5);
        const depth = Math.max(0, Math.min(1, (z2 + 1) / 2));
        const k = 0.55 + 0.45 * e;
        const col = p.amber > 0.5 ? '#ffb829' : p.c;
        tri(ctx, W / 2 + x1 * S * persp * 1.5 * k, H / 2 + y1 * S * persp * 1.5 * k,
          p.s * DPR * (0.7 + depth * 0.6), p.rot + t * p.sp * 0.5, col, Math.min(1, (0.2 + depth * 0.8) * e * p.boost));
      }
      if (fx && fx.labels) {
        ctx.fillStyle = '#ffb829'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `600 ${12 * DPR}px Inter, system-ui, sans-serif`;
        for (const l of fx.labels) {
          if (l.a <= 0.01) continue;
          const x1 = l.x * cy, z1 = l.x * sy, y1 = l.y * cx - z1 * sx, z2 = l.y * sx + z1 * cx, persp = 1 / (1.8 - z2 * 0.5);
          ctx.globalAlpha = l.a * e;
          ctx.fillText(l.text, W / 2 + x1 * S * persp * 1.5, H / 2 + y1 * S * persp * 1.5);
        }
      }
      ctx.globalAlpha = 1;
    };
    requestAnimationFrame(frame);
  });


  /* ---------------- Vision popup, vision board, and deal form ---------------- */
  (() => {
    const pop = document.getElementById('vpop');
    const board = document.getElementById('vision');
    const dealForm = document.getElementById('dealForm');
    if (!pop || !board || !dealForm) return;
    const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const URL_RE = /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i;

    /* ===== Logo -> particle points =====
       Loads the company's logo, works out which pixels are the mark (not the background),
       and samples them as points in a box whose longest side is 1. Falls back to the company name. */
    const loadImg = src => new Promise(res => {
      const img = new Image(); let done = false;
      const fin = v => { if (!done) { done = true; res(v); } };
      img.onload = () => fin(img); img.onerror = () => fin(null);
      setTimeout(() => fin(null), 6000);
      img.src = src;
    });
    /* Logo colours on a black page: keep the brand's own hue, but lift dark shades (deep purple, navy,
       forest green) so they glow instead of disappearing. Black/grey/white marks become soft white. */
    function onDark(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let l = (mx + mn) / 2, sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), h = 0;
      if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      if (d < 0.12) return { col: `hsl(0,0%,${Math.round(Math.max(78, Math.min(94, l * 100)))}%)`, mono: true };   // black, grey, white
      sat = Math.max(sat, 0.55); l = Math.min(0.72, Math.max(0.6, l));   // bright enough to read on #000, not washed out
      return { col: `hsl(${Math.round(h)},${Math.round(sat * 100)}%,${Math.round(l * 100)}%)`, mono: false, h, s: sat, l };
    }
    function maskFrom(draw, N) {
      const S = 240, c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d', { willReadFrequently: true });
      const box = draw(x, S);
      if (!box) return null;
      let data;
      try { data = x.getImageData(0, 0, S, S).data; } catch (e) { return null; }
      const px = (i, j) => { const k = (j * S + i) * 4; return [data[k], data[k + 1], data[k + 2], data[k + 3]]; };
      // background = the drawn box's corners, if they are solid and alike
      const x0 = Math.ceil(box.x) + 2, y0 = Math.ceil(box.y) + 2, x1 = Math.floor(box.x + box.w) - 3, y1 = Math.floor(box.y + box.h) - 3;
      let cs = [px(x0, y0), px(x1, y0), px(x0, y1), px(x1, y1)];
      if (!cs.every(q => q[3] > 220)) {   // rounded app-icon tile: corners are transparent, so look a little further in
        const ix = (x1 - x0) * 0.1, iy = (y1 - y0) * 0.1;
        cs = [px(x0 + ix | 0, y0 + iy | 0), px(x1 - ix | 0, y0 + iy | 0), px(x0 + ix | 0, y1 - iy | 0), px(x1 - ix | 0, y1 - iy | 0)];
      }
      if (!cs.every(q => q[3] > 220)) {   // round badge (e.g. a G inside a white circle): use the middle of each side, just inside the rim
        const mx = (x0 + x1) / 2 | 0, my = (y0 + y1) / 2 | 0, ix = (x1 - x0) * 0.14 | 0, iy = (y1 - y0) * 0.14 | 0;   // past any thin rim
        cs = [px(mx, y0 + iy), px(mx, y1 - iy), px(x0 + ix, my), px(x1 - ix, my)];
      }
      const solid = cs.every(q => q[3] > 220);
      const near = (a, b, d) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < d;
      const bg = solid && cs.every(q => near(q, cs[0], 60)) ? cs[0] : null;
      const fg = [];
      for (let j = Math.max(0, y0 - 2); j <= Math.min(S - 1, y1 + 2); j++) for (let i = Math.max(0, x0 - 2); i <= Math.min(S - 1, x1 + 2); i++) {
        const q = px(i, j);
        if (q[3] > 110 && (!bg || !near(q, bg, 110))) fg.push([i, j, q[0], q[1], q[2]]);
      }
      const cover = fg.length / Math.max(1, box.w * box.h);
      if (fg.length < 120 || cover > 0.8) return null;
      // edges: where the mark meets the background, or where colours change inside it (e.g. the siren inside
      // the Starbucks circle, the G inside Google's). Sampling these gives every logo crisp detail.
      const isFg = new Uint8Array(S * S);
      for (const f of fg) isFg[f[1] * S + f[0]] = 1;
      const diff = (i, j, q) => { const r = px(i, j); return Math.abs(r[0] - q[2]) + Math.abs(r[1] - q[3]) + Math.abs(r[2] - q[4]) > 120; };
      const edges = fg.filter(q => {
        const [i, j] = q;
        if (i < 1 || j < 1 || i > S - 2 || j > S - 2) return true;
        return !isFg[j * S + i - 1] || !isFg[j * S + i + 1] || !isFg[(j - 1) * S + i] || !isFg[(j + 1) * S + i]
          || diff(i + 1, j, q) || diff(i, j + 1, q);
      });
      const edgeShare = edges.length > 40 ? Math.min(0.55, 0.25 + cover * 0.6) : 0;   // solid, filled logos lean more on their outline
      let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
      for (const [i, j] of fg) { if (i < mnx) mnx = i; if (i > mxx) mxx = i; if (j < mny) mny = j; if (j > mxy) mxy = j; }
      const bw = mxx - mnx + 1, bh = mxy - mny + 1, sc = 1 / Math.max(bw, bh), cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
      const sat = q => Math.max(q[0], q[1], q[2]) - Math.min(q[0], q[1], q[2]);
      // e.g. a white mark on a purple or orange tile: the tile colour is the brand, so use it
      const brand = bg && sat(bg) > 60 ? onDark(bg[0], bg[1], bg[2]) : null;
      const picks = Array.from({ length: N }, () => {
        const src = Math.random() < edgeShare ? edges : fg;
        const [i, j, r, g, b] = src[(Math.random() * src.length) | 0];
        return { i, j, c: brand || onDark(r, g, b) };
      });
      // only an all black / white / grey logo borrows a few JgSaw accents; coloured logos keep their own colours
      const mono = picks.filter(q => q.c.mono).length > picks.length * 0.85;
      const pts = picks.map(({ i, j, c }) => {
        const col = mono && Math.random() < 0.18 ? PALETTE[(Math.random() * PALETTE.length) | 0] : c.col;
        return { x: (i + Math.random() - cx) * sc, y: (j + Math.random() - cy) * sc, col };
      });
      const main = picks.find(q => !q.c.mono);
      const glow = main ? `hsl(${Math.round(main.c.h)},${Math.round(main.c.s * 100)}%,60%)` : null;
      return { pts, w: bw * sc, h: bh * sc, glow, mono };
    }
    /* The brand colour of an image: the most common strong colour in it (ignores black, white and grey). */
    function brandColour(img) {
      const S = 48, c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d', { willReadFrequently: true });
      try { x.drawImage(img, 0, 0, S, S); } catch (e) { return null; }
      let d; try { d = x.getImageData(0, 0, S, S).data; } catch (e) { return null; }
      const bins = {};
      for (let k = 0; k < d.length; k += 4) {
        if (d[k + 3] < 200) continue;
        const r = d[k], g = d[k + 1], b = d[k + 2];
        if (Math.max(r, g, b) - Math.min(r, g, b) < 70) continue;
        const c2 = onDark(r, g, b), key = Math.round(c2.h / 20);
        (bins[key] = bins[key] || []).push(c2);
      }
      const best = Object.values(bins).sort((a, b) => b.length - a.length)[0];
      if (!best || best.length < S * S * 0.04) return null;
      const h = best.reduce((t, c2) => t + c2.h, 0) / best.length, s2 = best.reduce((t, c2) => t + c2.s, 0) / best.length;
      return { h, s: s2 };
    }
    /* A logo that came through black / white (the site colours it with CSS) gets its brand colour back from
       the company's other images, usually the favicon. Truly black-and-white brands (Nike, Apple) stay white. */
    function brandTint(m, others) {
      if (!m.mono) return m;
      const bc = others.map(brandColour).find(Boolean);
      if (!bc) return m;
      const H = Math.round(bc.h), Sa = Math.round(Math.max(0.55, bc.s) * 100);
      for (const p of m.pts) {
        const r = Math.random();
        p.col = r < 0.72 ? `hsl(${H},${Sa}%,${62 + (Math.random() * 10 | 0)}%)` : r < 0.9 ? `hsl(${H},${Sa}%,82%)` : 'hsl(0,0%,92%)';
      }
      m.glow = `hsl(${H},${Sa}%,60%)`;
      return m;
    }
    async function logoShape(logos, name, N) {
      const list = (logos || []).filter(src => !/^data:image\/jpe?g/i.test(src));   // skip photos
      const imgs = await Promise.all(list.map(loadImg));
      // keep the server's ranking, but push tiny raster icons (favicons) to the back: they turn into blobs.
      // Vector (SVG) logos are sharp at any size, so they are never pushed back.
      const sharp = (im, i) => im && (/^data:image\/svg/i.test(list[i]) || Math.max(im.naturalWidth || 0, im.naturalHeight || 0) >= 64);
      const usable = [...imgs.filter(sharp), ...imgs.filter((im, i) => im && !sharp(im, i))];
      for (const img of usable) {
        const iw = img.naturalWidth || 300, ih = img.naturalHeight || 300;
        const m = maskFrom((x, S) => {
          const k = (S * 0.9) / Math.max(iw, ih), w = iw * k, h = ih * k, bx = (S - w) / 2, by = (S - h) / 2;
          try { x.drawImage(img, bx, by, w, h); } catch (e) { return null; }
          return { x: bx, y: by, w, h };
        }, N);
        if (m) return brandTint(m, usable.filter(im => im !== img));
      }
      const word = (name || 'Your company').trim().slice(0, 18);
      return maskFrom((x, S) => {
        x.font = `600 100px Inter, system-ui, sans-serif`;
        const tw = x.measureText(word).width, k = Math.min(1, (S * 0.92) / tw);
        x.font = `600 ${Math.floor(100 * k)}px Inter, system-ui, sans-serif`;
        x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(word, S / 2, S / 2);
        return { x: 0, y: S / 2 - 60 * k, w: S, h: 120 * k };
      }, N);
    }
    const DULL = '#7d7d7d';
    if (/[?&]debug=1\b/.test(location.search)) window.__jgLogoShape = logoShape;   // lets the test script check logos

    /* ===== Popup: opens after 10 seconds actually on the page ===== */
    const form = document.getElementById('vpopForm');
    const msg = form.querySelector('.form-msg');
    const btn = form.querySelector('button[type="submit"]');
    // Stays "done" only once they press × or send their details. Escape / clicking outside just hides it for this visit.
    const SEEN = 'jgsaw_vision_done';
    const force = /[?&]vision=1\b/.test(location.search);
    let lastFocus = null, closing = false;
    const panel = pop.querySelector('.vpop__panel');
    const open = () => {
      if (!pop.hidden) return;
      lastFocus = document.activeElement;
      pop.classList.remove('is-leaving', 'is-scanning', 'is-dissolving');
      pop.hidden = false;
      requestAnimationFrame(() => pop.classList.add('is-open'));
      setTimeout(() => form.company.focus(), 60);
      startArt();
    };

    /* Magic dissolve: the panel crumbles away bit by bit, top first, and each bit becomes a glowing
       triangle that drifts off. 'up' floats away like dust (closed); 'down' falls toward the vision board (sent). */
    let dust = null;
    const dissolve = dir => new Promise(resolve => {
      const r = panel.getBoundingClientRect();
      const CW = 34, CH = Math.max(10, Math.round(CW * r.height / r.width));
      const mc = document.createElement('canvas'); mc.width = CW; mc.height = CH;
      const mx = mc.getContext('2d');
      const at = new Float32Array(CW * CH);   // when each bit goes: top rows first, with a ragged random edge
      for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) at[j * CW + i] = (j / CH) * 0.6 + Math.random() * 0.4;
      if (!dust) { dust = document.createElement('canvas'); dust.className = 'vdust'; dust.setAttribute('aria-hidden', 'true'); document.body.appendChild(dust); }
      dust.width = innerWidth * DPR; dust.height = innerHeight * DPR;
      const ctx = dust.getContext('2d');
      const cw = r.width / CW, ch = r.height / CH, gone = new Uint8Array(CW * CH), ps = [];
      const DUR = 1.3, FADE = 0.12, t0 = performance.now();
      let last = t0, masked = true;
      const setMask = v => { panel.style.webkitMaskImage = panel.style.maskImage = v; panel.style.webkitMaskSize = panel.style.maskSize = '100% 100%'; };
      const frame = now => {
        const t = (now - t0) / 1000, k = t / DUR, dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (masked) {
          mx.clearRect(0, 0, CW, CH);
          for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
            const n = j * CW + i, a = 1 - clamp01((k - at[n] * (1 - FADE)) / FADE);
            if (a > 0) { mx.fillStyle = `rgba(0,0,0,${a})`; mx.fillRect(i, j, 1, 1); }
            if (a < 0.6 && !gone[n]) {
              gone[n] = 1;
              for (let q = 0, m = 1 + (Math.random() < 0.45); q < m; q++) {
                const up = dir === 'up';
                ps.push({ x: (r.left + (i + Math.random()) * cw) * DPR, y: (r.top + (j + Math.random()) * ch) * DPR,
                  vx: gauss() * (up ? 38 : 26) * DPR, vy: (up ? -rand(25, 95) : rand(10, 60)) * DPR,
                  g: (up ? -28 : 300) * DPR, age: 0, life: rand(0.9, 1.7), s: rand(1.1, 2.5) * DPR, rot: rand(0, 6.28), sp: rand(-5, 5),
                  c: Math.random() < 0.55 ? '#e9e6ff' : PALETTE[(Math.random() * PALETTE.length) | 0], ph: rand(0, 6.28) });
              }
            }
          }
          setMask(`url(${mc.toDataURL()})`);
          if (k >= 1) { masked = false; resolve(); }
        }
        ctx.clearRect(0, 0, dust.width, dust.height);
        ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = DPR;
        for (let n = ps.length - 1; n >= 0; n--) {
          const p = ps[n]; p.age += dt;
          if (p.age >= p.life) { ps[n] = ps[ps.length - 1]; ps.pop(); continue; }
          p.vy += p.g * dt; p.x += (p.vx + Math.sin(p.age * 4 + p.ph) * 14 * DPR) * dt; p.y += p.vy * dt; p.rot += p.sp * dt;
          const u = p.age / p.life, a = u < 0.12 ? u / 0.12 : Math.pow(1 - u, 1.4);
          tri(ctx, p.x, p.y, p.s * (1 + 0.6 * Math.sin(u * Math.PI)), p.rot, p.c, 0.9 * a);
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        if (masked || ps.length) requestAnimationFrame(frame); else ctx.clearRect(0, 0, dust.width, dust.height);
      };
      requestAnimationFrame(frame);
    });

    // how: 'done' (details sent), 'cross' (pressed ×), 'soft' (Escape / clicked outside)
    const close = async how => {
      if (closing || pop.hidden) return;
      closing = true;
      if (how === 'done' || how === 'cross') { try { localStorage.setItem(SEEN, '1'); } catch (e) {} }
      if (!reduce) {
        pop.classList.add('is-dissolving');
        await dissolve(how === 'done' ? 'down' : 'up');
      }
      pop.classList.remove('is-open');
      await wait(200);
      pop.hidden = true; stopArt();
      pop.classList.remove('is-dissolving');
      panel.style.webkitMaskImage = panel.style.maskImage = '';
      closing = false;
      if (how !== 'done' && lastFocus && lastFocus.focus) lastFocus.focus();
    };
    let seen = false;
    try { seen = localStorage.getItem(SEEN) === '1'; } catch (e) {}
    if (!seen || force) {
      let onPage = 0, t0 = performance.now();
      const tick = setInterval(() => {
        const now = performance.now();
        if (!document.hidden) onPage += now - t0;
        t0 = now;
        if (onPage >= 10000) { clearInterval(tick); open(); }
      }, 500);
    }
    pop.addEventListener('click', e => { if (e.target === pop) close('soft'); });
    pop.querySelector('.vpop__close').addEventListener('click', () => close('cross'));
    document.addEventListener('keydown', e => {
      if (pop.hidden) return;
      if (e.key === 'Escape') close('soft');
      if (e.key === 'Tab') {
        const f = [...pop.querySelectorAll('button, input')].filter(x => !x.disabled);
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // small particle art at the top of the popup: scattered triangles gather into a rising line
    let artRaf = 0;
    const art = document.getElementById('vpopArt');
    const startArt = () => {
      if (!art || artRaf) return;
      const { ctx } = setup(art);
      const N = 260;
      const ps = Array.from({ length: N }, (_, i) => ({ u: i / (N - 1), ox: Math.random(), oy: Math.random(), j: gauss() * 0.035,
        c: PALETTE[(Math.random() * PALETTE.length) | 0], s: rand(1.1, 2.3), rot: rand(0, 6.28), sp: rand(-1, 1) }));
      const t0 = performance.now();
      const frame = now => {
        artRaf = requestAnimationFrame(frame);
        const W = art.width, H = art.height, t = (now - t0) / 1000;
        const k = reduce ? 1 : easeIO(clamp01(((t % 7) - 0.6) / 2.2)) * (1 - easeIO(clamp01(((t % 7) - 5.8) / 1.1)));
        ctx.clearRect(0, 0, W, H); ctx.lineWidth = DPR;
        for (const p of ps) {
          const tx = p.u, ty = 0.86 - 0.72 * Math.pow(p.u, 1.7) + p.j * (1 - k * 0.7);
          const x = (p.ox + (tx - p.ox) * k) * W, y = (p.oy + (ty - p.oy) * k) * H;
          if (!reduce) p.rot += p.sp * 0.02;
          tri(ctx, x, y, p.s * DPR, p.rot, k > 0.6 && p.u > 0.7 ? '#ffb829' : p.c, 0.35 + 0.55 * k);
        }
        ctx.globalAlpha = 1;
      };
      artRaf = requestAnimationFrame(frame);
    };
    const stopArt = () => { cancelAnimationFrame(artRaf); artRaf = 0; };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const company = form.company.value.trim(), url = form.url.value.trim();
      form.querySelectorAll('.field').forEach(f => f.classList.remove('is-invalid'));
      if (!company) { form.company.closest('.field').classList.add('is-invalid'); msg.textContent = 'Please add your company name.'; return; }
      if (!URL_RE.test(url)) { form.url.closest('.field').classList.add('is-invalid'); msg.textContent = 'Please add your website, like acme.com'; return; }
      btn.disabled = true; btn.textContent = 'Scanning your website…';
      pop.classList.add('is-scanning');
      msg.textContent = 'Reading your pages, channels, tools and proof.';
      try {
        const r = await fetch(`/api/analyze?company=${encodeURIComponent(company)}&url=${encodeURIComponent(url)}`);
        const data = await r.json();
        if (!r.ok || data.error) throw new Error(data.error || 'Something went wrong.');
        data.input = url;
        const shapeP = logoShape(data.logos, data.company, innerWidth < 700 ? 650 : 1000);
        msg.textContent = 'Done. Building your vision board…';
        await wait(500);
        await close('done');
        showBoard(data, await shapeP);
      } catch (err) {
        pop.classList.remove('is-scanning');
        msg.textContent = err.message && err.message.length < 140 ? err.message : "We couldn't read that website. Please check the address.";
      } finally {
        btn.disabled = false; btn.textContent = 'Show my vision';
      }
    });

    /* ===== Vision board ===== */
    const lift = v => Math.max(v, Math.min(97, Math.round(v + (100 - v) * 0.6 + 6)));
    const FIX = {
      'Positioning': 'Core Context and Craft: one clear story about who you serve and why you win, written with April Dunford\'s positioning method',
      'Proof': 'Road to Win: every claim backed by evidence from the deals you actually win, with the source shown',
      'Content engine': 'Generation: a steady flow of LinkedIn posts, blogs, case studies and emails, each built on your own winning habit',
      'Pipeline capture': 'Generation: campaigns turned into multi-touch plans with clear next steps, handed over to sales',
      'Channels': 'Craft: account-based campaigns that reach the whole buying committee where they already are',
    };
    const revealEls = () => [
      ...board.querySelectorAll(':scope > .wrap > .label, .vision__title, .vision__sub, .vision__stage, .vision__scores, .vision__cols > div, .vision__note')
    ];

    async function showBoard(d, shape) {
      const $ = k => board.querySelector(`[data-v="${k}"]`);
      $('company').textContent = d.company;
      $('domain').textContent = d.domain;
      $('sub').textContent = d.ai && d.ai.positioning ? d.ai.positioning
        : (d.description || d.headline || `We read ${d.domain}. Here is what a buyer sees today.`);
      const names = Object.keys(d.scores);
      const limited = !!d.limited || !names.length;
      if (limited) $('sub').textContent = `${d.domain} doesn't allow automated reading, so this board shows your brand and what JgSaw adds. Send us a deal for the full read.`;
      board.querySelector('.vision__scores').hidden = limited;
      board.querySelector('.vision__cols > div:first-child').hidden = limited;
      const bar = (n, v, strong) => `
        <div class="vbar"><span class="vbar__name">${strong ? '<b>' + esc(n) + '</b>' : esc(n)}</span>
          <span class="vbar__track"><span class="vbar__after" data-w="${lift(v)}"></span><span class="vbar__now" data-w="${v}"></span></span>
          <span class="vbar__num">${v} → <b>${lift(v)}</b></span></div>`;
      $('scores').innerHTML = names.map(n => bar(n, d.scores[n])).join('') + bar('Overall', d.overall, true);
      const on = o => Object.keys(o).filter(k => o[k]);
      const rows = [
        ['Says', d.headline || '—'],
        ['Sells to', d.ai && d.ai.icp ? d.ai.icp : d.model],
        ['Asks buyers to', d.ctas.length ? d.ctas.join(', ') : 'No clear call to action found', !d.ctas.length],
        ['Channels', on(d.channels).length ? on(d.channels).join(', ') : 'None found', !on(d.channels).length],
        ['Social', d.social.length ? d.social.join(', ') : 'None linked', !d.social.length],
        ['Tools seen', d.tech.length ? d.tech.join(', ') : 'None detected'],
        ['Proof', on(d.proof).length ? on(d.proof).join(', ') : 'None visible', !on(d.proof).length],
        ['Gaps', d.gaps.join('. '), true],
      ];
      $('today').innerHTML = rows.map(([k, v, gap]) => `<div><dt>${esc(k)}</dt><dd class="${gap ? 'is-gap' : ''}">${esc(v)}</dd></div>`).join('');
      const weakest = limited ? ['Positioning', 'Proof', 'Content engine'] : names.slice().sort((a, b) => d.scores[a] - d.scores[b]).slice(0, 3);
      const after = weakest.map(n => FIX[n]);
      if (d.ai && Array.isArray(d.ai.quick_wins)) after.push(...d.ai.quick_wins.slice(0, 2));
      after.push('Compounding: learns from every reply, correction and deal outcome, so each month is better than the last');
      $('after').innerHTML = after.map(t => `<li>${esc(t)}</li>`).join('');
      // pre-fill the deal form so "Send us a deal" is one step away
      if (!dealForm.company.value) dealForm.company.value = d.company;
      if (!dealForm.url.value) dealForm.url.value = d.input || d.domain;

      // reset, then drop the board open from the footer
      const els = revealEls().filter(el => !el.hidden);
      els.forEach(el => { el.classList.add('vision__reveal'); el.classList.remove('is-in'); });
      board.querySelectorAll('.vbar [data-w]').forEach(b => { b.style.width = '0'; });
      board.querySelector('.vision__body').hidden = false;
      board.hidden = false;
      buildVision(d, shape);

      if (reduce) {
        els.forEach(el => el.classList.add('is-in'));
        board.querySelectorAll('.vbar [data-w]').forEach(b => { b.style.width = b.dataset.w + '%'; });
        board.scrollIntoView({ block: 'start' });
        return;
      }
      const full = board.scrollHeight;
      board.style.height = '0px';
      void board.offsetHeight;
      board.classList.add('is-growing');
      board.style.height = full + 'px';
      // follow the board down: keep easing the page so the board's top settles near the top of the screen
      const tEnd = performance.now() + 1900;
      const follow = () => {
        const target = board.getBoundingClientRect().top + scrollY - 70;
        const next = scrollY + (target - scrollY) * 0.1;
        window.scrollTo({ top: next, behavior: 'instant' });
        if (performance.now() < tEnd && Math.abs(target - scrollY) > 1) requestAnimationFrame(follow);
      };
      requestAnimationFrame(follow);
      setTimeout(() => { board.classList.remove('is-growing'); board.style.height = ''; }, 1500);
      // then each part fades in, one after another
      els.forEach((el, i) => setTimeout(() => {
        el.classList.add('is-in');
        if (el.classList.contains('vision__scores')) setTimeout(() => board.querySelectorAll('.vbar [data-w]').forEach(b => { b.style.width = b.dataset.w + '%'; }), 300);
      }, 350 + i * 200));
    }

    // Before / after logo animation.
    // Left: the logo today, grey, dim and partly crumbled (more crumble for a weaker score).
    // A wave carries a copy of every particle across, where it locks into the logo, bright, sharp and glowing.
    const cv = document.getElementById('visionCanvas');
    let vpts = [], vbox = { w: 1, h: 1 }, vT = 0, vStarted = false, vBrand = 'hsl(255,100%,66%)';
    function buildVision(d, shape) {
      vbox = shape;
      vT = 0;
      const crumble = Math.min(0.55, 0.12 + (100 - d.overall) / 100 * 0.7);
      vpts = shape.pts.map(p => {
        const fall = Math.random() < crumble;
        return {
          bx: p.x, by: p.y, col: p.col,
          ax: fall ? p.x * 1.15 + gauss() * 0.04 : p.x + gauss() * 0.014,
          ay: fall ? shape.h / 2 + 0.06 + Math.abs(gauss()) * 0.03 : p.y + gauss() * 0.014,
          fall, s: rand(1.2, 2.6), rot: rand(0, 6.28), sp: rand(-1, 1),
          delay: (p.x + 0.5) * 1.1 + Math.random() * 0.35, arc: rand(0.12, 0.3),
        };
      });
      // glow in the brand colour, if the logo has a real colour (not black, white or grey)
      vBrand = shape.glow || 'hsl(255,100%,66%)';
      if (!vStarted) { vStarted = true; startVision(); }
    }
    function startVision() {
      const { ctx } = setup(cv);
      let visible = false, last = performance.now();
      watchVisible(cv, v => { visible = v; });
      const CYCLE = 11;
      const frame = now => {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (!visible) return;
        vT += dt;
        const W = cv.width, H = cv.height, t = vT % CYCLE;
        const L = Math.min(W * 0.34, H * 0.66 / Math.max(vbox.h, 0.35));
        const lx = W * 0.25, rx = W * 0.75, cy = H * 0.46;
        ctx.clearRect(0, 0, W, H);
        ctx.globalAlpha = 0.1; ctx.strokeStyle = '#fff'; ctx.lineWidth = DPR; ctx.setLineDash([4 * DPR, 6 * DPR]);
        ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.08); ctx.lineTo(W * 0.5, H * 0.86); ctx.stroke(); ctx.setLineDash([]);
        const settle = reduce ? 1 : clamp01((t - 3.6) / 1.4) * (1 - clamp01((t - 9.8) / 0.9));
        if (settle > 0) {
          const g = ctx.createRadialGradient(rx, cy, 0, rx, cy, L * 0.85);
          g.addColorStop(0, vBrand.replace('hsl(', 'hsla(').replace(')', `,${0.22 * settle})`)); g.addColorStop(1, vBrand.replace('hsl(', 'hsla(').replace(')', ',0)'));
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(W * 0.5, 0, W * 0.5, H);
        }
        ctx.lineWidth = DPR;
        for (const p of vpts) {
          if (!reduce) p.rot += p.sp * dt * 0.8;
          // today: always there on the left, grey and restless
          const wob = Math.sin(vT * 0.9 + p.rot) * 0.004;
          tri(ctx, lx + (p.ax + wob) * L, cy + (p.ay + Math.cos(vT * 0.7 + p.rot) * 0.004) * L, p.s * DPR * 0.85, p.rot, DULL, p.fall ? 0.22 : 0.3);
          // with JgSaw: travels across and locks in
          let k = reduce ? 1 : easeIO(clamp01((t - 1.2 - p.delay) / 1.9));
          if (!reduce && t > 9.8) k = 1 - easeIO(clamp01((t - 9.8) / 0.9));
          if (k <= 0.001) continue;
          const x = (lx + p.ax * L) + ((rx + p.bx * L) - (lx + p.ax * L)) * k;
          const y = (cy + p.ay * L) + ((cy + p.by * L) - (cy + p.ay * L)) * k - Math.sin(k * Math.PI) * p.arc * L;
          const lit = k > 0.97;
          tri(ctx, x, y, p.s * DPR * (lit ? 1.05 : 0.9), lit ? p.rot * 0.15 : p.rot, lit || k > 0.5 ? p.col : DULL, 0.3 + 0.65 * k);
        }
        ctx.globalAlpha = 1;
      };
      requestAnimationFrame(frame);
    }

    /* ===== Deal form: send, then the company's logo is put back together as a JgSaw puzzle ===== */
    const dmsg = dealForm.querySelector('.form-msg');
    const done = document.getElementById('dealDone');
    const dcv = document.getElementById('dealCanvas');
    const dtext = done.querySelector('.deal-done__msg');
    dealForm.addEventListener('submit', async e => {
      e.preventDefault();
      let ok = true;
      dealForm.querySelectorAll('input, textarea').forEach(f => {
        const optional = f.name === 'url';
        const valid = optional ? (!f.value.trim() || URL_RE.test(f.value.trim())) : (f.checkValidity() && f.value.trim() !== '');
        f.closest('.field').classList.toggle('is-invalid', !valid);
        if (!valid) ok = false;
      });
      if (!ok) { dmsg.textContent = 'Please complete the company, what you\'d sell and your email.'; return; }
      const sbtn = dealForm.querySelector('button[type="submit"]');
      const payload = { company: dealForm.company.value.trim(), url: dealForm.url.value.trim(), offer: dealForm.offer.value.trim(), email: dealForm.email.value.trim() };
      sbtn.disabled = true; sbtn.textContent = 'Sending…'; dmsg.textContent = '';
      try {
        const logosP = payload.url
          ? fetch(`/api/logo?url=${encodeURIComponent(payload.url)}`).then(r => r.json()).then(j => j.logos || []).catch(() => [])
          : Promise.resolve([]);
        const r = await fetch('/api/deal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || 'We couldn\'t send that. Please try again.');
        dmsg.textContent = 'Sent. Putting it together…';
        const shape = await logoShape(await logosP, payload.company, innerWidth < 700 ? 600 : 900);
        dealForm.classList.add('is-leaving');
        await wait(500);
        dealForm.hidden = true; dealForm.classList.remove('is-leaving');
        done.querySelector('[data-d="note"]').textContent = `We have your ${payload.company} deal. Expect what JgSaw makes of it within one working day.`;
        dtext.classList.remove('is-in');
        done.hidden = false;
        playPuzzle(shape, () => dtext.classList.add('is-in'));
      } catch (err) {
        dmsg.textContent = err.message;
      } finally {
        sbtn.disabled = false; sbtn.textContent = 'Send us a deal';
      }
    });
    done.querySelector('[data-d="again"]').addEventListener('click', () => {
      stopPuzzle();
      done.hidden = true; dealForm.reset(); dmsg.textContent = ''; dealForm.hidden = false;
      dealForm.company.focus();
    });

    // one jigsaw edge (u along 0..1, v sideways), same shape as the hero puzzle
    function jigEdge(sign) {
      const pts = [];
      const line = (u0, v0, u1, v1, n) => { for (let i = 0; i < n; i++) { const k = i / n; pts.push([u0 + (u1 - u0) * k, v0 + (v1 - v0) * k]); } };
      line(0, 0, 0.37, 0, 14); line(0.37, 0, 0.405, 0.1, 4);
      const cx = 0.5, cv = 0.19, r = 0.12;
      const a0 = Math.atan2(0.1 - cv, 0.405 - cx) + Math.PI * 2, a1 = Math.atan2(0.1 - cv, 0.595 - cx);
      for (let i = 0; i <= 26; i++) { const a = a0 + (a1 - a0) * (i / 26); pts.push([cx + Math.cos(a) * r, cv + Math.sin(a) * r]); }
      line(0.595, 0.1, 0.63, 0, 4); line(0.63, 0, 1, 0, 14); pts.push([1, 0]);
      return pts.map(([u, v]) => [u, v * sign]);
    }
    let pRaf = 0;
    const stopPuzzle = () => { cancelAnimationFrame(pRaf); pRaf = 0; };
    function playPuzzle(shape, onDone) {
      stopPuzzle();
      const { ctx } = setup(dcv);
      const ratio = shape.w / Math.max(shape.h, 0.01);
      const C = ratio > 2 ? 4 : 3, R = ratio > 2 ? 2 : ratio < 0.5 ? 4 : 3;
      const pad = 0.06, gw = shape.w + pad * 2, gh = shape.h + pad * 2;
      const toL = (gx, gy) => [-gw / 2 + gx * gw / C, -gh / 2 + gy * gh / R];
      const sgn = () => (Math.random() < 0.5 ? -1 : 1);
      const Hs = [], Vs = [];
      for (let r = 0; r <= R; r++) { Hs[r] = []; for (let c = 0; c < C; c++) Hs[r][c] = jigEdge(r === 0 || r === R ? 0 : sgn()).map(([u, v]) => toL(c + u, r + v * 0.8)); }
      for (let r = 0; r < R; r++) { Vs[r] = []; for (let c = 0; c <= C; c++) Vs[r][c] = jigEdge(c === 0 || c === C ? 0 : sgn()).map(([u, v]) => toL(c + v * 0.8, r + u)); }
      const pieces = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const [x0, y0] = toL(c, r), [x1, y1] = toL(c + 1, r + 1), pcx = (x0 + x1) / 2, pcy = (y0 + y1) / 2;
        const parts = [];
        shape.pts.forEach(p => { if (p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1) parts.push({ x: p.x - pcx, y: p.y - pcy, col: p.col, edge: false, s: rand(1.2, 2.6), rot: rand(0, 6.28) }); });
        const poly = [...Hs[r][c], ...Vs[r][c + 1], ...Hs[r + 1][c].slice().reverse(), ...Vs[r][c].slice().reverse()];
        for (let i = 0; i < poly.length - 1; i++) {
          const [ax, ay] = poly[i], [bx, by] = poly[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.012));
          for (let k = 0; k < n; k++) parts.push({ x: ax + (bx - ax) * k / n - pcx + gauss() * 0.002, y: ay + (by - ay) * k / n - pcy + gauss() * 0.002,
            col: (i + k) % 3 ? '#8052ff' : '#ffb829', edge: true, s: rand(1, 1.8), rot: rand(0, 6.28) });
        }
        const ang = Math.atan2(pcy, pcx) + rand(-0.6, 0.6), dist = rand(0.16, 0.3);
        pieces.push({ pcx, pcy, parts, sx: pcx + Math.cos(ang) * dist * 1.4, sy: pcy + Math.sin(ang) * dist * 0.7, srot: rand(-1.1, 1.1), order: 0 });
      }
      pieces.sort(() => Math.random() - 0.5).forEach((p, k) => { p.order = k; });
      const STAG = 0.28, FLY = 1.0, START = 0.5;
      const D = START + (pieces.length - 1) * STAG + FLY;
      const easeOutBack = x => { const c1 = 1.3, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
      let t0 = performance.now(), told = false;
      const frame = now => {
        pRaf = requestAnimationFrame(frame);
        const W = dcv.width, H = dcv.height;
        const T = reduce ? D + 3 : (now - t0) / 1000;
        if (!told && T > D + 0.4) { told = true; onDone(); }
        const L = Math.min(W * 0.62 / Math.max(gw + 0.42, 0.3), H * 0.8 / Math.max(gh + 0.4, 0.3)) * 1.25;   // leaves room for the scattered pieces
        const ox = W / 2, oy = H * 0.47;
        ctx.clearRect(0, 0, W, H);
        const glow = clamp01((T - D) / 0.4) * (1 - 0.6 * clamp01((T - D - 0.6) / 1.2));
        if (glow > 0) {
          const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, Math.max(gw, gh) * L * 0.75);
          const gc = shape.glow || 'hsl(255,100%,66%)';
          g.addColorStop(0, gc.replace('hsl(', 'hsla(').replace(')', `,${0.3 * glow})`)); g.addColorStop(1, gc.replace('hsl(', 'hsla(').replace(')', ',0)'));
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
        const seam = T < D ? 0.8 : 0.8 - 0.68 * clamp01((T - D) / 0.9);   // outlines fade once the logo is whole
        ctx.lineWidth = DPR;
        for (const pc of pieces) {
          const s0 = START + pc.order * STAG;
          const k = clamp01((T - s0) / FLY), e = k === 0 ? 0 : easeOutBack(k);
          const appear = clamp01(T / 0.5);
          const px = pc.sx + (pc.pcx - pc.sx) * e, py = pc.sy + (pc.pcy - pc.sy) * e, rot = pc.srot * (1 - Math.min(1, e));
          const cs = Math.cos(rot), sn = Math.sin(rot);
          const lit = clamp01((T - s0 - FLY) / 0.45);   // the piece lights up once it snaps in
          const flash = lit > 0 && lit < 1 ? Math.sin(lit * Math.PI) : 0;
          for (const q of pc.parts) {
            const x = ox + (px + q.x * cs - q.y * sn) * L, y = oy + (py + q.x * sn + q.y * cs) * L;
            if (q.edge) { tri(ctx, x, y, q.s * DPR, q.rot, q.col, seam * appear); continue; }
            const col = lit > 0.35 ? q.col : DULL;
            const a = (0.3 + 0.62 * lit + 0.1 * flash) * appear;
            if (!reduce) q.rot += 0.01 * (1 - lit * 0.8);
            tri(ctx, x, y, q.s * DPR * (1 + 0.35 * flash), q.rot, col, a);
          }
        }
        ctx.globalAlpha = 1;
      };
      pRaf = requestAnimationFrame(frame);
    }
  })();

  /* ---------------- Ambient field ---------------- */
  const amb = document.getElementById('ambient');
  if (amb) {
    const ctx = amb.getContext('2d');
    let W, H;
    const resize = () => { W = amb.width = innerWidth * DPR; H = amb.height = innerHeight * DPR; };
    resize(); window.addEventListener('resize', resize);
    const ps = Array.from({ length: innerWidth < 700 ? 30 : 70 }, () => ({
      x: Math.random(), y: Math.random(), vx: rand(-0.004, 0.004), vy: rand(-0.006, -0.001),
      c: PALETTE[(Math.random() * PALETTE.length) | 0], s: rand(1.5, 3.5), rot: rand(0, 6.28), sp: rand(-0.5, 0.5), a: rand(0.15, 0.45)
    }));
    let last = performance.now();
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1 * DPR;
      for (const p of ps) {
        if (!reduce) { p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.sp * dt; }
        if (p.y < -0.02) p.y = 1.02; if (p.x < -0.02) p.x = 1.02; if (p.x > 1.02) p.x = -0.02;
        tri(ctx, p.x * W, p.y * H, p.s * DPR, p.rot, p.c, p.a);
      }
      ctx.globalAlpha = 1;
    };
    requestAnimationFrame(frame);
  }
})();
