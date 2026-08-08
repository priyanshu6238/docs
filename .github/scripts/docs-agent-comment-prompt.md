You are addressing review feedback on an existing Glific docs PR (glific/docs), PR #${PR_NUMBER}.

A reviewer commented:

${COMMENT_BODY}

${LOCATION_CONTEXT}

You are already checked out on that PR's branch, with the doc changes it introduced already
present in the working tree. Two related product repositories have been cloned, read-only, as
subdirectories of this working directory:
- repos/glific           (backend, Elixir)
- repos/glific-frontend  (frontend, React)

Your task:

1. Read the comment and figure out exactly what change it's asking for. If it references specific
   product behavior, verify it against the two repos before changing anything — don't guess.

2. Make the minimal edit(s) needed under docs/ to address the feedback, following this repo's
   CLAUDE.md conventions and matching the surrounding page's existing style.

3. If addressing the comment requires a new screenshot, insert a placeholder exactly as documented
   in CLAUDE.md: `![](SCREENSHOT:<short-slug>:<app-route-path>)` — a later automated step replaces
   it with a real image captured from the running app. Do not invent or guess an image path.

   If the target needs more than "load the route and shoot" — a dialog behind a button click, a
   dropdown selection, text typed into a field — also create
   `.github/screenshot-steps/<short-slug>.json` (same slug as the placeholder), an array of steps
   run in order after the route loads and before the screenshot:
   `{"click": "<selector>"}`, `{"fill": {"selector": "<selector>", "text": "<text>"}}`,
   `{"wait": "<selector>"}`, `{"waitText": "<visible text>"}`, `{"sleep": <ms>}`. Determine every
   selector by reading the actual component in `repos/glific-frontend/src/containers/.../*.tsx`
   and using a real `data-testid` you found there — never guess a selector you haven't seen in
   source. If the target has no stable selector available in source (e.g. a dynamically-generated
   canvas node in the flow editor), don't write a steps file likely to just fail at runtime — skip
   the screenshot and say why in your comment-response.md reply instead.

4. Write a one-to-three sentence reply to `comment-response.md` at the repo root, describing what
   you changed. If the comment didn't actually require a doc change (e.g. it was a question, the
   doc was already correct, or you determined the request isn't achievable — such as a screenshot
   for something that only appears after a UI interaction a route-based screenshot can't capture),
   explain that instead, and make no file changes. Write this as a direct reply to the commenter,
   not as a PR description.

   This step is mandatory, with no exceptions: whatever you conclude — an edit, a decision not to
   edit, or that the request can't be fulfilled — write it to comment-response.md before finishing.
   Never end your turn having only replied in your own final message; if comment-response.md
   doesn't exist when you finish, the commenter gets no reply at all.

Constraints:
- Only edit files under docs/, plus comment-response.md at the repo root and, if needed,
  .github/screenshot-steps/*.json. Do not touch workflow files, package.json,
  static/img/generated/, or anything under repos/.
- Do not invent product behavior you can't find evidence for in the two repos; if uncertain, say
  so in your reply rather than guessing confidently.
