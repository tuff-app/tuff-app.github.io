// Community benchmark reports are generated from reviewed TUFF Discussions.
// Treat the JSON as data: every supplied string is rendered as a text node.
"use strict";

const view = document.getElementById("view");
const REFRESH_MS = 60_000;
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const str = (v) => typeof v === "string" ? v : finite(v) ? String(v) : "";
const num = (v) => finite(v) ? v : null;

// Sortable metrics. `best` is the default direction (speeds high-first, latency low-first).
const METRICS = {
  decode: { label: "Decode", desc: true },
  prefill: { label: "Prefill", desc: true },
  ttft: { label: "First token", desc: false },
  followup_ttft: { label: "Follow-up", desc: false },
  model: { label: "Model", text: true, desc: false },
  tuff: { label: "TUFF", text: true, desc: true },
  posted: { label: "Newest", text: true, desc: true },
};
const DEFAULT_QUERY = { model: "", chip: "", ram: "", tuff: "", held: "", view: "", sort: "decode", dir: "" };

let data = null;
let loadError = false;
let entries = [];
const expanded = new Set();

// ---- formatting ----------------------------------------------------------

const speed = (v, digits) => finite(v) && v > 0 ? `${v.toFixed(digits ?? (v >= 100 ? 0 : v >= 10 ? 1 : 2))}` : null;
const secs = (v) => finite(v) && v >= 0 ? (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) : null;
const chipShort = (chip) => str(chip).replace(/^Apple /, "");
const ctxLabel = (n) => !finite(n) || n <= 0 ? "" : n >= 1024 && n % 1024 === 0 ? `${n / 1024}K ctx` : `${n} ctx`;
const macLabel = (e) => [chipShort(e.chip), finite(e.memory_gb) && e.memory_gb > 0 ? `${e.memory_gb} GB` : ""].filter(Boolean).join(" · ") || "Mac not specified";
const modelLabel = (e) => str(e.model_name) || str(data?.models?.[str(e.model)]) || str(e.model) || "Unknown model";
const tuffLabel = (e) => str(e.tuff) ? `TUFF ${str(e.tuff)}` : "";
const dateLabel = (s) => { const d = new Date(str(s)); return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : ""; };
const median = (values) => {
  const v = values.filter((x) => finite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

function compareVersions(a, b) {
  const pa = str(a).split(".").map(Number);
  const pb = str(b).split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

// Only reports that passed review and their own check may set bar scale.
const ranked = (e) => e.check !== false && (e.trust === "community" || e.trust === "verified");

function status(e) {
  if (e.check === false) return "Check failed";
  if (e.trust === "needs-review") return "Held";
  if (e.trust === "rejected") return "Rejected";
  if (e.trust === "verified" || e.trust === "community") return "";
  return "Unreviewed";
}

function discussionUrl(e) {
  try {
    const url = new URL(str(e.url));
    return url.protocol === "https:" && url.hostname === "github.com"
      && /^\/tuff-app\/TUFF\/discussions\/\d+(?:\/|$)/i.test(url.pathname) ? url.href : null;
  } catch { return null; }
}
const authorUrl = (a) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(str(a)) ? `https://github.com/${str(a)}` : null;

// ---- DOM helpers ----------------------------------------------------------

function node(tag, className, content, attrs) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (content !== undefined && content !== null) n.textContent = content;
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? "" : v);
  return n;
}
function link(text, href, external) {
  const a = node("a", "", text);
  a.href = href;
  if (external) a.rel = "noopener noreferrer";
  return a;
}
const enc = encodeURIComponent;

// ---- routing (hash) -------------------------------------------------------
// #/                         list
// #/model/<id>  #/mac/<chip>/<gb>  #/post/<n>
// ?model=&chip=&ram=&tuff=&held=1&view=runs&sort=&dir=asc|desc
// Legacy "#model/<id>" forms without the leading slash still resolve.

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const params = new URLSearchParams(query);
  const q = { ...DEFAULT_QUERY };
  for (const key of Object.keys(q)) if (params.has(key)) q[key] = params.get(key) ?? "";
  if (!METRICS[q.sort]) q.sort = "decode";
  return { parts, q };
}

