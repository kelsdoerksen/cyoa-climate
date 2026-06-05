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
    titleEl.textContent = state.story.title || "";
    renderCharacterSelect();
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

    stageEl.innerHTML = `
      <section class="scene">
        <h2>${escapeHtml(state.story.title || "")}</h2>
        <div class="body"><p>${escapeHtml(
          state.story.intro || "Choose your character to begin."
        )}</p></div>
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
    goToNode(character.start);
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
