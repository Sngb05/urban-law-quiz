const TYPE_LABELS = {
  multiple_choice: "객관식",
  ox: "OX",
  fill_blank: "빈칸",
  short_answer: "단답형",
  comparison: "비교",
  ordering: "순서",
  case: "사례형",
};

const EVIDENCE_LABELS = {
  professor: "교수님 색상",
  handwriting: "필기 후보",
  audit: "감사 보강",
  curated: "큐레이션",
  reconstructed: "페이지 재구성",
  legal: "법규 키워드",
};

const STORAGE_KEY = "urban-law-quiz-state-v1";

const state = {
  questions: [],
  filtered: [],
  currentIndex: 0,
  selectedLectures: new Set(),
  selectedTypes: new Set(),
  selectedEvidence: new Set(),
  mode: "all",
  search: "",
  shuffled: false,
  currentAnswer: "",
  checked: false,
  store: {
    attempts: {},
    wrong: {},
    bookmarks: {},
  },
};

const els = {
  dataSummary: document.querySelector("#dataSummary"),
  lectureFilters: document.querySelector("#lectureFilters"),
  typeFilters: document.querySelector("#typeFilters"),
  evidenceFilters: document.querySelector("#evidenceFilters"),
  modeBtns: document.querySelectorAll(".mode-btn"),
  searchInput: document.querySelector("#searchInput"),
  studySummary: document.querySelector("#studySummary"),
  lectureStats: document.querySelector("#lectureStats"),
  quizPanel: document.querySelector("#quizPanel"),
  positionText: document.querySelector("#positionText"),
  accuracyText: document.querySelector("#accuracyText"),
  progressBar: document.querySelector("#progressBar"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  checkBtn: document.querySelector("#checkBtn"),
  shuffleBtn: document.querySelector("#shuffleBtn"),
  resetBtn: document.querySelector("#resetBtn"),
};

function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.store = {
      attempts: parsed.attempts || {},
      wrong: parsed.wrong || {},
      bookmarks: parsed.bookmarks || {},
    };
  } catch {
    state.store = { attempts: {}, wrong: {}, bookmarks: {} };
  }
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,;:!?'"“”‘’()[\]{}<>·ㆍ\-_/]/g, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shuffleCopy(items) {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

function evidenceGroupsFor(q) {
  const evidence = (q.evidenceType || []).join(" ").toLowerCase();
  const groups = new Set();
  if (evidence.includes("professor") || evidence.includes("coloredtext") || evidence.includes("colored_text") || evidence.includes("red") || evidence.includes("blue") || evidence.includes("cyan")) {
    groups.add("professor");
  }
  if (evidence.includes("hand") || evidence.includes("ocr") || evidence.includes("note")) {
    groups.add("handwriting");
  }
  if (evidence.includes("coverage_audit")) {
    groups.add("audit");
  }
  if (evidence.includes("curated_subagent")) {
    groups.add("curated");
  }
  if (evidence.includes("reconstructed") || evidence.includes("page_text")) {
    groups.add("reconstructed");
  }
  if (evidence.includes("legal")) {
    groups.add("legal");
  }
  if (!groups.size) groups.add("legal");
  return [...groups];
}

function statsForQuestion(id) {
  return state.store.attempts[id] || { total: 0, correct: 0 };
}

function answeredCorrectly(id) {
  const stats = statsForQuestion(id);
  return stats.total > 0 && stats.correct > 0 && !state.store.wrong[id];
}

function isBookmarked(id) {
  return Boolean(state.store.bookmarks?.[id]);
}

function isFocusQuestion(q) {
  return q.difficulty === "hard" || Number(q.confidence || 0) < 0.78 || Boolean(state.store.wrong[q.id]);
}

function buildFilters() {
  const lectures = [...new Set(state.questions.map((q) => q.lecture))];
  const types = [...new Set(state.questions.map((q) => q.questionType))];
  const evidenceGroups = Object.keys(EVIDENCE_LABELS).filter((key) => state.questions.some((q) => evidenceGroupsFor(q).includes(key)));
  state.selectedLectures = new Set(lectures);
  state.selectedTypes = new Set(types);
  state.selectedEvidence = new Set(evidenceGroups);

  els.lectureFilters.innerHTML = lectures
    .map((lecture) => `<button class="chip active" data-lecture="${escapeHtml(lecture)}" type="button">${escapeHtml(lecture)}</button>`)
    .join("");

  els.typeFilters.innerHTML = types
    .map((type) => `<button class="chip active" data-type="${escapeHtml(type)}" type="button">${TYPE_LABELS[type] || type}</button>`)
    .join("");

  els.evidenceFilters.innerHTML = evidenceGroups
    .map((group) => `<button class="chip active" data-evidence="${escapeHtml(group)}" type="button">${EVIDENCE_LABELS[group] || group}</button>`)
    .join("");
}

