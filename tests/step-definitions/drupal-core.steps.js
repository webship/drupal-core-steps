'use strict';

// Step definitions for the markup a Drupal *core* installation renders on its
// own — regardless of which theme or distribution sits on top of it — because
// they target conventions that come from core's preprocess functions, Form API
// and core module templates rather than from theme templates:
//
//   - body classes `template_preprocess_html()` always adds
//     (`path-frontpage`, `path-admin`, `page-node-type-<type>`, `user-logged-in`)
//   - the Toolbar module's `#toolbar-administration` bar and the Navigation
//     module's `#admin-toolbar` sidebar
//   - the System module's `.breadcrumb` block, the `.tabs` local-tasks block and
//     the `.messages--status` / `.messages--warning` / `.messages--error` markup
//   - Form API element ids, derived deterministically from field machine names
//     (`#edit-name`, `#edit-pass`, `#edit-submit`, ...) and therefore identical
//     on Olivero, Claro, Stable9 or any custom base theme
//   - the `h1.page-title` the page-title block renders, and the
//     `drupal-settings-json` script tag core's asset pipeline emits
//   - the Views module's `.view-empty` "no results" region
//   - the Search module's `.search-results` listing and the Contact module's
//     default "feedback" form
//   - the `Generator` meta tag / `X-Generator` header, and the
//     `X-Drupal-Cache` / `X-Drupal-Dynamic-Cache` page-cache headers
//
// The Gherkin phrasing stays product-agnostic ("the login form", "the front
// page", ...); only these comments name the CMS, to document which convention
// each step targets. The one exception is the two steps that assert the site
// *is* Drupal, where naming it is the whole point.
//
// Composes with webship-js's built-in steps (navigation, assertion, form,
// response, accessibility, ...) rather than duplicating them. Anything the core
// pack already covers — "the response status code should be 200", "I should be
// on the homepage", "I should see a ".foo" element" — belongs in the feature
// file as a core step, not here.

const { Given, When, Then, Before } = require('@cucumber/cucumber');
const assert = require('assert');
const {
  gotoUrl,
  waitForPageLoad,
  fillField,
  friendly,
} = require('webship-js/tests/step-definitions/webship');
const {
  WAIT_TIMEOUT,
  VISIBLE_SUBMIT,
  supplied,
  budget,
  navigate,
  waitForState,
  assertPresence,
  assertContainsText,
  resolveUser,
  submitInPage,
  loginWithForm,
  robustClick,
  setCkeditorData,
  checkboxStateByLabel,
  checkboxStateByHandle,
  sessionStatus,
  currentNodeId,
} = require('./drupal-helpers');

// ---------------------------------------------------------------------------
// Helpers
//
// The generic plumbing (optional-argument handling, presence and text
// assertions, the users registry, the robust in-page submit, CKEditor 5 and
// checkbox lookups) lives in ./drupal-helpers.js so other step packs can
// require it instead of copying it. Only the tables that name core's own
// routes, forms and headers stay here.
// ---------------------------------------------------------------------------

/**
 * Reduce a phrasing variant ("sign-in", "sign up", "contact us", "my account")
 * to the single name the route and form tables below are keyed by.
 *
 * @param {string} phrase
 * @returns {string}
 */
function canonicalName(phrase) {
  return {
    login: 'login',
    signin: 'login',
    register: 'registration',
    registration: 'registration',
    signup: 'registration',
    passwordreset: 'password',
    resetpassword: 'password',
    forgotpassword: 'password',
    search: 'search',
    contentsearch: 'search',
    contact: 'contact',
    contactus: 'contact',
    admin: 'admin',
    administration: 'admin',
    contentoverview: 'content',
    people: 'people',
    useradministration: 'people',
    module: 'modules',
    modules: 'modules',
    appearance: 'appearance',
    statusreport: 'status',
    addcontent: 'nodeadd',
    contentcreation: 'nodeadd',
    userprofile: 'profile',
    myaccount: 'profile',
    siteinformation: 'siteinfo',
  }[phrase.toLowerCase().replace(/[\s-]+/g, '')];
}

// Core's own paths for the pages these steps name. Every one of them is a route
// core itself defines, so they resolve on any install that has the owning
// module enabled — no path aliases, no site-specific menu links.
const ROUTES = {
  login: '/user/login',
  registration: '/user/register',
  password: '/user/password',
  search: '/search/node',
  contact: '/contact',
  admin: '/admin',
  content: '/admin/content',
  people: '/admin/people',
  modules: '/admin/modules',
  appearance: '/admin/appearance',
  status: '/admin/reports/status',
  nodeadd: '/node/add',
  profile: '/user',
  siteinfo: '/admin/config/system/site-information',
};

// Form ids core derives from each form's machine name, plus the fields that
// must be present for the form to be usable. The second selector in each pair
// is the class Form API puts on the same element, which survives the id
// suffixing (`#user-login-form--2`) that happens when a form is rendered twice.
const FORMS = {
  login: {
    selector: '#user-login-form, form.user-login-form',
    fields: ['#edit-name', '#edit-pass'],
  },
  registration: {
    selector: '#user-register-form, form.user-register-form',
    fields: [],
  },
  password: {
    selector: '#user-pass, form.user-pass',
    fields: ['#edit-name'],
  },
  contact: {
    selector: '#contact-message-feedback-form, form.contact-message-feedback-form',
    fields: [],
  },
  search: {
    selector: '#search-form, form.search-form, #search-block-form',
    fields: [],
  },
  siteinfo: {
    selector: '#system-site-information-settings, form.system-site-information-settings',
    fields: ['#edit-site-name'],
  },
};

// Titles core's System module gives its default error pages.
const ERROR_PAGES = {
  accessdenied: 'Access denied',
  403: 'Access denied',
  404: 'Page not found',
  pagenotfound: 'Page not found',
};

// Core's cache-state response headers, keyed by the name the step uses.
const CACHE_HEADERS = {
  page: 'x-drupal-cache',
  internalpage: 'x-drupal-cache',
  dynamicpage: 'x-drupal-dynamic-cache',
};

// ---------------------------------------------------------------------------
// Response capture
//
// Records the headers of the last main-frame navigation so the cache-header
// steps below can read the *original* response. Re-requesting the URL to read
// them, as a generic header step must, would report the cache state of that
// second request instead — turning every MISS into a HIT.
// ---------------------------------------------------------------------------

Before({ order: 110 }, async function () {
  if (!this.page) return;
  this._drupalResponseHeaders = null;
  this.page.on('response', (response) => {
    try {
      if (response.request().isNavigationRequest() && response.frame() === this.page.mainFrame()) {
        this._drupalResponseHeaders = response.headers();
      }
    } catch {
      // A response that outlives its frame cannot be attributed; ignore it.
    }
  });
});

/**
 * Headers of the most recent main-frame navigation.
 *
 * @param {object} world
 * @returns {Object<string, string>}
 */
function navigationHeaders(world) {
  if (!world._drupalResponseHeaders) {
    throw friendly({
      message: 'No page response has been recorded yet.',
      hint: 'Navigate first — e.g. \'Given I am on the homepage\' — before asserting on response headers.',
    });
  }
  return world._drupalResponseHeaders;
}

// ---------------------------------------------------------------------------
// Navigation to well-known pages
// ---------------------------------------------------------------------------

