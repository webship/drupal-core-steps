Feature: Breadcrumb trail
  As a visitor
  I want a breadcrumb on interior pages and none where there is no trail
  So that navigation context matches where I actually am

  @drupal11

  Scenario: An interior page renders a breadcrumb
    Given I am an anonymous user
    And I am on the login page
    Then I should see the breadcrumb
    And ".breadcrumb" should be visible

  @drupal11

  Scenario: The front page renders no breadcrumb
    Given I am an anonymous user
    And I am on the homepage
    Then I should be on the front page
    And I should not see the breadcrumb

  Scenario: Administration pages render a breadcrumb
    Given I am a logged in user with the "admin" user
    And I go to "/admin/reports/status"
    Then I should be on an admin page
    And I should see the breadcrumb trail
