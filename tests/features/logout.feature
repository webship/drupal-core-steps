Feature: Logout
  As an authenticated user
  I want logging out to end my session, not merely redirect me
  So that the next request is genuinely anonymous again

  Background:
    Given I am a logged in user with the "admin" user
    Then I should be logged in

  @critical
  Scenario: Logging out drops the authenticated session
    When I log out
    Then I should not be logged in
    And I should not see the navigation sidebar
    And I should be on the front page

  Scenario: Administration pages are refused again after logging out
    When I log out
    And I go to "/admin/content"
    Then I should be on the access denied page
    And the response status code should be 403
