(() => {
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // --- Utility: DOM ---
  const $ = (sel) => document.querySelector(sel);
  const viewFlashcard = $("#viewFlashcard");
  const viewQuiz = $("#viewQuiz");
  const flashcardImg = $("#flashcardImg");
  const phonemeBtn = $("#phonemeBtn");
  const nextBtn = $("#nextBtn");
  const modeToggle = $("#modeToggle");
  const keyGrid = $("#keyGrid");
  const promptText = $("#promptText");
  const promptSpeaker = $("#promptSpeaker");
  const modal = $("#scoreModal");
  const scoreLine = $("#scoreLine");
  const playAgainBtn = $("#playAgainBtn");
  const closeModalBtn = $("#closeModalBtn");

  // --- Paths (case rules) ---
  const imagePath = (L) => `images/${L}.png`; // uppercase for images
  const nameAudio = (L) => `audio/letter ${L.toLowerCase()}.wav`;
  const phonemeAudio = (L) => `audio/${L.toLowerCase()}.wav`;
  const quizAudio = (L) => `audio/find ${L.toLowerCase()}.wav`;
  const endRoundAudio = () => `audio/great_job.wav`;

  // --- Audio Engine with fallback to TTS ---
  let currentAudio = null;
  function speakTTS(text){
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  function playSound(src, ttsFallbackText){
    return new Promise((resolve) => {
      try {
        if (currentAudio) { currentAudio.pause(); }
        const a = new Audio(src);
        currentAudio = a;
        a.onended = () => resolve();
        a.onerror = () => { if (ttsFallbackText) speakTTS(ttsFallbackText); resolve(); };
        a.play().catch(() => { if (ttsFallbackText) speakTTS(ttsFallbackText); resolve(); });
      } catch (e) {
        if (ttsFallbackText) speakTTS(ttsFallbackText);
        resolve();
      }
    });
  }

  // --- Fisher–Yates shuffle ---
  function shuffledDeck() {
    const arr = LETTERS.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // --- State ---
  const state = {
    mode: "flashcard",
    // Flashcards
    deck: shuffledDeck(),
    deckPos: 0,
    // Quiz
    quizDeck: shuffledDeck(),
    quizPos: 0,
    quizMisses: 0,
    quizCorrectThisRound: 0,
    autoplayQuizPrompt: true,
  };

  // --- Rendering: Flashcard ---
  function showFlashcard() {
    const L = state.deck[state.deckPos];
    flashcardImg.src = imagePath(L);
    flashcardImg.alt = `Letter ${L}`;
  }
  function nextFlashcard() {
    state.deckPos++;
    if (state.deckPos >= state.deck.length) {
      state.deck = shuffledDeck();
      state.deckPos = 0;
    }
    showFlashcard();
  }

  // --- Quiz Grid ---
  function buildGrid() {
    keyGrid.innerHTML = "";
    LETTERS.forEach((L, idx) => {
      const btn = document.createElement("button");
      btn.className = "key";
      btn.textContent = L;
      btn.setAttribute("role","gridcell");
      btn.setAttribute("data-letter", L);
      keyGrid.appendChild(btn);
    });
  }

  function setQuizTarget() {
    if (state.quizPos >= state.quizDeck.length) {
      // End round: show score modal
      const correct = state.quizCorrectThisRound;
      const pct = Math.round((correct/26)*100);
      scoreLine.textContent = `${correct} / 26 (${pct}%)`;
      modal.setAttribute("aria-hidden","false");
      playSound(endRoundAudio());
      // Reset for next round
      state.quizDeck = shuffledDeck();
      state.quizPos = 0;
      state.quizCorrectThisRound = 0;
      return;
    }
    state.quizMisses = 0;
    const target = state.quizDeck[state.quizPos];
    promptText.textContent = `Find ${target}`;
    if (state.autoplayQuizPrompt) playSound(quizAudio(target), `Find ${target}`);

    // reset key states
    keyGrid.querySelectorAll(".key").forEach(k => {
      k.classList.remove("correct","wrong","disabled");
    });
  }

  function onKeyTap(L, btn) {
    const target = state.quizDeck[state.quizPos];
    if (btn.classList.contains("disabled")) return;

    if (L === target) {
      btn.classList.add("correct");
      btn.classList.add("disabled");
      if (state.quizMisses < 3) {
        state.quizCorrectThisRound++;
      }
      state.quizPos++;
      setTimeout(setQuizTarget, 600);
    } else {
      state.quizMisses++;
      btn.classList.add("wrong");
      setTimeout(() => btn.classList.remove("wrong"), 150);
      if (state.quizMisses >= 3) {
        // Mark the correct target red and advance
        const targetBtn = [...keyGrid.querySelectorAll(".key")].find(b => b.textContent === target);
        if (targetBtn) {
          targetBtn.classList.add("disabled");
          targetBtn.style.background = "var(--danger)";
          targetBtn.style.color = "white";
          targetBtn.style.borderColor = "var(--danger)";
        }
        state.quizPos++;
        setTimeout(setQuizTarget, 600);
      }
    }
  }

  // --- Mode switching ---
  function showView(id) {
    [viewFlashcard, viewQuiz].forEach(v => { v.classList.remove("view--active"); v.hidden = true; });
    const el = (id === "flashcard") ? viewFlashcard : viewQuiz;
    el.classList.add("view--active"); el.hidden = false;
  }

  function setMode(mode) {
    state.mode = mode;
    if (mode === "flashcard") {
      modeToggle.textContent = "Quiz Mode";
      showView("flashcard");
      showFlashcard();
    } else {
      modeToggle.textContent = "Flashcards";
      showView("quiz");
      setQuizTarget();
    }
  }

  // --- Event wiring ---
  flashcardImg.addEventListener("click", () => {
    const L = state.deck[state.deckPos];
    playSound(nameAudio(L), L);
  });
  phonemeBtn.addEventListener("click", () => {
    const L = state.deck[state.deckPos];
    playSound(phonemeAudio(L), L);
  });
  nextBtn.addEventListener("click", nextFlashcard);

  modeToggle.addEventListener("click", () => {
    setMode(state.mode === "flashcard" ? "quiz" : "flashcard");
  });

  promptSpeaker.addEventListener("click", () => {
    const target = state.quizDeck[state.quizPos];
    playSound(quizAudio(target), `Find ${target}`);
  });

  keyGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".key");
    if (!btn) return;
    const L = btn.getAttribute("data-letter");
    onKeyTap(L, btn);
  });

  playAgainBtn.addEventListener("click", () => {
    modal.setAttribute("aria-hidden","true");
    // Start a fresh round immediately
    state.quizDeck = shuffledDeck();
    state.quizPos = 0;
    state.quizCorrectThisRound = 0;
    setQuizTarget();
    setMode("quiz");
  });
  closeModalBtn.addEventListener("click", () => modal.setAttribute("aria-hidden","true"));

  // Build grid once
  buildGrid();

  // Initial render
  showFlashcard();
  setMode("flashcard");

  // PWA: service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(console.error);
    });
  }
})();