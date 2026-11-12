'use strict';

// Steps about how a site is built: which modules are installed, which theme is
// the default, which roles and menus exist and what a role is permitted, what
// the status report counts, what the front page is, and the canonical URL and
// meta tags of a page. None of them needs a command line. The administration pages are read
// with the current session through the browser's request context, so the
// page on screen is left alone; the theme settings step navigates.
//
// Together with the content-type step these are what a site template's smoke
// test needs: "the template installed the Blog post type, the Content editor
// role, the Main navigation links and made /home the front page".

const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const { joinUrl, navigate, supplied } = require('./drupal-helpers');

/**
 * Fetch an administration page with the session's cookies and return its
 * HTML, failing with a hint when the session may not read it.
 *
 * @param {object} world
 * @param {string} path
 * @param {string} what - For the error message ("the Extend page").
 * @returns {Promise<string>}
 */
async function adminHtml(world, path, what) {
  const url = joinUrl(world.launchUrl, path);
  const response = await world.page.request.get(url, { failOnStatusCode: false });
  if (response.status() !== 200) {
    throw friendly({
      message: `Could not read ${what}.`,
      cause: `${url} answered ${response.status()}`,
      hint: 'Log in first as a user who may administer the site.',
    });
  }
  return response.text();
}

/**
 * Plain text of an HTML fragment.
 *
 * @param {string} html
 * @returns {string}
 */
function textOf(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#039;|&quot;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

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
// Modules and themes
// ---------------------------------------------------------------------------

/**
 * Assert a module is, or is not, installed, by its machine name, as the
 * Extend page (`/admin/modules`) reports it: the module's checkbox is ticked.
 * A module absent from the codebase is "not installed" as well.
 *
 * Example #1: Then the "node" module should be installed
 * Example #2: And the "layout_builder" module should be installed
 * Example #3: Then the "book" module should not be installed
 * Example #4: And the "statistics" module should not be enabled
 * Example #5: Then the "media_library" module should be enabled
 *
 */
Then(/^the "([^"]*)" module should( not)* be (?:installed|enabled)$/, async function (machineName, notCase) {
  const html = await adminHtml(this, '/admin/modules', 'the Extend page (/admin/modules)');
  const input = html.match(new RegExp(`<input[^>]*name="modules\\[${escapeRe(machineName)}\\]\\[enable\\]"[^>]*>`));
  const installed = Boolean(input) && /\schecked(?:=|\s|>|\/)/.test(input[0]);
  assert.ok(
    notCase ? !installed : installed,
    friendly({
      message: notCase
        ? `Expected the "${machineName}" module not to be installed.`
        : `Expected the "${machineName}" module to be installed.`,
      cause: input ? `the Extend page lists it as ${installed ? 'installed' : 'not installed'}` : 'the Extend page does not list it at all',
      hint: 'Use the module machine name (the folder name), not its label.',
    }).message
  );
});

/**
 * Assert which theme is the site's default theme, by the name the Appearance
 * page (`/admin/appearance`) shows next to "(default theme)", or next to
 * "(default theme, administration theme)" when one theme serves as both.
 *
 * Example #1: Then the default theme should be "Olivero"
 * Example #2: And the default theme should be "Mercury"
 * Example #3: Then the default theme should not be "Bartik"
 * Example #4: And the default theme should be "Claro"
 * Example #5: Then the default theme should not be "Stark"
 *
 */
Then(/^the default theme should( not)* be "([^"]*)"$/, async function (notCase, themeName) {
  const html = await adminHtml(this, '/admin/appearance', 'the Appearance page (/admin/appearance)');
  // "(default theme)", or "(default theme, administration theme)" when one theme is both.
  const heading = (html.match(/<h3[^>]*>[\s\S]*?<\/h3>/g) || []).map(textOf).find((t) => /\(default theme\b[^)]*\)/i.test(t));
  const current = heading ? heading.replace(/\(default theme\b[^)]*\)/i, '').replace(/\s+\d[\w.-]*$/, '').trim() : '';
  const matches = current.toLowerCase().startsWith(themeName.toLowerCase());
  assert.ok(
    notCase ? !matches : matches,
    friendly({
      message: notCase
        ? `Expected the default theme not to be "${themeName}".`
        : `Expected the default theme to be "${themeName}".`,
      cause: heading ? `the Appearance page shows "${heading}"` : 'the Appearance page shows no default theme',
    }).message
  );
});

