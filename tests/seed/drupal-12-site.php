<?php

/**
 * @file
 * Gives a Drupal 12 Standard installation what core recipes give Drupal 11.
 *
 * Drupal 12 ships no recipe for the Article and Basic page content types, the
 * Tags vocabulary or the Image media type, and its Standard profile installs
 * none of them. The suite needs them, so this script creates them the way a
 * site's own configuration would. tests/seed/build-site.sh runs it before
 * tests/seed/standard-fixtures.php:
 *
 *   ddev drush php:script seed/drupal-12-site.php
 *
 * Idempotent: everything is created only when it does not exist yet.
 */

use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\media\Entity\MediaType;
use Drupal\node\Entity\NodeType;
use Drupal\taxonomy\Entity\Vocabulary;

$display_repository = \Drupal::service('entity_display.repository');

// 1. The Article and Basic page content types, each with a Body field. Drupal
// 12 has no "text with summary" field type: Body is a long formatted text.
if (!FieldStorageConfig::loadByName('node', 'body')) {
  FieldStorageConfig::create([
    'field_name' => 'body',
    'entity_type' => 'node',
    'type' => 'text_long',
    'cardinality' => 1,
  ])->save();
  print "Created the body field storage.\n";
}
foreach (['article' => 'Article', 'page' => 'Basic page'] as $id => $label) {
  if (!NodeType::load($id)) {
    NodeType::create([
      'type' => $id,
      'name' => $label,
      'display_submitted' => $id === 'article',
    ])->save();
    print "Created the $label content type.\n";
  }
  if (!FieldConfig::loadByName('node', $id, 'body')) {
    FieldConfig::create([
      'field_name' => 'body',
      'entity_type' => 'node',
      'bundle' => $id,
      'label' => 'Body',
    ])->save();
    $display_repository->getFormDisplay('node', $id, 'default')
      ->setComponent('body', ['type' => 'text_textarea', 'weight' => 1])
      ->save();
    $display_repository->getViewDisplay('node', $id, 'default')
      ->setComponent('body', ['type' => 'text_default', 'label' => 'hidden', 'weight' => 1])
      ->save();
    print "Added the Body field to $label.\n";
  }
}

// 2. The Tags vocabulary.
if (!Vocabulary::load('tags')) {
  Vocabulary::create(['vid' => 'tags', 'name' => 'Tags'])->save();
  print "Created the Tags vocabulary.\n";
}

// 3. The Image media type, with the source field name the Drupal 11 recipe
// uses (field_media_image).
if (!MediaType::load('image')) {
  $media_type = MediaType::create([
    'id' => 'image',
    'label' => 'Image',
    'source' => 'image',
  ]);
  $media_type->save();
  $source_field = $media_type->getSource()->createSourceField($media_type);
  $source_field->getFieldStorageDefinition()->save();
  $source_field->save();
  $media_type->set('source_configuration', ['source_field' => $source_field->getName()])->save();
  $display_repository->getFormDisplay('media', 'image', 'default')
    ->setComponent($source_field->getName(), ['type' => 'image_image'])
    ->save();
  $display_repository->getViewDisplay('media', 'image', 'default')
    ->setComponent($source_field->getName(), ['type' => 'image', 'label' => 'hidden'])
    ->save();
  // The view mode the Media Library grid shows.
  $display_repository->getViewDisplay('media', 'image', 'media_library')
    ->setComponent('thumbnail', ['type' => 'image', 'label' => 'hidden', 'settings' => ['image_style' => 'thumbnail']])
    ->save();
  print "Created the Image media type.\n";
}

print "Drupal 12: content types, vocabulary and media type are in place.\n";
