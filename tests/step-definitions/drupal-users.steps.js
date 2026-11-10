'use strict';

// Steps for the accounts of the users registry (`worldParameters.users` in
// cucumber.js): creating and removing the testing users through core's own
// People administration (`/admin/people/create`, `/user/<uid>/cancel`), so a
// suite can provision what it logs in as on any site it is pointed at.
//
// A registry entry carries `username`, `password`, optionally `email` and the
// role machine names to grant (`roles: ['content_editor']`); the entry marked
// `isAdmin: true` (or the `admin` handle) is the account created by the
// installer and is never created or removed here. The `anonymous` entry is
// not an account.

const { Given } = require('@cucumber/cucumber');
const { waitForPageLoad, friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  joinUrl,
  navigate,
  waitForState,
  resolveUser,
  submitInPage,
  loginWithForm,
  robustClick,
  sessionStatus,
} = require('./drupal-helpers');

/**
 * The registry entries that are real, provisionable accounts: everything with
 * a password except the installer's own account.
 *
 * @param {object} world
 * @returns {Array<{handle: string, username: string, password: string, email: string, roles: string[]}>}
 */
function provisionableUsers(world) {
  const users = (world.parameters && world.parameters.users) || {};
  return Object.keys(users)
    .filter((handle) => handle !== 'anonymous' && handle !== 'admin' && users[handle] && users[handle].password && !users[handle].isAdmin)
    .map((handle) => {
      const user = resolveUser(world, handle);
      return {
        handle,
        username: user.username,
        password: user.password,
        email: user.email || `${user.username.replace(/[^a-z0-9._-]/gi, '_')}@example.com`,
        roles: Array.isArray(user.roles) ? user.roles : [],
      };
    });
}

/**
 * The handle of the administrator account: the entry marked `isAdmin`, else
 * `admin`.
 *
 * @param {object} world
 * @returns {string}
 */
function adminHandle(world) {
  const users = (world.parameters && world.parameters.users) || {};
  const marked = Object.keys(users).find((handle) => users[handle] && users[handle].isAdmin);
  return marked || 'admin';
}

/**
 * Make sure the session may administer users: when the People page is not
 * reachable, log in as the administrator handle.
 *
 * @param {object} world
 * @returns {Promise<void>}
 */
/**
 * Fill both password fields of the Add user form. Drupal 12 keeps the
 * password confirm widget hidden until the visitor interacts with it, and a
 * hidden field cannot be filled through the pointer, so the value is set in
 * the page itself with the input and change events the form listens to.
 *
 * @param {object} world - The cucumber World.
 * @param {string} password
 * @returns {Promise<void>}
 */