/**
 * Go to one of the site's built-in pages by name, without hard-coding its path
 * in the feature file: login (`/user/login`), registration (`/user/register`),
 * password reset (`/user/password`), search (`/search/node`), contact
 * (`/contact`), the administration pages (`/admin`, `/admin/content`,
 * `/admin/people`, `/admin/modules`, `/admin/appearance`,
 * `/admin/reports/status`, `/admin/config/system/site-information`), content
 * creation (`/node/add`) or the current user's profile (`/user`).
 *
 * Example #1: Given I am on the login page
 * Example #2: Given we are on the sign-in page
 * Example #3: Given on the sign up page
 * Example #4: Given I am on the password reset page
 * Example #5: Given we are on the content search page
 * Example #6: Given I am on the administration page
 * Example #7: Given we are on the content overview page
 * Example #8: Given I am on the status report page
 * Example #9: Given I am on the my account page
 *
 */
Given(/^(I am |we are )*on the (login|sign-?in|registration|register|sign[ -]?up|password reset|reset password|forgot password|content search|search|contact[ -]?us|contact|administration|admin|content overview|people|user administration|modules?|appearance|status report|add content|content creation|user profile|my account|site information) page$/, async function (pronounCase, pageName) {
  const defaultTime = this.minWaitTime.page || 3000;
  await gotoUrl(this.page, this.launchUrl + ROUTES[canonicalName(pageName)]);
  await this.page.waitForSelector('body', { state: 'attached', timeout: WAIT_TIMEOUT });
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert one of the site's built-in forms is, or is not, visible — by the id
 * core derives from its machine name. Forms with fields the page is useless
 * without (login's username and password, the site-information form's site
 * name) additionally require those fields.
 *
 * Example #1: Then I should see the login form
 * Example #2: And should see the sign-in form
 * Example #3: Then we should see the registration form
 * Example #4: And I should see the password reset form
 * Example #5: Then we should see the contact us form
 * Example #6: And I should not see the login form
 *
 */
Then(/^(I |we )*should( not)* see the (login|sign-?in|registration|register|sign[ -]?up|password reset|reset password|forgot password|contact[ -]?us|contact|search|site information) form$/, async function (pronounCase, notCase, formName) {
  const name = canonicalName(formName);
  const form = FORMS[name];
  await assertPresence(this.page.locator(form.selector).first(), notCase, `the ${name} form ("${form.selector}")`);
  if (notCase) return;
  for (const field of form.fields) {
    await assertPresence(this.page.locator(field).first(), undefined, `the field "${field}"`);
  }
});

// ---------------------------------------------------------------------------
// Site identity
// ---------------------------------------------------------------------------

/**
 * Assert the site really is Drupal, via the `Generator` meta tag core's System
 * module emits — optionally pinning the major version, which is what turns a
 * smoke test into an upgrade guard.
 *
 * The one place naming the CMS in the Gherkin is the point rather than a leak:
 * the assertion has no meaning phrased generically.
 *
 * Example #1: Then the site should be running Drupal
 * Example #2: Then the site should be running Drupal 10
 * Example #3: And the site should be running Drupal 11
 * Example #4: Then the site should not be running Drupal 9
 * Example #5: And the site should not be running Drupal
 *
 */
Then(/^the site should( not)* be running Drupal(?: (\d+))?$/, async function (notCase, majorVersion) {
  const meta = this.page.locator('meta[name="Generator"]');
  const count = await meta.count();
  const content = count ? ((await meta.first().getAttribute('content')) || '') : '';
  const match = content.match(/^Drupal\s+(\d+)/i);
  const matches = Boolean(match) && (!supplied(majorVersion) || match[1] === String(majorVersion));
  const expected = supplied(majorVersion) ? `Drupal ${majorVersion}` : 'Drupal';

  assert.ok(
    notCase ? !matches : matches,
    friendly({
      message: notCase
        ? `Expected the site not to report itself as ${expected}.`
        : `Expected the site to report itself as ${expected}.`,
      cause: count
        ? `the Generator meta tag reads "${content}"`
        : 'the page has no <meta name="Generator"> tag',
      hint: 'Core emits this tag from the System module; a site can suppress it in settings or via a contrib module.',
    }).message
  );
});

/**
 * Assert core's asset pipeline delivered its settings payload — the
 * `drupal-settings-json` script tag, and the `drupalSettings` object core's
 * JavaScript builds from it. A page that renders but never initialises this is
 * a page whose aggregated JavaScript never arrived.
 *
 * Example #1: Then the core JavaScript settings should be initialized
 * Example #2: And the core JavaScript settings should be initialized
 * Example #3: Then the core JavaScript settings should not be initialized
 * Example #4: And the core JavaScript settings should not be initialized
 * Example #5: Then the core javascript settings should be initialized
 *
 */
Then(/^the core (?:JavaScript|javascript) settings should( not)* be initialized$/, async function (notCase) {
  const tag = this.page.locator('script[data-drupal-selector="drupal-settings-json"]');
  await assertPresence(tag, notCase, 'the settings payload (\'script[data-drupal-selector="drupal-settings-json"]\')', { attached: true });
  if (notCase) return;
  const initialized = await this.page.evaluate(() => typeof window.drupalSettings === 'object' && window.drupalSettings !== null);
  assert.ok(
    initialized,
    friendly({
      message: 'Expected the core JavaScript settings object to be initialized.',
      cause: 'the settings payload is in the markup but `window.drupalSettings` is not an object',
      hint: 'Core\'s drupal.js builds it from the payload — check the page for a JavaScript error that aborted it.',
    }).message
  );
});

// ---------------------------------------------------------------------------
// Core layout: front page, admin pages, admin bars, breadcrumb, tabs, title
// ---------------------------------------------------------------------------

/**
 * Assert the current page is — or is not — the route configured as the site's
 * front page, via the `path-frontpage` body class.
 *
 * Deliberately does not accept the one-word "frontpage": webship-js's own
 * "should be on the frontpage" already claims that phrasing (it compares URLs),
 * and a second definition for it would make every scenario using it ambiguous.
 *
 * Example #1: Then I should be on the front page
 * Example #2: And we should be on the front page
 * Example #3: Then should be on the front page
 * Example #4: And I should land on the front page
 * Example #5: Then we should not be on the front page
 *
 */
Then(/^(I |we )*should( not)* (?:be on|land on) the front page$/, async function (pronounCase, notCase) {
  await assertPresence(
    this.page.locator('body.path-frontpage'),
    notCase,
    'the front page body class ("body.path-frontpage")',
    { attached: true }
  );
});

/**
 * Assert the current page is — or is not — one of the site's administration
 * pages, via the `path-admin` body class core adds for any route flagged as an
 * admin route. That flag, not the URL prefix, is what decides whether the admin
 * theme is used, so this is the assertion that matches what a site actually
 * treats as "admin".
 *
 * Example #1: Then I should be on an admin page
 * Example #2: And we should be on an administration page
 * Example #3: Then should be on an admin page
 * Example #4: And I should not be on an admin page
 * Example #5: Then we should not be on an administration page
 *
 */
Then(/^(I |we )*should( not)* be on an admin(?:istration)? page$/, async function (pronounCase, notCase) {
  await assertPresence(
    this.page.locator('body.path-admin'),
    notCase,
    'the administration body class ("body.path-admin")',
    { attached: true }
  );
});

/**
 * Assert the Toolbar module's admin bar (`#toolbar-administration`) is, or is
 * not, present.
 *
 * Not the same check as the navigation sidebar step below: the two are separate,
 * mutually exclusive admin UIs, so keep whichever matches the module the site
 * has enabled. Waits for `attached` rather than `visible` because the module's
 * anti-flicker script keeps the bar hidden for a moment after load, which makes
 * a visibility wait flaky right after a login redirect.
 *
 * Example #1: Then I should see the toolbar
 * Example #2: And we should see the admin toolbar
 * Example #3: Then should see the administration toolbar
 * Example #4: And I should not see the toolbar
 * Example #5: Then we should not see the admin toolbar
 *
 */
Then(/^(I |we )*should( not)* see the (?:admin |administration )?toolbar$/, async function (pronounCase, notCase) {
  await assertPresence(
    this.page.locator('#toolbar-administration'),
    notCase,
    'the toolbar ("#toolbar-administration")',
    { attached: true }
  );
});

/**
 * Assert the Navigation module's admin sidebar (`#admin-toolbar`) is, or is not,
 * present.
 *
 * The counterpart to the toolbar step above, for the newer of the two admin
 * UIs; they target different markup, so neither replaces the other. The
 * negative form is the one that proves a logout really dropped the session's
 * admin privileges rather than just redirecting.
 *
 * Example #1: Then I should see the navigation sidebar
 * Example #2: And we should see the admin navigation sidebar
 * Example #3: Then should see the navigation sidebar
 * Example #4: And I should not see the navigation sidebar
 * Example #5: Then we should not see the admin navigation sidebar
 *
 */
Then(/^(I |we )*should( not)* see the (?:admin )?navigation sidebar$/, async function (pronounCase, notCase) {
  await assertPresence(
    this.page.locator('#admin-toolbar'),
    notCase,
    'the navigation sidebar ("#admin-toolbar")',
    { attached: true }
  );
});

/**
 * Assert the breadcrumb block (`.breadcrumb`) is, or is not, visible. Core
 * renders no breadcrumb at all where the trail would be empty — the front page
 * being the usual case — which is what the negative form checks.
 *
 * Example #1: Then I should see the breadcrumb
 * Example #2: And we should see the breadcrumbs
 * Example #3: Then should see the breadcrumb trail
 * Example #4: And I should not see the breadcrumb
 * Example #5: Then we should not see the breadcrumbs
 *
 */
Then(/^(I |we )*should( not)* see the breadcrumbs?(?: trail)?$/, async function (pronounCase, notCase) {
  await assertPresence(this.page.locator('.breadcrumb').first(), notCase, 'the breadcrumb block (".breadcrumb")');
});

/**
 * Assert the local-tasks block — the tab strip core builds from a module's
 * `*.links.task.yml` — is, or is not, present. Matched by the
 * `primary-tabs-title` label core's template references plus the `.tabs`
 * classes, so it holds across base themes.
 *
 * Example #1: Then I should see the local tasks
 * Example #2: And we should see the tabs
 * Example #3: Then should see the primary tabs
 * Example #4: And I should see the local tasks
 * Example #5: Then we should not see the local tasks
 *
 */
Then(/^(I |we )*should( not)* see the (?:primary )?(?:local tasks|tabs)$/, async function (pronounCase, notCase) {
  await assertPresence(
    this.page.locator('[aria-labelledby="primary-tabs-title"], .tabs--primary, nav.tabs').first(),
    notCase,
    'the local tasks block (".tabs")'
  );
});

/**
 * Assert the page-title block's heading (`h1.page-title`) contains, or does
 * not contain, a text. This is the *rendered* title core puts in the page
 * body, which is not always the `<title>` element webship-js's own title steps
 * read — admin pages in particular append the site name to one and not the
 * other.
 *
 * Example #1: Then I should see the page title "Log in"
 * Example #2: And we should see the page heading "Content"
 * Example #3: Then should see the page title "Status report"
 * Example #4: And I should not see the page heading "Access denied"
 * Example #5: Then we should see the page title "Reset your password"
 *
 */
Then(/^(I |we )*should( not)* see the page (?:title|heading) "([^"]*)?"$/, async function (pronounCase, notCase, expectedTitle) {
  const heading = this.page.locator('h1.page-title, h1.title, h1').first();
  await assertPresence(heading, undefined, 'the page title ("h1.page-title")');
  await assertContainsText(heading, expectedTitle, 'the page title', { negated: Boolean(notCase) });
});

