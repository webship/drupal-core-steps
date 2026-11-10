# drupal-core-steps

[![Test](https://github.com/webship/drupal-core-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/drupal-core-steps/actions/workflows/test.yml)

Drupal-core-specific Cucumber step definitions for [webship-js](https://www.npmjs.com/package/webship-js) — a Playwright + Cucumber BDD testing framework. `@webship-js/drupal-core-steps` adds a `drupal-core.steps.js` step-pack that understands the markup **Drupal core itself** renders — body classes, Form API element IDs, and core module templates that are identical regardless of theme or distribution — so you can write readable Gherkin scenarios against the main pages of any Drupal core site without hand-rolling CSS selectors.

It is a **plugin for webship-js**, so it does not run standalone. It ships one file of step definitions plus a small helpers module (`drupal-helpers.js`, which other Drupal step packs such as `@webship-js/drupal-cms-steps` build on); you drop it into an existing (or new) webship-js test project.

## What's covered

- **Named pages** — go to login, password reset, registration, search, contact, content creation, the current user's profile, or any of the core administration screens (`/admin`, `/admin/content`, `/admin/people`, `/admin/modules`, `/admin/appearance`, `/admin/reports/status`, site information) by name instead of by path
- **Body classes** — front page, administration page, node type, authenticated session (`path-frontpage`, `path-admin`, `page-node-type-<type>`, `user-logged-in`)
- **Core layout blocks** — Toolbar or Navigation admin bar, breadcrumb, local tasks (tab strip), the `h1.page-title` heading
- **Status messages** — status / warning / error, with an optional expected text
- **Named forms** — login, registration, password reset, search, contact, site information, asserted by the id Form API derives from each machine name
- **Authentication**: log in by a user handle from the users registry (`Given I am a logged in user with the "admin" user`), or with explicit credentials, log out (including core 10.3+'s logout confirmation form), make sure a session is anonymous (`Given I am not logged in`), password reset requests, authenticated-session assertions, login errors
- **Session-aware HTTP status**: `the page should return HTTP status 403` re-requests the current page with the browser's own cookies, so it answers for the signed-in user (webship-js's status step answers for an anonymous visitor)
- **Listings and operations**: assert a row of an administration listing offers (or hides) an operation such as "Edit" or "Delete", and follow an operation link of a row; combine with webship-js's `I should see "…" in the "…" row` and `I click "…" in the "…" row`
- **Breadcrumb text**: `"Home" should be in the breadcrumb`, `the breadcrumb should not contain "…"`
- **Checkbox state**: by visible label or by Form API id (`the checkbox labeled "Published" should be checked`, `the checkbox with the id "edit-sticky-value" should be unchecked`)
- **Images**: an image with a given alt or title text is (or is not) on the page
- **Rich text editor (CKEditor 5)**: fill or append a rich text field by label, name or id, and press a toolbar command button ("Bold", "Insert Media", …)
- **Media library**: open a field's media library, select a media item by name, insert the selection (or submit the dialog)
- **Content**: open the add form of a content type (`Given I am adding an "article"`), create a node through `/node/add/<type>`, assert the content-type body class, assert the item is published or unpublished, delete the item being viewed, assert an empty or non-empty Views listing
- **Caches and forms**: flush all caches from the Performance page; submit a form by the id of its submit button with an in-page click that survives sticky bars and overlays
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

Add both step-definition paths to your project's `cucumber.js`, in this order:

```javascript
module.exports = {
  default: {
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',                    // webship-js core steps
      'node_modules/@webship-js/drupal-core-steps/tests/step-definitions/**/*.js', // this pack
      'tests/step-definitions/**/*.js',                                            // your own custom steps, if any
    ],
    paths: ['tests/features/**/*.feature'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'https://your-drupal-site.example',
      // ... the settings below
    },
  },
};
```

This repo's own `cucumber.js` and `tests/features/*.feature` files double as a working reference project for the full setup. Run `npx cucumber-js --dry-run` once after wiring the two sources: it reports any undefined or ambiguous step before a browser is opened.

## Settings

Everything the pack reads lives under `worldParameters` in `cucumber.js`. The block below is what this repository runs with and what a new project copies; every value has an environment variable so nothing site-specific is committed. The pack is meant to be the only Drupal step pack a project installs, so it carries the whole set (a Drupal CMS site uses [`@webship-js/drupal-cms-steps`](https://www.npmjs.com/package/@webship-js/drupal-cms-steps) instead, which carries its own).

```javascript
worldParameters: {
  launchUrl: process.env.LAUNCH_URL || process.env.DDEV_PRIMARY_URL || 'http://localhost:8080',

  // The accounts `Given I am a logged in user with the "<handle>" user` logs in as.
  users: {
    admin:         { username: process.env.DRUPAL_ADMIN_USER || 'admin',  password: process.env.DRUPAL_ADMIN_PASS || 'admin',  email: process.env.DRUPAL_ADMIN_MAIL || 'admin@example.com' },
    editor:        { username: process.env.DRUPAL_EDITOR_USER || 'editor', password: process.env.DRUPAL_EDITOR_PASS || 'editor', email: process.env.DRUPAL_EDITOR_MAIL || 'editor@example.com' },
    authenticated: { username: process.env.DRUPAL_AUTHENTICATED_USER || 'authenticated', password: process.env.DRUPAL_AUTHENTICATED_PASS || 'authenticated', email: process.env.DRUPAL_AUTHENTICATED_MAIL || 'authenticated@example.com' },
    // Not an account: what an anonymous visitor types into the contact form.
    anonymous:     { name: process.env.DRUPAL_ANONYMOUS_NAME || 'Webship QA', email: process.env.DRUPAL_ANONYMOUS_EMAIL || 'qa@example.com' },
  },

  minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },

  selectors: {
    css: {},                      // your own names; they win over the pack's preset
    xpath: {},
    filesPath: './tests/selectors/',
    files: [],                    // JSON presets of your own to load
    offset: 60,                   // WEBSHIP_SELECTORS_OFFSET
    breakpoints: {                // WEBSHIP_SELECTORS_BREAKPOINTS (JSON)
      xs: { width: 375, height: 667 }, sm: { width: 576, height: 800 }, md: { width: 768, height: 1024 },
      lg: { width: 992, height: 768 }, xl: { width: 1200, height: 900, default: true },
      xxl: { width: 1400, height: 900 }, xxxl: { width: 1920, height: 1080 },
    },
  },

  screenshot: { dir: './screenshots', purge: false, onFailed: true, onEveryStep: false, alwaysFullscreen: false,
                failedPrefix: 'failed_', filenamePattern: '{datetime}.{feature_file}.feature_{step_line}.{ext}',
                filenamePatternFailed: '{failed_prefix}{datetime}.{feature_file}.feature_{step_line}.{ext}', infoTypes: '' },

  // 'off' | 'on' | 'on-failure' | 'tag' (scenarios tagged @video).
  video: { mode: process.env.WEBSHIP_VIDEO || 'off', dir: './videos', size: { width: 1280, height: 720 },
           filenamePattern: '{datetime}.{feature_file}.{scenario}.{status}.{ext}' },

  // 'warn' | 'fail' | 'off'; per scenario: @js-fail, @js-warn, @js-off.
  javascript: { mode: process.env.WEBSHIP_JS_ERROR_MODE || 'warn', levels: ['error'], ignore: '', beforeScenario: false, afterScenario: true },
}
```

### Users registry and the login idiom

Feature files never carry credentials. The `users` registry maps the handle a scenario uses to the real account; the default handles match what a Drupal core Standard install has: `admin` (the administrator), `editor` (an account with the Content editor role) and `authenticated` (an account with no role at all, for the scenarios that prove a plain login does not reach the back end). Add your own handles the same way (`reviewer: { username: ..., password: ... }`).

| Variable | Default | Used for |
| --- | --- | --- |
| `LAUNCH_URL` | `DDEV_PRIMARY_URL`, then `http://localhost:8080` | the site under test |
| `DRUPAL_ADMIN_USER` / `DRUPAL_ADMIN_PASS` / `DRUPAL_ADMIN_MAIL` | `admin` / `admin` / `admin@example.com` | the `admin` handle |
| `DRUPAL_EDITOR_USER` / `DRUPAL_EDITOR_PASS` / `DRUPAL_EDITOR_MAIL` | `editor` / `editor` / `editor@example.com` | the `editor` handle |
| `DRUPAL_AUTHENTICATED_USER` / `DRUPAL_AUTHENTICATED_PASS` / `DRUPAL_AUTHENTICATED_MAIL` | `authenticated` / `authenticated` / `authenticated@example.com` | the `authenticated` handle |
| `DRUPAL_ANONYMOUS_NAME` / `DRUPAL_ANONYMOUS_EMAIL` | `Webship QA` / `qa@example.com` | the contact form of an anonymous visitor |
| `WEBSHIP_STEP_TIMEOUT` | `45000` | the step timeout (a `timeout` key in cucumber.js is ignored: webship-js sets it when it loads) |
| `HEADLESS` / `SLOW_MO` | `true` / `300` (`800` when headed) | `playwright.config.ts`; `npm run test:headed` sets `HEADLESS=false` |
| `WEBSHIP_VIDEO`, `WEBSHIP_JS_ERROR_MODE`, `WEBSHIP_SCREENSHOT_*`, `WEBSHIP_SELECTORS_*` | see the block above | webship-js's own switches |

Then log in by handle:

```gherkin
Given I am a logged in user with the "admin" user
Given I am a logged in user with the username "editor"
Given we are a logged in user with "admin"
```

The step opens `/user/login`, fills `#edit-name` and `#edit-pass` and submits by dispatching the submit button's click inside the page with the navigation wait armed in the same `Promise.all`, then settles the landing page. The in-page submit is what keeps the login reliable when a sticky bar, a chat widget or a cookie banner covers the button and a pointer click would wait on it forever. The explicit `When I log in as "admin" with password "admin"` step (after `Given I am on the login page`) is still there for the one case where the credentials are the point of the scenario, such as a wrong password in `login.feature`; every other feature in this repo logs in by handle.

The counterpart for the anonymous half of an access scenario is:

```gherkin
Given I am not logged in
```

It clears the browser's cookies and web storage, reloads, then opens `/user/login` and confirms the login form is shown (an authenticated visitor is redirected to their profile instead), so the scenario really starts anonymous.

When many scenarios log in as the same account, log in once and reuse the session with webship-js's auth state steps: `When I save the auth state to "tests/auth/admin.json"` after the login, then `Given I restore the auth state from "tests/auth/admin.json"` in the other scenarios. That skips the login form entirely and is the biggest speedup available for an authenticated suite. Tag the scenario that saves the state `@auth-setup`: the default run (`tags: 'not @wip and not @auth-setup'` in `cucumber.js`) leaves it out, and `CUCUMBER_TAGS=@auth-setup npm test` runs it on its own.

### Named selectors

webship-js's named-selector steps (`Then I see visible <name>`, `Then I don't see <name>`, `Then I see <name> above <name>`, `When I click on <name>`) read names from a registry. The pack merges its own preset, [`tests/selectors/drupal-core.json`](tests/selectors/drupal-core.json), into every scenario, so these names work on any Drupal site with nothing configured; a name you define in `worldParameters.selectors` or load from `files` wins over the preset.

| Name | Markup |
| --- | --- |
| `messages`, `status message`, `warning message`, `error message` | core's status messages |
| `page title`, `breadcrumb`, `local tasks`, `local actions`, `skip link`, `main content` | the page |
| `toolbar`, `toolbar bar`, `navigation sidebar`, `top bar`, `contextual links` | the administration UI |
| `login form`, `username field`, `password field` | the login form |
| `form actions`, `primary button`, `save button`, `delete button`, `details`, `details summary`, `vertical tabs`, `vertical tab item`, `dropbutton`, `dropbutton toggle`, `ajax throbber`, `node form`, `node title field` | Form API |
| `modal`, `dialog buttons`, `off canvas dialog`, `media library dialog`, `media library item` | dialogs and the media library |
| `rich text editor`, `rich text editor toolbar`, `rich text editor editable` | CKEditor 5 |
| `views table`, `exposed filters`, `empty view`, `pager`, `pager next`, `status report`, `search form`, `search input` | listings and search |
| `moderation control`, `layout builder`, `layout builder add section` | content moderation and Layout Builder |
| `first table row`, `messages block` | XPath names |

```gherkin
Given I am on the login page
Then I see visible login form, username field, password field
And I don't see navigation sidebar
```

The same hook points the `I attach the file "<name>" to "<field>"` steps at your project's `tests/assets/` folder when it exists (webship-js's default is its own package folder).

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

This repository is itself a working webship-js project: its `tests/features/*.feature` files run by default against a **self-hosted Drupal core (Standard profile) instance managed by [DDEV](https://ddev.com/)**, installed with `drush site-install` and then seeded with the smallest set of fixtures the steps need: two core recipes (the Article content type and the Image media type), a second account for the users registry, and one article plus one media item. Nothing else is configured, so the suite stays honest about what a fresh Drupal core site renders, and it side-steps the flakiness of testing against a public site whose content changes over time.

The self-test suite therefore covers what such an install provides:

| Area | Feature files |
| --- | --- |
| Public pages | `homepage`, `login`, `logout`, `users-registry`, `password-reset`, `breadcrumb`, `breadcrumb-text`, `local-tasks`, `images` |
| Error pages | `error-403`, `error-404`, `anonymous-access`, `session-status` |
| Administration | `admin-dashboard`, `admin-content`, `listing-operations`, `admin-people`, `admin-modules`, `admin-appearance`, `admin-status-report`, `site-information`, `user-profile`, `authenticated-access`, `checkbox-state`, `caches` |
| Content authoring | `rich-text-editor`, `media-library` |
| Infrastructure | `page-cache`, `security-headers`, `drupal-generator`, `drupal-settings`, `feeds-and-robots` |
| Cross-cutting | `accessibility`, `responsive` |

It does **not** exercise Contact or Search, nor the registration *form*: a Standard-profile install ships neither module and has self-registration disabled. The step-pack itself still supports those (see [What's covered](#whats-covered)) for use against your own site once you've enabled the relevant modules.

One consequence worth knowing when writing your own scenarios: webship-js's `the response status code should be <n>` re-requests the URL over HTTP without the browser's session cookies, so it always reports what an *anonymous* visitor would get. Use it to assert 403/404, and assert on rendered markup (`I should be on an admin page`, `I should see the page title "…"`) for pages that only open once signed in — which is exactly what `anonymous-access.feature` and `authenticated-access.feature` do as a matched pair.

The `drupal/` directory holds a committed `.ddev/config.yaml` for this fixture site; the Drupal codebase itself (`web/`, `vendor/`, `composer.json`) is generated fresh by `ddev composer create-project` and gitignored, so every run starts from a clean install.

```bash
cd drupal
ddev start
ddev composer create-project drupal/recommended-project
ddev composer require drush/drush --no-interaction
ddev drush site-install standard --account-name=admin --account-pass=admin --yes

# Seed the fixtures the suite relies on (idempotent, see tests/seed/standard-fixtures.php):
ddev drush recipe core/recipes/article_content_type
ddev drush recipe core/recipes/image_media_type
ddev drush user:create editor --mail=editor@example.com --password=editor
ddev drush user:role:add content_editor editor
ddev drush user:create authenticated --mail=authenticated@example.com --password=authenticated
mkdir -p seed && cp ../tests/seed/standard-fixtures.php seed/
ddev drush php:script seed/standard-fixtures.php
ddev drush cache:rebuild
cd ..

npm install
npx playwright install --with-deps chromium
LAUNCH_URL=http://drupal-core-steps-site.ddev.site npm test
LAUNCH_URL=https://your-site.example npm test   # runs against your own site instead
```

The seed script adds a "Media" field (media library widget) to Article, one Image media item named "Sample image" (alt "Sample image alt text", title "Sample image title text") and one published article, "Sample article" at `/sample-article`, that is not promoted to the front page. The `editor` account holds the Content editor role. The account names and passwords are read from `DRUPAL_ADMIN_USER`, `DRUPAL_ADMIN_PASS`, `DRUPAL_EDITOR_USER` and `DRUPAL_EDITOR_PASS` (defaults `admin`/`admin` and `editor`/`editor`), both by `cucumber.js` and by the CI workflow.

Against DDEV's HTTPS URL, pass the mkcert root certificate to Node as well, because one webship-js step re-requests the page outside the browser: `NODE_EXTRA_CA_CERTS=$(mkcert -CAROOT)/rootCA.pem LAUNCH_URL=https://drupal-core-steps-site.ddev.site npm test`.

Other scripts:

| Script | Effect |
| --- | --- |
| `npm test` | Full suite, pretty output |
| `npm run test:dry` | `--dry-run` — checks for undefined/ambiguous steps only |
| `npm run test:examples` | No browser: every step's JSDoc carries five `Example #n:` lines that match its own definition and no other, and every feature step resolves to exactly one definition (also runs in CI) |
| `npm run test:headed` | Headed browser |
| `npm run test:chromium` / `test:firefox` / `test:webkit` | Pick a browser |

## Publishing

The package is publish-ready: `name`, `version`, `main`, `files`, `repository`, `license` and `publishConfig.access` are all set in `package.json`, and `LICENSE` ships with the tarball. It is released to npmjs.com as [`@webship-js/drupal-core-steps`](https://www.npmjs.com/package/@webship-js/drupal-core-steps); development happens in this private GitHub repository.

## Contributing

Issues and pull requests are tracked on GitHub. `2.0.x` is the repository's single active branch — all changes land via reviewed pull requests, no direct commits.

## License

MIT © Webship.co — see [LICENSE](LICENSE).
