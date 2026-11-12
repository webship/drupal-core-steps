'use strict';

// Step definitions for what a Drupal core site renders, whichever theme or
// distribution sits on top of it. The steps read, in this order:
//
//   1. what core's modules state regardless of the theme: the settings
//      payload (`drupalSettings.path.isFront`, `currentPathIsAdmin`,
//      `user.uid`), ARIA roles and labels (`aria-label="Status message"`, the
//      breadcrumb landmark), `data-drupal-*` attributes
//      (`data-drupal-messages`, `data-drupal-selector`), the element ids Form
//      API derives from machine names (`#edit-name`, `#edit-submit`), the
//      Toolbar module's `#toolbar-administration` and the Navigation module's
//      `#admin-toolbar`, the `Generator` meta tag, the `X-Drupal-Cache`
//      headers and the HTTP answer of the site;
//   2. the class names core's own themes print (`body.path-frontpage`,
//      `.messages--status`, `h1.page-title`, `.node--unpublished`), as a
//      fallback;
//   3. a named selector of `tests/selectors/drupal-core.json`, which a project
//      overrides in `worldParameters.selectors` when its theme prints
//      something else.
//
// No step phrase carries the name of the CMS ("the login form", "the front
// page", "the site generator"); only these comments name it, to document
// which convention each step relies on. A scenario passes the name as an
// argument where it is the point: the site generator should be "Drupal 11".
//
// The steps build on webship-js's own (navigation, assertion, form,
// response, accessibility) and do not repeat them: "the response status code
// should be 200", "I should be on the homepage" and "I should see a ".foo"
// element" are webship-js steps and belong in the feature file as such.

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
  LOGIN_FORM,
  supplied,
  budget,
  joinUrl,
  namedSelector,
  pollUntil,
  pageFacts,
  assertMessage,
  navigate,
  waitForState,
  assertPresence,
  assertContainsText,
  resolveUser,
  submitInPage,
  failIfSubmitBlocked,
  loginWithForm,
  robustClick,
  setCkeditorData,
  checkboxStateByLabel,
  checkboxStateByHandle,
  sessionStatus,
  currentNodeId,
  visitorStatus,
  waitForAuthenticated,
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
// module enabled: no path alias and no site-specific menu link is involved.
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
    selector: LOGIN_FORM,
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
    selector: 'form[data-drupal-selector^="contact-message-"], #contact-message-feedback-form, form.contact-message-feedback-form',
    fields: [],
  },
  search: {
    selector: 'form[data-drupal-selector="search-form"], #search-form, form.search-form, #search-block-form',
    fields: [],
  },
  siteinfo: {
    selector: '#system-site-information-settings, form.system-site-information-settings',
    fields: ['#edit-site-name'],
  },
};

// The breadcrumb: the navigation landmark core's template labels, then the
// class of core's themes.
const BREADCRUMB = 'nav[aria-labelledby="system-breadcrumb"], [aria-label="Breadcrumb"], .breadcrumb';

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
// What a site may lack
//
// The steps for content types, the contact form and the search page need
// things a Drupal site does not always have: the Standard profile of Drupal
// 11.4 installs no content type, no Contact and no Search, and Drupal 12
// moved Contact and Search out of core. When a step meets such a site it says
// so, with what the site's build has to provide.
// ---------------------------------------------------------------------------

const SITE_HINTS = {
  contentType: 'A site has only the content types its build created: the Standard profile of Drupal 11.4 and of Drupal 12 installs none ("Article" and "Basic page" come from the core recipes article_content_type and page_content_type on Drupal 11, and from the site\'s own configuration on Drupal 12). Pass the machine name of a type listed at /admin/structure/types.',
  contact: 'The contact form needs the Contact module and a contact form: the Standard profile of Drupal 11.4 does not install the module, and Drupal 12 moved it out of core (the "contact" project provides it). Install it and create the form in the site\'s build, or pass the path of the form the site uses.',
  search: 'The search page needs the Search module: the Standard profile of Drupal 11.4 does not install it, and Drupal 12 moved it out of core (the "search" project provides it). Install it in the site\'s build and index the content (cron).',
};

/**
 * Explain why a form a step needs is not on the page, from the answer the
 * current session gets for the path: a 404 means the site lacks the thing
 * (the hint says what provides it), a 403 that the session may not use it.
 * Returns null when the path answers normally.
 *
 * @param {object} world - The cucumber World.
 * @param {string} path - The path the form lives at.
 * @param {string} what - The thing, for the message ('an "article" content type').
 * @param {string} hint - One of SITE_HINTS.
 * @returns {Promise<Error|null>}
 */
