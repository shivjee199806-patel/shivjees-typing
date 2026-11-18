JP Typing — SEO landing page branding patch (17 changed files after applying)

IMPORTANT: This ZIP is a SAFE PATCH KIT, not a complete replacement website.
It contains 2 actual design assets and a script that modifies your EXISTING 15 HTML pages without deleting their articles.

HOW TO USE
1. Make a backup of your current project folder.
2. Download/unzip your current website source from GitHub to your computer.
3. Extract this ZIP somewhere.
4. On Windows, open Command Prompt in the extracted patch folder:
   py apply_branding.py "C:\path\to\your\website\repository"
   (The target must contain a public folder with all 15 HTML files.)
5. Check the 17 changed files. Preview locally before uploading.
6. Upload ONLY the changed files inside public/ to your existing source.

DO NOT upload the ZIP as a replacement of your whole Railway site.
DO NOT overwrite server.js, package.json, database, or app logic.
DO NOT merge an unrelated branch blindly; the live running commit may differ from main.

The script creates backups named .html.branding-backup before editing.
Original SEO article content and metadata are preserved.
