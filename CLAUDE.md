# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **webship-js plugin** (Playwright + Cucumber-js BDD), not standalone. It ships one step-definition file, `tests/step-definitions/drupal-core.steps.js`, covering markup **Drupal core itself** renders (body classes, Form API IDs, core templates, CKEditor 5, the media library), so scenarios work against any Drupal core site regardless of theme, plus `tests/step-definitions/drupal-helpers.js`, a non-step module with the shared plumbing (users registry, robust in-page submit, field resolution, CKEditor data writing, checkbox state, session-aware status) that downstream packs such as `@webship-js/drupal-cms-steps` require.

The repo is also a working webship-js project itself: `tests/features/*.feature` runs the step-pack against a real self-hosted Drupal instance and serves as the reference example for downstream users.

## Commands

Run from repo root, not `drupal/`.

```bash
npm test                # full suite
npm run test:dry        # --dry-run, checks for undefined/ambiguous steps, no browser
npm run test:headed     # headed browser
npm run test:chromium   # force a browser (also: test:firefox, test:webkit)
```

Single file/scenario:
```bash
npx cucumber-js --config cucumber.js tests/features/login.feature
npx cucumber-js --config cucumber.js --name "some scenario name"
```

No lint/typecheck script. `tsx/cjs` just lets step definitions use TS syntax at require-time.

### Fixture Drupal site (needed before running tests locally)

Tests hit `LAUNCH_URL`, a Drupal core Standard-profile install run via DDEV in `drupal/`, seeded with the minimum the steps need (two core recipes, an `editor` account, one article and one media item; see README "Running this repo's own test suite"). `drupal/web`, `vendor`, `composer.json` are generated fresh each time and gitignored; only `drupal/.ddev/config.yaml` and `drupal/seed/standard-fixtures.php` are committed.

```bash
cd drupal
ddev start
ddev composer create-project drupal/recommended-project
ddev composer require drush/drush --no-interaction
ddev drush site-install standard --account-name=admin --account-pass=admin --yes
ddev drush recipe core/recipes/article_content_type
ddev drush recipe core/recipes/image_media_type
ddev drush user:create editor --mail=editor@example.com --password=editor
ddev drush user:role:add content_editor editor
ddev drush php:script seed/standard-fixtures.php
ddev drush cache:rebuild
cd ..

npm install
npx playwright install --with-deps chromium
LAUNCH_URL=http://drupal-core-steps-site.ddev.site npm test
```

Point at a different site with `LAUNCH_URL=https://your-site.example npm test`.

CI (`.github/workflows/test.yml`) runs the same bootstrap on push/PR to `2.0.x`, then `test:dry` before `npm test`, uploading `tests/reports/cucumber_report.json` and `screenshots/`.

## Architecture

- **`tests/step-definitions/drupal-core.steps.js`** — the whole product. One file, sectioned by area (named routes/forms, layout/toolbar/breadcrumb, content pages, authentication, search, contact, error pages). Each step has a JSDoc block above it explaining which core convention it targets plus at least 5 Gherkin examples, each exercising a *different* axis of the pattern — match that pattern for new steps. Regexes are loose/forgiving (optional pronoun groups, optional articles) for natural phrasing, and one definition covers both polarities via a `( not)*` group rather than two steps.
- Steps **compose with webship-js's built-ins** (`webship-js/tests/step-definitions/webship.js` — navigation, assertion, form, response) rather than duplicate them. Prefer an existing webship-js step over a new Drupal-specific one, and reuse its helpers (`gotoUrl`, `waitForPageLoad`, `fillField`, ...) rather than reimplementing.
- **`tests/features/*.feature`**: self-test suite, bounded by what the seeded Standard install renders: public pages (front page, login/logout + session teardown, the users registry, password reset, breadcrumb, local tasks, image alt/title), error pages (403/404 + the anonymous-access matrix + session-aware status), the administration screens an admin can reach (`/admin`, content + its row operations, people, modules, appearance, status report, site information, profile, checkbox state, cache flush), content authoring (CKEditor 5, media library), infrastructure (page cache, security headers, generator, core JS settings, robots/RSS), and cross-cutting accessibility + responsive checks. Still **no** Search, Contact, or registration form, since a Drupal 11 Standard install ships neither module. The step-pack supports them; the self-tests just don't exercise them.
- Two traps when adding scenarios: (1) webship-js's `the response status code should be <n>` re-requests over HTTP **without session cookies**, so it always answers as an anonymous visitor — assert authenticated pages via rendered markup instead (`I should be on an admin page`, `I should see the page title "…"`). (2) `#edit-submit` is not unique on a Drupal page; click through `#edit-submit:visible`, as the pack's `VISIBLE_SUBMIT` does.
- **`cucumber.js`** — actual run config (require paths, `worldParameters.launchUrl`, selectors, screenshots). README's "Installation" section shows how a downstream project wires this plugin's + webship-js's step globs alongside its own.
- **`playwright.config.ts`** — browser/launch/context options, selected via `BROWSER` env var.
- **`drupal/`**: only `.ddev/config.yaml` and `seed/standard-fixtures.php` are committed; everything else is generated per run and gitignored.
- Structured for npm publishing (`main`/`files` in `package.json`) but not yet published; `webship-js` is a peer + dev dependency.

## Conventions

- Single active branch `2.0.x`; changes land via reviewed PRs, no direct commits.
