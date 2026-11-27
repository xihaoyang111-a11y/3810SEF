# Lost Desk

A web-based lost-and-found application for a campus. Staff sign in, log items that were handed in, search the shelf, mark a record claimed or cleared, and delete a mistaken entry. Students sign in to see what is still waiting, and they can report something they found. Each found object is one MongoDB document.

This project follows the COMP3810SEF group-project requirements: Express.js, Mongoose, login and logout, CRUD web pages for signed-in users, and REST CRUD APIs.

---

## 1. Project info

- **Project name:** Lost Desk
- **What it is for:** The counter at the Student Union Activity Room (學生會活動室), G/F, Campus Centre. Open Monday to Friday, 10:00–18:00. Phone 5406 4218. Email hkmulostdesk@gmail.com.
- Staff record what was found, then move the record through three states: stored, claimed, or cleared. A student report stays off the waiting list until staff check the item in and give it a real shelf spot.

## 2. Group info

- **Group:** COMP 3810SEF, project group G42.

| Name | SID | Work role |
| --- | --- | --- |
| Chan Yan Shing | s1385703 | System implementation and validation: Express server, Mongoose models, the application foundation, the database, the REST APIs, and the API demo |
| XI Haoyang | 13410235 | Server configuration, README setup guide, and local regression testing |
| He Junru | 13395307 | EJS pages and CSS |
| XIE Tengyue | 13270086 | Personal profile pages, EJS page design, and CSS |
| Chan Pak Hei | 14601418 | Student "Report found item" with staff check-in, the staff Analytics page (MongoDB aggregation), and the 10-minute demo |
| SONG Zhaohe | 13407624 | Staff CSV export, filtered-download UI, and export regression tests |

## 3. Project file intro

- **server.js:** Starts Express on port 8099, connects to MongoDB, and seeds the desk when it is empty. Session login, logout, student registration, profile, and password change. `requireLogin`, `requireStaff`, and `requireStudent` protect the pages. Web CRUD for lost items, status buttons, student reports, cover photos, analytics, and **Reset database**. REST API under `/api/items`. HTML forms use POST because a browser form cannot send PUT or DELETE. The API uses the real HTTP methods.
- **package.json:** `express`, `ejs`, `mongoose`, `express-session`, `bcryptjs`, `multer` (cover photos), and `mongodb-memory-server` (fallback only). `npm start` runs `node server.js`. Node.js 18 or newer.
- **public:** `public/css/style.css` is the layout. `public/favicon.svg` is the tab icon. `public/icons/user.svg` is the profile icon. `public/js/cover-preview.js` previews a chosen photo.
- **views:** EJS templates.
  - `login.ejs`, `register.ejs` — one sign-in page, and student sign-up
  - `list.ejs` — staff item table, or the student waiting cards, plus search
  - `edit.ejs` and `partials/item-form.ejs` — staff Create and Update, including the cover photo
  - `details.ejs` — one item, with Edit, status buttons, and Delete for staff
  - `report.ejs` — a student reports an item they found
  - `analytics.ejs` — staff counts from MongoDB aggregation
  - `profile.ejs` — display name, email, phone, and password
  - `message.ejs` — not found and errors
  - `partials/nav.ejs` — Items or Browse items, Analytics for staff, My profile, Log out
  - `partials/contact.ejs` — claim counter and phone
  - `partials/reset.ejs` — **Reset database**, shown on the sign-in page only
- **models:**
  - `User.js` — username, display name, email, phone, role, bcrypt password hash
  - `Item.js` — lost-property document, cover photo, and indexes
  - `itemRules.js` — categories, campuses, places, statuses, validation, and the search filter
  - `seed.js` — creates the demo staff and student accounts, and the 12 sample items, only when that data is missing
  - `baseline.json` — the snapshot **Reset database** restores
  - `coverUpload.js` — checks a JPEG, PNG, or WebP upload, 2 MB maximum
  - `sampleCovers.js` and `sample-photos/` — the photos on the seeded items
- **demo-curl_updated.bat:** The six REST calls for the class demo. Run it in Command Prompt, not Bash. The first line should say `Script version: windows-cmd-11`.
- **atlas.example.json:** Optional override template. The running application does not need this file.

### Item fields

| Field | Meaning |
| --- | --- |
| code | Reference number. The first letter is the category, then six digits, such as `K184206` for keys. The server assigns it. It is not typed in. Books and bottles both start with B. |
| name | What was found |
| category | electronics, wallet, keys, clothing, books, bottle, idcard, other |
| place | library, canteen, lecture, gym, gate, classroom, lounge, lab |
| campus | MC (Main Campus), JCC (Jockey Club Campus), or IOH (Jockey Club Institute of Healthcare) |
| status | stored, claimed, or disposed (shown as Cleared) |
| foundOn | The day it was found |
| spot | Shelf spot. Staff only. A student report uses `Pending Inspection` until staff type the real spot. Students never see the spot. |
| description | Marks, contents, or how the owner proved it. Optional. |
| loggedBy | Staff or Student |
| reportedBy | The student ID that sent a report. Staff-logged items say Staff. |
| reporterContact | Optional email or phone from the report form. Staff only. The REST API does not return it. |
| cover | Optional JPEG, PNG, or WebP, stored in MongoDB. An item without a photo shows its category name. |

## 4. Operation guides

### Install and run

From the folder that contains `package.json`:

```bash
npm install
npm start
```

Open `http://localhost:8099`. The server listens on port 8099.

Database, first match wins:

