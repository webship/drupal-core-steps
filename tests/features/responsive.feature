Feature: Responsive rendering
  As a visitor on any device
  I want core's pages to keep rendering across viewport widths
  So that a layout regression at one breakpoint is caught

  @drupal11

  Scenario Outline: The front page renders at every breakpoint
    Given I am an anonymous user
    And I am on the homepage
    When I set the viewport to the "<breakpoint>" breakpoint
    Then I should be on the front page
    And the page should have a main landmark

    Examples:
      | breakpoint |
      | xs         |
      | md         |
      | xl         |
      | xxxl       |

  Scenario Outline: The login form stays usable at every breakpoint
    Given I am an anonymous user
    And I am on the login page
    When I set the viewport to the "<breakpoint>" breakpoint
    Then I should see the login form
    And user zoom should be allowed

    Examples:
      | breakpoint |
      | xs         |
      | md         |
      | xl         |
