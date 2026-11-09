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

  Scenario: The content overview lists the seeded article
    Given I am on the content overview page
    Then I should see a non-empty listing
    And I should see "Sample article" in the "Sample article" row
    And I should not see an error message

  Scenario: Filtering for a title that does not exist shows an empty listing
    Given I am on "/admin/content?title=no-such-title-anywhere"
    Then I should see an empty listing
    And I should not see an error message
