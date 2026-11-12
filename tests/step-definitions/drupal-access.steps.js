'use strict';

// Access-control steps: whether the current session may reach a path, edit or
// delete a content item, and whether a page carries a PHP error. They read
// what core renders for a refused request (the 403 status, the "Access
// denied" title, the login form a site redirects to) rather than a theme's
// wording, so they hold on any Drupal site.

const { Then } = require('@cucumber/cucumber');
const assert = require('assert');
const { gotoUrl, waitForPageLoad, friendly } = require('webship-js/tests/step-definitions/webship');
const {
  WAIT_TIMEOUT,
  budget,
  joinUrl,
  navigate,
  sessionStatus,
  currentNodeId,
} = require('./drupal-helpers');

// What a refused request looks like once rendered: core's 403 title (the
// heading or the document title), the login form a site may redirect to
// instead, or core's "You are not authorized to access this page." sentence.
// The phrase "access denied" alone is not a marker: the administration menu
// links to the "Top 'access denied' errors" report on every admin page.
const DENIED_MARKERS = 'h1:has-text("Access denied"), #user-login-form, form.user-login-form';
const DENIED_TEXT = /You are not authorized to access this page/i;

/**
 * Open a path and tell whether the session was refused: a 403 (or 404 for a
 * route hidden from the role), a redirect to the login form, or the
 * access-denied markers on the page.
 *
 * @param {object} world
 * @param {string} path
 * @returns {Promise<{status: number, denied: boolean, url: string}>}
 */
async function probeAccess(world, path) {
  const page = world.page;
  const response = await page.goto(joinUrl(world.launchUrl, path), { waitUntil: 'domcontentloaded', timeout: WAIT_TIMEOUT });
  await waitForPageLoad(page, budget(world));
  const status = response ? response.status() : 0;
  const url = page.url();
  const markers = await page.locator(DENIED_MARKERS).count();
  const texts = await page.evaluate(() => ({ title: document.title || '', body: (document.body && document.body.innerText) || '' })).catch(() => ({ title: '', body: '' }));
  const denied = status === 403 || status === 404 || markers > 0 || /\/user\/login(\?|$)/.test(url)
    || /^Access denied\b/i.test(texts.title.trim()) || DENIED_TEXT.test(texts.body.slice(0, 5000));
  return { status, denied, url };
}

/**
 * Assert the current session is refused a path: a 403 or 404, a redirect
 * to the login form, or core's "Access denied" page. One step for what
 * otherwise takes a navigation, a status check and a title check.
 *
 * Example #1: Then I should be denied access to "/admin/people"
 * Example #2: And I am denied access to "/admin/config"
 * Example #3: Then we should be denied access to "/node/add/article"
 * Example #4: And I should be refused "/admin/modules"
 * Example #5: Then I am refused "/admin/reports/status"
 *
 */
Then(/^(I |we )*(?:am|are|should be) (?:denied access to|refused) "([^"]*)"$/, async function (pronounCase, path) {
  const result = await probeAccess(this, path);
  assert.ok(
    result.denied,
    friendly({
      message: `Expected the current session to be denied access to ${path}.`,
      cause: `it answered ${result.status} at ${result.url}`,
      hint: 'A refused request is a 403 or 404, a redirect to the login form, or core\'s "Access denied" page.',
    }).message
  );
});

/**
 * Assert the current session may open a path: a 2xx answer with none of the
 * refusal markers (no 403, no login form, no "Access denied" title).
 *
 * Example #1: Then I should be allowed access to "/admin/content"
 * Example #2: And I am allowed access to "/user"
 * Example #3: Then we should be granted access to "/admin/people"
 * Example #4: And I should be allowed "/node/add/article"
 * Example #5: Then I am granted access to "/admin/reports/status"
 *
 */
Then(/^(I |we )*(?:am|are|should be) (?:allowed access to|granted access to|allowed) "([^"]*)"$/, async function (pronounCase, path) {
  const result = await probeAccess(this, path);
  assert.ok(
    result.status >= 200 && result.status < 300 && !result.denied,
    friendly({
      message: `Expected the current session to be allowed access to ${path}.`,
      cause: result.denied ? `the request was refused (${result.status} at ${result.url})` : `it answered ${result.status}`,
      hint: 'Log in as a user whose role has the permission the route needs, or check the path.',
    }).message
  );
});

