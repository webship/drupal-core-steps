Feature: Media library
  As a content author
  I want to pick an existing media item from the library on a node form
  So that the media library widget and dialog work on this site

  Background:
    Given I am a logged in user with the "admin" user
    And I am adding an "article"
    When I fill in the field "#edit-title-0-value" with "Media library acceptance article"

  @critical
  Scenario: Select an image in the library and insert it into the field
    When I open the "field_media" media library
    Then I should see "Sample image" in the modal
    When I select the media "Sample image"
    And I insert the selected media
    Then I should see "Sample image"
    When I submit by id "edit-submit"
    Then I should see a status message "has been created."
    And I should see an image with the "Sample image alt text" alt text
    When I delete the content item I am viewing
    Then I should see a status message "has been deleted."

  Scenario: The dialog can be submitted with the alternate phrasing
    When I open the "field_media" media library
    And I select the media item "Sample image"
    And I submit the media library dialog
    Then I should see "Sample image"
    And I should not see a modal