/**
 * Open the settings page of the site's default theme, whichever theme that
 * is (read from the Appearance page, so the theme name is never hard-coded),
 * or of a theme named by its machine name.
 *
 * Example #1: Given I am on the default theme settings page
 * Example #2: When I go to the default theme settings page
 * Example #3: Given we are on the default theme settings page
 * Example #4: Given I am on the "olivero" theme settings page
 * Example #5: When I go to the "claro" theme settings page
 *
 */
Given(/^(?:(?:I am |we are )*on|(?:I |we )*go to) the (?:default|"([^"]*)") theme settings page$/, async function (themeName) {
  if (supplied(themeName)) {
    await navigate(this, `/admin/appearance/settings/${themeName}`);
    return;
  }
  const html = await adminHtml(this, '/admin/appearance', 'the Appearance page (/admin/appearance)');
  const block = html.match(/<div[^>]*class="[^"]*\btheme-default\b[^"]*"[\s\S]*?(?=<div[^>]*class="[^"]*\btheme-selector\b|$)/);
  const link = block && block[0].match(/href="([^"]*\/admin\/appearance\/settings\/[a-z0-9_]+)"/);
  if (!link) {
    throw friendly({
      message: 'Could not find the default theme\'s settings link on the Appearance page.',
      hint: 'The Appearance page marks the default theme with the "theme-default" class; log in as a user who may administer themes.',
    });
  }
  await navigate(this, link[1].replace(/^https?:\/\/[^/]+/, ''));
});

// ---------------------------------------------------------------------------
// Roles and menus
// ---------------------------------------------------------------------------

/**
 * Assert a role exists, or does not, by its label, as the Roles page
 * (`/admin/people/roles`) lists it.
 *
 * Example #1: Then the "Content editor" role should exist
 * Example #2: And the "Administrator" role should exist
 * Example #3: Then the "Reviewer" role should not exist
 * Example #4: And the "Site admin" role should not exist
 * Example #5: Then the "Authenticated user" role should exist
 *
 */
Then(/^the "([^"]*)" role should( not)* exist$/, async function (label, notCase) {
  const html = await adminHtml(this, '/admin/people/roles', 'the Roles page (/admin/people/roles)');
  const rows = (html.match(/<tr[\s\S]*?<\/tr>/g) || []).map(textOf);
  const found = rows.some((row) => new RegExp(`(^|\\s)${escapeRe(label)}(\\s|$)`, 'i').test(row));
  assert.ok(
    notCase ? !found : found,
    friendly({
      message: notCase ? `Expected no "${label}" role, but it is listed.` : `Expected a "${label}" role, but none is listed.`,
      cause: `the Roles page lists ${rows.length} row(s)`,
    }).message
  );
});

/**
 * The machine name of a role, from its label ("Content editor") or from the
 * machine name itself ("content_editor"), as the Roles page
 * (`/admin/people/roles`) lists it.
 *
 * @param {object} world
 * @param {string} role
 * @returns {Promise<{id: string, label: string}>}
 */
async function resolveRole(world, role) {
  const html = await adminHtml(world, '/admin/people/roles', 'the Roles page (/admin/people/roles)');
  const roles = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const link = row.match(/href="[^"]*\/admin\/people\/(?:roles\/manage|permissions)\/([a-z0-9_]+)"/);
    if (!link) continue;
    const cell = row.match(/<td[^>]*>([\s\S]*?)<\/td>/);
    roles.push({ id: link[1], label: cell ? textOf(cell[1]).replace(/\s*\(.*\)\s*$/, '') : link[1] });
  }
  const wanted = role.trim().toLowerCase();
  const found = roles.find((r) => r.label.toLowerCase() === wanted) || roles.find((r) => r.id === wanted);
  if (!found) {
    throw friendly({
      message: `No "${role}" role exists on the site.`,
      cause: roles.length ? `the roles are: ${roles.map((r) => `${r.label} (${r.id})`).join(', ')}` : 'the Roles page lists no role',
      hint: 'Pass the role label as /admin/people/roles shows it, or its machine name.',
    });
  }
  return found;
}

