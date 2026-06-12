#!/usr/bin/env node
/** Export all runtime programs (4 domains) with assigned ids. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "programs.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const start = script.indexOf("const ACTING_BASE_PROGRAMS = [");
const end = script.indexOf("function normalizeKey(value)");
const dataCode = script.slice(start, end);

const fnStart = script.indexOf("function hasMeaningfulPay");
const fnEnd = script.indexOf("function buildDocumentsPanelHtml");
const fnCode = script.slice(fnStart, fnEnd);

const factory = new Function(
  dataCode +
    fnCode +
    "\nreturn { BASE_PROGRAMS, LATEST_FEED, ACTING_BASE_PROGRAMS, ACTING_LATEST_FEED, VOLUNTEERING_BASE_PROGRAMS, VOLUNTEERING_FEED };"
);
const ctx = factory();

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function normalizeCountry(country) {
  const map = {
    usa: "USA",
    uk: "UK",
    ireland: "Ирландия",
    germany: "Германия",
    france: "Франция",
    poland: "Польша",
    spain: "Испания",
    portugal: "Португалия",
    denmark: "Дания",
    australia: "Австралия",
    "south africa": "ЮАР",
    argentina: "Аргентина",
    slovenia: "Словения",
    sweden: "Швеция",
    belgium: "Бельгия",
    canada: "Canada",
    "united kingdom": "UK",
    "united states": "USA",
    "new zealand": "New Zealand",
    georgia: "Georgia",
    "schengen area": "Европа (Schengen)",
    israel: "Израиль",
    израиль: "Израиль",
  };
  return map[normalizeKey(country)] || country;
}

function normalizeMinAge(minAge, ageRange) {
  const n = Number(minAge);
  if (Number.isFinite(n) && n > 0) return n;
  const fromRange = String(ageRange || "").match(/\d+/);
  return fromRange ? Number(fromRange[0]) : 16;
}

function inferCategory(type, title, domain) {
  const source = `${type || ""} ${title || ""}`.toLowerCase();
  if (domain === "acting") {
    if (source.includes("audition") || source.includes("casting") || source.includes("open call"))
      return "Аудиции";
    if (source.includes("scholarship") || source.includes("grant") || source.includes("financial aid"))
      return "Стипендии";
    if (source.includes("internship") || source.includes("apprentice") || source.includes("backstage"))
      return "Стажировки";
    if (
      source.includes("volunteering") ||
      source.includes("exchange") ||
      source.includes("solidarity corps") ||
      source.includes("esc")
    )
      return "Обмен";
    if (
      source.includes("intensive") ||
      source.includes("camp") ||
      source.includes("conservatory") ||
      source.includes("summer") ||
      source.includes("workshop")
    )
      return "Интенсивы";
    return "Интенсивы";
  }
  if (source.includes("casting")) return "Кастинги";
  if (source.includes("scholarship") || source.includes("grant") || source.includes("bursary"))
    return "Стипендии";
  if (
    source.includes("internship") ||
    source.includes("apprentice") ||
    source.includes("working student") ||
    source.includes("working pupil") ||
    source.includes("au pair") ||
    source.includes("placement")
  )
    return "Стажировки";
  if (
    source.includes("volunteering") ||
    source.includes("solidarity corps") ||
    source.includes("esc") ||
    source.includes("exchange")
  )
    return "Обмен";
  if (
    source.includes("camp") ||
    source.includes("clinic") ||
    source.includes("training series") ||
    source.includes("intensive")
  )
    return "Интенсивы";
  if (source.includes("audition")) return "Аудиции";
  return "Стажировки";
}

function inferSupport(item) {
  const tags = [];
  const blob = `${item.accommodation || ""} ${item.travel_support || ""} ${item.training || ""} ${item.pay || ""}`.toLowerCase();
  if (/accommodation|room|board|housing|жиль/.test(blob)) tags.push("Жильё");
  if (/travel|flight|reimbursement|дорог/.test(blob)) tags.push("Дорога");
  if (/training|lesson|education|обуч/.test(blob)) tags.push("Обучение");
  if (/pay|salary|allowance|stipend|paid|€|£|\$|оплат/.test(blob)) tags.push("Оплата");
  if (tags.length === 0) tags.push("Обучение");
  return tags;
}

function inferTone(deadline, closed) {
  if (closed) return "neutral";
  const v = String(deadline || "").toLowerCase();
  if (/срочно|urgent|2026-06|2026-07|june|july/.test(v)) return "red";
  if (/rolling|open|открыт/.test(v)) return "green";
  return "orange";
}

function mapIncoming(item, domain) {
  const status = String(item.status || "new").toLowerCase();
  const closed = status === "closed";
  const baseCountry = normalizeCountry(item.country);
  return {
    domain,
    name: item.title,
    org: item.title.includes(":") ? item.title.split(":")[0].trim() : item.title,
    category: inferCategory(item.type, item.title, domain),
    baseCountry,
    country: baseCountry,
    age: item.age_range || "16+",
    minAge: normalizeMinAge(item.min_age, item.age_range),
    deadline: item.deadline || "Уточнить",
    dates: item.dates || item.program_dates || "Уточнить на сайте",
    tone: inferTone(item.deadline, closed),
    support: inferSupport(item),
    pay: item.pay || "Уточнить",
    summary: item.reason_fit || item.training || "",
    desc: item.reason_fit || item.training || "Уточнить детали на сайте программы.",
    url: item.link,
    urgent: false,
    check: status === "needs_manual_check" ? item.reason_fit : null,
    closed,
    isNew: status === "new" && !closed,
  };
}

function isSameProgram(existing, incoming) {
  if (existing.url === incoming.url) return true;
  const a = normalizeKey(existing.name);
  const b = normalizeKey(incoming.name);
  if (a === b) return true;
  if (a.includes("skatlica") && b.includes("skatlica")) return true;
  if (a.includes("american horse council") && b.includes("american horse council")) return true;
  if (a.includes("british racing school") && b.includes("british racing school")) return true;
  if (a.includes("working holiday visa") && b.includes("working holiday visa") && existing.baseCountry === incoming.baseCountry)
    return true;
  if (a.includes("pony club") && b.includes("pony club") && existing.baseCountry === incoming.baseCountry) return true;
  return false;
}

function mergePrograms(base, feed, domain) {
  const merged = base.map((program) => ({ ...program, domain: program.domain || domain }));
  let nextId = merged.reduce((maxId, p) => Math.max(maxId, p.id), 0) + 1;
  for (const item of feed) {
    const mapped = mapIncoming(item, domain);
    const idx = merged.findIndex((ex) => isSameProgram(ex, mapped));
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], ...mapped, id: merged[idx].id };
    } else {
      merged.push({ id: nextId++, ...mapped });
    }
  }
  return merged;
}

const VOLUNTEERING_IDS = new Set([18, 24, 31, 54, 1014, 1015, 1016]);

function resolveProgramDomain(program) {
  const p = { ...program };
  if (p.domain === "volunteering") return p;
  if (p.domain === "castings") {
    p.category = "Кастинги";
    return p;
  }
  const name = (p.name || "").toLowerCase();
  const cat = p.category || "";
  if (cat === "Кастинги" || cat === "Кастинги в актёрском мастерстве") {
    p.domain = "castings";
    p.category = "Кастинги";
    return p;
  }
  const isEsc = name.includes("esc ") || name.includes("solidarity corps") || name.includes("european solidarity");
  const isVolExchange = name.includes("volunteer") && (name.includes("exchange") || name.includes("work exchange"));
  const isMasaGap = name.includes("masa") && name.includes("gap");
  if (VOLUNTEERING_IDS.has(p.id) || isEsc || isVolExchange || isMasaGap || (p.domain === "acting" && cat === "Обмен")) {
    const origDomain = p.domain;
    p.domain = "volunteering";
    if (!p.audience) p.audience = "teen";
    if (p.category === "35+" || p.audience === "adult") p.category = "35+";
    else if (isEsc || cat === "ESC" || (origDomain === "acting" && cat === "Обмен")) p.category = "ESC";
    else if (isVolExchange || cat === "Волонтёрский обмен") p.category = "Волонтёрский обмен";
    else if (!["ESC", "Волонтёрский обмен", "Социальные проекты", "35+"].includes(p.category)) p.category = "Социальные проекты";
    return p;
  }
  if (!p.domain || p.domain === "equestrian" || p.domain === "acting") {
    if (p.domain === "acting") return p;
    return { ...p, domain: p.domain || "equestrian" };
  }
  return p;
}

const all = [
  ...mergePrograms(ctx.BASE_PROGRAMS, ctx.LATEST_FEED, "equestrian"),
  ...mergePrograms(ctx.ACTING_BASE_PROGRAMS, ctx.ACTING_LATEST_FEED, "acting"),
  ...mergePrograms(ctx.VOLUNTEERING_BASE_PROGRAMS || [], ctx.VOLUNTEERING_FEED || [], "volunteering"),
].map(resolveProgramDomain);

const out = all.map((p) => ({
  id: p.id,
  domain: p.domain,
  name: p.name,
  org: p.org,
  category: p.category,
  baseCountry: p.baseCountry,
  country: p.country,
  age: p.age,
  minAge: p.minAge,
  deadline: p.deadline,
  dates: p.dates,
  pay: p.pay,
  support: p.support,
  summary: p.summary,
  desc: p.desc,
  url: p.url,
  closed: p.closed,
  urgent: p.urgent,
  check: p.check,
  documents: p.documents,
  audience: p.audience,
}));

const outPath = path.join(root, "research", "all-programs-full.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
const feed = out.filter((p) => p.id >= 55 && p.id <= 107);
console.log(`Exported ${out.length} programs → ${outPath}`);
console.log(`Feed programs (55–107): ${feed.length}`);
