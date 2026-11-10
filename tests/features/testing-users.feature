Feature: Testing users
  As a test author
  I want the accounts of the users registry created on the site under test
  So that a suite can log in as the roles it needs on a site that starts with only the administrator

  Scenario: The testing users are removed and created again from the registry
    Given I am a logged in user with the "admin" user
    When I delete the testing users
    And I add the testing users
    And I am on the people page
    Then I should see "Content editor" in the "editor" row
    And I should see "authenticated" in the "authenticated" row

  Scenario: The testing users of the registry are created once and kept
    Given I am a logged in user with the "admin" user
    When I add the testing users
    And I add the testing users
    And I am on the people page
    Then I should see "editor" in the "editor" row
    And I should see "Content editor" in the "editor" row
    And I should see "authenticated" in the "authenticated" row
    And I should see "Content editor" in the "reviewer_with_" row

  Scenario: Every registry handle logs in once the users exist
    Given I add the testing users
    And I am a logged in user with the "editor" user
    Then I should be logged in
    Given I am a logged in user with the "authenticated" user
    Then I should be logged in
    And I should not see the navigation sidebar
    Given I am a logged in user with the "reviewer" user
    Then I should be logged in

  Scenario: A login that the site refuses is reported as such
    Given I am on the login page
    When I log in as "editor" with password "not-the-password"
    Then I should see a login error "Unrecognized username or password."
    And I should not be logged in
