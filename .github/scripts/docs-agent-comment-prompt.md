You are addressing review feedback on an existing Glific docs PR (glific/docs), PR #${PR_NUMBER}.

A reviewer commented:

${COMMENT_BODY}

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

4. Write a one-to-three sentence reply to `comment-response.md` at the repo root, describing what
   you changed. If the comment didn't actually require a doc change (e.g. it was a question, or
   the doc was already correct), explain that instead, and make no file changes. Write this as a
   direct reply to the commenter, not as a PR description.

Constraints:
- Only edit files under docs/, plus the single file comment-response.md at the repo root. Do not
  touch workflow files, package.json, static/img/generated/, or anything under repos/.
- Do not invent product behavior you can't find evidence for in the two repos; if uncertain, say
  so in your reply rather than guessing confidently.