function applyFilters() {
  const search = normalize(state.search);
  let result = state.questions.filter((q) => {
    if (!state.selectedLectures.has(q.lecture)) return false;
    if (!state.selectedTypes.has(q.questionType)) return false;
    if (!evidenceGroupsFor(q).some((group) => state.selectedEvidence.has(group))) return false;
    if (state.mode === "unseen" && statsForQuestion(q.id).total > 0) return false;
    if (state.mode === "wrong" && !state.store.wrong[q.id]) return false;
    if (state.mode === "retry" && answeredCorrectly(q.id)) return false;
    if (state.mode === "bookmarked" && !isBookmarked(q.id)) return false;
    if (state.mode === "focus" && !isFocusQuestion(q)) return false;
    if (!search) return true;
    const haystack = normalize([q.question, q.answer, q.explanation, q.tags?.join(" "), q.evidenceType?.join(" "), q.sourcePdf, q.page].join(" "));
    return haystack.includes(search);
  });

  if (state.shuffled) {
    result = shuffleCopy(result);
  }

  state.filtered = result;
  state.currentIndex = Math.min(state.currentIndex, Math.max(0, result.length - 1));
  state.currentAnswer = "";
  state.checked = false;
  renderAll();
}

function renderStudySummary() {
  const total = state.questions.length;
  const attempted = state.questions.filter((q) => statsForQuestion(q.id).total > 0).length;
  const wrong = Object.keys(state.store.wrong || {}).length;
  const bookmarked = Object.keys(state.store.bookmarks || {}).length;
  const focus = state.questions.filter(isFocusQuestion).length;
  const items = [
    ["전체", total],
    ["미풀이", Math.max(0, total - attempted)],
    ["오답", wrong],
    ["북마크", bookmarked],
    ["어려움", focus],
  ];

  els.studySummary.innerHTML = items
    .map(
      ([label, value]) => `
        <div class="summary-card">
          <span>${label}</span>
          <strong>${Number(value).toLocaleString()}</strong>
        </div>
      `,
    )
    .join("");
}

function renderStats() {
  const lectureTotals = {};
  for (const question of state.questions) {
    lectureTotals[question.lecture] ||= { total: 0, attempts: 0, correct: 0 };
    lectureTotals[question.lecture].total += 1;
    const stats = statsForQuestion(question.id);
    lectureTotals[question.lecture].attempts += stats.total;
    lectureTotals[question.lecture].correct += stats.correct;
  }

  els.lectureStats.innerHTML = Object.entries(lectureTotals)
    .map(([lecture, item]) => {
      const rate = item.attempts ? Math.round((item.correct / item.attempts) * 100) : 0;
      return `
        <div class="stat-row">
          <strong>${escapeHtml(lecture)}</strong>
          <div class="mini-track"><div class="mini-fill" style="width:${rate}%"></div></div>
          <span>${rate}% · ${item.correct}/${item.attempts}</span>
        </div>
      `;
    })
    .join("");
}

function renderProgress() {
  const total = state.filtered.length;
  const current = total ? state.currentIndex + 1 : 0;
  const attempted = Object.values(state.store.attempts).reduce((sum, item) => sum + item.total, 0);
  const correct = Object.values(state.store.attempts).reduce((sum, item) => sum + item.correct, 0);
  const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
  els.positionText.textContent = `${current} / ${total}`;
  els.accuracyText.textContent = `누적 정답률 ${accuracy}%`;
  els.progressBar.style.width = total ? `${Math.round((current / total) * 100)}%` : "0%";
  els.prevBtn.disabled = current <= 1;
  els.nextBtn.disabled = current >= total;
  els.checkBtn.disabled = total === 0;
}

function sourceLabel(q) {
  return `${q.sourcePdf} · p.${q.page}`;
}

