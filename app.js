// My Kitchen – pantry, grocery list and recipe ideas from what you already have.
// Everything is saved in this browser (localStorage). Recipe ideas come from Claude,
// either through your own Anthropic API key or by copying the request into Claude.
{
const MODEL = "claude-sonnet-5-5";
const STORE_KEY = "my-kitchen-v1", KEY_KEY = "my-kitchen-apikey";

const $ = s => document.querySelector(s), V = $("#view");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const norm = s => String(s || "").trim().toLowerCase();
const CATS = ["Fridge", "Freezer", "Cupboard", "Staples"];
const DEF = {pantry: [], groceries: [], favs: [], history: [], suggestions: [],
  profile: {likes: "", dislikes: "", diet: "", equipment: "", time: 30, servings: 1, lang: "English"}};
const merge = d => {
  const p = clone(DEF);
  if (!d || typeof d !== "object") return p;
  for (const k of Object.keys(p)) if (d[k] != null) p[k] = k === "profile" ? {...p.profile, ...d.profile} : (Array.isArray(d[k]) ? d[k] : p[k]);
  return p;
};

// ---------- Storage (this browser only, safe if unavailable) ----------
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); return true; } catch (e) { return false; } },
};
let S = merge(JSON.parse(ls.get(STORE_KEY) || "null"));
let apiKey = ls.get(KEY_KEY) || "";
let tab = "cook", openId = null, cookId = null, rating = 0, busy = false, scan = null, toastT = null, crave = "", strict = false, pasteOpen = false;
try { const h = location.hash.slice(1); if (["cook", "pantry", "groceries", "me"].includes(h)) tab = h; } catch (e) {}

function save() { if (!ls.set(STORE_KEY, JSON.stringify(S))) $("#sync").textContent = "Couldn't save in this browser"; }
function toast(msg, acts = []) {
  const t = $("#toast"); t.textContent = "";
  const s = document.createElement("span"); s.textContent = msg; t.append(s);
  acts.forEach(([l, f]) => { const b = document.createElement("button"); b.textContent = l; b.onclick = () => { f(); t.classList.remove("show"); }; t.append(b); });
  t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 6500);
}
const undoable = (msg, extra = []) => { const snap = clone(S); return () => toast(msg, [...extra, ["Undo", () => { S = snap; save(); render(); }]]); };

// ---------- Items ----------
const fmtQ = i => i.qty == null ? "" : (+(+i.qty).toFixed(2)) + (i.unit ? " " + i.unit : "");
const stepOf = i => ["g", "ml"].includes(i.unit) ? (i.qty >= 200 ? 100 : 50) : ["kg", "l"].includes(i.unit) ? .25 : i.unit === "cl" ? 10 : 1;
function parse(t) { // "500 g pasta" -> {qty:500, unit:"g", name:"pasta"}
  const m = t.trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l|x)?\.?\s+(.+)$/i);
  if (m) return {qty: parseFloat(m[1].replace(",", ".")), unit: (m[2] || "").toLowerCase().replace("x", ""), name: m[3].trim()};
  return {qty: null, unit: "", name: t.trim()};
}
function guessCat(n) {
  n = norm(n);
  if (/frozen|surgel|ice cream|glace|peas|petits pois/.test(n)) return "Freezer";
  if (/milk|lait|chees|fromage|yog|yaourt|butter|beurre|egg|oeuf|œuf|cream|crème|creme|chicken|poulet|beef|boeuf|bœuf|pork|porc|ham|jambon|fish|poisson|salmon|saumon|tofu|salad|lettuce|salade|spinach|epinard|épinard|courgette|zucchini|carrot|carotte|tomato|tomate|pepper|poivron|mushroom|champignon|herb|coriand|basil|lemon|citron|lardon|minced|haché|sausage|saucisse/.test(n)) return "Fridge";
  return "Cupboard";
}
const findP = name => { const n = norm(name); if (!n) return null; return S.pantry.find(p => norm(p.name) === n) || S.pantry.find(p => norm(p.name).includes(n) || n.includes(norm(p.name))) || null; };
function addPantry(it) {
  const n = norm(it.name); if (!n) return;
  S.groceries = S.groceries.filter(g => norm(g.name) !== n);
  const ex = S.pantry.find(p => norm(p.name) === n && (p.unit || "") === (it.unit || ""));
  if (ex) { if (ex.qty != null && it.qty != null) ex.qty = +(ex.qty + it.qty).toFixed(2); else if (ex.qty == null && it.qty != null) ex.qty = it.qty; return; }
  S.pantry.push({id: uid(), name: it.name.trim().slice(0, 60), qty: it.qty ?? null, unit: it.unit || "", cat: CATS.includes(it.cat) ? it.cat : guessCat(it.name), first: false});
}
function addGrocery(it) {
  const n = norm(it.name); if (!n) return false;
  const ex = S.groceries.find(g => norm(g.name) === n);
  if (ex) { if (ex.qty != null && it.qty != null && (ex.unit || "") === (it.unit || "")) ex.qty += it.qty; return false; }
  S.groceries.push({id: uid(), name: it.name.trim().slice(0, 60), qty: it.qty ?? null, unit: it.unit || ""});
  return true;
}
const missingNow = r => [...new Set([...(r.missing || []), ...r.ingredients.filter(i => i.pantry && !findP(i.pantry)).map(i => i.name)])];
const findR = id => S.suggestions.find(r => r.id === id) || S.favs.find(r => r.id === id);
const empty = (t, s) => `<div class="empty"><b>${t}</b><span class="hint">${s}</span></div>`;

