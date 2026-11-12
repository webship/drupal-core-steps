'use strict';

// Steps for core's Layout Builder: opening the layout of a content item,
// adding a section with one of core's layouts, saving the section and the
// layout, counting sections, discarding unsaved changes and reverting an
// override. They work on the
// builder page (`/node/<nid>/layout`) and its off-canvas dialog, which is
// where core puts the section forms.

const { When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const { waitForPageLoad, friendly } = require('webship-js/tests/step-definitions/webship');
const {
  WAIT_TIMEOUT,
  VISIBLE_SUBMIT,
  budget,
  navigate,
  waitForState,
  submitInPage,
  robustClick,
  currentNodeId,
} = require('./drupal-helpers');

const OFF_CANVAS = '#drupal-off-canvas';

/**
 * Open the Layout Builder page of the content item on screen
 * (`/node/<nid>/layout`), for a content type whose display allows
 * per-item overrides.
 *
 * Example #1: When I open the layout of the content item I am viewing
 * Example #2: And I open the layout of the content item I am viewing
 * Example #3: When we open the layout of the content item we are viewing
 * Example #4: And I open the layout of the node I am viewing
 * Example #5: When I edit the layout of the content item I am viewing
 *
 */
When(/^(I |we )*(?:open|edit) the layout of the (?:content item|node) (?:I am|we are) viewing$/, async function (pronounCase) {
  const nid = await currentNodeId(this.page);
  if (!nid) {
    throw friendly({
      message: 'Could not determine which content item is being viewed.',
      hint: 'Open a content item\'s page first.',
    });
  }
  await navigate(this, `/node/${nid}/layout`);
  await waitForState(this.page.locator('#layout-builder').first(), 'visible', `Expected the Layout Builder on /node/${nid}/layout (is the layout overridable for this content type?)`);
});

/**
 * Add a section with one of the layouts the site offers ("One column",
 * "Two column", "Three column", "Four column" come with core) at the end of
 * the layout on screen: the last "Add section" link, then the layout in the
 * off-canvas dialog. Core opens the section's configuration form next;
 * "I save the section" confirms it.
 *
 * Example #1: When I add a "Two column" section at the end of the layout
 * Example #2: And I add a "One column" section at the end of the layout
 * Example #3: When we add a "Three column" section at the end of the layout
 * Example #4: And I add a "Four column" section at the end of the layout
 * Example #5: When I add a "Two column" section to the end of the layout
 *
 */
When(/^(I |we )*add an? "([^"]*)" section (?:at|to) the end of the layout$/, async function (pronounCase, layoutLabel) {
  const builder = this.page.locator('#layout-builder').first();
  await waitForState(builder, 'visible', 'Expected the Layout Builder on the page');
  const addLinks = this.page.locator('#layout-builder .layout-builder__link--add');
  const count = await addLinks.count();
  if (!count) {
    throw friendly('The Layout Builder shows no "Add section" link.');
  }
  await robustClick(addLinks.nth(count - 1));
  // Each choice is a link holding an SVG icon (whose <title>s repeat the
  // region names) and a <div> with the layout label; match the <div>.
  const escaped = layoutLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const choice = this.page.locator(`${OFF_CANVAS} .layout-selection a, ${OFF_CANVAS} a`)
    .filter({ has: this.page.locator('div').filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i') }) })
    .first();
  try {
    await choice.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  } catch (error) {
    const offered = await this.page.locator(`${OFF_CANVAS} a > div`).allTextContents().catch(() => []);
    throw friendly({
      message: `The "${layoutLabel}" layout is not offered for a new section.`,
      cause: offered.length ? `the choices are: ${offered.map((s) => s.trim()).filter(Boolean).join(', ')}` : 'the off-canvas dialog did not open',
      hint: 'Use the layout label as Layout Builder lists it (core ships One, Two, Three and Four column).',
    });
  }
  await robustClick(choice);
  await waitForPageLoad(this.page, budget(this));
});

/**
 * Confirm the section form open in the off-canvas dialog ("Add section" for
 * a new section, "Update" for an existing one), and wait for the dialog to
 * close.
 *
 * Example #1: When I save the section
 * Example #2: And I save the section
 * Example #3: When we save the section
 * Example #4: And we save the section
 * Example #5: When I confirm the section
 *
 */
When(/^(I |we )*(?:save|confirm) the section$/, async function (pronounCase) {
  const button = this.page.locator(`${OFF_CANVAS} input[type="submit"][value="Add section"], ${OFF_CANVAS} input[type="submit"][value="Update"], ${OFF_CANVAS} button:has-text("Add section"), ${OFF_CANVAS} input[type="submit"]`).first();
  await waitForState(button, 'visible', 'Expected the section form in the off-canvas dialog');
  await robustClick(button);
  await this.page.locator(OFF_CANVAS).first().waitFor({ state: 'hidden', timeout: WAIT_TIMEOUT }).catch(() => {});
  await waitForPageLoad(this.page, budget(this));
});