/**
 * Assert a role is, or is not, granted a permission, as the role's
 * permissions form (`/admin/people/permissions/<role>`) shows it: the
 * permission's checkbox is ticked. The role is named by its label or its
 * machine name; the permission by its machine name ("create article
 * content") or by its title on the form ("Article: Create new content").
 * No command line is involved, so the check runs against any site the suite
 * can log in to.
 *
 * It reports what the role itself is granted. A permission of the
 * "Authenticated user" role applies to every account that is logged in,
 * without being ticked for the other roles.
 *
 * Example #1: Then the "Content editor" role should have the "access content overview" permission
 * Example #2: And the "content_editor" role should have the "access administration pages" permission
 * Example #3: Then the "Anonymous user" role should not have the "administer nodes" permission
 * Example #4: And the "Authenticated user" role should have the "View published content" permission
 * Example #5: Then the "Content editor" role should not have the "administer users" permission
 *
 */
Then(/^the "([^"]*)" role should( not)* have the "([^"]*)" permission$/, async function (role, notCase, permission) {
  const found = await resolveRole(this, role);
  const html = await adminHtml(this, `/admin/people/permissions/${found.id}`, `the permissions form of the "${found.label}" role`);
  const state = await this.page.evaluate(({ html, rid, permission }) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const boxes = [...doc.querySelectorAll(`input[type="checkbox"][name^="${rid}["]`)];
    const wanted = norm(permission).toLowerCase();
    let box = boxes.find((el) => el.name === `${rid}[${permission}]`);
    if (!box) {
      // By the title the form prints: the row's first cell, or the label of
      // the checkbox ("<Role>: <Title>").
      box = boxes.find((el) => {
        const row = el.closest('tr');
        const title = row ? row.querySelector('.permission .title, td:first-child .title, td:first-child') : null;
        if (title && norm(title.textContent).toLowerCase() === wanted) return true;
        const label = el.id ? doc.querySelector(`label[for="${el.id}"]`) : null;
        return Boolean(label) && norm(label.textContent).toLowerCase().endsWith(`: ${wanted}`);
      });
    }
    return { known: Boolean(box), granted: Boolean(box && box.checked), count: boxes.length };
  }, { html, rid: found.id, permission });
  if (!state.known) {
    throw friendly({
      message: `No "${permission}" permission is listed for the "${found.label}" role.`,
      cause: `the permissions form lists ${state.count} permission(s)`,
      hint: 'Pass the permission machine name ("create article content") or its title as the form prints it ("Article: Create new content"). A permission exists only while the module that defines it is installed.',
    });
  }
  assert.ok(
    notCase ? !state.granted : state.granted,
    friendly({
      message: notCase
        ? `Expected the "${found.label}" role not to have the "${permission}" permission.`
        : `Expected the "${found.label}" role to have the "${permission}" permission.`,
      cause: `the permissions form shows it ${state.granted ? 'granted' : 'not granted'}`,
    }).message
  );
});

// ---------------------------------------------------------------------------
// Status report
// ---------------------------------------------------------------------------

/**
 * Read the status report (`/admin/reports/status`) with the current session:
 * how many errors, warnings and passed checks it counts, and the titles of
 * the entries in each group. Core 11 and core 12 print the same counters
 * (`.system-status-counter--error`, `--warning`, `--checked`) and group the
 * entries under a summary with the id `error`, `warning` or `checked`; when
 * a theme prints neither, the counts are read from the text ("3 Warnings").
 *
 * @param {object} world
 * @returns {Promise<{counts: {error: number, warning: number, checked: number}, entries: {error: string[], warning: string[], checked: string[]}}>}
 */