// ---------------------------------------------------------------------------
// Status messages
// ---------------------------------------------------------------------------

/**
 * Assert a status message (`.messages--status`) is, or is not, visible, and —
 * when a text is given — that it contains that text. This is the markup core
 * renders for every successful save, so it doubles as the "did that action
 * actually take" assertion.
 *
 * Example #1: Then I should see a status message
 * Example #2: And we should see a success message
 * Example #3: Then should see a confirmation message
 * Example #4: And I should see the status message "The configuration options have been saved."
 * Example #5: Then we should not see a status message
 *
 */
Then(/^(I |we )*should( not)* see (?:a|the) (?:status|success|confirmation) message(?: "([^"]*)")?$/, async function (pronounCase, notCase, expectedText) {
  // Core's template carries the class; a theme with its own template still
  // carries the aria-label core sets on every message.
  const message = this.page.locator('.messages--status, [aria-label="Status message"]').first();
  await assertPresence(message, notCase, 'a status message (".messages--status" or aria-label "Status message")');
  if (notCase) return;
  await assertContainsText(message, expectedText, 'the status message');
});

/**
 * Assert a warning message (`.messages--warning`) is, or is not, visible — the
 * middle severity core uses for "this worked, but you should know something",
 * such as the notices the status report and the module install screens raise.
 *
 * Example #1: Then I should see a warning message
 * Example #2: And we should see a warning
 * Example #3: Then should see a warning message
 * Example #4: And I should see the warning message "Update notifications are not enabled."
 * Example #5: Then we should not see a warning message
 *
 */
Then(/^(I |we )*should( not)* see (?:a|the) warning(?: message)?(?: "([^"]*)")?$/, async function (pronounCase, notCase, expectedText) {
  const message = this.page.locator('.messages--warning, [aria-label="Warning message"]').first();
  await assertPresence(message, notCase, 'a warning message (".messages--warning" or aria-label "Warning message")');
  if (notCase) return;
  await assertContainsText(message, expectedText, 'the warning message');
});

/**
 * Assert an error message (`.messages--error`) is, or is not, visible — the
 * markup core renders for failed validation, rejected credentials and access
 * notices alike — and, when a text is given, that it contains that text.
 *
 * Example #1: Then I should see an error message
 * Example #2: And we should see a validation error
 * Example #3: Then should see a form error
 * Example #4: And I should see a login error "Unrecognized username or password."
 * Example #5: Then we should not see an error message
 *
 */
Then(/^(I |we )*should( not)* see an? (?:validation |form |login |sign-?in |authentication )?error(?: message)?(?: "([^"]*)")?$/, async function (pronounCase, notCase, expectedText) {
  const message = this.page.locator('.messages--error, [aria-label="Error message"]').first();
  await assertPresence(message, notCase, 'an error message (".messages--error" or aria-label "Error message")');
  if (notCase) return;
  await assertContainsText(message, expectedText, 'the error message');
});

// ---------------------------------------------------------------------------
// Content pages
// ---------------------------------------------------------------------------

/**
 * Assert the current page renders content of the given type — or does not —
 * via the `page-node-type-<type>` body class. The argument is the content
 * type's machine name, not its label.
 *
 * Example #1: Then I should be on an "article" page
 * Example #2: And we should be on a "page" content page
 * Example #3: Then should be on a "basic_page" page
 * Example #4: And I should be on an "event" page
 * Example #5: Then we should not be on an "article" page
 *
 */
Then(/^(I |we )*should( not)* be on an? "([^"]*)?"(?: content)? page$/, async function (pronounCase, notCase, contentType) {
  await assertPresence(
    this.page.locator(`body.page-node-type-${contentType}`),
    notCase,
    `the content-type body class ("body.page-node-type-${contentType}")`,
    { attached: true }
  );
});

