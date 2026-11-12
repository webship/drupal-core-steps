#!/usr/bin/env bash
#
# Builds the Drupal site this repository's suite runs against, with DDEV:
# a Standard profile installation, the accounts the users registry in
# cucumber.js names, and the fixtures the features rely on. CI runs this
# script for each Drupal version; run it locally the same way.
#
#   tests/seed/build-site.sh 11     Drupal 11 (the default)
#   tests/seed/build-site.sh 12     Drupal 12
#
# Environment:
#   DRUPAL_SITE_DIR    where the site is built (default: drupal/ in this repository)
#   DRUPAL_SITE_NAME   the DDEV project name (default: drupal-core-steps-site)
#   DRUPAL_*_USER and DRUPAL_*_PASS   the accounts, as in cucumber.js
#
# The folder must hold nothing but its .ddev directory: the code base is
# created from scratch.

set -euo pipefail

MAJOR="${1:-11}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE_DIR="${DRUPAL_SITE_DIR:-$ROOT/drupal}"
SITE_NAME="${DRUPAL_SITE_NAME:-drupal-core-steps-site}"

case "$MAJOR" in
  11)
    PHP_VERSION="8.4"
    PROJECT_TYPE="drupal11"
    TEMPLATE="drupal/recommended-project:^11"
    STABILITY="stable"
    DRUSH="drush/drush"
    ;;
  12)
    # Drupal 12 needs PHP 8.5, which DDEV supports from version 1.25.
    PHP_VERSION="8.5"
    PROJECT_TYPE="drupal12"
    TEMPLATE="drupal/recommended-project:^12"
    STABILITY="${DRUPAL_12_STABILITY:-beta}"
    # No stable Drush release supports Drupal 12 yet.
    DRUSH="${DRUPAL_12_DRUSH:-drush/drush:14.x-dev}"
    ;;
  *)
    echo "Usage: $0 [11|12]" >&2
    exit 2
    ;;
esac

ADMIN_USER="${DRUPAL_ADMIN_USER:-admin}"
ADMIN_PASS="${DRUPAL_ADMIN_PASS:-admin}"
EDITOR_USER="${DRUPAL_EDITOR_USER:-editor}"
EDITOR_PASS="${DRUPAL_EDITOR_PASS:-editor}"
AUTHENTICATED_USER="${DRUPAL_AUTHENTICATED_USER:-authenticated}"
AUTHENTICATED_PASS="${DRUPAL_AUTHENTICATED_PASS:-authenticated}"
REVIEWER_USER="${DRUPAL_REVIEWER_USER:-reviewer_with_a_long_name}"
REVIEWER_PASS="${DRUPAL_REVIEWER_PASS:-reviewer}"

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"

echo "== Drupal $MAJOR in $SITE_DIR (DDEV project $SITE_NAME, PHP $PHP_VERSION)"
ddev config --project-type="$PROJECT_TYPE" --docroot=web --project-name="$SITE_NAME" --php-version="$PHP_VERSION"
ddev start -y
if [ ! -f composer.json ]; then
  ddev composer create-project "$TEMPLATE" --stability="$STABILITY" --no-interaction
fi
if [ "$MAJOR" = "12" ]; then
  # Drush 14 and its dependencies are development versions for now.
  ddev composer config minimum-stability dev
  ddev composer config prefer-stable true
fi
ddev composer require "$DRUSH" --no-interaction
ddev drush site:install standard \
  --site-name="Drupal Core Steps" \
  --account-name="$ADMIN_USER" --account-pass="$ADMIN_PASS" \
  --yes

echo "== Accounts (configuration: the features only log in)"
ddev drush user:create "$EDITOR_USER" --mail="editor@example.com" --password="$EDITOR_PASS"
ddev drush user:role:add content_editor "$EDITOR_USER"
ddev drush user:create "$AUTHENTICATED_USER" --mail="authenticated@example.com" --password="$AUTHENTICATED_PASS"
ddev drush user:create "$REVIEWER_USER" --mail="reviewer@example.com" --password="$REVIEWER_PASS"
ddev drush user:role:add content_editor "$REVIEWER_USER"

echo "== Content types, media type, Contact and Search"
mkdir -p seed
cp "$ROOT"/tests/seed/*.php seed/
if [ "$MAJOR" = "11" ]; then
  ddev drush recipe core/recipes/article_content_type
  ddev drush recipe core/recipes/page_content_type
  ddev drush recipe core/recipes/image_media_type
  # The node search page lives in the search_node module.
  ddev drush pm:install layout_builder contact search search_node --yes
else
  # Drupal 12 moved Contact and Search out of core and ships no recipe for
  # the Article and Basic page content types or the Image media type.
  ddev composer require drupal/contact drupal/search --no-interaction
  ddev drush pm:install layout_builder media media_library contact search --yes
  ddev drush pm:install search_node --yes || true
  ddev drush php:script seed/drupal-12-site.php
fi
ddev drush role:perm:add anonymous 'search content'
ddev drush role:perm:add authenticated 'search content'

echo "== Fixtures"
ddev drush php:script seed/standard-fixtures.php
ddev drush cache:rebuild
# Index the content for the search feature.
ddev drush cron
ddev drush status --fields=drupal-version,php-version,db-driver