function hashFor(path, q) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) if (value && value !== DEFAULT_QUERY[key]) params.set(key, value);
  const query = params.toString();
  return `#/${path}${query ? `?${query}` : ""}`;
}
const routePath = (parts) => parts.map(enc).join("/");

function update(route, patch) {
  const q = { ...route.q, ...patch };
  history.replaceState(null, "", hashFor(routePath(route.parts), q));
  render();
}

// ---- data -----------------------------------------------------------------

async function load() {
  try {
    const response = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = await response.json();
    const changed = !data || next?.generated !== data?.generated;
    data = next && typeof next === "object" ? next : {};
    entries = (Array.isArray(data.entries) ? data.entries : []).filter((r) => r && typeof r === "object" && !Array.isArray(r));
    loadError = false;
    if (!changed) return;
  } catch {
    if (data) return;
    loadError = true;
  }
  render();
}

// A group is one setup: model + Mac + TUFF version + context + run mode.
function groupEntries(list) {
  const map = new Map();
  for (const e of list) {
    const key = [e.model, e.chip, e.memory_gb, e.tuff, e.context, e.mode].map(str).join("|");
    if (!map.has(key)) map.set(key, { key, entries: [] });
    map.get(key).entries.push(e);
  }
  return [...map.values()].map((g) => {
    const first = g.entries[0];
    const pick = (k) => median(g.entries.map((e) => e[k]));
    const decodes = g.entries.map((e) => e.decode).filter((v) => finite(v) && v > 0);
    return {
      ...g, sample: first, model: first.model, model_name: first.model_name, chip: first.chip, memory_gb: first.memory_gb,
      tuff: first.tuff, context: first.context, mode: first.mode,
      decode: pick("decode"), prefill: pick("prefill"), ttft: pick("ttft"), followup_ttft: pick("followup_ttft"),
      low: decodes.length ? Math.min(...decodes) : null, high: decodes.length ? Math.max(...decodes) : null,
      people: new Set(g.entries.map((e) => str(e.author)).filter(Boolean)).size || g.entries.length,
      verified: g.entries.every((e) => e.trust === "verified"),
      posted: g.entries.map((e) => str(e.posted)).sort().at(-1) ?? "",
    };
  });
}

function sortRows(rows, q) {
  const metric = METRICS[q.sort];
  const descending = q.dir ? q.dir === "desc" : metric.desc;
  return [...rows].sort((a, b) => {
    const x = metric.text ? (q.sort === "model" ? modelLabel(a) : str(a[q.sort])) : a[q.sort];
    const y = metric.text ? (q.sort === "model" ? modelLabel(b) : str(b[q.sort])) : b[q.sort];
    const xn = metric.text ? x === "" : !finite(x);
    const yn = metric.text ? y === "" : !finite(y);
    if (xn && yn) return 0;
    if (xn) return 1;
    if (yn) return -1;
    let order;
    if (q.sort === "tuff") order = compareVersions(x, y);
    else order = typeof x === "string" ? x.localeCompare(y) : x - y;
    return descending ? -order : order;
  });
}

function matches(e, q, route) {
  const kind = route.parts[0];
  return (kind === "model" ? str(e.model) === route.parts[1] : !q.model || str(e.model) === q.model)
    && (kind === "mac" ? str(e.chip) === route.parts[1] && String(e.memory_gb) === route.parts[2]
      : (!q.chip || str(e.chip) === q.chip) && (!q.ram || String(e.memory_gb) === q.ram))
    && (!q.tuff || str(e.tuff) === q.tuff);
}

// ---- rows -----------------------------------------------------------------

function metric(cls, label, value, unit) {
  const cell = node("div", `m n ${cls}`);
  cell.append(node("span", "k", label));
  if (value === null) cell.append(node("span", "na", "—"));
  else { cell.append(document.createTextNode(value)); if (unit) cell.append(node("small", "", unit)); }
  return cell;
}

function tagLine(parts) {
  return node("span", "tags", parts.filter(Boolean).join(" · "));
}