/**
 * Create a content item through core's node form: open `/node/add/<type>`, fill
 * the title field (`#edit-title-0-value`, the id Form API derives from the base
 * field's machine name and delta) and save.
 *
 * Example #1: When I create an "article" content item titled "Release notes"
 * Example #2: And we create a "page" content item titled "About us"
 * Example #3: When create an "article" node titled "Hello world"
 * Example #4: And I create a "basic_page" content item with title "Terms"
 * Example #5: When we create an "event" node with title "Launch party"
 *
 */
When(/^(I |we )*create an? "([^"]*)?" (?:content item|node) (?:titled|with title) "([^"]*)?"$/, async function (pronounCase, contentType, title) {
  const defaultTime = this.minWaitTime.page || 3000;
  await gotoUrl(this.page, `${this.launchUrl}/node/add/${contentType}`);
  await waitForPageLoad(this.page, defaultTime);
  const titleField = this.page.locator('#edit-title-0-value');
  await waitForState(
    titleField,
    'visible',
    `Expected the node form's title field ("#edit-title-0-value") on /node/add/${contentType}`
  );
  await titleField.fill(title);
  await this.page.locator(VISIBLE_SUBMIT).first().click();
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert a Views listing reported no results — the `views-empty` region core's
 * `views-view` template renders in place of rows — or that it did return some.
 * Every core admin listing (content, people, files, the watchdog log) is a
 * View, so this is how you assert on an empty one without matching its
 * site-specific "no results" wording. Both spellings of the class are matched:
 * core's own templates use `views-empty`, several base themes `view-empty`.
 *
 * Example #1: Then I should see an empty listing
 * Example #2: And we should see an empty view
 * Example #3: Then should see an empty listing
 * Example #4: And I should see a non-empty listing
 * Example #5: Then we should see a non-empty view
 *
 */
Then(/^(I |we )*should see (an empty|a non-?empty) (?:view|listing)$/, async function (pronounCase, polarity) {
  const negated = polarity.startsWith('a non');
  await assertPresence(
    this.page.locator('.views-empty, .view-empty').first(),
    negated ? ' not' : undefined,
    'an empty-view region (".views-empty")'
  );
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Fill and submit the login form (`#edit-name`, `#edit-pass`, `#edit-submit`).
 *
 * Example #1: When I log in as "admin" with password "admin"
 * Example #2: And we log in as "editor" with password "p@ssw0rd"
 * Example #3: When log in as "reviewer" with password "hunter2"
 * Example #4: And I sign in as "site_manager" with password "letmein"
 * Example #5: When we sign in as "admin" with password "admin"
 *
 */
When(/^(I |we )*(?:log in|sign in) as "([^"]*)?" with password "([^"]*)?"$/, async function (pronounCase, username, password) {
  const defaultTime = this.minWaitTime.page || 3000;
  await fillField(this.page, 'name', username);
  await fillField(this.page, 'pass', password);
  await this.page.locator(VISIBLE_SUBMIT).first().click();
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert the session is, or is not, authenticated, via the `user-logged-in`
 * body class. The negative form is what confirms a logout actually destroyed
 * the session rather than merely redirecting.
 *
 * Example #1: Then I should be logged in
 * Example #2: And we should be signed in
 * Example #3: Then should be authenticated
 * Example #4: And I should not be logged in
 * Example #5: Then we should not be authenticated
 *
 */
Then(/^(I |we )*should( not)* be (?:logged in|signed in|authenticated)$/, async function (pronounCase, notCase) {
  await assertPresence(
    this.page.locator('body.user-logged-in'),
    notCase,
    'the authenticated-user body class ("body.user-logged-in")',
    { attached: true }
  );
});

/**
 * Log the current session out via `/user/logout`.
 *
 * As of core 10.3 a bare GET to `/user/logout` no longer ends the session: it
 * renders a CSRF-protected confirmation form (`#user-logout-confirm`) instead.
 * This step submits that confirmation when it appears, and falls through
 * unchanged on older versions that log out on the GET itself.
 *
 * Example #1: When I log out
 * Example #2: And we log out
 * Example #3: When I logout
 * Example #4: And I sign out
 * Example #5: When we sign out
 *
 */
When(/^(I |we )*(?:log ?out|sign out)$/, async function (pronounCase) {
  const defaultTime = this.minWaitTime.page || 3000;
  await gotoUrl(this.page, this.launchUrl + '/user/logout');
  await this.page.waitForSelector('body', { state: 'attached', timeout: WAIT_TIMEOUT });
  await waitForPageLoad(this.page, defaultTime);
  const confirmSubmit = this.page.locator('#user-logout-confirm #edit-submit');
  if (await confirmSubmit.isVisible({ timeout: 5000 }).catch(() => false)) {
    await confirmSubmit.click();
    await waitForPageLoad(this.page, defaultTime);
  }
});

/**
 * Submit the one-time-login request form at `/user/password`, which core keys
 * by either a username or an email address in the same `name` field.
 *
 * Assumes the form is already on screen — pair it with "Given I am on the
 * password reset page" — so the step stays usable when the form is reached from
 * the login screen's own tab instead.
 *
 * Example #1: When I request a new password for "admin"
 * Example #2: And we request a new password for "editor"
 * Example #3: When request a password reset for "admin@example.com"
 * Example #4: And I request a password reset for "no-such-user"
 * Example #5: When we request a new password for "site_manager"
 *
 */
When(/^(I |we )*request a (?:new password|password reset) for "([^"]*)?"$/, async function (pronounCase, identifier) {
  const defaultTime = this.minWaitTime.page || 3000;
  await fillField(this.page, 'name', identifier);
  await this.page.locator(VISIBLE_SUBMIT).first().click();
  await waitForPageLoad(this.page, defaultTime);
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search for a term by filling the keyword field (`input[name="keys"]`, the
 * name core uses for both the search block and the search page) and submitting.
 *
 * Example #1: When I search for "webship"
 * Example #2: And we search for "cucumber"
 * Example #3: When search for "playwright"
 * Example #4: And I search for "sample title"
 * Example #5: When we search for "example"
 *
 */
When(/^(I |we )*search for "([^"]*)?"$/, async function (pronounCase, term) {
  const defaultTime = this.minWaitTime.page || 3000;
  // `input[name="keys"]` is not unique on the search page: a header search
  // block renders its own collapsed field with the same name alongside the
  // search page's own. Filter to the visible one.
  const keys = this.page.locator('input[name="keys"]:visible').first();
  await waitForState(keys, 'visible', 'Expected the search keyword field (\'input[name="keys"]\') to be visible');
  await keys.fill(term);
  await keys.press('Enter');
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert the search returned results (`.search-results`), or — with "no" or
 * "not" — that it reported none, via the module's default "Your search yielded
 * no results." message.
 *
 * Example #1: Then I should see search results
 * Example #2: And we should see search results
 * Example #3: Then should see search results
 * Example #4: And I should see no search results
 * Example #5: Then we should not see search results
 *
 */
Then(/^(I |we )*should( not)* see (no )?search results$/, async function (pronounCase, notCase, noCase) {
  if (notCase || noCase) {
    await assertPresence(
      this.page.getByText('Your search yielded no results.').first(),
      undefined,
      'the "no results" message'
    );
    return;
  }
  await assertPresence(this.page.locator('.search-results'), undefined, 'the search results list (".search-results")', { attached: true });
});

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

/**
 * Fill and submit the default contact form. Anonymous submissions also need a
 * name and an email address: when those fields are present they are filled
 * from the `anonymous` entry of the users registry
 * (`worldParameters.users.anonymous`, keys `name` and `email`), falling back
 * to "Webship QA" / "qa@example.com".
 *
 * Example #1: When I submit the contact form with subject "Question" and message "Hello there"
 * Example #2: And we submit the contact form with subject "Support" and message "Need help"
 * Example #3: When submit the contact form with subject "Feedback" and message "Great site"
 * Example #4: And I submit the contact form with subject "Bug report" and message "Found an issue"
 * Example #5: When we submit the contact form with subject "General" and message "Just saying hi"
 *
 */
When(/^(I |we )*submit the contact form with subject "([^"]*)?" and message "([^"]*)?"$/, async function (pronounCase, subject, message) {
  const defaultTime = this.minWaitTime.page || 3000;
  const anonymous = ((this.parameters && this.parameters.users) || {}).anonymous || {};
  const nameField = this.page.locator('#edit-name');
  if (await nameField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await fillField(this.page, 'name', anonymous.name || anonymous.username || 'Webship QA');
  }
  const mailField = this.page.locator('#edit-mail');
  if (await mailField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await fillField(this.page, 'mail', anonymous.email || 'qa@example.com');
  }
  await fillField(this.page, 'subject[0][value]', subject);
  await fillField(this.page, 'message[0][value]', message);
  await this.page.locator(VISIBLE_SUBMIT).first().click();
  await waitForPageLoad(this.page, defaultTime);
});

// ---------------------------------------------------------------------------
// Error pages
// ---------------------------------------------------------------------------

/**
 * Assert the current page is — or is not — the default access-denied (403) or
 * not-found (404) page, by the title the System module gives each.
 *
 * Checks the rendered title rather than the status code so it still holds when
 * a site serves a custom error page node; pair it with webship-js's "the
 * response status code should be 403" when both matter.
 *
 * Example #1: Then I should be on the access denied page
 * Example #2: And we should be on the 403 page
 * Example #3: Then should be on the 404 page
 * Example #4: And I should land on the page not found page
 * Example #5: Then we should not be on the access denied page
 *
 */
Then(/^(I |we )*should( not)* (?:be on|land on) the (access denied|403|404|page not found) page$/, async function (pronounCase, notCase, pageName) {
  const title = ERROR_PAGES[pageName.replace(/\s+/g, '')];
  // The page title block is what core renders; some admin themes move the
  // title out of the page (the Navigation top bar) and leave no <h1>, so the
  // document title core's System module sets for the error route counts too.
  try {
    await this.page.waitForFunction(
      ({ expected, negated }) => {
        const inHeading = [...document.querySelectorAll('h1')].some((h) => (h.textContent || '').includes(expected));
        const inTitle = (document.title || '').trim().startsWith(expected);
        return negated ? !(inHeading || inTitle) : (inHeading || inTitle);
      },
      { expected: title, negated: Boolean(notCase) },
      { timeout: WAIT_TIMEOUT }
    );
  } catch (error) {
    throw friendly(
      notCase
        ? `Expected not to be on the "${title}" error page`
        : `Expected the "${title}" error page (an <h1> or the document title starting with "${title}")`,
      error
    );
  }
});

// ---------------------------------------------------------------------------
// Page cache
// ---------------------------------------------------------------------------

/**
 * Assert how core's caching layers answered the last navigation, via the
 * `X-Drupal-Cache` (Internal Page Cache — anonymous, whole-response) and
 * `X-Drupal-Dynamic-Cache` (Dynamic Page Cache — authenticated, per-block)
 * headers. A "HIT" is a cached response; anything else — "MISS",
 * "UNCACHEABLE" or a missing header — is not.
 *
 * Reads the headers recorded for the original navigation rather than
 * re-requesting the URL, because a second request would report its own cache
 * state and turn every MISS into a HIT.
 *
 * Example #1: Then the page should be served from the page cache
 * Example #2: And the response should be served from the page cache
 * Example #3: Then the page should not be served from the page cache
 * Example #4: And the page should be served from the dynamic page cache
 * Example #5: Then the page should not be served from the dynamic page cache
 *
 */
Then(/^(?:the )?(?:page|response) should( not)* be served from the (dynamic page|internal page|page) cache$/, async function (notCase, cacheName) {
  const header = CACHE_HEADERS[cacheName.replace(/\s+/g, '')];
  const headers = navigationHeaders(this);
  const value = headers[header];
  const hit = String(value || '').toUpperCase() === 'HIT';

  assert.ok(
    notCase ? !hit : hit,
    friendly({
      message: notCase
        ? `Expected the response not to come from the ${cacheName} cache.`
        : `Expected the response to come from the ${cacheName} cache.`,
      cause: supplied(value)
        ? `"${header}" was "${value}"`
        : `the response carried no "${header}" header`,
      hint: 'The Internal Page Cache only serves anonymous requests; the Dynamic Page Cache only serves cacheable ones.',
    }).message
  );
});

// ---------------------------------------------------------------------------
// Users registry and session
// ---------------------------------------------------------------------------

/**
 * Log in as a user from the `worldParameters.users` registry in cucumber.js,
 * by its handle rather than by typing credentials into the feature file:
 *
 *   users: {
 *     admin:  { username: 'admin',  password: process.env.DRUPAL_ADMIN_PASS || 'admin' },
 *     editor: { username: 'editor', password: process.env.DRUPAL_EDITOR_PASS || 'editor' },
 *   }
 *
 * Opens `/user/login`, fills `#edit-name` and `#edit-pass` and submits by
 * dispatching the submit button's click inside the page, with the navigation
 * wait armed in the same `Promise.all`, then settles the landing page. The
 * in-page submit is what keeps the login reliable under a sticky bar, a chat
 * widget or a cookie banner that covers the button and would otherwise turn a
 * pointer click into an actionability timeout.
 *
 * For suites that log in often, pair it once with webship-js's "I save the
 * auth state to" step and restore that state in the other scenarios.
 *
 * Example #1: Given I am a logged in user with the "admin" user
 * Example #2: Given I am a logged in user with the username "editor"
 * Example #3: Given we are a logged in user with "admin"
 * Example #4: Given a logged in user with the "editor" user
 * Example #5: And I am a logged in user with the "content editor" user
 *
 */
Given(/^(I am |we are )*a logged in user with( the)*( username)* "([^"]*)?"( user)*$/, async function (pronounCase, theCase, usernameCase, handle, userCase) {
  const user = resolveUser(this, handle);
  if (!supplied(user.password)) {
    throw friendly({
      message: `User "${handle}" has no password configured.`,
      hint: 'Set users.<handle>.password in cucumber.js worldParameters (an environment variable is the usual source).',
    });
  }
  await loginWithForm(this, user.username, user.password);
});

/**
 * Make sure the session is anonymous: drop the browser's cookies and web
 * storage, reload, then confirm by opening `/user/login` and seeing the login
 * form (an authenticated visitor is redirected to their profile instead).
 *
 * The companion of the login step above for the "Given" half of an
 * access-control scenario. webship-js's "I am an anonymous user" clears the
 * cookies and opens the front page; this one additionally proves the site
 * treats the session as anonymous.
 *
 * Example #1: Given I am not logged in
 * Example #2: Given we are not logged in
 * Example #3: Given not logged in
 * Example #4: And I am not logged in
 * Example #5: But I am not logged in
 *
 */
Given(/^(I am |we are )*not logged in$/, async function (pronounCase) {
  await this.context.clearCookies();
  await this.page.evaluate(() => {
    try { window.localStorage.clear(); } catch (e) { /* storage may be unavailable */ }
    try { window.sessionStorage.clear(); } catch (e) { /* storage may be unavailable */ }
  }).catch(() => {});
  if (/^https?:/.test(this.page.url())) {
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  await navigate(this, '/user/login');
  await assertPresence(
    this.page.locator(FORMS.login.selector).first(),
    undefined,
    'the login form (the session should be anonymous)'
  );
});

/**
 * Assert the HTTP status the *current session* gets for the current page, by
 * re-requesting it through the browser context's own cookie jar.
 *
 * webship-js's "the response status code should be" re-requests without the
 * session cookies, so it always answers as an anonymous visitor; use that for
 * public pages and this one when the answer depends on who is logged in (an
 * editor's 403 on `/admin/people`, an administrator's 200 on the same page).
 *
 * Example #1: Then the page should return HTTP status 200
 * Example #2: And the page should return HTTP status 403
 * Example #3: Then the current page should return status 404
 * Example #4: And the page should not return HTTP status 500
 * Example #5: Then the page should respond with status code 200
 *
 */
Then(/^(?:the )?(?:current )?page should( not)* (?:return|respond with) (?:HTTP |http )?status(?: code)? (\d+)$/, async function (notCase, expectedStatus) {
  const url = this.page.url();
  const status = await sessionStatus(this.page, url);
  const expected = parseInt(expectedStatus, 10);
  const matches = status === expected;
  assert.ok(
    notCase ? !matches : matches,
    friendly({
      message: notCase
        ? `Expected ${url} not to return HTTP ${expected} for the current session.`
        : `Expected ${url} to return HTTP ${expected} for the current session.`,
      cause: `it returned ${status}`,
      hint: 'This request carries the browser session cookies; the webship-js status step does not.',
    }).message
  );
});

// ---------------------------------------------------------------------------
// Listings and operations
// ---------------------------------------------------------------------------

/**
 * Assert a row of an administration listing (content, people, media, files,
 * taxonomy terms) offers, or does not offer, an operation link such as
 * "Edit", "Delete" or "Translate". The row is found by text, the operation
 * inside the row's operations cell (the Views `headers*="operations"` cell or
 * the dropbutton), hidden dropbutton entries included. The trailing noun is
 * cosmetic.
 *
 * The negative form also holds when the row itself is absent: an operation
 * cannot be seen on a row that is not listed, which is exactly how core hides
 * entities a role may not act on.
 *
 * Example #1: Then I should see the "Edit" operation for the "Sample article" content
 * Example #2: And I should see the "Delete" operation for the "Sample article" entity
 * Example #3: Then we should not see the "Edit" operation for the "Sample article" content
 * Example #4: And I should see the "Edit" operation for the "editor" user
 * Example #5: Then I should see the "Edit" operation for the "Sample image" media
 *
 */
Then(/^(I |we )*should( not)* see the "([^"]*)" operation for the "([^"]*)"(?: (?:entity|content|item|media|file|term|user|row))?$/, async function (pronounCase, notCase, operation, rowText) {
  await this.page.locator('tr', { hasText: rowText }).first()
    .waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
  const found = await this.page.evaluate(({ rowText, operation }) => {
    const row = [...document.querySelectorAll('tr')].find((tr) => tr.textContent.includes(rowText));
    if (!row) return { rowMissing: true, link: false };
    const cell = row.querySelector('[headers*="operations"], .dropbutton-wrapper, td:last-child');
    const scope = cell || row;
    const link = [...scope.querySelectorAll('a, button')].some((el) => el.textContent.trim() === operation);
    return { rowMissing: false, link };
  }, { rowText, operation });

  if (notCase) {
    if (found.rowMissing) return;
    assert.ok(!found.link, friendly(`The "${rowText}" row unexpectedly offers the "${operation}" operation.`).message);
    return;
  }
  if (found.rowMissing) {
    throw friendly(`No listing row containing "${rowText}" was found on the page.`);
  }
  assert.ok(found.link, friendly(`The "${rowText}" row does not offer the "${operation}" operation.`).message);
});

/**
 * Follow an operation link of a listing row by reading its `href` and
 * navigating there, instead of clicking it. Core keeps the secondary
 * operations collapsed inside a dropbutton, so the link is in the DOM but not
 * visible, and a pointer click would wait on it forever; navigating to the
 * link's target is what the click would have done anyway. "Edit" also
 * matches a link whose target ends in `/edit` when the link text differs.
 *
 * Example #1: When I open the "Edit" link in the "Sample article" row
 * Example #2: And I open the "Delete" operation in the "Sample article" row
 * Example #3: When we open the "Edit" link in the "editor" row
 * Example #4: And I open the "Translate" link in the "About us" row
 * Example #5: When I open the "Edit" operation in the "Sample image" row
 *
 */
When(/^(I |we )*open the "([^"]*)" (?:link|operation) in the "([^"]*)" row$/, async function (pronounCase, linkText, rowText) {
  await this.page.locator('tr', { hasText: rowText }).first()
    .waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
  const href = await this.page.evaluate(({ rowText, linkText }) => {
    const rows = [...document.querySelectorAll('tr')].filter((tr) => tr.textContent.includes(rowText));
    for (const tr of rows) {
      const links = [...tr.querySelectorAll('a[href]')];
      let link = links.find((a) => a.textContent.trim() === linkText);
      if (!link && linkText.toLowerCase() === 'edit') {
        link = links.find((a) => /\/edit(\?|$)/.test(a.getAttribute('href')));
      }
      if (link) return link.getAttribute('href');
    }
    return null;
  }, { rowText, linkText });
  if (!href) {
    throw friendly(`No "${linkText}" link was found in the "${rowText}" row.`);
  }
  await navigate(this, href);
});

// ---------------------------------------------------------------------------
// Breadcrumb text
// ---------------------------------------------------------------------------

/**
 * Assert the breadcrumb block (`.breadcrumb`) contains, or does not contain,
 * a text. Reads the whole trail, so a parent several levels up still matches.
 * Fails distinctly when the page has no breadcrumb at all.
 *
 * Example #1: Then "Home" should be in the breadcrumb
 * Example #2: And "Administration" should be in the breadcrumb
 * Example #3: Then the breadcrumb should contain "Reports"
 * Example #4: And the breadcrumb should not contain "Log in"
 * Example #5: Then "Nowhere" should not be in the breadcrumb
 *
 */
Then(/^(?:"([^"]*)" should( not)* be in the breadcrumbs?|(?:the )?breadcrumbs? should( not)* contain "([^"]*)")$/, async function (textA, notA, notB, textB) {
  const text = supplied(textA) ? textA : textB;
  const notCase = supplied(textA) ? notA : notB;
  const breadcrumb = this.page.locator('.breadcrumb, nav.breadcrumb, [aria-label="Breadcrumb"]').first();
  await assertPresence(breadcrumb, undefined, 'the breadcrumb block (".breadcrumb")', { attached: true });
  await assertContainsText(breadcrumb, text, 'the breadcrumb trail', { negated: Boolean(notCase) });
});

// ---------------------------------------------------------------------------
// Checkbox state
// ---------------------------------------------------------------------------

/**
 * Assert a checkbox is checked or unchecked, found either by its visible label
 * text (`label[for]`, a wrapping label or a sibling label all work) or by a
 * machine handle: the DOM id Form API derives from the field name
 * (`edit-status-value`), a `data-drupal-selector` or a `name` attribute.
 *
 * Example #1: Then the checkbox labeled "Published" should be checked
 * Example #2: And the checkbox labeled "Sticky at top of lists" should be unchecked
 * Example #3: Then the checkbox with the id "edit-status-value" should be checked
 * Example #4: And the checkbox with the id "edit-sticky-value" should be unchecked
 * Example #5: Then the checkbox labelled "Promoted to front page" should be checked
 *
 */
Then(/^the checkbox (labeled|labelled|with the id) "([^"]*)" should be (checked|unchecked)$/, async function (how, handle, state) {
  const want = state === 'checked';
  const byLabel = how !== 'with the id';
  await this.page.locator(byLabel ? 'label' : 'input[type="checkbox"]').first()
    .waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
  const actual = byLabel
    ? await checkboxStateByLabel(this.page, handle)
    : await checkboxStateByHandle(this.page, handle);
  if (actual === null) {
    throw friendly({
      message: `No checkbox ${byLabel ? 'with the label' : 'with the id, data-drupal-selector or name'} "${handle}" was found.`,
      hint: byLabel ? 'Pass the visible label text, or use "the checkbox with the id" with its machine handle.' : 'Form API derives the id from the field name: status[value] becomes edit-status-value.',
    });
  }
  assert.strictEqual(
    actual,
    want,
    friendly(`The "${handle}" checkbox is ${actual ? 'checked' : 'unchecked'}, expected ${state}.`).message
  );
});

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * Assert an `<img>` whose `alt` or `title` attribute contains the given text
 * is, or is not, on the page. This is how an image field's alternative text
 * and title are checked without knowing the file URL or image style.
 *
 * Example #1: Then I should see an image with the "Sample image alt text" alt text
 * Example #2: And I should see an image with the "Sample image title text" title text
 * Example #3: Then we should see an image with the "Company logo" alt text
 * Example #4: And I should not see an image with the "Placeholder" alt text
 * Example #5: Then I should not see an image with the "Draft banner" title text
 *
 */
