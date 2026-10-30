# ABC College – Campus Fix Portal

Anyone can raise a complaint. Only a logged-in admin can change its status (Pending / Scheduled / Solved), add an approximate fix time and a note. Every new complaint is emailed to the admin.

## Run it
1. Install Node.js 18+.
2. In this folder: `npm install`
3. Set the environment variables from `.env.example` (at minimum ADMIN_PASSWORD; add SMTP_USER + SMTP_PASS so emails are actually sent).
4. `npm start`, then open http://localhost:3000

Admin login: the "Admin login" button in the top menu (username/password come from ADMIN_USER / ADMIN_PASSWORD).

## Notes
- Complaints are saved in `data.json` next to server.js. Back it up, and use a host with a persistent disk (Render, Railway, a VPS).
- Without SMTP settings the email text is printed in the server console instead of being sent.
- Serve it over HTTPS in production so the admin cookie and password are protected.
