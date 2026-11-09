Feature: Basic site settings
  As a site administrator
  I want the site information form to load and save
  So that I know core configuration forms round-trip correctly

  Background:
    Given I am on the login page
    When I log in as "admin" with password "admin"

  Scenario: The site information form renders its fields
    Given I am on the site information page
    Then I should be on an admin page
    And I should see the site information form
    And I should see the page title "Basic site settings"

  @critical
  Scenario: Saving the form unchanged confirms with a status message
    Given I am on the site information page
    When I press the "Save configuration" button
    Then I should see the status message "The configuration options have been saved."
    And I should not see an error message