async function explainMissing(world, path, what, hint) {
  const status = await sessionStatus(world.page, joinUrl(world.launchUrl, path)).catch(() => 0);
  if (status === 404) {
    return friendly({ message: `The site has no ${what}.`, cause: `${path} answered 404`, hint });
  }
  if (status === 403) {
    return friendly({
      message: `The current session may not use ${what}.`,
      cause: `${path} answered 403`,
      hint: 'Log in as a user whose role has the permission the page needs.',
    });
  }
  return null;
}

/**
 * Wait for the node add form of a content type and return its title field,
 * or fail saying that the site has no such type, or that the session may
 * not create content of it.
 *
 * @param {object} world - The cucumber World.
 * @param {string} contentType - Machine name.
 * @returns {Promise<import('playwright').Locator>}
 */
async function nodeAddForm(world, contentType) {
  const titleField = world.page.locator('#edit-title-0-value').first();
  const there = await titleField.waitFor({ state: 'visible', timeout: budget(world) + 2000 }).then(() => true).catch(() => false);
  if (!there) {
    const problem = await explainMissing(world, `/node/add/${contentType}`, `"${contentType}" content type`, SITE_HINTS.contentType);
    if (problem) throw problem;
    await waitForState(
      titleField,
      'visible',
      `Expected the node form's title field ("#edit-title-0-value") on /node/add/${contentType}`
    );
  }
  return titleField;
}

// ---------------------------------------------------------------------------
// Response capture
//
// Records the headers of the last main-frame navigation so the cache-header
// steps below can read the *original* response. Re-requesting the URL to read
// them, as a generic header step must, would report the cache state of that
// second request instead, which turns every MISS into a HIT.
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
      hint: 'Open a page first (Given I am on the homepage), then assert on its response headers.',
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
 * Assert one of the site's built-in forms is, or is not, visible, by the
 * `data-drupal-selector` and the id Form API derives from the form's machine
 * name, whatever the theme. Forms with fields the page is useless without
 * (the login form's username and password, the site information form's site
 * name) additionally require those fields. The contact form is any form of
 * the Contact module, not only the one named "feedback". On a site without
 * the Contact or the Search module the step says so.
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
  // A page may carry the same form twice, once hidden (a collapsed search
  // block in the header next to the search page's own form): the visible one
  // is the form a person sees.
  const visibleForm = this.page.locator(form.selector).locator('visible=true').first();
  try {
    await assertPresence(visibleForm, notCase, `the ${name} form ("${form.selector}")`);
  } catch (error) {
    const hint = { contact: SITE_HINTS.contact, search: SITE_HINTS.search }[name];
    const here = new URL(this.page.url());
    const problem = hint && !notCase ? await explainMissing(this, here.pathname + here.search, `${name} form at this path`, hint) : null;
    throw problem || error;
  }
  if (notCase) return;
  for (const field of form.fields) {
    await assertPresence(this.page.locator(field).first(), undefined, `the field "${field}"`);
  }
});

// ---------------------------------------------------------------------------
// Site identity
// ---------------------------------------------------------------------------

/**
 * Assert what the site reports as its generator, by the `Generator` meta tag
 * the System module prints: the name of the software, optionally with its
 * major version, which turns a smoke test into an upgrade guard. The text
 * is matched from the start of the tag, on whole words: "Drupal" and
 * "Drupal 11" both match "Drupal 11 (https://www.drupal.org)", "Drupal 1"
 * does not.
 *
 * Example #1: Then the site generator should be "Drupal"
 * Example #2: Then the site generator should be "Drupal 10"
 * Example #3: And the site generator should be "Drupal 11"
 * Example #4: Then the site generator should not be "Drupal 9"
 * Example #5: And the site generator should not be "Drupal 12"
 *
 */
Then(/^the site generator should( not)* be "([^"]*)"$/, async function (notCase, expected) {
  const meta = this.page.locator('meta[name="Generator"]');
  const count = await meta.count();
  const content = count ? ((await meta.first().getAttribute('content')) || '').trim() : '';
  const wanted = String(expected || '').trim();
  const matches = wanted !== '' && content.toLowerCase().startsWith(wanted.toLowerCase())
    && !/[A-Za-z0-9.]/.test(content.charAt(wanted.length));

  assert.ok(
    notCase ? !matches : matches,
    friendly({
      message: notCase
        ? `Expected the site not to report "${wanted}" as its generator.`
        : `Expected the site to report "${wanted}" as its generator.`,
      cause: count
        ? `the Generator meta tag reads "${content}"`
        : 'the page has no <meta name="Generator"> tag',
      hint: 'The System module prints this tag; a site can remove it in its settings or with a module.',
    }).message
  );
});

