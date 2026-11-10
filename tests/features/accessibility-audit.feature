@a11y
Feature: Accessibility audit
  As a site owner
  I want the main pages audited against the accessibility rules, not only core's structure
  So that a theme or a module cannot quietly ship a serious violation

  Scenario Outline: A public page has no serious accessibility violations
    Given I am an anonymous user
    And I am on "<path>"
    Then the page should have no serious accessibility violations
    And the page should have exactly one h1

    Examples:
      | path            |
      | /user/login     |
      | /sample-article |
      | /no-such-page   |

  # Core's own themes carry a few findings at the serious level (Olivero's
  # links inside text on the front page, a contrast and a title-only label on
  # Claro's listings); the suite pins those pages at the level that holds, and
  # a site that fixes them in its theme can raise it to "serious".
  Scenario: The front page has no critical accessibility violations
    Given I am an anonymous user
    And I am on the homepage
    Then the page should have no critical accessibility violations
    And the page should have exactly one h1

  Scenario: The login page passes the full accessibility check
    Given I am an anonymous user
    And I am on the login page
    Then the page should pass the full accessibility check

  Scenario: An administration listing has no critical accessibility violations for the administrator
    Given I am a logged in user with the "admin" user
    And I am on the content overview page
    Then the page should have no critical accessibility violations
