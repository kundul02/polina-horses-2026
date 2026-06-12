#!/usr/bin/env node
/**
 * One-time migration: 2 domains → 4 (castings, volunteering, equestrian, acting).
 * Patches programs.html in place.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "../programs.html");
let html = fs.readFileSync(htmlPath, "utf8");

const CASTING_IDS = new Set([19, 20, 46, 47, 48, 49, 50]);
for (let id = 1021; id <= 1045; id++) CASTING_IDS.add(id);

const VOLUNTEERING = {
  18: { category: "ESC", audience: "teen" },
  24: { category: "Волонтёрский обмен", audience: "teen" },
  31: { category: "Волонтёрский обмен", audience: "teen" },
  54: { category: "Социальные проекты", audience: "teen" },
  55: { category: "ESC", audience: "teen" },
  56: { category: "ESC", audience: "teen" },
  1014: { category: "ESC", audience: "teen" },
  1015: { category: "ESC", audience: "teen" },
  1016: { category: "ESC", audience: "teen" },
};

function loadPrograms() {
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1]
    .replace(/initDomainFromUrl\(\);\s*render\(\);/, "")
    .replace(/window\.addEventListener\('hashchange'[\s\S]*?\}\);/, "")
    .replace(/let (activeDomain|activeStatus|activeCategory|activeCountry|activeAge) =/g, "globalThis.$1 =");
  const ctx = {
    globalThis: {},
    document: { getElementById: () => ({ innerHTML: "", textContent: "", hidden: true }), querySelector: () => null, querySelectorAll: () => [] },
    window: { location: { hash: "" }, addEventListener: () => {}, localStorage: { getItem: () => null, setItem: () => {} } },
    localStorage: { getItem: () => null, setItem: () => {} },
    console,
  };
  ctx.globalThis = ctx;
  vm.runInContext(script + "\nglobalThis.__PROGRAMS = PROGRAMS;", vm.createContext(ctx));
  return ctx.__PROGRAMS;
}

function patchProgramBlock(block, changes) {
  let out = block;
  if (changes.domain) {
    if (/domain:\s*"/.test(out)) {
      out = out.replace(/domain:\s*"[^"]*"/, `domain: "${changes.domain}"`);
    } else {
      out = out.replace(/(id:\s*\d+,)/, `$1 domain: "${changes.domain}",`);
    }
  }
  if (changes.category) {
    out = out.replace(/category:\s*"[^"]*"/, `category: "${changes.category}"`);
  }
  if (changes.audience) {
    if (/audience:\s*"/.test(out)) {
      out = out.replace(/audience:\s*"[^"]*"/, `audience: "${changes.audience}"`);
    } else {
      out = out.replace(/(minAge:\s*\d+,)/, `$1 audience: "${changes.audience}",`);
    }
  }
  return out;
}

function findProgramBlock(source, id) {
  const re = new RegExp(`\\{[^{}]*?id:\\s*${id}\\b[\\s\\S]*?urgent:\\s*[^,}]+(?:,\\s*check:\\s*[^,}]+)?\\s*\\}`, "g");
  const matches = [...source.matchAll(re)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][0];
}

const programs = loadPrograms();
const report = [];

for (const p of programs) {
  let domain = p.domain || "equestrian";
  let category = p.category;
  let audience;

  if (CASTING_IDS.has(p.id)) {
    domain = "castings";
    category = "Кастинги";
  } else if (VOLUNTEERING[p.id]) {
    domain = "volunteering";
    category = VOLUNTEERING[p.id].category;
    audience = VOLUNTEERING[p.id].audience;
  } else if (domain === "acting" && category === "Кастинги в актёрском мастерстве") {
    domain = "castings";
    category = "Кастинги";
  } else if (domain === "equestrian" && category === "Кастинги") {
    domain = "castings";
    category = "Кастинги";
  } else if (domain === "acting" && category === "Обмен") {
    domain = "volunteering";
    category = "ESC";
    audience = "teen";
  } else if (domain === "equestrian" && category === "Обмен") {
    const name = (p.name || "").toLowerCase();
    if (name.includes("esc") || name.includes("solidarity") || name.includes("volunteer")) {
      domain = "volunteering";
      category = name.includes("esc") || name.includes("solidarity") ? "ESC" : "Социальные проекты";
      audience = "teen";
    }
  } else if (domain === "equestrian" && category === "Стажировки") {
    const name = (p.name || "").toLowerCase();
    if (name.includes("volunteer") && (name.includes("exchange") || name.includes("work exchange"))) {
      domain = "volunteering";
      category = "Волонтёрский обмен";
      audience = "teen";
    }
  }

  if (domain !== p.domain || category !== p.category || audience) {
    const block = findProgramBlock(html, p.id);
    if (!block) {
      report.push({ id: p.id, error: "block not found" });
      continue;
    }
    const patched = patchProgramBlock(block, { domain, category, audience });
    if (patched !== block) {
      html = html.replace(block, patched);
      report.push({ id: p.id, name: p.name, from: p.domain, to: domain, category, audience });
    }
  }
}

fs.writeFileSync(htmlPath, html);
console.log(`Migrated ${report.length} programs:`);
for (const r of report) {
  if (r.error) console.log(`  ! id ${r.id}: ${r.error}`);
  else console.log(`  id ${r.id}: ${r.from} → ${r.to} [${r.category}]${r.audience ? ` audience=${r.audience}` : ""}`);
}