/**
 * Assert core's asset pipeline delivered its settings payload: the
 * `drupal-settings-json` script tag, and the `drupalSettings` object core's
 * JavaScript builds from it. A page that renders without the object is a
 * page whose aggregated JavaScript did not arrive or did not run.
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
      hint: 'Core\'s drupal.js builds it from the payload: check the page for a JavaScript error that stopped it.',
    }).message
  );
});

// ---------------------------------------------------------------------------
// Core layout: front page, admin pages, admin bars, breadcrumb, tabs, title
// ---------------------------------------------------------------------------

/**
 * Assert the current page is, or is not, the route configured as the site's
 * front page. Core says so itself in `drupalSettings.path.isFront`, whatever
 * the theme; where a page carries no settings, the `path-frontpage` body
 * class of core's themes (the "front page" named selector) and then the URL
 * decide.
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
  const marker = namedSelector(this, 'front page', 'body.path-frontpage');
  const base = new URL(joinUrl(this.launchUrl, '/')).pathname.replace(/\/+$/, '');
  let seen = { front: false, by: 'nothing' };
  const check = async () => {
    const facts = await pageFacts(this.page);
    if (facts.path && typeof facts.path.isFront === 'boolean') {
      seen = { front: facts.path.isFront, by: `drupalSettings.path.isFront is ${facts.path.isFront}` };
    } else if (await this.page.locator(marker).count()) {
      seen = { front: true, by: `the page matches "${marker}"` };
    } else {
      seen = { front: facts.pathname.replace(/\/+$/, '') === base, by: `the page carries no settings and its path is "${facts.pathname}"` };
    }
    return notCase ? !seen.front : seen.front;
  };
  if (await pollUntil(check, budget(this), this.page)) return;
  throw friendly({
    message: notCase ? 'Expected not to be on the front page.' : 'Expected to be on the front page.',
    cause: seen.by,
    hint: 'The front page is the path set at /admin/config/system/site-information.',
  });
});

/**
 * Assert the current page is, or is not, one of the site's administration
 * pages. Core flags its admin routes and says so in
 * `drupalSettings.path.currentPathIsAdmin`, whatever the theme; that flag,
 * not the URL prefix, is what decides whether the administration theme is
 * used. Where a page carries no settings, the `path-admin` body class of
 * core's themes (the "admin page" named selector) and then the `/admin` URL
 * prefix decide.
 *
 * Example #1: Then I should be on an admin page
 * Example #2: And we should be on an administration page
 * Example #3: Then should be on an admin page
 * Example #4: And I should not be on an admin page
 * Example #5: Then we should not be on an administration page
 *
 */
