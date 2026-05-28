# Bookkeep

A mobile-first, self-hosted book tracker and personal notes app. No backend. Your data lives in a private GitHub repo you own. The app is a static site served from GitHub Pages.

---

## How it works

| Repo | Visibility | Purpose |
|------|-----------|---------|
| **App repo** (e.g. `you/bookkeep`) | Public | Static site (HTML/CSS/JS only). No data. |
| **Data repo** (e.g. `you/my-shelf`) | Private | All books, notes, images. |

The app reads and writes the data repo at runtime via the GitHub REST API using a Personal Access Token (PAT) you paste into Settings. The token is stored only in your browser's `localStorage`. It is never committed or sent anywhere except to `api.github.com`.

---

## Setup

### 1. Create the data repo

1. Go to [github.com/new](https://github.com/new).
2. Name it something like `my-shelf`. Set it to **Private**.
3. Initialize with a README (so the default branch exists).

### 2. Seed the data repo

Create a file called `books.json` at the root of your data repo with this content:

```json
{ "books": [] }
```

You can do this through the GitHub web UI (click **Add file → Create new file**). This file must exist before the app can load your shelf.

### 3. Create a fine-grained Personal Access Token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Click **Generate new token**.
3. Set **Resource owner** to your account (or the org that owns the data repo).
4. Under **Repository access**, choose **Only select repositories** and pick your data repo.
5. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**.
6. Everything else: No access.
7. Generate and copy the token. You won't see it again.

### 4. Deploy the app to GitHub Pages

1. Fork or push this repo to your GitHub account as a **public** repo.
2. Go to **Settings → Pages**, set Source to **Deploy from a branch**, branch `main`, folder `/` (root).
3. GitHub Pages will give you a URL like `https://you.github.io/bookkeep/`.

### 5. First-run setup

1. Open the app URL.
2. You'll land on the **Settings** screen.
3. Fill in:
   - **Owner**: your GitHub username (or org name)
   - **Repository name**: your data repo name (e.g. `my-shelf`)
   - **PAT**: the token you generated in step 3
4. Tap **Save & Validate**. You should see a green confirmation.
5. You're ready. Tap **Shelf** to start adding books.

---

## Data format

### `books.json` (index, in data repo root)

Fast-loading index used for the shelf view. Updated automatically on every add/edit.

```json
{
  "books": [
    {
      "slug": "the-pragmatic-programmer-a1b2",
      "title": "The Pragmatic Programmer",
      "author": "Andrew Hunt, David Thomas",
      "isbn": "9780135957059",
      "format": "paper",
      "status": "reading",
      "progress_unit": "pages",
      "total_pages": 352,
      "current_page": 120,
      "cover_thumb": "books/the-pragmatic-programmer-a1b2/cover-thumb.jpg",
      "started_date": "2026-05-01",
      "finished_date": null,
      "added_date": "2026-04-28",
      "updated_date": "2026-05-20"
    }
  ]
}
```

### `books/<slug>/notes.md` (per-book, portable)

YAML frontmatter + Markdown body. Fully readable in Obsidian or any Markdown editor without the app.

```
---
title: "The Pragmatic Programmer"
author: "Andrew Hunt, David Thomas"
status: reading
...
highlights:
  - id: "h-1715000000000"
    image: "books/.../highlights/h-1715000000000-2000.jpg"
    thumb:  "books/.../highlights/h-1715000000000-thumb.jpg"
    caption: "DRY principle"
    added_date: "2026-05-10"
---

# My Notes

Markdown goes here...
```

### Image files

```
books/<slug>/
  cover.jpg          ← 2000px max, JPEG
  cover-thumb.jpg    ← 400px max, JPEG
  highlights/
    <id>-2000.jpg
    <id>-thumb.jpg
```

Originals are never stored. The app compresses everything client-side before upload.

---

## Importing from Goodreads

1. On Goodreads, go to **My Books → Import and Export → Export Library**. Goodreads will email you (or prompt you to download) a file called `goodreads_library_export.csv`.
2. In Bookkeep, open **Settings** and scroll to **Import from Goodreads**.
3. Tap **Choose CSV file…** and select the exported file.
4. Tap **Import** and confirm. The app will show `Importing X / Y…` progress as it creates each book entry.

**What gets imported:**

| Goodreads field | Bookkeep field |
|---|---|
| Title | title |
| Author | author |
| ISBN13 | isbn |
| Binding | format (Paperback → paper, Hardcover → hardcover, Kindle → ebook) |
| Number of Pages | total\_pages |
| Exclusive Shelf (`read` / `currently-reading` / `to-read`) | status |
| Date Read | finished\_date |
| Date Added | added\_date |
| My Review | notes body |

Covers are not imported — add them individually after import via the book detail screen.

Import is sequential (one GitHub API call per book), so a large library (200+ books) may take a few minutes. Do not close the tab while it runs.

---

## Recovering from index drift

If `books.json` ever gets out of sync with the per-book `notes.md` files (e.g. after a manual edit), go to **Settings → Rebuild books.json from notes**. The app will scan every `notes.md`, parse the frontmatter, and rewrite `books.json` from scratch. The notes files are always the authoritative source of truth.

---

## Tech stack

- Vanilla HTML / CSS / JS (no build step, no framework)
- [Tailwind CSS](https://tailwindcss.com) (CDN)
- [marked.js](https://marked.js.org): Markdown rendering
- [js-yaml](https://github.com/nodeca/js-yaml): YAML frontmatter parsing
- [browser-image-compression](https://github.com/Donaldcwl/browser-image-compression): client-side image optimization
- GitHub REST API: all data storage
