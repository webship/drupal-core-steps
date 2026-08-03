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

// Kept below webship-js's 45s step timeout so a locator that never settles
// fails through the authored message below, not as "function timed out".
const WAIT_TIMEOUT = 30000;

// `#edit-submit` is not unique on a Drupal page: a search block, an exposed
// Views filter or a second form rendered from the anonymous page cache can each
// carry the same id, because blocks assembled from separate render caches do
// not share core's HTML-id dedup registry. Every submit click in this file goes
// through the visible one.
const VISIBLE_SUBMIT = '#edit-submit:visible';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Whether an optional step argument was actually supplied.
 *
 * A regex group that did not participate in the match reaches the step body as
 * `undefined` from cucumber-js and as `null` once webship-js's argument
 * transform has run, so every optional argument here is tested through this
 * rather than against one of the two.
 *
 * @param {*} value
 * @returns {boolean}
 */
function supplied(value) {
  return value !== undefined && value !== null;
}

/**
 * Wait for a locator to reach a state, reporting the authored message (plus a
 * humanized cause) instead of a raw Playwright timeout.
 *
 * @param {import('playwright').Locator} locator
 * @param {'attached'|'detached'|'visible'|'hidden'} state
 * @param {string} message
 * @returns {Promise<void>}
 */
async function waitForState(locator, state, message) {
  try {
    await locator.waitFor({ state, timeout: WAIT_TIMEOUT });
  } catch (error) {
    throw friendly(message, error);
  }
}

/**
 * Assert an element is present or — when the step said "not" — absent.
 *
 * Every assertion step in this file routes through here so a single `( not)*`
 * group in the regex covers both polarities, rather than shipping a second
 * step definition for the negative phrasing.
 *
 * `attached` picks presence-in-DOM over visibility, for markup core renders but
 * scripts may keep hidden for a moment (body classes, the admin toolbar's
 * anti-flicker phase, the search results list inside a collapsed region).
 *
 * @param {import('playwright').Locator} locator
 * @param {string|undefined} negated - The captured " not" group, if any.
 * @param {string} label - Human description, e.g. 'the breadcrumb (".breadcrumb")'.
 * @param {{attached?: boolean}} [options]
 * @returns {Promise<void>}
 */
async function assertPresence(locator, negated, label, options = {}) {
  const present = options.attached ? 'attached' : 'visible';
  const absent = options.attached ? 'detached' : 'hidden';
  await waitForState(
    locator,
    negated ? absent : present,
    negated ? `Expected ${label} to be absent` : `Expected ${label} to be present`
  );
}

/**
 * Assert a locator's text contains an expected substring, when the step
 * supplied one. Steps that take an optional `"..."` argument share this so the
 * "is it there" and "does it say the right thing" halves stay one step.
 *
 * @param {import('playwright').Locator} locator
 * @param {string|undefined} expectedText
 * @param {string} label
 * @returns {Promise<void>}
 */
async function assertContainsText(locator, expectedText, label) {
  if (!supplied(expectedText)) return;
  const text = ((await locator.textContent()) || '').replace(/\s+/g, ' ').trim();
  assert.ok(
    text.includes(expectedText),
    friendly({
      message: `Expected ${label} to contain "${expectedText}".`,
      cause: `it reads "${text}"`,
      hint: 'Text is matched as a substring, whitespace-collapsed but case-sensitive.',
    }).message
  );
}

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
Given(/^(?:I am |we are )*on the (login|sign-?in|registration|register|sign[ -]?up|password reset|reset password|forgot password|content search|search|contact[ -]?us|contact|administration|admin|content overview|people|user administration|modules?|appearance|status report|add content|content creation|user profile|my account|site information) page$/, async function (pageName) {
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
  const matches = Boolean(match) && (!supplied(majorVersion) || match[1] === majorVersion);
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
 * Assert the page-title block's heading (`h1.page-title`) contains a text. This
 * is the *rendered* title core puts in the page body, which is not always the
 * `<title>` element webship-js's own title steps read — admin pages in
 * particular append the site name to one and not the other.
 *
 * Example #1: Then I should see the page title "Log in"
 * Example #2: And we should see the page heading "Content"
 * Example #3: Then should see the page title "Status report"
 * Example #4: And I should see the page heading "Administration"
 * Example #5: Then we should see the page title "Reset your password"
 *
 */
Then(/^(I |we )*should see the page (?:title|heading) "([^"]*)?"$/, async function (pronounCase, expectedTitle) {
  const heading = this.page.locator('h1.page-title, h1.title, h1').first();
  await assertPresence(heading, undefined, 'the page title ("h1.page-title")');
  await assertContainsText(heading, expectedTitle, 'the page title');
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
  const message = this.page.locator('.messages--status').first();
  await assertPresence(message, notCase, 'a status message (".messages--status")');
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
  const message = this.page.locator('.messages--warning').first();
  await assertPresence(message, notCase, 'a warning message (".messages--warning")');
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
  const message = this.page.locator('.messages--error').first();
  await assertPresence(message, notCase, 'an error message (".messages--error")');
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
 * Example #3: When log out
 * Example #4: And I sign out
 * Example #5: When we sign out
 *
 */
When(/^(I |we )*(?:log out|sign out)$/, async function (pronounCase) {
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
 * name and an email address, filled with placeholder values when those fields
 * are present.
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
  const nameField = this.page.locator('#edit-name');
  if (await nameField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await fillField(this.page, 'name', 'Webship QA');
  }
  const mailField = this.page.locator('#edit-mail');
  if (await mailField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await fillField(this.page, 'mail', 'qa@example.com');
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
  await assertPresence(
    this.page.locator('h1', { hasText: title }).first(),
    notCase,
    `the error page template (an <h1> containing "${title}")`,
    { attached: true }
  );
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
