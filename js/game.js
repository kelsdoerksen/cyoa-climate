/* ===========================================================================
   Game engine.
   Loads a story JSON (?story=<id>) and runs it:
     1. Character selection screen.
     2. Scene-by-scene navigation through "nodes" via choices.
     3. Ending screens with an outcome badge + replay / menu controls.

   The engine is data-driven — it knows nothing about any particular story.
   See stories/_TEMPLATE.json for the story file format.
   =========================================================================== */

(function () {
  const stageEl = document.getElementById("stage");
  const titleEl = document.getElementById("story-title");

  const storyId = new URLSearchParams(window.location.search).get("story");

  // Runtime state for the current playthrough.
  const state = {
    story: null,
    character: null, // selected character object
    mode: null, // active scenario mode id (null if the story has no modes)
    history: [], // node ids visited (for the Back button)
  };

  if (!storyId) {
    renderError(
      "No story specified.",
      'Open a game from the <a href="index.html">games list</a>.'
    );
    return;
  }

  init();

  async function init() {
    try {
      const res = await fetch(`stories/${encodeURIComponent(storyId)}.json`, {
        cache: "no-cache",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.story = await res.json();
    } catch (err) {
      renderError(
        "Couldn't load this story.",
        `${escapeHtml(String(err))}<br />If you opened this file directly,
         serve the folder with a local web server
         (e.g. <code>python3 -m http.server</code>).`
      );
      return;
    }

    document.title = `${state.story.title} — Climate Adventure`;
    titleEl.textContent = state.story.title ? `· ${state.story.title}` : "";
    setupModes();
    renderCharacterSelect();
  }

  /* ---- Scenario modes -----------------------------------------------------*/

  // Builds the orange scenario dropdown in the top bar (only when the story
  // declares more than one mode). Switching mode restarts the current
  // character's playthrough in that mode, or just updates the character-select
  // screen if no character has been chosen yet.
  function setupModes() {
    const modes = state.story.modes || [];
    const switchEl = document.getElementById("mode-switch");

    if (modes.length < 2) {
      state.mode = modes[0] ? modes[0].id : null;
      switchEl.hidden = true;
      return;
    }

    state.mode = modes[0].id;
    switchEl.hidden = false;
    switchEl.innerHTML = `
      <span class="mode-switch-label">Scenario</span>
      <span class="mode-select-wrap">
        <select id="mode-select" aria-label="Choose scenario mode">
          ${modes
            .map(
              (m) =>
                `<option value="${escapeHtml(m.id)}" title="${escapeHtml(
                  m.description || ""
                )}">${escapeHtml(m.label || m.id)}</option>`
            )
            .join("")}
        </select>
      </span>`;

    const sel = document.getElementById("mode-select");
    sel.addEventListener("change", () => {
      state.mode = sel.value;
      if (state.character) {
        startAs(state.character); // re-run this character in the new mode
      } else {
        renderCharacterSelect(); // refresh the mode description
      }
    });
  }

  function currentMode() {
    return (state.story.modes || []).find((m) => m.id === state.mode) || null;
  }

  function startNodeFor(character) {
    if (character.starts) {
      return (
        (state.mode && character.starts[state.mode]) ||
        Object.values(character.starts)[0]
      );
    }
    return character.start;
  }

  /* ---- Character selection ------------------------------------------------*/

  function renderCharacterSelect() {
    state.character = null;
    state.history = [];

    const characters = state.story.characters || [];

    const cards = characters
      .map(
        (c, i) => `
        <button class="character-card" data-index="${i}">
          <div class="pick">Choose</div>
          <h3>${escapeHtml(c.name || "Character")}</h3>
          <div class="role">${escapeHtml(c.role || "")}</div>
          <p>${escapeHtml(c.description || "")}</p>
        </button>`
      )
      .join("");

    const mode = currentMode();
    const modeNote = mode
      ? `<p class="mode-note"><span class="mode-note-tag">${escapeHtml(
          mode.label
        )}</span> ${escapeHtml(mode.description || "")}</p>`
      : "";

    stageEl.innerHTML = `
      <section class="scene">
        <h2>${escapeHtml(state.story.title || "")}</h2>
        <div class="body"><p>${escapeHtml(
          state.story.intro || "Choose your character to begin."
        )}</p></div>
        ${modeNote}
        <div class="character-grid">${cards}</div>
      </section>`;

    stageEl.querySelectorAll(".character-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.index);
        startAs(characters[idx]);
      });
    });

    scrollToTop();
  }

  function startAs(character) {
    state.character = character;
    state.history = [];
    goToNode(startNodeFor(character));
  }

  /* ---- Scene rendering ----------------------------------------------------*/

  function goToNode(nodeId, recordHistory = true) {
    const node = (state.story.nodes || {})[nodeId];
    if (!node) {
      renderError(
        "Story error.",
        `Node "<code>${escapeHtml(nodeId)}</code>" was not found in this story.`
      );
      return;
    }

    if (recordHistory) state.history.push(nodeId);

    if (node.ending) {
      renderEnding(node);
    } else if (node.roll) {
      renderRoll(node);
    } else {
      renderScene(node);
    }
    scrollToTop();
  }

  function renderScene(node) {
    const choices = (node.choices || [])
      .map(
        (ch, i) =>
          `<button class="choice-btn" data-target="${escapeHtml(
            ch.target
          )}" data-index="${i}">${escapeHtml(ch.text)}</button>`
      )
      .join("");

    const backBtn =
      state.history.length > 1
        ? `<button class="btn ghost" id="back-btn">&larr; Back</button>`
        : "";

    stageEl.innerHTML = `
      <section class="scene">
        ${node.title ? `<h2>${escapeHtml(node.title)}</h2>` : ""}
        <div class="body">${paragraphs(node.text)}</div>
        <div class="choices">${choices}</div>
        <div class="controls">
          ${backBtn}
          <button class="btn ghost" id="restart-btn">Restart story</button>
        </div>
        ${playedAs()}
      </section>`;

    stageEl.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => goToNode(btn.dataset.target));
    });
    wireControls();
  }

  function renderEnding(node) {
    const outcome = node.outcome || "neutral";
    const label =
      { success: "Success", mixed: "Mixed outcome", failure: "Setback" }[
        outcome
      ] || "The End";
    const badgeClass =
      {
        success: "outcome-success",
        mixed: "outcome-mixed",
        failure: "outcome-failure",
      }[outcome] || "outcome-mixed";

    stageEl.innerHTML = `
      <section class="scene">
        <span class="outcome-badge ${badgeClass}">${escapeHtml(label)}</span>
        ${node.title ? `<h2>${escapeHtml(node.title)}</h2>` : ""}
        <div class="body">${paragraphs(node.text)}</div>
        <div class="controls">
          <button class="btn" id="replay-char-btn">Try a different path</button>
          <button class="btn secondary" id="replay-story-btn">
            Pick a different character
          </button>
          <a class="btn ghost" href="index.html">All games</a>
        </div>
        ${playedAs()}
      </section>`;

    document
      .getElementById("replay-char-btn")
      .addEventListener("click", () => startAs(state.character));
    document
      .getElementById("replay-story-btn")
      .addEventListener("click", renderCharacterSelect);
  }

  /* ---- Dice / chance nodes ------------------------------------------------*/

  // A "roll" node presents a clickable die. Faces listed in roll.badFaces send
  // the player to roll.badTarget (the compounding risk happens); any other face
  // sends them to roll.goodTarget. The result is genuinely random.
  function renderRoll(node) {
    const roll = node.roll || {};
    const sides = roll.sides || 6;
    const badFaces = roll.badFaces || [];
    const oddsPct = Math.round((badFaces.length / sides) * 100);

    const backBtn =
      state.history.length > 1
        ? `<button class="btn ghost" id="back-btn">&larr; Back</button>`
        : "";

    stageEl.innerHTML = `
      <section class="scene">
        ${node.title ? `<h2>${escapeHtml(node.title)}</h2>` : ""}
        <div class="body">${paragraphs(node.text)}</div>
        <div class="dice-area">
          <button class="die" id="die" type="button" aria-label="Roll the die">
            ${renderDieFace(Math.min(sides, 6))}
          </button>
          <p class="roll-prompt" id="roll-prompt">${escapeHtml(
            roll.prompt || "Click the die to roll."
          )}</p>
          <p class="roll-odds">Land on ${formatList(
            badFaces
          )} and the risk hits — about ${oddsPct}% (${badFaces.length} in ${sides}).</p>
          <div id="roll-result"></div>
        </div>
        <div class="controls">
          ${backBtn}
          <button class="btn ghost" id="restart-btn">Restart story</button>
        </div>
        ${playedAs()}
      </section>`;

    wireControls();

    const dieEl = document.getElementById("die");
    let rolled = false;
    dieEl.addEventListener("click", () => {
      if (rolled) return;
      rolled = true;
      doRoll(node, sides, badFaces);
    });
  }

  function doRoll(node, sides, badFaces) {
    const dieEl = document.getElementById("die");
    const promptEl = document.getElementById("roll-prompt");
    const resultEl = document.getElementById("roll-result");

    const finalValue = 1 + Math.floor(Math.random() * sides);
    const isBad = badFaces.includes(finalValue);

    dieEl.classList.add("rolling");
    dieEl.disabled = true;
    promptEl.textContent = "Rolling…";

    let ticks = 0;
    const totalTicks = 14;
    const interval = setInterval(() => {
      const v = 1 + Math.floor(Math.random() * sides);
      dieEl.innerHTML = renderDieFace(v);
      if (++ticks >= totalTicks) {
        clearInterval(interval);
        dieEl.classList.remove("rolling");
        dieEl.innerHTML = renderDieFace(finalValue);
        revealRoll(node, finalValue, isBad, promptEl, resultEl);
      }
    }, 80);
  }

  function revealRoll(node, value, isBad, promptEl, resultEl) {
    const roll = node.roll || {};
    const target = isBad ? roll.badTarget : roll.goodTarget;
    const msg = isBad
      ? roll.badText || "The risk hits."
      : roll.goodText || "You're in the clear.";

    promptEl.textContent = `You rolled a ${value}.`;
    resultEl.innerHTML = `
      <p class="roll-result ${isBad ? "bad" : "good"}">${escapeHtml(msg)}</p>
      <button class="btn" id="roll-continue" type="button">Continue</button>`;
    document
      .getElementById("roll-continue")
      .addEventListener("click", () => goToNode(target));
  }

  // Inline SVG die face. Pip layouts for 1–6; a numeral for anything larger.
  function renderDieFace(value) {
    const pos = {
      TL: [28, 28], TR: [72, 28],
      ML: [28, 50], MC: [50, 50], MR: [72, 50],
      BL: [28, 72], BR: [72, 72],
    };
    const layouts = {
      1: ["MC"],
      2: ["TL", "BR"],
      3: ["TL", "MC", "BR"],
      4: ["TL", "TR", "BL", "BR"],
      5: ["TL", "TR", "MC", "BL", "BR"],
      6: ["TL", "ML", "BL", "TR", "MR", "BR"],
    };
    const layout = layouts[value];
    const inner = layout
      ? layout
          .map((k) => `<circle cx="${pos[k][0]}" cy="${pos[k][1]}" r="9" class="pip" />`)
          .join("")
      : `<text x="50" y="50" class="die-number">${value}</text>`;
    return `<svg viewBox="0 0 100 100" class="die-face" aria-hidden="true">
      <rect x="6" y="6" width="88" height="88" rx="18" />${inner}</svg>`;
  }

  function formatList(arr) {
    if (arr.length === 0) return "no faces";
    if (arr.length === 1) return `a ${arr[0]}`;
    if (arr.length === 2) return `a ${arr[0]} or ${arr[1]}`;
    return "a " + arr.slice(0, -1).join(", a ") + ", or a " + arr[arr.length - 1];
  }

  /* ---- Controls -----------------------------------------------------------*/

  function wireControls() {
    const back = document.getElementById("back-btn");
    if (back) {
      back.addEventListener("click", () => {
        state.history.pop(); // current node
        const prev = state.history[state.history.length - 1];
        goToNode(prev, false);
      });
    }
    const restart = document.getElementById("restart-btn");
    if (restart) {
      restart.addEventListener("click", () => startAs(state.character));
    }
  }

  function playedAs() {
    if (!state.character) return "";
    return `<p class="played-as">Playing as <strong>${escapeHtml(
      state.character.name
    )}</strong> — ${escapeHtml(state.character.role || "")}</p>`;
  }

  /* ---- Helpers ------------------------------------------------------------*/

  function renderError(heading, detail) {
    stageEl.innerHTML = `
      <div class="error">
        <strong>${escapeHtml(heading)}</strong>
        <p>${detail}</p>
      </div>`;
  }

  // Turn a string (with \n\n breaks) OR an array of strings into <p> blocks.
  function paragraphs(text) {
    const parts = Array.isArray(text)
      ? text
      : String(text || "").split(/\n\n+/);
    return parts
      .filter((p) => p.trim() !== "")
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
})();
