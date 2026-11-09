Feature: Appearance page
  As a site administrator
  I want the appearance page to list the themes core ships
  So that I know the theme system is registered correctly

  Background:
    Given I am on the login page
    When I log in as "admin" with password "admin"

  Scenario: The appearance page lists the default and admin themes
    Given I am on the appearance page
    Then I should be on an admin page
    And I should see the page title "Appearance"
    And I should see "Olivero"
    And I should see "Claro"

  Scenario: The appearance page reports no error
    Given I am on the appearance page
    Then I should not see an error message
