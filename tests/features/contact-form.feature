Feature: Contact form
  As a visitor
  I want to send the site a message through its contact form
  So that the site hears from me without an account

  Scenario: A visitor sends feedback through the site-wide contact form
    Given I am not logged in
    And I am on "/contact"
    Then I should see "Website feedback"
    When I submit the contact form with subject "A question" and message "Where are the docs?"
    Then I should see "Your message has been sent."

  @drupal11

  Scenario: An empty subject is refused before anything is sent
    Given I am not logged in
    And I am on "/contact"
    When I submit the contact form with subject "" and message ""
    Then the "Subject" field should block submission as required
