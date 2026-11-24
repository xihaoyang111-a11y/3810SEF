# Lost Desk

A server-side lost-and-found desk for a campus. Staff sign in, log objects that were handed in, search the shelf when someone asks, mark a record claimed or cleared, and delete a mistaken entry. Each found object is one MongoDB document.

This project follows the COMP3810SEF group-project requirements: Express.js, Mongoose, login and logout, CRUD web pages for signed-in staff, and REST CRUD APIs.

Before you zip it, set the folder and zip name to your real project group, for example `comp3810sef_group3`. The copy here uses `comp3810sef_g42` because the class note says COMP3810 G42. Change that if the Google Sheet uses a different number. Do not include `node_modules`.

---

## 1. Project info

- **Project name:** Lost Desk
- **What it is for:** The shelf behind a campus lost-property counter. Staff record what was found (name, category, place, date, shelf spot, and a short description), then move the record through three states: stored, claimed, or cleared. The point is to return property, not to demo a generic booking form.

## 2. Group info

- **Group intro:** COMP 3810SEF, project group G42.

| Name | SID | Work role |
| --- | --- | --- |
| Chan Yan Shing | s1385703 | Express server, Mongoose models, session login, REST APIs |
| XI Haoyang | 13410235 | Server configuration, README setup guide, and local regression testing |
| XIE Tengyue | 13270086 | Personal Profile Module Development, EJS Page Design, and CSS Styling |
| _fill in_ | _fill in_ | Search filters, seed data, and manual testing |
| _fill in_ | _fill in_ | README, curl commands, and the 10-minute demo |
| _fill in_ | _fill in_ | _fill in_ |
| _fill in_ | _fill in_ | _fill in_ |

- **Workload division:** Replace the blank rows with the real members. Each person should be able to explain their part in the week-13 demo. A member with no real work is a free rider.

## 3. Project file intro

- **server.js:** Starts Express, connects to MongoDB, and seeds demo staff. Session login, logout, and registration. `requireLogin` blocks the desk pages. Web CRUD for lost items, plus status buttons (claimed / cleared / back to stored). REST API under `/api/items`. HTML forms use POST because a browser form cannot send PUT or DELETE. The API uses the real HTTP methods.
- **package.json:** `express` (web framework), `ejs` (templates), `mongoose` (MongoDB), `express-session` (login cookie), `bcryptjs` (password hashes), `dotenv` (loads local environment variables). `npm start` runs `node server.js`.
- **public:** `public/css/style.css` is the layout. `public/favicon.svg` is the tab icon.
- **views:** EJS templates.
  - `login.ejs`, `register.ejs` — sign in and register a student account
  - `list.ejs` — the shelf, counts, and the search form (Read)
  - `edit.ejs` plus `partials/item-form.ejs` — Create and Update
  - `details.ejs` — one item, with Edit, status buttons, and Delete
  - `message.ejs` — not found and errors
  - `partials/nav.ejs` — shelf link and the Log out button
- **models:**
  - `User.js` — username, display name, bcrypt password hash
  - `Item.js` — lost-property document and indexes
  - `itemRules.js` — categories, places, statuses, validation, search filter
  - `seed.js` — demo staff and sample items when the shelf is empty
- **.env.example:** Configuration template. Copy it to `.env` and fill in the settings locally.

### Item fields

| Field | Meaning |
| --- | --- |
| code | Reference number. The first letter is the category, then six digits, such as `K184206` for keys. The desk assigns it. It is not typed in. |
| name | What was found |
| category | electronics, wallet, keys, clothing, books, bottle, idcard, other |
| place | library, canteen, lecture, gym, gate, classroom, lounge, lab |
| campus | MC (Main Campus), JCC (Jockey Club Campus), or IOH (Jockey Club Institute of Healthcare) |
| status | stored, claimed, or disposed (shown as Cleared) |
| foundOn | The day it was handed in |
| spot | Shelf spot. Staff only. Students do not see it; they come to the counter and staff fetch the item after a short check. |
| description | Marks, contents, how the owner proved it (optional) |
| loggedBy | Staff or Student |

## 4. Operation guides

### Install and run

Run the following from the folder that contains `package.json` (Node.js 18 or newer).

```bash
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

In PowerShell, use `Copy-Item .env.example .env` for the copy step.

Set `MONGODB_URI` in `.env` to your group's Atlas connection string, including the
intended database name. Allow the demo computer's IP in Atlas Network Access.
Set `SESSION_SECRET` to the generated value. Keep it private and stable across
restarts. Replacing the previous signing key requires users to sign in again.
If a previous ZIP or commit contained a real Atlas password, have the database
owner rotate it and use the replacement in `.env`.

Run `npm start` and open `http://localhost:8099`. Expect a MongoDB connection
message followed by the listening URL. The server exits with the missing variable
names if required settings are blank or absent.

For an isolated test, start a local MongoDB instance and explicitly set
`MONGODB_URI=mongodb://127.0.0.1:27017/lostdesk_test` in your test configuration.
On startup, the server adds missing demo accounts and seeds sample items if the
item collection is empty. Run the login and CRUD steps below against the test
database. The application uses the configured database for the entire run.

### Verify setup

- Run `node --check server.js`. A successful syntax check produces no output.
- With neither required variable set in the shell or `.env`, `npm start` lists the
  missing settings and exits with code 1.
- With the test database configured, open `/desk` while signed out. It redirects
  to `/login`. Sign in as staff to create and manage a test item. Sign in as a
  student to verify that the desk shows only stored items and blocks `/desk/new`.
  After signing out, `/desk` redirects to `/login` again.