Then(/^(I |we )*should( not)* see an image with the "([^"]*)" (alt|title) text$/, async function (pronounCase, notCase, text, attribute) {
  const selector = `img[${attribute}*="${text.replace(/"/g, '\\"')}"]`;
  await assertPresence(
    this.page.locator(selector).first(),
    notCase,
    `an image with ${attribute} text containing "${text}" ("${selector}")`,
    { attached: true }
  );
});

// ---------------------------------------------------------------------------
// Rich text editor (CKEditor 5)
// ---------------------------------------------------------------------------

/**
 * Set the content of a CKEditor 5 rich text field, found by its label, name,
 * id or CSS selector. Writes through the editor instance core registers in
 * `Drupal.CKEditor5Instances`, so the value goes through the editor's own
 * model and is synced back to the source textarea; a plain "fill in" cannot
 * reach the editor's editable area. The value may be HTML.
 *
 * Example #1: When I fill in the rich text editor field "Body" with "Hello from the suite"
 * Example #2: And I fill in the rich text editor field "Body" with the "<p>Hello</p>"
 * Example #3: When we fill in the rich text editor field "Description" with "A short text"
 * Example #4: And I fill in the rich text editor field "edit-body-0-value" with "By id"
 * Example #5: When I fill in the rich text editor field "body[0][value]" with "By name"
 *
 */
