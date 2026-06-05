/* ===========================================================================
   Landing page logic.
   Reads stories/manifest.json and renders a card for each game.
   To add a game: drop a JSON story in stories/ and add an entry to the
   manifest. No code changes needed here.
   =========================================================================== */

(async function () {
  const listEl = document.getElementById("game-list");
  const loadingEl = document.getElementById("loading");

  try {
    const res = await fetch("stories/manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();

    const games = Array.isArray(manifest.games) ? manifest.games : [];
    if (loadingEl) loadingEl.remove();

    if (games.length === 0) {
      listEl.innerHTML =
        '<p style="color: var(--text-dim)">No games yet. Add one to stories/manifest.json.</p>';
      return;
    }

    for (const game of games) {
      listEl.appendChild(renderCard(game));
    }
  } catch (err) {
    if (loadingEl) loadingEl.remove();
    listEl.innerHTML = `
      <div class="error">
        <strong>Couldn't load the game list.</strong>
        <p>${escapeHtml(String(err))}</p>
        <p>If you opened this file directly, run a local web server instead
        (e.g. <code>python3 -m http.server</code>) so the browser can fetch
        the story files.</p>
      </div>`;
  }

  function renderCard(game) {
    const card = document.createElement("div");
    card.className = "card";

    const tag = game.tag ? `<span class="tag">${escapeHtml(game.tag)}</span>` : "";
    const href = `game.html?story=${encodeURIComponent(game.id)}`;

    card.innerHTML = `
      ${tag}
      <h2>${escapeHtml(game.title || game.id)}</h2>
      <p>${escapeHtml(game.description || "")}</p>
      <a class="btn" href="${href}">Play</a>
    `;
    return card;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
