# ctfd-screenshot-challenges

A CTFd plugin that adds a **screenshot** challenge type where students upload images instead of text flags. Submissions receive optional partial credit immediately, with full points awarded after instructor review.

Built as a pure plugin — **no modifications to CTFd core**.

## Screenshots

### Add a screenshot challenge
![Add screenshot challenge](https://github.com/user-attachments/assets/77aa3f84-d61c-484f-9b19-8836e5de18bf)

### Approve or reject submissions
![Approve or reject submissions](https://github.com/user-attachments/assets/25ba1e25-bf65-40c9-8504-7c89320323de)

### Gallery / storage management
![Gallery](https://github.com/user-attachments/assets/7f77a397-f9ae-418b-8ec3-6813f2bf1f10)

### Student view — orange status for pending submissions
![User view - orange pending status](https://github.com/user-attachments/assets/53c12ccd-5a84-4436-ad71-33b8b06372cb)

## Why

Standard CTFd challenges require students to submit a text flag. But in teaching and training environments, instructors often need students to demonstrate their work visually — a terminal output, a completed exercise, a tool configuration, or a lab result. This plugin lets students submit screenshots as proof of work, with a built-in instructor review workflow.

## Features

### Screenshot Challenge Type

- Appears as **"screenshot"** in the challenge type dropdown when creating a new challenge
- Configurable per challenge:
  - **Full Value** — points awarded on instructor approval
  - **Submission Points** — partial credit awarded immediately on upload (can be 0)
  - **Allowed Extensions** — file types accepted (default: `png,jpg,jpeg,gif,bmp,webp`)
  - **Max File Size** — per-file upload limit (default: 10MB)

### Student Experience

- Challenge modal shows a **file upload input** instead of a text flag input
- Students select an image file and click **Submit Screenshot**
- On submission:
  - File is validated (extension, size) and uploaded
  - Partial credit is awarded immediately (if configured)
  - Student sees a green success message: *"Screenshot submitted! Partial credit (N pts) awarded. Awaiting instructor review."*
- Students can **resubmit** at any time — the new screenshot replaces the previous pending submission
- After rejection, students can submit a new screenshot
- After approval, the challenge shows as solved

### Orange "Pending" State on Challenge Board

Challenges with a pending screenshot submission show an **orange background** on the challenge board, giving students visual feedback that their submission is awaiting review:

| State | Color |
|-------|-------|
| Not attempted | Dark (default) |
| Pending review | **Orange** |
| Approved (solved) | Green |

This is implemented entirely via plugin CSS/JS injection — no core template modifications.

### Instructor Review Dashboard

Accessible via **"Screenshot Reviews"** in the admin navbar. Features:

- **Grouped by challenge** — submissions organized under challenge headers with category badges
- **Challenge descriptions** shown in group headers so reviewers know what to look for
- **Thumbnail previews** — click to view full-size in a modal
- **Per-submission actions** — Approve or Reject with optional comments
- **Batch approve** — "Approve All" button per challenge group for fast grading
- **Filters** — filter by status (pending/approved/rejected/all) and by specific challenge
- **Gallery / Storage tab**:
  - Storage dashboard showing total disk usage and breakdown by status
  - Thumbnail gallery of all uploaded files
  - Bulk select and delete files to reclaim disk space
  - Only reviewed (approved/rejected) files can be deleted; pending files are protected

### Scoring Flow

```
Student submits screenshot
  |
  +-- Partial credit Award created (if submission_points > 0)
  +-- ScreenshotSubmission record created (status: pending)
  +-- Submission record created (type: partial)
  |
  v
Instructor reviews
  |
  +-- APPROVE:
  |     +-- Solves record created (full challenge value)
  |     +-- Partial credit Award deleted
  |     +-- Original Submission marked as "discard"
  |     +-- Net: student score goes from submission_points -> challenge.value
  |
  +-- REJECT:
        +-- ScreenshotSubmission status set to "rejected"
        +-- Partial credit Award is KEPT
        +-- Student can resubmit a new screenshot
```

### Edge Cases Handled

- **Duplicate submissions** — resubmitting while pending replaces the old submission (old file and award cleaned up)
- **Already solved** — students cannot submit if they already have a Solve for the challenge
- **Resubmission after rejection** — allowed; creates a fresh pending submission
- **Team mode** — `team_id` set on all records; solve uniqueness checked per team
- **File validation** — server-side extension check against the challenge's allowed extensions list
- **Challenge deletion** — cascading cleanup of all ScreenshotSubmissions, uploaded files, and awards
- **Score caching** — scores update after Redis cache expiration or flush

## Installation

### Prerequisites

- A working CTFd instance (v3.x) — either Docker-based or bare-metal
- Access to the CTFd `plugins/` directory on the server filesystem
- Ability to restart CTFd after installing the plugin

### Step-by-step

1. **Locate your CTFd plugins directory.** This is at `CTFd/plugins/` relative to the CTFd project root. In a Docker deployment, the project root is typically mounted at `/opt/CTFd`.

   ```bash
   # Find the plugins directory
   # For Docker: check docker-compose.yml for the volume mount, typically:
   #   .:/opt/CTFd:ro
   # The plugins dir on the host would be: ./CTFd/plugins/

   # For bare-metal: it's wherever you cloned CTFd, e.g.:
   ls /path/to/CTFd/CTFd/plugins/
   # You should see existing plugins like: challenges/  dynamic_challenges/  flags/
   ```

2. **Clone this repository into the plugins directory.** The folder MUST be named `screenshot_challenges`:

   ```bash
   cd /path/to/CTFd/CTFd/plugins/
   git clone https://github.com/clearbluejar/ctfd-screenshot-challenges.git screenshot_challenges
   ```

   Or download and extract:
   ```bash
   cd /path/to/CTFd/CTFd/plugins/
   wget https://github.com/clearbluejar/ctfd-screenshot-challenges/archive/refs/heads/main.zip
   unzip main.zip
   mv ctfd-screenshot-challenges-main screenshot_challenges
   rm main.zip
   ```

3. **Verify the directory structure.** After installation, the layout should be:

   ```
   CTFd/plugins/screenshot_challenges/
   ├── __init__.py
   ├── routes.py
   ├── README.md
   ├── migrations/
   │   └── a1b2c3d4e5f6_initial_screenshot_challenges.py
   └── assets/
       ├── create.html
       ├── create.js
       ├── update.html
       ├── update.js
       ├── view.html
       ├── view.js
       ├── review.html
       ├── review.js
       ├── pending.js
       └── pending.css
   ```

   **Important:** The `__init__.py` must be directly inside `screenshot_challenges/`, not in a nested subdirectory.

4. **Restart CTFd.**

   ```bash
   # Docker Compose:
   docker compose restart ctfd

   # Or if running with Docker Compose and want to see logs:
   docker compose restart ctfd && docker compose logs -f ctfd

   # Bare-metal / systemd:
   sudo systemctl restart ctfd

   # Bare-metal / manual:
   # Stop the running CTFd process and start it again
   ```

5. **Verify the plugin loaded.** Check the CTFd startup logs for:

   ```
   * Loaded module, <module 'CTFd.plugins.screenshot_challenges' ...>
   ```

   If using Docker:
   ```bash
   docker compose logs ctfd | grep screenshot
   ```

6. **Verify in the UI:**
   - Log in as admin
   - Go to Admin Panel > Challenges > New Challenge
   - The challenge type dropdown should include **"screenshot"**
   - The admin navbar should show **"Screenshot Reviews"**

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Plugin not listed in challenge types | Check that the folder is named exactly `screenshot_challenges` and `__init__.py` exists at the top level |
| `ModuleNotFoundError` in logs | Ensure the directory structure matches step 3 above — no extra nesting |
| Tables not created (MySQL/MariaDB) | Check that the `migrations/` directory is included. The migration runs automatically on startup |
| Changes to plugin code not taking effect | Restart CTFd (`docker compose restart ctfd`). Gunicorn caches Python modules in memory |
| CSS/JS changes not taking effect | Hard-refresh the browser (`Cmd+Shift+R` or `Ctrl+Shift+R`) to bypass browser cache |
| `SAFE_MODE` is enabled | CTFd skips plugin loading in safe mode. Check your environment variables |

### Uninstalling

1. Remove the plugin directory:
   ```bash
   rm -rf /path/to/CTFd/CTFd/plugins/screenshot_challenges
   ```
2. Restart CTFd.
3. (Optional) The `screenshot_challenge` and `screenshot_submissions` database tables will remain but are inert. To remove them, drop them manually via your database client.

No additional Python dependencies beyond what CTFd already provides.

## Directory Structure

```
screenshot_challenges/
├── __init__.py                  # Models, challenge type class, load()
├── routes.py                    # Blueprint: submission, review, storage APIs
├── README.md
├── migrations/
│   └── a1b2c3d4e5f6_initial_screenshot_challenges.py
└── assets/
    ├── create.html              # Admin: challenge creation form
    ├── create.js
    ├── update.html              # Admin: challenge update form
    ├── update.js
    ├── view.html                # Student: file upload UI
    ├── view.js                  # Student: upload submission handler
    ├── review.html              # Admin: review dashboard page
    ├── review.js                # Admin: review, gallery, batch approve
    ├── pending.js               # Challenge board: orange pending state
    └── pending.css              # CSS for .challenge-pending
```

## Database

### `screenshot_challenge` table (extends `challenges`)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | FK -> challenges.id | Primary key (polymorphic) |
| `submission_points` | Integer (default 0) | Partial credit on submission |
| `allowed_extensions` | String | Comma-separated allowed file types |
| `max_file_size` | Integer (default 10485760) | Max upload size in bytes |

### `screenshot_submissions` table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | Integer PK | |
| `submission_id` | FK -> submissions.id | Links to CTFd Submission |
| `challenge_id` | FK -> challenges.id | |
| `user_id` | FK -> users.id | |
| `team_id` | FK -> teams.id (nullable) | |
| `file_location` | Text | Upload path |
| `status` | String | pending / approved / rejected |
| `award_id` | FK -> awards.id (nullable) | Partial credit award |
| `reviewer_id` | FK -> users.id (nullable) | |
| `review_date` | DateTime (nullable) | |
| `review_comment` | Text (nullable) | |
| `date` | DateTime | Submission timestamp |

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/plugins/screenshot_challenges/submit` | User | Upload screenshot |
| `GET` | `/plugins/screenshot_reviews` | Admin | Review dashboard HTML |
| `GET` | `/plugins/screenshot_challenges/api/reviews` | Admin | List submissions JSON |
| `POST` | `/plugins/screenshot_challenges/api/reviews/<id>/approve` | Admin | Approve submission |
| `POST` | `/plugins/screenshot_challenges/api/reviews/<id>/reject` | Admin | Reject submission |
| `GET` | `/plugins/screenshot_challenges/files/<path>` | Admin | Serve screenshot file |
| `GET` | `/plugins/screenshot_challenges/api/my-pending` | User | Current user's pending challenge IDs |
| `GET` | `/plugins/screenshot_challenges/api/storage` | Admin | Disk usage stats |
| `POST` | `/plugins/screenshot_challenges/api/bulk-delete` | Admin | Bulk delete files |

## Configuration

All configuration is per-challenge via the admin create/update forms:

| Setting | Default | Description |
|---------|---------|-------------|
| Full Value | (required) | Points awarded on approval |
| Submission Points | 0 | Partial credit on upload |
| Allowed Extensions | `png,jpg,jpeg,gif,bmp,webp` | Comma-separated |
| Max File Size | 10485760 (10MB) | In bytes |

## Storage

Uploaded screenshots are stored using CTFd's built-in upload system (filesystem or S3, depending on your `UPLOAD_PROVIDER` configuration). Files are placed in randomly-named subdirectories under the uploads folder.

To manage disk usage:
1. Go to the review dashboard
2. Click the **Gallery / Storage** tab
3. View total storage usage and breakdown by status
4. Select reviewed files and click **Delete Selected** to reclaim space

## Compatibility

- **CTFd 3.x** (tested with 3.8.3)
- **SQLite, MySQL/MariaDB, PostgreSQL**
- **Docker and bare-metal deployments**
- Works alongside all standard challenge types (standard, dynamic)

## License

Same as CTFd (Apache 2.0).
