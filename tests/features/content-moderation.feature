Feature: Content moderation
  As an editor on a site with an editorial workflow
  I want to read and change the moderation state of a content item
  So that a scenario follows a draft to its publication

  # The build applies the Editorial workflow to the "Moderated page" content
  # type only (tests/seed/standard-fixtures.php): Article and Basic page keep
  # their Published checkbox.

  Scenario: A draft is published through the moderation control and removed again
    Given I am a logged in user with the "admin" user
    When I create a "moderated_page" content item titled "Moderated sample"
    Then I should see a status message "Moderated sample has been created."
    And the moderation state should be "Draft"
    And the moderation state should not be "Published"
    And the content item should be unpublished
    When I change the moderation state to "Published"
    Then I should see a status message "The moderation state has been updated."
    And the moderation state should be "Published"
    And the content item should be published
    When I delete the content item I created
    Then I should see a status message "has been deleted."
