# MindTrack Test Credentials

## Admin
- **Email:** admin@mindtrack.app
- **Username:** admin
- **Password:** Admin@12345
- **Role:** admin
- Admin can upload music tracks and view admin notices.

## Test User
- Register a new account via `/signup` or:
  - Email: test.user@example.com
  - Username: testuser
  - Password: Test@12345

## Auth Endpoints
- POST `/api/auth/register` — `{email, username, password, first_name, last_name}`
- POST `/api/auth/login` — `{identifier (email or username), password}`
- POST `/api/auth/google` — `{session_id}` (Emergent OAuth)
- GET `/api/auth/me` — Bearer token
- POST `/api/auth/disorders` — `{disorders: ["ADHD","Bipolar","Autism"]}`

## Notes
- Auth uses JWT Bearer tokens (30-day expiry), passed in `Authorization: Bearer <token>` header.
- Token is returned by register/login/google endpoints in `access_token` field.
- Mobile frontend stores token in AsyncStorage.
