'use strict';

// Steps for the pieces of core's forms and admin UI that a scenario has to
// operate rather than merely see: collapsible details, vertical tabs, the
// AJAX throbber, confirmation forms, CKEditor 5's link balloon and the
// autocomplete suggestions of entity reference fields, plus the content a
// scenario creates and comes back to (view, edit, delete the item it made),
// taxonomy terms and menu links.

const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const { waitForPageLoad, smartSettle, friendly } = require('webship-js/tests/step-definitions/webship');
const {
  WAIT_TIMEOUT,
  VISIBLE_SUBMIT,
  supplied,
  budget,
  navigate,
  waitForState,
  assertPresence,
  submitInPage,
  robustClick,
  resolveFieldId,
  currentNodeId,
} = require('./drupal-helpers');

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
// Details, vertical tabs, AJAX
// ---------------------------------------------------------------------------

/**
 * Open or close a collapsible details element of a form ("Menu settings",
 * "Promotion options", "URL alias", "Revision information"), by the text of
 * its summary or by its id. The node form keeps most of its side settings in
 * such elements, and a field inside a closed one is not visible to a fill.
 *
 * Example #1: When I expand the "Menu settings" details
 * Example #2: And I expand the "URL alias" details
 * Example #3: When we expand the "Promotion options" details
 * Example #4: And I collapse the "Menu settings" details
 * Example #5: When I expand the "edit-path-0" details
 *
 */
When(/^(I |we )*(expand|collapse|open|close) the "([^"]*)" details$/, async function (pronounCase, action, label) {
  const wantOpen = action === 'expand' || action === 'open';
  await this.page.locator('details').first().waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
  const state = await this.page.evaluate(({ label, wantOpen }) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('details')];
    let details = all.find((d) => d.id === label || d.getAttribute('data-drupal-selector') === label);
    if (!details) {
      details = all.find((d) => {
        const summary = d.querySelector('summary');
        return summary && norm(summary.textContent).replace(/\s*\(.*\)\s*$/, '').toLowerCase() === label.toLowerCase();
      });
    }
    if (!details) {
      details = all.find((d) => {
        const summary = d.querySelector('summary');
        return summary && norm(summary.textContent).toLowerCase().includes(label.toLowerCase());
      });
    }
    if (!details) return { found: false, summaries: all.map((d) => norm((d.querySelector('summary') || {}).textContent)).filter(Boolean) };
    const changed = details.open !== wantOpen;
    if (changed) {
      // The summary click is what core's own JS listens to (vertical tabs,
      // details polyfill); the attribute is set as well for good measure.
      const summary = details.querySelector('summary');
      if (summary) summary.click();
      if (details.open !== wantOpen) details.open = wantOpen;
      details.scrollIntoView({ block: 'center' });
    }
    return { found: true, changed };
  }, { label, wantOpen });
  if (!state.found) {
    throw friendly({
      message: `No "${label}" details element was found on the page.`,
      cause: state.summaries.length ? `the page has: ${state.summaries.join(', ')}` : 'the page has no details element',
      hint: 'Pass the summary text as the form shows it, or the element id.',
    });
  }
  await waitForPageLoad(this.page, budget(this));
});

/**
 * Switch to a vertical tab of a form by its title ("Promotion options",
 * "Authoring information", "Menu settings" on the node form of a theme that
 * renders them as tabs), so the fields behind it become visible.
 *
 * Example #1: When I open the "Promotion options" vertical tab
 * Example #2: And I open the "Authoring information" vertical tab
 * Example #3: When we open the "Menu settings" vertical tab
 * Example #4: And I open the "URL alias" vertical tab
 * Example #5: When I open the "Revision information" vertical tab
 *
 */
When(/^(I |we )*open the "([^"]*)" vertical tab$/, async function (pronounCase, title) {
  const tab = this.page.locator('.vertical-tabs__menu-item a, .vertical-tabs__menu-item')
    .filter({ hasText: new RegExp(`^\\s*${escapeRe(title)}`, 'i') })
    .first();
  try {
    await tab.waitFor({ state: 'visible', timeout: budget(this) });
  } catch (error) {
    throw friendly({
      message: `No "${title}" vertical tab was found.`,
      cause: error,
      hint: 'Vertical tabs are details elements the form renders as a tab list; use "I expand the \\"...\\" details" when the theme renders them as plain details.',
    });
  }
  await robustClick(tab);
  await waitForPageLoad(this.page, budget(this));
});

