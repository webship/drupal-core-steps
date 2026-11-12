Feature: Navigation module and the node form
  As an editor on a core site that uses the Navigation module
  I want the sidebar, the top bar and the node form to answer to plain sentences
  So that the same scenarios run on plain core and on a distribution built on it

  Scenario: The navigation sidebar scopes the back end to the role
    Given I am a logged in user with the "admin" user
    Then the navigation sidebar should list "Content"
    And the navigation sidebar should list "Extend"
    And the navigation toolbar should not list "No such link"
    When I click "Content" in the navigation sidebar
    Then I should see the page title "Content"

  Scenario: The top bar offers the page actions on a content item
    Given I am a logged in user with the "admin" user
    And I am on "/sample-article"
    Then the top bar should offer the "Edit" action
    And the top bar should not offer the "No such action" action
    When I choose the "Edit" action in the top bar
    Then "#edit-title-0-value" should have value "Sample article"

  # The browser validates the form on Drupal 11. Drupal 12 switches HTML5
  # validation off and lets the server answer: see drupal-12.feature.
  @drupal11
  Scenario: The browser refuses a node form with an empty title
    Given I am a logged in user with the "admin" user
    And I am adding a "page"
    When I try to save the content
    Then the "Title" field should block submission as required

  Scenario: The node form saves through the Save button
    Given I am a logged in user with the "admin" user
    And I am adding a "page"
    When I fill in "Title" with "Saved through the Save button"
    And I save the content
    Then I should see a status message "has been created."
    And the "Article" content type should exist
    And the "No such type" content type should not exist
    When I delete the content item I am viewing
    Then I should see a status message "has been deleted."
