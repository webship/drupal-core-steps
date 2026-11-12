Feature: Roles and permissions
  As a site builder
  I want to check what each role is permitted through the permissions form
  So that a suite proves the access model of a site without a command line

  Background:
    Given I am a logged in user with the "admin" user

  Scenario: A role is granted the permissions its job needs
    Then the "Content editor" role should have the "access content overview" permission
    And the "content_editor" role should have the "access administration pages" permission
    And the "Content editor" role should have the "View the administration theme" permission

  Scenario: A role is not granted what it must not do
    Then the "Content editor" role should not have the "administer users" permission
    And the "Anonymous user" role should not have the "access administration pages" permission
    And the "Authenticated user" role should not have the "administer nodes" permission

  Scenario: Visitors may view published content
    Then the "Anonymous user" role should have the "access content" permission
    And the "Anonymous user" role should have the "View published content" permission