/**
 * Wait until core's AJAX throbber is gone and no AJAX request is in flight,
 * after an action that core handles with AJAX (a media library insert, a
 * Layout Builder change, an exposed filter with AJAX, an "Add another item"
 * button). webship-js settles the page after every step already; this one
 * waits specifically for core's own progress markers.
 *
 * Example #1: When I wait for the AJAX throbber to disappear
 * Example #2: And I wait for the AJAX throbber to disappear
 * Example #3: When we wait for Drupal AJAX to finish
 * Example #4: And I wait for Drupal AJAX to finish
 * Example #5: When I wait for the AJAX throbber to go away
 *
 */
When(/^(I |we )*wait for (?:the AJAX throbber to (?:disappear|go away)|Drupal AJAX to finish)$/, async function (pronounCase) {
  await smartSettle(this.page, budget(this));
  try {
    await this.page.waitForFunction(
      () => !document.querySelector('.ajax-progress, .ajax-progress-throbber, .ajax-progress-fullscreen')
        && (!window.jQuery || !window.jQuery.active),
      null,
      { timeout: WAIT_TIMEOUT }
    );
  } catch (error) {
    throw friendly('Core\'s AJAX throbber never went away.', error);
  }
});

/**
 * Submit the confirmation form on screen (a delete form, a cancel form, a
 * revert form: core's `confirmation` forms with their single primary
 * button), after a step navigated to it.
 *
 * Example #1: When I confirm the deletion
 * Example #2: And I confirm the deletion
 * Example #3: When we confirm the form
 * Example #4: And I confirm the action
 * Example #5: When I submit the confirmation form
 *
 */
When(/^(I |we )*(?:confirm the (?:deletion|form|action)|submit the confirmation form)$/, async function (pronounCase) {
  const form = this.page.locator('form.confirmation, form[id$="-confirm-form"], form[id$="-delete-form"], form[id$="confirm-form"], form[id$="-cancel-form"]').first();
  await waitForState(form, 'attached', 'Expected a confirmation form on the page');
  const found = await submitInPage(this, 'form.confirmation #edit-submit, form[id$="-confirm-form"] #edit-submit, form[id$="-delete-form"] #edit-submit, form[id$="confirm-form"] #edit-submit, form[id$="-cancel-form"] #edit-submit', 'form.confirmation');
  if (!found) {
    throw friendly('The confirmation form has no submit button.');
  }
});

// ---------------------------------------------------------------------------
// CKEditor 5: links and autocomplete
// ---------------------------------------------------------------------------

/**
 * Type a URL into the link balloon CKEditor 5 opens after the "Link" toolbar
 * button, character by character so an autocomplete (core's or Linkit's)
 * fires; follow with "I click on the save button in ..." to apply it, or
 * with "I choose the ... autocomplete suggestion".
 *
 * Example #1: When I fill in the link URL "https://example.com"
 * Example #2: And I fill in the link URL "/node/1"
 * Example #3: When we fill in the link URL "mailto:hello@example.com"
 * Example #4: And I fill in the link URL "Sample"
 * Example #5: When I fill in the link URL "https://www.drupal.org"
 *
 */