function rowShell(id, held) {
  const item = node("article", `item${held ? " held" : ""}`);
  const head = node("div", "head");
  item.append(head);
  return { item, head };
}

function toggleButton(item, id, build, label) {
  const open = expanded.has(id);
  const button = node("button", "toggle", "", { type: "button", "aria-expanded": String(open), "aria-label": label || "Details" });
  let panel = null;
  const sync = () => {
    button.setAttribute("aria-expanded", String(expanded.has(id)));
    if (expanded.has(id)) { panel ??= build(); item.append(panel); } else panel?.remove();
  };
  button.addEventListener("click", () => { expanded.has(id) ? expanded.delete(id) : expanded.add(id); sync(); });
  if (open) sync();
  return button;
}

function whoCell(e, route, { grouped, badge }) {
  const who = node("div", "who");
  const name = node("div", "name");
  if (route.parts[0] === "model") name.append(node("span", "", modelLabel(e)));
  else name.append(link(modelLabel(e), `#/model/${enc(str(e.model))}`));
  if (badge) name.append(node("span", `badge${badge === "Verified" ? "" : " held"}`, badge));
  who.append(name);
  const setup = node("div", "setup");
  if (route.parts[0] === "mac" || !str(e.chip)) setup.append(document.createTextNode(macLabel(e)));
  else setup.append(link(macLabel(e), `#/mac/${enc(str(e.chip))}/${enc(String(e.memory_gb))}`));
  who.append(setup, tagLine([tuffLabel(e), ctxLabel(e.context), str(e.mode)]));
  if (grouped) {
    const n = e.people;
    who.append(tagLine([`${n} ${n === 1 ? "person" : "people"}`, e.entries.length > 1 ? `${e.entries.length} reports` : ""]));
  }
  return who;
}

function decodeCell(row, max, canRank) {
  const cell = node("div", "m main");
  cell.append(node("span", "k", "Decode"));
  const text = speed(row.decode);
  if (text === null) { cell.append(node("span", "na", "—")); return cell; }
  cell.append(node("strong", "", text), node("small", "", "tok/s"));
  if (row.low !== undefined && row.high !== undefined && row.low !== row.high && row.low !== null) {
    cell.append(node("small", "", `${speed(row.low)}–${speed(row.high)}`));
  }
  if (canRank && max > 0) {
    const track = node("span", "track", "", { "aria-hidden": "true" });
    const fill = node("span", "fill");
    fill.style.width = `${Math.max(2, (100 * row.decode) / max).toFixed(1)}%`;
    track.append(fill);
    cell.append(track);
  }
  return cell;
}

function metricsRow(head, row, max, canRank) {
  head.append(decodeCell(row, max, canRank),
    metric("pre", "Prefill", speed(row.prefill), "tok/s"),
    metric("ttf", "First token", secs(row.ttft), "s"),
    metric("fol", "Follow-up", secs(row.followup_ttft), "s"));
}

function detailList(e) {
  const dl = node("dl");
  const add = (k, v) => { if (v !== "" && v !== null && v !== undefined) { dl.append(node("dt", "", k), node("dd", "", String(v))); } };
  add("Mac", [str(e.mac), finite(e.gpu_cores) ? `${e.gpu_cores} GPU cores` : ""].filter(Boolean).join(" · "));
  add("macOS", str(e.macos));
  add("Build", str(e.build));
  add("Suite", str(e.suite));
  add("Trials", finite(e.trials) ? e.trials : "");
  add("Decode spread", Array.isArray(e.decode_spread) && e.decode_spread.every(finite) && e.decode_spread.length ? e.decode_spread.map((v) => v.toFixed(1)).join("–") + " tok/s" : "");
  add("Load", finite(e.load_seconds) ? `${e.load_seconds.toFixed(1)} s` : "");
  add("Peak memory", finite(e.memory_peak_gb) ? `${e.memory_peak_gb.toFixed(2)} GB` : "");
  add("Reused on follow-up", finite(e.followup_reused) ? `${e.followup_reused} tokens` : "");
  add("Posted", dateLabel(e.posted));
  return dl;
}

