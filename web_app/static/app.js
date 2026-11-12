// Multi-Domain Agentic RAG Assistant — tabs, search box, animated agent pipeline, cited answers and source cards.
const form = document.querySelector("#search-form");
const questionInput = document.querySelector("#question");
const searchButton = document.querySelector("#search-button");
const counter = document.querySelector("#counter");
const results = document.querySelector("#results");
const historyList = document.querySelector("#history");
const historyEmpty = historyList.innerHTML;
const template = document.querySelector("#result-template");
const toast = document.querySelector("#toast");

const DOMAIN_LABEL = {
  biomedical: "Biomedical",
  legal: "Legal",
  finance: "Finance",
  customer_support: "Customer support",
  general: "General",
  unknown: "Unknown domain",
};
const STEPS = ["router", "retrieval", "domain_check", "answer", "safety"];
const STEP_START_MS = [0, 1200, 2600, 3400, 6500]; // pacing of the "working" animation only
const CITATION = /\[(?:RAG|FDA)-\d+\]/g;
// Measured on the same 30 questions (see the Results tab and the test report)
const VERSION_SCORES = [["v2.1", 15], ["v2.4", 19], ["v2.5", 23], ["v2.6", 23], ["v2.7", 24], ["v2.8", 25], ["v2.9 (final)", 25]];
const DOMAIN_SCORES = [["biomedical", 4], ["legal", 6], ["finance", 3], ["customer_support", 6], ["general", 6]];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

// ---------- tabs ----------
function showView(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === name));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === name));
  if (name === "results") animateBars();
  if (name === "assistant") questionInput.focus();
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));

function buildBars() {
  const versions = document.querySelector("#bars");
  for (const [label, score] of VERSION_SCORES) {
    const row = el("div", `bar${label.includes("final") ? " final" : ""}`);
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.dataset.width = `${(100 * score) / 30}%`;
    fill.style.width = "0";
    track.append(fill);
    row.append(el("span", "bar-label", label), track, el("span", "bar-value", `${score}/30 · ${Math.round((100 * score) / 30)}%`));
    versions.append(row);
  }
  const domains = document.querySelector("#domainbars");
  for (const [domain, score] of DOMAIN_SCORES) {
    const row = el("div", "bar");
    row.dataset.domain = domain;
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.dataset.width = `${(100 * score) / 6}%`;
    fill.style.width = "0";
    track.append(fill);
    row.append(el("span", "bar-label", DOMAIN_LABEL[domain]), track, el("span", "bar-value", `${score}/6`));
    domains.append(row);
  }
}
function animateBars() {
  requestAnimationFrame(() => document.querySelectorAll(".bar-fill").forEach((fill) => { fill.style.width = fill.dataset.width; }));
}

// ---------- small, safe Markdown renderer (builds DOM nodes, never innerHTML) ----------
function renderInline(parent, text, article) {
  const pattern = /(\*\*[^*]+\*\*|\[(?:RAG|FDA)-\d+\]|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parent.append(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) parent.append(el("strong", "", token.slice(2, -2)));
    else if (token.startsWith("`")) parent.append(el("code", "", token.slice(1, -1)));
    else if (token.startsWith("[")) {
      const id = token.slice(1, -1);
      const button = el("button", "cite", id);
      button.type = "button";
      button.title = `Show source ${id}`;
      button.addEventListener("click", () => focusSource(article, id));
      parent.append(button);
    } else parent.append(el("em", "", token.slice(1, -1)));
    last = match.index + token.length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

function renderMarkdown(container, text, article) {
  container.replaceChildren();
  let list = null;
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      const p = el("p");
      renderInline(p, paragraph.join(" "), article);
      container.append(p);
      paragraph = [];
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      if (!list || list.tagName.toLowerCase() !== kind) {
        list = el(kind);
        container.append(list);
      }
      const item = el("li");
      renderInline(item, (bullet || numbered)[1], article);
      list.append(item);
      continue;
    }
    list = null;
    if (!line) { flush(); continue; }
    if (heading) {
      flush();
      const h = el("h4");
      renderInline(h, heading[1].replace(/\*\*/g, ""), article);
      container.append(h);
      continue;
    }
    if (/^\|?\s*:?-{3,}/.test(line)) continue; // markdown table rule
    paragraph.push(line.replace(/^\|\s*|\s*\|$/g, "").replace(/\s*\|\s*/g, " · "));
  }
  flush();
}