async function fillPassword(world, password) {
  const first = world.page.locator('#edit-pass-pass1').first();
  await waitForState(first, 'attached', 'Expected the password fields ("#edit-pass-pass1", "#edit-pass-pass2") on the Add user form');
  if (await first.isVisible().catch(() => false)) {
    await first.fill(password);
    await world.page.locator('#edit-pass-pass2').first().fill(password);
    return;
  }
  await world.page.evaluate((password) => {
    for (const id of ['edit-pass-pass1', 'edit-pass-pass2']) {
      const input = document.getElementById(id);
      if (!input) continue;
      input.value = password;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, password);
}

async function ensureAdminSession(world) {
  const status = await sessionStatus(world.page, joinUrl(world.launchUrl, '/admin/people/create'));
  if (status === 200) return;
  const handle = adminHandle(world);
  const admin = resolveUser(world, handle);
  await loginWithForm(world, admin.username, admin.password);
}

/**
 * The uid of `username` in the HTML of a People listing page, or null.
 *
 * The name column prints the display name through core's username template,
 * which cuts a name longer than 20 characters down to 15 with an ellipsis, so
 * a long name is matched through the "Edit <name>" / "View <name>" label of
 * the row's operations links, and last through the truncated text itself.
 *
 * @param {string} html
 * @param {string} username
 * @returns {string|null}
 */
function uidFromPeopleHtml(html, username) {
  const decode = (text) => text
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const anchors = [];
  for (const found of html.matchAll(/<a\b([^>]*)href="[^"]*\/user\/(\d+)[^"]*"([^>]*)>([\s\S]*?)<\/a>/g)) {
    const label = `${found[1]} ${found[3]}`.match(/aria-label="([^"]*)"/);
    anchors.push({ uid: found[2], text: decode(found[4]), label: label ? decode(label[1]) : '' });
  }
  const exact = anchors.find((anchor) => anchor.text === username);
  if (exact) return exact.uid;
  const labelled = anchors.find((anchor) => anchor.label === `Edit ${username}` || anchor.label === `View ${username}`);
  if (labelled) return labelled.uid;
  if ([...username].length > 20) {
    const truncated = anchors.find((anchor) => anchor.text.endsWith('…') && [...anchor.text].length > 10 && username.startsWith(anchor.text.slice(0, -1)));
    if (truncated) return truncated.uid;
  }
  return null;
}

/**
 * The uid of an existing account, found through the People listing's name
 * filter, or null.
 *
 * @param {object} world
 * @param {string} username
 * @returns {Promise<string|null>}
 */
async function findUid(world, username) {
  const url = joinUrl(world.launchUrl, `/admin/people?user=${encodeURIComponent(username)}`);
  const response = await world.page.request.get(url, { failOnStatusCode: false });
  if (response.status() !== 200) {
    throw friendly({
      message: 'Could not read the People administration page.',
      cause: `${url} answered ${response.status()}`,
      hint: 'The testing users are managed by an account that may administer users; log in as the administrator first.',
    });
  }
  return uidFromPeopleHtml(await response.text(), username);
}

/**
 * Create every provisionable account of the users registry that does not
 * exist yet, through `/admin/people/create`, granting the roles each entry
 * lists. Accounts that already exist are left alone, so the step is safe to
 * run at the start of every suite. Logs in as the administrator handle when
 * the session may not administer users, and stays logged in as it.
 *
 * Example #1: Given I add the testing users
 * Example #2: Given we add the testing users
 * Example #3: Given I add testing users
 * Example #4: And I add the testing users
 * Example #5: Given add the testing users
 *
 */
Given(/^(I |we )*add (?:the )?testing users$/, async function (pronounCase) {
  const users = provisionableUsers(this);
  if (!users.length) {
    throw friendly({
      message: 'The users registry has no account to create.',
      hint: 'Add entries with a username and a password (and roles) to worldParameters.users in cucumber.js; the admin entry is never created.',
    });
  }
  await ensureAdminSession(this);
  const created = [];
  const kept = [];
  for (const user of users) {
    if (await findUid(this, user.username)) {
      kept.push(user.username);
      continue;
    }
    await navigate(this, '/admin/people/create');
    const name = this.page.locator('#edit-name').first();
    await waitForState(name, 'visible', 'Expected the "Add user" form on /admin/people/create');
    await this.page.locator('#edit-mail').first().fill(user.email);
    await name.fill(user.username);
    await fillPassword(this, user.password);
    for (const role of user.roles) {
      const box = this.page.locator(`input[name="roles[${role}]"]`).first();
      if (!(await box.count())) {
        throw friendly({
          message: `The "${role}" role does not exist, so the "${user.handle}" user cannot be created.`,
          hint: 'Use the role machine name as /admin/people/roles lists it, or create the role first.',
        });
      }
      if (!(await box.isChecked())) await robustClick(box);
    }
    // Keep the "Notify user of new account" mail off: a missing mail system
    // must not block the suite.
    const notify = this.page.locator('#edit-notify').first();
    if ((await notify.count()) && (await notify.isChecked())) await robustClick(notify);
    await submitInPage(this, '#user-register-form #edit-submit, form.user-register-form #edit-submit, form.user-form #edit-submit, #edit-submit', '#user-register-form, form.user-register-form, form.user-form');
    // Judge the creation by the form, not by the messages on the page: an
    // unrelated error (the Update module's security notice, for one) sits on
    // every administration page of a site that is behind on updates. The Add
    // user form is gone once the account exists; when it is still shown, the
    // account is looked up before the step fails with the form's own messages.
    const form = this.page.locator('#user-register-form, form.user-register-form').first();
    if ((await form.isVisible().catch(() => false)) && !(await findUid(this, user.username))) {
      const texts = [];
      for (const item of await this.page.locator('.form-item--error-message, .messages--error, [aria-label="Error message"]').all()) {
        const text = ((await item.textContent()) || '').replace(/\s+/g, ' ').trim();
        if (text && !texts.includes(text)) texts.push(text);
      }
      throw friendly({
        message: `Creating the "${user.handle}" user failed.`,
        cause: texts.join(' | ') || 'The Add user form is still shown and the account does not exist.',
        hint: 'Check the email address and the roles of the entry in worldParameters.users; the site reports what it refused.',
      });
    }
    created.push(user.username);
  }
  this.attach(`testing users: created ${created.length ? created.join(', ') : 'none'}; already there: ${kept.length ? kept.join(', ') : 'none'}`);
});

/**
 * Remove every provisionable account of the users registry that exists,
 * through its cancel form (`/user/<uid>/cancel`), deleting the account and
 * its content. The administrator account is never removed. Logs in as the
 * administrator handle when the session may not administer users.
 *
 * Example #1: Given I delete the testing users
 * Example #2: Given we delete the testing users
 * Example #3: Given I delete testing users
 * Example #4: And I delete the testing users
 * Example #5: Given delete the testing users
 *
 */
Given(/^(I |we )*delete (?:the )?testing users$/, async function (pronounCase) {
  const users = provisionableUsers(this);
  await ensureAdminSession(this);
  const removed = [];
  for (const user of users) {
    const uid = await findUid(this, user.username);
    if (!uid) continue;
    await navigate(this, `/user/${uid}/cancel`);
    const method = this.page.locator('input[name="user_cancel_method"][value="user_cancel_delete"]').first();
    await waitForState(method, 'attached', `Expected the cancel form of user ${uid}`);
    await robustClick(method);
    await submitInPage(this, '#user-cancel-form #edit-submit, form.user-cancel-form #edit-submit, #edit-submit', '#user-cancel-form, form.user-cancel-form');
    // Cancelling runs a batch; wait until it has handed back a normal page.
    try {
      await this.page.waitForFunction(() => !/\/batch(\?|$)/.test(window.location.pathname + window.location.search), null, { timeout: 60000 });
    } catch (error) {
      throw friendly(`The batch that removes user ${uid} did not finish.`, error);
    }
    await waitForPageLoad(this.page, budget(this));
    removed.push(user.username);
  }
  this.attach(`testing users: removed ${removed.length ? removed.join(', ') : 'none'}`);
});

module.exports = { provisionableUsers, adminHandle, uidFromPeopleHtml };
