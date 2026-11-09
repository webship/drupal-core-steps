Feature: Cache clearing
  As a site administrator
  I want to flush every cache from the administration UI
  So that a configuration change is visible on the next request

  Scenario: Flushing all caches reports success
    Given I am a logged in user with the "admin" user
    When I flush all caches
    Then I should see a status message "Caches cleared."
    And I should be on an admin page

  Scenario: An editor may not reach the performance page
    Given I am a logged in user with the "editor" user
    When I go to "/admin/config/development/performance"
    Then the page should return HTTP status 403
    And I should be on the access denied page
