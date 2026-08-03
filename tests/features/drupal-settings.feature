Feature: Core JavaScript delivery
  As a site owner
  I want core's settings payload to reach the browser and initialize
  So that a broken asset pipeline fails a test instead of a visitor's page

  Scenario: The front page initializes the core JavaScript settings
    Given I am an anonymous user
    And I am on the homepage
    Then the core JavaScript settings should be initialized
    And there should be no JavaScript errors

  Scenario: The login screen initializes the core JavaScript settings
    Given I am an anonymous user
    And I am on the login page
    Then the core JavaScript settings should be initialized
    And I should see the login form

  Scenario: Administration pages initialize the core JavaScript settings
    Given I am on the login page
    When I log in as "admin" with password "admin"
    And I go to "/admin/content"
    Then the core JavaScript settings should be initialized
    And there should be no JavaScript errors
