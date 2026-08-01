'use strict';

// Drupal-core-specific Cucumber step definitions for webship-js. These steps
// understand the markup Drupal *core* itself renders on every Drupal
// installation — regardless of which contributed theme/distribution sits on
// top of it — because they target conventions that come from core's own
// preprocess functions and Form API, not theme templates:
//
//   - body classes core's `template_preprocess_html()` always adds
//     (`path-frontpage`, `page-node-type-<type>`, `user-logged-in`)
//   - the Toolbar module's `#toolbar-administration` bar
//   - core's `.breadcrumb` block and `.messages--status` / `.messages--error`
//     status-messages markup
//   - core Form API element IDs, which are derived deterministically from
//     field machine names (`#edit-name`, `#edit-pass`, `#edit-mail`, ...)
//     and are therefore identical on Olivero, Claro, Stable9 or any custom
//     base theme
//   - core Search module's `.search-results` listing
//   - core Contact module's default "feedback" form
//
// The Gherkin phrasing itself stays CMS-agnostic ("the login form", "the
// front page", ...) since scenarios read the same regardless of what's
// running underneath; only these inline comments name Drupal, to document
// which core convention each step actually targets.
//
// Composes with webship-js's built-in steps (navigation.steps.js,
// assertion.steps.js, form.steps.js, response.steps.js, …) rather than
// duplicating them — use those directly in feature files wherever they
// already cover the need (e.g. "the response status code should be 200",
// "I should be on the homepage").

const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const { gotoUrl, waitForPageLoad, fillField } = require('webship-js/tests/step-definitions/webship');

// ---------------------------------------------------------------------------
// Core layout: front page, toolbar, breadcrumb, messages
// ---------------------------------------------------------------------------

/**
 * Assert the current page is the site's configured front page. Matches the
 * `path-frontpage` body class core's `template_preprocess_html()` adds only
 * to the route configured as the site's front page.
 *
 * Example #1: Then I should be on the front page
 * Example #2: And I should be on the frontpage
 * Example #3: Then we should be on the front page
 * Example #4: And should be on the front page
 * Example #5: Then I should land on the front page
 *
 */
Then(/^(I |we )*should (?:be on|land on) the front ?page$/, async function (pronounCase) {
  const body = this.page.locator('body.path-frontpage');
  await assert.doesNotReject(
    () => body.waitFor({ state: 'attached', timeout: 45000 }),
    'Expected the front page body class ("body.path-frontpage") to be present'
  );
});

/**
 * Assert the core Toolbar (admin bar) is present. Matches
 * `#toolbar-administration`, rendered by the core Toolbar module for any
 * authenticated user with the "access toolbar" permission, independent of
 * theme. Checked via `attached` rather than `visible`: the Toolbar module's
 * own "anti-flicker" JS deliberately keeps the bar hidden for a moment after
 * load (to avoid a flash of unstyled/unoriented toolbar) before revealing
 * it, so `visible` is flaky right after a fresh login redirect.
 *
 * Example #1: Then I should see the toolbar
 * Example #2: And I should see the admin toolbar
 * Example #3: Then we should see the toolbar
 * Example #4: And should see the toolbar
 * Example #5: Then I should see the administration toolbar
 *
 */
Then(/^(I |we )*should see the (?:admin |administration )?toolbar$/, async function (pronounCase) {
  const toolbar = this.page.locator('#toolbar-administration');
  await assert.doesNotReject(
    () => toolbar.waitFor({ state: 'attached', timeout: 45000 }),
    'Expected the Toolbar ("#toolbar-administration") to be present'
  );
});

/**
 * Assert the core Navigation module's admin sidebar is present. Matches
 * `#admin-toolbar`, rendered by the core Navigation module (the default
 * admin UI on a Standard-profile install as of Drupal 10.3+) for any
 * authenticated user with the "access administration pages" permission,
 * independent of theme. This is the Navigation-module counterpart to the
 * classic Toolbar module's "#toolbar-administration" bar — use whichever
 * step matches which of the two mutually-exclusive modules the target site
 * has enabled.
 *
 * Example #1: Then I should see the navigation sidebar
 * Example #2: And I should see the admin navigation sidebar
 * Example #3: Then we should see the navigation sidebar
 * Example #4: And should see the navigation sidebar
 *
 */
