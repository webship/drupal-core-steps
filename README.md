# drupal-core-steps

[![Test](https://github.com/webship/drupal-core-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/drupal-core-steps/actions/workflows/test.yml)

Drupal-core-specific Cucumber step definitions for [webship-js](https://www.npmjs.com/package/webship-js) — a Playwright + Cucumber BDD testing framework. `@webship-js/drupal-core-steps` adds a `drupal-core.steps.js` step-pack that understands the markup **Drupal core itself** renders — body classes, Form API element IDs, and core module templates that are identical regardless of theme or distribution — so you can write readable Gherkin scenarios against the main pages of any Drupal core site without hand-rolling CSS selectors.

It is a **plugin for webship-js** — it does not run standalone. It ships one file of step definitions; you drop it into an existing (or new) webship-js test project.

## What's covered

- **Named pages** — go to login, password reset, registration, search, contact, content creation, the current user's profile, or any of the core administration screens (`/admin`, `/admin/content`, `/admin/people`, `/admin/modules`, `/admin/appearance`, `/admin/reports/status`, site information) by name instead of by path
- **Body classes** — front page, administration page, node type, authenticated session (`path-frontpage`, `path-admin`, `page-node-type-<type>`, `user-logged-in`)
- **Core layout blocks** — Toolbar or Navigation admin bar, breadcrumb, local tasks (tab strip), the `h1.page-title` heading
- **Status messages** — status / warning / error, with an optional expected text
- **Named forms** — login, registration, password reset, search, contact, site information, asserted by the id Form API derives from each machine name
- **Authentication** — log in, log out (including core 10.3+'s logout confirmation form), password reset requests, authenticated-session assertions, login errors
- **Content** — create a node through `/node/add/<type>`, assert the content-type body class, assert an empty or non-empty Views listing
- **Core Search** (`/search/node`) — results and no-results
- **Core Contact** module's default "feedback" form
- **Error pages** — 403 (access denied) and 404 (page not found)
- **Site fingerprint** — the `Generator` meta tag (optionally pinned to a major version) and core's JavaScript settings payload
- **Page caching** — `X-Drupal-Cache` (Internal Page Cache) and `X-Drupal-Dynamic-Cache` (Dynamic Page Cache) hit/miss, read from the original navigation rather than a second request

Every assertion step reads both polarities from a single definition — `Then I should see the breadcrumb` and `Then I should not see the breadcrumb` are the same step.

Steps that webship-js already covers generically — asserting an arbitrary element, a page title, a URL, a status code — are deliberately **not** duplicated here; use the core pack's own steps for those.

The step-pack covers all of the above regardless of which modules a given site has enabled — write the scenarios your site's configuration supports. This repo's own self-test suite (below) intentionally exercises only a subset: what a genuinely untouched Standard-profile install renders, with nothing installed, configured, or seeded beyond `drush site-install`.

Each step definition in `tests/step-definitions/drupal-core.steps.js` is documented inline with its own Gherkin examples.

## Requirements

- Node.js >= 20
- An existing [webship-js](https://www.npmjs.com/package/webship-js) 2.x test project (or run the template script below to create one)
- A Drupal core site to test against — Standard or Minimal install profile, any theme or distribution

## Installation

```bash
npm install --save-dev webship-js @webship-js/drupal-core-steps
```

Add both step-definition paths to your project's `cucumber.js`:

```javascript
module.exports = {
  default: {
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',        // webship-js core steps
      'node_modules/@webship-js/drupal-core-steps/tests/step-definitions/**/*.js', // this plugin
      'tests/step-definitions/**/*.js',                                 // your own custom steps, if any
    ],
    paths: ['tests/features/**/*.feature'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'https://your-drupal-site.example',
      // ...
    },
  },
};
```

This repo's own `tests/features/*.feature` files double as a working reference project for the full setup.

## Quick example

```gherkin
Feature: Front page

  Scenario: Front page renders the core layout
    Given I am an anonymous user
    And I am on the homepage
    Then I should be on the front page
    And the response status code should be 200
```

More runnable examples: `tests/features/*.feature` in this repo.

## Running this repo's own test suite

This repository is itself a working webship-js project — its `tests/features/*.feature` files run by default against a **self-hosted, genuinely default Drupal core (Standard profile) instance managed by [DDEV](https://ddev.com/)**: no recipes applied, no modules swapped, no content seeded, nothing configured beyond `drush site-install` itself. That keeps the self-test suite honest about what a brand-new Drupal core site actually renders, and side-steps the flakiness of testing against a public site whose content changes over time.

Because of that, the self-test suite only covers what such a bare install provides out of the box:

| Area | Feature files |
| --- | --- |
| Public pages | `homepage`, `login`, `logout`, `password-reset`, `breadcrumb`, `local-tasks` |
| Error pages | `error-403`, `error-404`, `anonymous-access` |
| Administration | `admin-dashboard`, `admin-content`, `admin-people`, `admin-modules`, `admin-appearance`, `admin-status-report`, `site-information`, `user-profile`, `authenticated-access` |
| Infrastructure | `page-cache`, `security-headers`, `drupal-generator`, `drupal-settings`, `feeds-and-robots` |
| Cross-cutting | `accessibility`, `responsive` |

It does **not** exercise content pages, Contact, or Search, nor the registration *form*: a Standard-profile install ships none of those (no Article/Page content types, no Contact or Search module, and self-registration disabled). The step-pack itself still supports all of those — see [What's covered](#whats-covered) — for use against your own site once you've enabled the relevant modules/content types.

One consequence worth knowing when writing your own scenarios: webship-js's `the response status code should be <n>` re-requests the URL over HTTP without the browser's session cookies, so it always reports what an *anonymous* visitor would get. Use it to assert 403/404, and assert on rendered markup (`I should be on an admin page`, `I should see the page title "…"`) for pages that only open once signed in — which is exactly what `anonymous-access.feature` and `authenticated-access.feature` do as a matched pair.

The `drupal/` directory holds a committed `.ddev/config.yaml` for this fixture site; the Drupal codebase itself (`web/`, `vendor/`, `composer.json`) is generated fresh by `ddev composer create-project` and gitignored, so every run starts from a clean install.

```bash
cd drupal
ddev start
ddev composer create-project drupal/recommended-project
ddev composer require drush/drush --no-interaction
ddev drush site-install standard --account-name=admin --account-pass=admin --yes
cd ..

npm install
npx playwright install --with-deps chromium
LAUNCH_URL=http://drupal-core-steps-site.ddev.site npm test
LAUNCH_URL=https://your-site.example npm test   # runs against your own site instead
```

Other scripts:

| Script | Effect |
| --- | --- |
| `npm test` | Full suite, pretty output |
| `npm run test:dry` | `--dry-run` — checks for undefined/ambiguous steps only |
| `npm run test:headed` | Headed browser |
| `npm run test:chromium` / `test:firefox` / `test:webkit` | Pick a browser |

## Publishing

The package is publish-ready: `name`, `version`, `main`, `files`, `repository`, `license` and `publishConfig.access` are all set in `package.json`, and `LICENSE` ships with the tarball. It is released to npmjs.com as [`@webship-js/drupal-core-steps`](https://www.npmjs.com/package/@webship-js/drupal-core-steps); development happens in this private GitHub repository.

## Contributing

Issues and pull requests are tracked on GitHub. `2.0.x` is the repository's single active branch — all changes land via reviewed pull requests, no direct commits.

## License

MIT © Webship.co — see [LICENSE](LICENSE).
