Feature: Named selectors for core's markup
  As a test author
  I want the pack's selector preset to name the markup core renders
  So that scenarios read "status message" and "navigation sidebar" without a CSS selector in sight

  Scenario: The login page is described with the preset's names
    Given I am on the login page
    Then I see visible login form, username field, password field
    And I see visible page title
    And I see username field above password field
    And I don't see navigation sidebar, status message

  Scenario: The administration pages are described with the preset's names
    Given I am a logged in user with the "admin" user
    And I am on the content overview page
    Then I see visible navigation sidebar, page title, views table
    And I see visible exposed filters
    And I don't see error message

  Scenario: A project's own name wins over the preset
    Given I define css selectors:
      | name       | css selector |
      | page title | h1 .no-such-heading |
    And I am on the login page
    Then I don't see page title
    And I see visible login form
