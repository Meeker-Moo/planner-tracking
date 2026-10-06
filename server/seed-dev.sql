-- The develop test accounts (DEVELOP_SEED_USERS in src/app/core/auth/auth.config.ts), for the local database only:
--   npm run db:seed:local
-- Passwords: superadmin / super1234, admin / admin1234, user1 and user2 / user1234.
-- They are kept as sha256$ of username:password and redone as PBKDF2 at the first sign-in.
INSERT OR IGNORE INTO users (id, username, display_name, role, password_hash, must_change_password, active,
                             failed_logins, locked_until, created_by, created_at, updated_at)
VALUES
  ('u-superadmin', 'superadmin', 'Super Admin (dev)', 'SUPER_ADMIN',
   'sha256$b69bb836b320a6272731d7b48a88d896e98e22dd6cbd49f5fb137a1cec036569', 0, 1, 0, NULL, NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('u-admin', 'admin', 'Admin (dev)', 'ADMIN',
   'sha256$590c783dce35634a13f99f7b25482678536c9a39cf153f1bb83554aa0362e5d1', 0, 1, 0, NULL, NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('u-user1', 'user1', 'ผู้ใช้ 1 (dev)', 'USER',
   'sha256$321f8342d492180b5270d6a21de199d11256a316720b1b9a73e3a80f5703df9e', 0, 1, 0, NULL, NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('u-user2', 'user2', 'ผู้ใช้ 2 (dev)', 'USER',
   'sha256$59d65222fcd80b61ad7e44ce3e75d2792d9a18eb52343745cb413c34e73a468b', 0, 1, 0, NULL, NULL,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
