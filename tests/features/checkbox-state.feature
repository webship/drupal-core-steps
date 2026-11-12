Feature: Checkbox state
  As a test author
  I want to read a checkbox by its label or its machine handle
  So that a form's defaults are asserted the way an editor sees them

  Background:
    Given I am a logged in user with the "admin" user
    And I am adding an "article"

  @drupal11

  Scenario: The article form's publishing defaults, by label
    Then the checkbox labeled "Published" should be checked
    And the checkbox labeled "Promoted to front page" should be checked
    And the checkbox labeled "Sticky at top of lists" should be unchecked

  @drupal11

  Scenario: The same defaults, by Form API id
    Then the checkbox with the id "edit-status-value" should be checked
    And the checkbox with the id "edit-promote-value" should be checked
    And the checkbox with the id "edit-sticky-value" should be unchecked
