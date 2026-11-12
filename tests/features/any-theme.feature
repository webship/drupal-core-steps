# The scenarios of this feature rely on nothing a theme prints by choice: no
# body class, no ".messages" class, no ".page-title" class. They run in the
# default run under the site's own themes, and CI runs them a second time
# with Stark as the default theme, which prints only what core's modules state
# (roles, aria-labels, data-drupal-* attributes, Form API ids).
@any-theme
Feature: Steps that hold under any theme
  As a test author on a site with its own theme
  I want the steps to read what core states, not the classes of core's themes
  So that the same scenarios run under any theme

  # A visitor has a front page on Drupal 11; the Standard profile of Drupal
  # 12 makes an administration page the front page (see drupal-12.feature).
  @drupal11
  Scenario: The front page is recognised
    Given I am not logged in
    When I am on the homepage
    Then I should be on the front page
    And I should not be on an admin page

  Scenario: The page title and the login form are recognised
    Given I am not logged in
    When I am on the login page
    Then I should not be on the front page
    And I should see the login form
    And I should see the page title "Log in"
    And I should not see the page title "Reset your password"

  Scenario: An error message is recognised
    Given I am on the login page
    When I log in as "editor" with password "not-the-password"
    Then I should see a login error "Unrecognized username or password."
    And I should not see a status message
    And I should not be logged in

  Scenario: The type and the publication state of a content item are recognised
    Given I am a logged in user with the "admin" user
    When I am on "/sample-article"
    Then I should be on an "article" page
    And I should not be on a "page" page
    And the content item should be published
    And I should see the page title "Sample article"
    And I should see the breadcrumb

  Scenario: An administration page is recognised
    Given I am a logged in user with the "admin" user
    When I am on the content overview page
    Then I should be on an admin page
    And I should not be on the front page
    And I should see the page title "Content"

  Scenario: A status message and an unpublished item are recognised
    Given I am a logged in user with the "admin" user
    And I am adding a "page"
    When I fill in "Title" with "Unpublished page"
    And I uncheck "Published"
    And I save the content
    Then I should see a status message "has been created."
    And I should not see an error message
    And the content item should be unpublished
    And the content item should not be published
    When I delete the content item I created
    Then I should see the status message "has been deleted."
