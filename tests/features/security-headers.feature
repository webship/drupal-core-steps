Feature: Security response headers
  As a site owner
  I want core's hardening headers on every response
  So that clickjacking and MIME-sniffing protections are not silently dropped

  Scenario: The front page carries core's hardening headers
    Given I am an anonymous user
    And I am on the homepage
    Then the response header "x-frame-options" should contain the value "SAMEORIGIN"
    And the response header "x-content-type-options" should contain the value "nosniff"
    And the response should contain the header "cache-control"

  Scenario: The login screen carries the same headers
    Given I am an anonymous user
    And I am on the login page
    Then the response header "x-frame-options" should contain the value "SAMEORIGIN"
    And the response header "x-content-type-options" should contain the value "nosniff"

  Scenario: The server does not advertise its PHP version
    Given I am an anonymous user
    And I am on the homepage
    Then the response should not contain the header "x-powered-by"
