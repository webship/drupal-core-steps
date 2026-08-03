Feature: Local tasks
  As a visitor
  I want core's tab strip on the routes that define local tasks
  So that the alternative actions on a page stay reachable

  Scenario: The login screen renders its primary tabs
    Given I am an anonymous user
    And I am on the login page
    Then I should see the local tasks
    And I should see "Log in"
    And I should see "Reset your password"

  Scenario: The password reset screen renders the same tabs
    Given I am an anonymous user
    And I am on the password reset page
    Then I should see the primary tabs
    And I should see the page title "Reset your password"

  Scenario: The front page defines no local tasks
    Given I am an anonymous user
    And I am on the homepage
    Then I should be on the front page
    And I should not see the local tasks
