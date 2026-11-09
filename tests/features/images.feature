Feature: Image alt and title text
  As a visitor
  I want the images on a page to carry their alternative and title text
  So that an accessibility regression on an image field is caught

  Scenario: The seeded article renders its media image with alt and title text
    Given I am not logged in
    And I am on "/sample-article"
    Then I should be on an "article" page
    And I should see an image with the "Sample image alt text" alt text
    And I should see an image with the "Sample image title text" title text
    And I should not see an image with the "No such image" alt text
    And I should not see an image with the "No such image" title text
