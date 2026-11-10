Feature: Rich text editor links
  As a content editor
  I want to insert a link through the editor's link balloon
  So that the HTML the editor saves carries the link

  Scenario: A link is added through the balloon and shows in the editor data
    Given I am a logged in user with the "admin" user
    And I am adding an "article"
    When I fill in the rich text editor field "Body" with "<p>Linked text</p>"
    Then the rich text editor toolbar should have the "Link" button
    And the rich text editor toolbar should have the "Bold" button
    And the rich text editor toolbar should not have the "No such button" button
    And the rich text editor field "Body" should contain "Linked text"
    And the rich text editor field "Body" should not contain "<h1>"
    When I click on "Link" command button in the rich text editor field "Body"
    And I fill in the link URL "https://example.com/"
    And I click on the save button in "Body" rich text editor field
    Then the rich text editor field "Body" should contain "example.com"