- Use the REST examples below on the test database. Expect HTTP 201 for POST,
  HTTP 200 for GET, PUT and DELETE, and HTTP 404 when reading a deleted item.
  Use the code returned by POST for the update and delete requests.

For the class demo, set `MONGODB_URI` to the team's Atlas database in the
actual Ubuntu or cloud environment and rehearse the web and API flows there.
Use disposable records for the create, update, and delete demonstrations.

### Use of Login / Logout pages

The following seeded accounts are for the class demo and local testing.

| Who | Username | Password | What they can do |
| --- | --- | --- | --- |
| Student | s1385703 | test123 | After sign-in, the waiting list only. No create, edit, or delete. |
| Staff | admin | admin123 | Admin desk: log, search, update, claim, clear, delete. |

The sign-in page is one form. The server reads the account role and opens either the admin desk or the student panel. There is no separate student login page, and the page does not list these accounts.

Student sign-up (link under the form):

- Username must be a student ID: `s` plus 7 digits, such as `s1234567`.
- Password must contain at least one English letter and at least three digits, such as `test123`.
- Sign-up always creates a student. Staff accounts are only the seeded ones above.

Sign-in steps:

1. Open `http://localhost:8099/login`.
2. Enter a username and password and press **Sign in**.
3. A student sees items still waiting, the claim counter (Student Union Activity Room / 學生會活動室), and how to hand an item in or ask the desk to collect it.
4. Staff see the full desk, including **Log item**.
5. A student who opens Log item, Edit, or Delete is sent back to the waiting list.
6. **Log out** is on every signed-in page (POST `/logout`).

### Use of the CRUD web pages

All of these need a login.

| Action | Where | What to press |
| --- | --- | --- |
| Read / search | Shelf (`/desk`) | Four conditions: **name or note**, **category**, **found at**, and **status**. Press **Search**. **Clear** resets them. Counts are for the whole shelf. "Showing X of Y" is the filter result. Open a card for one item. |
| Create | **Log item** | Fill in the form and press **Save record**. The desk assigns the reference number. There is no tag-code box. Required: name, category, campus, place, status, date found. |
| Update | Item page → **Edit** | Change the fields and press **Update record**. Or use **Mark claimed**, **Clear from shelf**, or **Put back in storage** to change only the status. |
| Delete | Item page → **Delete** | Confirm the dialog. The document is removed. |
| Log out | Top bar → **Log out** | Ends the session. |

Suggested click-through. Do not delete `K184206` (the house keys) if you still need the curl demo.

1. Sign in as admin.
2. Search category **Electronics** and status **Stored**. AirPods case, calculator, and charger should remain.
3. Search status **Claimed**. The hoodie, student card, and earring should remain.
4. Log item: name `Black cap`, place Library, status Stored. Save.
5. Open it, **Edit** the description, then **Mark claimed**.
6. Delete that new item, not a seeded one.
7. Log out and show that `/desk` returns you to sign-in.

### Cover photos and staff pages

Staff can optionally add one JPEG, PNG, or WebP photo (up to 2 MB) when
logging or editing an item. Photos are stored with the item in MongoDB and
appear on the student cards and the staff item table. An older item without a
photo shows its category instead. Students can use category shortcuts and
view photos only while the item is awaiting collection.

The staff sidebar links to **Items**, **Users**, and **Categories**. Items
supports the existing search and editing workflow. Users lists accounts by
name and role. Categories lists the current catalogue and item counts, with
links to filter the list. Account and category definitions are read-only in
these screens.

### Use of the RESTful CRUD services

No login is required. The commands assume port **8099**. Paste them into column K of the presentation sheet before class. Do not type them live.

| Action | HTTP | URI |
| --- | --- | --- |
| Read many / search | GET | `/api/items` |
| Read one | GET | `/api/items/:code` |
| Create | POST | `/api/items` |
| Update | PUT | `/api/items/:code` |
| Delete | DELETE | `/api/items/:code` |

Search parameters, same meaning as the web form: `q`, `category`, `place`, `status` (`stored`, `claimed`, or `disposed`).

```bash
# READ many
curl -s http://localhost:8099/api/items

# READ with two conditions: electronics still stored
curl -s "http://localhost:8099/api/items?category=electronics&status=stored"

# READ one seeded item. K184206 is the house keys.
curl -s http://localhost:8099/api/items/K184206

# CREATE. Do not send a code. The server assigns a letter plus six digits.
curl -s -X POST http://localhost:8099/api/items \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Black cap\",\"category\":\"clothing\",\"place\":\"library\",\"campus\":\"MC\",\"status\":\"stored\",\"foundOn\":\"2026-11-05\",\"spot\":\"Bin B3\",\"description\":\"No name inside\"}"

# Copy the "code" from that response, then UPDATE and DELETE it.
# Clothing starts with C, so the code looks like C482910.
curl -s -X PUT http://localhost:8099/api/items/C482910 \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"claimed\",\"description\":\"Owner collected it at the desk\"}"

curl -s -X DELETE http://localhost:8099/api/items/C482910

# READ the deleted code. Replace C482910 with the code from POST. Expect HTTP 404.
curl -i http://localhost:8099/api/items/C482910

# Confirm the seeded item still exists. Expect HTTP 200.
curl -s http://localhost:8099/api/items/K184206
```

A bad body returns 400. An unknown code returns 404.

### Submission checklist

- Exclude `node_modules` from the submission ZIP.
- Exclude `.env` and any legacy `atlas.local.json` from the submission ZIP. Include `.env.example`.
- Zip name: `comp3810sef_groupNo.zip`, containing that same folder name.
- Deadline: 23:59, 30 Nov 2026. Submit a day early if you can.
- Register the presentation slot by 23:59, 16 Nov 2026.
- Paste the curl block into column K before class.
