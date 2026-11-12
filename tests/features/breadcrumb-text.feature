Feature: Breadcrumb text
  As a visitor
  I want the breadcrumb trail to name the pages above the current one
  So that I can tell where an administration or content page sits

  @drupal11

  Scenario: The status report sits under Reports and Administration
    Given I am a logged in user with the "admin" user
    When I go to "/admin/reports/status"
    Then "Home" should be in the breadcrumb
    And "Administration" should be in the breadcrumb
    And the breadcrumb should contain "Reports"
    And the breadcrumb should not contain "Status report"

  @drupal11

  Scenario: The login page trail is just Home
    Given I am not logged in
    And I am on the login page
    Then the breadcrumb should contain "Home"
    And "Administration" should not be in the breadcrumb