When(/^(I |we )*fill in the link URL "([^"]*)"$/, async function (pronounCase, url) {
  const anyField = this.page
    .locator('.ck-balloon-panel .ck-link-form input, .ck-balloon-panel .ck-labeled-field-view input, .ck-balloon-panel input[type="text"]')
    .first();
  try {
    await anyField.waitFor({ state: 'visible', timeout: budget(this) });
  } catch (error) {
    throw friendly({
      message: 'No link balloon is open in the rich text editor.',
      cause: error,
      hint: 'Press the "Link" command button of the editor first (When I click on "Link" command button in the rich text editor field "Body").',
    });
  }
  // Newer editors put a "Displayed text" field before the "Link URL" one;
  // the URL goes into the input whose label says so, else the only input.
  const urlId = await this.page.evaluate(() => {
    const labels = [...document.querySelectorAll('.ck-balloon-panel label')];
    const label = labels.find((l) => /^(link )?url$/i.test((l.textContent || '').trim()));
    return label ? label.getAttribute('for') : null;
  });
  const field = urlId ? this.page.locator(`#${urlId}`).first() : anyField;
  await field.click();
  await field.fill('');
  await field.pressSequentially(url, { delay: 50 });
  await waitForPageLoad(this.page, budget(this));
});

/**
 * Pick an entry of the autocomplete list that core shows under an entity
 * reference field (a "Tags" field, a link field, the CKEditor link balloon
 * with Linkit) by its text, after the field was typed into.
 *
 * Example #1: When I choose the "Sample article" autocomplete suggestion
 * Example #2: And I choose the "Drupal" autocomplete suggestion
 * Example #3: When we choose the "editor" autocomplete suggestion
 * Example #4: And I pick the "Sample image" autocomplete suggestion
 * Example #5: When I choose the "About us" autocomplete suggestion
 *
 */
When(/^(I |we )*(?:choose|pick) the "([^"]*)" autocomplete suggestion$/, async function (pronounCase, text) {
  const item = this.page.locator('ul.ui-autocomplete li, .ui-autocomplete .ui-menu-item, [role="listbox"] [role="option"]')
    .filter({ hasText: new RegExp(escapeRe(text), 'i') })
    .first();
  try {
    await item.waitFor({ state: 'visible', timeout: budget(this) + 5000 });
  } catch (error) {
    const seen = await this.page.locator('ul.ui-autocomplete li').allTextContents().catch(() => []);
    throw friendly({
      message: `No "${text}" autocomplete suggestion is offered.`,
      cause: seen.length ? `the suggestions are: ${seen.map((s) => s.trim()).join(', ')}` : 'no suggestion list is open',
      hint: 'Type into the field first; suggestions appear after the first characters.',
    });
  }
  await robustClick(item);
  await waitForPageLoad(this.page, budget(this));
});

/**
 * Assert what a CKEditor 5 field holds, through the editor's own data (the
 * HTML it would save), so a link, a heading or an inserted media are
 * checked where they live rather than on the rendered page.
 *
 * Example #1: Then the rich text editor field "Body" should contain "Hello"
 * Example #2: And the rich text editor field "Body" should contain "href=\"https://example.com\""
 * Example #3: Then the rich text editor field "Body" should not contain "<h1>"
 * Example #4: And the rich text editor field "edit-body-0-value" should contain "<p>"
 * Example #5: Then the rich text editor field "Content" should not contain "Draft"
 *
 */
Then(/^the rich text editor field "([^"]*)" should( not)* contain "(.*)"$/, async function (field, notCase, expected) {
  const text = expected.replace(/\\"/g, '"');
  const fieldId = await resolveFieldId(this.page, field);
  if (!fieldId) {
    throw friendly(`Could not find a field "${field}" on the page.`);
  }
  let data = null;
  try {
    await this.page.waitForFunction(({ id, text, negated }) => {
      const el = document.getElementById(id);
      const instance = el && window.Drupal && Drupal.CKEditor5Instances && Drupal.CKEditor5Instances.get(el.dataset.ckeditor5Id);
      if (!instance) return false;
      const has = instance.getData().includes(text);
      return negated ? !has : has;
    }, { id: fieldId, text, negated: Boolean(notCase) }, { timeout: budget(this) + 5000 });
  } catch (e) {
    data = await this.page.evaluate((id) => {
      const el = document.getElementById(id);
      const instance = el && window.Drupal && Drupal.CKEditor5Instances && Drupal.CKEditor5Instances.get(el.dataset.ckeditor5Id);
      return instance ? instance.getData() : null;
    }, fieldId);
    throw friendly({
      message: notCase
        ? `Expected the "${field}" rich text editor not to contain "${text}".`
        : `Expected the "${field}" rich text editor to contain "${text}".`,
      cause: data === null ? 'no CKEditor 5 instance is attached to the field' : `its data is: ${data.slice(0, 500)}`,
    });
  }
});