function focusSource(article, id) {
  const card = article.querySelector(`.source[data-id="${id}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  card.classList.add("highlight");
  setTimeout(() => card.classList.remove("highlight"), 1600);
}

// ---------- result rendering ----------
function setStep(article, step, state, text) {
  const item = article.querySelector(`.pipeline li[data-step="${step}"]`);
  item.classList.remove("active", "done", "flag");
  if (state) item.classList.add(state);
  if (text !== undefined) item.querySelector("small").textContent = text;
}

function startPipeline(article) {
  const timers = STEPS.map((step, index) => setTimeout(() => {
    if (index > 0) setStep(article, STEPS[index - 1], "done", "…");
    setStep(article, step, "active", "Working…");
  }, STEP_START_MS[index]));
  return () => timers.forEach(clearTimeout);
}

function chip(text, className = "") {
  return el("span", `chip ${className}`.trim(), text);
}

function sourceCard(source, cited) {
  const card = el("div", "source");
  card.dataset.id = source.id;
  card.dataset.domain = source.domain;
  const top = el("div", "source-top");
  top.append(el("span", "source-id", source.id), el("span", "source-domain", DOMAIN_LABEL[source.domain] ?? source.domain));
  if (cited) top.append(el("span", "source-cited", "✓ cited"));
  const title = el("p", "source-title", source.title.replace(/^RAGBench /, ""));
  const excerpt = el("p", "source-excerpt");
  const full = source.excerpt.trim();
  const short = full.length > 260 ? `${full.slice(0, 260).trimEnd()}…` : full;
  excerpt.textContent = short;
  card.append(top, title, excerpt);
  if (short !== full) {
    const more = el("button", "source-more", "Show full excerpt");
    more.type = "button";
    more.addEventListener("click", () => {
      const open = more.dataset.open === "1";
      excerpt.textContent = open ? short : full;
      more.textContent = open ? "Show full excerpt" : "Show less";
      more.dataset.open = open ? "0" : "1";
    });
    card.append(more);
  }
  return card;
}

function showResult(article, data, seconds) {
  const router = data.router ?? {};
  const domain = router.domain || "unknown";
  const notes = data.safety_notes ?? [];
  const answerText = data.answer ?? "";
  const citedIds = new Set((answerText.match(CITATION) ?? []).map((id) => id.slice(1, -1)));
  article.dataset.domain = domain;
  article.answerText = answerText;
  if (article.historyEntry) article.historyEntry.dataset.domain = domain;

  const meta = article.querySelector(".result-meta");
  meta.replaceChildren(
    chip(DOMAIN_LABEL[domain] ?? domain, "domain"),
    chip(`severity: ${router.severity ?? "—"}`),
    chip(`${data.sources?.length ?? 0} sources`),
    chip(`answered in ${seconds.toFixed(1)} s`),
  );
  if (data.review_required) meta.append(chip("expert review recommended", "review"));

  // what each agent actually did
  const contractNote = notes.find((n) => n.startsWith("Searched only the contract"));
  const secondHop = notes.find((n) => n.startsWith("Second search for a missing fact"));
  const removed = notes.some((n) => n.startsWith("Statements the evidence did not support were removed"));
  const labels = data.drug_labels ?? [];
  setStep(article, "router", "done", `${DOMAIN_LABEL[domain] ?? domain} · ${router.severity ?? ""}${contractNote ? " · contract named" : ""}`);
  setStep(article, "retrieval", "done", `${data.sources?.length ?? 0} sources${secondHop ? " · second-hop search" : ""}${contractNote ? " · one contract" : ""}`);
  setStep(article, "domain_check", "done",
    labels.length ? `${labels.filter((l) => l.status === "retrieved").length} of ${labels.length} OpenFDA labels` : domain === "biomedical" ? "no medicines named" : "nothing extra needed");
  setStep(article, "answer", "done", `${citedIds.size} source${citedIds.size === 1 ? "" : "s"} cited`);
  setStep(article, "safety", removed || data.review_required ? "flag" : "done",
    removed ? "unsupported statements removed" : data.review_required ? "verified · review flagged" : "all statements verified");

  const banner = article.querySelector(".answer-banner");
  if (answerText.startsWith("This may require urgent")) {
    banner.className = "answer-banner emergency";
    banner.textContent = "Possible emergency — the Safety Agent replaced the answer with emergency guidance.";
  } else if (data.review_required) {
    banner.textContent = "Expert review recommended — check the answer against the cited sources.";
  }
  renderMarkdown(article.querySelector(".answer-text"), answerText, article);

  if (notes.length) {
    const details = article.querySelector(".notes");
    details.hidden = false;
    details.querySelector("ul").replaceChildren(...notes.map((n) => el("li", "", n)));
  }

  article.querySelector(".sources .count").textContent = String(data.sources?.length ?? 0);
  const list = article.querySelector(".source-list");
  const ordered = [...(data.sources ?? [])].sort((a, b) => citedIds.has(b.id) - citedIds.has(a.id)); // cited first
  list.replaceChildren(...ordered.map((s) => sourceCard(s, citedIds.has(s.id))));
  for (const label of labels) {
    const card = el("div", "source");
    card.dataset.id = label.id;
    card.dataset.domain = "biomedical";
    const top = el("div", "source-top");
    top.append(el("span", "source-id", label.id), el("span", "source-domain", "OpenFDA"));
    if (citedIds.has(label.id)) top.append(el("span", "source-cited", "✓ cited"));
    card.append(top, el("p", "source-title", `OpenFDA label · ${label.medication}: ${label.status}`));
    if (citedIds.has(label.id)) list.prepend(card); // cited labels first, like cited passages
    else list.append(card);
  }
  if (!list.children.length) list.append(el("p", "empty-note", "No sources were retrieved."));
  article.querySelector(".copy").disabled = false;
}

function showError(article, message, question) {
  STEPS.forEach((step) => setStep(article, step, "", "—"));
  const text = article.querySelector(".answer-text");
  text.replaceChildren(el("p", "", message));
  text.classList.add("error");
  const retry = el("button", "mini-button retry", "Try again");
  retry.type = "button";
  retry.addEventListener("click", () => ask(question));
  text.append(retry);
  article.querySelector(".source-list").replaceChildren(el("p", "empty-note", "No sources."));
}

async function ask(question) {
  question = question.trim();
  if (!question || searchButton.disabled) return;
  showView("assistant");
  document.body.classList.add("has-results");
  const article = template.content.firstElementChild.cloneNode(true);
  article.dataset.domain = "unknown";
  article.querySelector(".result-question").textContent = question;
  const timer = chip("Agents working · 0.0 s", "timer");
  article.querySelector(".result-meta").append(timer);
  const copy = article.querySelector(".copy");
  copy.disabled = true;
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(article.answerText ?? "");
      showToast("Answer copied");
    } catch {
      showToast("Copy is not available in this browser");
    }
  });
  article.querySelector(".again").addEventListener("click", () => ask(question));
  results.append(article); // chat order: newest at the bottom, just above the search bar
  requestAnimationFrame(() => article.scrollIntoView({ behavior: "smooth", block: "start" }));

  historyList.querySelector(".history-empty")?.remove();
  const entry = el("li");
  entry.dataset.domain = "unknown";
  entry.title = question;
  entry.append(el("span", "dot"), el("span", "text", question));
  entry.addEventListener("click", () => { showView("assistant"); article.scrollIntoView({ behavior: "smooth", block: "start" }); });
  historyList.prepend(entry);
  article.historyEntry = entry;

  questionInput.value = "";
  resize();
  searchButton.disabled = true;
  const stopAnimation = startPipeline(article);
  const started = performance.now();
  const tick = setInterval(() => { timer.textContent = `Agents working · ${((performance.now() - started) / 1000).toFixed(1)} s`; }, 100);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await response.json();
    clearInterval(tick);
    stopAnimation();
    if (!response.ok) throw new Error(data.error || "The assistant could not complete the request.");
    showResult(article, data, (performance.now() - started) / 1000);
  } catch (error) {
    clearInterval(tick);
    stopAnimation();
    timer.textContent = "failed";
    showError(article, error instanceof Error ? error.message : "An unexpected error occurred.", question);
  } finally {
    searchButton.disabled = false;
    questionInput.focus();
  }
}

// ---------- input ----------
function resize() {
  questionInput.style.height = "auto";
  questionInput.style.height = `${Math.min(questionInput.scrollHeight, 160)}px`;
  const length = questionInput.value.length;
  counter.textContent = length ? `${length.toLocaleString()} / 4,000` : "";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(questionInput.value);
});
questionInput.addEventListener("input", resize);
questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== questionInput) {
    event.preventDefault();
    showView("assistant");
    questionInput.focus();
  }
});
document.querySelectorAll(".example, .kb-ask").forEach((button) => {
  button.addEventListener("click", () => ask(button.dataset.prompt ?? ""));
});
document.querySelector("#new-search").addEventListener("click", () => {
  results.replaceChildren();
  historyList.innerHTML = historyEmpty;
  document.body.classList.remove("has-results");
  questionInput.value = "";
  resize();
  showView("assistant");
});

buildBars();
questionInput.focus();
// http://127.0.0.1:8080/?q=... runs that question straight away (handy for a demo link); ?tab=results opens a tab
const params = new URLSearchParams(window.location.search);
if (params.get("tab")) showView(params.get("tab"));
if (params.get("q")) ask(params.get("q"));
