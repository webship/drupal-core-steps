Feature: Session-aware HTTP status
  As a test author
  I want the status of a page as the signed-in session sees it
  So that permission checks are about the current user, not an anonymous re-request

  Scenario: The administrator may open the people overview
    Given I am a logged in user with the "admin" user
    When I go to "/admin/people"
    Then the page should return HTTP status 200
    And I should see the page title "People"

  Scenario: An editor is refused the people overview while the public status still says 403
    Given I am a logged in user with the "editor" user
    When I go to "/admin/people"
    Then the page should return HTTP status 403
    And the page should not return HTTP status 200
    And I should be on the access denied page
    And the response status code should be 403

  Scenario: The editor may still read the content overview
    Given I am a logged in user with the "editor" user
    When I go to "/admin/content"
    Then the current page should return status 200
    And I should see the page title "Content"

  Scenario: An anonymous visitor gets the same answer from both status steps
    Given I am not logged in
    When I go to "/admin/content"
    Then the page should return HTTP status 403
    And the response status code should be 403
