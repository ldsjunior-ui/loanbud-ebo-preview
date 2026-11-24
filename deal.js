/* LoanBud · Employee Buyout Financing v3 · "Build your buyout"
   ES module. Renders inside the element passed to initDeal() and nowhere else.
   No dependencies, no canvas. CSS is injected once in @layer deal, every class is prefixed deal-.

   export function initDeal(rootEl, { onComplete, onChange, reducedMotion, initial })
     -> { reset(), destroy(), getState(), setReducedMotion(bool) }
   export function computeDeal(input)      pure model (same maths as v2)
   export function toFormFields(state)     { calc_price, ... } for the consultation form
   export function dealSummary(state)      "SBA $1.99M · Note $100K · Equity $121K · 1.30×"
   Events on rootEl (bubbling): deal:change (at most 1 per 150 ms), deal:complete. detail = state. */

const SUB = 1 / 120;            // physics substep, constant
const K = 170;                  // spring stiffness
const C = 2 * Math.sqrt(K);     // critical damping
const BAL_TOL = 2500;
const N_MONTHS = 120;
const SBA_MIN = 350001;
const SBA_MAX = 5000000;
const MONEY_CAP = 1e9;
const CHECK_KEYS = ['balanced', 'equity', 'coverage', 'program'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const toNum = (v, d) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : d;
  if (typeof v === 'string') { const n = parseFloat(v.replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : d; }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return d;
};
const money = (v, d = 0) => Math.max(0, Math.min(MONEY_CAP, Math.round(toNum(v, d))));
const fmt = (n) => '$' + Math.round(Math.abs(n) || 0).toLocaleString('en-US');
const fmtShort = (n) => {
  n = Math.abs(n) || 0;
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
};
const fmtX = (v) => (Number.isFinite(v) ? v.toFixed(2) + '×' : '–');
const r10 = (n) => Math.round(n / 10) * 10;
const pctOf = (v, d, cap) => { let n = toNum(v, NaN); if (!Number.isFinite(n)) return d; if (n > 1) n /= 100; return clamp(n, 0, cap); };
const rateOf = (v, d) => { let n = toNum(v, NaN); if (!Number.isFinite(n)) return d; if (n >= 1) n /= 100; return clamp(n, 0, 0.3); };

/* ───────────────────────── model (pure) ───────────────────────── */
export const ASSUMPTIONS = Object.freeze({
  price: 2000000, closing: 60000, workingCapital: 150000, cashFlow: 420000,
  rate: 0.105, termYears: 10, equityReqPct: 0.10, noteStandby: true, noteRate: 0.06,
});
export const START_STACK = Object.freeze({ buyerCash: 80000, sellerNote: 100000, sba: 1900000 });
const KEYS = new Set(['price', 'closing', 'workingCapital', 'cashFlow', 'rate', 'equityReqPct', 'noteStandby', 'noteRate', 'buyerCash', 'sellerNote', 'sba']);
const ALIAS = { equity: 'buyerCash', cash: 'buyerCash', note: 'sellerNote', standby: 'noteStandby', wc: 'workingCapital', closingCosts: 'closing', working_capital: 'workingCapital' };

function normPartial(p) {
  const o = {};
  if (!p || typeof p !== 'object') return o;
  for (const k of Object.keys(p)) { const key = ALIAS[k] || k; if (KEYS.has(key)) o[key] = p[k]; }
  return o;
}

export function pmt(P, r, n = N_MONTHS) {
  P = Math.max(0, toNum(P, 0)); r = Math.max(0, toNum(r, 0)); n = Math.max(1, Math.round(toNum(n, N_MONTHS)));
  if (P === 0) return 0;
  if (r === 0) return P / n;
  const i = r / 12;
  return (P * i) / (1 - Math.pow(1 + i, -n));
}

/** Pure model. Money in whole dollars; rates as decimals (0.105 = 10.5%; values above 1 are read as percent). */
export function computeDeal(input) {
  const i = normPartial(input);
  const g = (k, d) => (i[k] === undefined || i[k] === null || i[k] === '' ? d : i[k]);
  const price = money(g('price', ASSUMPTIONS.price), ASSUMPTIONS.price);
  const closing = money(g('closing', ASSUMPTIONS.closing), ASSUMPTIONS.closing);
  const workingCapital = money(g('workingCapital', ASSUMPTIONS.workingCapital), ASSUMPTIONS.workingCapital);
  const cashFlow = money(g('cashFlow', ASSUMPTIONS.cashFlow), ASSUMPTIONS.cashFlow);
  const rate = rateOf(g('rate', ASSUMPTIONS.rate), ASSUMPTIONS.rate);
  const noteRate = rateOf(g('noteRate', ASSUMPTIONS.noteRate), ASSUMPTIONS.noteRate);
  const equityReqPct = Math.round(pctOf(g('equityReqPct', ASSUMPTIONS.equityReqPct), ASSUMPTIONS.equityReqPct, 1) * 10000) / 10000;
  const sv = g('noteStandby', ASSUMPTIONS.noteStandby);
  const noteStandby = !(sv === false || sv === 0 || sv === 'false' || sv === '0' || sv === 'off');
  const uses = price + closing + workingCapital;
  const buyerCash = Math.min(money(g('buyerCash', START_STACK.buyerCash)), uses);
  const sellerNote = Math.min(money(g('sellerNote', START_STACK.sellerNote)), uses - buyerCash);
  const sba = money(g('sba', START_STACK.sba));

  const requiredEquity = Math.round(uses * equityReqPct);
  const countedNote = noteStandby ? Math.min(sellerNote, Math.floor(0.5 * requiredEquity)) : 0;
  const equityCounted = buyerCash + countedNote;
  const sources = sba + sellerNote + buyerCash;
  const gap = uses - sources;
  const monthlyPayment = Math.round(pmt(sba, rate, N_MONTHS));
  const notePayment = noteStandby ? 0 : Math.round(pmt(sellerNote, noteRate, N_MONTHS));
  const annualDS = 12 * (monthlyPayment + notePayment);
  const dsc = annualDS > 0 ? cashFlow / annualDS : Infinity;
  const dscBand = dsc < 1.25 ? 'fail' : dsc < 1.5 ? 'thin' : 'comfortable';
  const program = sba < SBA_MIN ? 'below' : sba <= SBA_MAX ? 'standard' : 'above';
  const checks = { balanced: Math.abs(gap) <= BAL_TOL, equity: equityCounted >= requiredEquity, coverage: dsc >= 1.25, program: program === 'standard' };
  const passCount = CHECK_KEYS.reduce((n, k) => n + (checks[k] ? 1 : 0), 0);
  return {
    price, closing, workingCapital, cashFlow, rate, termYears: 10, equityReqPct,
    buyerCash, sellerNote, noteStandby, noteRate, sba,
    derived: {
      uses, sources, gap, requiredEquity, countedNote, equityCounted,
      monthlyPayment, notePayment, annualDS, dsc, dscBand, program, checks, passCount, won: passCount === 4,
    },
  };
}
const toRaw = (d) => ({
  price: d.price, closing: d.closing, workingCapital: d.workingCapital, cashFlow: d.cashFlow, rate: d.rate,
  equityReqPct: d.equityReqPct, noteStandby: d.noteStandby, noteRate: d.noteRate,
  buyerCash: d.buyerCash, sellerNote: d.sellerNote, sba: d.sba,
});
const snapshot = (d) => ({ ...d, derived: { ...d.derived, checks: { ...d.derived.checks } } });

/** Values for the consultation form's hidden fields (names per the page spec). */
export function toFormFields(state) {
  const d = state && state.derived ? state : computeDeal(state), D = d.derived;
  return {
    calc_price: d.price, calc_closing: d.closing, calc_working_capital: d.workingCapital, calc_cash_flow: d.cashFlow,
    calc_rate: Math.round(d.rate * 10000) / 100, calc_equity_req_pct: Math.round(d.equityReqPct * 10000) / 100,
    calc_buyer_equity: d.buyerCash, calc_seller_note: d.sellerNote, calc_note_standby: d.noteStandby ? 'yes' : 'no',
    calc_sba_amount: d.sba, calc_monthly_payment: D.monthlyPayment + D.notePayment,
    calc_dsc: Number.isFinite(D.dsc) ? D.dsc.toFixed(2) : '', calc_checks_passed: D.passCount,
  };
}
/** Short line for the form's summary chip. */
export function dealSummary(state) {
  const d = state && state.derived ? state : computeDeal(state);
  return 'SBA ' + fmtShort(d.sba) + ' · Note ' + fmtShort(d.sellerNote) + ' · Equity ' + fmtShort(d.buyerCash) + ' · ' + fmtX(d.derived.dsc);
}

/* ───────────────────────── copy ───────────────────────── */
const T = {
  pill: 'Hypothetical example',
  intro: 'A machine shop, five managers, one gap to close. Move the three layers until the funding covers the cost and the cash flow carries the payments.',
  note: 'Rates, costs and requirements are editable assumptions, not a quote or an offer of credit.',
  cta: 'Book a free buyout consultation',
  winT: 'It pencils out, on paper.',
  winB: 'These numbers pass four basic checks. A lender will still review the real records, the valuation and the buyers. Your numbers come with you.',
  band: { none: 'No debt payments yet', fail: 'Below the minimum', thin: 'Meets the minimum, thin cushion', comfortable: 'Comfortable cushion' },
  check: { balanced: 'Funding covers the cost', equity: 'Equity covered', coverage: 'Coverage at or above 1.25×', program: 'Within Standard SBA 7(a) range' },
};
/* funding layers and cost parts, listed top to bottom as they stack */
const FUND = [
  { k: 'buyerCash', name: 'Team equity', max: 500000, step: 1000, page: 25000 },
  { k: 'sellerNote', name: 'Seller note', max: 500000, step: 5000, page: 25000 },
  { k: 'sba', name: 'SBA 7(a) financing', max: 5500000, step: 1000, page: 100000 },
];
const COST = [
  { k: 'workingCapital', name: 'Working capital' },
  { k: 'closing', name: 'Closing costs' },
  { k: 'price', name: 'Purchase price' },
];
const FIELDS = [
  { k: 'price', kind: 'money', label: 'Purchase price' },
  { k: 'closing', kind: 'money', label: 'Closing costs (estimate)' },
  { k: 'workingCapital', kind: 'money', label: 'Working capital' },
  { k: 'cashFlow', kind: 'money', label: 'Business cash flow', hint: 'Average of the last two fiscal years. Past results, not projections.' },
  { k: 'rate', kind: 'pct', label: 'SBA rate assumption' },
  { k: 'equityReqPct', kind: 'pct', label: 'Equity requirement assumption', hint: 'Depends on how the deal is classified.' },
];
const STANDBY_HINT = 'In this model, only a note on full standby counts toward equity, and it adds no monthly payment.';

/* ───────────────────────── icons ───────────────────────── */
const svg = (d, cls) => '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 20 20" aria-hidden="true" focusable="false">' + d + '</svg>';
const I_MINUS = svg('<path d="M5 10h10"/>');
const I_PLUS = svg('<path d="M10 5v10M5 10h10"/>');
const I_CHECK = svg('<circle cx="10" cy="10" r="9.25"/><path d="M6 10.4l2.7 2.6L14 7.4"/>', 'deal-ck');
const I_RESET = svg('<path d="M4.5 10a5.5 5.5 0 1 0 1.7-4M4.5 3.8V7h3.2"/>');

/* ───────────────────────── styles ───────────────────────── */
const CSS = `@layer deal{
.deal-ui{--dg:var(--green,#00A35B);--dgh:var(--green-hover,#008F50);--do:var(--oasis,#89CDAD);--dc:var(--citron,#EDB74B);--di:var(--ink,#0B0C3D);--dt:var(--text,#5F6B76);--dp:var(--panel,#F3F6F5);--dl:var(--line,#E3E1DB);--dn1:var(--neutral-1,#E6ECED);--dn2:var(--neutral-2,#CDD9DC);
--dfd:var(--font-display,"Outfit","Avenir Next","Century Gothic","Segoe UI",sans-serif);--dfb:var(--font-body,"Helvetica Neue","Inter",Helvetica,Arial,sans-serif);--de:var(--ease-out,cubic-bezier(.2,.7,.2,1));
--H:184px;--lw:110px;--cw:84px;--gw:64px;--cr:28px;
position:relative;display:grid;gap:16px;min-width:0;color:var(--dt);font:400 15px/1.45 var(--dfb);text-align:left;font-variant-ligatures:no-common-ligatures;-webkit-tap-highlight-color:transparent}
:where([data-deal],.deal):has(>.deal-ui){min-height:auto;flex-shrink:0}
.deal-ui *,.deal-ui *::before,.deal-ui *::after{box-sizing:border-box}
.deal-ui :where(h3,p,ul,li){margin:0;padding:0;list-style:none}
.deal-ui :where(button,input){font:inherit;color:inherit;margin:0}
.deal-ui [hidden]{display:none!important}
.deal-ui :focus-visible{outline:2px solid var(--di);outline-offset:3px}
.deal-ui[data-w=l]{--cr:36px}
@media (min-height:860px){.deal-ui[data-w=l]{gap:22px}}
.deal-num{font-variant-numeric:tabular-nums}
.deal-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.deal-top{display:grid;gap:10px;justify-items:start}
.deal-pill{padding:3px 8px;border:1px solid var(--dl);border-radius:4px;font:700 11px/14px var(--dfd);letter-spacing:.08em;text-transform:uppercase;color:var(--dt)}
.deal-intro{max-width:70ch;font:300 16px/24px var(--dfb)}

.deal-main{display:grid;gap:20px;min-width:0}
.deal-ui[data-w=m] .deal-main{grid-template-columns:auto minmax(0,1fr);column-gap:28px;align-items:end}
.deal-ui[data-w=m] .deal-read{grid-column:1/-1}
.deal-ui[data-w=l] .deal-main{grid-template-columns:auto minmax(0,1fr) clamp(244px,29%,296px);column-gap:24px;align-items:end}

.deal-stage{width:calc(var(--lw) + var(--cw)*2 + var(--gw));max-width:100%}
.deal-ui[data-w=s] .deal-stage{margin-inline:auto}
.deal-heads{display:grid;grid-template-columns:var(--cw) var(--cw);column-gap:var(--gw);align-items:end;margin:0 0 10px var(--lw)}
.deal-ui[data-w=s] .deal-heads{grid-template-columns:1fr 1fr;column-gap:0;width:calc(var(--cw)*2 + var(--gw))}
.deal-ui[data-w=s] .deal-heads>div:last-child{text-align:right}
.deal-ui[data-w=s] .deal-tot{font-size:15px}
.deal-h{font:600 13px/16px var(--dfd);color:var(--dt)}
.deal-tot{font:600 16px/22px var(--dfd);color:var(--di)}
.deal-plot{position:relative;height:var(--H)}
.deal-plot::after{content:"";position:absolute;left:0;right:0;top:100%;height:1px;background:var(--dl)}
.deal-col{position:absolute;top:0;bottom:0;left:var(--lw);width:var(--cw)}
.deal-col--fund{left:calc(var(--lw) + var(--cw) + var(--gw))}
.deal-clip{position:absolute;inset:0;overflow:hidden;border-radius:0 var(--cr) 0 0}
.deal-clip-in{position:absolute;inset:0}
.deal-seg{position:absolute;inset:0;transform-origin:50% 100%;transform:scaleY(0);transition:opacity .15s var(--de)}
.deal-seg[data-k=price]{background:var(--dn2)}
.deal-seg[data-k=closing]{background:var(--dn1)}
.deal-seg[data-k=workingCapital]{background:var(--dl)}
.deal-seg[data-k=sba]{background:var(--dg)}
.deal-seg[data-k=sellerNote]{background:var(--do)}
.deal-seg[data-k=buyerCash]{background:var(--di)}
.deal-ui[data-hot] .deal-col--fund .deal-seg{opacity:.55}
.deal-ui[data-hot=sba] .deal-seg[data-k=sba],.deal-ui[data-hot=sellerNote] .deal-seg[data-k=sellerNote],.deal-ui[data-hot=buyerCash] .deal-seg[data-k=buyerCash]{opacity:1}
.deal-labs{position:absolute;left:0;top:0;width:calc(var(--lw) - 22px);height:100%}
.deal-lab{position:absolute;right:0;top:0;display:grid;justify-items:end;text-align:right;white-space:nowrap}
.deal-lab-n{font:400 12px/15px var(--dfb);color:var(--dt)}
.deal-lab-v{font:600 13px/16px var(--dfd);color:var(--di)}
.deal-lead{position:absolute;left:calc(var(--lw) - 18px);top:0;width:16px;height:100%;overflow:visible;fill:none;stroke:var(--dt);stroke-width:1;shape-rendering:crispEdges}
.deal-level{position:absolute;left:calc(var(--lw) - 8px);top:-1px;width:calc(var(--cw)*2 + var(--gw) + 16px);height:0;border-top:1.5px dashed var(--di);transition:border-color .4s var(--de)}
.deal-ui[data-state=won] .deal-level{border-top-color:var(--dg)}
.deal-gap{position:absolute;left:calc(var(--lw) + var(--cw));top:0;width:var(--gw);display:grid;justify-items:center;text-align:center;font:400 12px/15px var(--dfb);color:var(--dt)}
.deal-gap b{font:600 13px/16px var(--dfd);color:var(--di)}

.deal-ctls{display:grid;gap:8px;min-width:0}
.deal-ctl{--sw:var(--dg);display:grid;grid-template-columns:minmax(0,1fr);gap:6px 12px;align-items:center;min-width:0}
.deal-ui[data-c=row] .deal-ctl{grid-template-columns:minmax(0,1fr) 164px}
.deal-ui[data-c=row] .deal-rng{grid-column:1/-1}
.deal-ui[data-c=row] .deal-ctls{gap:12px}
.deal-ui[data-w=s] .deal-gap b{font-size:12px}
.deal-ctl[data-k=sellerNote]{--sw:var(--do)}
.deal-ctl[data-k=buyerCash]{--sw:var(--di)}
.deal-ctl-l{display:inline-flex;align-items:center;gap:8px;min-width:0;font:600 14px/18px var(--dfd);color:var(--di);cursor:pointer}
.deal-sw{width:12px;height:12px;flex:none;background:var(--sw);border-radius:0 5px 0 0}
.deal-ctl-row{display:flex;align-items:stretch;height:34px;min-width:0;border:1px solid var(--dl);border-radius:8px;background:#fff;overflow:hidden;transition:border-color .15s var(--de)}
.deal-ctl-row:hover{border-color:var(--dt)}
.deal-ctl-row:focus-within{border-color:var(--di)}
.deal-ctl-v{flex:1;min-width:0;width:100%;padding:0 4px;border:0;border-inline:1px solid var(--dl);background:transparent;font:600 15px/1 var(--dfd);color:var(--di);text-align:center}
.deal-ui .deal-ctl-v:focus-visible{outline-offset:-2px;border-radius:3px}
.deal-step{width:34px;flex:none;display:grid;place-items:center;padding:0;border:0;background:#fff;color:var(--di);cursor:pointer;touch-action:manipulation;transition:background-color .15s var(--de)}
.deal-step:hover{background:var(--dp)}
.deal-step:active{background:var(--dn1)}
.deal-ui .deal-step:focus-visible{outline-offset:-3px;border-radius:7px}
.deal-step svg,.deal-reset svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.deal-rng{position:relative;min-width:0;height:24px;display:flex;align-items:center}
.deal-rng::before{content:"";position:absolute;left:0;right:0;top:10px;height:4px;border-radius:2px;background:var(--dl)}
.deal-rng::after{content:"";position:absolute;left:0;top:10px;width:11px;height:4px;border-radius:2px 0 0 2px;background:var(--sw)}
.deal-rng-fill{position:absolute;left:10px;right:10px;top:10px;height:4px;background:var(--sw);transform-origin:0 50%;transform:scaleX(0)}
.deal-rng input{position:relative;z-index:1;width:100%;height:24px;padding:0;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer;touch-action:pan-y}
.deal-rng input:focus-visible{outline-offset:1px;border-radius:6px}
.deal-rng input::-webkit-slider-runnable-track{height:24px;background:transparent}
.deal-rng input::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;margin-top:2px;background:#fff;border:1.5px solid var(--di);border-radius:4px 9px 4px 4px;transition:transform .15s var(--de)}
.deal-rng input:active::-webkit-slider-thumb{transform:scale(1.1)}
.deal-rng input::-moz-range-track{height:24px;background:transparent}
.deal-rng input::-moz-range-thumb{box-sizing:border-box;width:20px;height:20px;background:#fff;border:1.5px solid var(--di);border-radius:4px 9px 4px 4px}
@media (pointer:coarse){.deal-ctl-row{height:44px}.deal-step{width:44px}.deal-ctl-v{font-size:16px}.deal-rng,.deal-rng input{height:36px}.deal-rng::before,.deal-rng::after,.deal-rng-fill{top:16px}.deal-rng input::-webkit-slider-runnable-track{height:36px}.deal-rng input::-webkit-slider-thumb{width:24px;height:24px;margin-top:6px}.deal-rng input::-moz-range-track{height:36px}.deal-rng input::-moz-range-thumb{width:24px;height:24px}.deal-rng-fill{left:12px;right:12px}.deal-rng::after{width:13px}.deal-ui[data-c=row] .deal-ctl{grid-template-columns:minmax(0,1fr) 188px}}

.deal-read{display:grid;gap:16px;align-content:space-between;min-width:0;padding:20px;background:var(--dp);border-radius:14px 40px 14px 14px}
.deal-ui[data-w=l] .deal-read{align-self:stretch}
.deal-ui[data-w=m] .deal-read{grid-template-columns:1fr 1fr;column-gap:32px;align-items:start}
.deal-k{font:600 13px/16px var(--dfd);color:var(--dt)}
.deal-pay-v{margin-top:4px;font:600 36px/40px var(--dfd);letter-spacing:-.01em;color:var(--di);white-space:nowrap}
.deal-pay-v small{margin-left:4px;font:500 15px/1 var(--dfd);letter-spacing:0;color:var(--dt)}
.deal-cap{margin-top:4px;font-size:13px;line-height:18px}
.deal-cov-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.deal-cov-v{font:600 20px/24px var(--dfd);color:var(--di)}
.deal-band{font-size:13px;line-height:18px;color:var(--di)}
.deal-meter{position:relative;height:8px;margin:10px 0 20px;background:#fff;border-radius:2px}
.deal-meter-fill{position:absolute;inset:0;border-radius:2px;background:var(--dc);transform-origin:0 50%;transform:scaleX(0);transition:background-color .24s var(--de)}
.deal-read[data-band=thin] .deal-meter-fill{background:var(--do)}
.deal-read[data-band=comfortable] .deal-meter-fill,.deal-read[data-band=none] .deal-meter-fill{background:var(--dg)}
.deal-meter-c{position:absolute;inset:-4px -2px;overflow:hidden}
.deal-meter-m{position:absolute;inset:0 2px}
.deal-meter-m::before{content:"";position:absolute;left:-1.5px;top:0;width:3px;height:16px;border-radius:1px;background:var(--di)}
.deal-meter-t{position:absolute;left:62.5%;top:-3px;width:1px;height:14px;background:var(--dt)}
.deal-meter-tl{position:absolute;left:62.5%;top:14px;transform:translateX(-50%);font:400 11px/14px var(--dfb);white-space:nowrap}

.deal-checks{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
.deal-ui[data-w=l] .deal-checks{grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}
.deal-chk{position:relative;display:flex;align-items:flex-start;gap:8px;padding-top:11px;border-top:1px solid var(--dl);font:600 14px/18px var(--dfd);color:var(--dt);transition:color .24s var(--de)}
.deal-chk::before{content:"";position:absolute;left:0;right:0;top:-1px;height:3px;background:var(--dg);transform:scaleX(0);transform-origin:0 50%;transition:transform .4s var(--de)}
.deal-chk.is-pass{color:var(--di)}
.deal-chk.is-pass::before{transform:scaleX(1)}
.deal-ck{width:18px;height:18px;flex:none}
.deal-ck circle{fill:#fff;stroke:var(--dt);stroke-width:1.5;transition:fill .24s var(--de),stroke .24s var(--de)}
.deal-ck path{fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:12;stroke-dashoffset:12;transition:stroke-dashoffset .3s var(--de) .08s}
.deal-chk.is-pass .deal-ck circle{fill:var(--dg);stroke:var(--dg)}
.deal-chk.is-pass .deal-ck path{stroke-dashoffset:0}
.deal-checks.is-seq .deal-chk::before{animation:deal-rule .4s var(--de) both;animation-delay:calc(var(--i)*120ms)}
.deal-checks.is-seq .deal-ck path{animation:deal-draw .3s var(--de) both;animation-delay:calc(var(--i)*120ms + 120ms)}
@keyframes deal-rule{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes deal-draw{from{stroke-dashoffset:12}to{stroke-dashoffset:0}}

.deal-next{display:grid;min-width:0}
.deal-hintrow{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 24px;min-height:40px}
.deal-ui[data-w=l] .deal-hintrow{min-height:68px}
.deal-hint{flex:1 1 260px;max-width:64ch;font-size:14px;line-height:20px;color:var(--di)}
.deal-assist{min-height:40px;padding:0 16px;border:1.5px solid var(--di);border-radius:10px;background:#fff;font:600 15px/1.2 var(--dfd);color:var(--di);cursor:pointer;transition:background-color .15s var(--de),transform .15s var(--de)}
.deal-assist:hover{background:var(--dp)}
.deal-assist:active{transform:scale(.98)}
.deal-win{display:grid;gap:12px 28px;align-items:center;opacity:0;transform:translateY(10px);transition:opacity .3s var(--de),transform .3s var(--de)}
.deal-win.is-in{opacity:1;transform:none}
.deal-ui:not([data-w=s]) .deal-win{grid-template-columns:minmax(0,1fr) auto}
.deal-win-t{font:600 20px/26px var(--dfd);color:var(--di)}
.deal-win-b{margin-top:2px;max-width:66ch;font-size:14px;line-height:20px}
.deal-cta{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:6px 28px;border-radius:10px;background:var(--dg);font:700 19px/1.15 var(--dfd);color:#fff;text-align:center;text-decoration:none;transition:background-color .15s var(--de),transform .15s var(--de)}
.deal-cta:hover{background:var(--dgh);color:#fff}
.deal-cta:active{transform:scale(.98)}

.deal-foot{display:grid;gap:6px 24px;align-items:start;padding-top:8px;border-top:1px solid var(--dl)}
.deal-ui[data-w=l] .deal-foot{grid-template-columns:172px minmax(0,1fr) auto;column-gap:20px}
.deal-ui[data-w=m] .deal-foot{grid-template-columns:minmax(0,1fr) auto}
.deal-ui[data-w=m] .deal-note{grid-column:1/-1;grid-row:2}
.deal-ui[data-w=m] .deal-reset{grid-column:2;grid-row:1}
.deal-ui:not([data-w=s]) .deal-asm{grid-column:1/-1;grid-row:1}
.deal-ui[data-w=l] .deal-note{grid-column:2;grid-row:1;padding-top:8px}
.deal-ui[data-w=l] .deal-reset{grid-column:3;grid-row:1}
.deal-asm summary,.deal-reset{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:0;border:0;background:none;font:600 14px/18px var(--dfd);color:var(--di);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px;cursor:pointer}
.deal-asm summary{list-style:none}
.deal-asm summary::-webkit-details-marker{display:none}
.deal-asm summary svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;transition:transform .24s var(--de)}
.deal-asm[open] summary svg{transform:rotate(45deg)}
.deal-reset{justify-self:start}
.deal-note{font-size:12px;line-height:17px}
.deal-asm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px 20px;margin-top:18px;padding-bottom:6px}
.deal-f{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;align-content:start;min-width:0}
.deal-f label,.deal-f-l{font:600 13px/16px var(--dfd);color:var(--di)}
.deal-inp{display:flex;align-items:center;gap:6px;height:44px;padding:0 12px;border:1px solid var(--dl);border-radius:10px;background:#fff;color:var(--dt)}
.deal-inp:focus-within{border:2px solid var(--di);padding:0 11px}
.deal-inp input{flex:1;width:100%;min-width:0;height:100%;padding:0;border:0;outline:0;background:transparent;font:400 16px/1 var(--dfb);color:var(--di)}
.deal-ui .deal-inp input:focus-visible{outline:0}
.deal-fh{font-size:12px;line-height:16px}
.deal-tog{display:flex;align-items:center;gap:10px;min-height:44px;font-size:14px;color:var(--di)}
.deal-switch{position:relative;width:48px;height:28px;flex:none;padding:0;border:1.5px solid var(--di);border-radius:9px;background:#fff;cursor:pointer;transition:background-color .15s var(--de),border-color .15s var(--de)}
.deal-switch::after{content:"";position:absolute;left:3px;top:3px;width:19px;height:19px;border-radius:3px 7px 3px 3px;background:var(--di);transition:transform .24s var(--de),background-color .15s var(--de)}
.deal-switch[aria-checked=true]{background:var(--dg);border-color:var(--dg)}
.deal-switch[aria-checked=true]::after{transform:translateX(20px);background:#fff}

.deal-bar{display:none}
.deal-ui[data-w=s][data-read="0"] .deal-bar{display:flex;position:sticky;bottom:0;z-index:2;align-items:baseline;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--dl);background:#fff;font:600 14px/20px var(--dfd);color:var(--dt)}
.deal-bar b{font:600 20px/24px var(--dfd);color:var(--di)}
.deal-ui[data-w=s] .deal-cta,.deal-ui[data-w=s] .deal-assist{width:100%}
.deal-ui[data-rm="1"] *,.deal-ui[data-rm="1"] *::before,.deal-ui[data-rm="1"] *::after{transition-duration:.01ms!important;animation-duration:.01ms!important;animation-delay:0s!important}
}`;

let styleRefs = 0;
function addStyles(doc) {
  styleRefs++;
  if (doc.getElementById('deal-css')) return;
  const s = doc.createElement('style');
  s.id = 'deal-css';
  s.textContent = CSS;
  doc.head.appendChild(s);
}
function dropStyles(doc) {
  if (--styleRefs > 0) return;
  styleRefs = 0;
  const s = doc.getElementById('deal-css');
  if (s) s.remove();
}

/* text the dialog already shows outside the builder, so nothing is said twice */
function textAround(rootEl) {
  const host = rootEl.closest('dialog') || rootEl.parentElement;
  if (!host) return '';
  rootEl.setAttribute('data-deal-self', '');
  const c = host.cloneNode(true);
  rootEl.removeAttribute('data-deal-self');
  const me = c.querySelector('[data-deal-self]');
  if (me) me.remove();
  return (c.textContent || '').replace(/\s+/g, ' ').toLowerCase();
}

function parseMoney(s) {
  s = String(s).trim().toLowerCase().replace(/[$,\s]/g, '');
  let m = 1;
  if (/k$/.test(s)) { m = 1e3; s = s.slice(0, -1); } else if (/m$/.test(s)) { m = 1e6; s = s.slice(0, -1); }
  const n = parseFloat(s);
  return Number.isFinite(n) ? clamp(Math.round(n * m), 0, 100000000) : null;
}
function parsePct(s, max) {
  const n = parseFloat(String(s).replace(/[%\s,]/g, ''));
  return Number.isFinite(n) ? clamp(n, 0, max) / 100 : null;
}
const GRID = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000];
const nice = (x) => { for (const n of GRID) if (n >= x) return n; return 250000; };

