@search
Feature: Search
  As a visitor
  I want to search the content of the site
  So that I find a page by a word it contains

  # The site's build installs the Search module, the node search page and
  # indexes the content (see the README); a site without it gets a hint.
  Scenario: A word of a published item returns results
    Given I am not logged in
    And I am on the search page
    Then I should see the search form
    When I search for "Sample"
    Then I should see search results
    And I should see "Sample article"

  Scenario: A word no item contains returns no results
    Given I am not logged in
    And I am on the content search page
    When I search for "zzzqqqxxx"
    Then I should see no search results
    And we should not see search results
