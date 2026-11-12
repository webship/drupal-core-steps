Feature: Login
  As an anonymous visitor
  I want the login screen to render and authenticate correctly
  So that I know authentication is available on this site

  Scenario: The login screen exposes username, password and submit
    Given I am on the login page
    Then I should see the login form
    And the response status code should be 200

  @critical
  Scenario: A valid login authenticates the session and shows the admin navigation
    Given I am on the login page
    When I log in as "admin" with password "admin"
    Then I should be logged in
    And I should see the navigation sidebar

  Scenario: An invalid login shows an authentication error
    Given I am on the login page
    When I log in as "not-a-real-user" with password "wrong-password"
    Then I should see a login error
    And I should not be logged in

  Scenario: A wrong password for a real account is refused with the site's message
    Given I am on the login page
    When I log in as "editor" with password "not-the-password"
    Then I should see a login error "Unrecognized username or password."
    And I should not be logged in

  Scenario: Logging out ends the authenticated session
    Given I am on the login page
    When I log in as "admin" with password "admin"
    And I log out
    Then I should be on the homepage
    And I should not be logged in
