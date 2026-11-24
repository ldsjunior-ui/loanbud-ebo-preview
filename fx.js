/* fx.js · LoanBud · Employee Buyout Financing v3
 * Living photos, story dissolve, reveals, drift and card tilt. Zero dependencies. Contract: spec sections 7 and 9.3.
 *
 * Progressive enhancement over the existing <img> stack, in three tiers:
 *   1. Hardware WebGL  - a canvas over the still: breathing, depth parallax, one light sweep, shader dissolve.
 *   2. No usable GPU   - (none, software rasteriser, lost context, sustained slow frames) a compositor-only CSS
 *                        breath about the subject; swaps use the page's own <img> cross-fade.
 *   3. Reduced motion  - no canvas, no loops, no tilt; reveals and swaps become short fades.
 * The <img> elements keep their .is-active state at all times, so removing this file changes nothing structural.
 *
 * QA switch: data-fx-gl="force" | "off" on a figure or any ancestor overrides the GPU check for tier 1.
 */

const EASE = 'cubic-bezier(.2,.7,.2,1)';

const CSS = `@layer fx{
.ph__gl{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1;opacity:0;pointer-events:none;transition:opacity 200ms ${EASE}}
.fx-ready .ph__gl{opacity:1}
.ph__vid{position:absolute;max-width:none;object-fit:cover;z-index:1;opacity:0;pointer-events:none;transition:opacity 400ms ${EASE};width:calc(100%/var(--cw,1));height:calc(100%/var(--ch,1));left:calc(var(--cx,0)/var(--cw,1)*-100%);top:calc(var(--cy,0)/var(--ch,1)*-100%)}
.ph__vid.is-on{opacity:1}
.rv-a,.rv-b{position:absolute;inset:0}
.rv-a{overflow:hidden}
.fx-rv .rv-a{transform:translate3d(0,101%,0)}
.fx-rv .rv-b{transform:translate3d(0,-101%,0)}
.fx-rv.is-revealed .rv-a,.fx-rv.is-revealed .rv-b{transform:translate3d(0,0,0);transition:transform 700ms ${EASE}}
.fx-drift .rv-b{animation:fx-drift 16s ease-in-out infinite alternate paused;animation-duration:16s!important;animation-iteration-count:infinite!important}
.fx-drift.fx-run .rv-b{animation-play-state:running}
.fx-soft .ph__img{animation:fx-drift 7s ease-in-out infinite alternate paused;animation-duration:7s!important;animation-iteration-count:infinite!important}
.fx-soft.fx-live .ph__img{animation-play-state:running}
.fx-fade{opacity:0}
.fx-fade.is-revealed{opacity:1;transition:opacity 150ms ${EASE}}
.fx-rm .ph__img{transition-duration:150ms}
.fx-tilt-scope{perspective:1100px}
[data-fx-tilt].fx-pre{opacity:0;translate:0 12px}
[data-fx-tilt].fx-in{transition:opacity 300ms ${EASE},translate 300ms ${EASE}}
[data-fx-accent].fx-hold{color:var(--ink,#0B0C3D)}
@keyframes fx-drift{to{transform:scale(1.03)}}
@media print{.ph__gl,.ph__vid{display:none!important}.fx-rv .rv-a,.fx-rv .rv-b{transform:none!important}.fx-fade,[data-fx-tilt].fx-pre{opacity:1!important}}
}`;

const VERT = 'attribute vec2 p;varying vec2 f;void main(){f=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';

