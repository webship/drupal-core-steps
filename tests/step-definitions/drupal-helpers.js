'use strict';

// Shared helpers for the Drupal step packs.
//
// Not a step file: it registers no step definitions and no hooks. It holds the
// plumbing `drupal-core.steps.js` uses and that downstream packs (for example
// `@webship-js/drupal-cms-steps`) can require instead of copying: optional
// argument handling, presence and text assertions, the users registry, the
// robust in-page form submit used to log in, Form API field resolution,
// CKEditor 5 data writing, checkbox state lookups and a session-aware status
// probe.
//
// Everything here builds on webship-js's own helpers (`gotoUrl`, `smartSettle`,
// `friendly`) so the steps behave like the core webship-js steps.

const {
  gotoUrl,
  waitForPageLoad,
  smartSettle,
  friendly,
} = require('webship-js/tests/step-definitions/webship');

// Kept below webship-js's 45s step timeout so a locator that never settles
// fails through the authored message, not as "function timed out".
const WAIT_TIMEOUT = 30000;

// `#edit-submit` is not unique on a Drupal page: a search block, an exposed
// Views filter or a second form rendered from the anonymous page cache can each
// carry the same id, because blocks assembled from separate render caches do
// not share core's HTML-id dedup registry. Every submit click goes through the
// visible one.
const VISIBLE_SUBMIT = '#edit-submit:visible';

/**
 * Whether an optional step argument was actually supplied.
 *
 * A regex group that did not participate in the match reaches the step body as
 * `undefined` from cucumber-js and as `null` once an argument transform has
 * run, so every optional argument is tested through this rather than against
 * one of the two.
 *
 * @param {*} value
 * @returns {boolean}
 */
function supplied(value) {
  return value !== undefined && value !== null;
}

/**
 * The per-page wait budget configured in `worldParameters.minWaitTime.page`.
 *
 * @param {object} world
 * @returns {number}
 */
function budget(world) {
  return (world && world.minWaitTime && world.minWaitTime.page) || 3000;
}

/**
 * Join the launch URL and a path with exactly one slash, so a path with or
 * without a leading slash resolves the same. Absolute URLs pass through.
 *
 * @param {string} launchUrl
 * @param {string} url
 * @returns {string}
 */