Then(/^(I |we )*should see the (?:admin )?navigation sidebar$/, async function (pronounCase) {
  const sidebar = this.page.locator('#admin-toolbar');
  await assert.doesNotReject(
    () => sidebar.waitFor({ state: 'attached', timeout: 45000 }),
    'Expected the Navigation sidebar ("#admin-toolbar") to be present'
  );
});

/**
 * Assert the core breadcrumb block is visible. Matches `.breadcrumb`,
 * rendered by the core System module's Breadcrumb block.
 *
 * Example #1: Then I should see the breadcrumb
 * Example #2: And I should see the breadcrumbs
 * Example #3: Then we should see the breadcrumb
 * Example #4: And should see the breadcrumb trail
 * Example #5: Then I should see the breadcrumb
 *
 */
Then(/^(I |we )*should see the breadcrumbs?(?: trail)?$/, async function (pronounCase) {
  const breadcrumb = this.page.locator('.breadcrumb').first();
  await assert.doesNotReject(
    () => breadcrumb.waitFor({ state: 'visible', timeout: 45000 }),
    'Expected the breadcrumb block (".breadcrumb") to be visible'
  );
});

/**
 * Assert a core status message is visible. Matches `.messages--status`, the
 * class core's `status-messages.html.twig` renders for the "status" message
 * type (form submission confirmations, etc.).
 *
 * Example #1: Then I should see a status message
 * Example #2: And I should see a success message
 * Example #3: Then we should see a status message
 * Example #4: And should see a confirmation message
 * Example #5: Then I should see a status message
 *
 */
Then(/^(I |we )*should see a (?:status|success|confirmation) message$/, async function (pronounCase) {
  const message = this.page.locator('.messages--status').first();
  await assert.doesNotReject(
    () => message.waitFor({ state: 'visible', timeout: 45000 }),
    'Expected a status message (".messages--status") to be visible'
  );
});

/**
 * Assert a core status message matches the given text. Reads
 * `.messages--status`.
 *
 * Example #1: Then I should see the status message "Your message has been sent."
 * Example #2: And I should see the status message "The configuration options have been saved."
 * Example #3: Then we should see the status message "Your message has been sent."
 * Example #4: And should see the status message "Thank you for your feedback."
 * Example #5: Then I should see the status message "The changes have been saved."
 *
 */
Then(/^(I |we )*should see the status message "([^"]*)?"$/, async function (pronounCase, expectedText) {
  const message = this.page.locator('.messages--status').first();
  const text = (await message.textContent()) || '';
  assert.ok(
    text.includes(expectedText),
    `Expected the status message to contain "${expectedText}" but found "${text.trim()}"`
  );
});

/**
 * Assert a core error message is visible. Matches `.messages--error`, the
 * class core's `status-messages.html.twig` renders for the "error" message
 * type (failed form validation, access denied notices, etc.).
 *
 * Example #1: Then I should see an error message
 * Example #2: And I should see a validation error
 * Example #3: Then we should see an error message
 * Example #4: And should see an error message
 * Example #5: Then I should see a form error
 *
 */
Then(/^(I |we )*should see an? (?:validation |form )?error(?: message)?$/, async function (pronounCase) {
  const message = this.page.locator('.messages--error').first();
  await assert.doesNotReject(
    () => message.waitFor({ state: 'visible', timeout: 45000 }),
    'Expected an error message (".messages--error") to be visible'
  );
});

// ---------------------------------------------------------------------------
// Node pages
// ---------------------------------------------------------------------------

/**
 * Assert the current page is rendering a node of the given content type.
 * Matches `body.page-node-type-<type>`, the class core's
 * `template_preprocess_html()` adds on every node route.
 *
 * Example #1: Then I should be on an "article" page
 * Example #2: And I should be on a "page" page
 * Example #3: Then we should be on an "article" page
 * Example #4: And should be on a "page" page
 * Example #5: Then I should be on a "basic_page" page
 *
 */
