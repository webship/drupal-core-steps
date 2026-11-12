Feature: Content lifecycle
  As a content editor
  I want to create a content item and come back to it by what it is to the scenario
  So that a scenario never has to know the id or alias of what it made

  # A Basic page: unlike an article it is never promoted to the front page,
  # so a scenario that stops half way cannot change what the front page shows.
  Scenario: A page is created, revisited, edited and removed
    Given I am a logged in user with the "admin" user
    When I create a "page" content item titled "Lifecycle page"
    Then I should see a status message "has been created."
    And I should be on a "page" page
    When I am on the homepage
    And I view the content item I created
    Then I should see the page title "Lifecycle page"
    When I edit the content item I created
    Then "#edit-title-0-value" should have value "Lifecycle page"
    When I expand the "Menu settings" details
    Then the checkbox labeled "Provide a menu link" should be unchecked
    When I collapse the "Menu settings" details
    And I expand the "URL alias" details
    And I delete the content item I created
    Then I should see a status message "has been deleted."

  Scenario: A page saved through the form is the content item the scenario created
    Given I am a logged in user with the "admin" user
    And I am on "/node/add/page"
    When I fill in "Title" with "Saved page"
    And I save the content
    Then I should see a status message "has been created."
    When I am on the homepage
    And I view the content item I created
    Then I should see the page title "Saved page"
    When I delete the content item I created
    Then I should see a status message "has been deleted."

  Scenario: The content type form keeps its settings behind vertical tabs
    Given I am a logged in user with the "admin" user
    And I am on "/admin/structure/types/manage/article"
    When I open the "Menu settings" vertical tab
    Then the checkbox labeled "Main navigation" should be checked
    When I open the "Publishing options" vertical tab
    Then the checkbox labeled "Published" should be checked

  Scenario: A taxonomy term is created through its vocabulary and removed again
    Given I am a logged in user with the "admin" user
    # A run that stopped half way leaves its term behind: start clean.
    And I delete the "tags" taxonomy terms named "Lifecycle tag"
    When I create a "tags" taxonomy term named "Lifecycle tag"
    Then I should see a status message "Created new term"
    When I delete the "tags" taxonomy term named "Lifecycle tag"
    And I am on "/admin/structure/taxonomy/manage/tags/overview"
    Then I should not see "Lifecycle tag"

  Scenario: A content item is removed through the confirmation form
    Given I am a logged in user with the "admin" user
    When I create a "page" content item titled "Page to confirm"
    And I am on the content overview page
    And I open the "Delete" operation in the "Page to confirm" row
    Then I should see the page title "Are you sure"
    When I confirm the deletion
    Then I should see a status message "has been deleted."
