# Clean the live database for launch

Keep only **Aman RAJ ADMIN (+917759037668)** as the admin. Keep the 8 products. Remove the demo sign-in buttons. Everything else in the database gets deleted.

## What's there now
- 14 accounts: 6 admins, 6 employees, 1 client and 1 extra demo account (admin@demo.com)
- About 650 records, including orders (6), order events (58), payments (9), notifications (202), duty sessions (69), locations (48), audit logs (79), field visits (7), and phone code logs (44)
- 9 payment-proof files. No other storage holds files.

## Steps (one-time, not part of any deploy)
1. **Backup first.** Save every table as a spreadsheet file and all 9 payment-proof files in one ZIP you can download.
2. **Keep Aman's records.** That means the profile, admin role, settings, and any employee record or permissions linked to Aman. Confirm the admin role is in place.
3. **Delete everything else** in the right order: payments, delivery codes, order history, orders, clients, credit history, field visits, duty sessions, locations, notifications, audit logs, phone codes, payslips, tasks, and all other profiles and roles. Products stay. Nothing about the app's structure changes.
4. **Delete the other 13 sign-in accounts**, including all 4 demo accounts.
5. **Empty the payment-proofs storage** but keep the storage itself.
6. **Remove the demo buttons** from the sign-in page and switch off the demo sign-in on the server, so tapping a button can't recreate demo accounts.
7. **Report back:** record counts per table, file count, and remaining accounts (Aman only). Then I'll check that Aman's account still has admin access.

## Notes
- This can't be undone except by restoring from the backup.
- Aman signs in with a phone code. Rate limits are still off, so sending the code should work.
- Your instructions said to change no app code. Removing the demo buttons is the one exception, because you asked for it.

## Technical details
- Deletes run as one-off statements with the privileged server client. They are not migrations.
- Auth users are deleted with the admin API. Storage files are removed with the storage API.
- Delete order follows the foreign keys. Rows are filtered with `<> aman_id` where they reference the user.
- No tables use auto-increment sequences, except `phone_otp_sends`, whose sequence gets reset.
- Demo removal: remove the demo section in `src/routes/auth.tsx` and delete `src/lib/demo-auth.functions.ts`.
