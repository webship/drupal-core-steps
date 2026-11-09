Feature: Authenticated access to the administration pages
  As a site administrator
  I want the administrative routes that refuse anonymous visitors to open for me
  So that the 403s elsewhere in this suite are proven to be about permission

  Background:
    Given I am a logged in user with the "admin" user
    Then I should be logged in

  Scenario Outline: An administrative route opens for the administrator
    When I go to "<path>"
    Then I should be on an admin page
    And I should see the page title "<title>"
    And I should not be on the access denied page

    Examples:
      | path                  | title          |
      | /admin                | Administration |
      | /admin/content        | Content        |
      | /admin/people         | People         |
      | /admin/modules        | Extend         |
      | /admin/appearance     | Appearance     |
      | /admin/structure      | Structure      |
      | /admin/config         | Configuration  |
      | /admin/reports        | Reports        |
      | /admin/reports/status | Status report  |