Then(/^(I |we )*should( not)* be on an admin(?:istration)? page$/, async function (pronounCase, notCase) {
  const marker = namedSelector(this, 'admin page', 'body.path-admin');
  const base = new URL(joinUrl(this.launchUrl, '/')).pathname.replace(/\/+$/, '');
  let seen = { admin: false, by: 'nothing' };
  const check = async () => {
    const facts = await pageFacts(this.page);
    if (facts.path && typeof facts.path.currentPathIsAdmin === 'boolean') {
      seen = { admin: facts.path.currentPathIsAdmin, by: `drupalSettings.path.currentPathIsAdmin is ${facts.path.currentPathIsAdmin}` };
    } else if (await this.page.locator(marker).count()) {
      seen = { admin: true, by: `the page matches "${marker}"` };
    } else {
      seen = { admin: facts.pathname.startsWith(`${base}/admin`), by: `the page carries no settings and its path is "${facts.pathname}"` };
    }
    return notCase ? !seen.admin : seen.admin;
  };
  if (await pollUntil(check, budget(this), this.page)) return;
  throw friendly({
    message: notCase ? 'Expected not to be on an administration page.' : 'Expected to be on an administration page.',
    cause: seen.by,
    hint: 'A route is an administration route when its definition sets "_admin_route"; a 403 or 404 page is not one.',
  });
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
 * Assert the breadcrumb is, or is not, visible: the navigation landmark core
 * labels "Breadcrumb" (`nav[aria-labelledby="system-breadcrumb"]`), or the
 * `.breadcrumb` class of core's themes; the "breadcrumb" named selector
 * overrides both. Core renders no breadcrumb where the trail would be empty,
 * the front page being the usual case, which is what the negative form checks.
 *
 * Example #1: Then I should see the breadcrumb
 * Example #2: And we should see the breadcrumbs
 * Example #3: Then should see the breadcrumb trail
 * Example #4: And I should not see the breadcrumb
 * Example #5: Then we should not see the breadcrumbs
 *
 */
Then(/^(I |we )*should( not)* see the breadcrumbs?(?: trail)?$/, async function (pronounCase, notCase) {
  const selector = namedSelector(this, 'breadcrumb', BREADCRUMB);
  await assertPresence(this.page.locator(selector).first(), notCase, `the breadcrumb ("${selector}")`);
});

/**
 * Assert the local tasks, the tab strip core builds from a module's
 * `*.links.task.yml`, are or are not present: the navigation core labels
 * with `primary-tabs-title`, or the `.tabs` classes of core's themes; the
 * "local tasks" named selector overrides both.
 *
 * Example #1: Then I should see the local tasks
 * Example #2: And we should see the tabs
 * Example #3: Then should see the primary tabs
 * Example #4: And I should see the local tasks
 * Example #5: Then we should not see the local tasks
 *
 */
Then(/^(I |we )*should( not)* see the (?:primary )?(?:local tasks|tabs)$/, async function (pronounCase, notCase) {
  const selector = namedSelector(this, 'local tasks', '[aria-labelledby="primary-tabs-title"], .tabs--primary, nav.tabs');
  await assertPresence(this.page.locator(selector).first(), notCase, `the local tasks ("${selector}")`);
});

/**
 * Assert the title of the page contains, or does not contain, a text: the
 * heading of the main region (the "page title" named selector: an `<h1>`,
 * `h1.page-title` on core's themes). This is the title core renders in the
 * page body, which is not the `<title>` element webship-js's own title steps
 * read. On a theme that prints no heading at all, the page's own part of the
 * document title (the text before " | <site name>") is read instead.
 *
 * Example #1: Then I should see the page title "Log in"
 * Example #2: And we should see the page heading "Content"
 * Example #3: Then should see the page title "Status report"
 * Example #4: And I should not see the page heading "Access denied"
 * Example #5: Then we should see the page title "Reset your password"
 *
 */
Then(/^(I |we )*should( not)* see the page (?:title|heading) "([^"]*)?"$/, async function (pronounCase, notCase, expectedTitle) {
  const selector = namedSelector(this, 'page title', 'h1.page-title, h1');
  const wanted = (expectedTitle || '').replace(/\s+/g, ' ').trim();
  let seen = { headings: [], title: '' };
  const check = async () => {
    seen = await pageFacts(this.page, selector);
    // The document title is "<page title> | <site name>"; its first part
    // stands in for the heading only when the theme prints none.
    const texts = seen.headings.length ? seen.headings : [seen.title.split(' | ')[0]];
    const found = texts.some((text) => text.includes(wanted));
    return notCase ? !found : found;
  };
  if (await pollUntil(check, notCase ? budget(this) : WAIT_TIMEOUT, this.page)) return;
  throw friendly({
    message: notCase
      ? `Expected the page title not to contain "${wanted}".`
      : `Expected the page title to contain "${wanted}".`,
    cause: seen.headings.length
      ? `the page title reads ${seen.headings.map((text) => `"${text}"`).join(' | ')}`
      : `the page has no heading matching "${selector}" and its document title is "${seen.title}"`,
    hint: 'Text is matched as a substring, whitespace-collapsed but case-sensitive. Set the "page title" named selector when the theme prints its title elsewhere.',
  });
});

// ---------------------------------------------------------------------------
// Status messages
// ---------------------------------------------------------------------------

/**
 * Assert a status message is, or is not, visible and, when a text is given,
 * that it contains that text. Core shows one after every successful save, so
 * this doubles as the "did that action take" assertion.
 *
 * The message is found by what core states for it, whatever the theme: the
 * `aria-label="Status message"` of core's message template or a
 * `role="status"` element inside the `data-drupal-messages` region; then by
 * the `.messages--status` class of core's themes. A project whose theme
 * prints something else sets the "status message" named selector. With a
 * text, a messages region that tells no kinds apart is searched as well.
 *
 * Example #1: Then I should see a status message
 * Example #2: And we should see a success message
 * Example #3: Then should see a confirmation message
 * Example #4: And I should see the status message "The configuration options have been saved."
 * Example #5: Then we should not see a status message
 *
 */
Then(/^(I |we )*should( not)* see (?:a|the) (?:status|success|confirmation) message(?: "([^"]*)")?$/, async function (pronounCase, notCase, expectedText) {
  await assertMessage(this, 'status', notCase, expectedText);
});

