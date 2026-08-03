Feature: Page not found
  As an anonymous visitor
  I want a clear "page not found" page for a URL that does not exist
  So that I know the page was not found rather than seeing a broken page

  Scenario: An unknown URL renders the page not found page
    Given I am an anonymous user
    And I am on "/this-page-does-not-exist-test-runner"
    Then I should be on the 404 page
    And the response status code should be 404
