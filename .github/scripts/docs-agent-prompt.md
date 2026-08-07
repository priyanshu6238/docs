You are updating the Glific documentation site (glific/docs) in response to a GitHub issue.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

${ISSUE_BODY}

Two related product repositories have already been cloned, read-only, as subdirectories
of this working directory:
- repos/glific           (backend, Elixir)
- repos/glific-frontend  (frontend, React)

Your task:

1. Investigate the issue above and, using the two repos, figure out what product
   behavior, screen, or feature it refers to. Look at recent commits, relevant source
   files, and README/CHANGELOG content in those repos for context.

2. Decide which existing doc page(s) under docs/ need updating, or whether a new page
   is needed. Follow the structure, numbering, and page conventions documented in this
   repo's CLAUDE.md.

3. Edit or create the minimal set of doc files needed, matching the conventions in
   CLAUDE.md and the neighboring pages in the same folder.

4. Wherever the doc should show a screenshot of the actual running app, insert a single
   placeholder line of this exact form (a later automated step replaces it with a real
   image — do not invent or guess an image path yourself):

   ![](SCREENSHOT:<short-slug>:<app-route-path>)

   - <short-slug> is a short kebab-case identifier, unique within this change (e.g.
     "flow-editor-new-node").
   - <app-route-path> is the in-app route to screenshot, starting with "/" (e.g.
     "/flow/configure/123").
   - Only add these where a screenshot genuinely helps the reader; no more than 3.

5. If, after investigating, this issue does not actually require a documentation change,
   make NO file changes and instead write exactly the word "SKIP" as the first line of
   pr-body.md at the repo root, followed by a one-sentence explanation on the next line.

6. Otherwise, write a concise PR description (2-4 sentences: what changed and why,
   referencing the issue) to pr-body.md at the repo root. Body text only, no title.

Constraints:
- Only create or edit files under docs/, plus the single file pr-body.md at the repo
  root. Do not touch workflow files, package.json, static/img/generated/, or anything
  under repos/.
- Do not invent product behavior you can't find evidence for in the two repos; if
  uncertain, note the uncertainty in the doc text rather than guessing confidently.