// ---------- Views ----------
function render() {
  $("#stats").textContent = `${S.pantry.length} item${S.pantry.length == 1 ? "" : "s"} in your pantry · ${S.groceries.length} to buy`;
  $("#cp").textContent = S.pantry.length; $("#cg").textContent = S.groceries.length;
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === tab));
  V.innerHTML = tab === "pantry" ? vPantry() : tab === "groceries" ? vGroc() : tab === "me" ? vMe() : vCook();
}
const addForm = (k, ph, cat) => `<form class="add" data-k="${k}"><input name="t" placeholder="${ph}" autocomplete="off" aria-label="Add items">${cat ? `<select name="c" aria-label="Where"><option value="">Auto place</option>${CATS.map(c => `<option>${c}</option>`).join("")}</select>` : ""}<button>Add</button></form>`;

function vPantry() {
  const rowP = p => `<li class="row${p.first ? " first" : ""}" data-id="${p.id}"><div class="nm"><b>${esc(p.name)}</b><div class="meta">
    ${p.cat !== "Staples" ? `<button class="lk${p.first ? " on" : ""}" data-a="first">${p.first ? "Use first" : "Mark use first"}</button>` : ""}
    <button class="lk" data-a="tolist">Add to list</button>
    <select data-a="cat" aria-label="Move ${esc(p.name)}">${CATS.map(c => `<option${c === p.cat ? " selected" : ""}>${c}</option>`).join("")}</select></div></div>
    ${p.cat !== "Staples" ? `<div class="step"><button data-a="dec" aria-label="Less">−</button><span>${p.qty == null ? "some" : esc(fmtQ(p))}</span><button data-a="inc" aria-label="More">+</button></div>` : ""}
    <button class="x" data-a="del" aria-label="Remove ${esc(p.name)}">×</button></li>`;
  const groups = CATS.map(c => {
    const it = S.pantry.filter(p => p.cat === c).sort((a, b) => (b.first - a.first) || a.name.localeCompare(b.name));
    return it.length ? `<h3>${c}${c === "Staples" ? " <small>· salt, oil, spices… never deducted</small>" : ""}</h3><ul class="list">${it.map(rowP).join("")}</ul>` : "";
  }).join("");
  return addForm("p", "e.g. 6 eggs, 500 g pasta, 1 courgette", 1) + scanBlock() + (groups || empty("Your pantry is empty", "Add what’s in your fridge and cupboards above. Items you tick on your grocery list land here too."));
}
function scanBlock() {
  if (!apiKey) return "";
  if (!scan) return `<label class="scan"><input type="file" accept="image/*" id="scanf" hidden>Scan a fridge photo or a receipt</label>`;
  if (scan.loading) return `<div class="box"><span class="dots">Reading your photo</span></div>`;
  if (!scan.items.length) return `<div class="box">No food found in that photo. <button class="lk" data-a="scancancel">Close</button></div>`;
  return `<div class="box"><b>Found in your photo</b><p class="hint">Untick anything that’s wrong.</p>${scan.items.map((i, k) => `<label class="chk"><input type="checkbox" data-si="${k}"${i.on ? " checked" : ""}>${esc(i.name)}${i.qty != null ? ` <span class="hint">${esc(fmtQ(i))}</span>` : ""}</label>`).join("")}
  <div class="acts"><button class="go" data-a="scanadd">Add to pantry</button><button class="sec" data-a="scancancel">Cancel</button></div></div>`;
}
function vGroc() {
  const rows = S.groceries.map(g => `<li class="row" data-id="${g.id}"><button class="tick" data-a="buy" aria-label="Bought ${esc(g.name)}"></button><div class="nm"><b>${esc(g.name)}</b>${g.qty != null ? `<div class="meta">${esc(fmtQ(g))}</div>` : ""}</div><button class="x" data-a="gdel" aria-label="Remove ${esc(g.name)}">×</button></li>`).join("");
  return addForm("g", "e.g. milk, 2 onions, 1 kg rice") + (rows ? `<p class="hint">Tick an item once it’s in your basket and it moves straight into your pantry.</p><ul class="list">${rows}</ul>` : empty("Nothing to buy", "Add items here, or send missing ingredients from a recipe. Running out of something in the pantry offers to add it too."));
}
function card(r, fav) {
  const miss = missingNow(r), open = openId === r.id, saved = fav || S.favs.some(f => f.title === r.title);
  return `<article class="rec" data-r="${r.id}"><button class="rh" data-a="open" aria-expanded="${open}"><span class="rt">${esc(r.title)}</span>
  <span class="rm">${esc(r.time_min)} min · ${miss.length ? miss.length + " to buy" : "everything’s in your pantry"}</span>${r.why ? `<span class="why">${esc(r.why)}</span>` : ""}</button>
  ${open ? `<div class="rd"><h4>Ingredients</h4><ul class="ing">${r.ingredients.map(i => {
    const no = i.pantry ? !findP(i.pantry) : miss.some(m => norm(m) === norm(i.name));
    return `<li class="${no ? "no" : ""}"><span>${esc(i.amount)}</span> ${esc(i.name)}${no ? " <em>to buy</em>" : ""}</li>`; }).join("")}</ul>
  <h4>Method</h4><ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
  <div class="acts"><button class="go" data-a="cooked">I cooked this</button>${miss.length ? `<button class="sec" data-a="addmiss">Add ${miss.length} to grocery list</button>` : ""}
  ${fav ? '<button class="sec" data-a="unfav">Remove from favourites</button>' : saved ? '<button class="sec" disabled>Saved</button>' : '<button class="sec" data-a="fav">Save to favourites</button>'}</div>
  ${cookId === r.id ? cookPanel(r) : ""}</div>` : ""}</article>`;
}
function cookPanel(r) {
  const rows = r.ingredients.map((i, k) => {
    const p = i.pantry ? findP(i.pantry) : null; if (!p || p.cat === "Staples") return "";
    const use = p.qty == null ? null : (i.use_all || i.use_qty == null ? p.qty : Math.min(p.qty, i.use_qty));
    return `<div class="cr" data-k="${k}"><input type="checkbox" checked aria-label="Used ${esc(p.name)}"><b>${esc(p.name)}</b>${p.qty != null ? `<span>use</span><input class="uq" type="number" min="0" step="any" value="${+(+use).toFixed(2)}" aria-label="Amount used"><span class="hint">${esc(p.unit || "")} of ${esc(fmtQ(p))}</span>` : '<span class="hint">will be removed</span>'}</div>`;
  }).join("");
  return `<div class="cookp"><b>Update your pantry</b><p class="hint">Adjust amounts or untick anything you didn’t use.</p>${rows || '<p class="hint">No tracked items to deduct.</p>'}
  <div class="rate"><span>How was it?</span>${[[1, "Loved it"], [0, "It was fine"], [-1, "Not again"]].map(([v, l]) => `<button class="chip${rating === v ? " on" : ""}" data-a="rate" data-v="${v}">${l}</button>`).join("")}</div>
  <button class="go" data-a="confirm">Update pantry</button></div>`;
}
function vCook() {
  const P = S.profile;
  const ask = apiKey
    ? `<button class="go" data-a="suggest"${busy ? " disabled" : ""}>${busy ? '<span class="dots">Thinking up dishes</span>' : "Suggest dishes"}</button>`
    : `<button class="go" data-a="copyprompt">Copy request for Claude</button>
       <p class="hint">Paste it into Claude, then paste Claude’s answer below. Or add an API key in the Me tab to get ideas in one tap.</p>
       <div class="paste"><textarea id="answer" placeholder="Paste Claude’s answer here" aria-label="Claude's answer"></textarea><button class="sec" data-a="useanswer">Use this answer</button></div>`;
  return `<div class="ctl"><div class="chips" role="group" aria-label="Time available">${[15, 30, 45, 90].map(t => `<button class="chip${P.time == t ? " on" : ""}" data-a="time" data-v="${t}">${t == 90 ? "1 h +" : t + " min"}</button>`).join("")}</div>
  <input id="crave" placeholder="Craving anything? e.g. spicy, comfort food, light" value="${esc(crave)}" aria-label="Craving">
  <div class="opts"><label><input type="checkbox" id="strict"${strict ? " checked" : ""}>Only what I have</label><label>Servings <input type="number" id="serv" min="1" max="12" value="${esc(P.servings)}"></label></div>
  ${ask}</div>
  ${S.suggestions.length ? `<h2>Ideas for right now</h2><div class="recs">${S.suggestions.map(r => card(r, false)).join("")}</div>` : busy ? "" : empty("What’s for dinner?", S.pantry.length ? "Pick how much time you have and ask for ideas." : "Add a few things to your pantry first, then come back here.")}
  ${S.favs.length ? `<h2>Favourites</h2><div class="recs">${S.favs.map(r => card(r, true)).join("")}</div>` : ""}`;
}
function vMe() {
  const P = S.profile, fld = (k, l, ph) => `<label class="fld">${l}<textarea data-p="${k}" rows="2" placeholder="${ph}">${esc(P[k])}</textarea></label>`;
  return `<p class="hint">This is sent with every request, so the more specific you are, the better the ideas.</p>
  ${fld("likes", "What I love eating", "e.g. Vietnamese food, pasta, chicken thighs, spicy things")}${fld("dislikes", "Never suggest", "e.g. mushrooms, olives, offal")}
  ${fld("diet", "Diet or goals", "e.g. high protein, cheap, no pork")}${fld("equipment", "My equipment", "e.g. 2 hobs, oven, air fryer, rice cooker")}
  <div class="two"><label>Recipe language<select data-p="lang">${["English", "Français"].map(l => `<option${P.lang === l ? " selected" : ""}>${l}</option>`).join("")}</select></label>
  <label>Default servings<input type="number" data-p="servings" min="1" max="12" value="${esc(P.servings)}"></label></div>
  <h2>Claude API key</h2>
  <div class="box"><p>Optional. With a key, ideas and photo scans work in one tap. Get one at <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a>; usage is billed to your account.</p>
  <p class="hint">The key is stored only in this browser and sent only to Anthropic. It is never included in exports.</p>
  ${apiKey ? `<div class="key"><span>Key saved (…${esc(apiKey.slice(-4))})</span><button class="sec" data-a="delkey">Remove key</button></div>`
    : `<form class="key" id="keyform"><input type="password" name="k" placeholder="sk-ant-…" autocomplete="off" aria-label="API key"><button class="go">Save key</button></form>`}</div>
  <h2>Move to another device</h2>
  <p class="hint">Data lives in this browser. Export a backup file and import it on your other device.</p>
  <div class="acts"><button class="sec" data-a="export">Export backup</button><label class="sec scan" style="margin:0">Import backup<input type="file" accept=".json,application/json" id="importf" hidden></label></div>
  <h2>Cooked lately</h2>${S.history.length ? `<ul class="list">${S.history.map(h => `<li class="row" data-id="${h.id}"><div class="nm"><b>${esc(h.title)}</b><div class="meta">${esc(h.date)}${h.rating > 0 ? " · loved it" : h.rating < 0 ? " · not again" : ""}</div></div><button class="x" data-a="hdel" aria-label="Remove">×</button></li>`).join("")}</ul>` : '<p class="hint">Dishes you mark as cooked show up here, and your ratings shape future ideas.</p>'}`;
}

