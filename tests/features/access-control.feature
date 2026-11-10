Feature: Access control
  As a site owner
  I want one step to say whether a role may reach a path or act on a content item
  So that permission scenarios read as the matrix they describe

  Scenario: The administrator is allowed the administration routes
    Given I am a logged in user with the "admin" user
    Then I should be allowed access to "/admin/content"
    And I should be allowed access to "/admin/people"
    And I am granted access to "/admin/reports/status"
    And the page should not have PHP errors

  Scenario: The editor reaches the content overview but not the people page
    Given I am a logged in user with the "editor" user
    Then I should be allowed access to "/admin/content"
    And I should be denied access to "/admin/people"
    And the page should be access restricted
    And the page should not have PHP errors

  Scenario: Anonymous visitors are denied every administrative route
    Given I am not logged in
    Then I should be denied access to "/admin"
    And I am refused "/node/add"
    And I should be denied access to "/admin/content"

  Scenario: Editing and deleting a content item follow the role
    Given I am a logged in user with the "admin" user
    Then I should be able to edit the content at "/sample-article"
    And I should be able to delete the content at "/sample-article"
    Given I am a logged in user with the "authenticated" user
    Then I should not be able to edit the content at "/sample-article"
    And I should not be able to delete the content at "/sample-article"