function sourceLinks(e) {
  const box = node("div", "tags");
  const url = discussionUrl(e);
  if (url) box.append(link("Source", url, true));
  if (finite(e.post)) { if (url) box.append(document.createTextNode(" · ")); box.append(link(`Post #${e.post}`, `#/post/${e.post}`)); }
  const au = authorUrl(e.author);
  if (str(e.author)) { box.append(document.createTextNode(" · by ")); box.append(au ? link(str(e.author), au, true) : document.createTextNode(str(e.author))); }
  return box;
}

function reportRow(e, route, max) {
  const canRank = ranked(e);
  const badge = status(e) || (e.trust === "verified" ? "Verified" : "");
  const id = `r${str(e.post)}|${str(e.model)}|${str(e.posted)}`;
  const { item, head } = rowShell(id, !canRank);
  head.append(whoCell(e, route, { badge }));
  metricsRow(head, e, max, canRank);
  head.append(toggleButton(item, id, () => {
    const panel = node("div", "drill");
    panel.append(sourceLinks(e), detailList(e));
    return panel;
  }, `Details for ${modelLabel(e)} on ${macLabel(e)}`));
  return item;
}

function groupRow(g, route, max) {
  const id = `g${g.key}`;
  const { item, head } = rowShell(id, false);
  head.append(whoCell(g, route, { grouped: true, badge: g.verified ? "Verified" : "" }));
  metricsRow(head, g, max, true);
  head.append(toggleButton(item, id, () => {
    const panel = node("div", "drill");
    const runs = node("div", "runs");
    for (const e of sortRows(g.entries, { sort: "posted", dir: "desc" })) {
      const run = node("div", "run");
      const who = node("div", "a");
      who.append(sourceLinks(e));
      const badge = e.trust === "verified" ? "Verified" : "";
      const runMetric = (cls, label, value, unit, spokenUnit) => {
        const spoken = value === null ? "not reported" : `${value} ${spokenUnit}`;
        return node("span", cls, `${value ?? "—"}${unit ? ` ${unit}` : ""}`, { "aria-label": `${label}: ${spoken}` });
      };
      run.append(who,
        runMetric("rd", "Decode", speed(e.decode), "tok/s", "tokens per second"),
        runMetric("rp", "Prefill", speed(e.prefill), "tok/s", "tokens per second"),
        runMetric("rf", "First token", secs(e.ttft), "s", "seconds"),
        runMetric("rft", "Follow-up", secs(e.followup_ttft), "s", "seconds"),
        node("span", "d", badge || dateLabel(e.posted)));
      runs.append(run);
    }
    panel.append(runs);
    if (g.entries.length === 1) panel.append(detailList(g.entries[0]));
    else panel.append(node("p", "tags", "Open Every report for the full detail of each run."));
    return panel;
  }, `Details for ${modelLabel(g)} on ${macLabel(g)}`));
  return item;
}

// ---- controls -------------------------------------------------------------

function uniq(values) { return [...new Set(values)]; }

function select(label, value, options, onChange) {
  const el = node("select", value ? "on" : "", "", { "aria-label": label });
  el.append(node("option", "", label, { value: "" }));
  for (const [v, text] of options) {
    const o = node("option", "", text, { value: v });
    if (v === value) o.selected = true;
    el.append(o);
  }
  el.addEventListener("change", () => onChange(el.value));
  return el;
}

let panelOpen = false;