// ---------- Claude ----------
const str = (v, n = 200) => typeof v === "string" ? v.slice(0, n) : typeof v === "number" ? String(v) : "";
function clean(r) {
  if (!r || typeof r !== "object" || !str(r.title)) return null;
  return {id: uid(), title: str(r.title, 90), time_min: Math.round(+r.time_min) || "?", why: str(r.why, 200),
    ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).slice(0, 25).map(i => ({name: str(i && i.name, 60), amount: str(i && i.amount, 30), pantry: i && typeof i.pantry === "string" && i.pantry ? i.pantry.slice(0, 60) : null, use_qty: i && typeof i.use_qty === "number" && i.use_qty >= 0 ? i.use_qty : null, use_all: !!(i && i.use_all)})).filter(i => i.name),
    missing: (Array.isArray(r.missing) ? r.missing : []).map(m => str(m, 60)).filter(Boolean).slice(0, 8),
    steps: (Array.isArray(r.steps) ? r.steps : []).map(s => str(s, 400)).filter(Boolean).slice(0, 14)};
}
function parseJSON(text) {
  const t = String(text || "").replace(/```(?:json)?/g, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw {code: "bad_json"};
  return JSON.parse(t.slice(a, b + 1));
}
const errMsg = e => ({rate_limited: "Too many requests, try again in a minute", bad_key: "Your API key was refused. Check it in the Me tab", bad_json: "Couldn’t read that answer. Paste Claude’s whole reply"}[e && e.code] || "Something went wrong, try again");

function shrink(file) { // phone photos are big: resize to max 1568px JPEG
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1568 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", .85).split(",")[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej({code: "image"}); };
    img.src = url;
  });
}
async function askClaude(prompt, file) {
  const content = [];
  if (file) content.push({type: "image", source: {type: "base64", media_type: "image/jpeg", data: await shrink(file)}});
  content.push({type: "text", text: prompt});
  const res = await fetch("https://api.anthropic.com/v1/messages", {method: "POST",
    headers: {"content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true"},
    body: JSON.stringify({model: MODEL, max_tokens: 4096, messages: [{role: "user", content}]})});
  if (!res.ok) throw {code: res.status === 429 ? "rate_limited" : res.status === 401 ? "bad_key" : "http"};
  const j = await res.json();
  return parseJSON((j.content || []).filter(c => c.type === "text").map(c => c.text).join(""));
}
function buildPrompt() {
  const P = S.profile;
  const tracked = S.pantry.filter(p => p.cat !== "Staples").map(p => `- ${p.name}${p.qty != null ? ": " + fmtQ(p) : ""}${p.first ? " (USE FIRST)" : ""}`).join("\n") || "(empty)";
  const staples = S.pantry.filter(p => p.cat === "Staples").map(p => p.name).join(", ") || "salt, pepper, cooking oil";
  const hist = f => S.history.filter(f).slice(0, 12).map(h => h.title).join("; ") || "-";
  return `You are a personal home-cooking assistant. Suggest exactly 3 different dishes this person can cook now.

PANTRY (tracked items, exact names):
${tracked}
STAPLES (always available, not tracked): ${staples}

ABOUT THE COOK
Loves: ${P.likes || "-"}
Never suggest: ${P.dislikes || "-"}
Diet / goals: ${P.diet || "-"}
Equipment: ${P.equipment || "standard home kitchen"}
Servings: ${P.servings}. Max total time: ${P.time >= 90 ? "no limit" : P.time + " minutes"}.
Craving right now: ${crave || "-"}
Loved before: ${hist(h => h.rating > 0)}
Disliked before (avoid): ${hist(h => h.rating < 0)}
Cooked recently (don't repeat): ${hist(() => true)}

RULES
- ${strict ? 'Use ONLY pantry items and staples. "missing" must be empty.' : "Build on pantry items; at most 2 missing ingredients per dish."}
- Prioritise items marked USE FIRST. Quantities must fit what's in the pantry.
- Write titles, amounts, why and steps in ${P.lang}. 4 to 8 short practical steps.

Return JSON only, shaped like:
{"recipes":[{"title":"","time_min":20,"why":"one short sentence on why it suits them now","ingredients":[{"name":"","amount":"200 g","pantry":"exact PANTRY name or null","use_qty":200,"use_all":false}],"missing":["ingredient to buy"],"steps":[""]}]}
"pantry" is the exact PANTRY item name the ingredient comes from (null for staples and missing items). "use_qty" is the amount used, in that pantry item's own unit (null if the item has no quantity). "use_all" is true if the dish uses all of it.`;
}
function useRecipes(r) {
  const list = (r && Array.isArray(r.recipes) ? r.recipes : []).slice(0, 4).map(clean).filter(Boolean);
  if (!list.length) throw {code: "bad_json"};
  S.suggestions = list; openId = list[0].id; cookId = null; save();
}
async function suggest() {
  if (!apiKey || busy) return;
  busy = true; render();
  try { useRecipes(await askClaude(buildPrompt())); } catch (e) { toast(errMsg(e)); }
  busy = false; render();
}
async function doScan(file) {
  scan = {loading: true}; render();
  try {
    const r = await askClaude(`Look at this photo of a fridge, cupboard, groceries or a shopping receipt. List the food items you can identify. Use short, generic names in ${S.profile.lang}. Ignore non-food, prices and totals. Return JSON only: {"items":[{"name":"","qty":number or null,"unit":"g"|"kg"|"ml"|"l"|"","cat":"Fridge"|"Freezer"|"Cupboard"}]}`, file);
    scan = {items: (r && Array.isArray(r.items) ? r.items : []).filter(i => i && str(i.name)).slice(0, 60).map(i => ({name: str(i.name, 60), qty: typeof i.qty === "number" && i.qty > 0 ? i.qty : null, unit: ["g", "kg", "ml", "l", "cl"].includes(i.unit) ? i.unit : "", cat: CATS.includes(i.cat) ? i.cat : guessCat(i.name), on: true}))};
  } catch (e) { scan = null; toast(errMsg(e)); }
  render();
}

// ---------- Actions ----------
function act(a, b, id, rid) {
  const P = S.profile, p = id && S.pantry.find(x => x.id === id), r = rid && findR(rid);
  switch (a) {
  case "first": p.first = !p.first; break;
  case "tolist": toast(addGrocery({name: p.name}) ? `${p.name} added to your grocery list` : `${p.name} is already on your list`); break;
  case "inc": p.qty = p.qty == null ? 1 : +(p.qty + stepOf(p)).toFixed(2); break;
  case "dec": {
    const show = undoable(`Out of ${p.name}`, [["Add to list", () => { addGrocery({name: p.name}); save(); render(); }]]);
    if (p.qty != null && p.qty - stepOf(p) > 0.001) { p.qty = +(p.qty - stepOf(p)).toFixed(2); break; }
    S.pantry = S.pantry.filter(x => x !== p); show(); break; }
  case "del": { const show = undoable(`Removed ${p.name}`); S.pantry = S.pantry.filter(x => x !== p); show(); break; }
  case "buy": { const g = S.groceries.find(x => x.id === id), show = undoable(`${g.name} moved to your pantry`); addPantry(g); S.groceries = S.groceries.filter(x => x.id !== id); show(); break; }
  case "gdel": S.groceries = S.groceries.filter(x => x.id !== id); break;
  case "hdel": S.history = S.history.filter(x => x.id !== id); break;
  case "time": P.time = +b.dataset.v; break;
  case "suggest": suggest(); return;
  case "copyprompt":
    navigator.clipboard.writeText(buildPrompt()).then(() => toast("Copied. Paste it into Claude, then paste the answer below"), () => toast("Couldn’t copy. Your browser blocked the clipboard"));
    return;
  case "useanswer":
    try { useRecipes(parseJSON($("#answer").value)); } catch (e) { toast(errMsg(e.code ? e : {code: "bad_json"})); return; }
    break;
  case "open": openId = openId === rid ? null : rid; cookId = null; break;
  case "cooked": cookId = cookId === rid ? null : rid; rating = 0; break;
  case "rate": rating = +b.dataset.v; b.parentNode.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === b)); return;
  case "confirm": {
    const show = undoable("Pantry updated"), outs = [];
    b.closest(".cookp").querySelectorAll(".cr").forEach(row => {
      if (!row.querySelector("input[type=checkbox]").checked) return;
      const q = findP(r.ingredients[+row.dataset.k].pantry); if (!q) return;
      const u = row.querySelector(".uq");
      const left = q.qty == null ? 0 : q.qty - (u && u.value !== "" && !isNaN(+u.value) ? +u.value : q.qty);
      if (left <= 0.001) { S.pantry = S.pantry.filter(x => x !== q); outs.push(q.name); } else q.qty = +left.toFixed(2);
    });
    S.history.unshift({id: uid(), title: r.title, date: new Date().toISOString().slice(0, 10), rating}); S.history = S.history.slice(0, 60);
    S.suggestions = S.suggestions.filter(x => x.id !== rid); cookId = null; openId = null;
    outs.length ? toast(`Pantry updated. You’re out of ${outs.join(", ")}`, [["Add to list", () => { outs.forEach(n => addGrocery({name: n})); save(); render(); }]]) : show();
    break; }
  case "addmiss": { let n = 0; missingNow(r).forEach(m => { if (addGrocery(parse(m))) n++; }); toast(n ? `Added ${n} to your grocery list` : "Already on your list"); break; }
  case "fav": S.favs.unshift({...clone(r), id: uid()}); toast("Saved to favourites"); break;
  case "unfav": S.favs = S.favs.filter(x => x.id !== rid); openId = null; break;
  case "scanadd": { const show = undoable("Added to your pantry"); scan.items.filter(i => i.on).forEach(addPantry); scan = null; show(); break; }
  case "scancancel": scan = null; break;
  case "delkey": apiKey = ""; ls.set(KEY_KEY, null); break;
  case "export": {
    const a2 = document.createElement("a");
    a2.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], {type: "application/json"}));
    a2.download = `my-kitchen-${new Date().toISOString().slice(0, 10)}.json`; a2.click();
    setTimeout(() => URL.revokeObjectURL(a2.href), 1000); return; }
  default: return;
  }
  save(); render();
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-t]");
  if (t) { tab = t.dataset.t; scan = scan && scan.loading ? scan : null; try { history.replaceState(null, "", "#" + tab); } catch (_) {} render(); scrollTo(0, 0); return; }
  const b = e.target.closest("button[data-a]"); if (!b) return;
  const row = b.closest("[data-id]"), rec = b.closest("[data-r]");
  act(b.dataset.a, b, row && row.dataset.id, rec && rec.dataset.r);
});
document.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id === "keyform") { const k = e.target.k.value.trim(); if (!k) return; apiKey = k; ls.set(KEY_KEY, k); toast("Key saved in this browser"); render(); return; }
  const f = e.target.closest("form.add"); if (!f) return;
  const parts = f.t.value.split(/[;\n]|,(?!\d)/).map(s => s.trim()).filter(Boolean); if (!parts.length) return;
  parts.forEach(s => { const it = parse(s); if (f.dataset.k === "p") { if (f.c.value) it.cat = f.c.value; addPantry(it); } else addGrocery(it); });
  save(); render();
  const i = V.querySelector(`form[data-k="${f.dataset.k}"] input`); if (i) i.focus();
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.id === "scanf" && el.files[0]) { doScan(el.files[0]); return; }
  if (el.id === "importf" && el.files[0]) {
    el.files[0].text().then(t => { const d = JSON.parse(t); if (!d || !Array.isArray(d.pantry)) throw 0; const show = undoable("Backup imported"); S = merge(d); save(); render(); show(); }).catch(() => toast("That file isn’t a My Kitchen backup"));
    return; }
  if (el.dataset.si != null && scan && scan.items) { scan.items[+el.dataset.si].on = el.checked; return; }
  if (el.id === "strict") { strict = el.checked; return; }
  if (el.dataset.a === "cat") { const p = S.pantry.find(x => x.id === el.closest("[data-id]").dataset.id); if (p) { p.cat = el.value; if (el.value === "Staples") p.first = false; save(); render(); } }
});
document.addEventListener("input", e => {
  const el = e.target;
  if (el.id === "crave") { crave = el.value; return; }
  if (el.id === "serv" || el.dataset.p === "servings") { S.profile.servings = Math.max(1, Math.min(12, parseInt(el.value) || 1)); save(); return; }
  if (el.dataset.p) { S.profile[el.dataset.p] = el.value.slice(0, 400); save(); }
});

render();
}
