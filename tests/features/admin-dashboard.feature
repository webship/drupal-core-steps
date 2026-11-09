Feature: Administration dashboard
  As a site administrator
  I want the administration landing page to render with its admin chrome
  So that I know the admin interface is reachable after signing in

  Background:
    Given I am a logged in user with the "admin" user

  @critical
  Scenario: The administration page renders with the admin body class
    When I go to "/admin"
    Then I should be on an admin page
    And I should see the page title "Administration"
    And I should see the navigation sidebar

  Scenario: The named administration page step lands on the same screen
    Given I am on the administration page
    Then I should be on an admin page
    And I should see the page title "Administration"

  Scenario: The front page is not an administration page
    When I go to the homepage
    Then I should be on the front page
    And I should not be on an admin page