/**
 * Assert the toolbar of the rich text editor offers, or does not offer, a
 * command button, by its accessible label ("Bold", "Link", "Insert Media",
 * "Source"), which is how a text format's configured toolbar is checked.
 *
 * Example #1: Then the rich text editor toolbar should have the "Bold" button
 * Example #2: And the rich text editor toolbar should have the "Link" button
 * Example #3: Then the rich text editor toolbar should not have the "Source" button
 * Example #4: And the rich text editor toolbar should have the "Insert Media" button
 * Example #5: Then the rich text editor toolbar should not have the "Code Block" button
 *
 */
Then(/^the rich text editor toolbar should( not)* have the "([^"]*)" button$/, async function (notCase, label) {
  const toolbar = this.page.locator('.ck-toolbar').first();
  await assertPresence(toolbar, undefined, 'the rich text editor toolbar (".ck-toolbar")');
  const button = this.page.locator('.ck-toolbar button')
    .filter({ has: this.page.locator(`span.ck-button__label:text-is("${label}")`) })
    .or(this.page.locator(`.ck-toolbar button[aria-label="${label}"], .ck-toolbar button[data-cke-tooltip-text="${label}"]`))
    .first();
  await assertPresence(button, notCase, `a "${label}" button in the rich text editor toolbar`, { attached: true });
});

// ---------------------------------------------------------------------------
// The content item a scenario created
// ---------------------------------------------------------------------------

/**
 * Remember the content item on screen as "the content item I created" for
 * the steps below, so a scenario can come back to what it made without
 * knowing its id or alias.
 *
 * @param {object} world
 * @returns {Promise<void>}
 */
async function rememberCreated(world) {
  const nid = await currentNodeId(world.page);
  if (nid) {
    world._drupalCreated = { nid, url: world.page.url() };
  }
}

/**
 * Open the content item the scenario created with "I create a ... content
 * item titled ...", by its id, whatever page the scenario is on now.
 *
 * Example #1: When I view the content item I created
 * Example #2: And I view the content item I created
 * Example #3: When we view the content item we created
 * Example #4: And I view the node I created
 * Example #5: When I visit the content item I created
 *
 */
When(/^(I |we )*(?:view|visit) the (?:content item|node) (?:I|we) created$/, async function (pronounCase) {
  const created = this._drupalCreated;
  if (!created) {
    throw friendly({
      message: 'No content item was created in this scenario.',
      hint: 'Create one first with "I create an \\"article\\" content item titled \\"...\\"".',
    });
  }
  await navigate(this, `/node/${created.nid}`);
});

/**
 * Open the edit form of the content item the scenario created.
 *
 * Example #1: When I edit the content item I created
 * Example #2: And I edit the content item I created
 * Example #3: When we edit the content item we created
 * Example #4: And I edit the node I created
 * Example #5: When I open the edit form of the content item I created
 *
 */
When(/^(I |we )*(?:edit|open the edit form of) the (?:content item|node) (?:I|we) created$/, async function (pronounCase) {
  const created = this._drupalCreated;
  if (!created) {
    throw friendly({
      message: 'No content item was created in this scenario.',
      hint: 'Create one first with "I create an \\"article\\" content item titled \\"...\\"".',
    });
  }
  await navigate(this, `/node/${created.nid}/edit`);
  await waitForState(this.page.locator('form.node-form, #edit-title-0-value').first(), 'attached', `Expected the edit form of node ${created.nid}`);
});

/**
 * Delete the content item the scenario created, through its delete form,
 * so a scenario leaves the site as it found it.
 *
 * Example #1: When I delete the content item I created
 * Example #2: And I delete the content item I created
 * Example #3: When we delete the content item we created
 * Example #4: And I delete the node I created
 * Example #5: Then I delete the content item I created
 *
 */
