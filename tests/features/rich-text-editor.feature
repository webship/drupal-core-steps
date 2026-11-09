Feature: Rich text editor
  As a content author
  I want to write into the rich text editor and save the item
  So that the editor integration is exercised end to end

  @critical
  Scenario: Fill, append and format the body of a new article, then save and delete it
    Given I am a logged in user with the "admin" user
    And I am adding an "article"
    When I fill in the field "#edit-title-0-value" with "Rich text acceptance article"
    And I fill in the rich text editor field "Body" with "<p>First paragraph from the suite.</p>"
    And I append the rich text editor field "Body" with "<p>Appended paragraph.</p>"
    And I click on "Bold" command button in the rich text editor field "Body"
    And I submit by id "edit-submit"
    Then I should see a status message "Rich text acceptance article has been created."
    And I should see "First paragraph from the suite."
    And I should see "Appended paragraph."
    And the content item should be published
    And the content item should not be unpublished
    When I delete the content item I am viewing
    Then I should see a status message "has been deleted."
