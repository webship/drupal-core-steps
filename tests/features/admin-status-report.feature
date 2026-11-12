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

  Scenario: The status report counts no errors
    Then the status report should have no errors
    And the status report should count 0 errors

  # A local build always warns that settings.php is writable.
  Scenario: The status report names its warnings
    Then the status report should have warnings
    And the status report should list the warning "Configuration files"
    And the status report should not list the error "Configuration files"
    And the status report should count at most 5 warnings
