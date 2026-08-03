Feature: Page caching
  As a site owner
  I want core's cache layers to answer repeat requests
  So that a caching regression shows up as a failing test, not as a slow site

  Scenario: A repeat anonymous view is served from the internal page cache
    Given I am an anonymous user
    And I am on the login page
    When I reload the page
    Then the page should be served from the page cache
    And I should see the login form

  Scenario: An authenticated view is never served from the internal page cache
    Given I am on the login page
    When I log in as "admin" with password "admin"
    And I go to the homepage
    Then I should be logged in
    And the page should not be served from the page cache

  Scenario: A repeat authenticated view is served from the dynamic page cache
    Given I am on the login page
    When I log in as "admin" with password "admin"
    And I go to the homepage
    And I reload the page
    Then the page should be served from the dynamic page cache