function renderQuestion() {
  const q = state.filtered[state.currentIndex];
  if (!q) {
    els.quizPanel.innerHTML = `<div class="empty-state">조건에 맞는 문제가 없습니다.</div>`;
    return;
  }

  const stats = statsForQuestion(q.id);
  const evidence = (q.evidenceType || []).slice(0, 3).join(", ");
  const evidenceGroups = evidenceGroupsFor(q).map((group) => EVIDENCE_LABELS[group] || group).join(" · ");
  const tags = (q.tags || []).map((tag) => `<span class="meta-pill">${escapeHtml(tag)}</span>`).join("");
  const bookmarked = isBookmarked(q.id);
  const answerUi = q.choices?.length
    ? `<div class="choices">${q.choices
        .map(
          (choice) =>
            `<button class="choice-btn ${state.currentAnswer === choice ? "selected" : ""}" data-choice="${escapeHtml(choice)}" type="button">${escapeHtml(choice)}</button>`,
        )
        .join("")}</div>`
    : `<input class="answer-input" id="answerInput" type="text" placeholder="정답 입력" value="${escapeHtml(state.currentAnswer)}" autocomplete="off" />`;

  els.quizPanel.innerHTML = `
    <div class="meta-row">
      <span class="meta-pill">${escapeHtml(q.id)}</span>
      <span class="meta-pill">${escapeHtml(q.lecture)}</span>
      <span class="meta-pill">${TYPE_LABELS[q.questionType] || q.questionType}</span>
      <span class="meta-pill">난이도 ${escapeHtml(q.difficulty)}</span>
      <span class="meta-pill">신뢰도 ${Math.round((q.confidence || 0) * 100)}%</span>
      <span class="meta-pill">${escapeHtml(evidenceGroups)}</span>
      <span class="meta-pill source">${escapeHtml(sourceLabel(q))}</span>
      ${tags}
    </div>
    <div class="question-tools">
      <button id="bookmarkBtn" class="bookmark-btn ${bookmarked ? "active" : ""}" type="button" aria-pressed="${bookmarked}">
        ${bookmarked ? "북마크 해제" : "북마크"}
      </button>
    </div>
    <p class="question-text">${escapeHtml(q.question)}</p>
    ${answerUi}
    <div id="feedback" class="feedback">
      <strong id="feedbackTitle"></strong>
      <div id="feedbackBody"></div>
      <div class="source-snippet">근거 유형: ${escapeHtml(evidence)} · 누적 ${stats.correct}/${stats.total}</div>
    </div>
  `;

  const choiceBtns = els.quizPanel.querySelectorAll(".choice-btn");
  choiceBtns.forEach((button) => {
    button.addEventListener("click", () => {
      state.currentAnswer = button.dataset.choice;
      state.checked = false;
      renderQuestion();
    });
  });

  const input = els.quizPanel.querySelector("#answerInput");
  if (input) {
    input.addEventListener("input", (event) => {
      state.currentAnswer = event.target.value;
      state.checked = false;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") checkAnswer();
    });
    input.focus();
  }

  const bookmarkBtn = els.quizPanel.querySelector("#bookmarkBtn");
  bookmarkBtn.addEventListener("click", () => {
    const nextBookmarked = !isBookmarked(q.id);
    if (!nextBookmarked) {
      delete state.store.bookmarks[q.id];
    } else {
      state.store.bookmarks[q.id] = { at: new Date().toISOString() };
    }
    saveStore();
    if (state.mode === "bookmarked") {
      applyFilters();
    } else {
      bookmarkBtn.classList.toggle("active", nextBookmarked);
      bookmarkBtn.setAttribute("aria-pressed", String(nextBookmarked));
      bookmarkBtn.textContent = nextBookmarked ? "북마크 해제" : "북마크";
      renderStudySummary();
    }
  });
}

function isCorrect(q, userAnswer) {
  const actual = normalize(q.answer);
  const user = normalize(userAnswer);
  if (!user) return false;
  if (q.questionType === "ox") return user === actual;
  return user === actual || actual.includes(user) || user.includes(actual);
}

