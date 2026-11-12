# What differs on Drupal 12, stated as scenarios. The Standard profile of
# Drupal 12 installs one theme, Default Admin, for the front end and the back
# end, makes an administration page the front page, and switches HTML5 form
# validation off. The scenarios tagged @drupal11 in the other features are the
# Drupal 11 side of each of these.
@drupal12
Feature: Drupal 12
  As a test author moving a suite to Drupal 12
  I want the steps to hold on what Drupal 12 changed
  So that the same pack serves both versions

  Scenario: A visitor is refused the front page, which is an administration page
    Given I am not logged in
    When I am on the homepage
    Then I should be on the access denied page
    And the page should return HTTP status 403
    And I should not be logged in

  Scenario: The front page of an administrator is the welcome page
    Given I am a logged in user with the "admin" user
    When I am on the homepage
    Then I should be on the front page
    And I should be on an admin page
    And the front page path should be "/admin/welcome"
    And the page should not have PHP errors

  Scenario: One theme is the default theme and the administration theme
    Given I am a logged in user with the "admin" user
    Then the default theme should be "Default Admin"
    And the default theme should not be "Olivero"
    And the "contact" module should be installed
    And the "toolbar" module should not be installed
    When I am on the default theme settings page
    Then I should see the page title "Default Admin"

  Scenario: The server, not the browser, refuses a node form with an empty title
    Given I am a logged in user with the "admin" user
    And I am adding a "page"
    When I try to save the content
    Then I should see an error message "Title field is required."
    And I should not see a status message

  Scenario: The server refuses a contact message with an empty subject
    Given I am not logged in
    And I am on the contact page
    When I submit the contact form with subject "" and message ""
    Then I should see an error message "Subject field is required."

  Scenario: The sections of the node form are collapsible details
    Given I am a logged in user with the "admin" user
    And I am adding an "article"
    When I open the "URL alias" vertical tab
    Then "#edit-path-0-alias" should be visible
    And the checkbox labeled "Published" should be checked

  Scenario: The breadcrumb of an administration page starts at the administration
    Given I am a logged in user with the "admin" user
    When I am on the status report page
    Then I should see the breadcrumb
    And the breadcrumb should contain "Administration"
    And "Reports" should be in the breadcrumb