/**
 * Assert a warning message is, or is not, visible and, when a text is given,
 * that it contains that text: the severity core uses for "this worked, but
 * you should know something", such as the notices of the status report and
 * of the module pages. Found by `aria-label="Warning message"`, then the
 * `.messages--warning` class of core's themes, or the "warning message"
 * named selector.
 *
 * Example #1: Then I should see a warning message
 * Example #2: And we should see a warning
 * Example #3: Then should see a warning message
 * Example #4: And I should see the warning message "Update notifications are not enabled."
 * Example #5: Then we should not see a warning message
 *
 */
Then(/^(I |we )*should( not)* see (?:a|the) warning(?: message)?(?: "([^"]*)")?$/, async function (pronounCase, notCase, expectedText) {
  await assertMessage(this, 'warning', notCase, expectedText);
});

/**
 * Assert an error message is, or is not, visible and, when a text is given,
 * that it contains that text. Core shows one for a failed validation, for
 * rejected credentials and for access notices alike. Found by
 * `aria-label="Error message"` or a `role="alert"` element inside the
 * `data-drupal-messages` region, then the `.messages--error` class of core's
 * themes, or the "error message" named selector.
 *
 * Example #1: Then I should see an error message
 * Example #2: And we should see a validation error
 * Example #3: Then should see a form error
 * Example #4: And I should see a login error "Unrecognized username or password."
 * Example #5: Then we should not see an error message
 *
 */
Then(/^(I |we )*should( not)* see an? (?:validation |form |login |sign-?in |authentication )?error(?: message)?(?: "([^"]*)")?$/, async function (pronounCase, notCase, expectedText) {
  await assertMessage(this, 'error', notCase, expectedText);
});

// ---------------------------------------------------------------------------
// Content pages
// ---------------------------------------------------------------------------

/**
 * Assert the current page shows content of the given type, or does not. The
 * argument is the content type's machine name, not its label.
 *
 * Core's themes print the type as the `page-node-type-<type>` body class and
 * the `node--type-<type>` class (the "content type page" named selector, with
 * `{type}` where the machine name goes). On a theme that prints neither, the
 * site is asked: the item's edit form states its type in the
 * `data-drupal-selector` Form API gives it, whatever the theme, for a session
 * that may edit the item.
 *
 * Example #1: Then I should be on an "article" page
 * Example #2: And we should be on a "page" content page
 * Example #3: Then should be on a "basic_page" page
 * Example #4: And I should be on an "event" page
 * Example #5: Then we should not be on an "article" page
 *
 */
Then(/^(I |we )*should( not)* be on an? "([^"]*)?"(?: content)? page$/, async function (pronounCase, notCase, contentType) {
  const type = String(contentType || '').trim();
  const hyphenated = type.replace(/_/g, '-');
  const template = namedSelector(this, 'content type page', 'body.page-node-type-{type}, .node--type-{type}');
  const selector = [...new Set([template.replace(/\{type\}/g, hyphenated), template.replace(/\{type\}/g, type)])].join(', ');
  let seen = { is: false, by: 'nothing' };
  const check = async () => {
    if (await this.page.locator(selector).count()) {
      seen = { is: true, by: `the page matches "${selector}"` };
    } else if (await this.page.locator('body[class*="page-node-type-"], [class*="node--type-"]').count()) {
      const facts = await pageFacts(this.page);
      seen = { is: false, by: `nothing matches "${selector}" (body classes: ${facts.bodyClasses.join(' ') || 'none'})` };
    } else {
      // The theme prints no type at all: ask the site.
      const nid = await currentNodeId(this.page);
      const response = nid
        ? await this.page.request.get(joinUrl(this.launchUrl, `/node/${nid}/edit`), { failOnStatusCode: false }).catch(() => null)
        : null;
      const form = response && response.status() === 200
        ? ((await response.text()).match(/data-drupal-selector="node-([a-z0-9-]+)-edit-form"/) || [])[1]
        : null;
      seen = form
        ? { is: form === hyphenated, by: `the theme prints no content type; the edit form of node ${nid} is the "${form}" form` }
        : { is: false, by: `the theme prints no content type and ${nid ? `the session may not open /node/${nid}/edit` : 'the page is not a content item'}` };
    }
    return notCase ? !seen.is : seen.is;
  };
  if (await pollUntil(check, budget(this), this.page)) return;
  throw friendly({
    message: notCase
      ? `Expected the page not to show "${type}" content.`
      : `Expected the page to show "${type}" content.`,
    cause: seen.by,
    hint: 'Pass the machine name of the content type. For a theme that prints the type in its own way, set the "content type page" named selector, with {type} for the machine name.',
  });
});