function controls(route) {
  const { q } = route;
  const kind = route.parts[0];
  const frag = document.createDocumentFragment();
  const filterKeys = ["model", "chip", "ram", "tuff"].filter((k) => !((k === "model" && kind === "model") || ((k === "chip" || k === "ram") && kind === "mac")));
  const active = filterKeys.filter((k) => q[k]).length + (q.held ? 1 : 0);
  const bar = node("div", "bar");
  const filterBtn = node("button", "pill filters-toggle", "", { type: "button", "aria-expanded": String(panelOpen), "aria-controls": "panel" });
  filterBtn.append(document.createTextNode("Filters"));
  if (active) filterBtn.append(node("b", "", ` ${active}`));
  filterBtn.addEventListener("click", () => { panelOpen = !panelOpen; render(); });
  const seg = node("div", "seg", "", { role: "group", "aria-label": "View" });
  for (const [value, text] of [["", "Grouped"], ["runs", "Reports"]]) {
    const b = node("button", "", text, { type: "button", "aria-pressed": String((q.view || "") === value) });
    b.addEventListener("click", () => update(route, { view: value }));
    seg.append(b);
  }
  const viewMobile = node("select", "view-mobile", "", { "aria-label": "View" });
  for (const [value, text] of [["", "Grouped"], ["runs", "Reports"]]) {
    const option = node("option", "", text, { value });
    if ((q.view || "") === value) option.selected = true;
    viewMobile.append(option);
  }
  viewMobile.addEventListener("change", () => update(route, { view: viewMobile.value }));
  const metric = METRICS[q.sort];
  const descending = q.dir ? q.dir === "desc" : metric.desc;
  const sortBox = node("div", "sortbox");
  const sortSelect = node("select", "", "", { "aria-label": "Sort by" });
  for (const [k, m] of Object.entries(METRICS)) {
    const o = node("option", "", m.label, { value: k });
    if (k === q.sort) o.selected = true;
    sortSelect.append(o);
  }
  sortSelect.addEventListener("change", () => update(route, { sort: sortSelect.value, dir: "" }));
  const dirBtn = node("button", "pill", descending ? "↓" : "↑", { type: "button", "aria-label": descending ? "Descending; switch to ascending" : "Ascending; switch to descending" });
  dirBtn.addEventListener("click", () => update(route, { dir: descending ? "asc" : "desc" }));
  sortBox.append(sortSelect, dirBtn);
  const makeHeldToggle = (className, text) => {
    const button = node("button", `pill ${className}`, text, {
      type: "button", "aria-pressed": String(!!q.held),
      "aria-label": "Show held, failed and unreviewed reports",
      title: "Show held, failed and unreviewed reports (never ranked)",
    });
    button.addEventListener("click", () => update(route, { held: q.held ? "" : "1" }));
    return button;
  };
  const clearButton = (className) => {
    const button = node("button", `pill ${className}`, "Clear", { type: "button", "aria-label": "Clear all filters" });
    button.addEventListener("click", () => update(route, { model: "", chip: "", ram: "", tuff: "", held: "" }));
    return button;
  };
  const held = makeHeldToggle("held-toolbar", "Held");
  bar.append(filterBtn, seg, viewMobile, sortBox, held);
  if (active) {
    bar.append(clearButton("clear-desktop"));
  }
  frag.append(bar);

  const panel = node("div", "panel", "", { id: "panel", hidden: !panelOpen });
  const models = uniq(entries.map((e) => str(e.model)).filter(Boolean));
  const chips = uniq(entries.map((e) => str(e.chip)).filter(Boolean)).sort();
  const rams = uniq(entries.map((e) => e.memory_gb).filter((v) => finite(v) && v > 0)).sort((a, b) => a - b);
  const tuffs = uniq(entries.map((e) => str(e.tuff)).filter(Boolean)).sort(compareVersions).reverse();
  if (filterKeys.includes("model")) panel.append(select("Model", q.model, models.map((m) => [m, str(data.models?.[m]) || m]).sort((a, b) => a[1].localeCompare(b[1])), (v) => update(route, { model: v })));
  if (filterKeys.includes("chip")) panel.append(select("Chip", q.chip, chips.map((c) => [c, chipShort(c)]), (v) => update(route, { chip: v })));
  if (filterKeys.includes("ram")) panel.append(select("Memory", q.ram, rams.map((r) => [String(r), `${r} GB`]), (v) => update(route, { ram: v })));
  panel.append(select("TUFF version", q.tuff, tuffs.map((t) => [t, `TUFF ${t}`]), (v) => update(route, { tuff: v })));
  const mobileRow = node("div", "row");
  mobileRow.append(makeHeldToggle("held-mobile", "Include held results"));
  if (active) mobileRow.append(clearButton("clear-mobile"));
  panel.append(mobileRow);
  frag.append(panel);
  return frag;
}