When(/^(I |we )*fill in the rich text editor field "([^"]*)" with(?: the)? "([^"]*)"$/, async function (pronounCase, field, value) {
  const ok = await setCkeditorData(this.page, field, value, 'set');
  if (!ok) {
    throw friendly({
      message: `Could not find a CKEditor 5 editor for the field "${field}".`,
      hint: 'Pass the field label, name, id or selector of a text field whose format uses CKEditor 5.',
    });
  }
  await waitForPageLoad(this.page, budget(this));
});

/**
 * Append content to the end of a CKEditor 5 rich text field, keeping what is
 * already there. Same field resolution as the fill step.
 *
 * Example #1: When I append the rich text editor field "Body" with "<p>One more paragraph</p>"
 * Example #2: And I append after the rich text editor field "Body" with " and more"
 * Example #3: When we append the rich text editor field "Description" with "Tail"
 * Example #4: And I append the rich text editor field "edit-body-0-value" with "By id"
 * Example #5: When I append after the rich text editor field "Body" with "<p>Signed</p>"
 *
 */
When(/^(I |we )*append(?: after)? the rich text editor field "([^"]*)" with "([^"]*)"$/, async function (pronounCase, field, value) {
  const ok = await setCkeditorData(this.page, field, value, 'append');
  if (!ok) {
    throw friendly({
      message: `Could not find a CKEditor 5 editor for the field "${field}".`,
      hint: 'Pass the field label, name, id or selector of a text field whose format uses CKEditor 5.',
    });
  }
  await waitForPageLoad(this.page, budget(this));
});

/**
 * Press a toolbar button of a CKEditor 5 rich text field by the button's
 * accessible label ("Bold", "Link", "Insert Media", "Source"), or press the
 * save/insert/action button of the balloon that is currently open (a link
 * form, a media caption). The field argument is informational: core renders
 * one toolbar per editor and the balloon belongs to the focused editor.
 *
 * Example #1: When I click on "Bold" command button in the rich text editor field "Body"
 * Example #2: And I click on "Insert Media" command button in the rich text editor field "Body"
 * Example #3: When we click on "Link" command button in the rich text editor field "Body"
 * Example #4: And I click on the save button in "Body" rich text editor field
 * Example #5: When I click on the insert button in the "Body" rich text editor field
 *
 */
When(/^(I |we )*click on (?:"([^"]*)" command button in the rich text editor field "([^"]*)"|the (save|insert|action|apply) button in (?:the )?"([^"]*)" rich text editor field)$/, async function (pronounCase, command, commandField, actionWord, actionField) {
  if (supplied(command)) {
    const button = this.page.locator('.ck-toolbar button, .ck-balloon-panel button')
      .filter({ has: this.page.locator(`span.ck-button__label:text-is("${command}")`) })
      .first();
    const fallback = this.page.locator(`.ck button[aria-label="${command}"], .ck button[data-cke-tooltip-text="${command}"]`).first();
    const target = (await button.count()) ? button : fallback;
    if (!(await target.count())) {
      throw friendly(`No "${command}" command button was found in the rich text editor toolbar.`);
    }
    await robustClick(target);
  } else {
    const button = this.page.locator('button.ck-button-save, button.ck-button-action, .ck-balloon-panel button[type="submit"]').first();
    if (!(await button.count())) {
      throw friendly(`No ${actionWord} button was found for the "${actionField}" rich text editor field.`);
    }
    await robustClick(button);
  }
  await waitForPageLoad(this.page, budget(this));
});