/**
 * Create a content item through core's node form: open `/node/add/<type>`, fill
 * the title field (`#edit-title-0-value`, the id Form API derives from the base
 * field's machine name and delta) and save. The saved item is remembered as
 * "the content item I created" for the view, edit and delete steps.
 *
 * The type is the machine name of a content type the site has. A site has
 * only the types its build created (the Standard profile installs none), and
 * the step says so when the type is missing.
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
  const titleField = await nodeAddForm(this, contentType);
  await titleField.fill(title);
  await submitInPage(this, 'form.node-form [data-drupal-selector="edit-submit"], form.node-form #edit-submit, #edit-submit', 'form.node-form');
  failIfSubmitBlocked(this, `the "${contentType}" form (the type has other required fields: fill the form with "I am adding ..." and the field steps instead)`);
  // The item just saved is "the content item I created" for the steps that
  // view, edit or delete it later in the scenario.
  const nid = await currentNodeId(this.page);
  if (nid) this._drupalCreated = { nid, url: this.page.url() };
});

/**
 * Assert a Views listing reported no results (the empty region core's
 * `views-view` template renders in place of rows), or that it did return
 * some. Every core administration listing (content, people, files, the log)
 * is a View, so this is how an empty one is asserted without matching its
 * site-specific "no results" wording. Core's templates use the class
 * `views-empty`, several base themes `view-empty`; the "empty view" named
 * selector overrides both.
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
  const selector = namedSelector(this, 'empty view', '.views-empty, .view-empty');
  await assertPresence(
    this.page.locator(selector).first(),
    negated ? ' not' : undefined,
    `the empty region of a listing ("${selector}")`
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
  await submitInPage(this, `${LOGIN_FORM.split(', ').map((form) => `${form} [data-drupal-selector="edit-submit"]`).join(', ')}, #edit-submit`, LOGIN_FORM);
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert the session is, or is not, authenticated: the `user-logged-in` body
 * class, `drupalSettings.user.uid` or a logout link on the page, and when a
 * theme shows none of them, the site's own answer (an authenticated visitor is
 * redirected away from `/user/login`). The negative form is what confirms a
 * logout actually destroyed the session rather than merely redirecting.
 *
 * Example #1: Then I should be logged in
 * Example #2: And we should be signed in
 * Example #3: Then should be authenticated
 * Example #4: And I should not be logged in
 * Example #5: Then we should not be authenticated
 *
 */
