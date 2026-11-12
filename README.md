# drupal-core-steps

[![Test](https://github.com/webship/drupal-core-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/drupal-core-steps/actions/workflows/test.yml)

Cucumber step definitions for Drupal core sites, for [webship-js](https://www.npmjs.com/package/webship-js) (Playwright and Cucumber). `@webship-js/drupal-core-steps` lets a team write plain-English scenarios against any Drupal site: logging in, access control, content, forms, the administration pages, search, the status report, roles and permissions.

The pack is a plugin for webship-js and does not run on its own. It is tested on every change against a real Drupal 11 site and a real Drupal 12 site, and it is the pack the other Drupal step packs build on (`@webship-js/drupal-cms-steps` requires its helpers).

```gherkin
Feature: Editorial access

  Scenario: An editor reaches the content overview but not the people page
    Given I am a logged in user with the "editor" user
    Then I should be allowed access to "/admin/content"
    And I should be denied access to "/admin/people"
    And the "Content editor" role should not have the "administer users" permission
```

## Supported versions

| | Version | Notes |
| --- | --- | --- |
| Drupal | 11 and 12 | The same features run on both in CI. A scenario that cannot apply to one of them carries the tag `@drupal11` or `@drupal12`. |
| Themes | any | The steps read what core states (see [How the steps find things](#how-the-steps-find-things)); core's themes need no configuration, another theme may need a few named selectors. |
| webship-js | 2.0.6 or later | |
| Node.js | 20 or later | |

## What the pack covers

| Area | Steps (examples) |
| --- | --- |
| Accounts and sessions | `I am a logged in user with the "editor" user`, `I am not logged in`, `I log out`, `I should (not) be logged in`, `I log in as "…" with password "…"`, `I request a new password for "…"` |
| Access control | `I should be denied access to "/admin/people"`, `I should be allowed access to "/admin/content"`, `the page should be access restricted`, `I should (not) be able to edit the content at "/sample-article"`, `the page should return HTTP status 403` (for the current session) |
| Roles and permissions | `the "Content editor" role should exist`, `the "Content editor" role should (not) have the "access content overview" permission` |
| Named pages and forms | `I am on the login page` (also: password reset, registration, search, contact, administration, content overview, people, modules, appearance, status report, add content, my account, site information), `I should (not) see the login form` |
| Page state | `I should (not) be on the front page`, `I should (not) be on an admin page`, `I should be on an "article" page`, `I should see the page title "…"`, `I should be on the access denied page`, `I should be on the 404 page` |
| Messages | `I should see a status message "…"`, `I should see a warning message`, `I should (not) see an error message`, `I should see a login error "…"` |
| Content | `I am adding an "article"`, `I create an "article" content item titled "…"`, `I save the content`, `I try to save the content`, `the "Title" field should block submission as required`, `I view / edit / delete the content item I created`, `the content item should be published`, `the "Article" content type should exist` |
| Forms | `I open the "Menu settings" form section` (vertical tabs or collapsible details), `I submit by id "edit-submit"`, `I confirm the deletion`, `the checkbox labeled "Published" should be checked`, `I wait for the AJAX requests to finish`, `I wait out the form time limit` |
| Rich text editor (CKEditor 5) | `I fill in the rich text editor field "Body" with "…"`, `I click on "Bold" command button in the rich text editor field "Body"`, `I fill in the link URL "…"`, `the rich text editor field "Body" should contain "…"` |
| Media library | `I open the "field_media" media library`, `I select the media "Sample image"`, `I insert the selected media` |
| Layout Builder | `I open the layout of the content item I am viewing`, `I add a "Two column" section at the end of the layout`, `I save the layout`, `the layout should have 2 sections`, `I discard the layout changes`, `I revert the layout to the default` |
| Content moderation | `the moderation state should be "Draft"`, `I change the moderation state to "Published"` |
| Listings | `I should see the "Edit" operation for the "Sample article" content`, `I open the "Delete" operation in the "Sample article" row`, `I should see an empty listing` |
| Administration UI | `I should see the navigation sidebar`, `the navigation sidebar should list "Content"`, `the top bar should offer the "Edit" action`, `I should see the toolbar`, `I should see the breadcrumb`, `"Home" should be in the breadcrumb`, `I should see the local tasks` |
| Site structure | `the "node" module should be installed`, `the default theme should be "Olivero"`, `the "Main navigation" menu should contain "Home"`, `the front page path should be "/node"`, `I create a "tags" taxonomy term named "…"`, `I delete the "tags" taxonomy term named "…"`, `I add a menu link titled "…" to "…" in the "main" menu`, `I delete the menu link titled "…" from the "main" menu` |
| Status report | `the status report should have no errors`, `the status report should count at most 3 warnings`, `the status report should list the warning "Configuration files"` |
| Search and contact | `I search for "…"`, `I should see (no) search results`, `I submit the contact form with subject "…" and message "…"` |
| Site health | `the page should not have PHP errors`, `the site generator should be "Drupal 11"`, `the core JavaScript settings should be initialized`, `the page should be served from the page cache`, `the page should have the canonical URL "…"`, `the "description" meta tag should contain "…"`, `I flush all caches` |

Every step is documented above its definition in `tests/step-definitions/` with at least five examples, and every assertion reads both ways from one definition: `Then I should see the breadcrumb` and `Then I should not see the breadcrumb` are the same step. The features in `tests/features/` are runnable examples of all of them; they ship in the npm package.

The pack does not repeat what webship-js already offers. Use webship-js's own steps to assert an arbitrary element, a URL, a document title or a table row.

## Installation

```bash
npm install --save-dev webship-js @webship-js/drupal-core-steps
```

Add both sets of step definitions to the project's `cucumber.js`, in this order:

```javascript
module.exports = {
  default: {
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',                    // webship-js
      'node_modules/@webship-js/drupal-core-steps/tests/step-definitions/**/*.js', // this pack
      'tests/step-definitions/**/*.js',                                            // the project's own steps, if any
    ],
    paths: ['tests/features/**/*.feature'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'https://your-drupal-site.example',
      // ... the settings below
    },
  },
};
```

Run `npx cucumber-js --dry-run` once after that: it reports an undefined or ambiguous step before a browser opens. This repository's own `cucumber.js` is a complete reference.

## Accounts are configuration

A suite does not create or delete users. The accounts it logs in as are part of the site, like its roles and its content types:

1. **The build of the site creates the accounts.** This repository's CI does it with drush, right after the installation:

   ```bash
   ddev drush user:create editor --mail=editor@example.com --password="$DRUPAL_EDITOR_PASS"
   ddev drush user:role:add content_editor editor
   ddev drush user:create authenticated --mail=authenticated@example.com --password="$DRUPAL_AUTHENTICATED_PASS"
   ```

   A recipe, an installation profile or a deployment script does the same job on a project.

2. **`cucumber.js` names them.** The users registry maps the handle a feature uses to the real account, with the credentials read from the environment, so no password is written in a feature file or committed:

   ```javascript
   worldParameters: {
     users: {
       admin:         { username: process.env.DRUPAL_ADMIN_USER || 'admin', password: process.env.DRUPAL_ADMIN_PASS, isAdmin: true },
       editor:        { username: process.env.DRUPAL_EDITOR_USER || 'editor', password: process.env.DRUPAL_EDITOR_PASS, roles: ['content_editor'] },
       authenticated: { username: process.env.DRUPAL_AUTHENTICATED_USER || 'authenticated', password: process.env.DRUPAL_AUTHENTICATED_PASS, roles: [] },
       // Not an account: what a visitor types into the contact form.
       anonymous:     { name: 'Webship QA', email: 'qa@example.com' },
     },
   }
   ```

3. **The features only log in.**

   ```gherkin
   Given I am a logged in user with the "editor" user
   Given I am not logged in
   ```

The login step opens `/user/login`, fills the form and submits it inside the page, so a sticky bar or a cookie banner over the button does not stop it. It then checks the outcome: a refused login fails at that step with the site's own message ("Unrecognized username or password.") instead of leaving a later step to fail on the wrong page. `I am not logged in` clears the session and confirms that the site serves the login form again.

When many scenarios log in as the same account, log in once and reuse the session with webship-js's auth state steps (`I save the auth state to "tests/auth/admin.json"`, `I restore the auth state from "tests/auth/admin.json"`). Tag the scenario that saves the state `@auth-setup` and run it first.

A project that cannot prepare its accounts in the build can let the suite do it; see [Optional: provisioning accounts from the suite](#optional-provisioning-accounts-from-the-suite).

## Settings

Everything the pack reads is under `worldParameters` in `cucumber.js`. Each value has an environment variable, so nothing specific to a site is committed.

| Variable | Default | Used for |
| --- | --- | --- |
| `LAUNCH_URL` | `DDEV_PRIMARY_URL`, then `http://localhost:8080` | the site under test (`launchUrl`) |
| `DRUPAL_ADMIN_USER`, `DRUPAL_ADMIN_PASS`, `DRUPAL_ADMIN_MAIL` | `admin`, `admin`, `admin@example.com` | the `admin` handle |
| `DRUPAL_EDITOR_USER`, `DRUPAL_EDITOR_PASS`, `DRUPAL_EDITOR_MAIL` | `editor`, `editor`, `editor@example.com` | the `editor` handle |
| `DRUPAL_AUTHENTICATED_USER`, `DRUPAL_AUTHENTICATED_PASS`, `DRUPAL_AUTHENTICATED_MAIL` | `authenticated`, `authenticated`, `authenticated@example.com` | the `authenticated` handle, an account with no role |
| `DRUPAL_REVIEWER_USER`, `DRUPAL_REVIEWER_PASS`, `DRUPAL_REVIEWER_MAIL` | `reviewer_with_a_long_name`, `reviewer`, `reviewer@example.com` | the `reviewer` handle, a name longer than 20 characters |
| `DRUPAL_ANONYMOUS_NAME`, `DRUPAL_ANONYMOUS_EMAIL` | `Webship QA`, `qa@example.com` | what a visitor types into the contact form |
| `DRUPAL_LOGIN_WAIT` | `0` | milliseconds the login by handle waits before it submits (`loginWait`), for a login form protected by a time limit |
| `DRUPAL_FORM_WAIT` | `5000` | milliseconds `I wait out the form time limit` waits (`formWait`) |
| `DRUPAL_MAJOR` | `11` | the Drupal major version of the site: the run leaves out the scenarios tagged for the other one (`@drupal12`, or `@drupal11` when it is `12`) |
| `CUCUMBER_TAGS` | `not @wip and not @auth-setup and not @provisioning and not @drupal12` | the tag expression of the run |
| `FEATURES` | all features | a comma-separated list of feature files to run |
| `WEBSHIP_STEP_TIMEOUT` | `45000` | the step timeout; webship-js sets it, a `timeout` key in `cucumber.js` is ignored |
| `HEADLESS`, `SLOW_MO` | `true`, `300` (`800` when headed) | `playwright.config.ts` |
| `WEBSHIP_VIDEO`, `WEBSHIP_JS_ERROR_MODE`, `WEBSHIP_SCREENSHOT_*`, `WEBSHIP_SELECTORS_*` | see `cucumber.js` | webship-js's own settings |

## How the steps find things

A Drupal site can run any theme, and a theme decides most class names. The steps therefore look for things in this order:

1. **What core states, whatever the theme**: the settings payload (`drupalSettings`), ARIA roles and labels, `data-drupal-*` attributes, the ids Form API derives from machine names, and the answer of the site to a request.
2. **The classes of core's own themes**, as a fallback.
3. **A named selector**, which a project sets when its theme prints something else.

| Step | Reads first | Then | Named selector |
| --- | --- | --- | --- |
| `I should be on the front page` | `drupalSettings.path.isFront` | `body.path-frontpage`, then the URL | `front page` |
| `I should be on an admin page` | `drupalSettings.path.currentPathIsAdmin` | `body.path-admin`, then the `/admin` prefix | `admin page` |
| `I should be logged in` | `drupalSettings.user.uid`, a logout link | `body.user-logged-in`, then the site's answer for `/user/login` | |
| `I should see a status / warning / error message` | `aria-label="Status message"` (and the other two), `role="status"` or `role="alert"` inside `[data-drupal-messages]` | `.messages--status` (and the other two) | `status message`, `warning message`, `error message` |
| `I should see the page title "…"` | the `<h1>` of the main region | `h1.page-title`, then the page's part of the document title | `page title` |
| `I should be on an "article" page` | | `body.page-node-type-article`, `.node--type-article`, then the item's edit form (`data-drupal-selector`) | `content type page` (with `{type}`) |
| `the content item should be published` | | `.node--unpublished`, then the site's answer to a visitor | `unpublished content` |
| `I should see the breadcrumb` | `nav[aria-labelledby="system-breadcrumb"]` | `.breadcrumb` | `breadcrumb` |
| `I should see search results` | the items of the list the Search module renders | `.search-results` | `search results` |
| `I should see the login form` | `form[data-drupal-selector="user-login-form"]` | `#user-login-form` | `login form` |
| `the status report should have no errors` | the counters and the `error` / `warning` groups of the report | the counts in its text | |

The feature `tests/features/any-theme.feature` holds these steps to their word: CI runs it a second time with Stark as the default theme, which prints none of the classes of core's themes.

For a theme that prints its own markup, set the names it needs in `cucumber.js`:

```javascript
worldParameters: {
  selectors: {
    css: {
      'status message': '.alert-success',
      'error message': '.alert-danger',
      'page title': '.hero-title',
      'content type page': '[data-bundle="{type}"]',
    },
  },
}
```

### Named selectors

webship-js's named-selector steps (`Then I see visible <name>`, `Then I don't see <name>`, `When I click on <name>`) read names from a registry. The pack merges its preset, [`tests/selectors/drupal-core.json`](tests/selectors/drupal-core.json), into every scenario; a name the project defines wins over the preset.

| Names | For |
| --- | --- |
| `messages`, `status message`, `warning message`, `error message` | messages |
| `page title`, `front page`, `admin page`, `content type page`, `unpublished content`, `breadcrumb`, `local tasks`, `local actions`, `skip link`, `main content` | the page |
| `toolbar`, `toolbar bar`, `navigation sidebar`, `top bar`, `contextual links` | the administration UI |
| `login form`, `username field`, `password field` | the login form |
| `form actions`, `primary button`, `save button`, `delete button`, `details`, `details summary`, `vertical tabs`, `vertical tab item`, `dropbutton`, `dropbutton toggle`, `ajax throbber`, `node form`, `node title field` | forms |
| `modal`, `dialog buttons`, `off canvas dialog`, `media library dialog`, `media library item` | dialogs and the media library |
| `rich text editor`, `rich text editor toolbar`, `rich text editor editable` | CKEditor 5 |
| `views table`, `exposed filters`, `empty view`, `pager`, `pager next`, `status report`, `search form`, `search input`, `search results` | listings and search |
| `moderation control`, `layout builder`, `layout builder add section` | content moderation and Layout Builder |
| `first table row`, `messages block` | XPath names |

```gherkin
Given I am on the login page
Then I see visible login form, username field, password field
And I don't see navigation sidebar
```

The same hook points the `I attach the file "<name>" to "<field>"` steps at the project's `tests/assets/` folder when it exists.

## Notes on the steps

**Form sections.** Core builds the side settings of a form ("Menu settings", "URL alias", "Publishing options") as `details` elements. A theme shows them as vertical tabs, as an accordion or as plain collapsible details; the node form of Drupal 12 uses plain details where Drupal 11 uses an accordion. `I open the "URL alias" form section` works on all of them, and so do the older phrasings `I expand the "…" details` and `I open the "…" vertical tab`.

**Saving.** `I save the content` presses the Save button a person sees. When the browser refuses the submit because a required field is empty, the step fails at once and names the field with the browser's message. A scenario that expects the refusal uses `I try to save the content`, then `the "Title" field should block submission as required`.

**The status of a page.** `the page should return HTTP status 403` asks with the cookies of the current session. webship-js's `the response status code should be 403` asks as a visitor with no session.

**Protected forms.** A form protection with a time limit (the Honeypot module) refuses a form that is sent too soon. `I wait out the form time limit` waits `formWait` milliseconds in front of the submit; `loginWait` does the same inside the login by handle. webship-js's `I wait 5 seconds` is a budget for the page to settle, not a delay, so it does not help here.

**Roles and permissions.** `the "Content editor" role should have the "access content overview" permission` reads the role's permissions form with the current session. It needs no command line, so it runs against any site the suite can log in to. The permission is named by its machine name or by its title on the form.

**What a site may lack.** The Standard profile of Drupal 11.4 installs no content type, no Contact and no Search, and Drupal 12 moved Contact and Search out of core. A step that needs one of them says so when the site does not have it, with what the site's build has to provide:

```
The site has no "article" content type.
  Why: /node/add/article answered 404
  Hint: A site has only the content types its build created ...
```

## Tags

| Tag | Meaning |
| --- | --- |
| `@critical` | the smoke lane: `CUCUMBER_TAGS=@critical npm test` |
| `@a11y` | the accessibility audit |
| `@any-theme` | scenarios that rely on nothing a theme prints by choice; CI runs them again under Stark |
| `@search` | scenarios that need the Search module and an index |
| `@drupal11`, `@drupal12` | a scenario that applies to that major version only |
| `@provisioning` | the optional feature that creates and removes accounts; not part of the default run |
| `@mobile` | a scenario that sets a phone breakpoint |
| `@js-off`, `@js-warn`, `@js-fail` | how JavaScript errors are reported for the scenario; the 403 and 404 features carry `@js-off` because core's error pages log an expected error |
| `@video`, `@no-video` | record, or never record, the scenario when `video.mode` is `tag` |
| `@wip` | left out of every run |
| `@auth-setup` | the scenario that saves an auth state; run it first, on its own |

## Recipes that need no step of their own

```gherkin
# A JSON:API document (core's jsonapi module).
Given the API base URL is "https://your-drupal-site.example"
When I send a GET request to "/jsonapi"
Then the API response code should be 200
And the JSON response should have property "jsonapi.version"

# A sortable Views listing.
Then the table "table.views-table" should be sorted by "Title" in "ascending" order

# Keyboard order of the login form.
Given I am on the login page
When I press the key "Tab"
Then the focused element should match "#edit-name"

# No third-party request while a page renders.
Given the URL "**/google-analytics.com/**" is blocked
When I am on the homepage
Then no request to "**/google-analytics.com/**" should have been made
```

## Running this repository's own suite

The repository is a working webship-js project. Its features run against a Drupal site that [DDEV](https://ddev.com/) builds in `drupal/`: a Standard profile installation, the accounts of the users registry, and a small set of fixtures. Only `drupal/.ddev/config.yaml` is committed; the code base is created for each run. `tests/seed/build-site.sh` is the whole build, and CI runs the same script for Drupal 11 and for Drupal 12.

```bash
tests/seed/build-site.sh 11        # or: tests/seed/build-site.sh 12
npm install
npx playwright install --with-deps chromium
LAUNCH_URL=http://drupal-core-steps-site.ddev.site npm test                   # Drupal 11
DRUPAL_MAJOR=12 LAUNCH_URL=http://drupal-core-steps-site.ddev.site npm test   # Drupal 12
```

What the build adds to a Standard installation:

| | Drupal 11 | Drupal 12 |
| --- | --- | --- |
| Accounts | `editor` and `reviewer_with_a_long_name` (Content editor), `authenticated` (no role), created with drush | the same |
| Content types | Article and Basic page, from the core recipes | Article and Basic page, created by `tests/seed/drupal-12-site.php` (Drupal 12 ships no recipe for them) |
| Media | the Image media type, from the core recipe | the Image media type, created by the same script |
| Contact | the core module and a site-wide form | the `contact` project and a site-wide form |
| Search | the core module, the node search page, an index | the `search` project, the node search page, an index |
| Fixtures (`tests/seed/standard-fixtures.php`) | a "Media" field on Article, one media item, "Sample article" at `/sample-article`, Layout Builder on the Article display | the same |

| Script | Effect |
| --- | --- |
| `npm test` | the suite |
| `npm run test:dry` | `--dry-run`: undefined and ambiguous steps, no browser |
| `npm run test:examples` | no browser: every step has a JSDoc block with five `Example #n:` lines, each example matches its own definition and no other, and every feature step resolves to exactly one definition |
| `npm run test:provisioning` | the optional provisioning feature, with its own registry |
| `npm run test:headed` | a visible browser |
| `npm run test:chromium`, `test:firefox`, `test:webkit` | a specific browser |

Against DDEV's HTTPS URL, give Node the local certificate authority as well, because one webship-js step requests the page outside the browser: `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" LAUNCH_URL=https://drupal-core-steps-site.ddev.site npm test`.

## Optional: provisioning accounts from the suite

The recommended setup is [Accounts are configuration](#accounts-are-configuration). For a project that cannot create its accounts in the build, the pack keeps two steps that do it through the People administration:

```gherkin
Given I add the testing users
Given I delete the testing users
```

`I add the testing users` creates every account of the registry that does not exist yet, with its email, its password and the `roles` it lists, and leaves existing accounts alone. `I delete the testing users` removes them, with their content. Neither touches the entry marked `isAdmin: true`. Keep the two steps in one feature of their own, tagged so that it can be left out of a run. This repository does so in `tests/features/optional-provisioning-users.feature` (`@provisioning`), which has its own profile and its own registry of temporary accounts in `cucumber.js`:

```bash
npm run test:provisioning
```

## Contributing

Issues and pull requests are welcome at [github.com/webship/drupal-core-steps](https://github.com/webship/drupal-core-steps). `2.0.x` is the active branch; every change lands through a pull request with a green test run. A new step needs a JSDoc block with five examples and a scenario that runs it against the real site.

## License

MIT © Webship.co. See [LICENSE](LICENSE).