/* f = frame coordinate, origin top-left. Crops, subjects and edges are in source-image fractions.
 * Output is the texture colour untouched (plus the one-time sweep), so the canvas matches the <img>. */
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 f;
uniform sampler2D uTex,uTexB;
uniform vec4 uCrop,uCropB,uSubject,uSubjectB,uEdge,uEdgeB;
uniform vec2 uPointer,uParallax;
uniform float uMix,uDir,uBreath,uSweep,uBias;
vec2 warp(vec2 q,vec4 c,vec4 s,vec4 e){
  vec2 uv=c.xy+q*c.zw;
  uv=s.xy+(uv-s.xy)/(1.+uBreath);
  float d=1.-smoothstep(1.,1.4,length((uv-s.xy)/s.zw));
  d=max(d,smoothstep(.55,1.,q.y)*.5);
  vec2 w=mix(smoothstep(0.,.14,q),vec2(1.),e.xy)*mix(smoothstep(0.,.14,1.-q),vec2(1.),e.zw);
  return uv-uPointer*uParallax*(d-.5)*w*c.zw;
}
vec3 tap(sampler2D t,vec2 q,vec4 c,vec4 s,vec4 e,float r){
  vec2 uv=warp(q,c,s,e);
  if(r<=0.)return texture2D(t,uv,uBias).rgb;
  vec3 a=vec3(0.);float n=0.;
  for(int i=-4;i<=4;i++){float k=float(i);float g=exp(-k*k*.2);a+=texture2D(t,uv+vec2(k*r*c.z,0.),uBias).rgb*g;n+=g;}
  return a/n;
}
void main(){
  vec3 col;
  if(uMix<=0.)col=tap(uTex,f,uCrop,uSubject,uEdge,0.);
  else{
    float a=.04*uMix;float b=.04*(1.-uMix);float r=sin(3.14159*uMix)*.005;
    vec2 qa=(f-.5)*(1.-a)+.5+vec2(uDir*a*.5,0.);
    vec2 qb=(f-.5)*(1.-b)+.5-vec2(uDir*b*.5,0.);
    col=mix(tap(uTex,qa,uCrop,uSubject,uEdge,r),tap(uTexB,qb,uCropB,uSubjectB,uEdgeB,r),smoothstep(0.,1.,uMix));
  }
  if(uSweep>0.){
    float x=(f.x+(f.y-.5)*.3-mix(-.4,1.4,uSweep))/.17;
    col+=.08*exp(-x*x)*smoothstep(0.,.12,uSweep)*(1.-smoothstep(.88,1.,uSweep));
  }
  gl_FragColor=vec4(col,1.);
}`;

const UNIFORMS = ['uTex', 'uTexB', 'uCrop', 'uCropB', 'uSubject', 'uSubjectB', 'uEdge', 'uEdgeB', 'uPointer', 'uParallax', 'uMix', 'uDir', 'uBreath', 'uSweep', 'uBias'];
const RENDER_SCALE = 2;        // canvas pixels per CSS pixel (cap 2; also supersamples 1x screens so the photo stays as crisp as the <img>)
const PIXEL_BUDGET = 1.8e6;    // per canvas
const BREATH = .042, BREATH_PERIOD = 12, SWEEP_EVERY = 9000, SWEEP_MS = 1100, SWEEP_DELAY = 400, DISSOLVE = .6;
const SOFT_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|warp/i;   // CPU rasterisers: use the CSS tier instead

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const newSpring = () => ({ x: 0, v: 0, t: 0 });
/* Damped spring, fixed ~1/120 s substeps. Returns true while it is still moving. */
function spring(s, k, c, dt) {
  let n = Math.max(1, Math.ceil(dt * 120));
  const h = dt / n;
  while (n--) { s.v += (k * (s.t - s.x) - c * s.v) * h; s.x += s.v * h; }
  if (Math.abs(s.t - s.x) < 5e-4 && Math.abs(s.v) < 5e-3) { s.x = s.t; s.v = 0; return false; }
  return true;
}

const instances = new WeakMap();   // one live instance per root: a second init replaces the first

export function initFx({ root = document, reducedMotion = false, saveData = false } = {}) {
  const prev = instances.get(root);
  if (prev) prev.dispose();
  const doc = root.ownerDocument || root;
  const win = doc.defaultView || window;
  const $$ = (sel, r = root) => Array.from(r.querySelectorAll(sel));
  const fine = win.matchMedia('(hover:hover) and (pointer:fine)');
  const idle = cb => ('requestIdleCallback' in win ? win.requestIdleCallback(cb, { timeout: 1200 }) : win.setTimeout(cb, 120));

  let reduced = !!(reducedMotion || saveData), paused = false, disposed = false, quality = 1, softGpu = false;
  const running = () => !reduced && !paused && !disposed && !doc.hidden;

  const offs = [];
  const on = (t, type, fn, opt) => { t.addEventListener(type, fn, opt); offs.push(() => t.removeEventListener(type, fn, opt)); };

  let style = doc.getElementById('fx-css');
  if (!style) { style = doc.createElement('style'); style.id = 'fx-css'; style.textContent = CSS; (doc.head || doc.documentElement).appendChild(style); }

  /* ---------- one shared frame loop, with a frame-time governor ---------- */
  const tickers = new Set();
  let raf = 0, last = 0, slow = 0, warm = 30;
  const kick = () => { if (!raf && !disposed) raf = win.requestAnimationFrame(frame); };
  function frame(now) {
    raf = 0;
    const gap = now - last; last = now;
    const stale = !(gap > 0 && gap < 250);
    const dt = stale ? 1 / 60 : Math.min(.05, gap / 1000);
    let alive = false, drew = false;
    for (const t of tickers) { const r = t(dt, now); if (r) alive = true; if (r === 2) drew = true; }
    if (drew) {
      if (stale) warm = 30;
      else if (warm) warm--;
      else if ((slow = gap > 21 ? slow + 1 : Math.max(0, slow - 2)) > 50) { slow = 0; warm = 30; degrade(); }
    }
    if (alive) kick();
  }
  /* Sustained slow frames: lower the canvas resolution in two steps, then hand the photos to the CSS tier. */
  function degrade() {
    const q = quality > .8 ? .75 : quality > .6 ? .5 : 0;
    quality = q || .5;
    living.forEach(L => { if (!q && !L.force) L.soften(); else if (L.gl) L.size(L.w, L.h); });
  }
  /* Resolves once finite animations on an element (the hero settle) are over, or after 1.5 s. */
  const settled = el => {
    const anims = (el.getAnimations ? el.getAnimations() : []).filter(a => { try { return Number.isFinite(a.effect.getComputedTiming().endTime); } catch { return false; } });
    return Promise.race([Promise.all(anims.map(a => a.finished)).catch(() => {}), new Promise(res => win.setTimeout(res, 1500))]);
  };

  /* ---------- DOM helpers ---------- */
  const wrapOf = fig => fig.querySelector(':scope > .rv-a > .rv-b');
  const host = fig => wrapOf(fig) || fig;
  function wrap(fig) {
    let b = wrapOf(fig);
    if (b) return b;
    const kids = Array.from(fig.children).filter(n => n.matches('img,picture,canvas,video'));
    const a = doc.createElement('div'); a.className = 'rv-a';
    b = doc.createElement('div'); b.className = 'rv-b';
    a.appendChild(b);
    fig.insertBefore(a, kids[0] || fig.firstChild);
    kids.forEach(k => b.appendChild(k));
    return b;
  }
  function unwrap(fig) {
    const a = fig.querySelector(':scope > .rv-a');
    if (!a) return;
    const b = a.firstElementChild;
    while (b && b.firstChild) fig.insertBefore(b.firstChild, a);
    a.remove();
  }
  const setActive = (imgs, to) => imgs.forEach(i => i.classList.toggle('is-active', i === to));
  const visibleNow = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < win.innerHeight; };

  /* ---------- in-view tracking (one observer for every photo) ---------- */
  const viewFns = new Map();
  const onView = (el, fn) => { const a = viewFns.get(el); if (a) a.push(fn); else { viewFns.set(el, [fn]); io && io.observe(el); } };
  const io = 'IntersectionObserver' in win ? new win.IntersectionObserver(entries => {
    for (const e of entries) {
      const seen = e.isIntersecting && (e.intersectionRatio >= .35 || (!!e.rootBounds && e.intersectionRect.height >= e.rootBounds.height * .35));
      (viewFns.get(e.target) || []).forEach(fn => fn(e.isIntersecting, seen));
    }
    kick();
  }, { threshold: [0, .35] }) : null;

  /* ---------- optional video slot (only when data-video is present; never probed otherwise) ---------- */
  function makeVideo(fig, img, L) {
    const src = (img && img.getAttribute('data-video')) || fig.getAttribute('data-video');
    if (!src || !img) return null;
    let sameOrigin = false;
    try { sameOrigin = new URL(src, doc.baseURI).origin === win.location.origin; } catch { /* keep false */ }
    const V = { el: null, ok: false, bad: false, gl: sameOrigin && !!L, img };
    V.crop = () => {
      if (!V.el) return;
      const cs = win.getComputedStyle(img);
      ['--cx', '--cy', '--cw', '--ch'].forEach(k => { const v = cs.getPropertyValue(k).trim(); if (v) V.el.style.setProperty(k, v); });
    };
    V.drop = () => { if (V.el) { try { V.el.pause(); V.el.removeAttribute('src'); V.el.load(); } catch { /* ignore */ } V.el.remove(); } V.el = null; V.ok = false; };
    V.sync = play => {
      if (play && !V.el && !V.bad) {
        const v = V.el = doc.createElement('video');
        v.className = 'ph__vid'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none'; v.tabIndex = -1;
        v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
        v.poster = img.currentSrc || img.src;
        v.addEventListener('playing', () => { V.ok = true; if (!(V.gl && L && L.shown)) v.classList.add('is-on'); kick(); });
        v.addEventListener('error', () => { V.bad = true; V.drop(); });
        v.src = src;
        host(fig).appendChild(v);
        V.crop();
      }
      if (!V.el) return;
      if (play) { const p = V.el.play(); if (p && p.catch) p.catch(() => {}); } else V.el.pause();
    };
    return V;
  }

  /* ---------- living photos (WebGL) ---------- */
  function makeLiving(fig) {
    const imgs = $$('.ph__img', fig);
    if (!imgs.length) return null;
    const hero = imgs.some(i => i.getAttribute('fetchpriority') === 'high');
    const L = {
      fig, imgs, scope: fig.closest('[data-fx-scope]') || fig,
      shift: parseFloat(fig.dataset.fxShift) || (hero ? 14 : 9),
      cur: imgs.find(i => i.classList.contains('is-active')) || imgs[0],
      nxt: null, mt: 0, dir: 1, tok: 0, done: null,
      gl: null, canvas: null, u: null, v2: false, vtex: null, maxTex: 2048,
      tex: new Map(), geos: new Map(), vids: new Map(),
      w: 0, h: 0, bt: 0, px: newSpring(), py: newSpring(), ptr: null,
      inView: false, seen: false, ready: false, shown: false, dead: false, soft: false, softOn: false, force: false,
      swept: false, sweepAt: 0, sweep: 0, accents: []
    };
    imgs.forEach(i => { const V = makeVideo(fig, i, L); if (V) L.vids.set(i, V); });

    L.size = (w, h) => {
      if (!(w > 0 && h > 0)) return;
      L.w = w; L.h = h; L.geos.clear();
      if (!L.gl) return;
      const sc = Math.min(parseFloat(fig.dataset.fxDpr) || RENDER_SCALE, Math.sqrt(PIXEL_BUDGET / (w * h))) * quality;
      const cw = Math.max(2, Math.round(w * sc)), ch = Math.max(2, Math.round(h * sc));
      if (L.canvas.width !== cw || L.canvas.height !== ch) { L.canvas.width = cw; L.canvas.height = ch; L.gl.viewport(0, 0, cw, ch); }
      if (L.shown) L.draw();
    };

    /* Crop, subject and edge allowance for one image, from the CSS that positions the <img>. */
    L.geo = img => {
      let g = L.geos.get(img);
      if (g) return g;
      const cs = win.getComputedStyle(img);
      const num = (k, d) => { const v = parseFloat(cs.getPropertyValue(k)); return Number.isFinite(v) ? v : d; };
      const cw = num('--cw', 1) || 1, ch = num('--ch', 1) || 1, cx = num('--cx', 0), cy = num('--cy', 0);
      const W = L.w, H = L.h, EW = W / cw, EH = H / ch;                  // the <img> box
      const nw = img.naturalWidth || EW, nh = img.naturalHeight || EH;
      const s = cs.objectFit === 'contain' ? Math.min(EW / nw, EH / nh) : Math.max(EW / nw, EH / nh);
      const DW = nw * s, DH = nh * s;                                    // the painted image inside that box
      const op = (cs.objectPosition || '50% 50%').split(/\s+/);
      const pos = (tok, free) => { const v = parseFloat(tok); return !Number.isFinite(v) ? free / 2 : /%$/.test(tok) ? free * v / 100 : v; };
      const l = cx * EW - pos(op[0], EW - DW), t = cy * EH - pos(op[1], EH - DH);
      const crop = [l / DW, t / DH, W / DW, H / DH];
      const sub = (img.getAttribute('data-subject') || '').trim().split(/[\s,]+/).map(Number);
      const subj = sub.length === 4 && sub.every(Number.isFinite) && sub[2] > 0 && sub[3] > 0
        ? sub : [crop[0] + crop[2] / 2, crop[1] + crop[3] * .55, crop[2] * .3, crop[3] * .4];
      const room = px => clamp(px / L.shift, 0, 1);                      // source margin outside the crop, per side
      g = { crop, subj, edge: [room(l), room(t), room(DW - l - W), room(DH - t - H)], sx: (subj[0] - crop[0]) / crop[2] };
      L.geos.set(img, g);
      return g;
    };

    L.texOf = img => {
      let r = L.tex.get(img);
      if (r) return r.p;
      r = { t: null, p: null };
      L.tex.set(img, r);
      r.p = (async () => {
        if (new URL(img.currentSrc || img.src, doc.baseURI).origin !== win.location.origin) throw new Error('fx: cross-origin image');
        if (!img.complete || !img.naturalWidth) img.loading = 'eager';
        await img.decode();
        if (Math.max(img.naturalWidth, img.naturalHeight) > L.maxTex) throw new Error('fx: image too large');
        let src = img;
        if (win.createImageBitmap) { try { src = await win.createImageBitmap(img); } catch { src = img; } }
        const gl = L.gl;
        if (!gl || gl.isContextLost()) throw new Error('fx: no context');
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        texParams(gl, L.v2);
        if (src !== img && src.close) src.close();
        r.t = t;
        return t;
      })();
      r.p.catch(() => { if (L.tex.get(img) === r) L.tex.delete(img); });
      return r.p;
    };
    function texParams(gl, mip) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    }

    L.start = () => {
      if (L.gl || L.dead || reduced || disposed) return;
      const pref = (fig.closest('[data-fx-gl]') || fig).getAttribute('data-fx-gl') || '';   // "force" | "off" | unset
      L.force = pref === 'force';
      if (pref === 'off' || (softGpu && !L.force)) { L.soften(); return; }
      const c = doc.createElement('canvas');
      c.className = 'ph__gl';
      c.setAttribute('aria-hidden', 'true');
      const opt = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' };
      let gl = null, v2 = false;
      try {
        gl = c.getContext('webgl2', opt); v2 = !!gl;
        gl = gl || c.getContext('webgl', opt) || c.getContext('experimental-webgl', opt);
      } catch { gl = null; }
      if (gl && !L.force) {
        let ren = '';
        try { const x = gl.getExtension('WEBGL_debug_renderer_info'); ren = String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch { ren = ''; }
        if (SOFT_GPU.test(ren)) { softGpu = true; lose(gl); gl = null; }
      }
      const prog = gl && !gl.isContextLost() ? program(gl) : null;
      if (!prog) { if (gl) lose(gl); L.soften(); return; }
      L.gl = gl; L.v2 = v2; L.canvas = c;
      L.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
      L.u = {};
      UNIFORMS.forEach(n => { L.u[n] = gl.getUniformLocation(prog, n); });
      gl.useProgram(prog);
      gl.uniform1i(L.u.uTex, 0); gl.uniform1i(L.u.uTexB, 1);
      gl.uniform1f(L.u.uBias, v2 ? -.5 : 0);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      c.addEventListener('webglcontextlost', () => { if (L.canvas === c) L.soften(true); });
      const tail = imgs[imgs.length - 1];
      tail.parentNode.insertBefore(c, tail.nextSibling);
      const r = fig.getBoundingClientRect();
      L.size(L.w || r.width, L.h || r.height);
      ro && ro.observe(fig);
      const first = async () => {
        let want;
        do { want = L.cur; await L.texOf(want); } while (want !== L.cur && L.gl);
        await settled(want);                                             // the canvas fades in over an identical frame
        if (!L.gl) return;
        L.ready = true;
        L.sync();
        kick();
        if (fine.matches) idle(() => imgs.forEach(i => { if (L.gl && i !== L.cur) L.texOf(i).catch(() => {}); }));
      };
      first().catch(() => L.soften());
    };

    function lose(gl) { try { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch { /* ignore */ } }
    function program(gl) {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
      const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return null;
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, 'p');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      return p;
    }

    L.draw = () => {
      const gl = L.gl, u = L.u, ta = L.tex.get(L.cur);
      if (!gl || !ta || !ta.t) return;
      const tb = L.nxt && L.tex.get(L.nxt);
      const mixing = !!(tb && tb.t);
      const a = L.geo(L.cur), b = mixing ? L.geo(L.nxt) : a;
      let texA = ta.t;
      const V = L.vids.get(L.cur);
      if (V && V.ok && V.gl && V.el && V.el.readyState >= 2) {
        try {
          L.vtex = L.vtex || gl.createTexture();
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, L.vtex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, V.el);
          texParams(gl, false);
          texA = L.vtex;
        } catch { V.gl = false; V.el.classList.add('is-on'); }
      }
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texA);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mixing ? tb.t : texA);
      gl.uniform4fv(u.uCrop, a.crop); gl.uniform4fv(u.uSubject, a.subj); gl.uniform4fv(u.uEdge, a.edge);
      gl.uniform4fv(u.uCropB, b.crop); gl.uniform4fv(u.uSubjectB, b.subj); gl.uniform4fv(u.uEdgeB, b.edge);
      gl.uniform2f(u.uPointer, L.px.x, L.py.x);
      const amp = fine.matches ? L.shift : Math.min(6, L.shift);         // max pixel shift, halved vertically with a mouse
      gl.uniform2f(u.uParallax, 2 * amp / L.w, (fine.matches ? amp : 2 * amp) / L.h);
      gl.uniform1f(u.uMix, mixing ? clamp(ease(L.mt), 1e-4, 1) : 0);
      gl.uniform1f(u.uDir, L.dir);
      gl.uniform1f(u.uBreath, BREATH * .5 * (1 - Math.cos(2 * Math.PI * L.bt / BREATH_PERIOD)));
      gl.uniform1f(u.uSweep, L.sweep);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    L.finish = () => {
      if (!L.nxt) return;
      L.cur = L.nxt; L.nxt = null; L.mt = 0;
      if (!fine.matches && L.gl) L.tex.forEach((r, i) => { if (i !== L.cur && r.t) { L.gl.deleteTexture(r.t); L.tex.delete(i); } });
      L.vsync();
      const d = L.done; L.done = null;
      if (d) d(true);
    };

    L.swap = (to, dir) => {
      L.finish();
      const tok = ++L.tok;
      if (to === L.cur) return Promise.resolve(true);
      return L.texOf(to).then(() => {
        if (tok !== L.tok || !L.gl) return false;
        L.nxt = to; L.dir = dir < 0 ? -1 : 1; L.mt = 0;
        if (!(L.shown && L.inView && running())) { L.finish(); if (L.shown) L.draw(); return true; }
        kick();
        return new Promise(res => { L.done = res; });
      }, () => { L.soften(); return false; });
    };

    L.release = () => { L.accents.splice(0).forEach(el => el.classList.remove('fx-hold')); };
    L.arm = () => { if (L.shown && L.seen && !L.swept) { L.swept = true; L.sweepAt = win.performance.now() + SWEEP_DELAY; } };
    L.vsync = () => L.vids.forEach((V, i) => { if (reduced) V.drop(); else V.sync(running() && L.inView && L.seen && i === L.cur); });
    L.sync = () => {
      fig.classList.toggle('fx-soft', L.softOn && !reduced && !disposed);
      fig.classList.toggle('fx-live', L.softOn && L.inView && running());
      if (L.ready && !L.shown && running()) { L.draw(); L.shown = true; fig.classList.add('fx-ready'); L.arm(); }
      if (L.nxt && !running()) { L.finish(); if (L.shown) L.draw(); }
      L.vsync();
    };

    /* hard = the context is already gone: drop the canvas now. Otherwise fade it out over the <img>. */
    L.kill = hard => {
      const c = L.canvas, gl = L.gl;
      L.finish();
      L.tok++;
      L.gl = L.canvas = L.vtex = null; L.ready = L.shown = false; L.sweepAt = 0; L.sweep = 0;
      L.tex.clear(); L.geos.clear();
      fig.classList.remove('fx-ready');
      L.release();
      L.vids.forEach(V => { if (V.el && V.ok) V.el.classList.add('is-on'); });
      if (!c) return;
      const drop = () => { lose(gl); c.remove(); };
      if (hard || disposed) drop(); else win.setTimeout(drop, 240);
    };

    /* No usable GPU (none, software, lost, or too slow): the photo keeps breathing with a compositor-only CSS scale
     * about its subject, and swaps fall back to the stacked <img> cross-fade. */
    L.soften = hard => {
      if (L.soft || disposed) return;
      L.dead = L.soft = true;
      L.kill(hard);
      settled(L.cur).then(() => {
        if (disposed) return;
        imgs.forEach(i => {
          const s = (i.getAttribute('data-subject') || '').trim().split(/[\s,]+/).map(Number);
          if (s.length >= 2 && Number.isFinite(s[0]) && Number.isFinite(s[1])) i.style.transformOrigin = `${s[0] * 100}% ${s[1] * 100}%`;
        });
        L.softOn = true;
        L.sync();
      });
    };

    L.tick = (dt, now) => {
      if (!L.shown || !L.inView || !running()) return false;
      L.bt += dt;
      if (!fine.matches) {
        const r = fig.getBoundingClientRect(), vh = win.innerHeight;
        L.px.t = 0; L.py.t = clamp((r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
      } else if (L.ptr) {
        const r = L.scope.getBoundingClientRect();
        L.px.t = clamp((L.ptr[0] - r.left) / r.width * 2 - 1, -1, 1);
        L.py.t = clamp((L.ptr[1] - r.top) / r.height * 2 - 1, -1, 1);
      } else { L.px.t = L.py.t = 0; }
      spring(L.px, 36, 12, dt); spring(L.py, 36, 12, dt);                // critically damped, 6/s
      if (L.sweepAt && now >= L.sweepAt) {
        const t = (now - L.sweepAt) / SWEEP_MS;
        if (t >= 1) { L.sweepAt = now + SWEEP_EVERY; L.sweep = 0; L.release(); }   // the light returns every few seconds
        else { L.sweep = Math.max(1e-4, ease(t)); if (-.4 + 1.8 * L.sweep >= L.geo(L.cur).sx) L.release(); }
      }
      if (L.nxt) { L.mt += dt / DISSOLVE; if (L.mt >= 1) L.finish(); }
      L.draw();
      return 2;
    };

    on(L.scope, 'pointermove', e => { if (e.pointerType !== 'touch') L.ptr = [e.clientX, e.clientY]; }, { passive: true });
    on(L.scope, 'pointerleave', () => { L.ptr = null; });
    onView(fig, (inView, seen) => {
      L.inView = inView;
      if (seen && !L.seen) { L.seen = true; L.arm(); }
      L.sync();
    });
    tickers.add(L.tick);
    return L;
  }

  /* ---------- CSS tier: signature-mask reveal, drift, overlay video ---------- */
  function makePhoto(fig) {
    const isLiving = fig.dataset.fx === 'living', drift = fig.dataset.fx === 'drift', wants = fig.hasAttribute('data-fx-reveal');
    const img = fig.querySelector('.ph__img.is-active') || fig.querySelector('.ph__img');
    const P = { fig, inView: false, revealed: !wants || !io || visibleNow(fig), timer: 0, V: isLiving ? null : makeVideo(fig, img, null) };
    if (P.revealed && wants) fig.classList.add('is-revealed');
    P.mode = () => {
      if (!P.revealed) {
        if (!reduced) wrap(fig);
        fig.classList.toggle('fx-rv', !reduced);
        fig.classList.toggle('fx-fade', reduced);
      }
      if (drift && !reduced) wrap(fig);
      fig.classList.toggle('fx-drift', drift && !reduced);
      P.sync();
    };
    P.sync = () => {
      const run = running() && P.inView && P.revealed && !fig.classList.contains('fx-rv');
      fig.classList.toggle('fx-run', run && drift);
      if (P.V) { if (reduced) P.V.drop(); else P.V.sync(run); }
    };
    onView(fig, (inView, seen) => {
      P.inView = inView;
      if (seen && !P.revealed) {
        P.revealed = true;
        fig.classList.add('is-revealed');
        P.timer = win.setTimeout(() => { fig.classList.remove('fx-rv', 'fx-fade'); P.sync(); }, reduced ? 200 : 760);
      }
      P.sync();
    });
    P.mode();
    return P;
  }

  /* ---------- pinned cards: enter after their photo, then a small spring tilt toward the pointer ---------- */
  function makeTilt(scope) {
    const cards = $$('[data-fx-tilt]', scope).map(el => ({ el, x: newSpring(), y: newSpring(), on: false }));
    const fig = scope.querySelector('.ph');
    const T = { ptr: null, timers: [] };
    const clear = c => { c.el.style.rotate = ''; c.el.style.translate = ''; c.on = false; };
    T.mode = () => {
      scope.classList.toggle('fx-tilt-scope', !reduced);
      if (reduced) { T.ptr = null; cards.forEach(c => { c.x = newSpring(); c.y = newSpring(); clear(c); c.el.classList.remove('fx-pre', 'fx-in'); }); }
    };
    if (fig && io && !reduced && !visibleNow(fig)) {
      cards.forEach(c => c.el.classList.add('fx-pre'));
      let entered = false;
      onView(fig, (inView, seen) => {
        if (!seen || entered) return;
        entered = true;
        T.timers.push(win.setTimeout(() => {
          cards.forEach(c => { c.el.classList.add('fx-in'); c.el.classList.remove('fx-pre'); });
          T.timers.push(win.setTimeout(() => cards.forEach(c => c.el.classList.remove('fx-in')), 340));
        }, 120));
      });
    }
    on(scope, 'pointermove', e => { if (e.pointerType === 'touch' || !fine.matches || !running()) return; T.ptr = [e.clientX, e.clientY]; kick(); }, { passive: true });
    on(scope, 'pointerleave', () => { T.ptr = null; kick(); });
    T.tick = dt => {
      const act = T.ptr && running();
      const sr = act ? scope.getBoundingClientRect() : null;
      let alive = false;
      for (const c of cards) {
        let tx = 0, ty = 0;
        if (act && sr.width) {
          const r = c.el.getBoundingClientRect();
          if (r.width) {
            /* The card turns toward the pointer and settles flat as the pointer reaches it, so its text stays crisp to read and click. */
            const k = smooth(Math.hypot(Math.max(r.left - T.ptr[0], 0, T.ptr[0] - r.right), Math.max(r.top - T.ptr[1], 0, T.ptr[1] - r.bottom)) / 90);
            tx = clamp((T.ptr[0] - sr.left) / sr.width * 2 - 1, -1, 1);
            ty = clamp((T.ptr[1] - sr.top) / sr.height * 2 - 1, -1, 1);
            const n = k / Math.max(1, Math.hypot(tx, ty));                // never more than 3 degrees / 4px in total
            tx *= n; ty *= n;
          }
        }
        c.x.t = tx; c.y.t = ty;
        const moving = spring(c.x, 170, 22, dt) | spring(c.y, 170, 22, dt);
        if (moving) alive = true;
        const rx = -c.y.x * 3, ry = c.x.x * 3, ang = Math.hypot(rx, ry);
        if (ang > .01) {
          c.el.style.rotate = `${(rx / ang).toFixed(4)} ${(ry / ang).toFixed(4)} 0 ${ang.toFixed(3)}deg`;
          c.el.style.translate = `${(c.x.x * 4).toFixed(2)}px ${(c.y.x * 4).toFixed(2)}px`;
          c.on = true;
        } else if (c.on) clear(c);
      }
      return alive;
    };
    T.pause = () => { T.ptr = null; };
    T.dispose = () => { T.timers.forEach(t => win.clearTimeout(t)); cards.forEach(c => { clear(c); c.el.classList.remove('fx-pre', 'fx-in'); }); scope.classList.remove('fx-tilt-scope'); };
    tickers.add(T.tick);
    T.mode();
    return T;
  }

  /* ---------- build ---------- */
  const ro = 'ResizeObserver' in win ? new win.ResizeObserver(entries => {
    for (const e of entries) {
      const L = byFig.get(e.target);
      if (!L) continue;
      const b = e.contentBoxSize && e.contentBoxSize[0];
      L.size(b ? b.inlineSize : e.contentRect.width, b ? b.blockSize : e.contentRect.height);
      L.vids.forEach(V => V.crop());
    }
  }) : null;

  const living = $$('[data-fx="living"]').map(makeLiving).filter(Boolean);
  const byFig = new Map(living.map(L => [L.fig, L]));
  const photos = $$('[data-fx="drift"],[data-fx-reveal]').map(makePhoto);
  const tilts = $$('[data-fx-tilt-scope]').map(makeTilt);

  /* The H1 phrase turns green when the light sweep crosses the hand-off. Never held without a live canvas. */
  const accentTimers = [];
  $$('[data-fx-accent]').forEach(el => {
    const sc = el.closest('[data-fx-scope]');
    const L = sc && living.find(l => sc.contains(l.fig));
    /* hold only a phrase that is still ink from first paint; one that is already green must not flicker back */
    if (!L || reduced || !doc.documentElement.classList.contains('fx-pending')) return;
    el.classList.add('fx-hold');
    L.accents.push(el);
    accentTimers.push(win.setTimeout(() => L.release(), 3500));
  });

  const applyMode = () => {
    living.forEach(L => {
      L.fig.classList.toggle('fx-rm', reduced);
      if (reduced) { L.release(); L.kill(); }
      else if (visibleNow(L.fig)) L.start(); else idle(L.start);
      L.sync();
    });
    photos.forEach(P => P.mode());
    tilts.forEach(T => T.mode());
    kick();
  };
  const syncAll = () => { living.forEach(L => L.sync()); photos.forEach(P => P.sync()); if (!running()) tilts.forEach(T => T.pause()); kick(); };
  on(doc, 'visibilitychange', syncAll);
  on(fine, 'change', () => { living.forEach(L => { L.px.t = L.py.t = 0; L.ptr = null; }); });
  applyMode();

  /* ---------- public API ---------- */
  const api = {
    get supported() { return living.some(L => !!L.gl); },
    swap(el, src, { direction = 1 } = {}) {
      if (disposed || !el) return Promise.reject(new Error('fx.swap: no target'));
      const L = byFig.get(el);
      const imgs = L ? L.imgs : $$('.ph__img', el);
      let abs = '';
      try { abs = new URL(src, doc.baseURI).href; } catch { /* keep empty */ }
      const to = imgs.find(i => i.getAttribute('src') === src) || imgs.find(i => abs && (i.currentSrc === abs || i.src === abs));
      if (!to) return Promise.reject(new Error('fx.swap: image not found'));
      setActive(imgs, to);                                               // the <img> stack is always correct underneath
      if (L && L.gl) return L.swap(to, direction);
      if (L) L.cur = to;
      return new Promise(res => win.setTimeout(() => res(true), reduced ? 150 : 300));
    },
    pause() { if (paused) return; paused = true; living.forEach(L => L.release()); syncAll(); },
    resume() { if (!paused) return; paused = false; warm = 30; syncAll(); },
    setReducedMotion(v) { v = !!v; if (v === reduced || disposed) return; reduced = v; applyMode(); },
    refresh() {
      if (disposed) return;
      living.forEach(L => { const r = L.fig.getBoundingClientRect(); L.size(r.width, r.height); L.vids.forEach(V => V.crop()); });
      photos.forEach(P => { if (P.V) P.V.crop(); });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) win.cancelAnimationFrame(raf);
      tickers.clear();
      io && io.disconnect(); ro && ro.disconnect();
      offs.splice(0).forEach(fn => fn());
      accentTimers.forEach(t => win.clearTimeout(t));
      living.forEach(L => { L.release(); L.kill(true); L.vids.forEach(V => V.drop()); L.fig.classList.remove('fx-rm', 'fx-soft', 'fx-live'); if (L.softOn) L.imgs.forEach(i => { i.style.transformOrigin = ''; }); });
      photos.forEach(P => { win.clearTimeout(P.timer); if (P.V) P.V.drop(); P.fig.classList.remove('fx-rv', 'fx-fade', 'fx-drift', 'fx-run'); unwrap(P.fig); });
      tilts.forEach(T => T.dispose());
      if (instances.get(root) === api) { instances.delete(root); style.remove(); }
    }
  };
  instances.set(root, api);
  return api;
}

export default initFx;