1. `MONGODB_URI` in the environment, if it is set
2. `atlas.local.json` in the project folder, if that file exists
3. the Atlas address built into `server.js`, so a normal `npm start` needs no extra setup
4. if none of those can connect, an in-memory MongoDB for this run only. That copy is empty of the class data and disappears when the server stops.

Do not commit `atlas.local.json`. It is listed in `.gitignore`.

### Verify setup

- Run `node --check server.js`. A successful syntax check produces no output.
- Open `/desk` while signed out. It redirects to `/login`.
- Sign in as staff and create a test item. Sign in as a student and confirm `/desk/new` is refused.
- After **Log out**, `/desk` redirects to `/login` again.
- The REST examples below need no login. Expect HTTP 201 for POST, HTTP 200 for a found item, and HTTP 404 after that item is deleted.

### Sign in, sign up, and log out

The sign-in page is one form. The server reads the account role and opens either the staff desk or the student waiting list. The page does not list the demo accounts.

| Who | Username | Password | What they can do |
| --- | --- | --- | --- |
| Staff | admin | admin123 | Log, search, update, claim, clear, delete, analytics, and check-in |
| Student | s1385703 | test123 | Waiting list, item details, and Report found item. No create, edit, or delete on the staff form. |

**Reset database**, at the bottom of the sign-in page, restores the saved accounts and the 12 sample items, then signs everyone out. Press it before a demo if practice data is still in MongoDB. Do not press it during the demonstration.

Student sign-up, from the link under the form:

- Username must be a student ID: `s` plus 7 digits, such as `s2345678`.
- Password needs at least one English letter and at least three digits, such as `test123`.
- The two password boxes must match.
- Sign-up always creates a student. It cannot create a staff account.
- A bad student ID says `Student ID must look like s1234567.`
- Different passwords say `The two passwords do not match.`
- A used ID says `That student ID is already registered.`
- A successful sign-up returns to Sign in with `Account created. Sign in to see what is waiting.`

Sign-in failures are different on purpose:

- Unknown username: `No account uses that username.`
- Wrong password: `Password is not right.`

**My profile** can change the display name, email, and phone, and can change the password. The username does not change.

**Log out** is on every signed-in page.

### Staff desk

| Action | Where | What to press |
| --- | --- | --- |
| Read / search | Items (`/desk`) | Name or reference, category, found at, campus, and status. **Search** applies them. **Clear** resets them. |
| Create | **Log item** | Name, category, campus, found at, status, date, logged by, optional shelf spot, description, and optional cover photo. **Save record**. There is no reference-number box. |
| Update | **Edit** or **Check in** | Change the fields and press **Update record**. Or use **Mark claimed**, **Clear from shelf**, or **Put back in storage**. |
| Delete | Item page → **Delete** | Confirm the dialog. Only that document is removed. |
| Check in | A row marked **Needs check-in** | **Check in**, replace `Pending Inspection` with the real shelf spot, and save. Students can then see it. |
| Analytics | **Analytics** | Counts are calculated in MongoDB with aggregation. **View as JSON** opens `/api/analytics`. |

Do not delete `K184206` (House keys). The API demo still reads it.

Suggested click-through:

1. Sign in as `admin` / `admin123`.
2. Search category **Electronics** and status **Stored**. The AirPods case, USB-C charger, and Casio calculator remain.
3. Open House keys. The reference starts with K. The shelf spot is visible.
4. Log a new item named `Black cap`, category Clothing, campus MC, found at Library. Save, edit the description, then delete that new record.
5. Log out.

### Student pages

A student only sees items that are still stored and already checked in. Shelf spot, reporter contact, Edit, and Delete are hidden. The card says to claim the item at the Student Union Activity Room.

**Report found item** asks for the name, category, campus, place, date, optional details, and an optional email or phone. The server sets the status to stored, logged by Student, and the shelf spot to `Pending Inspection`. The item is not on the waiting list until staff check it in.

### Cover photos

Staff can add one JPEG, PNG, or WebP photo, up to 2 MB, when logging or editing an item. The twelve sample items already have photos. A student sees a photo only while the item is waiting to be claimed.

### REST API

No login is required. The commands assume port **8099**. The prepared file `demo-curl_updated.bat` runs these six calls. Do not type them live.

Replace `Cxxxxxx` with the reference returned by the POST.

```bash
# 1. READ one lost item: House keys
curl -X GET http://localhost:8099/api/items/K184206

# 2. READ search: stored electronics
curl -X GET "http://localhost:8099/api/items?category=electronics&status=stored"

# 3. CREATE a new lost item: Black cap. Do not send a reference number.
curl -X POST -H "Content-Type: application/json" \
  --data '{"name":"Black cap","category":"clothing","place":"library","campus":"MC","status":"stored","foundOn":"2026-11-19","spot":"Bin B3","description":"No name inside"}' \
  http://localhost:8099/api/items

# 4. UPDATE that Black cap
curl -X PUT -H "Content-Type: application/json" \
  --data '{"status":"claimed","description":"Owner collected it at the desk"}' \
  http://localhost:8099/api/items/Cxxxxxx

# 5. DELETE that Black cap
curl -X DELETE http://localhost:8099/api/items/Cxxxxxx

# 6. READ the deleted code (expect 404), then House keys (expect 200)
curl -X GET http://localhost:8099/api/items/Cxxxxxx
curl -X GET http://localhost:8099/api/items/K184206
```

Search parameters are `q`, `category`, `place`, `campus`, and `status`. A bad body returns 400. An unknown code returns 404. `/api/analytics` returns the same aggregation numbers as the staff page, and it also needs no login.