async function readStatusReport(world) {
  const html = await adminHtml(world, '/admin/reports/status', 'the status report (/admin/reports/status)');
  return world.page.evaluate((html) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const counts = { error: 0, warning: 0, checked: 0 };
    const entries = { error: [], warning: [], checked: [] };
    const text = norm(doc.body ? doc.body.textContent : '');
    const words = { error: /(\d+)\s+Errors?\b/i, warning: /(\d+)\s+Warnings?\b/i, checked: /(\d+)\s+Checked\b/i };
    for (const key of Object.keys(counts)) {
      const group = doc.querySelector(`summary#${key}`);
      const details = group ? group.closest('details') : null;
      if (details) {
        const titles = [...details.querySelectorAll('.system-status-report__status-title, [class*="status-title"]')]
          .filter((el) => !el.matches('summary') && !el.closest('summary'))
          .map((el) => norm(el.textContent))
          .filter(Boolean);
        entries[key] = [...new Set(titles)];
      }
      const counter = doc.querySelector(`.system-status-counter--${key}`);
      const fromCounter = counter ? (norm(counter.textContent).match(/\d+/) || [])[0] : undefined;
      const fromText = (text.match(words[key]) || [])[1];
      if (fromCounter !== undefined) counts[key] = parseInt(fromCounter, 10);
      else if (entries[key].length) counts[key] = entries[key].length;
      else if (fromText !== undefined) counts[key] = parseInt(fromText, 10);
    }
    return { counts, entries };
  }, html);
}

/**
 * Assert the status report (`/admin/reports/status`) counts no errors or no
 * warnings, or that it does. The report is read with the current session,
 * so the page on screen is left alone. A failure names the entries, which is
 * what a person opens the report for.
 *
 * Example #1: Then the status report should have no errors
 * Example #2: And the status report should not have any errors
 * Example #3: Then the status report should have no warnings
 * Example #4: And the status report should have errors
 * Example #5: Then the status report should have warnings
 *
 */
Then(/^the status report should (have no|not have any|not have|have) (errors|warnings)$/, async function (polarity, kind) {
  const key = kind === 'errors' ? 'error' : 'warning';
  const report = await readStatusReport(this);
  const count = report.counts[key];
  const wantNone = polarity !== 'have';
  assert.ok(
    wantNone ? count === 0 : count > 0,
    friendly({
      message: wantNone ? `Expected the status report to have no ${kind}.` : `Expected the status report to have ${kind}.`,
      cause: count
        ? `it counts ${count}: ${report.entries[key].join(', ') || 'the entries could not be read'}`
        : `it counts none (${report.counts.error} error(s), ${report.counts.warning} warning(s), ${report.counts.checked} checked)`,
      hint: 'Open /admin/reports/status as an administrator for the full text of each entry.',
    }).message
  );
});

/**
 * Assert how many errors or warnings the status report counts, for a site
 * whose known, accepted findings are part of its definition (a local build
 * always warns that `settings.php` is writable).
 *
 * Example #1: Then the status report should count 0 errors
 * Example #2: And the status report should count 1 error
 * Example #3: Then the status report should count 3 warnings
 * Example #4: And the status report should count at most 3 warnings
 * Example #5: Then the status report should count at most 0 errors
 *
 */
Then(/^the status report should count (at most )?(\d+) (errors?|warnings?)$/, async function (atMost, expected, kind) {
  const key = kind.startsWith('error') ? 'error' : 'warning';
  const report = await readStatusReport(this);
  const count = report.counts[key];
  const want = parseInt(expected, 10);
  assert.ok(
    supplied(atMost) ? count <= want : count === want,
    friendly({
      message: `Expected the status report to count ${supplied(atMost) ? 'at most ' : ''}${want} ${key}(s).`,
      cause: `it counts ${count}${report.entries[key].length ? `: ${report.entries[key].join(', ')}` : ''}`,
    }).message
  );
});

