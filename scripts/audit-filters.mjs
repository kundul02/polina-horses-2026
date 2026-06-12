import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "../programs.html"), "utf8");
let script = html.match(/<script>([\s\S]*)<\/script>/)[1]
  .replace(/initDomainFromUrl\(\);\s*render\(\);/, "")
  .replace(/window\.addEventListener\('hashchange'[\s\S]*?\}\);/, "")
  .replace(/let (activeDomain|activeStatus|activeCategory|activeCountry|activeAge) =/g, "globalThis.$1 =");
script += `\nglobalThis.__api = {
  PROGRAMS, DOMAINS, getStatusPool, getCategoryChipCount, getCountryChipCount,
  programsForCategoryAndCountry, getVisiblePrograms, clearStaleCountryFilter
};\n`;

const ctx = {
  globalThis: {},
  document: { getElementById: () => ({ innerHTML: "", textContent: "", hidden: true }), querySelector: () => null, querySelectorAll: () => [] },
  window: { location: { hash: "" }, addEventListener: () => {}, localStorage: { getItem: () => null, setItem: () => {} } },
  localStorage: { getItem: () => null, setItem: () => {} },
  console,
};
ctx.globalThis = ctx;
vm.runInContext(script, vm.createContext(ctx));

const {
  PROGRAMS,
  DOMAINS,
  getStatusPool,
  getCategoryChipCount,
  getCountryChipCount,
  getVisiblePrograms,
  clearStaleCountryFilter,
} = ctx.__api;

const issues = [];

const ids = PROGRAMS.map((p) => p.id);
const dupIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
if (dupIds.length) issues.push({ type: "duplicate_ids", ids: dupIds });

for (const p of PROGRAMS) {
  if (!p.url || !/^https?:\/\//i.test(p.url)) {
    issues.push({ type: "bad_url", id: p.id, name: p.name, url: p.url });
  }
  if (p.closed && p.urgent) issues.push({ type: "closed_urgent", id: p.id, name: p.name });
  if (p.closed && p.isNew) issues.push({ type: "closed_new", id: p.id, name: p.name });
  const cfg = DOMAINS[p.domain];
  if (!cfg) {
    issues.push({ type: "unknown_domain", id: p.id, domain: p.domain });
    continue;
  }
  if (!["new", "urgent"].includes(p.category) && !cfg.categories.includes(p.category)) {
    issues.push({ type: "orphan_category", id: p.id, domain: p.domain, category: p.category });
  }
}

function visibleCount() {
  ctx.activeStatus = "open";
  return getVisiblePrograms().length;
}

for (const domain of Object.keys(DOMAINS)) {
  const ages = DOMAINS[domain].ageTiers || ["16", "17", "18"];
  for (const age of ages) {
    ctx.activeDomain = domain;
    ctx.activeAge = age;
    ctx.activeCountry = "all";

    for (const cat of ["all", ...DOMAINS[domain].categories, "new", "urgent"]) {
      ctx.activeCategory = cat;
      if (getCategoryChipCount(cat) !== visibleCount()) {
        issues.push({ type: "chip_mismatch", domain, age, filter: cat });
      }
      if (cat === "new") {
        const panelNew = getVisiblePrograms().filter((p) => p.isNew).length;
        if (panelNew !== visibleCount()) {
          issues.push({ type: "new_panel_mismatch", domain, age, panelNew, visible: visibleCount() });
        }
      }
    }

    ctx.activeStatus = "open";
    for (const country of [...new Set(getStatusPool().map((p) => p.baseCountry))]) {
      ctx.activeCategory = "all";
      ctx.activeCountry = country;
      if (getCountryChipCount(country) !== visibleCount()) {
        issues.push({ type: "country_chip_mismatch", domain, age, country });
      }
    }
  }
}

ctx.activeDomain = "acting";
ctx.activeStatus = "open";
ctx.activeCategory = "Стипендии";
ctx.activeCountry = "UK";
ctx.activeAge = "16";
clearStaleCountryFilter();
if (ctx.activeCountry !== "all") {
  issues.push({ type: "stale_country_not_cleared", domain: "acting" });
}

const summary = {
  programs: PROGRAMS.length,
  duplicateIds: dupIds.length,
  issueCount: issues.length,
  issues: issues.slice(0, 20),
};

console.log(JSON.stringify(summary, null, 2));
process.exitCode = issues.length ? 1 : 0;
