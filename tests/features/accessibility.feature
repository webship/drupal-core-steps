@a11y
Feature: Baseline accessibility
  As a site owner
  I want the structural accessibility core guarantees on its own pages
  So that a theme or module change cannot quietly remove it

  Scenario: The front page exposes core's document structure
    Given I am an anonymous user
    And I am on the homepage
    Then the page should have a title
    And the page should declare a language
    And the page should have a skip link
    And the page should have a main landmark
    And the page should have a navigation landmark
    And the page should have exactly one h1

  Scenario: The login form labels every field
    Given I am an anonymous user
    And I am on the login page
    Then every form field should have an accessible label
    And every button should have an accessible name
    And the page should have exactly one h1

  Scenario: Administration listings keep their landmarks
    Given I am a logged in user with the "admin" user
    And I go to "/admin/content"
    Then the page should have a main landmark
    And the page should have exactly one h1
    And every image should have an alt attribute
