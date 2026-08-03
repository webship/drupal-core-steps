Feature: Anonymous access control
  As a site owner
  I want every administrative route to refuse an anonymous visitor
  So that a misconfigured permission cannot quietly expose the back end

  Scenario Outline: An administrative route refuses anonymous visitors
    Given I am an anonymous user
    And I am on "<path>"
    Then I should be on the access denied page
    And the response status code should be 403
    And I should not be logged in

    Examples:
      | path                                  |
      | /admin                                |
      | /admin/content                        |
      | /admin/people                         |
      | /admin/modules                        |
      | /admin/appearance                     |
      | /admin/structure                      |
      | /admin/reports/status                 |
      | /admin/config/system/site-information |
      | /node/add                             |
