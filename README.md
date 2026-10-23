# Whist v1.0.0

The complete Whist website for GitHub Pages, with registration, history,
statistics, and administration. This archive retains the directory structure
and functionality of the supplied `whist-main.zip`.

## Release changes

- All displayed page versions are **v1.0.0**.
- Local CSS, JavaScript, and module cache-busting versions use **1.0.0**.
- The history slider beneath Pointdiagram is now labeled **Stillingsudvikling**,
  including accessibility and error messages. Internal element IDs and
  module filenames stay unchanged to preserve functionality.
- No scoring rules, database functions, player records, or Supabase settings
  were changed.

## Deployment

Copy the contents of the `whist-main/` directory into the root of your
GitHub Pages repository (or retain the same directory layout as before).
Preserve your existing deployment settings and Supabase project.

This version update requires **no new SQL migrations**. Existing migrations
in `sql/` are included for reference or initial project setup; do not rerun
them just to update the website version.

For standard GitHub Pages deployment, the root should contain
`index.html`, `historik.html`, `statistik.html`, `administrering.html`,
and `assets/`.

## Checks

Run `node --test tests/*.test.js tests/*.test.mjs` with Node.js to exercise
the pure-model test suite. The repository also contains older test scripts; the
`npm test` command currently stops in a legacy CommonJS test that evaluates an
ES module as a classic script, an issue present in the supplied ZIP.
Testing against a live Supabase project requires your own deployed environment.
