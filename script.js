(() => {
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const COLORS = {
    firstTry: "#0ff02a",
    secondTry: "#abf4b4",
    thirdTry: "#ffa7a7",
    failed: "#ae0303",
  };
  const TOP_ROW_LETTERS = LETTERS.slice(0, 13);
  const BOTTOM_ROW_LETTERS = LETTERS.slice(13);

  const $ = (selector) => document.querySelector(selector);

  const ui = {
    progressText: $("#progressText"),
    letterGrid: $("#letterGrid"),
    playPromptBtn: $("#playPromptBtn"),
    resetQuizBtn: $("#resetQuizBtn"),
    practiceControls: $("#practiceControls"),
    quizControls: $("#quizControls"),
    quizSetup: $("#quizSetup"),
    selectedLetters: $("#selectedLetters"),
    availableLetters: $("#availableLetters"),
    selectedCount: $("#selectedCount"),
    selectAllLettersBtn: $("#selectAllLettersBtn"),
    selectTopRowBtn: $("#selectTopRowBtn"),
    selectBottomRowBtn: $("#selectBottomRowBtn"),
    clearSelectedLettersBtn: $("#clearSelectedLettersBtn"),
    selectedZone: $("#selectedZone"),
    availableZone: $("#availableZone"),
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
    selectedQuizLetters: [],
    quizOrder: [],
    quizIndex: 0,
    guessesThisLetter: 0,
    firstTryCorrect: 0,
    resolvedLetters: new Set(),
    quizComplete: false,
    awaitingAdvance: false,
    audioUnlocked: false,
    player: null,
    audio: {
      sound: new Map(),
      name: new Map(),
      find: new Map(),
      correct: null,
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
    if (state.player) {
      state.player.pause();
      state.player.currentTime = 0;
    }
  }

  function normalizeAudioSrc(src) {
    return new URL(src, window.location.href).href;
  }

  function playAudio(src) {
    if (!src || !state.player) return Promise.resolve();
    const player = state.player;
    stopAudio();

    if (normalizeAudioSrc(player.getAttribute("src") || player.src || "") !== normalizeAudioSrc(src)) {
      player.src = src;
    }

    player.load();
    player.currentTime = 0;

    return new Promise((resolve) => {
      const done = () => {
        player.onended = null;
        player.onerror = null;
        resolve();
      };

      player.onended = done;
      player.onerror = done;
      player.play().catch(done);
    });
  }

  function preloadAudio() {
    LETTERS.forEach((letter) => {
      ["sound", "name", "find"].forEach((kind) => {
        state.audio[kind].set(letter, getAudioPath(kind, letter));
      });
    });

    ui.loadingOverlay.classList.remove("hidden");
    ui.loadingOverlay.setAttribute("aria-hidden", "false");
    ui.loadFill.style.width = "100%";

    return new Promise((resolve) => {
      state.audio.correct = "audio/correct.wav";
      state.audio.greatJob = "audio/great_job.wav";
      window.setTimeout(() => {
        ui.loadingOverlay.classList.add("hidden");
        ui.loadingOverlay.setAttribute("aria-hidden", "true");
        resolve();
      }, 120);
    });
  }

  function unlockAudio() {
    if (state.audioUnlocked || !state.player) return;
    const player = state.player;
    const unlockSrc = state.audio.correct || getAudioPath("sound", "A");
    player.src = unlockSrc;
    player.muted = true;
    player.playsInline = true;
    player.setAttribute("playsinline", "");

    player.play().then(() => {
      player.pause();
      player.currentTime = 0;
      player.muted = false;
      state.audioUnlocked = true;
    }).catch(() => {
      player.muted = false;
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

  function sortedSelectedLetters() {
    return LETTERS.filter((letter) => state.selectedQuizLetters.includes(letter));
  }

  function sortedAvailableLetters() {
    return LETTERS.filter((letter) => !state.selectedQuizLetters.includes(letter));
  }

  function updateProgressText() {
    if (state.mainMode === "practice") {
      const modeLabel = state.practiceMode === "name" ? "Letter Name" : "Letter Sound";
      ui.progressText.textContent = `Practice Mode: ${modeLabel}`;
      return;
    }

    if (state.selectedQuizLetters.length === 0) {
      ui.progressText.textContent = "Quiz Mode: choose letters to include";
      return;
    }

    const cleared = state.resolvedLetters.size;
    ui.progressText.textContent = `Quiz Progress: ${cleared}/${state.quizOrder.length || state.selectedQuizLetters.length} cleared | First-try score: ${state.firstTryCorrect}`;
  }

  function updateControlVisibility() {
    const inPractice = state.mainMode === "practice";
    document.body.classList.toggle("is-quiz-mode", !inPractice);
    ui.practiceControls.classList.toggle("hidden", !inPractice);
    ui.quizControls.classList.toggle("hidden", inPractice);
    ui.quizSetup.classList.toggle("hidden", inPractice);
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

  function updateBoardAvailability() {
    ui.letterGrid.querySelectorAll(".letter-tile").forEach((tile) => {
      const letter = tile.getAttribute("data-letter");
      const isAvailable = state.mainMode === "practice" || state.selectedQuizLetters.includes(letter);
      const isLocked = tile.classList.contains("is-locked");

      tile.classList.toggle("is-unavailable", !isAvailable);
      if (!isLocked) {
        tile.disabled = !isAvailable;
      }
    });

    const hasQuizLetters = state.selectedQuizLetters.length > 0;
    ui.playPromptBtn.disabled = state.mainMode === "quiz" && !hasQuizLetters;
    ui.resetQuizBtn.disabled = state.mainMode === "quiz" && !hasQuizLetters;
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
      button.textContent = `${letter}${letter.toLowerCase()}`;
      button.setAttribute("role", "gridcell");
      button.setAttribute("data-letter", letter);
      ui.letterGrid.appendChild(button);
    });
  }

  function resetTiles() {
    ui.letterGrid.querySelectorAll(".letter-tile").forEach((tile) => {
      tile.disabled = false;
      tile.classList.remove("is-locked", "is-wrong", "is-unavailable");
      tile.style.background = "";
      tile.style.borderColor = "";
      tile.style.color = "";
    });
    updateBoardAvailability();
  }

  function clearMissedTiles() {
    ui.letterGrid.querySelectorAll(".letter-tile:not(.is-locked)").forEach((tile) => {
      tile.classList.remove("is-wrong");
      tile.style.background = "";
      tile.style.borderColor = "";
      tile.style.color = "";
    });
  }

  function createPickerChip(letter) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mini-letter-chip";
    button.textContent = `${letter}${letter.toLowerCase()}`;
    button.setAttribute("data-letter", letter);
    button.setAttribute("draggable", "true");
    return button;
  }

  function renderQuizPicker() {
    ui.selectedLetters.innerHTML = "";
    ui.availableLetters.innerHTML = "";

    sortedSelectedLetters().forEach((letter) => ui.selectedLetters.appendChild(createPickerChip(letter)));
    sortedAvailableLetters().forEach((letter) => ui.availableLetters.appendChild(createPickerChip(letter)));
    ui.selectedCount.textContent = String(state.selectedQuizLetters.length);
  }

  function moveQuizLetter(letter, targetZone) {
    const isSelected = state.selectedQuizLetters.includes(letter);

    if (targetZone === "selected" && !isSelected) {
      state.selectedQuizLetters.push(letter);
    }

    if (targetZone === "available" && isSelected) {
      state.selectedQuizLetters = state.selectedQuizLetters.filter((item) => item !== letter);
    }

    state.selectedQuizLetters = sortedSelectedLetters();
    renderQuizPicker();

    if (state.mainMode === "quiz") {
      beginQuizRound();
    }
  }

  function setSelectedLetters(letters) {
    state.selectedQuizLetters = LETTERS.filter((letter) => letters.includes(letter));
    renderQuizPicker();
    updateBoardAvailability();

    if (state.mainMode === "quiz") {
      beginQuizRound();
    } else {
      updateProgressText();
    }
  }

  function showScoreModal() {
    const score = state.firstTryCorrect;
    const total = state.quizOrder.length || state.selectedQuizLetters.length;
    const isPerfect = total > 0 && score === total;

    ui.scoreTitle.textContent = isPerfect ? `Great job, ${score}/${total}` : "Quiz complete";
    ui.scoreLine.textContent = isPerfect
      ? `You got ${score}/${total} correct on the first try.`
      : `You got ${score} out of ${total} letters on the first try.`;

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
    state.quizOrder = shuffle(state.selectedQuizLetters);
    state.quizIndex = 0;
    state.guessesThisLetter = 0;
    state.firstTryCorrect = 0;
    state.quizComplete = false;
    state.awaitingAdvance = false;
    state.resolvedLetters = new Set();
    resetTiles();
    updateProgressText();
    updateBoardAvailability();
    if (state.quizOrder.length > 0) {
      playCurrentPrompt();
    }
  }

  function switchMainMode(mode) {
    state.mainMode = mode;
    setSegmentState("[data-main-mode]", "data-main-mode", mode);
    updateControlVisibility();
    closeScoreModal();
    stopAudio();
    clearMissedTiles();
    resetTiles();

    if (mode === "practice") {
      updateProgressText();
      updateBoardAvailability();
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

  function advanceQuizAfterDelay(delay = 550) {
    window.setTimeout(() => {
      clearMissedTiles();
      state.quizIndex += 1;
      state.guessesThisLetter = 0;
      state.awaitingAdvance = false;

      if (state.quizIndex >= state.quizOrder.length) {
        finishQuiz();
        return;
      }

      updateProgressText();
      playCurrentPrompt();
    }, delay);
  }

  function resolveQuizLetter(letter, color, firstTryScored, playCorrectCue) {
    state.awaitingAdvance = true;
    state.resolvedLetters.add(letter);
    if (firstTryScored) state.firstTryCorrect += 1;
    setTileLocked(letter, color);
    updateProgressText();

    if (playCorrectCue) {
      playAudio(state.audio.correct).finally(() => advanceQuizAfterDelay(180));
      return;
    }

    advanceQuizAfterDelay();
  }

  function handleQuizTile(letter, tile) {
    if (state.quizComplete || state.awaitingAdvance || state.resolvedLetters.has(letter)) return;

    const target = currentQuizLetter();
    if (!target) return;

    if (letter === target) {
      const attemptNumber = state.guessesThisLetter + 1;
      const color = attemptNumber === 1
        ? COLORS.firstTry
        : attemptNumber === 2
          ? COLORS.secondTry
          : COLORS.thirdTry;

      resolveQuizLetter(letter, color, attemptNumber === 1, true);
      return;
    }

    state.guessesThisLetter += 1;
    pulseTile(tile);

    if (state.guessesThisLetter >= 3) {
      resolveQuizLetter(target, COLORS.failed, false, false);
    }
  }

  function bindPressedFeedback() {
    document.addEventListener("pointerdown", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      unlockAudio();
      button.classList.add("is-pressed");
    });

    ["pointerup", "pointercancel"].forEach((eventName) => {
      document.addEventListener(eventName, () => {
        document.querySelectorAll("button.is-pressed").forEach((button) => {
          button.classList.remove("is-pressed");
        });
      });
    });
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
    bindPressedFeedback();

    document.querySelectorAll("[data-main-mode]").forEach((button) => {
      button.addEventListener("click", () => switchMainMode(button.getAttribute("data-main-mode")));
    });

    document.querySelectorAll("[data-practice-mode]").forEach((button) => {
      button.addEventListener("click", () => switchPracticeMode(button.getAttribute("data-practice-mode")));
    });

    ui.letterGrid.addEventListener("click", onTileClick);
    ui.playPromptBtn.addEventListener("click", () => playCurrentPrompt());
    ui.resetQuizBtn.addEventListener("click", beginQuizRound);
    ui.selectAllLettersBtn.addEventListener("click", () => setSelectedLetters(LETTERS));
    ui.selectTopRowBtn.addEventListener("click", () => setSelectedLetters(TOP_ROW_LETTERS));
    ui.selectBottomRowBtn.addEventListener("click", () => setSelectedLetters(BOTTOM_ROW_LETTERS));
    ui.clearSelectedLettersBtn.addEventListener("click", () => setSelectedLetters([]));
    ui.playAgainBtn.addEventListener("click", beginQuizRound);
    ui.closeModalBtn.addEventListener("click", closeScoreModal);

    [ui.selectedZone, ui.availableZone].forEach((zone) => {
      zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        zone.classList.add("is-over");
      });

      zone.addEventListener("dragleave", () => {
        zone.classList.remove("is-over");
      });

      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("is-over");
        const letter = event.dataTransfer.getData("text/plain");
        const targetZone = zone.getAttribute("data-zone");
        if (letter && targetZone) moveQuizLetter(letter, targetZone);
      });
    });

    [ui.selectedLetters, ui.availableLetters].forEach((wrap) => {
      wrap.addEventListener("dragstart", (event) => {
        const chip = event.target.closest(".mini-letter-chip");
        if (!chip) return;
        event.dataTransfer.setData("text/plain", chip.getAttribute("data-letter"));
      });

      wrap.addEventListener("click", (event) => {
        const chip = event.target.closest(".mini-letter-chip");
        if (!chip) return;
        const letter = chip.getAttribute("data-letter");
        const targetZone = wrap === ui.selectedLetters ? "available" : "selected";
        moveQuizLetter(letter, targetZone);
      });
    });
  }

  async function init() {
    state.player = new Audio();
    state.player.preload = "auto";
    state.player.playsInline = true;
    state.player.setAttribute("playsinline", "");
    renderTiles();
    renderQuizPicker();
    bindEvents();
    updateControlVisibility();
    updateProgressText();
    updateBoardAvailability();
    await preloadAudio();
  }

  init();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(console.error);
    });
  }
})();
