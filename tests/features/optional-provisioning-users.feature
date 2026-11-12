# Optional. Accounts are configuration: the build of a site creates them and
# the users registry names them, which is how every other feature of this
# suite works. A project that wants its suite to create and remove accounts
# instead uses the two steps below. This feature is the only one that runs
# them; it is excluded from the default run by its tag and has its own
# profile and registry in cucumber.js:
#
#   npx cucumber-js --config cucumber.js --profile provisioning
@provisioning
Feature: Optional: provisioning the testing users
  As a test author whose suite has to prepare its own accounts
  I want the accounts of the users registry created and removed through the People administration
  So that the suite can run against a site that starts with only the administrator

  Scenario: The accounts of the registry are created with their roles
    Given I am a logged in user with the "admin" user
    When I add the testing users
    And I am on the people page
    Then I should see "Content editor" in the "temporary_edito" row
    And I should see "temporary_member" in the "temporary_member" row

  Scenario: Adding the testing users again keeps the accounts that exist
    Given I add the testing users
    And I am on the people page
    Then I should see "Content editor" in the "temporary_edito" row

  Scenario: A created account logs in by its handle
    Given I add the testing users
    And I am a logged in user with the "temporary_editor" user
    Then I should be logged in
    Given I am a logged in user with the "temporary_member" user
    Then I should be logged in
    And I should not see the navigation sidebar

  Scenario: The accounts are removed and the administrator is kept
    Given I am a logged in user with the "admin" user
    When I delete the testing users
    And I am on the people page
    Then I should not see "temporary_member"
    And I should not see "temporary_edito"
    And I should see "admin" in the "admin" row
