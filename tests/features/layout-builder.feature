Feature: Layout Builder
  As a site builder
  I want to add a section to a content item's layout and revert it
  So that core's page building works end to end

  Scenario: A section is added to an article's layout, saved and reverted
    Given I am a logged in user with the "admin" user
    And I am on "/sample-article"
    When I open the layout of the content item I am viewing
    Then the layout should have 1 section
    When I add a "Two column" section at the end of the layout
    And I save the section
    Then the layout should have 2 sections
    When I save the layout
    Then I should see a status message "The layout override has been saved."
    And I should be on an "article" page
    When I revert the layout to the default
    Then I should see a status message "The layout has been reverted back to defaults."
