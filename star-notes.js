const notes = window.STAR_NOTES || [];

const lectureOrder = ["전체", "1-1강", "1_2강", "2강", "3강", "4강", "5강", "6강", "7강"];
const certaintyLabels = {
  all: "전체",
  certain: "확실",
  review: "검토",
  uncertain: "낮음",
  none: "없음"
};

const state = {
  lecture: "전체",
  certainty: "all",
  query: "",
  hideDone: false,
  openAll: false,
  done: loadDone()
};

const el = {
  lectureFilters: document.querySelector("#lectureFilters"),
  certaintyFilters: document.querySelector("#certaintyFilters"),
  searchInput: document.querySelector("#searchInput"),
  hideDone: document.querySelector("#hideDone"),
  openAll: document.querySelector("#openAll"),
  summary: document.querySelector("#summary"),
  lectureStats: document.querySelector("#lectureStats"),
  notesList: document.querySelector("#notesList"),
  emptyState: document.querySelector("#emptyState")
};

function loadDone() {
  try {
    return new Set(JSON.parse(localStorage.getItem("urbanLawStarDone") || "[]"));
  } catch {
    return new Set();
  }
}

function saveDone() {
  try {
    localStorage.setItem("urbanLawStarDone", JSON.stringify([...state.done]));
  } catch {
    // Keep the current in-memory state even when browser storage is unavailable.
  }
}

function byLecture(a, b) {
  const lectureDiff = lectureOrder.indexOf(a.lecture) - lectureOrder.indexOf(b.lecture);
  if (lectureDiff !== 0) return lectureDiff;
  return (a.page || 0) - (b.page || 0);
}

function noteMatches(note) {
  const haystack = [
    note.lecture,
    note.sourcePdf,
    note.page ? `p.${note.page}` : "",
    note.title,
    note.originalText,
    note.explanation,
    note.starSignal,
    ...(note.examFocus || []),
    ...(note.tags || [])
  ]
    .join(" ")
    .toLowerCase();

  const lectureOk = state.lecture === "전체" || note.lecture === state.lecture;
  const certaintyOk = state.certainty === "all" || note.certainty === state.certainty;
  const queryOk = !state.query || haystack.includes(state.query.toLowerCase());
  const doneOk = !state.hideDone || !state.done.has(note.id);
  return lectureOk && certaintyOk && queryOk && doneOk;
}

function renderFilters() {
  el.lectureFilters.innerHTML = lectureOrder
    .map((lecture) => buttonChip(lecture, state.lecture === lecture, "lecture"))
    .join("");

  el.certaintyFilters.innerHTML = Object.entries(certaintyLabels)
    .map(([key, label]) => buttonChip(label, state.certainty === key, "certainty", key))
    .join("");
}

function buttonChip(label, active, type, value = label) {
  return `<button class="chip${active ? " active" : ""}" data-${type}="${escapeAttr(value)}" type="button">${escapeHtml(label)}</button>`;
}

function renderSummary(filtered) {
  const realNotes = notes.filter((note) => note.certainty !== "none");
  const certain = realNotes.filter((note) => note.certainty === "certain").length;
  const review = realNotes.filter((note) => note.certainty === "review").length;
  const done = realNotes.filter((note) => state.done.has(note.id)).length;
  const doneRate = realNotes.length ? Math.round((done / realNotes.length) * 100) : 0;

  el.summary.innerHTML = [
    ["별표 카드", `${realNotes.length}개`],
    ["확실 근거", `${certain}개`],
    ["검토 필요", `${review}개`],
    ["암기 완료", `${doneRate}%`],
    ["현재 표시", `${filtered.filter((note) => note.certainty !== "none").length}개`],
    ["강의 범위", "1-1강-7강"]
  ]
    .map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderLectureStats() {
  const rows = lectureOrder
    .filter((lecture) => lecture !== "전체")
    .map((lecture) => {
      const lectureNotes = notes.filter((note) => note.lecture === lecture && note.certainty !== "none");
      const done = lectureNotes.filter((note) => state.done.has(note.id)).length;
      const percent = lectureNotes.length ? Math.round((done / lectureNotes.length) * 100) : 0;
      return { lecture, count: lectureNotes.length, done, percent };
    });

  el.lectureStats.innerHTML = rows
    .map(
      (row) => `
        <button class="lecture-row" data-lecture="${escapeAttr(row.lecture)}" type="button">
          <span>${escapeHtml(row.lecture)}</span>
          <div class="mini-track" aria-hidden="true"><div style="width:${row.percent}%"></div></div>
          <b>${row.done}/${row.count}</b>
        </button>
      `
    )
    .join("");
}

function renderNotes() {
  const filtered = notes.filter(noteMatches).sort(byLecture);
  renderSummary(filtered);

  el.emptyState.hidden = filtered.length > 0;
  el.notesList.innerHTML = filtered.map(renderNote).join("");
}

function renderNote(note) {
  const done = state.done.has(note.id);
  const page = note.page ? `p.${note.page}` : "페이지 없음";
  const isOpen = state.openAll || note.certainty === "none";
  return `
    <article class="note-card ${note.certainty}${done ? " done" : ""}" data-id="${escapeAttr(note.id)}">
      <div class="note-head">
        <div>
          <div class="meta-line">
            <span>${escapeHtml(note.lecture)}</span>
            <span>${escapeHtml(page)}</span>
            <span>${escapeHtml(certaintyLabels[note.certainty] || note.certainty)}</span>
          </div>
          <h2>${escapeHtml(note.title)}</h2>
        </div>
        <button class="done-btn${done ? " active" : ""}" data-done="${escapeAttr(note.id)}" type="button">
          ${done ? "완료" : "암기"}
        </button>
      </div>
      <details ${isOpen ? "open" : ""}>
        <summary>근거와 설명 보기</summary>
        <div class="note-body">
          <section>
            <h3>별표 신호</h3>
            <p>${escapeHtml(note.starSignal)}</p>
          </section>
          <section>
            <h3>원문/필기</h3>
            <p>${escapeHtml(note.originalText)}</p>
          </section>
          <section>
            <h3>설명</h3>
            <p>${escapeHtml(note.explanation)}</p>
          </section>
          <section>
            <h3>시험 포인트</h3>
            <ul>${(note.examFocus || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </section>
          <footer>
            <span>${escapeHtml(note.sourcePdf)}</span>
            <span>신뢰도 ${Math.round(note.confidence * 100)}%</span>
          </footer>
        </div>
      </details>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

document.addEventListener("click", (event) => {
  const lectureButton = event.target.closest("[data-lecture]");
  if (lectureButton) {
    state.lecture = lectureButton.dataset.lecture;
    renderFilters();
    renderLectureStats();
    renderNotes();
    return;
  }

  const certaintyButton = event.target.closest("[data-certainty]");
  if (certaintyButton) {
    state.certainty = certaintyButton.dataset.certainty;
    renderFilters();
    renderNotes();
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
    renderLectureStats();
    renderNotes();
  }
});

el.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  renderNotes();
});

el.hideDone.addEventListener("change", (event) => {
  state.hideDone = event.target.checked;
  renderNotes();
});

el.openAll.addEventListener("change", (event) => {
  state.openAll = event.target.checked;
  renderNotes();
});

renderFilters();
renderLectureStats();
renderNotes();