let SEQ = 0;

/* ───────────────────────── builder ───────────────────────── */
export function initDeal(rootEl, opts = {}) {
  if (!rootEl || rootEl.nodeType !== 1) throw new TypeError('initDeal: a root element is required');
  if (rootEl.__deal) return rootEl.__deal;
  const { onComplete, onChange, initial } = opts;
  const doc = rootEl.ownerDocument;
  const win = doc.defaultView;
  const id = 'deal' + (++SEQ);
  const ac = new AbortController();
  const on = (el, ev, fn, o) => el.addEventListener(ev, fn, { ...(o || {}), signal: ac.signal });
  let dead = false;

  addStyles(doc);
  const fallback = rootEl.querySelector('.deal-fallback');
  const fallbackWasHidden = fallback ? fallback.hidden : false;
  const around = textAround(rootEl);
  if (fallback) fallback.hidden = true;
  const missing = (s) => around.indexOf(s.toLowerCase()) === -1;

  /* ── state ── */
  let raw = toRaw(computeDeal(initial));
  let deal = computeDeal(raw);
  const mq = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let rmOpt = !!opts.reducedMotion;
  let rm = rmOpt || !!(mq && mq.matches);

  /* ── DOM ── */
  const ui = doc.createElement('div');
  ui.className = 'deal-ui';
  ui.dataset.w = 's';
  ui.dataset.state = 'building';
  ui.dataset.read = '1';
  ui.dataset.c = 'row';
  if (rm) ui.dataset.rm = '1';
  const seg = (k) => '<i class="deal-seg" data-k="' + k + '"></i>';
  const col = (mod, keys) => '<div class="deal-col deal-col--' + mod + '" aria-hidden="true"><div class="deal-clip"><div class="deal-clip-in">' + keys.map(seg).join('') + '</div></div></div>';
  const showPill = missing(T.pill), showIntro = missing(T.intro);
  ui.innerHTML =
    (showPill || showIntro ? '<div class="deal-top">' + (showPill ? '<span class="deal-pill">' + T.pill + '</span>' : '') + (showIntro ? '<p class="deal-intro">' + T.intro + '</p>' : '') + '</div>' : '') +
    '<div class="deal-main">' +
      '<div class="deal-stage" role="group" aria-label="What it costs and how it is funded">' +
        '<div class="deal-heads">' +
          '<div><h3 class="deal-h">What it costs</h3><p class="deal-tot deal-num" data-el="uses"></p></div>' +
          '<div><h3 class="deal-h">How it’s funded</h3><p class="deal-tot deal-num" data-el="sources"></p></div>' +
        '</div>' +
        '<div class="deal-plot">' +
          '<ul class="deal-labs">' + COST.map((c) => '<li class="deal-lab" data-k="' + c.k + '"><span class="deal-lab-n">' + c.name + '</span><span class="deal-lab-v deal-num"></span></li>').join('') + '</ul>' +
          '<svg class="deal-lead" aria-hidden="true" focusable="false"><path/><path/><path/></svg>' +
          col('cost', ['price', 'closing', 'workingCapital']) +
          '<p class="deal-gap"><span data-el="gapw"></span><b class="deal-num" data-el="gapv"></b></p>' +
          col('fund', ['sba', 'sellerNote', 'buyerCash']) +
          '<i class="deal-level" aria-hidden="true"></i>' +
        '</div>' +
      '</div>' +
      '<div class="deal-ctls" role="group" aria-label="How it’s funded: three layers">' +
        FUND.map((f) =>
          '<div class="deal-ctl" data-k="' + f.k + '">' +
            '<label class="deal-ctl-l" for="' + id + '-' + f.k + '"><i class="deal-sw"></i>' + f.name + '</label>' +
            '<div class="deal-ctl-row">' +
              '<button type="button" class="deal-step" data-dir="-1" aria-label="Lower ' + f.name + ' by ' + fmt(f.step) + '">' + I_MINUS + '</button>' +
              '<input class="deal-ctl-v deal-num" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" aria-label="' + f.name + ', amount in dollars">' +
              '<button type="button" class="deal-step" data-dir="1" aria-label="Raise ' + f.name + ' by ' + fmt(f.step) + '">' + I_PLUS + '</button>' +
            '</div>' +
            '<span class="deal-rng"><i class="deal-rng-fill"></i><input type="range" id="' + id + '-' + f.k + '" min="0" max="' + f.max + '" step="1"></span>' +
          '</div>').join('') +
      '</div>' +
      '<div class="deal-read" data-band="thin">' +
        '<div><p class="deal-k">Estimated monthly payment</p>' +
          '<p class="deal-pay-v deal-num"><span data-el="pay"></span><small>/mo</small></p>' +
          '<p class="deal-cap">SBA 7(a) financing at your rate assumption, over 10 years</p>' +
          '<p class="deal-cap deal-num" data-el="notepay" hidden></p></div>' +
        '<div><div class="deal-cov-top"><p class="deal-k">Coverage<span class="deal-sr">. Coverage is the business’s cash flow divided by its yearly debt payments.</span></p><p class="deal-cov-v deal-num" data-el="cov"></p></div>' +
          '<p class="deal-band" data-el="band"></p>' +
          '<div class="deal-meter" aria-hidden="true"><i class="deal-meter-fill"></i><i class="deal-meter-t"></i><span class="deal-meter-c"><i class="deal-meter-m"></i></span><span class="deal-meter-tl">1.25× minimum</span></div></div>' +
      '</div>' +
    '</div>' +
    '<ul class="deal-checks" aria-label="Four checks">' +
      CHECK_KEYS.map((k, i) => '<li class="deal-chk" data-k="' + k + '" style="--i:' + i + '">' + I_CHECK + '<span>' + T.check[k] + '<span class="deal-sr"></span></span></li>').join('') +
    '</ul>' +
    '<div class="deal-next">' +
      '<div class="deal-hintrow"><p class="deal-hint deal-num" data-el="hint"></p>' +
        '<button type="button" class="deal-assist" data-act="assist">Fill the gap with SBA financing</button></div>' +
      '<div class="deal-win" hidden><div><h3 class="deal-win-t">' + T.winT + '</h3><p class="deal-win-b">' + T.winB + '</p></div>' +
        '<a class="deal-cta" href="#consult" data-open="consult" data-cta="deal-win">' + T.cta + '</a></div>' +
    '</div>' +
    '<div class="deal-foot">' +
      '<details class="deal-asm"><summary>Edit the assumptions' + svg('<path d="M10 4.5v11M4.5 10h11"/>') + '</summary>' +
        '<div class="deal-asm-grid">' +
          FIELDS.map((f) =>
            '<div class="deal-f"><label for="' + id + '-a-' + f.k + '">' + f.label + '</label>' +
            '<span class="deal-inp">' + (f.kind === 'money' ? '<span aria-hidden="true">$</span>' : '') +
            '<input class="deal-num" id="' + id + '-a-' + f.k + '" type="text" inputmode="' + (f.kind === 'money' ? 'numeric' : 'decimal') + '" autocomplete="off" spellcheck="false" data-k="' + f.k + '" data-kind="' + f.kind + '"' + (f.hint ? ' aria-describedby="' + id + '-h-' + f.k + '"' : '') + '>' +
            (f.kind === 'pct' ? '<span aria-hidden="true">%</span>' : '') + '</span>' +
            (f.hint ? '<p class="deal-fh" id="' + id + '-h-' + f.k + '">' + f.hint + '</p>' : '') + '</div>').join('') +
          '<div class="deal-f"><span class="deal-f-l" id="' + id + '-sl">Seller note on full standby</span>' +
            '<span class="deal-tog"><button type="button" class="deal-switch" role="switch" aria-checked="true" aria-labelledby="' + id + '-sl" aria-describedby="' + id + '-sh"></button><span data-el="standby" aria-hidden="true"></span></span>' +
            '<p class="deal-fh" id="' + id + '-sh">' + STANDBY_HINT + '</p></div>' +
        '</div></details>' +
      (missing(T.note) ? '<p class="deal-note">' + T.note + '</p>' : '') +
      '<button type="button" class="deal-reset" data-act="reset">' + I_RESET + 'Reset the example</button>' +
    '</div>' +
    '<p class="deal-sr" aria-live="polite" data-el="live"></p>' +
    '<div class="deal-bar deal-num" aria-hidden="true"><span><b data-el="barpay"></b> /mo</span><span data-el="barchk"></span></div>';
  rootEl.appendChild(ui);

  const $ = (s) => ui.querySelector(s);
  const el = {};
  ui.querySelectorAll('[data-el]').forEach((n) => { el[n.dataset.el] = n; });
  const plot = $('.deal-plot');
  const level = $('.deal-level');
  const gapEl = $('.deal-gap');
  const read = $('.deal-read');
  const checksEl = $('.deal-checks');
  const hintRow = $('.deal-hintrow');
  const assistBtn = $('.deal-assist');
  const winEl = $('.deal-win');
  const asm = $('.deal-asm');
  const switchBtn = $('.deal-switch');
  const meterFill = $('.deal-meter-fill');
  const meterMark = $('.deal-meter-m');
  const part = (mod) => {
    const c = $('.deal-col--' + mod);
    return { clip: c.querySelector('.deal-clip'), inner: c.querySelector('.deal-clip-in'), segs: [...c.querySelectorAll('.deal-seg')] };
  };
  const costCol = part('cost'), fundCol = part('fund');          // segs listed bottom to top
  const COST_UP = ['price', 'closing', 'workingCapital'], FUND_UP = ['sba', 'sellerNote', 'buyerCash'];
  const labs = COST.map((c) => { const n = $('.deal-lab[data-k="' + c.k + '"]'); return { k: c.k, n, v: n.querySelector('.deal-lab-v') }; });
  const leads = [...ui.querySelectorAll('.deal-lead path')];
  const chk = {};
  ui.querySelectorAll('.deal-chk').forEach((n) => { chk[n.dataset.k] = { n, sr: n.querySelector('.deal-sr') }; });
  const ctl = FUND.map((f) => {
    const n = $('.deal-ctl[data-k="' + f.k + '"]');
    return { f, n, v: n.querySelector('.deal-ctl-v'), r: n.querySelector('input[type=range]'), fill: n.querySelector('.deal-rng-fill'), btns: [...n.querySelectorAll('.deal-step')] };
  });
  const asmInputs = [...ui.querySelectorAll('.deal-asm-grid input[data-k]')];

  /* ── springs: critically damped, stepped in constant 1/120 s substeps ── */
  const mk = (x, e) => ({ x, v: 0, t: x, e });
  const S = {
    price: mk(0, 40), closing: mk(0, 40), workingCapital: mk(0, 40),
    sba: mk(0, 40), sellerNote: mk(0, 40), buyerCash: mk(0, 40),
    scale: mk(0, 1e-9), pay: mk(deal.derived.monthlyPayment, 2), cov: mk(0, 0.002),
  };
  let H = 0, shown = false, entered = false, holdFund = false, holdT = 0, laidOut = '';
  let raf = 0, last = 0, acc = 0;

  function setTargets() {
    const d = deal, D = d.derived;
    for (const k of COST_UP) S[k].t = d[k];
    for (const k of FUND_UP) S[k].t = holdFund ? 0 : d[k];
    S.scale.t = H ? (H - 8) / Math.max(D.uses, D.sources, 1) : 0;
    S.scale.e = S.scale.t * 2e-4;
    S.pay.t = D.monthlyPayment;
    S.cov.t = Number.isFinite(D.dsc) ? clamp(D.dsc, 0, 2) : 2;
  }
  function snap() { for (const k in S) { S[k].x = S[k].t; S[k].v = 0; } }
  function stepAll(dt) {
    let moving = false;
    for (const k in S) {
      const p = S[k], dx = p.t - p.x;
      if (Math.abs(dx) < p.e && Math.abs(p.v) < p.e * 6) { p.x = p.t; p.v = 0; continue; }
      p.v += (K * dx - C * p.v) * dt;
      p.x += p.v * dt;
      moving = true;
    }
    return moving;
  }

  let lastPay = '';
  function stack(c, keys, mids) {
    const s = S.scale.x;
    let off = 0;
    for (let i = 0; i < 3; i++) {
      const h = Math.max(0, S[keys[i]].x * s), g = i ? 1.5 : 0;
      c.segs[i].style.transform = 'translateY(' + (-(off + g)).toFixed(2) + 'px) scaleY(' + (Math.max(0, h - g) / H).toFixed(5) + ')';
      if (mids) mids[i] = H - off - h / 2;
      off += h;
    }
    const top = Math.min(off, H), d = (H - top).toFixed(2);
    c.clip.style.transform = 'translateY(' + d + 'px)';
    c.inner.style.transform = 'translateY(-' + d + 'px)';
    return top;
  }
  const mids = [0, 0, 0];
  function render() {
    const pay = fmt(r10(S.pay.x));
    if (pay !== lastPay) { lastPay = pay; el.pay.textContent = pay; }
    const f = (clamp(S.cov.x, 0, 2) / 2);
    meterFill.style.transform = 'scaleX(' + f.toFixed(4) + ')';
    meterMark.style.transform = 'translateX(' + (f * 100).toFixed(2) + '%)';
    if (!H) return;
    const costTop = stack(costCol, COST_UP, mids);
    stack(fundCol, FUND_UP, null);
    const ly = H - costTop;
    level.style.transform = 'translateY(' + ly.toFixed(2) + 'px)';
    gapEl.style.transform = 'translateY(' + clamp(ly + 8, 0, H - 38).toFixed(1) + 'px)';
    /* cost labels, top to bottom, kept apart; each gets a leader to its part */
    const LH = 34, lo = LH / 2 - 2, hi = H - LH / 2 + 2;
    let y0 = clamp(mids[2], lo, hi), y1 = Math.max(mids[1], y0 + LH), y2 = Math.max(mids[0], y1 + LH);
    if (y2 > hi) { y2 = hi; y1 = Math.min(y1, y2 - LH); y0 = Math.min(y0, y1 - LH); }
    const ys = [y0, y1, y2], src = [mids[2], mids[1], mids[0]];
    for (let i = 0; i < 3; i++) {
      labs[i].n.style.transform = 'translateY(' + ys[i].toFixed(1) + 'px) translateY(-50%)';
      const a = Math.round(ys[i]) + 0.5, b = Math.round(clamp(src[i], 1, H - 1)) + 0.5;
      leads[i].setAttribute('d', 'M0.5 ' + a + 'H' + (5.5 + i * 3) + 'V' + b + 'H16');
    }
  }
  function frame(ts) {
    raf = 0;
    if (dead) return;
    const dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) { snap(); render(); return; }      // starved of frames: land on the result instead of crawling
    acc += Math.max(0, dt);
    let moving = true;
    while (acc >= SUB) { acc -= SUB; moving = stepAll(SUB); }
    render();
    if (moving) raf = win.requestAnimationFrame(frame);
  }
  function wake() {
    if (dead) return;
    if (rm || !shown) { snap(); render(); return; }
    if (!raf) { last = win.performance.now(); acc = SUB; raf = win.requestAnimationFrame(frame); }
  }

  /* ── layout: one source of truth for the three compositions ── */
  function layout(entries) {
    if (dead) return;
    const cr = entries && entries[0] && entries[0].contentRect;
    const w = Math.round(cr ? cr.width : ui.clientWidth);
    if (!w) { shown = false; return; }
    /* every size below is arithmetic on w, so nothing is read back from the DOM */
    const mode = w >= 880 ? 'l' : w >= 600 ? 'm' : 's';
    let lw = 108, gw, cw, h, ctlW;
    if (mode === 'l') {
      gw = clamp(Math.round(w * 0.085), 76, 96); cw = clamp(Math.round(w * 0.116), 100, 136);
      h = win.innerHeight >= 860 ? 264 : win.innerHeight >= 680 ? 232 : 200;
      ctlW = w - (lw + cw * 2 + gw) - clamp(w * 0.29, 244, 296) - 48;
    } else if (mode === 'm') {
      gw = 76; cw = clamp(Math.round((w * 0.6 - lw - gw) / 2), 88, 124); h = 216;
      ctlW = w - (lw + cw * 2 + gw) - 28;
    } else { lw = 110; gw = 64; cw = clamp(Math.floor((w - lw - gw) / 2), 52, 124); h = 184; ctlW = w; }
    const cmode = ctlW >= 320 ? 'row' : 'stack';
    const key = w + ':' + h;
    if (shown && key === laidOut) return;                 // height-only changes of the content need no work
    laidOut = key;
    if (ui.dataset.w !== mode) ui.dataset.w = mode;
    if (ui.dataset.c !== cmode) ui.dataset.c = cmode;
    ui.style.setProperty('--lw', lw + 'px');
    ui.style.setProperty('--gw', gw + 'px');
    ui.style.setProperty('--cw', cw + 'px');
    plot.style.height = h + 'px';
    H = h;
    const first = !shown;
    shown = true;
    setTargets();
    S.scale.x = S.scale.t; S.scale.v = 0;
    if (first && !entered && !rm) {
      /* arrival: the cost rises first, then the funding rises to meet it */
      entered = true;
      for (const k of COST_UP.concat(FUND_UP)) { S[k].x = 0; S[k].v = 0; }
      S.cov.x = 0;
      holdFund = true; setTargets();
      win.clearTimeout(holdT);
      holdT = win.setTimeout(() => { holdFund = false; setTargets(); wake(); }, 180);
    } else if (first) { entered = true; snap(); }
    wake();
    if (!raf) render();
  }

  /* ── text and state sync ── */
  function hint(d) {
    const D = d.derived, c = D.checks;
    if (D.won) return '';
    if (!c.equity) {
      const need = fmt(D.requiredEquity - D.equityCounted);
      return d.noteStandby
        ? 'Equity counts ' + fmt(D.equityCounted) + ' of the ' + fmt(D.requiredEquity) + ' this example assumes. Add ' + need + ' in team equity.'
        : 'A seller note with payments does not count toward equity in this model. Add ' + need + ' in team equity, or put the note back on full standby.';
    }
    if (!c.coverage) return 'Cash flow does not yet carry the payments. Less SBA 7(a) financing, or a lower price, lifts coverage.';
    if (!c.program) return D.program === 'below' ? 'This builder covers Standard SBA 7(a) financing, which starts at $350,001.' : 'Standard SBA 7(a) financing goes up to $5,000,000.';
    return D.gap > 0 ? 'Raise a layer, or let SBA 7(a) financing fill the gap.' : 'Lower a layer until the funding matches the cost.';
  }
  const bandOf = (D) => (Number.isFinite(D.dsc) ? D.dscBand : 'none');
  function spoken(d) {
    const D = d.derived;
    return 'SBA 7(a) financing ' + fmt(d.sba) + ', seller note ' + fmt(d.sellerNote) + ', team equity ' + fmt(d.buyerCash) + '. ' +
      (D.checks.balanced ? 'Funding covers the cost. ' : D.gap > 0 ? 'Short by ' + fmt(D.gap) + '. ' : 'Over by ' + fmt(-D.gap) + '. ') +
      'Estimated payment ' + fmt(r10(D.monthlyPayment)) + ' a month. ' +
      (Number.isFinite(D.dsc) ? 'Coverage ' + D.dsc.toFixed(2) + ' times: ' + T.band[D.dscBand].toLowerCase() + '. ' : '') +
      D.passCount + ' of 4 checks pass.';
  }
  const fmtIn = (k) => (k === 'rate' || k === 'equityReqPct' ? String(Math.round(deal[k] * 10000) / 100) : Math.round(deal[k]).toLocaleString('en-US'));
  function sync() {
    const d = deal, D = d.derived;
    for (const c of ctl) {
      const v = d[c.f.k], mx = Math.max(c.f.max, v);
      c.r.max = String(mx);
      c.r.value = String(v);
      c.r.setAttribute('aria-valuetext', fmt(v));
      c.fill.style.transform = 'scaleX(' + (v / mx).toFixed(4) + ')';
      if (doc.activeElement !== c.v) c.v.value = fmt(v);
    }
    el.uses.textContent = fmt(D.uses);
    el.sources.textContent = fmt(D.sources);
    for (const l of labs) l.v.textContent = fmt(d[l.k]);
    if (D.checks.balanced) { el.gapw.textContent = ''; el.gapv.textContent = 'Balanced'; }
    else { el.gapw.textContent = D.gap > 0 ? 'Short by ' : 'Over by '; el.gapv.textContent = fmt(D.gap); }
    el.notepay.hidden = d.noteStandby || D.notePayment <= 0;
    el.notepay.textContent = 'Plus the seller note at ' + Math.round(d.noteRate * 1000) / 10 + '%: about ' + fmt(r10(D.notePayment)) + '/mo';
    el.cov.textContent = fmtX(D.dsc);
    const band = bandOf(D);
    el.band.textContent = T.band[band];
    read.dataset.band = band;
    for (const k of CHECK_KEYS) { const ok = !!D.checks[k]; chk[k].n.classList.toggle('is-pass', ok); chk[k].sr.textContent = ok ? ': passes' : ': needs work'; }
    el.hint.textContent = hint(d);
    assistBtn.hidden = !(D.gap > BAL_TOL);
    el.barpay.textContent = fmt(r10(D.monthlyPayment));
    el.barchk.textContent = D.passCount + ' of 4 checks';
    for (const inp of asmInputs) if (doc.activeElement !== inp) inp.value = fmtIn(inp.dataset.k);
    switchBtn.setAttribute('aria-checked', d.noteStandby ? 'true' : 'false');
    el.standby.textContent = d.noteStandby ? 'On' : 'Off';
  }

  /* ── announcements, change events, win ── */
  let liveT = 0, chT = 0, chLast = 0, winT = 0, seqT = 0, won = false, dragging = false;
  function say(now) {
    win.clearTimeout(liveT);
    if (now) { el.live.textContent = now; return; }
    liveT = win.setTimeout(() => { el.live.textContent = spoken(deal); }, 600);
  }
  function fire(name, cb) {
    const st = snapshot(deal);
    try { rootEl.dispatchEvent(new win.CustomEvent(name, { bubbles: true, detail: st })); } catch (e) { /* noop */ }
    if (typeof cb === 'function') { try { cb(st); } catch (e) { console.error('[deal] ' + name, e); } }
  }
  function emitChange() {
    const call = () => { chT = 0; if (dead) return; chLast = win.performance.now(); fire('deal:change', onChange); };
    const since = win.performance.now() - chLast;
    if (chT) return;
    if (since >= 150) call(); else chT = win.setTimeout(call, 150 - since);
  }
  function showWin(yes) {
    winEl.hidden = !yes;
    hintRow.hidden = yes;
    winEl.classList.remove('is-in');
    if (yes) { void winEl.offsetWidth; winEl.classList.add('is-in'); }
  }
  function enterWin(silent) {
    won = true;
    ui.dataset.state = 'won';
    showWin(true);
    if (silent) return;
    if (!rm) {
      checksEl.classList.remove('is-seq'); void checksEl.offsetWidth; checksEl.classList.add('is-seq');
      win.clearTimeout(seqT);
      seqT = win.setTimeout(() => checksEl.classList.remove('is-seq'), 1200);
      S.scale.v = -S.scale.t * 0.45;                       // one soft settle of both columns
      wake();
    }
    say('All four checks pass. ' + T.winT + ' ' + T.winB);
    if (shown && winEl.scrollIntoView) { try { winEl.scrollIntoView({ block: 'nearest', behavior: rm ? 'auto' : 'smooth' }); } catch (e) { /* noop */ } }
    fire('deal:complete', onComplete);
  }
  function leaveWin() {
    won = false;
    ui.dataset.state = 'building';
    checksEl.classList.remove('is-seq');
    showWin(false);
  }
  function evalWin() {
    if (!deal.derived.won) { win.clearTimeout(winT); winT = 0; if (won) leaveWin(); return; }
    if (won || winT || dragging) return;
    winT = win.setTimeout(() => { winT = 0; if (!dead && deal.derived.won && !won && !dragging) enterWin(false); }, rm ? 0 : 320);
  }

  /* ── single entry point for every change ── */
  function apply(partial, quiet) {
    if (!shown) layout();
    raw = toRaw(computeDeal({ ...raw, ...normPartial(partial) }));
    deal = computeDeal(raw);
    setTargets();
    sync();
    evalWin();
    if (!quiet) { emitChange(); if (!deal.derived.won) say(); }
    wake();
  }
  const hardMax = (f) => (f.k === 'sba' ? f.max : MONEY_CAP);
  function setLayer(f, v) {
    v = clamp(Math.round(v), 0, hardMax(f));
    if (v !== deal[f.k]) apply({ [f.k]: v });
    else sync();
  }
  /* drag feel: clean round numbers, with a light magnet on the values that satisfy a check */
  function fromDrag(f, r) {
    const v = +r.value, perPx = f.max / Math.max(40, r.clientWidth - 20), D = deal.derived;
    const grid = nice(Math.max(f.step, perPx));
    const magnets = [deal[f.k] + D.gap];
    if (f.k === 'buyerCash') magnets.push(D.requiredEquity - D.countedNote);
    let best = null;
    for (const m of magnets) if (m >= 0 && m <= f.max && Math.abs(v - m) <= Math.max(perPx * 3, grid) && (best === null || Math.abs(v - m) < Math.abs(v - best))) best = m;
    return best !== null ? best : clamp(Math.round(v / grid) * grid, 0, f.max);
  }
  const stops = [];
  for (const c of ctl) {
    const { f, r, v, n } = c;
    let hotT = 0;
    on(r, 'input', () => {
      setLayer(f, fromDrag(f, r));
      /* the highlight ends with the interaction, so the result is not read through dimmed layers */
      ui.dataset.hot = f.k;
      win.clearTimeout(hotT);
      hotT = win.setTimeout(() => { if (!dead && ui.dataset.hot === f.k) delete ui.dataset.hot; }, 900);
    });
    on(r, 'pointerdown', () => { dragging = true; });
    const release = () => { if (dragging) { dragging = false; sync(); evalWin(); } };
    for (const ev of ['change', 'pointerup', 'pointercancel']) on(r, ev, release);
    on(r, 'keydown', (e) => {
      const m = e.shiftKey ? 10 : 1;
      let d;
      switch (e.key) {
        case 'ArrowLeft': case 'ArrowDown': d = -f.step * m; break;
        case 'ArrowRight': case 'ArrowUp': d = f.step * m; break;
        case 'PageUp': d = f.page; break;
        case 'PageDown': d = -f.page; break;
        case 'Home': e.preventDefault(); setLayer(f, 0); return;
        case 'End': e.preventDefault(); setLayer(f, +r.max); return;
        default: return;
      }
      e.preventDefault();
      setLayer(f, deal[f.k] + d);
    });
    const commit = () => { const p = parseMoney(v.value); if (p !== null) setLayer(f, p); v.value = fmt(deal[f.k]); };
    on(v, 'focus', () => { try { v.select(); } catch (e) { /* noop */ } });
    on(v, 'change', commit);
    on(v, 'blur', commit);
    on(v, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); try { v.select(); } catch (err) { /* noop */ } } });
    c.btns.forEach((b) => {
      const dir = +b.dataset.dir;
      let t1 = 0, t2 = 0, count = 0, repeated = false;
      const stop = () => {
        win.clearTimeout(t1); win.clearInterval(t2);
        if (t2) { dragging = false; evalWin(); }
        t1 = t2 = 0;
      };
      stops.push(stop);
      on(b, 'pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        stop(); count = 0; repeated = false;
        t1 = win.setTimeout(() => {
          dragging = true;
          t2 = win.setInterval(() => { repeated = true; count++; setLayer(f, deal[f.k] + dir * f.step * (count > 70 ? 25 : count > 28 ? 5 : 1)); }, 60);
        }, 420);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) on(b, ev, stop);
      on(b, 'click', (e) => { if (repeated) { repeated = false; return; } setLayer(f, deal[f.k] + dir * f.step * (e.shiftKey ? 10 : 1)); });
    });
    /* show which layer a control moves */
    const hot = () => { ui.dataset.hot = f.k; };
    const cold = () => { if (ui.dataset.hot === f.k && !n.contains(doc.activeElement) && !n.matches(':hover')) delete ui.dataset.hot; };
    on(n, 'pointerenter', () => { if (!shown) layout(); hot(); });
    on(n, 'focusin', hot);
    on(n, 'pointerleave', cold);
    on(n, 'focusout', () => win.setTimeout(cold, 0));
  }

  /* ── assumptions ── */
  function commitField(inp, format) {
    const k = inp.dataset.k;
    const v = inp.dataset.kind === 'money' ? parseMoney(inp.value) : parsePct(inp.value, k === 'equityReqPct' ? 100 : 30);
    if (v !== null && v !== deal[k]) apply({ [k]: v });
    if (format) inp.value = fmtIn(k);
  }
  const typing = new Map();
  for (const inp of asmInputs) {
    /* Assumptions commit on change, blur or Enter only: a half-typed price would clamp, and so destroy, the visitor's layers. */
    const done = () => { win.clearTimeout(typing.get(inp)); commitField(inp, true); };
    on(inp, 'change', done);
    on(inp, 'blur', done);
    on(inp, 'focus', () => { try { inp.select(); } catch (e) { /* noop */ } });
    on(inp, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
  }
  on(switchBtn, 'click', () => apply({ noteStandby: !deal.noteStandby }));
  on(asm, 'toggle', () => { if (asm.open && shown && asm.scrollIntoView) { try { asm.scrollIntoView({ block: 'nearest', behavior: rm ? 'auto' : 'smooth' }); } catch (e) { /* noop */ } } });
  on(ui, 'click', (e) => {
    const b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || !ui.contains(b)) return;
    if (b.dataset.act === 'reset') api.reset();
    else if (b.dataset.act === 'assist') {
      const D = deal.derived, f = FUND[2], had = doc.activeElement === b;
      setLayer(f, clamp(D.uses - deal.buyerCash - deal.sellerNote, 0, f.max));
      if (had && assistBtn.hidden) { try { ctl[2].r.focus({ preventScroll: true }); } catch (err) { /* noop */ } }
    }
  });

  /* ── observers ── */
  let ro = null, io = null;
  if (win.ResizeObserver) { ro = new win.ResizeObserver(layout); ro.observe(ui); }
  on(win, 'resize', () => layout());
  if (win.IntersectionObserver) {
    io = new win.IntersectionObserver((es) => { for (const e of es) ui.dataset.read = e.isIntersecting ? '1' : '0'; }, { threshold: 0.25 });
    io.observe(read);
  }
  const rmChange = () => {
    rm = rmOpt || !!(mq && mq.matches);
    if (rm) { ui.dataset.rm = '1'; win.cancelAnimationFrame(raf); raf = 0; holdFund = false; setTargets(); snap(); render(); }
    else delete ui.dataset.rm;
  };
  if (mq) { if (mq.addEventListener) on(mq, 'change', rmChange); else if (mq.addListener) mq.addListener(rmChange); }

  /* ── public API ── */
  const api = {
    reset() {
      if (dead) return;
      raw = toRaw(computeDeal({}));
      apply({}, true);
      emitChange();
      say('Example reset. ' + spoken(deal));
    },
    getState() { return snapshot(deal); },
    setReducedMotion(v) { rmOpt = !!v; rmChange(); },
    destroy() {
      if (dead) return;
      dead = true;
      ac.abort();
      if (mq && !mq.addEventListener && mq.removeListener) mq.removeListener(rmChange);
      win.cancelAnimationFrame(raf);
      for (const t of [liveT, chT, winT, seqT, holdT]) win.clearTimeout(t);
      typing.forEach((t) => win.clearTimeout(t));
      stops.forEach((s) => s());
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      ui.remove();
      if (fallback) fallback.hidden = fallbackWasHidden;
      delete rootEl.__deal;
      dropStyles(doc);
    },
  };
  Object.defineProperty(rootEl, '__deal', { value: api, configurable: true });

  setTargets();
  snap();
  sync();
  render();
  if (deal.derived.won) enterWin(true);
  layout();
  return api;
}

export default initDeal;
