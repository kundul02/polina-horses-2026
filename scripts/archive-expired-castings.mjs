#!/usr/bin/env node
/**
 * After each casting search/check: move expired listings to archive.
 * - Updates castings-registry.json (active → archive)
 * - Patches programs.html (closed, deadline, urgent)
 * - Syncs index.html
 *
 * Usage:
 *   node scripts/archive-expired-castings.mjs [--dry-run] [--date YYYY-MM-DD]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  formatClosedDeadline,
  isExpired,
  isRollingDeadline,
  parseDeadlineDate,
} from "./lib/casting-deadline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const REGISTRIES = [
  {
    domain: "equestrian",
    path: path.join(root, "research/equestrian/castings/castings-registry.json"),
    castingCategories: ["Кастинги", "Кастинги в актёрском мастерстве"],
  },
  {
    domain: "acting",
    path: path.join(root, "research/acting/castings/castings-registry.json"),
    castingCategories: ["Кастинги", "Кастинги в актёрском мастерстве"],
  },
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dateArgIdx = args.indexOf("--date");
const today =
  dateArgIdx >= 0 && args[dateArgIdx + 1]
    ? parseIsoDate(args[dateArgIdx + 1])
    : new Date();

if (!today) {
  console.error("Invalid --date; use YYYY-MM-DD");
  process.exit(1);
}

function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadProgramsFromHtml() {
  const htmlPath = path.join(root, "programs.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const start = script.indexOf("const ACTING_BASE_PROGRAMS = [");
  const progEnd = script.indexOf("let activeDomain");
  const runtimeCode = script.slice(start, progEnd);
  const factory = new Function(runtimeCode + "\nreturn PROGRAMS;");
  return { htmlPath, html, programs: factory() };
}

function isCastingProgram(program, categories) {
  return categories.includes(program.category);
}

function findActiveEntry(registry, siteProgramId) {
  const active = registry.castings?.active ?? [];
  return active.find((e) => e.siteProgramId === siteProgramId) ?? null;
}

function resolveDeadlineDate(program, registryEntry) {
  if (registryEntry?.deadline) {
    const fromIso = parseDeadlineDate(registryEntry.deadline);
    if (fromIso) return fromIso;
  }
  return parseDeadlineDate(program.deadline);
}

function shouldSkipAutoArchive(program, registryEntry) {
  if (program.closed) return true;
  if (registryEntry?.type === "platform" || registryEntry?.type === "agency_pool") return true;
  if (registryEntry && registryEntry.deadline === null && isRollingDeadline(program.deadline)) return true;
  if (!registryEntry && isRollingDeadline(program.deadline)) return true;
  return false;
}

function findProgramBlock(html, id) {
  const marker = `id: ${id},`;
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;

  let braceStart = html.lastIndexOf("{", markerIdx);
  let depth = 0;
  for (let i = braceStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        return { start: braceStart, end: i + 1, block: html.slice(braceStart, i + 1) };
      }
    }
  }
  return null;
}

function setFieldInBlock(block, field, value) {
  const formatted =
    typeof value === "boolean" ? String(value) : `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const re = new RegExp(`(\\b${field}:\\s*)(?:true|false|null|"[^"]*")`);
  if (re.test(block)) return block.replace(re, `$1${formatted}`);
  return block.replace(/(\n\s*)(closed:|urgent:|url:)/, `$1${field}: ${formatted},\n$2`);
}

function patchProgramInHtml(html, id, { deadline, closed, urgent, tone }) {
  const found = findProgramBlock(html, id);
  if (!found) return { html, changed: false };

  let block = found.block;
  block = setFieldInBlock(block, "deadline", deadline);
  block = setFieldInBlock(block, "closed", closed);
  block = setFieldInBlock(block, "urgent", urgent);
  if (tone !== undefined) block = setFieldInBlock(block, "tone", tone);

  return {
    html: html.slice(0, found.start) + block + html.slice(found.end),
    changed: true,
  };
}

function moveToArchive(registry, entry, closedReason) {
  registry.castings.active = registry.castings.active.filter((e) => e !== entry);
  const archived = {
    ...entry,
    closedReason,
    archivedAt: formatLocalDate(today),
  };
  delete archived.urgent;
  registry.castings.archive = registry.castings.archive ?? [];
  const exists = registry.castings.archive.some(
    (e) => e.siteProgramId === entry.siteProgramId || e.id === entry.id
  );
  if (!exists) registry.castings.archive.unshift(archived);
}

function appendCheckLog(registry, archivedIds) {
  if (!archivedIds.length) return;
  registry.checkLog = registry.checkLog ?? [];
  registry.checkLog.unshift({
    date: formatLocalDate(today),
    checker: "archive-expired-castings.mjs",
    archived: archivedIds,
    activeCount: registry.castings.active?.length ?? 0,
    watchCount: registry.castings.watch?.length ?? 0,
    notes: `Auto-archive: ${archivedIds.length} expired casting(s)`,
  });
}

function updateVerifiedJson(programId, deadline, closed) {
  const verifiedPath = path.join(root, "research/programs-verified.json");
  if (!fs.existsSync(verifiedPath)) return;
  const verified = JSON.parse(fs.readFileSync(verifiedPath, "utf8"));
  const key = String(programId);
  if (!verified.programs?.[key]) return;
  verified.programs[key].deadline = deadline;
  verified.programs[key].closed = closed;
  verified.programs[key].urgent = false;
  if (!dryRun) fs.writeFileSync(verifiedPath, JSON.stringify(verified, null, 2) + "\n");
}

function run() {
  const { htmlPath, programs: allPrograms } = loadProgramsFromHtml();
  let html = fs.readFileSync(htmlPath, "utf8");
  const report = { date: formatLocalDate(today), dryRun, archived: [] };

  for (const cfg of REGISTRIES) {
    const registry = JSON.parse(fs.readFileSync(cfg.path, "utf8"));
    const castingPrograms = allPrograms.filter((p) => isCastingProgram(p, cfg.castingCategories));
    const archivedIds = [];

    for (const program of castingPrograms) {
      const entry = findActiveEntry(registry, program.id);
      if (!entry) continue;
      if (shouldSkipAutoArchive(program, entry)) continue;

      const deadlineDate = resolveDeadlineDate(program, entry);
      if (!deadlineDate || !isExpired(deadlineDate, today)) continue;

      const closedDeadline = formatClosedDeadline(deadlineDate);
      const closedReason = `дедлайн ${deadlineDate.toISOString().slice(0, 10)}`;

      report.archived.push({
        domain: cfg.domain,
        id: program.id,
        name: program.name,
        wasDeadline: program.deadline,
        newDeadline: closedDeadline,
        registryId: entry?.id ?? null,
      });

      if (!dryRun) {
        const patched = patchProgramInHtml(html, program.id, {
          deadline: closedDeadline,
          closed: true,
          urgent: false,
          tone: "neutral",
        });
        html = patched.html;

        if (entry) moveToArchive(registry, entry, closedReason);
        updateVerifiedJson(program.id, closedDeadline, true);
      }

      archivedIds.push(program.id);
    }

    if (!dryRun && archivedIds.length) {
      appendCheckLog(registry, archivedIds);
      fs.writeFileSync(cfg.path, JSON.stringify(registry, null, 2) + "\n");
    }
  }

  if (!dryRun && report.archived.length) {
    fs.writeFileSync(htmlPath, html);
    fs.copyFileSync(htmlPath, path.join(root, "index.html"));
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.archived.length === 0) {
    console.error("No expired castings to archive.");
  } else if (dryRun) {
    console.error(`Dry run: would archive ${report.archived.length} casting(s).`);
  } else {
    console.error(`Archived ${report.archived.length} casting(s). Synced index.html.`);
  }
}

run();