Then(/^(I |we )*should be on an? "([^"]*)?" page$/, async function (pronounCase, contentType) {
  const body = this.page.locator(`body.page-node-type-${contentType}`);
  await assert.doesNotReject(
    () => body.waitFor({ state: 'attached', timeout: 45000 }),
    `Expected the node-type body class ("body.page-node-type-${contentType}") to be present`
  );
});

/**
 * Assert the current node page's title matches the given text. Reads the
 * core Page Title block's `<h1>`.
 *
 * Example #1: Then I should see the page titled "About us"
 * Example #2: And I should see the page titled "Contact"
 * Example #3: Then we should see the page titled "About us"
 * Example #4: And should see the page titled "Welcome"
 * Example #5: Then I should see the page titled "Home"
 *
 */
Then(/^(I |we )*should see the page titled "([^"]*)?"$/, async function (pronounCase, expectedTitle) {
  const title = this.page.locator('h1').first();
  const text = (await title.textContent()) || '';
  assert.ok(
    text.includes(expectedTitle),
    `Expected the page title to contain "${expectedTitle}" but found "${text.trim()}"`
  );
});

// ---------------------------------------------------------------------------
// Authentication: /user/login, /user/register, /user/logout
// ---------------------------------------------------------------------------

/**
 * Navigate to core's login page at `/user/login`.
 *
 * Example #1: Given I am on the login page
 * Example #2: Given we are on the login page
 * Example #3: Given I am on the sign in page
 * Example #4: Given we are on the sign-in page
 * Example #5: Given I am on the "user/login" page
 *
 */
