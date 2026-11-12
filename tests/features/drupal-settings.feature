Feature: Core JavaScript delivery
  As a site owner
  I want core's settings payload to reach the browser and initialize
  So that a broken asset pipeline fails a test instead of a visitor's page

  @drupal11

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
    Given I am a logged in user with the "admin" user
    And I go to "/admin/content"
    Then the core JavaScript settings should be initialized
    And there should be no JavaScript errors
