Feature: Users registry login
  As a test author
  I want to log in by a user handle configured once in cucumber.js
  So that feature files never carry credentials and the login survives overlays

  @critical
  Scenario: The administrator handle logs in through the robust in-page submit
    Given I am a logged in user with the "admin" user
    Then I should be logged in
    And I should see the navigation sidebar
    And the page should return HTTP status 200

  Scenario: Another handle logs in as its own account
    Given I am a logged in user with the username "editor"
    Then I should be logged in
    And I am on the my account page
    Then I should see the page title "editor"
    And the url should not match "/user/1$"

  Scenario: The handle is reusable in the plural phrasing
    Given we are a logged in user with "admin"
    Then we should be logged in
    And we should see the navigation sidebar

  Scenario: Not logged in drops an authenticated session
    Given I am a logged in user with the "admin" user
    And I am not logged in
    Then I should see the login form
    And I should not be logged in
    And I should not see the navigation sidebar

  Scenario: Not logged in holds for a fresh session as well
    Given we are not logged in
    Then "#user-login-form" should be visible
    And I should not be logged in

  Scenario: An account with no role logs in but stays out of the back end
    Given I am a logged in user with the "authenticated" user
    Then I should be logged in
    And I should not see the navigation sidebar
    When I am on "/admin/content"
    Then the page should return HTTP status 403
    And I should be on the access denied page