When(/^(I |we )*delete the (?:content item|node) (?:I|we) created$/, async function (pronounCase) {
  const created = this._drupalCreated;
  if (!created) {
    throw friendly({
      message: 'No content item was created in this scenario.',
      hint: 'Create one first with "I create an \\"article\\" content item titled \\"...\\"".',
    });
  }
  await navigate(this, `/node/${created.nid}/delete`);
  const confirm = this.page.locator('form.node-confirm-form #edit-submit, form.confirmation #edit-submit, ' + VISIBLE_SUBMIT).first();
  await waitForState(confirm, 'visible', `Expected the delete confirmation form on /node/${created.nid}/delete`);
  await submitInPage(this, 'form.node-confirm-form #edit-submit, form.confirmation #edit-submit, #edit-submit', 'form.node-confirm-form, form.confirmation');
  this._drupalCreated = null;
});

// ---------------------------------------------------------------------------
// Taxonomy terms and menu links
// ---------------------------------------------------------------------------

/**
 * Create a taxonomy term in a vocabulary, by the vocabulary's machine name
 * ("tags"), through its add form (`/admin/structure/taxonomy/manage/<vocabulary>/add`).
 *
 * Example #1: When I create a "tags" taxonomy term named "Playwright"
 * Example #2: And I create a "tags" taxonomy term named "Cucumber"
 * Example #3: When we create a "topics" taxonomy term named "Testing"
 * Example #4: And I create a "tags" term named "Release"
 * Example #5: When I create a "categories" taxonomy term named "News"
 *
 */
When(/^(I |we )*create an? "([^"]*)" (?:taxonomy )?term named "([^"]*)"$/, async function (pronounCase, vocabulary, name) {
  await navigate(this, `/admin/structure/taxonomy/manage/${vocabulary}/add`);
  const field = this.page.locator('#edit-name-0-value').first();
  await waitForState(field, 'visible', `Expected the term add form of the "${vocabulary}" vocabulary`);
  await field.fill(name);
  await submitInPage(this, 'form.taxonomy-term-form #edit-submit, #edit-submit', 'form.taxonomy-term-form');
  const error = this.page.locator('.messages--error, [aria-label="Error message"]').first();
  if (await error.isVisible({ timeout: 1000 }).catch(() => false)) {
    throw friendly({
      message: `Creating the "${name}" term failed.`,
      cause: ((await error.textContent()) || '').replace(/\s+/g, ' ').trim(),
    });
  }
});

/**
 * Add a link to a menu through the menu's add-link form
 * (`/admin/structure/menu/manage/<menu>/add`), by the menu's machine name
 * ("main", "footer"), with a title and a path or URL.
 *
 * Example #1: When I add a menu link titled "Sample" to "/sample-article" in the "main" menu
 * Example #2: And I add a menu link titled "Home" to "/" in the "main" menu
 * Example #3: When we add a menu link titled "Drupal" to "https://www.drupal.org" in the "footer" menu
 * Example #4: And I add a menu link titled "Log in" to "/user/login" in the "account" menu
 * Example #5: When I add a menu link titled "Node one" to "/node/1" in the "main" menu
 *
 */
When(/^(I |we )*add a menu link titled "([^"]*)" to "([^"]*)" in the "([^"]*)" menu$/, async function (pronounCase, title, target, menu) {
  await navigate(this, `/admin/structure/menu/manage/${menu}/add`);
  const titleField = this.page.locator('#edit-title-0-value').first();
  await waitForState(titleField, 'visible', `Expected the add-link form of the "${menu}" menu`);
  await titleField.fill(title);
  await this.page.locator('#edit-link-0-uri').first().fill(target);
  await submitInPage(this, 'form.menu-link-content-form #edit-submit, form.menu-link-content-menu-link-content-form #edit-submit, #edit-submit', 'form.menu-link-content-form');
  const error = this.page.locator('.messages--error, [aria-label="Error message"]').first();
  if (await error.isVisible({ timeout: 1000 }).catch(() => false)) {
    throw friendly({
      message: `Adding the "${title}" link to the "${menu}" menu failed.`,
      cause: ((await error.textContent()) || '').replace(/\s+/g, ' ').trim(),
    });
  }
});

module.exports = { rememberCreated };
