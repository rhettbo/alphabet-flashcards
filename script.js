(() => {
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const COLORS = {
    firstTry: "#0ff02a",
    secondTry: "#abf4b4",
    thirdTry: "#ffa7a7",
    failed: "#ae0303",
  };

  const $ = (selector) => document.querySelector(selector);

  const ui = {
    progressText: $("#progressText"),
    letterGrid: $("#letterGrid"),
    playPromptBtn: $("#playPromptBtn"),
    resetQuizBtn: $("#resetQuizBtn"),
    practiceControls: $("#practiceControls"),
    quizControls: $("#quizControls"),
    loadingOverlay: $("#loadingOverlay"),
    loadFill: $("#loadFill"),
    scoreModal: $("#scoreModal"),
    scoreTitle: $("#scoreTitle"),
    scoreLine: $("#scoreLine"),
    playAgainBtn: $("#playAgainBtn"),
    closeModalBtn: $("#closeModalBtn"),
  };

  const state = {
    mainMode: "practice",
    practiceMode: "name",
    quizOrder: [],
    quizIndex: 0,
    guessesThisLetter: 0,
    firstTryCorrect: 0,
    resolvedLetters: new Set(),
    quizComplete: false,
    activeAudio: null,
    audio: {
      sound: new Map(),
      name: new Map(),
      find: new Map(),
      greatJob: null,
    },
  };

  function getAudioPath(kind, letter) {
    const lower = letter.toLowerCase();
    if (kind === "sound") return `audio/${lower}.wav`;
    if (kind === "name") return `audio/letter ${lower}.wav`;
    if (kind === "find") return `audio/find ${lower}.wav`;
    return "";
  }

  function getTile(letter) {
    return ui.letterGrid.querySelector(`[data-letter="${letter}"]`);
  }

  function stopAudio() {
    if (state.activeAudio) {
      state.activeAudio.pause();
      state.activeAudio.currentTime = 0;
      state.activeAudio = null;
    }
  }

  function playAudio(audio) {
    if (!audio) return Promise.resolve();
    stopAudio();
    state.activeAudio = audio;
    audio.currentTime = 0;

    return new Promise((resolve) => {
      const done = () => {
        if (state.activeAudio === audio) state.activeAudio = null;
        resolve();
      };

      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
    });
  }

  function preloadAudio() {
    const assets = [];

    LETTERS.forEach((letter) => {
      ["sound", "name", "find"].forEach((kind) => {
        const audio = new Audio(getAudioPath(kind, letter));
        audio.preload = "auto";
        state.audio[kind].set(letter, audio);
        assets.push(audio);
      });
    });

    const greatJob = new Audio("audio/great_job.wav");
    greatJob.preload = "auto";
    state.audio.greatJob = greatJob;
    assets.push(greatJob);

    let completed = 0;
    if (!assets.length) return Promise.resolve();

    ui.loadingOverlay.classList.remove("hidden");
    ui.loadingOverlay.setAttribute("aria-hidden", "false");

    return new Promise((resolve) => {
      const markDone = () => {
        completed += 1;
        ui.loadFill.style.width = `${Math.round((completed / assets.length) * 100)}%`;
        if (completed === assets.length) {
          window.setTimeout(() => {
            ui.loadingOverlay.classList.add("hidden");
            ui.loadingOverlay.setAttribute("aria-hidden", "true");
            resolve();
          }, 180);
        }
      };

      assets.forEach((audio) => {
        const handle = () => markDone();
        audio.addEventListener("canplaythrough", handle, { once: true });
        audio.addEventListener("error", handle, { once: true });
        audio.load();
      });
    });
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function setSegmentState(selector, attribute, value) {
    document.querySelectorAll(selector).forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute(attribute) === value);
    });
  }

  function currentQuizLetter() {
    return state.quizOrder[state.quizIndex] || null;
  }

  function updateProgressText() {
    if (state.mainMode === "practice") {
      const modeLabel = state.practiceMode === "name" ? "Letter Name" : "Letter Sound";
      ui.progressText.textContent = `Practice Mode: ${modeLabel}`;
      return;
    }

    const cleared = state.resolvedLetters.size;
    ui.progressText.textContent = `Quiz Progress: ${cleared}/26 cleared | First-try score: ${state.firstTryCorrect}`;
  }

  function updateControlVisibility() {
    const inPractice = state.mainMode === "practice";
    ui.practiceControls.classList.toggle("hidden", !inPractice);
    ui.quizControls.classList.toggle("hidden", inPractice);
    ui.resetQuizBtn.classList.toggle("hidden", inPractice);
  }

  function setTileLocked(letter, color) {
    const tile = getTile(letter);
    if (!tile) return;
    tile.disabled = true;
    tile.classList.add("is-locked");
    tile.style.background = color;
    tile.style.borderColor = color;
    tile.style.color = color === COLORS.failed ? "#ffffff" : "#123320";
  }

  function pulseTile(tile) {
    tile.classList.remove("is-wrong");
    void tile.offsetWidth;
    tile.classList.add("is-wrong");
  }

  function renderTiles() {
    ui.letterGrid.innerHTML = "";

    LETTERS.forEach((letter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "letter-tile";
      button.textContent = letter;
      button.setAttribute("role", "gridcell");
      button.setAttribute("data-letter", letter);
      ui.letterGrid.appendChild(button);
    });
  }

  function resetTiles() {
    ui.letterGrid.querySelectorAll(".letter-tile").forEach((tile) => {
      tile.disabled = false;
      tile.classList.remove("is-locked", "is-wrong");
      tile.style.background = "";
      tile.style.borderColor = "";
      tile.style.color = "";
    });
  }

  function showScoreModal() {
    const score = state.firstTryCorrect;
    const isPerfect = score === 26;

    ui.scoreTitle.textContent = isPerfect ? "Great job, 26/26" : "Quiz complete";
    ui.scoreLine.textContent = isPerfect
      ? "Every letter was correct on the first guess."
      : `You got ${score} out of 26 letters on the first try.`;

    ui.scoreModal.classList.remove("hidden");
    ui.scoreModal.setAttribute("aria-hidden", "false");

    if (isPerfect) {
      playAudio(state.audio.greatJob);
    }
  }

  function closeScoreModal() {
    ui.scoreModal.classList.add("hidden");
    ui.scoreModal.setAttribute("aria-hidden", "true");
  }

  function finishQuiz() {
    state.quizComplete = true;
    updateProgressText();
    showScoreModal();
  }

  function beginQuizRound() {
    closeScoreModal();
    stopAudio();
    state.quizOrder = shuffle(LETTERS);
    state.quizIndex = 0;
    state.guessesThisLetter = 0;
    state.firstTryCorrect = 0;
    state.quizComplete = false;
    state.resolvedLetters = new Set();
    resetTiles();
    updateProgressText();
    playCurrentPrompt();
  }

  function switchMainMode(mode) {
    state.mainMode = mode;
    setSegmentState("[data-main-mode]", "data-main-mode", mode);
    updateControlVisibility();
    closeScoreModal();
    stopAudio();

    if (mode === "practice") {
      updateProgressText();
      return;
    }

    beginQuizRound();
  }

  function switchPracticeMode(mode) {
    state.practiceMode = mode;
    setSegmentState("[data-practice-mode]", "data-practice-mode", mode);
    updateProgressText();
  }

  function playCurrentPrompt() {
    if (state.mainMode === "practice") return Promise.resolve();

    const target = currentQuizLetter();
    if (!target || state.quizComplete) return Promise.resolve();
    return playAudio(state.audio.find.get(target));
  }

  function handlePracticeTile(letter) {
    const audioMap = state.practiceMode === "name" ? state.audio.name : state.audio.sound;
    playAudio(audioMap.get(letter));
  }

  function advanceQuizAfterDelay() {
    window.setTimeout(() => {
      state.quizIndex += 1;
      state.guessesThisLetter = 0;

      if (state.quizIndex >= state.quizOrder.length) {
        finishQuiz();
        return;
      }

      updateProgressText();
      playCurrentPrompt();
    }, 550);
  }

  function resolveQuizLetter(letter, color, firstTryScored) {
    state.resolvedLetters.add(letter);
    if (firstTryScored) state.firstTryCorrect += 1;
    setTileLocked(letter, color);
    updateProgressText();
    advanceQuizAfterDelay();
  }

  function handleQuizTile(letter, tile) {
    if (state.quizComplete || state.resolvedLetters.has(letter)) return;

    const target = currentQuizLetter();
    if (!target) return;

    if (letter === target) {
      const attemptNumber = state.guessesThisLetter + 1;
      const color = attemptNumber === 1
        ? COLORS.firstTry
        : attemptNumber === 2
          ? COLORS.secondTry
          : COLORS.thirdTry;

      resolveQuizLetter(letter, color, attemptNumber === 1);
      return;
    }

    state.guessesThisLetter += 1;
    pulseTile(tile);

    if (state.guessesThisLetter >= 3) {
      resolveQuizLetter(target, COLORS.failed, false);
    }
  }

  function onTileClick(event) {
    const tile = event.target.closest(".letter-tile");
    if (!tile) return;

    const letter = tile.getAttribute("data-letter");
    if (state.mainMode === "practice") {
      handlePracticeTile(letter);
      return;
    }

    handleQuizTile(letter, tile);
  }

  function bindEvents() {
    document.querySelectorAll("[data-main-mode]").forEach((button) => {
      button.addEventListener("click", () => switchMainMode(button.getAttribute("data-main-mode")));
    });

    document.querySelectorAll("[data-practice-mode]").forEach((button) => {
      button.addEventListener("click", () => switchPracticeMode(button.getAttribute("data-practice-mode")));
    });

    ui.letterGrid.addEventListener("click", onTileClick);
    ui.playPromptBtn.addEventListener("click", () => playCurrentPrompt());
    ui.resetQuizBtn.addEventListener("click", beginQuizRound);
    ui.playAgainBtn.addEventListener("click", beginQuizRound);
    ui.closeModalBtn.addEventListener("click", closeScoreModal);
  }

  async function init() {
    renderTiles();
    bindEvents();
    updateControlVisibility();
    updateProgressText();
    await preloadAudio();
  }

  init();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(console.error);
    });
  }
})();
