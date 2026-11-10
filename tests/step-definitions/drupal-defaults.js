'use strict';

// The defaults this pack ships for every scenario. Not a step file: it
// registers two hooks and no step definitions.
//
//   1. The named selectors for the markup Drupal core renders
//      (`tests/selectors/drupal-core.json`: "status message", "page title",
//      "breadcrumb", "navigation sidebar", "save button", "details",
//      "ajax throbber", "media library dialog", ...). They are merged into
//      webship-js's selector registry after it has loaded the project's own
//      `worldParameters.selectors` and files, and never override a name the
//      project defined, so `Then I see visible status message` works on any
//      Drupal site with nothing configured, and a project keeps the last word.
//
//   2. The assets folder of "I attach the file" steps. webship-js resolves a
//      relative file name against its own package folder; a test project keeps
//      its fixtures in `tests/assets/`, so that is where a relative name looks
//      first when the folder exists.

const fs = require('fs');
const path = require('path');
const { Before } = require('@cucumber/cucumber');

const DRUPAL_SELECTORS_FILE = path.join(__dirname, '..', 'selectors', 'drupal-core.json');

/**
 * Read a selector preset file: `{ css: {name: selector}, xpath: {...} }`.
 *
 * @param {string} file
 * @returns {{css: Object<string,string>, xpath: Object<string,string>}}
 */
function readPreset(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { css: (parsed && parsed.css) || {}, xpath: (parsed && parsed.xpath) || {} };
}

/**
 * Merge a preset into the World's selector registries without overriding
 * what is already there. Packs built on this one call it from their own
 * hook with their own preset file.
 *
 * @param {object} world - The cucumber World.
 * @param {string} file - A preset JSON file.
 * @returns {number} How many names were added.
 */
function mergeSelectorPreset(world, file) {
  const preset = readPreset(file);
  world.__selectorsCss = world.__selectorsCss || {};
  world.__selectorsXpath = world.__selectorsXpath || {};
  let added = 0;
  for (const [name, selector] of Object.entries(preset.css)) {
    if (!(name in world.__selectorsCss) && !(name in world.__selectorsXpath)) {
      world.__selectorsCss[name] = selector;
      added += 1;
    }
  }
  for (const [name, selector] of Object.entries(preset.xpath)) {
    if (!(name in world.__selectorsCss) && !(name in world.__selectorsXpath)) {
      world.__selectorsXpath[name] = selector;
      added += 1;
    }
  }
  return added;
}

// webship-js fills the registries in a hook with the default order (10000);
// this one runs right after it so the project's names are already in place.
Before({ order: 10100 }, function () {
  mergeSelectorPreset(this, DRUPAL_SELECTORS_FILE);
});

// The World sets `assetsFolder` to webship-js's own `tests/assets/`; a project
// that keeps fixtures under its own `tests/assets/` gets that folder instead.
Before({ order: 1 }, function () {
  const projectAssets = path.resolve(process.cwd(), 'tests', 'assets');
  const current = this.assetsFolder ? path.resolve(this.assetsFolder) : '';
  const isPackageDefault = !current || current.includes(`${path.sep}node_modules${path.sep}webship-js${path.sep}`);
  if (isPackageDefault && fs.existsSync(projectAssets)) {
    this.assetsFolder = projectAssets + path.sep;
  }
});

module.exports = { DRUPAL_SELECTORS_FILE, readPreset, mergeSelectorPreset };