function columnHeads(route) {
  const { q } = route;
  const descending = q.dir ? q.dir === "desc" : METRICS[q.sort].desc;
  const cols = node("div", "cols");
  for (const [key, label, cls] of [["model", "Model", ""], ["decode", "Decode", ""], ["prefill", "Prefill", "n"], ["ttft", "First", "n"], ["followup_ttft", "Next", "n"]]) {
    const cell = node("div", cls);
    if (q.sort === key) cell.setAttribute("aria-sort", descending ? "descending" : "ascending");
    const b = node("button", "", label, { type: "button" });
    b.addEventListener("click", () => update(route, q.sort === key ? { dir: descending ? "asc" : "desc" } : { sort: key, dir: "" }));
    cell.append(b);
    cols.append(cell);
  }
  cols.append(node("div"));
  return cols;
}

// ---- views ----------------------------------------------------------------

function empty(text, resetRoute) {
  const box = node("div", "state", text);
  if (resetRoute) {
    const b = node("button", "pill", "Clear filters", { type: "button" });
    b.addEventListener("click", () => update(resetRoute, { model: "", chip: "", ram: "", tuff: "", held: "" }));
    box.append(document.createElement("br"), b);
  }
  return box;
}

function setHeader(title, crumb, subtitle) {
  document.getElementById("title").textContent = title;
  const c = document.getElementById("crumb");
  c.hidden = !crumb;
  c.replaceChildren();
  if (crumb) c.append(link("Benchmarks", "#/"), document.createTextNode(` / ${crumb}`));
  const sub = document.getElementById("subtitle");
  sub.replaceChildren();
  if (subtitle) for (const part of [].concat(subtitle)) sub.append(part instanceof Node ? part : document.createTextNode(part));
  document.title = crumb ? `${title} · TUFF Benchmarks` : "TUFF Benchmarks";
}

function renderList(route, { versions } = {}) {
  const { q } = route;
  const pool = entries.filter((e) => matches(e, q, route));
  const good = pool.filter(ranked);
  const held = q.held ? pool.filter((e) => !ranked(e)) : [];
  const frag = document.createDocumentFragment();
  frag.append(controls(route));
  const grouped = q.view !== "runs";
  const rows = grouped ? groupEntries(good) : good;
  const sorted = sortRows(rows, q);
  const max = Math.max(0, ...sorted.map((r) => finite(r.decode) && r.decode > 0 ? r.decode : 0));
  if (sorted.length) {
    frag.append(columnHeads(route));
    const list = node("div", "list");
    for (const r of sorted) list.append(grouped ? groupRow(r, route, max) : reportRow(r, route, max));
    frag.append(list);
  } else frag.append(empty(entries.length ? "No matching reports." : "No reports yet.", entries.length ? route : null));
  if (held.length) {
    const sect = node("div", "sect", "Held");
    sect.append(node("small", "", `${held.length} · not ranked`));
    frag.append(sect);
    const list = node("div", "list");
    for (const r of sortRows(held, { sort: "posted", dir: "desc" })) list.append(reportRow(r, route, 0));
    frag.append(list);
  }
  if (versions) frag.append(versions(good));
  return frag;
}

// A change is only called between versions of the same model/Mac/context/mode,
// when both have 2+ people and their decode ranges do not overlap.
function versionSeries(good) {
  const bySetup = new Map();
  for (const g of groupEntries(good)) {
    const key = [g.model, g.chip, g.memory_gb, g.context, g.mode].map(str).join("|");
    if (!bySetup.has(key)) bySetup.set(key, []);
    bySetup.get(key).push(g);
  }
  const wrap = document.createDocumentFragment();
  const series = [...bySetup.values()].filter((l) => l.length > 1);
  if (!series.length) return wrap;
  const sect = node("div", "sect", "Across TUFF versions");
  sect.append(node("small", "", "same Mac, context and mode"));
  wrap.append(sect);
  for (const list of series) {
    list.sort((a, b) => compareVersions(a.tuff, b.tuff));
    const box = node("div", "series item");
    box.style.padding = "4px 16px 8px";
    box.append(node("h3", "", [macLabel(list[0]), ctxLabel(list[0].context), str(list[0].mode)].filter(Boolean).join(" · ")));
    list.forEach((g, i) => {
      const prev = list[i - 1];
      let change = "";
      let cls = "";
      if (prev && finite(g.decode) && finite(prev.decode)) {
        const pct = ((g.decode - prev.decode) / prev.decode) * 100;
        const apart = g.low > prev.high || g.high < prev.low;
        if (apart && g.people > 1 && prev.people > 1) { change = `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`; cls = pct > 0 ? "up" : "down"; }
        else change = "within noise";
      }
      const row = node("div", "row2");
      row.append(node("span", "", g.tuff), node("span", "", finite(g.decode) ? `${speed(g.decode)} tok/s · ${g.people}p` : "—"), node("span", cls, change));
      box.append(row);
    });
    wrap.append(box);
  }
  return wrap;
}

