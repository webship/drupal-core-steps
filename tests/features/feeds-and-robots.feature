Feature: Feeds and crawler files
  As a site owner
  I want the RSS feed and robots.txt core ships to be served
  So that crawlers and feed readers are not met with a 404

  Scenario: robots.txt is served as plain text
    Given I am an anonymous user
    And I am on "/robots.txt"
    Then the response status code should be 200
    And the response header "content-type" should contain the value "text/plain"

  @drupal11

  Scenario: The front page feed is served as RSS
    Given I am an anonymous user
    And I am on "/rss.xml"
    Then the response status code should be 200
    And the response header "content-type" should contain the value "rss+xml"

  Scenario: An unknown feed path still returns the not found page
    Given I am an anonymous user
    And I am on "/no-such-feed.xml"
    Then I should be on the 404 page
    And the response status code should be 404