/**
 * Assert the status report lists, or does not list, an entry among its
 * errors or its warnings, by the entry's title ("Configuration files",
 * "Trusted Host Settings", "Cron maintenance tasks").
 *
 * Example #1: Then the status report should list the warning "Configuration files"
 * Example #2: And the status report should not list the error "Trusted Host Settings"
 * Example #3: Then the status report should list the error "Database updates"
 * Example #4: And the status report should not list the warning "Cron maintenance tasks"
 * Example #5: Then the status report should not list the error "Configuration files"
 *
 */
Then(/^the status report should( not)* list the (error|warning) "([^"]*)"$/, async function (notCase, key, title) {
  const report = await readStatusReport(this);
  const found = report.entries[key].some((entry) => entry.toLowerCase() === title.trim().toLowerCase());
  assert.ok(
    notCase ? !found : found,
    friendly({
      message: notCase
        ? `Expected the status report not to list the ${key} "${title}".`
        : `Expected the status report to list the ${key} "${title}".`,
      cause: report.entries[key].length ? `its ${key}s are: ${report.entries[key].join(', ')}` : `it lists no ${key}`,
    }).message
  );
});

/**
 * Assert a menu contains, or does not contain, a link with a given title, by
 * the menu's label ("Main navigation") or machine name ("main"), as the
 * menu's edit page lists its links (disabled links included).
 *
 * Example #1: Then the "Main navigation" menu should contain "Home"
 * Example #2: And the "main" menu should contain "Home"
 * Example #3: Then the "Footer" menu should not contain "Contact"
 * Example #4: And the "Main navigation" menu should not contain "Log in"
 * Example #5: Then the "User account menu" menu should contain "My account"
 *
 */
Then(/^the "([^"]*)" menu should( not)* (?:contain|list) "([^"]*)"$/, async function (menu, notCase, linkTitle) {
  const listing = await adminHtml(this, '/admin/structure/menu', 'the Menus page (/admin/structure/menu)');
  let machineName = null;
  for (const row of listing.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    if (new RegExp(`(^|\\s)${escapeRe(menu)}(\\s|$)`, 'i').test(textOf(row))) {
      const edit = row.match(/href="[^"]*\/admin\/structure\/menu\/manage\/([a-z0-9_-]+)"/);
      if (edit) { machineName = edit[1]; break; }
    }
  }
  if (!machineName && /^[a-z0-9_-]+$/.test(menu)) machineName = menu;
  if (!machineName) {
    throw friendly({
      message: `No "${menu}" menu is listed on /admin/structure/menu.`,
      hint: 'Pass the menu label as the Menus page shows it, or its machine name.',
    });
  }
  const html = await adminHtml(this, `/admin/structure/menu/manage/${machineName}`, `the "${menu}" menu's edit page`);
  const titles = (html.match(/<a[^>]*class="[^"]*\bmenu-item__link\b[^"]*"[^>]*>[\s\S]*?<\/a>|<td[^>]*class="[^"]*menu-item-title[^"]*"[\s\S]*?<\/td>/g) || []).map(textOf);
  const found = titles.some((t) => t === linkTitle) || (html.match(/<tr[\s\S]*?<\/tr>/g) || []).some((row) => new RegExp(`(^|\\s)${escapeRe(linkTitle)}(\\s|$)`).test(textOf(row)));
  assert.ok(
    notCase ? !found : found,
    friendly({
      message: notCase
        ? `Expected the "${menu}" menu not to contain a "${linkTitle}" link.`
        : `Expected the "${menu}" menu to contain a "${linkTitle}" link.`,
      cause: titles.length ? `its links are: ${titles.join(', ')}` : 'the menu lists no links',
    }).message
  );
});

// ---------------------------------------------------------------------------
// Front page, canonical URL and meta tags
// ---------------------------------------------------------------------------

/**
 * Assert the path configured as the site's front page, as the Basic site
 * settings form (`/admin/config/system/site-information`) holds it.
 *
 * Example #1: Then the front page path should be "/node"
 * Example #2: And the front page path should be "/home"
 * Example #3: Then the front page path should not be "/user/login"
 * Example #4: And the front page path should be "/welcome"
 * Example #5: Then the front page path should not be "/node"
 *
 */
Then(/^the front page path should( not)* be "([^"]*)"$/, async function (notCase, expected) {
  const html = await adminHtml(this, '/admin/config/system/site-information', 'the Basic site settings form');
  const input = html.match(/<input[^>]*name="site_frontpage"[^>]*>/);
  const value = input && (input[0].match(/value="([^"]*)"/) || [])[1];
  const current = supplied(value) ? value : null;
  const matches = current === expected;
  assert.ok(
    notCase ? !matches : matches,
    friendly({
      message: notCase ? `Expected the front page path not to be "${expected}".` : `Expected the front page path to be "${expected}".`,
      cause: current === null ? 'the form has no front page field' : `it is "${current}"`,
    }).message
  );
});

