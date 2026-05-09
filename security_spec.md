# Security Specification - NewsFlow

## Data Invariants
1. A User document must exist for any personalized action (favorites, preferences).
2. Users can only read and write their own data (identity isolation).
3. Favorites must have a valid article title and link.
4. Timestamps (createdAt, updatedAt) must be system-generated (serverTimestamp).

## The "Dirty Dozen" Payloads
1. **Identity Spoofing**: Attempt to create a user profile with a different UID.
2. **Metadata Tampering**: Attempt to set `createdAt` to a future date.
3. **Privilege Escalation**: Attempt to add an `isAdmin: true` field.
4. **Orphaned Write**: Attempt to add a favorite to a non-existent user path.
5. **PII Leak**: Attempt to list all users' emails.
6. **Large Document Attack**: Attempt to save a 500KB string in a preference field.
7. **Malicious ID injection**: Use `../` or long strings as favorite IDs.
8. **State Jump**: Attempt to update immutable fields like `uid`.
9. **No-Auth Read**: Attempt to read news analytics without being signed in.
10. **Shadow Field injection**: Attempt to add `verified: true` to a user profile.
11. **Type Poisoning**: Send a number instead of an array for categories.
12. **Cross-User Delete**: Attempt to delete another user's favorite.

## Test Runner logic
The tests will verify that all above payloads return `PERMISSION_DENIED`.
