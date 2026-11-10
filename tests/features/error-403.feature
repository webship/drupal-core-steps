@js-off
Feature: Access denied page
  As an anonymous visitor
  I want a clear "access denied" page for a route I'm not allowed to view
  So that I know why I can't see it, rather than seeing a broken page

  Scenario Outline: A restricted route renders the access denied page
    Given I am an anonymous user
    And I am on "<path>"
    Then I should be on the access denied page
    And the response status code should be 403

    Examples:
      | path           | reason                                       |
      | /admin/config  | requires the administration pages permission |
      | /user/register | self-registration is disabled on this site   |
