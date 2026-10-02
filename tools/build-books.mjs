// Builds books.json: every pitcher's season book for your team's next game, both staffs.
// Runs on GitHub Actions each morning (see .github/workflows/books.yml). No API key needed.
// Usage: node tools/build-books.mjs [teamId]   (default 144, the Braves)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const API = "https://statsapi.mlb.com";

export async function buildBooks({ team = 144, fetchFn = globalThis.fetch, today } = {}) {
  const j = async path => { const r = await fetchFn(API + path); if (!r.ok) throw new Error(`${r.status} ${path}`); return r.json(); };
  today = today || new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const season = today.slice(0, 4);
  const plus = d => new Date(Date.parse(today + "T12:00:00Z") + d * 864e5).toISOString().slice(0, 10);
  const sch = await j(`/api/v1/schedule?sportId=1&teamId=${team}&startDate=${today}&endDate=${plus(5)}&hydrate=probablePitcher`);
  const games = (sch.dates || []).flatMap(d => d.games).filter(g => g.status.abstractGameState !== "Final");
  const next = games[0];
  const teams = new Set([team]);
  const ids = new Set();
  if (next) {
    for (const side of ["away", "home"]) { teams.add(next.teams[side].team.id); const pp = next.teams[side].probablePitcher; if (pp) ids.add(pp.id); }
  }
  for (const t of teams) {
    try {
      const r = await j(`/api/v1/teams/${t}/roster?rosterType=active&season=${season}`);
      for (const p of r.roster || []) if (p.position && (p.position.type === "Pitcher" || p.position.code === "1" || p.position.abbreviation === "TWP")) ids.add(p.person.id);
    } catch (e) { console.warn("roster failed for", t, e.message); }
  }
  const pbpCache = new Map();
  const pbp = pk => { if (!pbpCache.has(pk)) pbpCache.set(pk, j(`/api/v1/game/${pk}/playByPlay`)); return pbpCache.get(pk); };
  const out = {};
  const list = [...ids];
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < list.length) {
      const pid = list[i++];
      try {
        const gl = await j(`/api/v1/people/${pid}/stats?stats=gameLog&group=pitching&season=${season}`);
        const splits = ((gl.stats && gl.stats[0] && gl.stats[0].splits) || []).filter(s => s.date < today && s.game);
        if (!splits.length) continue;
        const starter = splits.filter(s => s.stat && s.stat.gamesStarted).length > splits.length / 2;
        const name = splits[0].player ? splits[0].player.fullName : String(pid);
        const book = E.newBook(pid, name);
        for (const s of splits.slice(starter ? -22 : -25)) {
          let g; try { g = await pbp(s.game.gamePk); } catch (e) { continue; }
          for (const p of g.allPlays || []) {
            if (p.matchup.pitcher.id !== pid) continue;
            const hand = p.matchup.batSide.code; let first = true;
            for (const ps of E.pitchStates(p)) {
              const e = ps.e; if (!e.details || !e.details.type) continue;
              if (first) { book.fps.n++; if (e.details.isStrike || e.details.isInPlay) book.fps.s++; first = false; }
              E.bookAdd(book, hand, E.bucket(ps.balls, ps.strikes), e.details.type.code, E.spotOf(e.pitchData, hand), e.pitchData && e.pitchData.startSpeed);
            }
          }
          book.games++;
        }
        if (book.n) out[pid] = book;
      } catch (e) { console.warn("book failed for", pid, e.message); }
    }
  }));
  return { built: today, generated: new Date().toISOString(), team, gamePk: next ? next.gamePk : null, games: pbpCache.size, pitchers: out };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const team = +(process.argv[2] || 144);
  const res = await buildBooks({ team });
  writeFileSync(new URL("../books.json", import.meta.url), JSON.stringify(res));
  console.log(`Built ${Object.keys(res.pitchers).length} pitcher books from ${res.games} games for ${res.built}.`);
}
