Feature: Listing rows and their operations
  As a site administrator
  I want the content overview to offer the operations my role allows on each row
  So that a permission change shows up as a missing or extra operation link

  Scenario: The administrator sees the edit and delete operations on the seeded article
    Given I am a logged in user with the "admin" user
    And I am on the content overview page
    Then I should see "Sample article" in the "Sample article" row
    And I should see "Published" in the "Sample article" row
    And I should see the "Edit" operation for the "Sample article" content
    And I should see the "Delete" operation for the "Sample article" entity

  Scenario: An editor without article permissions sees the row but no operations
    Given I am a logged in user with the "editor" user
    And I am on the content overview page
    Then I should see "Sample article" in the "Sample article" row
    And I should not see the "Edit" operation for the "Sample article" content
    And I should not see the "Delete" operation for the "Sample article" content

  Scenario: A row that is not listed offers no operations
    Given I am a logged in user with the "admin" user
    And I am on the content overview page
    Then I should not see the "Edit" operation for the "No such article" content

  Scenario: Opening an operation link navigates to its target
    Given I am a logged in user with the "admin" user
    And I am on the content overview page
    When I open the "Edit" link in the "Sample article" row
    Then the url should match "/edit"
    And I should see the page title "Sample article"
    And the checkbox labeled "Published" should be checked

  Scenario: The people overview offers the edit operation on the editor account
    Given I am a logged in user with the "admin" user
    And I am on the people page
    Then I should see the "Edit" operation for the "editor" user
    When I open the "Edit" operation in the "editor" row
    Then the url should match "/edit"
    And the checkbox labeled "Content editor" should be checked
    And the checkbox labeled "Administrator" should be unchecked
