Feature: Extend page
  As a site administrator
  I want the module administration page to render the installed module list
  So that I know the extension system is intact

  Background:
    Given I am a logged in user with the "admin" user

  Scenario: The extend page lists core modules
    Given I am on the modules page
    Then I should be on an admin page
    And I should see the page title "Extend"
    And I should see "Node"
    And I should see "User"

  Scenario: The extend page carries the module filter form
    Given I am on the modules page
    Then "#system-modules" should be visible
    And I should see the local tasks
