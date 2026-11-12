Feature: Protected forms
  As a test author
  I want to wait out the time limit a form protection sets
  So that a form filled at the speed of a browser test is not refused as spam

  Scenario: The form time limit is a real wait
    Given I am on the login page
    When I wait out the form time limit of 2 seconds
    Then the page should have been open for at least 2 seconds

  Scenario: A login goes through after the form time limit
    Given I am on the login page
    When I fill in "Username" with "editor"
    And I fill in "Password" with "editor"
    And I wait out the form time limit of 1 second
    And I submit by id "edit-submit"
    Then I should be logged in