/**
 * Save the layout on screen with Layout Builder's own "Save layout" button,
 * which writes the override (or the default layout) and returns to the
 * content item.
 *
 * Example #1: When I save the layout
 * Example #2: And I save the layout
 * Example #3: When we save the layout
 * Example #4: And we save the layout
 * Example #5: Then I save the layout
 *
 */
When(/^(I |we )*save the layout$/, async function (pronounCase) {
  await waitForState(this.page.locator('#layout-builder').first(), 'attached', 'Expected the Layout Builder on the page');
  const found = await submitInPage(this, 'form[id*="layout-builder-form"] #edit-submit, form[id*="layout-builder-form"] input[value="Save layout"], #edit-submit', 'form[id*="layout-builder-form"]');
  if (!found) {
    throw friendly('The Layout Builder form has no "Save layout" button.');
  }
});

/**
 * Assert how many sections the layout on screen has, in the builder.
 *
 * Example #1: Then the layout should have 1 section
 * Example #2: And the layout should have 2 sections
 * Example #3: Then the layout should have 3 sections
 * Example #4: And the layout should not have 0 sections
 * Example #5: Then the layout should have 4 sections
 *
 */
Then(/^the layout should( not)* have (\d+) sections?$/, async function (notCase, expected) {
  const sections = this.page.locator('#layout-builder .layout-builder__section');
  const want = parseInt(expected, 10);
  try {
    await this.page.waitForFunction(({ want, negated }) => {
      const n = document.querySelectorAll('#layout-builder .layout-builder__section').length;
      return negated ? n !== want : n === want;
    }, { want, negated: Boolean(notCase) }, { timeout: budget(this) + 5000 });
  } catch (error) {
    const n = await sections.count();
    throw friendly({
      message: notCase ? `Expected the layout not to have ${want} section(s).` : `Expected the layout to have ${want} section(s).`,
      cause: `it has ${n}`,
    });
  }
});

/**
 * Discard the unsaved changes of the layout of the content item on screen,
 * through core's own form (`/node/<nid>/layout/discard-changes`). Layout
 * Builder keeps unsaved changes for the user until they are saved or
 * discarded, so a scenario that stopped half way leaves some behind; a
 * scenario that starts with this step always starts from the saved layout.
 *
 * Example #1: When I discard the layout changes
 * Example #2: And I discard the layout changes
 * Example #3: When we discard the layout changes
 * Example #4: Given I discard the unsaved layout changes
 * Example #5: And we discard the unsaved layout changes
 *
 */
When(/^(I |we )*discard the (?:unsaved )?layout changes$/, async function (pronounCase) {
  const nid = await currentNodeId(this.page);
  if (!nid) {
    throw friendly({
      message: 'Could not determine which content item is being viewed.',
      hint: 'Open the content item (or its layout) first.',
    });
  }
  await navigate(this, `/node/${nid}/layout/discard-changes`);
  const confirm = this.page.locator('form.confirmation #edit-submit, ' + VISIBLE_SUBMIT).first();
  await waitForState(confirm, 'visible', `Expected the discard confirmation form on /node/${nid}/layout/discard-changes (is the layout overridable for this content type?)`);
  await submitInPage(this, 'form.confirmation [data-drupal-selector="edit-submit"], form.confirmation #edit-submit, #edit-submit', 'form.confirmation');
});

/**
 * Revert the layout override of the content item on screen to the content
 * type's default layout, through core's revert form
 * (`/node/<nid>/layout/revert`), leaving the item as it was before the
 * scenario overrode it.
 *
 * Example #1: When I revert the layout to the default
 * Example #2: And I revert the layout to the default
 * Example #3: When we revert the layout to the defaults
 * Example #4: And I revert the layout override
 * Example #5: Then I revert the layout to the default
 *
 */
When(/^(I |we )*revert the layout (?:to the defaults?|override)$/, async function (pronounCase) {
  const nid = await currentNodeId(this.page);
  if (!nid) {
    throw friendly({
      message: 'Could not determine which content item is being viewed.',
      hint: 'Open the content item (or its layout) first.',
    });
  }
  await navigate(this, `/node/${nid}/layout/revert`);
  const confirm = this.page.locator('form.confirmation #edit-submit, ' + VISIBLE_SUBMIT).first();
  await waitForState(confirm, 'visible', `Expected the revert confirmation form on /node/${nid}/layout/revert`);
  await submitInPage(this, 'form.confirmation #edit-submit, #edit-submit', 'form.confirmation');
});
