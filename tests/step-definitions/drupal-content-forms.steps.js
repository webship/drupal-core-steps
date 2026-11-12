'use strict';

// Steps for core's node form and content moderation that apply to any site:
// the content types a site has, saving the node form through the Save button
// a person sees (an administration theme may clone it into a sticky bar), the
// browser refusing a form with an empty required field, and the moderation state of
// a content item under core's Content Moderation module.

const { When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  joinUrl,
  waitForState,
  submitInPage,
  failIfSubmitBlocked,
  currentNodeId,
} = require('./drupal-helpers');

const SELECTORS = {
  // An administration theme may clone the node form's primary Save into a
  // sticky action bar; that clone is the control a person can click, the
  // original sits underneath. The sticky clone's ids come first, then core's.
  saveButton: '#gin-sticky-edit-submit, [data-drupal-selector="gin-sticky-edit-submit"], form.node-form #edit-submit, #edit-submit',
  // Core content moderation's control form on a moderated entity's page.
  moderationControl: 'form.content-moderation-entity-moderation-form, .entity-moderation-form',
};

/**
 * Assert a content type exists, or does not, by its label, as listed on the
 * content types administration page (`/admin/structure/types`), which is
 * fetched with the current session so the page on screen is left alone.
 *
 * Example #1: Then the "Article" content type should exist
 * Example #2: And the "Basic page" content type should exist
 * Example #3: Then the "Blog post" content type should not exist
 * Example #4: And the "Event" content type should not exist
 * Example #5: Then the "Utility page" content type should not exist
 *
 */
Then(/^the "([^"]*)" content type should( not)* exist$/, async function (label, notCase) {
  const url = joinUrl(this.launchUrl, '/admin/structure/types');
  const response = await this.page.request.get(url, { failOnStatusCode: false });
  if (response.status() !== 200) {
    throw friendly({
      message: 'Could not read the content types administration page.',
      cause: `${url} answered ${response.status()}`,
      hint: 'Log in first as a user who may administer content types.',
    });
  }
  const html = await response.text();
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) || [];
  const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&#039;|&quot;/g, '\'').replace(/\s+/g, ' ');
  const found = rows.some((row) => new RegExp(`(^|\\s)${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(text(row)));
  assert.ok(
    notCase ? !found : found,
    friendly({
      message: notCase
        ? `Expected no "${label}" content type, but it is listed.`
        : `Expected a "${label}" content type, but none is listed.`,
      cause: `the listing has ${rows.length} row(s)`,
    }).message
  );
});

/**
 * Save the node form through the Save button a person sees. An administration
 * theme may clone the form's Save into a sticky action bar on top of the
 * original, so the sticky clone is submitted when present, the plain
 * `#edit-submit` otherwise, both through an in-page click that waits for the
 * navigation. The saved node becomes "the content item I created" for the
 * steps that view, edit or delete it.
 *
 * When the browser refuses the submit because a required field is empty, the
 * step fails at once with the browser's own message for each such field; it
 * does not wait for a page that cannot come. A scenario that expects the
 * refusal uses "I try to save the content".
 *
 * Example #1: When I save the content
 * Example #2: And I save the content item
 * Example #3: When we save the content
 * Example #4: And I save the node
 * Example #5: When we save the node
 *
 */
When(/^(I |we )*save the (?:content|content item|node)$/, async function (pronounCase) {
  const found = await submitInPage(this, SELECTORS.saveButton, 'form.node-form');
  if (!found) {
    throw friendly({
      message: 'No Save button was found on the node form.',
      hint: 'Open a content add or edit form first; the step submits the sticky "Save" clone or the form\'s own "#edit-submit".',
    });
  }
  failIfSubmitBlocked(this, 'the node form');
  // A saved node is "the content item I created" for the steps that come back
  // to it, the same as after "I create a ... content item titled ...".
  const nid = await currentNodeId(this.page);
  if (nid) this._drupalCreated = { nid, url: this.page.url() };
});

/**
 * Press the node form's Save button in a scenario that expects the form not
 * to go through: an empty required field, a value the browser rejects. The
 * step passes whether or not the form was submitted; follow it with "the
 * "..." field should block submission as required", or with an error message
 * assertion when the server is the one that refuses.
 *
 * Example #1: When I try to save the content
 * Example #2: And I try to save the content item
 * Example #3: When we try to save the content
 * Example #4: And I try to save the node
 * Example #5: When we try to save the node
 *
 */
When(/^(I |we )*try to save the (?:content|content item|node)$/, async function (pronounCase) {
  const found = await submitInPage(this, SELECTORS.saveButton, 'form.node-form');
  if (!found) {
    throw friendly({
      message: 'No Save button was found on the node form.',
      hint: 'Open a content add or edit form first; the step submits the sticky "Save" clone or the form\'s own "#edit-submit".',
    });
  }
});

/**
 * Assert the browser refused to submit a form because a required field is
 * empty, naming the field: HTML5 constraint validation blocks the submit
 * before any request is made, and the form stays on screen. The fields are
 * those of the form a step just tried to submit ("I try to save the
 * content", "I submit the contact form ...", "I submit by id ..."), else
 * those of every form on the page.
 *
 * Example #1: Then the "Title" field should block submission as required
 * Example #2: And the "Title" field should block submission as required
 * Example #3: Then the "Body" field should block submission as required
 * Example #4: And the "Email address" field should block submission as required
 * Example #5: Then the "Summary" field should block submission as required
 *
 */
Then(/^the "([^"]*)" field should block submission as required$/, async function (label) {
  let invalid = this._drupalSubmitBlocked || [];
  if (!invalid.length) {
    invalid = await this.page.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const found = [];
      for (const form of document.forms) {
        if (form.noValidate) continue;
        for (const el of form.elements) {
          if (!el.willValidate || el.checkValidity()) continue;
          const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
          found.push({ label: norm(labelEl ? labelEl.textContent : el.name), name: el.name || '', message: el.validationMessage });
        }
      }
      return found;
    });
  }
  assert.ok(
    invalid.length > 0,
    friendly({
      message: 'Expected the form to be blocked by an empty required field.',
      cause: 'every field of the forms on the page passes the browser\'s validation',
      hint: 'A form with the "novalidate" attribute is validated by the server instead: assert its error message.',
    }).message
  );
  const wanted = label.trim().toLowerCase();
  assert.ok(
    invalid.some((field) => field.label.toLowerCase().includes(wanted) || field.name.toLowerCase() === wanted),
    friendly({
      message: `Expected the "${label}" field to block submission.`,
      cause: `the blocking fields are: ${invalid.map((field) => `"${field.label}" (${field.message})`).join(', ')}`,
    }).message
  );
});

