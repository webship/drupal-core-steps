'use strict';

// Steps for core's Navigation module: the admin sidebar (`#admin-toolbar`)
// and the top bar (`.top-bar`) it renders above a content item, with the
// page actions ("Edit", "Delete", "Revisions") and the "More actions"
// dropdown. The module is part of core since 10.3 and is what Drupal CMS
// ships as its administration UI; a site on the Toolbar module instead has
// neither element, and these steps say so.

const { When, Then } = require('@cucumber/cucumber');
const { waitForPageLoad, friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  navigate,
  waitForState,
  assertPresence,
  robustClick,
} = require('./drupal-helpers');

const SELECTORS = {
  navigation: '#admin-toolbar',
  topBar: '.top-bar',
  topBarActions: '.top-bar button.toolbar-button--icon--dots, .top-bar button[aria-label="More actions"]',
};

/**
 * Escape a string for use in a RegExp.
 *
 * @param {string} s
 * @returns {string}
 */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Navigation sidebar
// ---------------------------------------------------------------------------

/**
 * Assert the Navigation sidebar lists, or does not list, a menu link by its
 * exact text, collapsed sections included (their links are in the markup).
 * Which links a role sees is how a site scopes the back end, so this is the
 * quick permission check for a role.
 *
 * Example #1: Then the navigation toolbar should list "Content"
 * Example #2: And the navigation sidebar should list "Pages"
 * Example #3: Then the navigation menu should not list "People"
 * Example #4: And the admin menu should list "Media"
 * Example #5: Then the navigation toolbar should not list "Extend"
 *
 */
Then(/^the (?:navigation|admin) (?:toolbar|sidebar|menu) should( not)* list "([^"]*)"$/, async function (notCase, linkText) {
  const sidebar = this.page.locator(SELECTORS.navigation).first();
  await assertPresence(sidebar, undefined, 'the navigation sidebar ("#admin-toolbar")', { attached: true });
  const link = sidebar.locator('a, button').filter({ hasText: new RegExp(`^\\s*${escapeRe(linkText)}\\s*$`) }).first();
  await assertPresence(link, notCase, `a "${linkText}" link in the navigation sidebar`, { attached: true });
});

/**
 * Follow a menu link of the Navigation sidebar by its exact text, by
 * navigating to the link's target (links inside a collapsed section are in
 * the markup but not visible, and this is where a click would have gone).
 *
 * Example #1: When I click "Content" in the navigation toolbar
 * Example #2: And I click "People" in the navigation sidebar
 * Example #3: When we click "Media" in the navigation menu
 * Example #4: And I click "Structure" in the admin menu
 * Example #5: When I click "Extend" in the navigation toolbar
 *
 */
When(/^(I |we )*click "([^"]*)" in the (?:navigation|admin) (?:toolbar|sidebar|menu)$/, async function (pronounCase, linkText) {
  const sidebar = this.page.locator(SELECTORS.navigation).first();
  await assertPresence(sidebar, undefined, 'the navigation sidebar ("#admin-toolbar")', { attached: true });
  const href = await sidebar.evaluate((nav, text) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const link = [...nav.querySelectorAll('a[href]')].find((a) => norm(a.textContent) === text);
    return link ? link.getAttribute('href') : null;
  }, linkText);
  if (!href) {
    throw friendly(`No "${linkText}" link was found in the navigation sidebar.`);
  }
  await navigate(this, href);
});

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

/**
 * Open the top bar's "More actions" dropdown (the dots button) that holds the
 * secondary page actions: Delete, Revisions, Duplicate, Edit template.
 *
 * Example #1: When I open the top bar page actions
 * Example #2: And I open the top bar page actions menu
 * Example #3: When we open the top bar more actions
 * Example #4: And I open the more actions menu in the top bar
 * Example #5: When I open the top bar more actions menu
 *
 */
When(/^(I |we )*open the (?:top bar (?:page actions|more actions)(?: menu)?|more actions menu in the top bar)$/, async function (pronounCase) {
  const button = this.page.locator(SELECTORS.topBarActions).first();
  await waitForState(button, 'visible', 'Expected the top bar\'s "More actions" button (the Navigation module renders it above a content item)');
  await waitForPageLoad(this.page, budget(this));
  await robustClick(button);
  await waitForPageLoad(this.page, budget(this));
});

/**
 * Assert the top bar offers, or does not offer, a page action by its text:
 * the primary action ("Edit") or one of the dropdown's entries ("Delete",
 * "Revisions", "Duplicate"), which are in the markup whether or not the
 * dropdown is open.
 *
 * Example #1: Then the top bar should offer the "Edit" action
 * Example #2: And the top bar should offer the "Delete" action
 * Example #3: Then the top bar should offer the "Revisions" action
 * Example #4: And the top bar should not offer the "Delete" action
 * Example #5: Then the top bar should not offer the "Edit layout" action
 *
 */
Then(/^the top bar should( not)* offer the "([^"]*)" action$/, async function (notCase, actionText) {
  const topBar = this.page.locator(SELECTORS.topBar).first();
  await assertPresence(topBar, undefined, 'the top bar (".top-bar")', { attached: true });
  const action = topBar.locator('a, button').filter({ hasText: new RegExp(`^\\s*${escapeRe(actionText)}\\s*$`) }).first();
  await assertPresence(action, notCase, `a "${actionText}" action in the top bar`, { attached: true });
});

/**
 * Follow a page action of the top bar by its text, opening the "More
 * actions" dropdown first when the action lives there. A link is followed by
 * navigating to its target; a button is clicked.
 *
 * Example #1: When I choose the "Edit" action in the top bar
 * Example #2: And I choose the "Revisions" action in the top bar
 * Example #3: When we choose the "Delete" action in the top bar
 * Example #4: And I choose the "Duplicate" action in the top bar
 * Example #5: When I choose the "Edit layout" action in the top bar
 *
 */
When(/^(I |we )*choose the "([^"]*)" action in the top bar$/, async function (pronounCase, actionText) {
  const topBar = this.page.locator(SELECTORS.topBar).first();
  await assertPresence(topBar, undefined, 'the top bar (".top-bar")', { attached: true });
  const target = await topBar.evaluate((bar, text) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const el = [...bar.querySelectorAll('a, button')].find((e) => norm(e.textContent) === text);
    if (!el) return null;
    return { href: el.tagName === 'A' ? el.getAttribute('href') : null, visible: el.offsetParent !== null };
  }, actionText);
  if (!target) {
    throw friendly({
      message: `No "${actionText}" action was found in the top bar.`,
      hint: 'Use the visible label of a top bar action ("Edit", "Delete", "View"); the top bar only renders on a content item for a user who may act on it.',
    });
  }
  if (target.href) {
    await navigate(this, target.href);
    return;
  }
  if (!target.visible) {
    const dots = this.page.locator(SELECTORS.topBarActions).first();
    if (await dots.count()) await robustClick(dots);
  }
  await robustClick(topBar.locator('button').filter({ hasText: new RegExp(`^\\s*${escapeRe(actionText)}\\s*$`) }).first());
  await waitForPageLoad(this.page, budget(this));
});

module.exports = { SELECTORS };