/**
 * Assert the page's canonical URL (`link[rel="canonical"]`), by its path,
 * either exactly or by what it ends with. A path alias, a redirect and the
 * node id all leave their trace here.
 *
 * Example #1: Then the page should have the canonical URL "/sample-article"
 * Example #2: And the page should not have the canonical URL "/node/1"
 * Example #3: Then the canonical URL should end with "/sample-article"
 * Example #4: And the canonical URL should not end with "/node/1"
 * Example #5: Then the page should have the canonical URL "/"
 *
 */
Then(/^(?:(?:the )?page should( not)* have the canonical URL "([^"]*)"|(?:the )?canonical URL should( not)* end with "([^"]*)")$/, async function (notA, exact, notB, suffix) {
  const href = await this.page.locator('link[rel="canonical"]').first().getAttribute('href').catch(() => null);
  if (!supplied(href)) {
    throw friendly({
      message: 'The page has no canonical link.',
      hint: 'Core adds <link rel="canonical"> to content pages; the front page and administration pages may carry none.',
    });
  }
  let path = href;
  try { path = new URL(href, this.launchUrl).pathname; } catch (e) { /* keep as is */ }
  const notCase = supplied(exact) ? notA : notB;
  const matches = supplied(exact) ? path === exact : path.endsWith(suffix);
  assert.ok(
    notCase ? !matches : matches,
    friendly({
      message: notCase
        ? `Expected the canonical URL not to ${supplied(exact) ? 'be' : 'end with'} "${supplied(exact) ? exact : suffix}".`
        : `Expected the canonical URL to ${supplied(exact) ? 'be' : 'end with'} "${supplied(exact) ? exact : suffix}".`,
      cause: `it is "${href}"`,
    }).message
  );
});

/**
 * Assert the content of a meta tag, by its `name` or `property`
 * ("description", "og:title", "robots"), exactly or as a substring.
 *
 * Example #1: Then the "description" meta tag should contain "Sample"
 * Example #2: And the "og:title" meta tag should be "Sample article"
 * Example #3: Then the "robots" meta tag should not contain "noindex"
 * Example #4: And the "Generator" meta tag should contain "Drupal"
 * Example #5: Then the "og:type" meta tag should not be "website"
 *
 */
Then(/^the "([^"]*)" meta tag should( not)* (be|contain) "([^"]*)"$/, async function (name, notCase, mode, expected) {
  const content = await this.page.evaluate((n) => {
    const el = document.querySelector(`meta[name="${n}"], meta[property="${n}"]`);
    return el ? el.getAttribute('content') : null;
  }, name);
  if (!supplied(content)) {
    throw friendly({
      message: `The page has no "${name}" meta tag.`,
      hint: 'Pass the tag\'s name or property attribute as it appears in the markup.',
    });
  }
  const matches = mode === 'be' ? content.trim() === expected : content.includes(expected);
  assert.ok(
    notCase ? !matches : matches,
    friendly({
      message: notCase
        ? `Expected the "${name}" meta tag not to ${mode} "${expected}".`
        : `Expected the "${name}" meta tag to ${mode} "${expected}".`,
      cause: `it reads "${content}"`,
    }).message
  );
});

module.exports = { adminHtml, textOf, resolveRole, readStatusReport };
