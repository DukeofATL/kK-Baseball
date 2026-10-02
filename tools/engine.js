/* kK engine: pure logic shared by the app and the tests. */
const KKE = (() => {
  // ---------- pitch vocabulary ----------
  const FAMILY = { FF:"fastball", SI:"fastball", FC:"fastball", FA:"fastball", FT:"fastball",
    SL:"breaking", ST:"breaking", CU:"breaking", KC:"breaking", SV:"breaking", CS:"breaking",
    CH:"offspeed", FS:"offspeed", FO:"offspeed", SC:"offspeed", KN:"offspeed", EP:"offspeed" };
  const TYPE_NAME = { FF:"four-seam fastball", SI:"sinker", FC:"cutter", FA:"fastball", FT:"two-seam fastball",
    SL:"slider", ST:"sweeper", CU:"curveball", KC:"knuckle curve", SV:"slurve", CS:"slow curve",
    CH:"changeup", FS:"splitter", FO:"forkball", SC:"screwball", KN:"knuckleball", EP:"eephus" };
  const SHORT = { FF:"Four-seam", SI:"Sinker", FC:"Cutter", FA:"Fastball", FT:"Two-seam", SL:"Slider", ST:"Sweeper", CU:"Curveball",
    KC:"Knuckle curve", SV:"Slurve", CS:"Slow curve", CH:"Changeup", FS:"Splitter", FO:"Forkball", SC:"Screwball", KN:"Knuckleball", EP:"Eephus" };
  const FAM_NAME = { fastball:"Fastball", breaking:"Breaking ball", offspeed:"Offspeed" };
  const LOC_NAME = { up:"Up", down:"Down", off:"Off the plate" };
  const LOC_WORDS = { up:"up", down:"down", off:"off the plate" };
  const ADV = ["H-in","H-mid","H-away","M-in","M-mid","M-away","L-in","L-mid","L-away","C-high","C-low","C-in","C-away"];
  const ADV_NAME = { "H-in":"High in", "H-mid":"High middle", "H-away":"High away", "M-in":"Middle in", "M-mid":"Middle", "M-away":"Middle away",
    "L-in":"Low in", "L-mid":"Low middle", "L-away":"Low away", "C-high":"Chase high", "C-low":"Chase low", "C-in":"Chase in", "C-away":"Chase away" };
  // Labels that describe the same pitch to a fan are merged, so a pitcher never shows two curveball buttons.
  const NORM = { FO:"FS", KC:"CU", CS:"CU" };
  const norm = t => NORM[t] || t;
  const fam = t => FAMILY[t] || null;
  const HALF_PLATE = 0.83; // feet: half of 17 inches plus the ball's radius

  // ---------- location ----------
  // Where a pitch crossed, relative to the hitter. Returns { base, adv } or null.
  const BALL_R = 0.12, NEAR = 0.25; // feet
  // Where a pitch crossed, relative to the hitter. Returns { base, adv, alt, near, mid } or null.
  // alt: a second equally fair answer for corner pitches. near: cells across the zone edge within 3 inches. mid: belt high.
  function spotOf(pd, hand){
    if (!pd) return null;
    const c = pd.coordinates || {}, top = pd.strikeZoneTop, bot = pd.strikeZoneBottom;
    if (c.pX != null && c.pZ != null && top && bot) {
      const x = c.pX, z = c.pZ, T = top + BALL_R, B = bot - BALL_R;
      const inside = hand === "L" ? x > 0 : x < 0, sideCell = inside ? "C-in" : "C-away";
      const dz = z > T ? z - T : z < B ? B - z : 0;
      const dx = Math.max(0, Math.abs(x) - HALF_PLATE);
      const mid = (top + bot) / 2, ax = Math.abs(x);
      const colOf = () => ax <= HALF_PLATE/3 ? "mid" : inside ? "in" : "away";
      const rowOf = () => z > bot + (top-bot)*2/3 ? "H" : z < bot + (top-bot)/3 ? "L" : "M";
      if (dz === 0 && dx === 0) {
        const near = [];
        if (T - z < NEAR) near.push("C-high"); if (z - B < NEAR) near.push("C-low");
        if (HALF_PLATE - ax < NEAR) near.push(sideCell);
        const row = rowOf();
        return { base: z >= mid ? "up" : "down", adv: row + "-" + colOf(), alt:null, near, mid: row === "M" };
      }
      const vert = z > T ? "C-high" : z < B ? "C-low" : null;
      const vBase = z >= mid ? "up" : "down";
      if (dz > 0 && dx > 0) {
        // Low and wide, or high and wide: either call is fair.
        const primary = dx > dz ? { base:"off", adv:sideCell } : { base:vBase, adv:vert };
        const alt = dx > dz ? { base:vBase, adv:vert } : { base:"off", adv:sideCell };
        return Object.assign(primary, { alt, near:[], mid:false });
      }
      if (dx > 0) {
        const near = dx < NEAR ? [rowOf() + "-" + (inside ? "in" : "away")] : [];
        return { base:"off", adv:sideCell, alt:null, near, mid:false };
      }
      const near = dz < NEAR ? [(vert === "C-high" ? "H" : "L") + "-" + colOf()] : [];
      return { base:vBase, adv:vert, alt:null, near, mid:false };
    }
    // Fallback to the Gameday zone number (catcher's view).
    const zn = pd.zone; if (zn == null) return null;
    if (zn >= 11) return { base: zn <= 12 ? "up" : "down", adv: zn <= 12 ? "C-high" : "C-low", alt:null, near:[], mid:false };
    if (zn < 1 || zn > 9) return null;
    const r = Math.floor((zn-1)/3), cc = (zn-1)%3;
    const leftIsInside = hand !== "L"; // a right-handed hitter stands on the catcher's left
    const col = cc === 1 ? "mid" : (cc === 0) === leftIsInside ? "in" : "away";
    return { base: r === 2 ? "down" : "up", adv: ["H","M","L"][r] + "-" + col, alt:null, near:[], mid: r === 1 };
  }
  function advCredit(call, sp){
    if (!call || !sp) return 0;
    if (call === sp.adv || (sp.alt && call === sp.alt.adv)) return 1;
    const [cr, cc] = call.split("-"), [ar, ac] = sp.adv.split("-");
    if (cr !== "C" && ar !== "C" && (cr === ar || cc === ac)) return 0.5; // right row or column inside the zone
    if (sp.near && sp.near.includes(call)) return 0.5;                     // a borderline pitch, within 3 inches of the call
    return 0;
  }
  function baseCredit(call, sp){
    if (!call || !sp) return 0;
    if (call === sp.base || (sp.alt && call === sp.alt.base)) return 1;
    if (sp.mid && (call === "up" || call === "down")) return 0.5;           // belt high counts half either way
    return 0;
  }
  function advPartial(call, actual){ return advCredit(call, { adv: actual, alt:null, near:[] }); }

  // ---------- counts ----------
  function bucket(balls, strikes){
    if (balls === 3 && strikes === 2) return "full";
    if (strikes >= 2) return "two";
    if (balls === 0 && strikes === 0) return "first";
    if (balls === 0 && strikes === 1) return "ahead";
    if (balls === strikes) return "even";
    return "behind";
  }
  const BUCKET_NAME = { first:"on the first pitch", ahead:"at 0-1", even:"in even counts", behind:"in hitter's counts", two:"with two strikes", full:"at 3-2" };

  // ---------- book ----------
  function emptyCell(){ return { n:0, type:{}, fam:{}, base:{}, adv:{}, pb:{}, pa:{} }; }
  function newBook(id, name){ return { id, name, n:0, cells:{}, fps:{n:0,s:0}, velo:{}, games:0 }; }
  function bookAdd(book, hand, bkt, type, spot, speed){
    type = norm(type);
    const f = fam(type); if (!f) return;
    for (const key of [hand+"|"+bkt, hand+"|*", "*|"+bkt, "*|*"]) {
      const c = book.cells[key] || (book.cells[key] = emptyCell());
      c.n++; c.type[type]=(c.type[type]||0)+1; c.fam[f]=(c.fam[f]||0)+1;
      if (spot) {
        c.base[spot.base]=(c.base[spot.base]||0)+1; c.adv[spot.adv]=(c.adv[spot.adv]||0)+1;
        // Where each pitch goes, so the book's spot always fits the pitch it calls.
        const pb = c.pb || (c.pb = {}), pa = c.pa || (c.pa = {});
        const B1 = pb[f] || (pb[f] = {}), A1 = pa[type] || (pa[type] = {});
        B1[spot.base] = (B1[spot.base]||0) + 1; A1[spot.adv] = (A1[spot.adv]||0) + 1;
      }
    }
    if (speed) { const v = book.velo[type] || (book.velo[type] = { s:0, n:0 }); v.s += speed; v.n++; }
    book.n++;
  }
  function bookCell(book, hand, bkt){
    if (!book) return null;
    // The count matters more than the hitter's side, so a thin cell falls back to the same count first.
    for (const key of [hand+"|"+bkt, "*|"+bkt, hand+"|*", "*|*"]) { const c = book.cells[key]; if (c && c.n >= 15) return { cell:c, key }; }
    const c = book.cells["*|*"]; return c && c.n ? { cell:c, key:"*|*" } : null;
  }
  // A league-style stand-in for pitchers with no book yet.
  function genericBook(){
    const b = newBook(0, "League average");
    const mix = { first:{FF:.58,SL:.22,CH:.12,CU:.08}, ahead:{FF:.45,SL:.28,CH:.14,CU:.13}, even:{FF:.50,SL:.24,CH:.15,CU:.11},
      behind:{FF:.66,SL:.16,CH:.13,CU:.05}, two:{FF:.42,SL:.32,CH:.13,CU:.13}, full:{FF:.62,SL:.22,CH:.12,CU:.04} };
    const spots = { fastball:{ "H-in":.10,"H-mid":.08,"H-away":.10,"M-in":.06,"M-mid":.05,"M-away":.08,"L-in":.05,"L-mid":.04,"L-away":.08,"C-high":.12,"C-low":.04,"C-in":.08,"C-away":.12 },
      other:{ "H-in":.03,"H-mid":.03,"H-away":.04,"M-in":.04,"M-mid":.04,"M-away":.07,"L-in":.06,"L-mid":.06,"L-away":.11,"C-high":.03,"C-low":.25,"C-in":.06,"C-away":.18 } };
    const baseOf = a => a === "C-in" || a === "C-away" ? "off" : (a[0] === "L" || a === "C-low") ? "down" : "up";
    for (const hand of ["L","R"]) for (const bkt in mix) for (const t in mix[bkt]) {
      const sp = spots[fam(t) === "fastball" ? "fastball" : "other"];
      for (const a in sp) { const n = Math.round(mix[bkt][t] * sp[a] * 400); for (let i = 0; i < n; i++) bookAdd(b, hand, bkt, t, { base: baseOf(a), adv: a }); }
    }
    b.fps = { n:100, s:61 }; b.generic = true;
    return b;
  }
  function prob(map, k, n, kinds){ return ((map[k]||0) + 0.5) / (n + 0.5*kinds); }
  function argmax(map, area){ let best=null, v=-1; for (const k in map) { const x = map[k] / (area ? (area[k] || 1) : 1); if (x > v){ v=x; best=k; } } return best; }
  // Chase cells cover far more area than a zone cell, so the book weighs them by size when it picks a spot.
  const AREA = { "C-high":3, "C-low":3, "C-in":3, "C-away":3 };
  function arsenal(book){
    const c = book && book.cells["*|*"]; if (!c || !c.n) return ["FF","SL","CH","CU"];
    const merged = {}; for (const t in c.type) merged[norm(t)] = (merged[norm(t)]||0) + c.type[t];
    return Object.keys(merged).filter(t => merged[t]/c.n >= 0.05).sort((a,b)=>merged[b]-merged[a]);
  }
  function mixLine(book, hand, bkt, level){
    const bc = bookCell(book, hand, bkt); if (!bc) return { pitch:[], spot:[], key:null, n:0 };
    const c = bc.cell, top = (map, n) => Object.keys(map).sort((a,b)=>map[b]-map[a]).slice(0,n).map(k => ({ k, pct: Math.round(100*map[k]/c.n) }));
    return level === "advanced" ? { pitch: top(c.type, 3), spot: top(c.adv, 3), key: bc.key, n:c.n } : { pitch: top(c.fam, 3), spot: top(c.base, 3), key: bc.key, n:c.n };
  }
  function bookCall(book, hand, bkt, level){
    const bc = bookCell(book, hand, bkt);
    if (!bc) return level === "advanced" ? { pitch:"FF", spot:"H-away" } : { pitch:"fastball", spot:"up" };
    const c = bc.cell;
    if (level === "advanced") {
      const pitch = argmax(c.type) || "FF", given = c.pa && c.pa[pitch];
      return { pitch, spot: argmax(given && Object.keys(given).length ? given : c.adv, AREA) || "M-away" };
    }
    const pitch = argmax(c.fam) || "fastball", given = c.pb && c.pb[pitch];
    return { pitch, spot: argmax(given && Object.keys(given).length ? given : c.base) || "up" };
  }
  function weights(book, hand, bkt, level, call){
    const bc = bookCell(book, hand, bkt);
    if (!bc) return { wp:1.5, ws:1.5 };
    const c = bc.cell;
    const pp = level === "advanced" ? prob(c.type, call.pitch, c.n, Math.max(3, Object.keys(c.type).length)) : prob(c.fam, call.pitch, c.n, 3);
    const ps = level === "advanced" ? prob(c.adv, call.spot, c.n, 13) : prob(c.base, call.spot, c.n, 3);
    return { wp: Math.min(5, 1/pp), ws: Math.min(5, 1/ps) };
  }
  // The book's chance that the pitcher throws this pitch here, used to set the odds on a call.
  function pitchProb(book, hand, bkt, level, pitch){
    const bc = bookCell(book, hand, bkt); if (!bc) return level === "advanced" ? 0.25 : 1/3;
    const c = bc.cell;
    return level === "advanced" ? prob(c.type, norm(pitch), c.n, Math.max(3, Object.keys(c.type).length)) : prob(c.fam, pitch, c.n, 3);
  }
  // Grade a call against the pitch. The glove answer never affects the grade.
  function grade(call, actual, level){
    const at = norm(actual.type);
    const pitchRight = level === "advanced" ? norm(call.pitch) === at : call.pitch === fam(at);
    const pitchCredit = pitchRight ? 1 : (level === "advanced" && fam(norm(call.pitch)) === fam(at) ? 0.5 : 0);
    const spotCredit = actual.spot ? (level === "advanced" ? advCredit(call.spot, actual.spot) : baseCredit(call.spot, actual.spot)) : 0;
    return { pitchRight, pitchCredit, spotCredit };
  }
  function pointsFor(g, w, big){
    let p = (g.pitchCredit != null ? g.pitchCredit : (g.pitchRight ? 1 : 0)) * w.wp + g.spotCredit * w.ws;
    if (g.pitchRight && g.spotCredit === 1) p += 1;
    return Math.round(p * (big ? 2 : 1) * 10) / 10;
  }

  // ---------- Monte Carlo run engine ----------
  const BASE = { bb:0.090, s1:0.142, s2:0.044, s3:0.004, hr:0.031 };
  function paProbs(factor){
    const on = BASE.bb+BASE.s1+BASE.s2+BASE.s3+BASE.hr;
    // factor is a run multiplier (1 = league average); runs scale with roughly the 2.5 power of on-base rates.
    const f = Math.max(0.35, Math.min(2.4, factor || 1));
    const scale = Math.min(0.62/on, 1.04 * Math.pow(f, 0.4));
    return { bb:BASE.bb*scale, s1:BASE.s1*scale, s2:BASE.s2*scale, s3:BASE.s3*scale, hr:BASE.hr*Math.pow(scale,1.25) };
  }
  function rng(seed){ let s = seed>>>0 || 1; return () => { s ^= s<<13; s>>>=0; s ^= s>>>17; s ^= s<<5; s>>>=0; return s/4294967296; }; }
  function halfInning(team, state, R, maxRunsWalkoff){
    let outs = state.outs||0, bases = state.bases||0, runs = 0, i = team.idx;
    while (outs < 3) {
      const p = team.factor(i % 9, team.faced++).p; const r = R();
      let c = 0;
      if (r < (c += p.bb)) { if (bases & 1) { if (bases & 2) { if (bases & 4) runs++; bases |= 4; } bases |= 2; } bases |= 1; }
      else if (r < (c += p.s1)) { let nb = 1; if (bases & 4) runs++; if (bases & 2) { if (R() < 0.6) runs++; else nb |= 4; } if (bases & 1) { if (!(nb & 4) && R() < 0.28) nb |= 4; else nb |= 2; } bases = nb; }
      else if (r < (c += p.s2)) { let nb = 2; runs += (bases & 4 ? 1:0) + (bases & 2 ? 1:0); if (bases & 1) { if (R() < 0.42) runs++; else nb |= 4; } bases = nb; }
      else if (r < (c += p.s3)) { runs += ((bases&1)?1:0)+((bases&2)?1:0)+((bases&4)?1:0); bases = 4; }
      else if (r < (c += p.hr)) { runs += 1 + ((bases&1)?1:0)+((bases&2)?1:0)+((bases&4)?1:0); bases = 0; }
      else { outs++;
        if (outs < 3) {
          if (bases & 4 && R() < 0.30) { runs++; bases &= ~4; }
          if (bases & 1 && R() < 0.11) { outs++; bases &= ~1; }
          else if (bases & 2 && !(bases & 4) && R() < 0.22) { bases = (bases & ~2) | 4; }
        }
      }
      i++;
      if (maxRunsWalkoff != null && runs > maxRunsWalkoff) break;
    }
    team.idx = i % 9;
    return runs;
  }
  /* st = { inning, top, outs, bases, away, home, ghost }
     teams.away/home: { idx, offense:[9 run factors], pitching:{ current, remaining (batters), pen } }; pitching is that team's own staff. */
  function simulate(st, teams, n, seed){
    const R = rng(seed || 12345);
    let awayWins = 0;
    for (let k = 0; k < n; k++) {
      let inning = st.inning, top = st.top, outs = st.outs||0, bases = st.bases||0, away = st.away, home = st.home;
      const bat = { away:{ idx: teams.away.idx }, home:{ idx: teams.home.idx } };
      const arm = { away:{ left: teams.away.pitching.remaining }, home:{ left: teams.home.pitching.remaining } };
      let guard = 0;
      while (guard++ < 40) {
        const side = top ? "away" : "home", def = top ? "home" : "away";
        const T = teams[side], D = teams[def];
        const team = { idx: bat[side].idx, faced:0, factor: (slot) => { const pf = arm[def].left > 0 ? D.pitching.current : D.pitching.pen; arm[def].left--; return { p: paProbs(T.offense[slot] * pf) }; } };
        if (outs === 0 && bases === 0 && inning > 9 && st.ghost) bases = 2;
        const walkoff = (!top && inning >= 9) ? (away - home) : null;
        const r = halfInning(team, { outs, bases }, R, walkoff);
        bat[side].idx = team.idx;
        if (top) away += r; else home += r;
        outs = 0; bases = 0;
        if (top) { top = false; if (inning >= 9 && home > away) break; }
        else { if (inning >= 9 && home !== away) break; top = true; inning++; if (inning > 15) { if (R() < 0.5) away = home + 1; else home = away + 1; break; } }
      }
      if (away > home) awayWins++;
    }
    return awayWins / n;
  }

  // ---------- Pythagorean foundation ----------
  function pyth(rs, ra, exp){ exp = exp || 1.83; return Math.pow(rs,exp)/(Math.pow(rs,exp)+Math.pow(ra,exp)); }
  // Regress a pitcher's ERA toward the league by innings pitched.
  function regressERA(era, ip, lg){ if (!era || !ip) return null; const w = ip / (ip + 80); return w * era + (1 - w) * lg / 1.08; }
  function pythPregame(f){
    const share = 5.5/9;
    const prevent = s => share * (s.starterERA ? s.starterERA * 1.08 : s.ra) + (1 - share) * s.ra;
    const awayRuns = f.away.rs * prevent(f.home) / f.lg, homeRuns = f.home.rs * prevent(f.away) / f.lg;
    const pAway = pyth(awayRuns, homeRuns) - 0.035;
    return { pAway: Math.max(0.05, Math.min(0.95, pAway)), awayRuns, homeRuns };
  }
  const logit = p => Math.log(p/(1-p));
  const sigm = x => 1/(1+Math.exp(-x));
  function shiftWP(mlbAway, mlbAway0, pythAway, outsRecorded){
    const clamp = p => Math.min(0.995, Math.max(0.005, p));
    if (mlbAway >= 0.999 || mlbAway <= 0.001) return mlbAway;
    const delta = logit(clamp(pythAway)) - logit(clamp(mlbAway0));
    const rem = Math.max(0, (54 - outsRecorded) / 54);
    return sigm(logit(clamp(mlbAway)) + delta * rem);
  }

  // ---------- what the fan has seen ----------
  function ts(x){ return x ? Date.parse(x) : NaN; }
  function view(feed, t){
    const all = (feed.liveData && feed.liveData.plays && feed.liveData.plays.allPlays) || [];
    const plays = [];
    for (const p of all) {
      if (!(ts(p.about.startTime) <= t)) break;
      const pe = p.playEvents || [];
      const evs = pe.filter(e => !(ts(e.startTime) > t));
      const lastEv = pe[pe.length-1];
      const complete = !!p.about.isComplete && evs.length === pe.length && (!lastEv || ts(lastEv.startTime) <= t);
      plays.push({ src:p, evs, complete, pitches: evs.filter(e => e.isPitch) });
    }
    return plays;
  }
  // The latest count, from any event that carries one (pitch-clock violations and overturned challenges included).
  function lastCount(evs){ for (let j = evs.length-1; j >= 0; j--) if (evs[j].count) return evs[j].count; return null; }
  function basesAfter(p){ const m = p.matchup || {}; return (m.postOnFirst?1:0) | (m.postOnSecond?2:0) | (m.postOnThird?4:0); }
  function sameHalf(a, b){ return !!(a && b && a.src.about.inning === b.src.about.inning && a.src.about.halfInning === b.src.about.halfInning); }
  function prevPlay(plays, cur){ const i = plays.indexOf(cur); return i > 0 ? plays[i-1] : null; }
  function basesBefore(plays, cur){
    const pv = prevPlay(plays, cur);
    if (!sameHalf(pv, cur)) return 0;
    const lc = lastCount(pv.evs); if (lc && lc.outs >= 3) return 0;
    return basesAfter(pv.src);
  }
  function outsBefore(plays, cur){
    const pv = prevPlay(plays, cur);
    if (!sameHalf(pv, cur)) return 0;
    const lc = lastCount(pv.evs); return lc ? lc.outs % 3 : 0;
  }
  function stateOf(plays){
    let away=0, home=0, inning=1, top=true, outs=0, bases=0, cur=null;
    for (const v of plays) {
      if (v.complete) { away = v.src.result.awayScore; home = v.src.result.homeScore; }
      inning = v.src.about.inning; top = v.src.about.halfInning === "top"; cur = v;
    }
    let balls=0, strikes=0;
    if (cur) {
      if (!cur.complete) {
        const lc = lastCount(cur.evs);
        if (lc) { balls = Math.min(3, lc.balls); strikes = Math.min(2, lc.strikes); outs = lc.outs; } else outs = outsBefore(plays, cur);
        bases = basesBefore(plays, cur);
      } else {
        const lc = lastCount(cur.evs); outs = lc ? lc.outs : 0;
        if (outs >= 3) { outs = 0; bases = 0; } else bases = basesAfter(cur.src);
      }
    }
    return { away, home, inning, top, outs, bases, balls, strikes, cur };
  }
  // The count before each pitch of a play.
  function pitchStates(src){
    const out = []; let b = 0, s = 0;
    for (const e of src.playEvents || []) {
      if (e.isPitch) out.push({ e, balls:b, strikes:s });
      if (e.count) { b = Math.min(3, e.count.balls); s = Math.min(2, e.count.strikes); }
    }
    return out;
  }
  // Half-innings the fan has seen end. A finished game closes its last half even without three outs.
  function completedHalves(plays, final){
    const out = [];
    for (let i = 0; i < plays.length; i++) {
      const v = plays[i]; if (!v.complete) continue;
      const lc = lastCount(v.evs), next = plays[i+1];
      const halfOver = (lc && lc.outs >= 3) || (next && !sameHalf(next, v)) || (final && i === plays.length - 1);
      if (halfOver) out.push({ inning: v.src.about.inning, top: v.src.about.halfInning === "top", playIndex: i, atBatIndex: v.src.about.atBatIndex });
    }
    return out;
  }
  // The plate appearance in which the winner took the lead for good.
  function goAhead(plays){
    const done = plays.filter(v => v.complete); if (!done.length) return null;
    const last = done[done.length-1].src.result, winAway = last.awayScore > last.homeScore;
    let idx = null, pa = 0, ph = 0;
    for (const v of done) {
      const a = v.src.result.awayScore, h = v.src.result.homeScore;
      const ledBefore = winAway ? pa > ph : ph > pa, leadsNow = winAway ? a > h : h > a;
      if (leadsNow && !ledBefore) idx = v;
      if (!leadsNow) idx = null;
      pa = a; ph = h;
    }
    return idx;
  }

  // ---------- sync ----------
  // taps: wall-clock ms at three releases in a row. starts: pitch start times from the feed.
  // Prefer three consecutive pitches whose spacing matches the taps, and take the smallest delay that fits.
  function syncOffset(taps, starts){
    if (taps.length < 2 || !starts.length) return null;
    const st = starts.slice().sort((a,b)=>a-b), k = taps.length, cands = [];
    for (let j = 0; j + k <= st.length; j++) {
      const d = taps.map((t, i) => t - st[j+i]).sort((a,b)=>a-b);
      const med = d[Math.floor(k/2)];
      if (d[k-1] - d[0] <= 2500 && med >= -5000 && med <= 150000) cands.push({ med, spread: d[k-1] - d[0] });
    }
    if (cands.length) {
      // Best fit wins; when two runs of pitches fit about equally well, take the smaller delay.
      const best = Math.min.apply(null, cands.map(c => c.spread));
      return Math.min.apply(null, cands.filter(c => c.spread <= best + 250).map(c => c.med));
    }
    // Fallback: allow a skipped pitch, still preferring the smallest delay.
    let best = null;
    for (let j = 0; j < st.length; j++) {
      const d0 = taps[0] - st[j]; if (d0 < -5000 || d0 > 150000) continue;
      let worst = 0;
      for (let i = 1; i < k; i++) { const target = taps[i] - d0; let near = Infinity; for (const x of st) near = Math.min(near, Math.abs(x - target)); worst = Math.max(worst, near); }
      if (worst <= 2500 && (best == null || d0 < best)) best = d0;
    }
    return best;
  }

  // ---------- keys ----------
  const ON_BASE = new Set(["single","double","triple","home_run","walk","intent_walk","hit_by_pitch","field_error","catcher_interf"]);
  const HITS = new Set(["single","double","triple","home_run"]);
  const XBH = new Set(["double","triple","home_run"]);
  const BB = new Set(["walk","intent_walk","hit_by_pitch"]);
  function gameStats(plays, mySide, starters, oppTop3){
    const s = { myPitchesSeen:0, myPA:0, myXBH:0, myBB:0, oppBB:0, starterOuts:0, starterIn:true, oppFP:0, oppFPS:0, top3OnBase:0, top3PA:0, myRuns:0, oppRuns:0 };
    let lastOuts = 0, lastHalf = "";
    for (const v of plays) {
      const p = v.src; if (!v.complete) continue;
      const battingSide = p.about.halfInning === "top" ? "away" : "home", opp = mySide === "away" ? "home" : "away";
      const halfKey = p.about.inning + p.about.halfInning; if (halfKey !== lastHalf) { lastOuts = 0; lastHalf = halfKey; }
      const lc = lastCount(v.evs), outsNow = lc ? lc.outs : lastOuts, outsMade = Math.max(0, outsNow - lastOuts); lastOuts = outsNow;
      const ev = p.result.eventType, pid = p.matchup.pitcher.id;
      if (battingSide === mySide) {
        s.myPA++; s.myPitchesSeen += v.pitches.length;
        if (XBH.has(ev)) s.myXBH++; if (BB.has(ev)) s.myBB++;
        if (pid === starters[opp] && v.pitches.length) { s.oppFP++; const f = v.pitches[0].details; if (f.isStrike || f.isInPlay) s.oppFPS++; }
      } else {
        if (BB.has(ev)) s.oppBB++;
        if (pid === starters[mySide]) s.starterOuts += outsMade; else s.starterIn = false;
        if (oppTop3.includes(p.matchup.batter.id)) { s.top3PA++; if (ON_BASE.has(ev)) s.top3OnBase++; }
      }
      s.myRuns = mySide === "away" ? p.result.awayScore : p.result.homeScore;
      s.oppRuns = mySide === "away" ? p.result.homeScore : p.result.awayScore;
    }
    return s;
  }
  // Lines are set so each key hits about half the time. sd puts margins on one scale so they compare across keys.
  function keyCatalog(ctx){
    const fpsLine = Math.round(ctx.oppFPS || 62);
    return [
      { id:"pitches", sd:0.3, lock:()=>null, text:`${ctx.me} hitters see 4.0 or more pitches per plate appearance.`,
        grade:(s,ph)=>{ const v = s.myPA ? s.myPitchesSeen/s.myPA : 0; return { hit: v >= 4.0, live: v >= 4.0, margin: v - 4.0, show: s.myPA ? `${v.toFixed(2)} pitches per plate appearance` : "No plate appearances yet" }; } },
      { id:"starter", sd:4, lock:s => s.starterOuts >= 15 ? "won" : !s.starterIn ? "lost" : null, text:`The ${ctx.me} starter records 15 or more outs.`,
        grade:(s,ph)=>({ hit: s.starterOuts >= 15, live: s.starterOuts >= 15 || (s.starterIn && s.starterOuts >= 3 * Math.min(5, ph.innings) - 1), margin: s.starterOuts - 15, show:`${s.starterOuts} outs${s.starterIn ? " and still pitching" : ""}` }) },
      { id:"fps", sd:10, lock:()=>null, text:`${ctx.oppStarter} gets a first-pitch strike on fewer than ${fpsLine}% of ${ctx.me} hitters, below his season rate.`,
        grade:(s,ph)=>{ const v = s.oppFP ? 100*s.oppFPS/s.oppFP : 0; return { hit: s.oppFP > 0 && v < fpsLine, live: s.oppFP > 0 && v < fpsLine, margin: fpsLine - v, show: s.oppFP ? `${Math.round(v)}% of ${s.oppFP} hitters` : "No hitters faced yet" }; } },
      { id:"xbh", sd:1.5, lock:s => s.myXBH >= 3 ? "won" : null, text:`The ${ctx.me} collect three or more extra-base hits.`,
        grade:(s,ph)=>({ hit: s.myXBH >= 3, live: s.myXBH >= Math.floor(3 * Math.min(1, ph.innings/9)), margin: s.myXBH - 3, show:`${s.myXBH} extra-base hit${s.myXBH===1?"":"s"}` }) },
      { id:"top3", sd:2, lock:s => s.top3OnBase > 4 ? "lost" : null, text:`The top three in the ${ctx.opp} order reach base four or fewer times.`,
        grade:(s,ph)=>({ hit: s.top3OnBase <= 4, live: s.top3OnBase <= Math.ceil(4 * Math.min(1, ph.innings/9)), margin: 4 - s.top3OnBase, show:`${s.top3OnBase} time${s.top3OnBase===1?"":"s"} on base in ${s.top3PA} trip${s.top3PA===1?"":"s"} to the plate` }) },
      { id:"walks", sd:2, lock:()=>null, text:`The ${ctx.me} draw more walks than their pitchers allow.`,
        grade:(s,ph)=>({ hit: s.myBB > s.oppBB, live: s.myBB > s.oppBB, margin: s.myBB - s.oppBB - 0.5, show:`${s.myBB} drawn and ${s.oppBB} allowed` }) },
    ];
  }
  function gradeKey(k, s, phase, innings){
    const g = k.grade(s, { innings: innings || 9 });
    const z = g.margin / k.sd;
    if (phase === "final") return Object.assign({ status: g.hit ? "Hit" : "Missed", z }, g);
    const lk = k.lock ? k.lock(s) : null;
    if (lk) return Object.assign({ status: lk === "won" ? "Clinched" : "Out of reach", z }, g);
    const close = Math.abs(z) < 0.25;
    return Object.assign({ status: close ? "Too close to call" : g.live ? "On track" : "Off track", z }, g);
  }

  // ---------- the read: one factual sentence per plate appearance ----------
  const lastOf = p => p.useLastName || p.lastName || p.boxscoreName || p.fullName.replace(/\s+(Jr\.|Sr\.|II|III|IV)$/,"").split(" ").slice(-1)[0];
  function nm(id, feed){
    const p = feed.gameData.players["ID"+id]; if (!p) return "He";
    const ln = lastOf(p);
    // Two players with the same last name (two Smiths) get first names too.
    if (!feed._dupes) { const seen = {}; feed._dupes = {}; for (const k in feed.gameData.players) { const q = lastOf(feed.gameData.players[k]); if (seen[q]) feed._dupes[q] = true; seen[q] = true; } }
    return feed._dupes[ln] ? p.fullName.replace(/\s+(Jr\.|Sr\.|II|III|IV)$/,"") : ln;
  }
  const tn = t => TYPE_NAME[t] || "pitch";
  function ordinal(n){ const s=["th","st","nd","rd"], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
  const PHRASE = { "H-in":"up and in", "H-mid":"up", "H-away":"up and away", "M-in":"on the inner half", "M-mid":"over the middle", "M-away":"on the outer half", "L-in":"down and in", "L-mid":"down", "L-away":"down and away",
    "C-high":"above the zone", "C-low":"below the zone", "C-in":"inside off the plate", "C-away":"off the plate away" };
  function spotPhrase(e, hand){ const sp = spotOf(e.pitchData, hand); return sp ? PHRASE[sp.adv] : "that was not tracked"; }
  function sentence(v, earlier, feed){
    const p = v.src, hand = p.matchup.batSide.code;
    const P = v.pitches.filter(e => e.details.type && e.details.type.code);
    const pit = nm(p.matchup.pitcher.id, feed), bat = nm(p.matchup.batter.id, feed);
    const ev = p.result.eventType;
    if (ev === "intent_walk") return `${pit} walked ${bat} intentionally.`;
    if (!P.length) return `${bat}'s plate appearance ended without a tracked pitch.`;
    const last = P[P.length-1], lt = last.details.type.code, lw = spotPhrase(last, hand);
    const ls = last.hitData && last.hitData.launchSpeed;
    const prev = earlier.filter(x => x.src.matchup.batter.id === p.matchup.batter.id && x.src.matchup.pitcher.id === p.matchup.pitcher.id && x.pitches.some(e => e.details.type)).pop();
    const prevLastE = prev ? prev.pitches.filter(e => e.details.type).pop() : null;
    const echo = prevLastE ? (prevLastE.details.type.code === lt ? `, the same pitch that ended their matchup in the ${ordinal(prev.src.about.inning)}` : `, after a ${tn(prevLastE.details.type.code)} ended their matchup in the ${ordinal(prev.src.about.inning)}`) : "";
    const before = P.slice(0,-1);
    const fbUp = before.filter(e => { const sp = spotOf(e.pitchData, hand); return fam(e.details.type.code) === "fastball" && sp && (sp.adv[0] === "H" || sp.adv === "C-high"); }).length;
    const n = P.length, pitches = `${n} pitch${n===1?"":"es"}`;
    const st = pitchStates(p).filter(x => x.e.details.type && x.e.details.type.code); const ls0 = st[st.length-1];
    const on = ls0 ? ` on ${ls0.balls}-${ls0.strikes}` : "";
    const whiffedBefore = before.some(e => e.details.type.code === lt && (e.details.code === "S" || e.details.code === "W"));
    if (ev === "strikeout" || ev === "strikeout_double_play") {
      const how = last.details.code === "C" ? "caught him looking at" : "got him swinging at";
      if (whiffedBefore) return `${pit} struck out ${bat} in ${pitches}. He ${how} a ${tn(lt)} ${lw}${on}, the same pitch ${bat} had already swung through in the at-bat.`;
      if (fbUp >= 2 && fam(lt) !== "fastball") return `${pit} showed ${bat} ${fbUp} fastballs up, then ${how} a ${tn(lt)} ${lw}${on}${echo}.`;
      return `${pit} struck out ${bat} in ${pitches}, and he ${how} a ${tn(lt)} ${lw}${on}${echo}.`;
    }
    if (ev === "walk") {
      const states = pitchStates(p), behind = states.find(x => x.balls - x.strikes >= 2), full = states.some(x => x.balls === 3 && x.strikes === 2);
      const zone = P.filter(e => { const sp = spotOf(e.pitchData, hand); return sp && sp.adv[0] !== "C"; }).length;
      if (n === 4 && P.every(e => e.details.isBall)) return `${pit} walked ${bat} on four straight balls. Ball four was a ${tn(lt)} ${lw}.`;
      const lead = behind ? `fell behind ${behind.balls}-${behind.strikes} and ` : full ? "battled to a full count and " : "";
      const zoneTxt = zone === 0 ? "without one of them in the strike zone" : `with ${zone} of them in the strike zone`;
      return `${pit} ${lead}walked ${bat} on ${pitches}, ${zoneTxt}. Ball four was a ${tn(lt)} ${lw}.`;
    }
    if (ev === "hit_by_pitch") return `${pit} hit ${bat} with a ${tn(lt)} on pitch ${n}.`;
    if (ev === "field_error") return `${bat} reached on an error after putting a ${tn(lt)} ${lw} in play.`;
    if (HITS.has(ev)) {
      const verb = { single:"singled", double:"doubled", triple:"tripled", home_run:"homered" }[ev];
      const sp = spotOf(last.pitchData, hand), centered = sp && ["M-mid","H-mid","M-in","M-away"].includes(sp.adv);
      return `${bat} ${verb} on a ${on ? on.trim().replace("on ", "") + " " : ""}${tn(lt)} ${lw}${ls ? ` at ${Math.round(ls)} mph off the bat` : ""}${centered && ev !== "single" ? ", a pitch that caught a lot of the plate" : ""}${echo}.`;
    }
    if (ev === "sac_fly") return `${bat} drove a ${tn(lt)} ${lw}${on} deep enough for a sacrifice fly.`;
    if (ev === "grounded_into_double_play" || ev === "double_play") return `${pit} got a double play from ${bat} on a ${tn(lt)} ${lw}${on}.`;
    return `${pit} retired ${bat} on a ${tn(lt)} ${lw}${on} after ${pitches}${ls && ls >= 100 ? `, though it left the bat at ${Math.round(ls)} mph` : ""}${echo}.`;
  }

  return { norm, advCredit, baseCredit, SHORT, FAMILY, TYPE_NAME, FAM_NAME, LOC_NAME, LOC_WORDS, ADV, ADV_NAME, BUCKET_NAME, fam, spotOf, advPartial, bucket,
    newBook, bookAdd, bookCell, bookCall, weights, pitchProb, PHRASE, grade, pointsFor, arsenal, mixLine, genericBook,
    paProbs, simulate, halfInning, rng, pyth, pythPregame, regressERA, shiftWP, logit, sigm,
    view, stateOf, pitchStates, lastCount, completedHalves, goAhead, syncOffset, basesBefore, basesAfter,
    gameStats, keyCatalog, gradeKey, sentence, ordinal, ON_BASE, tn, nm };
})();
if (typeof module !== "undefined") module.exports = KKE;