// ---------------------------------------------------------------------------
// Media library
// ---------------------------------------------------------------------------

/**
 * Open the Media Library dialog of an entity reference field that uses the
 * media library widget, by the field's machine name. Core renders the open
 * button with the id `edit-<field>-open-button` (with a random suffix once
 * the form has been rebuilt by AJAX), so the visible button whose id contains
 * that fragment is the one clicked. Re-tries the click once when a previous
 * dialog's close animation tore the new one down.
 *
 * Example #1: When I open the "field_media" media library
 * Example #2: And I open the "field_image" media library
 * Example #3: When we open the "field_media_image" media library
 * Example #4: And I open the "field_hero" media library
 * Example #5: When I open the "field_gallery" media library
 *
 */
When(/^(I |we )*open the "([^"]*)" media library$/, async function (pronounCase, field) {
  const fragment = field.replace(/_/g, '-');
  const button = this.page
    .locator(`input[id*="${fragment}-open-button"]:visible, button[id*="${fragment}-open-button"]:visible`)
    .first();
  await waitForState(button, 'visible', `Expected the media library open button for the "${field}" field`);
  const dialog = this.page.locator('.ui-dialog .media-library-view, .media-library-widget-modal, .ui-dialog .media-library-wrapper').first();
  const open = async () => {
    await robustClick(button);
    await waitForPageLoad(this.page, budget(this));
  };
  await open();
  try {
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    await open();
    await waitForState(dialog, 'visible', `Expected the media library dialog for the "${field}" field to open`);
  }
});