Given(/^(I am |we are )*on the (?:sign-?in|"user\/login"|login) page$/, async function (pronounCase) {
  const defaultTime = this.minWaitTime.page || 3000;
  await gotoUrl(this.page, this.launchUrl + '/user/login');
  await this.page.waitForSelector('body', { state: 'attached', timeout: 45000 });
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert core's login form is visible. Matches `#user-login-form`, the id
 * core's `UserLoginForm` always renders, with its `#edit-name` and
 * `#edit-pass` fields.
 *
 * Example #1: Then I should see the login form
 * Example #2: And I should see the sign in form
 * Example #3: Then we should see the login form
 * Example #4: And should see the login form
 * Example #5: Then I should see the sign-in form
 *
 */
Then(/^(I |we )*should see the (?:sign-?in|login) form$/, async function (pronounCase) {
  const form = this.page.locator('#user-login-form');
  await assert.doesNotReject(
    () => form.waitFor({ state: 'visible', timeout: 45000 }),
    'Expected the login form ("#user-login-form") to be visible'
  );
  await assert.doesNotReject(
    () => this.page.locator('#edit-name').waitFor({ state: 'visible', timeout: 5000 }),
    'Expected the username field ("#edit-name") to be visible'
  );
  await assert.doesNotReject(
    () => this.page.locator('#edit-pass').waitFor({ state: 'visible', timeout: 5000 }),
    'Expected the password field ("#edit-pass") to be visible'
  );
});

/**
 * Fill and submit core's login form with the given username and password
 * (`#edit-name`, `#edit-pass`, `#edit-submit`).
 *
 * Example #1: When I log in as "admin" with password "secret"
 * Example #2: When we log in as "editor" with password "p@ssw0rd"
 * Example #3: When I sign in as "admin" with password "secret"
 * Example #4: When we sign in as "reviewer" with password "hunter2"
 * Example #5: When I log in as "site_manager" with password "letmein"
 *
 */
When(/^(I |we )*(?:log in|sign in) as "([^"]*)?" with password "([^"]*)?"$/, async function (pronounCase, username, password) {
  const defaultTime = this.minWaitTime.page || 3000;
  await fillField(this.page, 'name', username);
  await fillField(this.page, 'pass', password);
  // `#edit-submit` is not actually unique: Olivero's header search block
  // (present on every page, including /user/login) independently renders
  // its own hidden `#edit-submit`, and anonymous-page-cache-rendered blocks
  // don't share core's HTML-id dedup registry, so both submit buttons end
  // up with the same id. Filter to the visible one.
  await this.page.locator('#edit-submit:visible').first().click();
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert the current session is authenticated. Matches `body.user-logged-in`,
 * the class core's `template_preprocess_html()` adds only for authenticated
 * users, independent of theme or toolbar visibility.
 *
 * Example #1: Then I should be logged in
 * Example #2: And I should be signed in
 * Example #3: Then we should be logged in
 * Example #4: And should be logged in
 * Example #5: Then I should be authenticated
 *
 */
Then(/^(I |we )*should be (?:logged in|signed in|authenticated)$/, async function (pronounCase) {
  const body = this.page.locator('body.user-logged-in');
  await assert.doesNotReject(
    () => body.waitFor({ state: 'attached', timeout: 45000 }),
    'Expected the authenticated-user body class ("body.user-logged-in") to be present'
  );
});

/**
 * Assert the current session is NOT authenticated. Matches the absence of
 * `body.user-logged-in` — the counterpart to "should be logged in", useful
 * right after `/user/logout` to confirm the session was actually destroyed
 * rather than merely redirected.
 *
 * Example #1: Then I should not be logged in
 * Example #2: And I should not be signed in
 * Example #3: Then we should not be logged in
 * Example #4: And should not be logged in
 * Example #5: Then I should not be authenticated
 *
 */
Then(/^(I |we )*should not be (?:logged in|signed in|authenticated)$/, async function (pronounCase) {
  const body = this.page.locator('body.user-logged-in');
  await assert.doesNotReject(
    () => body.waitFor({ state: 'detached', timeout: 45000 }),
    'Expected the authenticated-user body class ("body.user-logged-in") to be absent'
  );
});

/**
 * Assert the login screen is showing an authentication error. Matches
 * `.messages--error`, rendered by `UserLoginForm::validateAuthentication()`
 * on invalid credentials.
 *
 * Example #1: Then I should see a login error
 * Example #2: And I should see a sign in error
 * Example #3: Then we should see a login error
 * Example #4: And should see a login error
 * Example #5: Then I should see an authentication error
 *
 */
Then(/^(I |we )*should see an? (?:login|sign-?in|authentication) error$/, async function (pronounCase) {
  const error = this.page.locator('.messages--error');
  await assert.doesNotReject(
    () => error.waitFor({ state: 'visible', timeout: 45000 }),
    'Expected a login error message (".messages--error") to be visible'
  );
});

/**
 * Navigate to core's registration page at `/user/register`.
 *
 * Example #1: Given I am on the registration page
 * Example #2: Given we are on the register page
 * Example #3: Given I am on the sign up page
 * Example #4: Given we are on the "user/register" page
 * Example #5: Given I am on the registration page
 *
 */
Given(/^(I am |we are )*on the (?:sign[ -]?up|"user\/register"|regist(?:er|ration)) page$/, async function (pronounCase) {
  const defaultTime = this.minWaitTime.page || 3000;
  await gotoUrl(this.page, this.launchUrl + '/user/register');
  await this.page.waitForSelector('body', { state: 'attached', timeout: 45000 });
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert core's registration form is visible. Matches `#user-register-form`,
 * the id core's `RegisterForm` always renders.
 *
 * Example #1: Then I should see the registration form
 * Example #2: And I should see the register form
 * Example #3: Then we should see the registration form
 * Example #4: And should see the sign up form
 * Example #5: Then I should see the registration form
 *
 */
Then(/^(I |we )*should see the (?:sign[ -]?up|regist(?:er|ration)) form$/, async function (pronounCase) {
  const form = this.page.locator('#user-register-form');
  await assert.doesNotReject(
    () => form.waitFor({ state: 'visible', timeout: 45000 }),
    'Expected the registration form ("#user-register-form") to be visible'
  );
});

/**
 * Log the current session out via `/user/logout`. As of Drupal core 10.3+
 * (including 11), a bare GET to `/user/logout` no longer logs the session
 * out directly — it renders a CSRF-protected confirmation form
 * (`#user-logout-confirm`) instead, to prevent logout CSRF. This step
 * submits that confirmation when present, and falls through unchanged on
 * older core versions that still log out on the GET itself.
 *
 * Example #1: When I log out
 * Example #2: When we log out
 * Example #3: When I sign out
 * Example #4: When we sign out
 * Example #5: When I log out
 *
 */
When(/^(I |we )*(?:log out|sign out)$/, async function (pronounCase) {
  const defaultTime = this.minWaitTime.page || 3000;
  await gotoUrl(this.page, this.launchUrl + '/user/logout');
  await this.page.waitForSelector('body', { state: 'attached', timeout: 45000 });
  await waitForPageLoad(this.page, defaultTime);
  const confirmSubmit = this.page.locator('#user-logout-confirm #edit-submit');
  if (await confirmSubmit.isVisible({ timeout: 5000 }).catch(() => false)) {
    await confirmSubmit.click();
    await waitForPageLoad(this.page, defaultTime);
  }
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Navigate to core Search's content search page at `/search/node`.
 *
 * Example #1: Given I am on the search page
 * Example #2: Given we are on the search page
 * Example #3: Given I am on the content search page
 * Example #4: Given we are on the "search/node" page
 * Example #5: Given I am on the search page
 *
 */
Given(/^(I am |we are )*on the (?:content )?search page$/, async function (pronounCase) {
  const defaultTime = this.minWaitTime.page || 3000;
  await gotoUrl(this.page, this.launchUrl + '/search/node');
  await this.page.waitForSelector('body', { state: 'attached', timeout: 45000 });
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Submit core Search's keyword field with the given term. Fills
 * `input[name="keys"]`, the field name core's Search module uses for both
 * the search block and the search page form, and presses Enter.
 *
 * Example #1: When I search for "webship"
 * Example #2: When we search for "cucumber"
 * Example #3: When I search for "playwright"
 * Example #4: When we search for "gherkin"
 * Example #5: When I search for "bdd"
 *
 */
When(/^(I |we )*search for "([^"]*)?"$/, async function (pronounCase, term) {
  const defaultTime = this.minWaitTime.page || 3000;
  // input[name="keys"] is not unique on the search page: Olivero's header
  // search block renders its own (hidden, collapsed-until-toggled)
  // #edit-keys alongside the search page's own visible field, both named
  // "keys". Filter to the visible one.
  const keys = this.page.locator('input[name="keys"]:visible').first();
  await keys.waitFor({ state: 'visible', timeout: 45000 });
  await keys.fill(term);
  await keys.press('Enter');
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert core Search returned results. Matches `.search-results`, the class
 * core's `search-result.html.twig` renders the results list into.
 *
 * Example #1: Then I should see search results
 * Example #2: And I should see search results
 * Example #3: Then we should see search results
 * Example #4: And should see search results
 * Example #5: Then I should see search results
 *
 */
Then(/^(I |we )*should see search results$/, async function (pronounCase) {
  const results = this.page.locator('.search-results');
  await assert.doesNotReject(
    () => results.waitFor({ state: 'attached', timeout: 45000 }),
    'Expected the search results list (".search-results") to be present'
  );
});

/**
 * Assert core Search reported no results, via the module's default "Your
 * search yielded no results." message.
 *
 * Example #1: Then I should see no search results
 * Example #2: And I should see no search results
 * Example #3: Then we should see no search results
 * Example #4: And should see no search results
 * Example #5: Then I should see no search results
 *
 */
Then(/^(I |we )*should see no search results$/, async function (pronounCase) {
  const noResults = this.page.getByText('Your search yielded no results.').first();
  await assert.doesNotReject(
    () => noResults.waitFor({ state: 'visible', timeout: 45000 }),
    'Expected the "no results" message to be visible'
  );
});

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

/**
 * Navigate to core Contact module's site-wide contact page at `/contact`.
 *
 * Example #1: Given I am on the contact page
 * Example #2: Given we are on the contact us page
 * Example #3: Given I am on the "contact" page
 * Example #4: Given we are on the contact-us page
 * Example #5: Given I am on the contact page
 *
 */
Given(/^(I am |we are )*on the (?:"contact us"|contact[ -]?us|contact) page$/, async function (pronounCase) {
  const defaultTime = this.minWaitTime.page || 3000;
  await gotoUrl(this.page, this.launchUrl + '/contact');
  await this.page.waitForSelector('body', { state: 'attached', timeout: 45000 });
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert core Contact module's default "feedback" form is visible. Matches
 * `#contact-message-feedback-form`, the id derived from the default contact
 * form's machine name ("feedback"), with its `#edit-mail`, `#edit-subject`
 * and `#edit-message` fields.
 *
 * Example #1: Then I should see the contact form
 * Example #2: And I should see the contact us form
 * Example #3: Then we should see the contact form
 * Example #4: And should see the "contact us" form
 * Example #5: Then I should see the contact form
 *
 */
Then(/^(I |we )*should see the (?:"contact us"|contact[ -]?us|contact) form$/, async function (pronounCase) {
  const form = this.page.locator('#contact-message-feedback-form, form.contact-message-feedback-form').first();
  await assert.doesNotReject(
    () => form.waitFor({ state: 'visible', timeout: 45000 }),
    'Expected the contact form ("#contact-message-feedback-form") to be visible'
  );
});

/**
 * Fill and submit core Contact module's default form with the given subject
 * and message. Anonymous submissions also require `#edit-name` and
 * `#edit-mail`, filled with placeholder values when present.
 *
 * Example #1: When I submit the contact form with subject "Question" and message "Hello there"
 * Example #2: When we submit the contact form with subject "Support" and message "Need help"
 * Example #3: When I submit the contact form with subject "Feedback" and message "Great site"
 * Example #4: When we submit the contact form with subject "Bug report" and message "Found an issue"
 * Example #5: When I submit the contact form with subject "General" and message "Just saying hi"
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
  // See the note in the login step above: #edit-submit isn't unique on
  // this page either, for the same reason (Olivero's header search block).
  await this.page.locator('#edit-submit:visible').first().click();
  await waitForPageLoad(this.page, defaultTime);
});

// ---------------------------------------------------------------------------
// 403 / 404
// ---------------------------------------------------------------------------

/**
 * Assert the current page is core's default "access denied" (403) page, by
 * checking the page title for the System module's default string.
 *
 * Example #1: Then I should be on the access denied page
 * Example #2: And I should be on the 403 page
 * Example #3: Then we should be on the access denied page
 * Example #4: And should be on the 403 page
 * Example #5: Then I should land on the access denied page
 *
 */
Then(/^(I |we )*should (?:be on|land on) the (?:access denied|403) page$/, async function (pronounCase) {
  const heading = this.page.locator('h1', { hasText: 'Access denied' }).first();
  await assert.doesNotReject(
    () => heading.waitFor({ state: 'attached', timeout: 45000 }),
    'Expected the 403 template (an <h1> containing "Access denied") to be present'
  );
});

/**
 * Assert the current page is core's default "page not found" (404) page, by
 * checking the page title for the System module's default string.
 *
 * Example #1: Then I should be on the 404 page
 * Example #2: And I should be on the "not found" page
 * Example #3: Then we should be on the 404 page
 * Example #4: And should be on the 404 page
 * Example #5: Then I should land on the 404 page
 *
 */
Then(/^(I |we )*should (?:be on|land on) the (?:404|"not found") page$/, async function (pronounCase) {
  const heading = this.page.locator('h1', { hasText: 'Page not found' }).first();
  await assert.doesNotReject(
    () => heading.waitFor({ state: 'attached', timeout: 45000 }),
    'Expected the 404 template (an <h1> containing "Page not found") to be present'
  );
});
