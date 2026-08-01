Feature: Drupal front page
  As an anonymous visitor
  I want the Drupal front page to load correctly
  So that I know the site is up and rendering its core layout

  @critical
  Scenario: Front page renders and returns 200
    Given I am an anonymous user
    And I am on the homepage
    Then I should be on the front page
    And the response status code should be 200

  Scenario: Front page renders correctly on mobile
    Given I am on the homepage
    When I set the viewport to the "xs" breakpoint
    Then I should be on the front page
    And the response status code should be 200
