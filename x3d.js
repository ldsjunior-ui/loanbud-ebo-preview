/* x3d.js · LoanBud · Employee Buyout Financing · depth and motion layer
 * Sits on top of fx.js (living photos) and never replaces it. Adds:
 *   - a WebGL scene on the hero: a brass key with a LoanBud fob, orbit rings and drifting light motes
 *   - perspective tilt, depth and glare on every photo
 *   - an isometric 3D capital stack, a drawn gap bar and count-ups in the story cards
 *   - a rotating strand of lender nodes around the proof rail divider
 *   - scroll reveals, reading progress, magnetic primary buttons
 * Honours the page's motion switch (html.motion-paused), open dialogs (html.is-locked), hidden tabs and
 * reduced motion. three.js is loaded only when a hardware GPU is present.
 * QA: ?x3=force renders the WebGL scene on a software GPU, ?x3=off skips it. */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const backOut = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const SOFT_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|warp/i;

export function initX3() {
  const doc = document, win = window, html = doc.documentElement;
  if (html.classList.contains('x3-on')) return;
  const $ = (s, r = doc) => r.querySelector(s);
  const $$ = (s, r = doc) => Array.from(r.querySelectorAll(s));
  const fine = win.matchMedia('(hover:hover) and (pointer:fine)');
  const qs = new URLSearchParams(win.location.search);
  const still = () => html.classList.contains('motion-paused');
  const live = () => !still() && !html.classList.contains('is-locked') && !doc.hidden;
  const visibleNow = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < win.innerHeight; };
  html.classList.add('x3-on');

  /* ---------- one frame loop ---------- */
  const tickers = new Set();
  let raf = 0, last = 0;
  const kick = () => { if (!raf) raf = win.requestAnimationFrame(frame); };
  function frame(now) {
    raf = 0;
    const gap = now - last; last = now;
    const dt = gap > 0 && gap < 250 ? Math.min(.05, gap / 1000) : 1 / 60;
    let alive = false;
    for (const t of tickers) if (t(dt, now / 1000)) alive = true;
    if (alive) kick();
  }
  new win.MutationObserver(kick).observe(html, { attributes: true, attributeFilter: ['class'] });
  doc.addEventListener('visibilitychange', kick);

  /* ---------- in-view helpers ---------- */
  const seenFns = new Map(), viewFns = new Map();
  const seenIO = new win.IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    seenIO.unobserve(e.target);
    (seenFns.get(e.target) || []).forEach(f => f());
    seenFns.delete(e.target);
  }), { threshold: .12, rootMargin: '0px 0px -5% 0px' });
  const onSeen = (el, fn) => { if (!el) return; if (visibleNow(el)) { fn(); return; } const a = seenFns.get(el); if (a) a.push(fn); else { seenFns.set(el, [fn]); seenIO.observe(el); } };
  const viewIO = new win.IntersectionObserver(es => { es.forEach(e => (viewFns.get(e.target) || []).forEach(f => f(e.isIntersecting))); kick(); });
  const onView = (el, fn) => { const a = viewFns.get(el); if (a) a.push(fn); else { viewFns.set(el, [fn]); viewIO.observe(el); } };

  /* ---------- scroll reveals (only for content that starts below the fold) ---------- */
  const reveal = (el, d = 0) => {
    if (!el || still() || visibleNow(el)) return;
    el.style.setProperty('--d', d);
    el.classList.add('x3-rv');
    onSeen(el, () => { el.classList.add('x3-in'); win.setTimeout(() => el.classList.remove('x3-rv', 'x3-in'), 1300 + d * 90); });
  };
  reveal($('.sec__intro'));
  reveal($('#story'), 1);
  reveal($('#seats-h'));
  $$('.seat').forEach((s, i) => reveal(s, i));
  $$('.start__copy > *').forEach((el, i) => reveal(el, i));

  /* ---------- header reading progress ---------- */
  const hdr = $('.hdr');
  let scrollY = win.scrollY, scrollQueued = false;
  if (hdr) {
    const bar = doc.createElement('span');
    bar.className = 'x3-progress'; bar.setAttribute('aria-hidden', 'true');
    hdr.appendChild(bar);
    const setP = () => {
      scrollQueued = false;
      scrollY = win.scrollY;
      const max = doc.documentElement.scrollHeight - win.innerHeight;
      bar.style.setProperty('--x3-p', max > 0 ? clamp(scrollY / max, 0, 1).toFixed(4) : 0);
      kick();
    };
    win.addEventListener('scroll', () => { if (!scrollQueued) { scrollQueued = true; win.requestAnimationFrame(setP); } }, { passive: true });
    setP();
  }

  /* ---------- count-ups ---------- */
  function countUp(el, to, fmt, dur = 1200) {
    if (!el || still()) return;
    const fin = el.dataset.x3Fin || (el.dataset.x3Fin = el.textContent);
    el.style.minWidth = el.offsetWidth + 'px';
    const tok = el._x3 = (el._x3 || 0) + 1, t0 = win.performance.now();
    const step = now => {
      if (el._x3 !== tok) return;
      const k = clamp((now - t0) / dur, 0, 1);
      el.textContent = k < 1 ? fmt(Math.round(to * easeOut(k))) : fin;
      if (k < 1) win.requestAnimationFrame(step);
    };
    win.requestAnimationFrame(step);
  }
  const usd = v => '$' + v.toLocaleString('en-US');
  const railNum = $('#proof li .num');
  if (railNum && /^50\+$/.test(railNum.textContent.trim())) onSeen($('#proof'), () => countUp(railNum, 50, v => v + '+', 1400));

  /* ---------- story cards ---------- */
  const story = $('#story');
  const card1 = $('#stage-card-1');
  if (card1) {
    const gap = doc.createElement('span');
    gap.className = 'x3-gap'; gap.setAttribute('aria-hidden', 'true');
    gap.innerHTML = '<i></i><b></b>';
    card1.appendChild(gap);
    const nums = $$('.kv .num', card1).map(el => [el, parseInt(el.textContent.replace(/[^0-9]/g, ''), 10)]).filter(p => Number.isFinite(p[1]));
    const run = () => nums.forEach(([el, v], i) => countUp(el, v, usd, 900 + i * 250));
    onSeen(story, run);
    doc.addEventListener('ebo:step', e => { if (e.detail && e.detail.step === 1) run(); });
  }
  const mini = $('#stage-card-2 .mini');
  if (mini) {
    const st = doc.createElement('span');
    st.className = 'x3-stack';
    st.innerHTML = '<span class="x3-stack__in">' + [['var(--green)', 40, 0], ['var(--oasis)', 12, 43], ['var(--ink)', 12, 58]]
      .map(([c, h, z], i) => `<i class="x3-slab" style="--c:${c};--h:${h}px;--z:${z}px;--i:${i}"><b class="t"></b><b class="f"></b><b class="s"></b></i>`).join('') + '</span>';
    mini.prepend(st);
    mini.classList.add('x3-mini');
  }
  if (story) {
    let q = false, ev = null;
    story.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      ev = e;
      if (q) return; q = true;
      win.requestAnimationFrame(() => {
        q = false;
        const r = story.getBoundingClientRect();
        story.style.setProperty('--mx', ((ev.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        story.style.setProperty('--my', ((ev.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      });
    }, { passive: true });
  }

  /* ---------- perspective tilt + glare ---------- */
  const tilts = [];
  function addTilt(el, scope, max, glareOn) {
    if (!el || !scope) return;
    const T = { el, max, x: 0, y: 0, tx: 0, ty: 0, hot: false };
    el.classList.add('x3-tilt');
    if (glareOn) el.classList.add('x3-glare');
    scope.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || !fine.matches || !live()) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      T.tx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1.2, 1.2);
      T.ty = clamp((e.clientY - r.top) / r.height * 2 - 1, -1.2, 1.2);
      el.style.setProperty('--gx', ((T.tx + 1) * 50).toFixed(1) + '%');
      el.style.setProperty('--gy', ((T.ty + 1) * 50).toFixed(1) + '%');
      if (!T.hot) { T.hot = true; el.classList.add('is-hot'); el.style.setProperty('--go', 1); }
      kick();
    }, { passive: true });
    scope.addEventListener('pointerleave', () => { T.tx = T.ty = 0; T.hot = false; el.classList.remove('is-hot'); el.style.setProperty('--go', 0); kick(); });
    tilts.push(T);
  }
  addTilt($('#hero-photo'), $('.hero__visual'), 4, true);
  addTilt($('#stage-photo'), $('.story__visual'), 4, true);
  $$('.seat__media').forEach(m => addTilt(m, m, 6, false));
  addTilt($('.start__photo'), $('.start__photo'), 5, true);
  tickers.add(dt => {
    let alive = false;
    const k = 1 - Math.exp(-dt * 9);
    for (const T of tilts) {
      if (!live()) { T.tx = T.ty = 0; }
      T.x += (T.tx - T.x) * k; T.y += (T.ty - T.y) * k;
      const moving = Math.abs(T.tx - T.x) > .002 || Math.abs(T.ty - T.y) > .002;
      if (!moving) { T.x = T.tx; T.y = T.ty; }
      T.el.style.setProperty('--rx', (-T.y * T.max).toFixed(3));
      T.el.style.setProperty('--ry', (T.x * T.max).toFixed(3));
      if (moving) alive = true;
    }
    return alive;
  });

  /* ---------- magnetic primary buttons ---------- */
  $$('.btn--primary').forEach(b => {
    b.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || !fine.matches || still()) return;
      const r = b.getBoundingClientRect();
      b.style.translate = `${((e.clientX - r.left) / r.width - .5) * 8}px ${((e.clientY - r.top) / r.height - .5) * 6}px`;
    }, { passive: true });
    b.addEventListener('pointerleave', () => { b.style.translate = ''; });
  });

  /* ---------- proof rail: a rotating 3D strand of lender nodes ---------- */
  (function strand() {
    const rail = $('#proof');
    if (!rail) return;
    const wrap = doc.createElement('div');
    wrap.className = 'x3-strand-wrap'; wrap.setAttribute('aria-hidden', 'true');
    const c = doc.createElement('canvas');
    c.className = 'x3-strand';
    wrap.appendChild(c);
    rail.parentNode.insertBefore(wrap, rail);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const N = 56, COL = ['0,163,91', '137,205,173', '11,12,61', '0,163,91', '237,183,75'];
    let s = 20240521;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const nodes = Array.from({ length: N }, (_, i) => ({ u: (i + .15 + rnd() * .7) / N, a: rnd() * 6.283, r: .55 + rnd() * .45, c: COL[i % COL.length] }));
    let w = 0, h = 0, inView = false, t = 0, drawn = false;
    const size = () => {
      const r = c.getBoundingClientRect(), d = Math.min(2, win.devicePixelRatio || 1);
      w = r.width; h = r.height;
      c.width = Math.max(2, Math.round(w * d)); c.height = Math.max(2, Math.round(h * d));
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawn = false; kick();
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const mid = h / 2, R = h * .36, wave = (t * .11) % 1.3 - .15;
      const P = nodes.map(n => {
        const a = n.a + t * .42;
        const depth = (Math.cos(a) + 1) / 2;
        const hot = Math.max(0, 1 - Math.abs(n.u - wave) / .09);
        return { x: n.u * w, y: mid + Math.sin(a) * R * n.r, d: depth, hot, c: n.c };
      });
      ctx.lineWidth = 1;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < Math.min(N, i + 4); j++) {
        const A = P[i], B = P[j], dx = B.x - A.x;
        if (dx > 96) break;
        const al = (.07 + .2 * Math.max(A.hot, B.hot)) * (1 - dx / 96) * (.35 + .65 * (A.d + B.d) / 2);
        ctx.strokeStyle = `rgba(0,163,91,${al.toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
      P.sort((a, b) => a.d - b.d).forEach(p => {
        ctx.fillStyle = `rgba(${p.c},${(.2 + .62 * p.d + .18 * p.hot).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, .9 + 1.5 * p.d + 1.3 * p.hot, 0, 6.283); ctx.fill();
      });
      drawn = true;
    };
    new win.ResizeObserver(size).observe(c);
    onView(c, v => { inView = v; });
    tickers.add(dt => {
      if (!inView || !w) return false;
      const run = live();
      if (run) t += dt; else if (drawn) return false;
      draw();
      return run;
    });
    size();
  })();

  /* ---------- builder: turn the two flat stacks into solid prisms ---------- */
  (function builder() {
    const root = $('#deal-root');
    if (!root) return;
    let built = false;
    const build = () => {
      if (built) return true;
      const ui = $('.deal-ui', root);
      const cols = ui ? $$('.deal-col', ui) : [];
      if (!cols.length) return false;
      built = true;
      const sets = cols.map(col => {
        const segs = $$('.deal-clip .deal-seg', col);
        const side = doc.createElement('div'); side.className = 'x3-side';
        const inn = doc.createElement('div');
        const twins = segs.map(sg => { const t = sg.cloneNode(false); inn.appendChild(t); return t; });
        side.appendChild(inn);
        const top = doc.createElement('i'); top.className = 'x3-top';
        col.appendChild(side); col.appendChild(top);
        col.classList.add('x3-prism');
        return { col, segs, twins };
      });
      let q = false;
      const sync = () => {
        q = false;
        for (const S of sets) {
          const cr = S.col.getBoundingClientRect();
          let topY = cr.height, topSeg = null;
          S.segs.forEach((sg, i) => {
            S.twins[i].style.cssText = sg.style.cssText;
            const r = sg.getBoundingClientRect();
            if (r.height > .75 && r.top - cr.top < topY) { topY = r.top - cr.top; topSeg = sg; }
          });
          S.col.style.setProperty('--x3top', topY.toFixed(1) + 'px');
          S.col.style.setProperty('--x3c', topSeg ? win.getComputedStyle(topSeg).backgroundColor : 'transparent');
        }
      };
      const ask = () => { if (!q) { q = true; win.requestAnimationFrame(sync); } };
      const mo = new win.MutationObserver(ask);
      sets.forEach(S => S.segs.forEach(sg => mo.observe(sg, { attributes: true, attributeFilter: ['style'] })));
      new win.ResizeObserver(ask).observe(ui);
      ask();
      return true;
    };
    const wait = () => { let n = 0; const iv = win.setInterval(() => { if (build() || ++n > 60) win.clearInterval(iv); }, 100); };
    doc.addEventListener('ebo:dialog-open', e => { if (e.detail && e.detail.id === 'build') wait(); });
    if ($('#build') && $('#build').open) wait();
  })();

  /* ---------- closing: a rotating 3D globe of lender nodes with arcs, half hidden behind the photo ---------- */
  (function globe() {
    const box = $('.start__in'), photo = $('.start__photo');
    if (!box || !photo) return;
    const c = doc.createElement('canvas');
    c.className = 'x3-globe'; c.setAttribute('aria-hidden', 'true');
    box.appendChild(c);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const N = 64, pts = [], arcs = [];
    for (let i = 0; i < N; i++) {                                         // Fibonacci sphere
      const y = 1 - (i + .5) / N * 2, r = Math.sqrt(1 - y * y), a = i * 2.399963;
      pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    const COL = ['0,163,91', '137,205,173', '11,12,61', '0,163,91', '237,183,75'];
    let D = 0, inView = false, t = 0, drawn = false, nextArc = 0, seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const place = () => {
      const narrow = win.innerWidth < 768;
      const copy = $('.start__copy');
      const gapPx = copy ? copy.offsetLeft - (photo.offsetLeft + photo.offsetWidth) : 120;   // the globe never reaches the copy
      D = narrow ? 230 : clamp((gapPx - 14) / .95 / .4, 200, 430);
      const d = Math.min(2, win.devicePixelRatio || 1);
      c.style.width = c.style.height = D + 'px';
      /* wide layouts: the bulge beside the photo is capped by the gutter, so nodes never sit under the copy */
      c.style.left = (narrow ? photo.offsetLeft + photo.offsetWidth - D * .62 : photo.offsetLeft + photo.offsetWidth + Math.min(gapPx - 10, D * .448) - D * .948) + 'px';
      c.style.top = (narrow ? photo.offsetTop - D * .3 : photo.offsetTop + photo.offsetHeight / 2 - D / 2) + 'px';
      c.width = c.height = Math.round(D * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawn = false; kick();
    };
    const rot = (p, ry, rx) => {
      const x = p[0] * Math.cos(ry) + p[2] * Math.sin(ry), z0 = -p[0] * Math.sin(ry) + p[2] * Math.cos(ry);
      return [x, p[1] * Math.cos(rx) - z0 * Math.sin(rx), p[1] * Math.sin(rx) + z0 * Math.cos(rx)];
    };
    const draw = () => {
      const R = D * .4, cx = D / 2, cy = D / 2, ry = t * .22, rx = .38;
      const proj = p => { const q = rot(p, ry, rx), k = 1 / (1 - q[2] * .18); return [cx + q[0] * R * k, cy - q[1] * R * k, q[2]]; };
      ctx.clearRect(0, 0, D, D);
      const g = ctx.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R * 1.12);
      g.addColorStop(0, 'rgba(137,205,173,.20)'); g.addColorStop(.7, 'rgba(137,205,173,.07)'); g.addColorStop(1, 'rgba(137,205,173,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 6.283); ctx.fill();
      ctx.lineWidth = 1;
      for (let m = 0; m < 6; m++) {                                       // meridians
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) { const a = i / 48 * 6.283, b = m / 6 * Math.PI; const q = proj([Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
        ctx.strokeStyle = 'rgba(5,63,79,.07)'; ctx.stroke();
      }
      for (const lat of [-.6, 0, .6]) {                                   // parallels
        ctx.beginPath();
        const rr = Math.sqrt(1 - lat * lat);
        for (let i = 0; i <= 48; i++) { const a = i / 48 * 6.283; const q = proj([Math.cos(a) * rr, lat, Math.sin(a) * rr]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
        ctx.strokeStyle = 'rgba(5,63,79,.07)'; ctx.stroke();
      }
      if (t > nextArc && arcs.length < 6) { const a = Math.floor(rnd() * N); let b = Math.floor(rnd() * N); if (b === a) b = (a + 9) % N; arcs.push({ a, b, s: t }); nextArc = t + .45 + rnd() * .5; }
      for (let i = arcs.length - 1; i >= 0; i--) {
        const A = arcs[i], k = (t - A.s) / 2.2;
        if (k >= 1.35) { arcs.splice(i, 1); continue; }
        const pa = pts[A.a], pb = pts[A.b], om = Math.acos(clamp(pa[0] * pb[0] + pa[1] * pb[1] + pa[2] * pb[2], -1, 1)) || .001, so = Math.sin(om);
        const head = Math.min(1, k), tail = Math.max(0, k - .35);
        ctx.beginPath();
        for (let j = 0; j <= 24; j++) {
          const u = tail + (head - tail) * j / 24, w1 = Math.sin((1 - u) * om) / so, w2 = Math.sin(u * om) / so, lift = 1 + .22 * Math.sin(Math.PI * u);
          const q = proj([(pa[0] * w1 + pb[0] * w2) * lift, (pa[1] * w1 + pb[1] * w2) * lift, (pa[2] * w1 + pb[2] * w2) * lift]);
          j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        }
        ctx.strokeStyle = `rgba(0,163,91,${(.55 * (1 - Math.max(0, k - 1) / .35)).toFixed(3)})`; ctx.lineWidth = 1.4; ctx.stroke(); ctx.lineWidth = 1;
      }
      pts.map((p, i) => [proj(p), i]).sort((a, b) => a[0][2] - b[0][2]).forEach(([q, i]) => {
        const d = (q[2] + 1) / 2, hot = arcs.some(A => (A.a === i && t - A.s < .5) || (A.b === i && t - A.s > 2 && t - A.s < 2.8));
        ctx.fillStyle = `rgba(${COL[i % COL.length]},${(.14 + .7 * d).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(q[0], q[1], 1 + 2.1 * d + (hot ? 2 : 0), 0, 6.283); ctx.fill();
        if (hot) { ctx.strokeStyle = 'rgba(0,163,91,.35)'; ctx.beginPath(); ctx.arc(q[0], q[1], 7 + 2 * d, 0, 6.283); ctx.stroke(); }
      });
      drawn = true;
    };
    new win.ResizeObserver(place).observe(box);
    onView(c, v => { inView = v; });
    tickers.add(dt => {
      if (!inView || !D) return false;
      const run = live();
      if (run) t += dt; else if (drawn) return false;
      if (!run && t === 0) t = 3;
      draw();
      return run;
    });
    place();
  })();

  /* ---------- hero: WebGL key scene ---------- */
  const mode = qs.get('x3');
  const idle = cb => ('requestIdleCallback' in win ? win.requestIdleCallback(cb, { timeout: 1500 }) : win.setTimeout(cb, 200));
  if (mode !== 'off') idle(() => heroScene(mode === 'force').catch(() => {}));

  async function heroScene(force) {
    const vis = $('.hero__visual'), fig = $('#hero-photo');
    if (!vis || !fig) return;
    /* cheap probe first: never download three.js for a software rasteriser */
    if (!force) {
      const probe = doc.createElement('canvas');
      const g = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!g) return;
      let ren = '';
      try { const x = g.getExtension('WEBGL_debug_renderer_info'); ren = String(x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)); } catch { ren = ''; }
      try { const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); } catch { /* ignore */ }
      if (SOFT_GPU.test(ren)) return;
    }
    const THREE = await import('./vendor/three.module.min.js');
    const canvas = doc.createElement('canvas');
    canvas.className = 'x3-hero'; canvas.setAttribute('aria-hidden', 'true');
    vis.appendChild(canvas);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'default' }); }
    catch { canvas.remove(); return; }
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, .1, 60);
    camera.position.z = 12;

    /* studio environment for the metal: soft boxes baked once into a PMREM */
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: 0x46595f, side: THREE.BackSide })));
    const panel = (w, h, x, y, z, col, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(10, 6, 0, 9, 2, 0xffffff, 14);
    panel(5, 10, 9, 1, 3, 0xfff0d2, 9);
    panel(5, 9, -9, 0, 2, 0xbfe9d6, 6);
    panel(8, 3, 0, -8, 4, 0xffffff, 3);
    panel(6, 6, 0, 2, 10, 0xffffff, 5);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, .03).texture;
    pm.dispose();
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
    sun.position.set(-3, 5, 6);
    scene.add(sun);

    /* the key */
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xE8B04A, metalness: 1, roughness: .23, clearcoat: .45, clearcoatRoughness: .18, envMapIntensity: 1.25 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xcfd8da, metalness: 1, roughness: .2, envMapIntensity: 1.2 });
    const tiltG = new THREE.Group(), spinG = new THREE.Group();
    tiltG.add(spinG); scene.add(tiltG);
    const part = (geo, x, y, z, mat = gold) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); spinG.add(m); return m; };
    const bow = part(new THREE.TorusGeometry(.52, .15, 28, 72), 0, .95, 0);
    bow.scale.z = .8;
    part(new THREE.TorusGeometry(.3, .035, 12, 48), 0, .95, 0);
    part(new THREE.CylinderGeometry(.2, .2, .13, 40), 0, .36, 0);
    part(new THREE.CylinderGeometry(.155, .155, .07, 40), 0, .22, 0);
    part(new THREE.CylinderGeometry(.105, .105, 1.7, 32), 0, -.52, 0);
    part(new THREE.SphereGeometry(.105, 24, 16), 0, -1.37, 0);
    part(new THREE.CylinderGeometry(.135, .135, .05, 32), 0, -.62, 0);
    part(new THREE.BoxGeometry(.3, .15, .1), .22, -1.2, 0);
    part(new THREE.BoxGeometry(.2, .12, .1), .17, -1.0, 0);
    part(new THREE.BoxGeometry(.3, .1, .1), .22, -.82, 0);

    /* ring + LoanBud fob, hanging from the bow */
    const fobG = new THREE.Group();
    scene.add(fobG);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.3, .028, 12, 56), steel);
    ring.position.y = -.3; ring.rotation.y = 1.05;
    fobG.add(ring);
    const sh = new THREE.Shape(), fw = .5, fh = .66, fr = .11;
    sh.moveTo(-fw / 2 + fr, -fh / 2);
    sh.lineTo(fw / 2 - fr, -fh / 2); sh.absarc(fw / 2 - fr, -fh / 2 + fr, fr, -Math.PI / 2, 0, false);
    sh.lineTo(fw / 2, fh / 2 - fr); sh.absarc(fw / 2 - fr, fh / 2 - fr, fr, 0, Math.PI / 2, false);
    sh.lineTo(-fw / 2 + fr, fh / 2); sh.absarc(-fw / 2 + fr, fh / 2 - fr, fr, Math.PI / 2, Math.PI, false);
    sh.lineTo(-fw / 2, -fh / 2 + fr); sh.absarc(-fw / 2 + fr, -fh / 2 + fr, fr, Math.PI, Math.PI * 1.5, false);
    const fobGeo = new THREE.ExtrudeGeometry(sh, { depth: .05, bevelEnabled: true, bevelSize: .018, bevelThickness: .018, bevelSegments: 4, curveSegments: 12 });
    fobGeo.center();
    const fob = new THREE.Group();
    fob.position.y = -.98;
    fob.add(new THREE.Mesh(fobGeo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: .32, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: .9 })));
    fobG.add(fob);
    new THREE.TextureLoader().load('img/emblem.png', tex => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
      [1, -1].forEach(dz => { const p = new THREE.Mesh(new THREE.PlaneGeometry(.27, .36), mat); p.position.z = dz * .046; if (dz < 0) p.rotation.y = Math.PI; fob.add(p); });
      kick();
    });

    /* orbit rings with a bead each */
    const orbitG = new THREE.Group();
    scene.add(orbitG);
    const orbit = (R, col, rx, rz) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TorusGeometry(R, .007, 6, 160), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .7, toneMapped: false })));
      const bead = new THREE.Mesh(new THREE.SphereGeometry(.06, 20, 14), new THREE.MeshStandardMaterial({ color: col, metalness: .6, roughness: .25 }));
      bead.position.x = R; g.add(bead);
      const holder = new THREE.Group();
      holder.rotation.set(rx, 0, rz); holder.add(g); orbitG.add(holder);
      return g;
    };
    const o1 = orbit(1.72, 0x00A35B, 1.15, .35), o2 = orbit(2.02, 0x89CDAD, 1.32, -.5);

    /* drifting light motes */
    const MN = 60, mpos = new Float32Array(MN * 3), mcol = new Float32Array(MN * 3), seeds = [];
    const pal = [new THREE.Color(0x00A35B), new THREE.Color(0x89CDAD), new THREE.Color(0xEDB74B), new THREE.Color(0xffffff)];
    for (let i = 0; i < MN; i++) {
      seeds.push({ x: Math.random(), y: Math.random(), z: Math.random() * 5 - 3.2, v: .012 + Math.random() * .03, w: Math.random() * 6.283 });
      pal[i % pal.length].toArray(mcol, i * 3);
    }
    const mgeo = new THREE.BufferGeometry();
    mgeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
    mgeo.setAttribute('color', new THREE.BufferAttribute(mcol, 3));
    const sc = doc.createElement('canvas'); sc.width = sc.height = 64;
    const sx = sc.getContext('2d'), grad = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(.35, 'rgba(255,255,255,.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    sx.fillStyle = grad; sx.fillRect(0, 0, 64, 64);
    const motes = new THREE.Points(mgeo, new THREE.PointsMaterial({ size: .11, map: new THREE.CanvasTexture(sc), vertexColors: true, transparent: true, opacity: .62, depthWrite: false, sizeAttenuation: true, toneMapped: false }));
    scene.add(motes);

    /* layout: anchor the key on the photo's signature corner */
    const base = new THREE.Vector3(), tmp = new THREE.Vector3();
    let W = 1, H = 1, S = 1, pr = 2, ready = false;
    function size() {
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (!cw || !ch) return;
      renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, pr));
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch; camera.updateProjectionMatrix();
      H = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360);
      const u = H / ch;
      W = cw * u;
      /* offsets are layout offsets, so a tilt in progress never moves the anchor */
      const fx0 = fig.offsetLeft + cw * (12 / 124), fy0 = fig.offsetTop + ch * (14 / 122), fwid = fig.offsetWidth;
      base.set((fx0 + fwid * .87 - cw / 2) * u, (ch / 2 - (fy0 + fwid * .1)) * u, 0);
      S = clamp(fwid * .3, 84, 190) * u / 2.95;
      ready = true; kick();
    }
    new win.ResizeObserver(size).observe(vis);

    let inView = false, time = 0, px = 0, py = 0, ptx = 0, pty = 0, spin = 0, lastSpin = 0, slow = 0, shown = false, dirty = true;
    onView(vis, v => { inView = v; dirty = true; });
    const scope = $('#hero') || vis;
    scope.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const r = vis.getBoundingClientRect();
      ptx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1.5, 1.5);
      pty = clamp((e.clientY - r.top) / r.height * 2 - 1, -1.5, 1.5);
      kick();
    }, { passive: true });
    scope.addEventListener('pointerleave', () => { ptx = pty = 0; });

    function pose(run, dt) {
      if (!run) time = Math.max(time, 2);                    // a still frame shows the settled key
      const k = clamp((time - .15) / 1.6, 0, 1), ke = easeOut(k);
      const kp = 1 - Math.exp(-dt * 5);
      px += (ptx - px) * kp; py += (pty - py) * kp;
      const t = time, sy = clamp(scrollY / Math.max(1, win.innerHeight), 0, 2);
      spin = Math.sin(t * .45) * .55 + px * .7 + sy * 3.4 + (1 - ke) * 7;
      spinG.rotation.y = spin;
      tiltG.rotation.z = -.74 + Math.sin(t * .9) * .04 + px * .06;
      tiltG.rotation.x = py * .28 + Math.sin(t * .7) * .06;
      tiltG.position.set(base.x + (1 - ke) * 2.2 * S, base.y + Math.sin(t * 1.1) * .07 * S + (1 - ke) * 1.6 * S - sy * .5 * S, (1 - ke) * 2.5);
      tiltG.scale.setScalar(S * (.35 + .65 * backOut(k)));
      /* fob hangs under gravity from the bow, with a little swing fed by the spin */
      tiltG.updateMatrixWorld(true);
      fobG.position.copy(spinG.localToWorld(tmp.set(0, .95, 0)));
      fobG.scale.setScalar(S * ke);
      const vel = dt > 0 ? clamp((spin - lastSpin) / dt, -3, 3) : 0; lastSpin = spin;
      fobG.rotation.z = Math.sin(t * 1.7) * .13 + vel * .09;
      fob.rotation.y = Math.sin(t * .8) * .6 + vel * .2;
      orbitG.position.copy(tiltG.position);
      orbitG.scale.setScalar(S * ke);
      o1.rotation.z = t * .5; o2.rotation.z = -t * .34 + 2;
      for (let i = 0; i < MN; i++) {
        const m = seeds[i], y = (m.y + t * m.v) % 1;
        mpos[i * 3] = (m.x - .5) * W + Math.sin(t * .4 + m.w) * .12 + px * .1 * (m.z + 3.2);
        mpos[i * 3 + 1] = (y - .5) * H;
        mpos[i * 3 + 2] = m.z;
      }
      mgeo.attributes.position.needsUpdate = true;
      motes.material.opacity = .62 * ke;
    }
    tickers.add(dt => {
      if (!ready || !inView) return false;
      const run = live();
      if (!run && !dirty && shown) return false;
      if (run) {
        time += dt;
        /* governor: sustained slow frames first drop the resolution, then freeze the scene */
        slow = dt > .03 ? slow + 1 : Math.max(0, slow - 2);
        if (slow > 90) { slow = 0; if (pr > 1) { pr = 1; size(); } else frozen = true; }
      }
      pose(run && !frozen, dt);
      renderer.render(scene, camera);
      dirty = false;
      if (!shown) { shown = true; canvas.classList.add('is-on'); }
      return run && !frozen;
    });
    let frozen = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); canvas.classList.remove('is-on'); ready = false; });
    new win.MutationObserver(() => { dirty = true; }).observe(html, { attributes: true, attributeFilter: ['class'] });
    size();
  }
}

export default initX3;
