Feature: Form sections
  As a test author
  I want to open a section of a form by its title
  So that one scenario runs whether the theme shows vertical tabs or collapsible details

  Background:
    Given I am a logged in user with the "admin" user

  Scenario: A section of the node form opens and closes by its title
    Given I am adding a "page"
    When I open the "URL alias" form section
    Then "#edit-path-0-alias" should be visible
    When I close the "URL alias" form section
    And I open the "Menu settings" section of the form
    Then the checkbox labeled "Provide a menu link" should be unchecked

  Scenario: A section of the content type form opens by its title
    Given I am on "/admin/structure/types/manage/article"
    When I open the "Publishing options" form section
    Then the checkbox labeled "Published" should be checked
    When I open the "Menu settings" form section
    Then the checkbox labeled "Main navigation" should be checked

  Scenario: The details phrasing also opens a section shown as a vertical tab
    Given I am on "/admin/structure/types/manage/article"
    When I expand the "Publishing options" details
    Then "#edit-options-status" should be visible

  Scenario: The vertical tab phrasing also opens a section shown as details
    Given I am adding a "page"
    When I open the "URL alias" vertical tab
    Then "#edit-path-0-alias" should be visible