/**
 * Tick a media item in the open Media Library dialog by its name, through the
 * "Select <name>" checkbox the library grid renders. Picks the first match
 * when several items carry the same name.
 *
 * Example #1: When I select the media "Sample image"
 * Example #2: And I select the media item "Sample image"
 * Example #3: When we select the media "Company logo"
 * Example #4: And I select the media "Annual report"
 * Example #5: When I select the media item "Intro video"
 *
 */
When(/^(I |we )*select the media(?: item)? "([^"]*)"$/, async function (pronounCase, name) {
  const checkbox = this.page.getByLabel(`Select ${name}`, { exact: true }).first();
  await waitForState(checkbox, 'attached', `Expected a media library item labelled "Select ${name}"`);
  if (!(await checkbox.isChecked().catch(() => false))) {
    await robustClick(checkbox);
  }
  await waitForPageLoad(this.page, budget(this));
});

/**
 * Press the open Media Library dialog's "Insert selected" button, placing the
 * ticked items into the field. The button is cloned into the jQuery UI dialog
 * button pane, so the visible copy is the one pressed; both phrasings do the
 * same thing.
 *
 * Example #1: When I insert the selected media
 * Example #2: And we insert the selected media
 * Example #3: When I submit the media library dialog
 * Example #4: And I submit media library dialog
 * Example #5: When we submit the media library dialog
 *
 */
When(/^(I |we )*(?:insert the selected media|submit (?:the )?media library dialog)$/, async function (pronounCase) {
  const button = this.page
    .locator('.ui-dialog-buttonpane button:has-text("Insert selected"), .ui-dialog button.media-library-select, .media-library-select[value="dialog-submit"]')
    .first();
  await waitForState(button, 'visible', 'Expected the media library dialog\'s "Insert selected" button');
  await robustClick(button);
  await this.page.locator('.ui-dialog .media-library-view').first()
    .waitFor({ state: 'hidden', timeout: WAIT_TIMEOUT }).catch(() => {});
  await waitForPageLoad(this.page, budget(this));
});

// ---------------------------------------------------------------------------
// Content items
// ---------------------------------------------------------------------------

/**
 * Open the add form of a content type (`/node/add/<type>`), by machine name or
 * by a label that maps to it ("Basic page" becomes `basic_page`; pass the
 * machine name when the label differs, as `page` does). Pair it with
 * webship-js's field steps and the rich text editor steps to fill the form,
 * and with "submit by id" to save it.
 *
 * Example #1: Given I am adding an "article"
 * Example #2: Given I am adding a "page"
 * Example #3: Given we are adding an "article" content item
 * Example #4: Given I am creating a "page" node
 * Example #5: And I am adding an "event"
 *
 */
Given(/^(I am |we are )*(?:adding|creating) an? "([^"]*)"(?: content item| node)?$/, async function (pronounCase, contentType) {
  const machineName = contentType.toLowerCase().replace(/\s+/g, '_');
  await navigate(this, `/node/add/${machineName}`);
  await waitForState(
    this.page.locator('form.node-form, #edit-title-0-value').first(),
    'attached',
    `Expected the node form on /node/add/${machineName}`
  );
});

/**
 * Assert the content item being viewed is published or unpublished, via the
 * `node--unpublished` class core's node template adds to an unpublished
 * node. Under an editorial workflow a new item usually starts as an
 * unpublished draft, which is what the "unpublished" form checks.
 *
 * Example #1: Then the content item should be published
 * Example #2: And the content item should be unpublished
 * Example #3: Then the content should be unpublished
 * Example #4: And the content item should not be unpublished
 * Example #5: Then the content should not be published
 *
 */
Then(/^(?:the )?content(?: item)? should( not)* be (published|unpublished)$/, async function (notCase, state) {
  const expectUnpublished = (state === 'unpublished') !== Boolean(notCase);
  await assertPresence(
    this.page.locator('.node--unpublished, article.unpublished').first(),
    expectUnpublished ? undefined : ' not',
    'the "node--unpublished" marker core adds to an unpublished content item',
    { attached: true }
  );
});

/**
 * Delete the content item being viewed through its own delete form
 * (`/node/<nid>/delete`), reading the node id from the page's links. Keeps a
 * content-creation scenario repeatable across runs.
 *
 * Example #1: When I delete the content item I am viewing
 * Example #2: And I delete the node I am viewing
 * Example #3: When we delete the content item we are viewing
 * Example #4: And we delete the node we are viewing
 * Example #5: Then I delete the content item I am viewing
 *
 */
When(/^(I |we )*delete the (?:content item|node) (?:I am|we are) viewing$/, async function (pronounCase) {
  const nid = await currentNodeId(this.page);
  if (!nid) {
    throw friendly({
      message: 'Could not determine which content item is being viewed.',
      hint: 'Open a content item\'s page (a /node/<nid> URL or its alias) first; the id is read from drupalSettings, the body class, the shortlink or a node link.',
    });
  }
  await navigate(this, `/node/${nid}/delete`);
  const confirm = this.page.locator('form.node-confirm-form #edit-submit, form.confirmation #edit-submit, ' + VISIBLE_SUBMIT).first();
  await waitForState(confirm, 'visible', `Expected the delete confirmation form on /node/${nid}/delete`);
  await submitInPage(this, 'form.node-confirm-form #edit-submit, form.confirmation #edit-submit, #edit-submit', 'form.node-confirm-form, form.confirmation');
});

// ---------------------------------------------------------------------------
// Caches and form submission
// ---------------------------------------------------------------------------

/**
 * Clear every cache from the Performance page
 * (`/admin/config/development/performance`), the way an administrator does
 * after changing configuration, so a following request renders fresh. Needs a
 * session that may administer site configuration.
 *
 * Example #1: When I flush all caches
 * Example #2: And I clear all caches
 * Example #3: When we flush all caches
 * Example #4: Given I flush all caches
 * Example #5: And we clear all caches
 *
 */
When(/^(I |we )*(?:flush|clear) all caches$/, async function (pronounCase) {
  await navigate(this, '/admin/config/development/performance');
  const found = await submitInPage(this, '[data-drupal-selector="edit-clear"], #edit-clear', 'form.system-performance-settings');
  if (!found) {
    throw friendly({
      message: 'Could not find "Clear all caches" on the Performance page.',
      hint: 'Log in as a user who may administer site configuration first.',
    });
  }
});

/**
 * Submit a form by the id of its submit button, dispatching the click inside
 * the page. Core suffixes a repeated id (`edit-submit--2`) and some admin
 * themes clone the primary button into a sticky bar that covers the original,
 * so every element whose id, `data-drupal-selector` or `name` matches is a
 * candidate and the visible one is clicked. Waits for the navigation the
 * submit causes.
 *
 * Example #1: When I submit by id "edit-submit"
 * Example #2: And I submit the form by id "edit-submit"
 * Example #3: When we submit by the id "edit-preview"
 * Example #4: And I submit the form by the id "edit-delete"
 * Example #5: When I submit by id "edit-clear"
 *
 */
When(/^(I |we )*submit (?:the form )?by (?:the )?id "([^"]*)"$/, async function (pronounCase, id) {
  const selector = `#${id}, [id^="${id}--"], [data-drupal-selector="${id}"], [name="${id}"]`;
  await this.page.locator(selector).first().waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
  const found = await submitInPage(this, selector);
  if (!found) {
    throw friendly(`No submit control with the id "${id}" was found on the page.`);
  }
});
