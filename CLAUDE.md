# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

`@webship-js/drupal-core-steps`: a step pack for webship-js (Playwright and Cucumber-js). It is a plugin, not a standalone tool. It ships step definitions for Drupal core sites and a helpers module that other Drupal packs require (`@webship-js/drupal-cms-steps`). The repository is also a working webship-js project: `tests/features/*.feature` runs the pack against a real Drupal 11 site and a real Drupal 12 site in CI, and the features ship in the npm package as examples.

## Commands

Run from the repository root.

```bash
tests/seed/build-site.sh 11   # build the fixture site with DDEV (or 12)
npm test                      # the suite (LAUNCH_URL=http://drupal-core-steps-site.ddev.site)
npm run test:dry              # --dry-run: undefined and ambiguous steps, no browser
npm run test:examples         # JSDoc examples and feature steps against the definitions, no browser
npm run test:provisioning     # the optional provisioning feature, with its own registry
npm run test:headed           # a visible browser
npx cucumber-js --config cucumber.js tests/features/login.feature
npx cucumber-js --config cucumber.js --name "some scenario name"
```

There is no lint or typecheck script. `tsx/cjs` lets `playwright.config.ts` load at require time.

## Layout

- `tests/step-definitions/drupal-helpers.js`: no steps. Named selectors, page facts (`drupalSettings`), messages, the users registry, the in-page submit, field and editor helpers, session and visitor status.
- `tests/step-definitions/drupal-defaults.js`: no steps. Two hooks: the selector preset and the assets folder.
- `tests/step-definitions/drupal-core.steps.js`: named pages and forms, page state, messages, content, sessions, search, contact, error pages, cache headers, listings, editor, media library.
- `drupal-access.steps.js` (access control, PHP errors), `drupal-form.steps.js` (form sections, the form time limit, AJAX, confirmation forms, editor links, created content, terms, menu links), `drupal-content-forms.steps.js` (content types, Save, required fields, moderation), `drupal-site.steps.js` (modules, themes, roles, permissions, status report, menus, front page, canonical URL, meta tags), `drupal-navigation.steps.js` (Navigation module), `drupal-layout-builder.steps.js`.
- `drupal-users.steps.js`: OPTIONAL provisioning steps. See "Accounts" below.
- `tests/selectors/drupal-core.json`: the named-selector preset.
- `tests/seed/`: `build-site.sh` (the whole site build, shared by CI and local runs), `drupal-12-site.php` (what Drupal 12 has no recipe for), `standard-fixtures.php` (fixtures for both versions).
- `drupal/`: only `.ddev/config.yaml` is committed; the code base is generated.

## Rules for steps

- Every step is a regex with the `(I |we )*` pronoun group where a pronoun fits; no Cucumber Expressions. One definition covers both polarities with `( not)*`.
- Every step has a JSDoc block with at least five `Example #n:` lines; each example must match its own definition and no other (`npm run test:examples` checks this, and that every feature step resolves to exactly one definition).
- Find things in this order: what core states whatever the theme (`drupalSettings`, ARIA roles and labels, `data-drupal-*`, Form API ids, the HTTP answer), then the classes of core's themes, then a named selector a project can override (`namedSelector(world, name, fallback)`). A new class-only lookup needs a named selector.
- Errors go through webship-js's `friendly({ message, cause, hint })`: say what was expected, what the page shows, and what to do.
- No fixed sleeps; use `smartSettle`, `waitForPageLoad` or a polled check (`pollUntil`). The one deliberate wait is `I wait out the form time limit`.
- Submit through `submitInPage` with the most specific selector first. `#edit-submit` is not unique on a Drupal page (a search block has its own).
- A scenario leaves the site as it found it: delete what it created, and start by removing what an interrupted run may have left.
- The same feature must pass on Drupal 11 and Drupal 12; tag a scenario `@drupal11` or `@drupal12` only when it cannot apply to the other.
- Phrasing in plain English. A step phrase never carries the platform's name ("Drupal"); the name may only be an argument a scenario passes (`the site generator should be "Drupal 11"`).

## Accounts

Accounts are configuration: the site build creates them (`build-site.sh`, with drush), `cucumber.js` names them in `worldParameters.users`, and features only log in. No feature of the default run creates or deletes a user. `I add the testing users` and `I delete the testing users` stay for projects that want them; they run only in `optional-provisioning-users.feature` (`@provisioning`, its own profile and registry).

## Two traps

1. webship-js's `the response status code should be <n>` requests the URL without the session cookies, so it answers as a visitor. For a logged-in session use `the page should return HTTP status <n>` or `I should be allowed access to "<path>"`.
2. Against DDEV's HTTPS URL that same webship-js step needs `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"`; CI uses the HTTP URL.

## Conventions

- `2.0.x` is the active branch. Every change: one issue, one pull request, merged on a green run. No direct commits.
- Releases are tags on `2.0.x` and a publish to npm; `package.json` `files` lists what ships.