function checkAnswer() {
  const q = state.filtered[state.currentIndex];
  if (!q || state.checked) return;

  const correct = isCorrect(q, state.currentAnswer);
  const stats = statsForQuestion(q.id);
  stats.total += 1;
  if (correct) {
    stats.correct += 1;
    delete state.store.wrong[q.id];
  } else {
    state.store.wrong[q.id] = {
      at: new Date().toISOString(),
      answer: state.currentAnswer,
    };
  }
  state.store.attempts[q.id] = stats;
  state.checked = true;
  saveStore();

  const feedback = document.querySelector("#feedback");
  const title = document.querySelector("#feedbackTitle");
  const body = document.querySelector("#feedbackBody");
  feedback.classList.add("visible", correct ? "correct" : "wrong");
  title.textContent = correct ? "정답" : `오답 · 정답: ${q.answer}`;
  body.innerHTML = `${escapeHtml(q.explanation)}<div class="source-snippet">${escapeHtml(q.sourceSnippet || "")}</div>`;
  renderStudySummary();
  renderStats();
  renderProgress();
}

function renderAll() {
  renderStudySummary();
  renderStats();
  renderProgress();
  renderQuestion();
}

function move(delta) {
  const next = state.currentIndex + delta;
  if (next < 0 || next >= state.filtered.length) return;
  state.currentIndex = next;
  state.currentAnswer = "";
  state.checked = false;
  renderAll();
}

function bindEvents() {
  els.lectureFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-lecture]");
    if (!button) return;
    const lecture = button.dataset.lecture;
    if (state.selectedLectures.has(lecture)) {
      state.selectedLectures.delete(lecture);
      button.classList.remove("active");
    } else {
      state.selectedLectures.add(lecture);
      button.classList.add("active");
    }
    state.currentIndex = 0;
    applyFilters();
  });

  els.typeFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    const type = button.dataset.type;
    if (state.selectedTypes.has(type)) {
      state.selectedTypes.delete(type);
      button.classList.remove("active");
    } else {
      state.selectedTypes.add(type);
      button.classList.add("active");
    }
    state.currentIndex = 0;
    applyFilters();
  });

  els.evidenceFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-evidence]");
    if (!button) return;
    const evidence = button.dataset.evidence;
    if (state.selectedEvidence.has(evidence)) {
      state.selectedEvidence.delete(evidence);
      button.classList.remove("active");
    } else {
      state.selectedEvidence.add(evidence);
      button.classList.add("active");
    }
    state.currentIndex = 0;
    applyFilters();
  });

  els.modeBtns.forEach((button) => {
    button.addEventListener("click", () => {
      els.modeBtns.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.mode = button.dataset.mode;
      state.currentIndex = 0;
      applyFilters();
    });
  });

  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    state.currentIndex = 0;
    applyFilters();
  });

  els.prevBtn.addEventListener("click", () => move(-1));
  els.nextBtn.addEventListener("click", () => move(1));
  els.checkBtn.addEventListener("click", checkAnswer);

  els.shuffleBtn.addEventListener("click", () => {
    state.shuffled = !state.shuffled;
    els.shuffleBtn.classList.toggle("active", state.shuffled);
    els.shuffleBtn.textContent = state.shuffled ? "랜덤 해제" : "랜덤";
    state.currentIndex = 0;
    applyFilters();
  });

  els.resetBtn.addEventListener("click", () => {
    const ok = window.confirm("저장된 풀이 기록, 오답노트, 북마크를 모두 삭제할까요?");
    if (!ok) return;
    state.store = { attempts: {}, wrong: {}, bookmarks: {} };
    saveStore();
    applyFilters();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input")) return;
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
    if (event.key === "Enter") checkAnswer();
  });
}

async function init() {
  loadStore();
  bindEvents();
  try {
    if (Array.isArray(window.QUIZ_QUESTIONS)) {
      state.questions = window.QUIZ_QUESTIONS;
    } else {
      const response = await fetch("questions.json");
      state.questions = await response.json();
    }
    buildFilters();
    const byLecture = state.questions.reduce((acc, q) => {
      acc[q.lecture] = (acc[q.lecture] || 0) + 1;
      return acc;
    }, {});
    els.dataSummary.textContent = `${state.questions.length.toLocaleString()}문제 · ${Object.entries(byLecture)
      .map(([lecture, count]) => `${lecture} ${count}`)
      .join(" · ")}`;
    applyFilters();
  } catch (error) {
    els.quizPanel.innerHTML = `<div class="empty-state">문제 데이터를 불러오지 못했습니다. questions-data.js 또는 questions.json을 확인해 주세요.</div>`;
    els.dataSummary.textContent = "문제 데이터 로드 실패";
    console.error(error);
  }
}

init();
