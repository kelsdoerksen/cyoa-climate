# cyoa-climate

Choose-your-own-adventure games about real climate use cases — flood planning,
disaster risk management, wildfire mitigation, and more. Pick a character, make
decisions with the information that character would have, and see how different
paths lead to different outcomes.

It's a static site (plain HTML/CSS/JavaScript, no build step) designed to be
hosted for free on **GitHub Pages**.

## Project layout

```
index.html            Landing page — lists every game
game.html             Generic game player (loads a story by ?story=<id>)
css/styles.css        Shared styles
js/main.js            Builds the landing page from the manifest
js/game.js            The game engine (character select + branching scenes)
stories/
  manifest.json       The list of games shown on the landing page
  test-game.json      The first game (hurricane prep)
  _TEMPLATE.json      Copy this to start a new story
.nojekyll             Tells GitHub Pages to serve files as-is
```

The engine is fully data-driven: it knows nothing about any specific story.
Everything a game needs lives in its JSON file.

## Run it locally

Browsers block `fetch()` of local files, so don't open `index.html` directly —
serve the folder instead:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

(Any static server works: `npx serve`, the VS Code "Live Server" extension, etc.)

## Add a new game

Two steps, no code:

1. **Create the story.** Copy `stories/_TEMPLATE.json` to
   `stories/<your-id>.json` and write your story. The format:

   - `title`, `tag`, `intro` — shown on the character-select screen.
   - `characters` — an array; each has an `id`, `name`, `role`, `description`,
     and a `start` node id. The first scene a player sees depends on which
     character they pick, so each character can have a completely different
     storyline (they can also share nodes).
   - `nodes` — a map of `node id → node`. Every node has `title` (optional)
     and `text` (a string with blank lines between paragraphs, or an array of
     strings). There are three kinds of node:
     - **Scene** — has `choices`, an array of
       `{ "text": ..., "target": <node id> }`.
     - **Dice / chance** — has a `roll` object for a compounding-risk gamble.
       The player clicks an animated die; faces in `badFaces` send them to
       `badTarget` (the hazard strikes), any other face to `goodTarget`:
       ```json
       "roll": {
         "sides": 6,
         "prompt": "Click the die. If it lands on a 2 or a 4, the levee fails.",
         "badFaces": [2, 4],
         "badTarget": "levee_breaks",
         "goodTarget": "levee_holds",
         "goodText": "Shown on a safe roll.",
         "badText": "Shown when the risk hits."
       }
       ```
       Two bad faces on a 6-sided die is a ~33% chance; the player sees the
       odds. Set `badFaces` to tune the probability.
     - **Ending** — has `"ending": true` and an `outcome` of `"success"`,
       `"mixed"`, or `"failure"` (controls the colored badge).
   - Every `start`, `target`, `goodTarget`, and `badTarget` must match a key
     in `nodes`.

2. **List it.** Add an entry to the `games` array in `stories/manifest.json`:

   ```json
   { "id": "<your-id>", "title": "...", "tag": "...", "description": "..." }
   ```

   The `id` must match the JSON filename (without `.json`).

Reload the landing page and your game appears.

## Deploy to GitHub Pages

Push to GitHub, then in the repo go to **Settings → Pages** and set the source
to the `main` branch (root). Your site goes live at
`https://<username>.github.io/cyoa-climate/`.
