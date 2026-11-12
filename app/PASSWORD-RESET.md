# Forgot password: how it works

## For everyone except the super admin (needs super admin approval)
1. On the sign-in page the user chooses **Forgot password?**, enters their username and sends a request.
   The screen gives the same answer whether or not the username exists, so it cannot be used to discover accounts.
2. The super admin sees it under **Administration > Password Requests** (a badge counts requests waiting) and chooses **Approve** or **Reject**.
3. **Approve** creates a one-time code (like `K7QMP-4XW2D`) that is shown to the super admin **once**. Only a keyed hash is stored.
   The super admin gives the code to the user personally (phone or in person).
4. The user chooses **I have a reset code** on the sign-in page, enters username + code + a new password.
   The password is changed, every signed-in session of that user ends, and the code stops working.

Until step 2 happens, nothing the user does can change the password.

### Safeguards
* One open request per user. A code is valid for 60 minutes (`PASSWORD_RESET_CODE_MINUTES` in `.env`, minimum 5) and works once.
* 5 wrong codes lock the request (the super admin can approve a fresh one). Sign-in style rate limits apply per IP and per username.
* A weak new password is refused without using up the code. Same rules as Change password (10 to 72 bytes, must not contain the username).
* Every step is written to the audit log (`PASSWORD_RESET_REQUESTED / APPROVED / REJECTED / COMPLETED / FAILED / BLOCKED`). Codes are never logged.
* Super admin accounts cannot be reset through the portal at all, so nobody can use this to take over an admin.

## For the super admin (server access required)
There is nobody above the super admin to approve, so recovery needs access to the server:

    cd app/backend
    npm run reset:superadmin                  # resets "superadmin"; asks for the new password (hidden)
    npm run reset:superadmin -- other_admin   # another super admin account

For scripts: set `NEW_SUPERADMIN_PASSWORD` instead of typing it. Existing sessions of that account end immediately.
The action is written to the audit log as `SUPERADMIN_RECOVERY`.

## Deploying
Run `npm run db:upgrade` once (it creates the `password_resets` table), then restart the backend.
Tests: `npm test` (code and password rules) and `node src/common/routes.test.js` (who may call which endpoint).
