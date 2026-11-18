# BRACU Research Connect (Backend)

> **Express.js & MongoDB REST API powering BRACU Research Connect — handling users, groups, proposals, semesters, meetings, announcements, FAQs, arXiv paper search, and live BRACU CSE supervisor & synopsis syncing.**

🌐 **Live Frontend:** [https://brac-research-connect.vercel.app/](https://brac-research-connect.vercel.app/)  
🔗 **Live Backend API:** [https://bracu-research-server-teal.vercel.app/](https://bracu-research-server-teal.vercel.app/)

---

## Repositories

* **Frontend (Client):** [Akhlakur07/BRAC-Research-Connect](https://github.com/Akhlakur07/BRAC-Research-Connect)
* **Backend (Server):** [Akhlakur07/BRACU-Research-server](https://github.com/Akhlakur07/BRACU-Research-server)

---

## Core API Capabilities

* **Users & Profiles:** User registration, role-based queries (`student`, `supervisor`, `admin`), profile updates, notifications, and paper bookmarks.
* **Research Groups:** Group creation, member invitations, join requests, and semester capacity checks.
* **Thesis Proposals:** Proposal submission, supervisor & admin approval workflows, feedback threads, and semester assignment.
* **Semesters & Meetings:** Academic semester management (`spring`, `summer`, `fall`) and supervisor-group meeting scheduling.
* **Announcements & FAQs:** System-wide announcements and FAQ management.
* **arXiv Integration:** Live academic paper search and random paper suggestions via `axios` + `xml2js`.
* **Live BRACU CSE Directory Sync (Cached):**
  * `GET /bracu-supervisors` — Fetches & parses supervising faculty from `https://cse.bracu.ac.bd/thesis/supervising/list` (supports `?refresh=true`, 10-minute TTL cache).
  * `GET /synopses` & `GET /synopsis` — Fetches & parses thesis topic synopses from `https://cse.bracu.ac.bd/thesis/synopsis` (supports `?refresh=true`, 10-minute TTL cache).
  * `GET /synopsis/detail?url=...` — Fetches full details for a specific BRACU CSE synopsis page.

---

## Project Structure

```text
BRACU-Research-server/
├── index.js
├── package.json
├── package-lock.json
├── vercel.json
└── .gitignore
```

---

## Tech Stack

| Layer | Technologies |
| --- | --- |
| **Runtime & Framework** | Node.js, Express 5 (`express`) |
| **Database** | MongoDB Atlas (`mongodb` v6) |
| **HTTP & Parsing** | `axios`, `xml2js`, `cors`, `dotenv` |
| **Deployment** | Vercel (`@vercel/node` via `vercel.json`) |

---

## Local Setup

### 1. Clone the repository
```bash
git clone https://github.com/Akhlakur07/BRACU-Research-server.git
cd BRACU-Research-server
npm install
```

### 2. Configure environment variables (`.env`)
Create a `.env` file in the root directory:

```env
DB_USER=<your-mongodb-username>
DB_PASS=<your-mongodb-password>
PORT=3000
```

### 3. Run locally
```bash
npm start
```
The server starts on `http://localhost:3000`.

---

## Deployment

Both the backend and frontend are deployed on **Vercel** with continuous deployment from the `main` branch on GitHub:
* Serverless routing is configured in `vercel.json` forwarding all routes to `index.js` (`module.exports = app`).
* Set `DB_USER` and `DB_PASS` in the Vercel project's **Environment Variables** settings.

---

## License

This project is licensed under the **MIT License**.