function joinUrl(launchUrl, url) {
  if (!url) return launchUrl;
  if (/^https?:\/\//i.test(url)) return url;
  return String(launchUrl).replace(/\/+$/, '') + '/' + String(url).replace(/^\/+/, '');
}

/**
 * Open a path on the site under test and wait for the page to settle.
 *
 * @param {object} world - The cucumber World (`this` inside a step).
 * @param {string} url - A path such as `/user/login`, or an absolute URL.
 * @returns {Promise<void>}
 */
async function navigate(world, url) {
  await gotoUrl(world.page, joinUrl(world.launchUrl, url));
  await world.page.waitForSelector('body', { state: 'attached', timeout: WAIT_TIMEOUT });
  await waitForPageLoad(world.page, budget(world));
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
 * Assert an element is present or, when the step said "not", absent.
 *
 * A single `( not)*` group in a step regex covers both polarities through this
 * rather than a second step definition for the negative phrasing.
 *
 * `attached` picks presence-in-DOM over visibility, for markup core renders but
 * scripts may keep hidden for a moment (body classes, the admin toolbar's
 * anti-flicker phase, a results list inside a collapsed region).
 *
 * @param {import('playwright').Locator} locator
 * @param {string|null|undefined} negated - The captured " not" group, if any.
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
 * Assert a locator's text contains — or, with `negated`, does not contain — an
 * expected substring, when the step supplied one. Steps that take an optional
 * `"..."` argument share this so the "is it there" and "does it say the right
 * thing" halves stay one step.
 *
 * The assertion is the wait: the locator is narrowed to the elements whose
 * text contains the substring and Playwright polls for that narrowed set to
 * exist (or to be gone), so text that arrives a moment after the element does
 * still passes, and a miss fails through the authored message.
 *
 * @param {import('playwright').Locator} locator
 * @param {string|null|undefined} expectedText
 * @param {string} label
 * @param {{negated?: boolean, timeout?: number}} [options]
 * @returns {Promise<void>}
 */
async function assertContainsText(locator, expectedText, label, options = {}) {
  if (!supplied(expectedText)) return;
  const negated = Boolean(options.negated);
  // Whitespace-collapsed, case-sensitive substring match, as a regex so
  // Playwright's `hasText` keeps the case.
  const pattern = new RegExp(
    expectedText.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  );
  const withText = locator.filter({ hasText: pattern });
  try {
    await withText.waitFor({ state: negated ? 'detached' : 'attached', timeout: options.timeout || WAIT_TIMEOUT });
  } catch (error) {
    const text = ((await locator.textContent({ timeout: 1000 }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    throw friendly({
      message: negated
        ? `Expected ${label} not to contain "${expectedText}".`
        : `Expected ${label} to contain "${expectedText}".`,
      cause: `it reads "${text}"`,
      hint: 'Text is matched as a substring, whitespace-collapsed but case-sensitive.',
    });
  }
}

// ---------------------------------------------------------------------------
// Users registry
// ---------------------------------------------------------------------------

/**
 * Look up a user by its handle in `worldParameters.users`.
 *
 * The registry maps a handle a feature file can read ("admin", "editor",
 * "content editor") to the real account: `{ username, password }`, plus any
 * extra keys a pack wants (an `email`, for example). A handle with no
 * `username` falls back to the handle itself as the account name.
 *
 * @param {object} world - The cucumber World.
 * @param {string} handle
 * @returns {{username: string, password: string, [key: string]: *}}
 */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  if (!(handle in users)) {
    throw friendly({
      message: `User "${handle}" is not configured.`,
      hint: `Add it to worldParameters.users in cucumber.js. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
    });
  }
  const entry = users[handle] || {};
  return Object.assign({}, entry, {
    username: entry.username || handle,
    password: entry.password,
  });
}

// ---------------------------------------------------------------------------
// Form submission
// ---------------------------------------------------------------------------

/**
 * Submit a form by dispatching the submit button's click inside the page, and
 * wait for the navigation it causes before settling.
 *
 * A Playwright pointer click waits for the button to be actionable, and a
 * fixed-position overlay (a chat widget, a sticky action bar, a cookie banner)
 * covering an otherwise correct button turns that into a 30s timeout. The
 * in-page dispatch runs the button's own handlers regardless of what is drawn
 * on top of it. The click and the navigation wait start together in a
 * `Promise.all` so a fast redirect cannot complete before the wait is armed.
 *
 * `selector` may list several candidates; the first visible one is clicked,
 * and when none is visible the first match is. With no match at all the
 * nearest form is submitted natively.
 *
 * @param {object} world - The cucumber World.
 * @param {string} selector - CSS selector(s) for the submit control.
 * @param {string} [formSelector] - Form to fall back to when no button matches.
 * @returns {Promise<boolean>} Whether a button or form was found.
 */
async function submitInPage(world, selector, formSelector) {
  const page = world.page;
  let found = false;
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: WAIT_TIMEOUT }).catch(() => {}),
    page.evaluate(({ selector, formSelector }) => {
      const candidates = [...document.querySelectorAll(selector)];
      const visible = candidates.find((el) => el.offsetParent !== null) || candidates[0];
      if (visible) {
        visible.click();
        return true;
      }
      const form = (formSelector && document.querySelector(formSelector)) || document.forms[0];
      if (form) {
        form.submit();
        return true;
      }
      return false;
    }, { selector, formSelector }).then((ok) => { found = ok; }),
  ]);
  await smartSettle(page, budget(world));
  return found;
}

/**
 * Log in through core's login form (`/user/login`, `#edit-name`,
 * `#edit-pass`, `#edit-submit`) with the robust in-page submit.
 *
 * @param {object} world - The cucumber World.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<void>}
 */
async function loginWithForm(world, username, password) {
  const page = world.page;
  // Start from a fresh session: an authenticated visitor is redirected away
  // from /user/login to their profile and would never see the form.
  await world.context.clearCookies();
  await navigate(world, '/user/login');
  await waitForState(
    page.locator('#edit-name').first(),
    'visible',
    'Expected the login form\'s username field ("#edit-name") on /user/login'
  );
  await page.locator('#edit-name').first().fill(username);
  await page.locator('#edit-pass').first().fill(password);
  // A site that protects the login form with Honeypot refuses a form sent
  // within its time limit (2 seconds by default): `worldParameters.loginWait`
  // (milliseconds) holds the submit back for that long.
  const loginWait = Number(world.parameters && world.parameters.loginWait) || 0;
  if (loginWait > 0) await page.waitForTimeout(loginWait);
  await submitInPage(world, '#user-login-form #edit-submit, form.user-login-form #edit-submit, #edit-submit', '#user-login-form, form.user-login-form');
  if (await waitForAuthenticated(world, 2000)) return;
  // Report a refused login as what it is, instead of leaving the next step
  // to fail on a page that is still the login form.
  const form = page.locator('#user-login-form, form.user-login-form').first();
  if (await form.isVisible().catch(() => false)) {
    const error = page.locator('.form-item--error-message, .messages--error, [aria-label="Error message"]').first();
    const shown = await error.isVisible({ timeout: 500 }).catch(() => false);
    const text = shown ? ((await error.textContent()) || '').replace(/\s+/g, ' ').trim() : 'the login form is still shown';
    throw friendly({
      message: `Logging in as "${username}" was refused.`,
      cause: text,
      hint: 'Check the account exists on the site under test (Given I add the testing users creates the registry accounts) and that the password in worldParameters.users is current.',
    });
  }
  if (await waitForAuthenticated(world, budget(world))) return;
  throw friendly({
    message: `Expected an authenticated session after logging in as "${username}".`,
    cause: 'The page shows no sign of a session (the "user-logged-in" body class, drupalSettings.user.uid, a logout link) and /user/login still serves the form.',
    hint: 'Check the account exists on the site under test (Given I add the testing users creates the registry accounts) and that the password in worldParameters.users is current.',
  });
}

/**
 * Whether the page in front of us belongs to an authenticated session, from
 * what the page itself shows: core's themes put `user-logged-in` on the body,
 * but a theme may render the body without its attributes (UIkit Admin does),
 * so the `drupalSettings.user.uid` every page carries and the logout link of
 * the user menu count as well.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
async function authenticatedOnPage(page) {
  return page.evaluate(() => {
    const body = document.body;
    if (body && body.classList && body.classList.contains('user-logged-in')) return true;
    const settings = window.drupalSettings;
    if (settings && settings.user && Number(settings.user.uid) > 0) return true;
    return Boolean(document.querySelector('a[href*="/user/logout"]'));
  }).catch(() => false);
}

/**
 * Whether the current session is authenticated. The page's own signals
 * first; when it shows none of them, the site is asked: an authenticated
 * visitor requesting `/user/login` is redirected to their account page
 * (`/user/<uid>`), an anonymous one gets the login form. The request runs in
 * the browser context, with its cookies, and never changes the page.
 *
 * @param {object} world - The cucumber World.
 * @returns {Promise<boolean>}
 */
async function isAuthenticated(world) {
  if (await authenticatedOnPage(world.page)) return true;
  try {
    const response = await world.page.request.get(joinUrl(world.launchUrl, '/user/login'), { failOnStatusCode: false });
    return /\/user\/\d+(?:[/?#]|$)/.test(response.url());
  } catch (error) {
    return false;
  }
}

/**
 * Wait until the session is authenticated (or, with `expected` false, until
 * it is anonymous), polling `isAuthenticated` every 250 ms.
 *
 * @param {object} world - The cucumber World.
 * @param {number} timeout - Milliseconds to keep trying.
 * @param {boolean} [expected=true]
 * @returns {Promise<boolean>} Whether the expected state was reached in time.
 */
async function waitForAuthenticated(world, timeout, expected = true) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if ((await isAuthenticated(world)) === expected) return true;
    if (Date.now() >= deadline) return false;
    await world.page.waitForTimeout(250);
  }
}

/**
 * Click a locator robustly: a normal pointer click first, then an in-page
 * dispatch of the full mousedown/mouseup/click sequence when the pointer click
 * is not possible (an overlay covers the element, or it is a sticky clone the
 * browser will not point-click). `mousedown` is included because core's
 * ajax.js binds AJAX buttons to it, so a bare `click()` would not trigger them.
 * A missing or disabled element still fails.
 *
 * @param {import('playwright').Locator} locator
 * @returns {Promise<void>}
 */
async function robustClick(locator) {
  try {
    await locator.click({ timeout: 5000 });
    return;
  } catch {
    // Fall through to the in-page dispatch.
  }
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.evaluate((el) => {
    for (const type of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  });
}

// ---------------------------------------------------------------------------
// Form API fields
// ---------------------------------------------------------------------------

/**
 * Resolve a form field's DOM id from a label, a name, an id or a CSS selector.
 *
 * Label matching tolerates what core appends to a label: the "(Edit summary)"
 * suffix of a text field with a summary, and the trailing "*" of a required
 * field, so "Body" resolves the "Body (Edit summary)" field.
 *
 * @param {import('playwright').Page} page
 * @param {string} locator
 * @returns {Promise<string|null>}
 */
async function resolveFieldId(page, locator) {
  return page.evaluate((locator) => {
    if (document.getElementById(locator)) return locator;
    const norm = (s) => s.trim().replace(/\s*\(Edit summary\)\s*$/i, '').replace(/\s*\*\s*$/, '').trim();
    let label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === locator);
    if (!label) label = [...document.querySelectorAll('label')].find((l) => norm(l.textContent) === locator);
    if (label && label.getAttribute('for')) return label.getAttribute('for');
    const byName = document.querySelector(`[name="${locator}"]`);
    if (byName && byName.id) return byName.id;
    try {
      const el = document.querySelector(locator);
      if (el && el.id) return el.id;
    } catch {
      // Not a selector.
    }
    return null;
  }, locator);
}

/**
 * Write into a CKEditor 5 field through its editor instance.
 *
 * Resolves the field (label, name, id or selector), waits for the editor to
 * register in `Drupal.CKEditor5Instances` (it boots asynchronously after
 * `Drupal.attachBehaviors`), then calls `setData()` and writes the result
 * straight back to the source `<textarea>` with `updateSourceElement()`, so the
 * value is posted however the form is later submitted.
 *
 * @param {import('playwright').Page} page
 * @param {string} locator
 * @param {string} value - HTML or plain text.
 * @param {'set'|'append'} mode
 * @returns {Promise<boolean>} Whether an editor instance was found and written.
 */
async function setCkeditorData(page, locator, value, mode) {
  const fieldId = await resolveFieldId(page, locator);
  if (!fieldId) return false;
  try {
    await page.waitForFunction((id) => {
      const el = document.getElementById(id);
      return !!(el && window.Drupal && Drupal.CKEditor5Instances
        && Drupal.CKEditor5Instances.get(el.dataset.ckeditor5Id));
    }, fieldId, { timeout: 15000 });
  } catch {
    // The editor never registered; the evaluate below reports it.
  }
  return page.evaluate(({ fieldId, value, mode }) => {
    const el = document.getElementById(fieldId);
    if (!el || !window.Drupal || !Drupal.CKEditor5Instances) return false;
    const instance = Drupal.CKEditor5Instances.get(el.dataset.ckeditor5Id);
    if (!instance) return false;
    instance.setData(mode === 'append' ? instance.getData() + value : value);
    if (typeof instance.updateSourceElement === 'function') {
      instance.updateSourceElement();
    }
    return true;
  }, { fieldId, value, mode });
}

/**
 * Read a checkbox's checked state by its visible label text. Handles
 * `label[for]`, a wrapping label and a sibling label.
 *
 * @param {import('playwright').Page} page
 * @param {string} label
 * @returns {Promise<boolean|null>} `null` when no such checkbox exists.
 */
async function checkboxStateByLabel(page, label) {
  return page.evaluate((labelText) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const labels = [...document.querySelectorAll('label')]
      .filter((l) => norm(l.textContent).includes(norm(labelText)));
    for (const l of labels) {
      const forId = l.getAttribute('for');
      if (forId) {
        const byFor = document.getElementById(forId);
        if (byFor && byFor.type === 'checkbox') return byFor.checked;
      }
      const inner = l.querySelector('input[type="checkbox"]');
      if (inner) return inner.checked;
      const prev = l.previousElementSibling;
      if (prev && prev.matches && prev.matches('input[type="checkbox"]')) return prev.checked;
      const next = l.nextElementSibling;
      if (next && next.matches && next.matches('input[type="checkbox"]')) return next.checked;
    }
    return null;
  }, label);
}

/**
 * Read a checkbox's checked state by a machine handle: a DOM id, a
 * `data-drupal-selector` or a `name` attribute.
 *
 * @param {import('playwright').Page} page
 * @param {string} handle
 * @returns {Promise<boolean|null>} `null` when no such checkbox exists.
 */
async function checkboxStateByHandle(page, handle) {
  return page.evaluate((h) => {
    const el =
      document.getElementById(h) ||
      document.querySelector(`[data-drupal-selector="${h}"]`) ||
      document.querySelector(`input[name="${h}"]`) ||
      document.querySelector(`input[name="${h}[value]"]`);
    if (!el) return null;
    return !!el.checked;
  }, handle);
}

/**
 * Wait until at least one element matches the selector, or the budget runs
 * out. Web-first: Playwright polls the locator itself, no fixed sleeps.
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @param {number} timeout
 * @returns {Promise<boolean>}
 */
async function waitForMatch(page, selector, timeout) {
  try {
    await page.locator(selector).first().waitFor({ state: 'attached', timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * The id of the content item on screen, read from core's settings payload
 * (`drupalSettings.path.currentPath`), the `page-node-<nid>` body class, the
 * shortlink or any `/node/<nid>` link on the page; null on other pages.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<string|null>}
 */
async function currentNodeId(page) {
  return page.evaluate(() => {
    const settings = window.drupalSettings && window.drupalSettings.path;
    const fromPath = settings && typeof settings.currentPath === 'string' && (settings.currentPath.match(/^node\/(\d+)$/) || [])[1];
    if (fromPath) return fromPath;
    const fromBody = (document.body.className.match(/page-node-(\d+)/) || [])[1];
    if (fromBody) return fromBody;
    const fromShortlink = document.querySelector('link[rel="shortlink"][href*="/node/"]');
    const fromLink = fromShortlink && (fromShortlink.getAttribute('href').match(/\/node\/(\d+)/) || [])[1];
    if (fromLink) return fromLink;
    for (const a of document.querySelectorAll('a[href*="/node/"]')) {
      const match = (a.getAttribute('href') || '').match(/\/node\/(\d+)(\/|$|\?)/);
      if (match) return match[1];
    }
    return null;
  });
}

/**
 * Request a URL through the browser context's own cookie jar and return the
 * HTTP status the current session gets.
 *
 * webship-js's "response status code" step re-requests the URL without the
 * session cookies, so it always answers as an anonymous visitor; this is the
 * session-aware counterpart.
 *
 * @param {import('playwright').Page} page
 * @param {string} url
 * @returns {Promise<number>}
 */
async function sessionStatus(page, url) {
  const response = await page.request.get(url, { failOnStatusCode: false, maxRedirects: 0 });
  return response.status();
}

module.exports = {
  WAIT_TIMEOUT,
  VISIBLE_SUBMIT,
  supplied,
  budget,
  joinUrl,
  navigate,
  waitForState,
  assertPresence,
  assertContainsText,
  resolveUser,
  submitInPage,
  loginWithForm,
  isAuthenticated,
  waitForAuthenticated,
  robustClick,
  resolveFieldId,
  setCkeditorData,
  checkboxStateByLabel,
  checkboxStateByHandle,
  waitForMatch,
  sessionStatus,
  currentNodeId,
};