/**
 * Assert the moderation state shown for the content item on screen, through
 * core content moderation's control form (the "Moderation state: Draft"
 * block an editor sees under a moderated item), the state badge of the
 * Navigation top bar, or, on the node form, the "Save as" selection.
 *
 * Example #1: Then the content moderation state should be "Draft"
 * Example #2: And the moderation state should be "Published"
 * Example #3: Then the content moderation state should not be "Published"
 * Example #4: And the moderation state should be "In review"
 * Example #5: Then the moderation state should not be "Archived"
 *
 */
Then(/^the (?:content )?moderation state should( not)* be "([^"]*)"$/, async function (notCase, state) {
  const control = this.page.locator(SELECTORS.moderationControl).first();
  const badge = this.page.locator('.top-bar .toolbar-badge').first();
  const select = this.page.locator('select[name="moderation_state[0][state]"]').first();
  let current = null;
  if (await control.count()) {
    await waitForState(control, 'attached', 'Expected the content moderation control');
    const text = ((await control.textContent()) || '').replace(/\s+/g, ' ').trim();
    const match = text.match(/(?:Moderation state|Current state)\s*:?\s*([A-Za-z][A-Za-z ]*?)(?:\s+(?:Change to|Log message|Apply)|$)/i);
    current = match ? match[1].trim() : text;
  } else if (await badge.count()) {
    // The Navigation top bar shows the state as a badge next to the title;
    // core hides the control form once no transition is available.
    current = ((await badge.textContent()) || '').replace(/\s+/g, ' ').trim();
  } else if (await select.count()) {
    current = await select.evaluate((el) => (el.options[el.selectedIndex] || {}).text || el.value);
  } else {
    throw friendly({
      message: 'No moderation control was found on the page.',
      hint: 'Open a moderated content item (or its form) as a user who may see its moderation state; the Content Moderation module must apply a workflow to its content type.',
    });
  }
  const matches = current.toLowerCase().includes(state.toLowerCase());
  assert.ok(
    notCase ? !matches : matches,
    friendly({
      message: notCase
        ? `Expected the moderation state not to be "${state}".`
        : `Expected the moderation state to be "${state}".`,
      cause: `the control reads "${current}"`,
    }).message
  );
});

/**
 * Move the content item on screen to another moderation state through the
 * content moderation control form: pick the state in "Change to" and apply.
 * The transitions a role may take are the workflow's; an editor that may not
 * publish will not find "Published" in the list.
 *
 * Example #1: When I change the moderation state to "Published"
 * Example #2: And I change the moderation state to "Draft"
 * Example #3: When we change the moderation state to "In review"
 * Example #4: And I change the content moderation state to "Archived"
 * Example #5: When I change the moderation state to "Published"
 *
 */
When(/^(I |we )*change the (?:content )?moderation state to "([^"]*)"$/, async function (pronounCase, state) {
  const control = this.page.locator(SELECTORS.moderationControl).first();
  await waitForState(control, 'visible', 'Expected the content moderation control on the page');
  const select = control.locator('select[name="new_state"], select').first();
  await waitForState(select, 'visible', 'Expected the "Change to" state list in the moderation control');
  const options = await select.evaluate((el) => [...el.options].map((o) => ({ text: o.text.trim(), value: o.value })));
  const option = options.find((o) => o.text.toLowerCase() === state.toLowerCase()) || options.find((o) => o.value === state);
  if (!option) {
    throw friendly({
      message: `The moderation state "${state}" is not offered.`,
      cause: `the choices are: ${options.map((o) => o.text).join(', ')}`,
      hint: 'The workflow decides which transitions this role may take from the current state.',
    });
  }
  await select.selectOption(option.value);
  const found = await submitInPage(this, 'form.content-moderation-entity-moderation-form #edit-submit, .entity-moderation-form #edit-submit, .entity-moderation-form input[type="submit"]', 'form.content-moderation-entity-moderation-form');
  if (!found) {
    throw friendly({
      message: 'The moderation control has no Apply button to submit.',
      hint: 'The control form renders under a moderated content item for a user who may change its state; check the role\'s workflow permissions.',
    });
  }
});

module.exports = { SELECTORS };
