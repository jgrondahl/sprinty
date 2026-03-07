## Story: As a user, I want to log in so I can access my account
Allow users to authenticate with email and password using JWT tokens.

### Acceptance Criteria
- Given valid credentials, When I submit the login form, Then I receive a JWT token
- Given invalid credentials, When I submit, Then I see an error message
- Given an expired token, When I make a request, Then I am redirected to login
