Feature: Generator fingerprint
  As a site owner
  I want the site to identify itself as the CMS and major version I expect
  So that an accidental downgrade or a swapped-out back end is caught early

  Scenario: The front page reports its generator
    Given I am an anonymous user
    And I am on the homepage
    Then the site generator should be "Drupal"
    And the response header "x-generator" should contain the value "Drupal"

  Scenario: The generator pins a major version
    Given I am an anonymous user
    And I am on the homepage
    Then the site generator should not be "Drupal 7"
    And the site generator should not be "Drupal 8"

  Scenario: Administration pages report the same generator
    Given I am a logged in user with the "admin" user
    And I go to "/admin"
    Then the site generator should be "Drupal"
