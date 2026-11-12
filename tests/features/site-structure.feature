Feature: Site structure
  As a site builder
  I want to assert what a site install or a site template put in place
  So that a smoke test reads as the list of promises the template makes

  Background:
    Given I am a logged in user with the "admin" user

  Scenario: Modules, theme and roles of a Standard install
    Then the "node" module should be installed
    And the "layout_builder" module should be installed
    And the "book" module should not be installed
    And the "no_such_module" module should not be enabled
    And the "Content editor" role should exist
    And the "Administrator" role should exist
    And the "Reviewer" role should not exist
    And the "Article" content type should exist
    And the "Basic page" content type should exist
    And the "No such type" content type should not exist

  @drupal11
  Scenario: The default theme of a Drupal 11 Standard install
    Then the default theme should be "Olivero"
    And the default theme should not be "Claro"
    And the front page path should be "/node"
    And the front page path should not be "/home"

  @drupal11
  Scenario: The default theme settings page opens without naming the theme
    Given I am on the default theme settings page
    Then I should see the page title "Olivero"
    And I should be on an admin page
    Given I am on the "claro" theme settings page
    Then I should see the page title "Claro"

  Scenario: Menus
    # A run that stopped half way leaves its link behind: start clean.
    Given I delete the menu links titled "Sample article link" from the "main" menu
    When I add a menu link titled "Sample article link" to "/sample-article" in the "main" menu
    Then I should see a status message "The menu link has been saved."
    And the "Main navigation" menu should contain "Sample article link"
    And the "main" menu should contain "Sample article link"
    And the "Main navigation" menu should not contain "No such link"
    And the "User account menu" menu should contain "My account"
    When I delete the menu link titled "Sample article link" from the "main" menu
    Then the "Main navigation" menu should not contain "Sample article link"

  Scenario: The canonical URL and the meta tags of a content page
    Given I am on "/sample-article"
    Then the page should have the canonical URL "/sample-article"
    And the canonical URL should end with "/sample-article"
    And the page should not have the canonical URL "/node/1"
    And the "Generator" meta tag should contain "Drupal"
    And the "Generator" meta tag should not be "WordPress"
