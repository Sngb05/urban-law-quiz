const notes = (window.STAR_NOTES || []).filter((note) => note.certainty !== "none");
const predictions = window.STAR_SPECIAL_QUESTIONS || [];

const storeKey = "urbanLawStarQuizState";
const lectureOrder = ["전체", "1_2강", "2강", "3강", "4강", "5강", "6강", "7강"];
const state = {
  lecture: "전체",
  query: "",
  showDone: true,
  done: loadDone()
};

const el = {
  predictionGrid: document.querySelector("#predictionGrid"),
  drillGrid: document.querySelector("#drillGrid"),
  lectureFilters: document.querySelector("#lectureFilters"),
  searchInput: document.querySelector("#searchInput"),
  showDone: document.querySelector("#showDone"),
  summary: document.querySelector("#summary"),
  emptyState: document.querySelector("#emptyState")
};

function loadDone() {
  try {
    return new Set(JSON.parse(localStorage.getItem(storeKey) || "[]"));
  } catch {
    return new Set();
  }
}

function saveDone() {
  try {
    localStorage.setItem(storeKey, JSON.stringify([...state.done]));
  } catch {
    // Non-persistent mode is still usable.
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function noteLabel(note) {
  return `${note.lecture} p.${note.page ?? "-"} · ${note.title}`;
}

function sourceNotes(ids) {
  return ids
    .map((id) => notes.find((note) => note.id === id))
    .filter(Boolean);
}

function matches(item) {
  const q = normalize(state.query);
  const lectureOk = state.lecture === "전체" || item.lecture === state.lecture || item.lecture?.includes(state.lecture);
  const doneOk = state.showDone || !state.done.has(item.id);
  if (!lectureOk || !doneOk) return false;
  if (!q) return true;
  return normalize([item.title, item.question, item.answer, item.lecture, item.tags?.join(" ")].join(" ")).includes(q);
}

function renderFilters() {
  el.lectureFilters.innerHTML = lectureOrder
    .map((lecture) => `<button class="chip${state.lecture === lecture ? " active" : ""}" data-lecture="${escapeHtml(lecture)}" type="button">${escapeHtml(lecture)}</button>`)
    .join("");
}

function renderSummary(filteredDrills) {
  const total = predictions.length + notes.length;
  const done = [...state.done].filter((id) => id.startsWith("PRED-") || id.startsWith("DRILL-")).length;
  const doneRate = total ? Math.round((done / total) * 100) : 0;
  el.summary.innerHTML = [
    ["실전 예상축", `${predictions.length}개`],
    ["별표 점검", `${notes.length}개`],
    ["현재 표시", `${filteredDrills.length}개`],
    ["완료율", `${doneRate}%`]
  ]
    .map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderPredictions() {
  el.predictionGrid.innerHTML = predictions.map((item) => renderPrediction(item)).join("");
}

function renderPrediction(item) {
  const done = state.done.has(item.id);
  const sources = sourceNotes(item.sources);
  return `
    <article class="prediction-card${done ? " done" : ""}">
      <div class="rank">예상 ${item.rank}</div>
      <div class="card-head">
        <div>
          <p>${escapeHtml(item.lecture)} · ${escapeHtml(item.type)} · ${escapeHtml(item.probability)}</p>
          <h2>${escapeHtml(item.title)}</h2>
        </div>
        <button class="done-btn${done ? " active" : ""}" data-done="${escapeHtml(item.id)}" type="button">${done ? "완료" : "암기"}</button>
      </div>
      <p class="question">${escapeHtml(item.question)}</p>
      <details>
        <summary>답안 골격 보기</summary>
        <div class="answer-block">
          <h3>답안에 들어갈 말</h3>
          <ul>${item.answerOutline.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
          <h3>틀리기 쉬운 포인트</h3>
          <ul>${item.traps.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
          <div class="source-list">
            ${sources.map((note) => `<span>${escapeHtml(noteLabel(note))}</span>`).join("")}
          </div>
        </div>
      </details>
    </article>
  `;
}

function buildDrill(note, index) {
  return {
    id: `DRILL-${note.id}`,
    lecture: note.lecture,
    title: note.title,
    question: `${note.title}의 핵심을 시험 답안식으로 2문장 안에 설명하라.`,
    answer: note.explanation,
    focus: note.examFocus || [],
    source: noteLabel(note),
    tags: note.tags || [],
    confidence: note.confidence
  };
}

function renderDrills() {
  const drills = notes.map(buildDrill).filter(matches);
  renderSummary(drills);
  el.emptyState.hidden = drills.length > 0;
  el.drillGrid.innerHTML = drills.map(renderDrill).join("");
}

function renderDrill(item) {
  const done = state.done.has(item.id);
  return `
    <article class="drill-card${done ? " done" : ""}">
      <div class="card-head">
        <div>
          <p>${escapeHtml(item.lecture)} · 신뢰도 ${Math.round((item.confidence || 0) * 100)}%</p>
          <h3>${escapeHtml(item.question)}</h3>
        </div>
        <button class="done-btn${done ? " active" : ""}" data-done="${escapeHtml(item.id)}" type="button">${done ? "완료" : "암기"}</button>
      </div>
      <details>
        <summary>정답 보기</summary>
        <div class="answer-block compact">
          <p>${escapeHtml(item.answer)}</p>
          <ul>${item.focus.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
          <div class="source-list"><span>${escapeHtml(item.source)}</span></div>
        </div>
      </details>
    </article>
  `;
}

document.addEventListener("click", (event) => {
  const lecture = event.target.closest("[data-lecture]");
  if (lecture) {
    state.lecture = lecture.dataset.lecture;
    renderFilters();
    renderDrills();
    return;
  }

  const doneButton = event.target.closest("[data-done]");
  if (doneButton) {
    const id = doneButton.dataset.done;
    if (state.done.has(id)) {
      state.done.delete(id);
    } else {
      state.done.add(id);
    }
    saveDone();
    renderPredictions();
    renderDrills();
  }
});

el.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  renderDrills();
});

el.showDone.addEventListener("change", (event) => {
  state.showDone = event.target.checked;
  renderDrills();
});

renderFilters();
renderPredictions();
renderDrills();
