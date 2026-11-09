Feature: Password reset request
  As a visitor who cannot remember their password
  I want the one-time-login request screen to render and accept an identifier
  So that I know account recovery is available on this site

  Scenario: The password reset screen exposes the identifier field
    Given I am an anonymous user
    And I am on the password reset page
    Then I should see the password reset form
    And I should see the page title "Reset your password"
    And the response status code should be 200

  Scenario: The password reset screen is reachable from the login screen
    Given I am an anonymous user
    And I am on the login page
    Then I should see the local tasks
    When I follow "Reset your password"
    Then I should see the password reset form
    And I should not see the login form

  Scenario: Requesting a reset leaves the anonymous session anonymous
    Given I am an anonymous user
    And I am on the password reset page
    When I request a new password for "no-such-account"
    Then I should not be logged in
