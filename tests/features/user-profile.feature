Feature: User profile
  As an authenticated user
  I want my account page to render under my own user path
  So that I know the session is bound to a real account

  Background:
    Given I am on the login page
    When I log in as "admin" with password "admin"

  Scenario: The account shortcut resolves to the signed-in user's profile
    Given I am on the my account page
    Then I should be logged in
    And the url should match "/user/1"
    And I should see the page title "admin"

  Scenario: The profile page is not an administration page
    Given I am on the user profile page
    Then I should not be on an admin page
    And I should be logged in
    And I should not see an error message

  Scenario: Anonymous visitors cannot read the profile
    Given I am an anonymous user
    And I am on "/user/1"
    Then I should be on the access denied page
    And the response status code should be 403