/**
 * Assert the page on screen is one the current session was refused: a 403
 * for the session, or core's "Access denied" page or the login form in place
 * of the content. No navigation; use it after a navigation step.
 *
 * Example #1: Then the page should be access restricted
 * Example #2: And the page should be access restricted
 * Example #3: Then I should be denied access
 * Example #4: And we should be denied access
 * Example #5: Then page should be access restricted
 *
 */
Then(/^(?:(?:I |we )*should be denied access|(?:the )?page should be access restricted)$/, async function () {
  const status = await sessionStatus(this.page, this.page.url());
  const markers = await this.page.locator(DENIED_MARKERS).count();
  const texts = await this.page.evaluate(() => ({ title: document.title || '', body: (document.body && document.body.innerText) || '' })).catch(() => ({ title: '', body: '' }));
  const denied = status === 403 || markers > 0 || /^Access denied\b/i.test(texts.title.trim()) || DENIED_TEXT.test(texts.body.slice(0, 5000));
  assert.ok(
    denied,
    friendly({
      message: `Expected ${this.page.url()} to be access restricted for the current session.`,
      cause: `it answers ${status} and shows no access-denied marker`,
    }).message
  );
});

/**
 * Assert the current session may, or may not, edit or delete the content
 * item at a path: the item's own edit or delete form (`/node/<nid>/edit`,
 * `/node/<nid>/delete`) answers 200 for the session, or refuses it.
 *
 * Example #1: Then I should be able to edit the content at "/sample-article"
 * Example #2: And I should be able to delete the content at "/sample-article"
 * Example #3: Then we should not be able to edit the content at "/sample-article"
 * Example #4: And I should not be able to delete the content at "/node/1"
 * Example #5: Then I should be able to edit the content at "/node/1"
 *
 */
Then(/^(I |we )*should( not)* be able to (edit|delete) the content at "([^"]*)"$/, async function (pronounCase, notCase, operation, path) {
  await navigate(this, path);
  const nid = await currentNodeId(this.page);
  if (!nid) {
    throw friendly({
      message: `${path} is not a content item's page.`,
      hint: 'Pass the path (or alias) of a node; the id is read from drupalSettings, the body class, the shortlink or a node link.',
    });
  }
  const url = joinUrl(this.launchUrl, `/node/${nid}/${operation}`);
  const status = await sessionStatus(this.page, url);
  const allowed = status >= 200 && status < 300;
  assert.ok(
    notCase ? !allowed : allowed,
    friendly({
      message: notCase
        ? `Expected the current session not to be able to ${operation} the content at ${path}.`
        : `Expected the current session to be able to ${operation} the content at ${path}.`,
      cause: `/node/${nid}/${operation} answered ${status}`,
    }).message
  );
});

/**
 * Assert the page shows no PHP error: a fatal error, warning, notice or
 * deprecation printed in PHP's "in <file> on line <n>" form or in Drupal's
 * "(line <n> of <file>)" form, an uncaught
 * exception, or core's "The website encountered an unexpected error" page.
 * The quick health check for every page a scenario lands on.
 *
 * Example #1: Then the page should not have PHP errors
 * Example #2: And the page should not have PHP errors
 * Example #3: Then the page should have no PHP errors
 * Example #4: And the page should have no PHP errors
 * Example #5: Then the page should not have any PHP errors
 *
 */
Then(/^(?:the )?page should (?:not have(?: any)?|have no) PHP errors$/, async function () {
  const text = await this.page.evaluate(() => (document.body && document.body.innerText) || '').catch(() => '');
  const patterns = [
    /\b(?:Fatal error|Parse error|Warning|Notice|Deprecated)\b\s*:\s.{0,300}?\bin\s\S+\.(?:php|module|inc|theme|install)\s+on\s+line\s+\d+/,
    // Drupal's own rendering of the same errors: "Warning: ... in ... (line 42 of /path/file.php)".
    /\b(?:Fatal error|Parse error|Warning|Notice|Deprecated(?: function)?|Error|TypeError|ValueError|ArgumentCountError)\b\s*:\s.{0,300}?\(line\s+\d+\s+of\s+\S+\)/,
    /The website encountered an unexpected error/,
    /Uncaught\s+\w*(?:Exception|Error)\b/,
  ];
  const hit = patterns.map((re) => text.match(re)).find(Boolean);
  assert.ok(
    !hit,
    friendly({
      message: `The page at ${this.page.url()} shows a PHP error.`,
      cause: hit ? hit[0].slice(0, 300) : '',
      hint: 'Read the site log (/admin/reports/dblog) for the full message.',
    }).message
  );
});

module.exports = { probeAccess };