Then(/^(I |we )*should( not)* be (?:logged in|signed in|authenticated)$/, async function (pronounCase, notCase) {
  const expected = !notCase;
  if (await waitForAuthenticated(this, budget(this), expected)) return;
  throw friendly({
    message: expected ? 'Expected an authenticated session.' : 'Expected an anonymous session.',
    cause: expected
      ? 'The page shows no sign of a session (the "user-logged-in" body class, drupalSettings.user.uid, a logout link) and /user/login still serves the form.'
      : 'The page still shows a session (the "user-logged-in" body class, drupalSettings.user.uid or a logout link), or /user/login redirects to an account page.',
    hint: expected
      ? 'Log in first (Given I am a logged in user with the "<handle>" user).'
      : 'Log out first (When I log out), or start the scenario anonymous (Given I am not logged in).',
  });
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
 * The form must be on screen already (pair the step with "Given I am on the
 * password reset page"), so the step stays usable when the form is reached from
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
  await submitInPage(this, 'form[data-drupal-selector="user-pass"] [data-drupal-selector="edit-submit"], #user-pass #edit-submit, #edit-submit', '#user-pass, form.user-pass');
  await waitForPageLoad(this.page, defaultTime);
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search for a term by filling the keyword field (`input[name="keys"]`, the
 * name the Search module uses for both the search block and the search page;
 * the "search input" named selector) and submitting. On a site without the
 * Search module the step says so.
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
  // The keyword field is not unique on the search page: a header search
  // block renders its own collapsed field with the same name alongside the
  // search page's own. The visible one is filled.
  const selector = namedSelector(this, 'search input', 'input[name="keys"]');
  const keys = this.page.locator(selector).locator('visible=true').first();
  const there = await keys.waitFor({ state: 'visible', timeout: budget(this) + 2000 }).then(() => true).catch(() => false);
  if (!there) {
    const here = new URL(this.page.url());
    const problem = await explainMissing(this, here.pathname + here.search, 'search page at this path', SITE_HINTS.search);
    throw problem || friendly({
      message: 'The page shows no search keyword field.',
      cause: `nothing visible matches "${selector}" at ${this.page.url()}`,
      hint: `Open the search page first (Given I am on the search page). ${SITE_HINTS.search}`,
    });
  }
  await keys.fill(term);
  await keys.press('Enter');
  await waitForPageLoad(this.page, defaultTime);
});

/**
 * Assert the search returned results, or, with "no" or "not", that it
 * returned none. The results are the items of the list the Search module
 * renders (`ol.search-results`; the "search results" named selector), or,
 * where a theme drops that class, of the ordered list of the main region
 * whose every item carries a linked heading. "No results" means the page ran a search and
 * lists no item, so the assertion does not depend on the wording or the
 * language of the "Your search yielded no results." text.
 *
 * Example #1: Then I should see search results
 * Example #2: And we should see search results
 * Example #3: Then should see search results
 * Example #4: And I should see no search results
 * Example #5: Then we should not see search results
 *
 */
Then(/^(I |we )*should( not)* see (no )?search results$/, async function (pronounCase, notCase, noCase) {
  const wantNone = Boolean(notCase || noCase);
  const list = namedSelector(this, 'search results', '.search-results, ol[class*="search-results"]');
  const input = namedSelector(this, 'search input', 'input[name="keys"]');
  let seen = { items: [], searched: false };
  const check = async () => {
    seen = await this.page.evaluate(({ list, input }) => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      let lists = [];
      try { lists = [...document.querySelectorAll(list)]; } catch (e) { lists = []; }
      if (!lists.length) {
        // A theme may drop the class: the results are then the ordered list
        // of the main region whose every item carries a linked heading.
        lists = [...document.querySelectorAll('main ol, [role="main"] ol')]
          .filter((ol) => ol.children.length && [...ol.children].every((li) => li.tagName === 'LI' && li.querySelector('h2 a, h3 a, h4 a')));
      }
      const items = [];
      for (const el of lists) {
        const rows = el.matches('ol, ul') ? [...el.children].filter((c) => c.tagName === 'LI') : [...el.querySelectorAll('li, article, .search-result')];
        for (const row of rows) {
          const title = row.querySelector('h2, h3, h4, a');
          items.push(norm((title || row).textContent).slice(0, 80));
        }
      }
      let field = null;
      try { field = document.querySelector(input); } catch (e) { field = null; }
      const searched = /[?&]keys=/.test(window.location.search) || Boolean(field && field.value);
      return { items, searched };
    }, { list, input });
    return wantNone ? (seen.searched && seen.items.length === 0) : seen.items.length > 0;
  };
  if (await pollUntil(check, wantNone ? budget(this) : WAIT_TIMEOUT, this.page)) return;
  if (!seen.searched && !seen.items.length) {
    const here = new URL(this.page.url());
    const problem = await explainMissing(this, here.pathname + here.search, 'search page at this path', SITE_HINTS.search);
    if (problem) throw problem;
  }
  throw friendly({
    message: wantNone ? 'Expected the search to return no results.' : 'Expected the search to return results.',
    cause: seen.items.length
      ? `it lists ${seen.items.length}: ${seen.items.slice(0, 5).map((t) => `"${t}"`).join(', ')}`
      : (seen.searched ? `nothing matches "${list}" with an item in it` : 'the page ran no search (no "keys" in the URL and no keyword in the search field)'),
    hint: 'Search first (When I search for "..."). New content is found once it is indexed, which cron does. Set the "search results" named selector when the theme lists results in its own markup.',
  });
});

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

/**
 * Fill and submit the contact form on screen (core's Contact module; open it
 * first with "I am on the contact page"). A visitor's submission also needs a
 * name and an email address: when those fields are present they are filled
 * from the `anonymous` entry of the users registry
 * (`worldParameters.users.anonymous`, keys `name` and `email`), falling back
 * to "Webship QA" / "qa@example.com". On a site without the Contact module
 * or without a contact form the step says so.
 *
 * Example #1: When I submit the contact form with subject "Question" and message "Hello there"
 * Example #2: And we submit the contact form with subject "Support" and message "Need help"
 * Example #3: When submit the contact form with subject "Feedback" and message "Great site"
 * Example #4: And I submit the contact form with subject "Bug report" and message "Found an issue"
 * Example #5: When we submit the contact form with subject "General" and message "Just saying hi"
 *
 */
