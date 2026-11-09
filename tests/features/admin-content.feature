Feature: Content overview
  As a site administrator
  I want the content administration view to render
  So that I can tell an empty site apart from a broken listing

  Background:
    Given I am on the login page
    When I log in as "admin" with password "admin"

  Scenario: The content overview renders its view
    Given I am on the content overview page
    Then I should be on an admin page
    And I should see the page title "Content"
    And ".views-table" should be visible

  Scenario: A site with no content shows an empty listing
    Given I am on the content overview page
    Then I should see an empty listing
    And I should not see an error message