function render() {
  const route = parseHash();
  const [kind, a, b] = route.parts;
  view.replaceChildren();
  document.getElementById("updated").textContent = "";
  if (loadError) {
    const box = node("div", "state", "Results could not be loaded.");
    const retry = node("button", "pill", "Retry", { type: "button" });
    retry.addEventListener("click", load);
    box.append(document.createElement("br"), retry);
    view.append(box);
    setHeader("Benchmarks");
    return;
  }
  if (!data) return;
  const gen = new Date(str(data.generated));
  if (Number.isFinite(gen.getTime())) document.getElementById("updated").textContent = `· Updated ${gen.toLocaleDateString()}`;

  if (kind === "model" && a) {
    const rows = entries.filter((e) => str(e.model) === a);
    const name = rows[0] ? modelLabel(rows[0]) : str(data.models?.[a]) || a;
    const good = rows.filter(ranked);
    const setups = uniq(good.map((e) => `${e.chip}|${e.memory_gb}`)).length;
    setHeader(name, name, rows.length ? `${good.length} reviewed ${good.length === 1 ? "report" : "reports"} · ${setups} ${setups === 1 ? "Mac setup" : "Mac setups"}` : "");
    view.append(rows.length ? renderList(route, { versions: versionSeries }) : empty("No reports for this model."));
    return;
  }
  if (kind === "mac" && a && b) {
    const rows = entries.filter((e) => str(e.chip) === a && String(e.memory_gb) === b);
    const label = `${chipShort(a)} · ${b} GB`;
    const subtitle = [];
    const others = uniq(entries.filter((e) => String(e.memory_gb) === b && str(e.chip) !== a).map((e) => str(e.chip)).filter(Boolean));
    if (others.length) { subtitle.push("Also "); others.forEach((o, i) => { if (i) subtitle.push(", "); subtitle.push(link(`${chipShort(o)} ${b} GB`, `#/mac/${enc(o)}/${enc(b)}`)); }); }
    setHeader(label, label, subtitle);
    view.append(rows.length ? renderList(route) : empty("No reports for this Mac."));
    return;
  }
  if (kind === "post" && a) {
    const rows = entries.filter((e) => String(e.post) === a);
    setHeader(`Post #${a}`, `#${a}`, rows[0] ? [macLabel(rows[0]), " · ", tuffLabel(rows[0]), " · ", str(rows[0].mode)].filter(Boolean).concat(rows[0].author ? [" · by ", str(rows[0].author)] : []) : "");
    if (!rows.length) { view.append(empty("No reports in this post.")); return; }
    const url = discussionUrl(rows[0]);
    const good = rows.filter(ranked);
    const max = Math.max(0, ...good.map((r) => finite(r.decode) && r.decode > 0 ? r.decode : 0));
    const list = node("div", "list");
    for (const r of sortRows(rows, { sort: "model", dir: "asc" })) list.append(reportRow(r, route, max));
    view.append(list);
    if (url) { const p = node("p", "tags"); p.append(link("Open the discussion", url, true)); view.append(p); }
    return;
  }
  setHeader("Benchmarks");
  view.append(renderList({ parts: [], q: route.q }));
}

window.addEventListener("hashchange", render);
load();
setInterval(load, REFRESH_MS);
