<?php

/**
 * @file
 * Seeds the fixtures this repo's self-test suite needs on a Standard install.
 *
 * Run from the DDEV project after the core recipes and the editor account:
 *   cd drupal
 *   ddev drush recipe core/recipes/article_content_type
 *   ddev drush recipe core/recipes/image_media_type
 *   ddev drush user:create editor --mail=editor@example.com --password=editor
 *   ddev drush user:role:add content_editor editor
 *   ddev drush php:script seed/standard-fixtures.php
 *
 * Idempotent: every fixture is created only when it does not exist yet.
 *
 * What it adds:
 *   - a "Media" entity reference field on Article, using the Media Library
 *     widget, so the media library steps have a field to open;
 *   - one Image media item ("Sample image") so the library has something to
 *     select, with alt and title text for the image assertions;
 *   - one published Article ("Sample article" at /sample-article) so the
 *     content overview has a row with operations, and the article page shows
 *     the media image;
 *   - the Layout Builder module, enabled on the Article display with
 *     per-item overrides, so the layout steps have a builder to open.
 */

use Drupal\Core\File\FileExists;
use Drupal\Core\File\FileSystemInterface;
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\media\Entity\Media;
use Drupal\node\Entity\Node;

$entity_type_manager = \Drupal::entityTypeManager();

// 1. A media reference field on Article with the Media Library widget.
if (!FieldStorageConfig::loadByName('node', 'field_media')) {
  FieldStorageConfig::create([
    'field_name' => 'field_media',
    'entity_type' => 'node',
    'type' => 'entity_reference',
    'settings' => ['target_type' => 'media'],
    'cardinality' => -1,
  ])->save();
  print "Created the field_media storage.\n";
}
if (!FieldConfig::loadByName('node', 'article', 'field_media')) {
  FieldConfig::create([
    'field_name' => 'field_media',
    'entity_type' => 'node',
    'bundle' => 'article',
    'label' => 'Media',
    'settings' => [
      'handler' => 'default:media',
      'handler_settings' => ['target_bundles' => ['image' => 'image']],
    ],
  ])->save();
  print "Added the Media field to Article.\n";
}
$display_repository = \Drupal::service('entity_display.repository');
$display_repository->getFormDisplay('node', 'article', 'default')
  ->setComponent('field_media', [
    'type' => 'media_library_widget',
    'weight' => 5,
    'region' => 'content',
  ])
  ->save();
$display_repository->getViewDisplay('node', 'article', 'default')
  ->setComponent('field_media', [
    'type' => 'entity_reference_entity_view',
    'settings' => ['view_mode' => 'default'],
    'weight' => 5,
    'region' => 'content',
  ])
  ->save();

// 2. One Image media item.
$media_storage = $entity_type_manager->getStorage('media');
$media = $media_storage->loadByProperties(['name' => 'Sample image']);
$media = $media ? reset($media) : NULL;
if (!$media) {
  $directory = 'public://seed';
  \Drupal::service('file_system')->prepareDirectory($directory, FileSystemInterface::CREATE_DIRECTORY);
  $file = \Drupal::service('file.repository')->writeData(
    file_get_contents(DRUPAL_ROOT . '/core/misc/druplicon.png'),
    $directory . '/sample-image.png',
    FileExists::Replace
  );
  $media = Media::create([
    'bundle' => 'image',
    'name' => 'Sample image',
    'uid' => 1,
    'status' => 1,
    'field_media_image' => [
      'target_id' => $file->id(),
      'alt' => 'Sample image alt text',
      'title' => 'Sample image title text',
    ],
  ]);
  $media->save();
  print "Created the Sample image media item.\n";
}

// 3. One published Article.
$node_storage = $entity_type_manager->getStorage('node');
if (!$node_storage->loadByProperties(['title' => 'Sample article'])) {
  Node::create([
    'type' => 'article',
    'title' => 'Sample article',
    'uid' => 1,
    'status' => 1,
    // Not promoted: a promoted item would replace the front page's empty
    // state the suite asserts on (and its h1).
    'promote' => 0,
    'body' => [
      'value' => '<p>Sample article body text.</p>',
      'format' => 'basic_html',
    ],
    'field_media' => [['target_id' => $media->id()]],
    'path' => ['alias' => '/sample-article'],
  ])->save();
  print "Created the Sample article.\n";
}

// 4. Layout Builder on the Article display, overridable per item, so the
// layout steps have a builder to open (`/node/<nid>/layout`).
if (!\Drupal::moduleHandler()->moduleExists('layout_builder')) {
  \Drupal::service('module_installer')->install(['layout_builder']);
  print "Installed the Layout Builder module.\n";
}
$article_display = \Drupal::entityTypeManager()->getStorage('entity_view_display')->load('node.article.default');
if ($article_display && method_exists($article_display, 'enableLayoutBuilder') && !$article_display->isLayoutBuilderEnabled()) {
  $article_display->enableLayoutBuilder()->setOverridable()->save();
  print "Enabled Layout Builder, with overrides, on the Article display.\n";
}

print "Fixtures are in place.\n";

// The core Contact module's site-wide "feedback" form, open to visitors, for the
// contact-form feature: the Standard profile of core 11.4 no longer ships it.
\Drupal::service('module_installer')->install(['contact']);
$feedback = \Drupal\contact\Entity\ContactForm::load('feedback');
if (!$feedback) {
  $feedback = \Drupal\contact\Entity\ContactForm::create([
    'id' => 'feedback',
    'label' => 'Website feedback',
    'recipients' => ['admin@example.com'],
    'reply' => '',
    'weight' => 0,
  ]);
  echo "contact form: feedback created\n";
}
// Without this text the form sends the mail and says nothing: no message means no
// session for the visitor, and the cached front page comes back silent.
if (!$feedback->getMessage()) {
  $feedback->setMessage('Your message has been sent.');
}
$feedback->save();
// The flood limit (5 messages an hour by default) would refuse the suite on
// its second run of the hour against the same site.
\Drupal::configFactory()->getEditable('contact.settings')
  ->set('default_form', 'feedback')
  ->set('flood.limit', 1000)
  ->save();
foreach (['anonymous', 'authenticated'] as $role) {
  user_role_grant_permissions($role, ['access site-wide contact form']);
}
