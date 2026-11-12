Feature: Status report
  As a site administrator
  I want the status report to render its environment summary
  So that I can confirm which Drupal and PHP versions are actually running

  Background:
    Given I am a logged in user with the "admin" user

  @critical
  Scenario: The status report renders the general information panel
    Given I am on the status report page
    Then I should be on an admin page
    And I should see the page title "Status report"
    And I should see "Drupal Version"
    And I should see "PHP"
    And I should see "Database"

  Scenario: The status report agrees with the generator meta tag
    Given I am on the status report page
    Then the site generator should be "Drupal"