When(/^(I |we )*submit the contact form with subject "([^"]*)" and message "([^"]*)"$/, async function (pronounCase, subject, message) {
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
  if (!(await this.page.locator('[name="subject[0][value]"], [name="message[0][value]"]').count())) {
    const here = new URL(this.page.url());
    const problem = await explainMissing(this, here.pathname + here.search, 'contact form at this path', SITE_HINTS.contact);
    throw problem || friendly({
      message: 'The page shows no contact form.',
      cause: `${this.page.url()} has no subject and no message field`,
      hint: 'Open the contact form first (Given I am on the contact page, or the path of the form the site uses).',
    });
  }
  await fillField(this.page, 'subject[0][value]', subject);
  await fillField(this.page, 'message[0][value]', message);
  // Through the form's own button: a page may carry other forms with an
  // "#edit-submit" of their own (a search block in the header).
  await submitInPage(this, 'form[data-drupal-selector^="contact-message-"] [data-drupal-selector="edit-submit"], form[data-drupal-selector^="contact-message-"] [type="submit"]:not([data-drupal-selector="edit-preview"]), #edit-submit', 'form[data-drupal-selector^="contact-message-"]');
});

// ---------------------------------------------------------------------------
// Error pages
// ---------------------------------------------------------------------------

/**
 * Assert the current page is, or is not, the default access-denied (403) or
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
 * `X-Drupal-Cache` (Internal Page Cache: whole responses for visitors) and
 * `X-Drupal-Dynamic-Cache` (Dynamic Page Cache: per block, for every session)
 * headers. A "HIT" is a cached response; anything else ("MISS",
 * "UNCACHEABLE" or a missing header) is not.
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
 * Assert the breadcrumb (the "breadcrumb" named selector: the navigation
 * core labels "Breadcrumb", or `.breadcrumb`) contains, or does not contain,
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
  const selector = namedSelector(this, 'breadcrumb', BREADCRUMB);
  const breadcrumb = this.page.locator(selector).first();
  await assertPresence(breadcrumb, undefined, `the breadcrumb ("${selector}")`, { attached: true });
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
  await nodeAddForm(this, machineName);
});

/**
 * Assert the content item being viewed is published or unpublished.
 *
 * Core's themes mark an unpublished item with the `node--unpublished` class
 * (the "unpublished content" named selector). On a theme that prints no node
 * classes at all, the site is asked instead: the item is requested as a
 * visitor with no session, and a refusal (403 or 404) means it is not
 * published. That answer assumes visitors may view published content, which
 * is core's default.
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
  const marker = namedSelector(this, 'unpublished content', '.node--unpublished, article.unpublished');
  let seen = { unpublished: false, by: 'nothing' };
  const check = async () => {
    if (await this.page.locator(marker).count()) {
      seen = { unpublished: true, by: `the page matches "${marker}"` };
    } else if (await this.page.locator('[class*="node--"], article.node').count()) {
      seen = { unpublished: false, by: `the theme prints the node classes and nothing matches "${marker}"` };
    } else {
      const nid = await currentNodeId(this.page);
      if (!nid) {
        throw friendly({
          message: 'Could not determine which content item is being viewed.',
          hint: 'Open a content item\'s page (a /node/<nid> URL or its alias) first.',
        });
      }
      const status = await visitorStatus(joinUrl(this.launchUrl, `/node/${nid}`));
      seen = {
        unpublished: status === 403 || status === 404,
        by: `the theme prints no node classes; a visitor with no session gets ${status} for /node/${nid}`,
      };
    }
    return seen.unpublished === expectUnpublished;
  };
  if (await pollUntil(check, budget(this), this.page)) return;
  throw friendly({
    message: `Expected the content item to be ${expectUnpublished ? 'unpublished' : 'published'}.`,
    cause: seen.by,
    hint: 'Set the "unpublished content" named selector when the theme marks an unpublished item in its own way.',
  });
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
 * the page. Core suffixes a repeated id (`edit-submit--2`), a search block in
 * the header has an `edit-submit` of its own, and some administration themes
 * clone the primary button into a sticky bar that covers the original. So
 * every element whose id, `data-drupal-selector` or `name` matches is a
 * candidate, and the visible one in the main region of the page is clicked.
 * Waits for the navigation the submit causes; when the browser refuses the
 * submit because a required field is empty, the step returns at once.
 *
 * Example #1: When I submit by id "edit-submit"
 * Example #2: And I submit the form by id "edit-submit"
 * Example #3: When we submit by the id "edit-preview"
 * Example #4: And I submit the form by the id "edit-delete"
 * Example #5: When I submit by id "edit-clear"
 *
 */
When(/^(I |we )*submit (?:the form )?by (?:the )?id "([^"]*)"$/, async function (pronounCase, id) {
  // In this order: the exact id, the id core suffixed, the selector Form API
  // states, the name. The first with a visible match is the one submitted.
  const selector = `#${id}, [id^="${id}--"], [data-drupal-selector="${id}"], [name="${id}"]`;
  await this.page.locator(selector).first().waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
  const found = await submitInPage(this, selector);
  if (!found) {
    throw friendly(`No submit control with the id "${id}" was found on the page.`);
  }
});
