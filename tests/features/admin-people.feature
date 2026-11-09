Feature: People overview
  As a site administrator
  I want the people administration view to list the accounts that exist
  So that I know user administration works on a fresh install

  Background:
    Given I am a logged in user with the "admin" user

  Scenario: The people overview lists the administrator account
    Given I am on the people page
    Then I should be on an admin page
    And I should see the page title "People"
    And I should see a non-empty listing
    And I should see "admin"

  Scenario: The people overview exposes its filter form
    Given I am on the people page
    Then ".views-exposed-form" should be visible
