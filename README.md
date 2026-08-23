# Rooted in 40 — The Rooted Woman Method

A coaching and personal training web app for the Rooted in 40 programme, built for coach Shadey Figaroa.

## What it is

A single-page workbook and sales site for a 40-day women's coaching programme. Clients get a personal access code from Shadey after payment, which unlocks their full workbook, intake questionnaire, and nutrition guide.

## Folder structure

```
RootedWoman/
├── index.html       # Main client app (workbook + sales page)
├── style.css        # All styles
├── script.js        # All JavaScript (Firebase sync, paywall, autosave)
├── coach.html       # Coach dashboard (login: SHADEY2025)
├── .gitignore
└── README.md
```

## Pages

| Page | Access |
|------|--------|
| Overview | Free (no code needed) |
| About Rooted in 40 | Free |
| Client Intake | Requires access code |
| Layer 1 — Identity | Requires access code |
| Layer 2 — Rhythm | Requires access code |
| Layer 3 — Recovery | Requires access code |
| 90-Day Check-ins | Requires access code |
| Nutrition Guide | Requires access code |

## Access codes

- Default code: `ROOTED40` (for testing)
- Per-client codes: created in `coach.html` → Access Codes

## Deployment

Hosted on GitHub Pages. Push to `main` branch — the site updates automatically within ~1 minute.

Live URL: https://butterszzz-art.github.io/RootedWoman/

## Firebase

Uses Firebase Realtime Database (`rooted-in-40`) for:
- Client data sync
- Coach-to-client messaging
- Programme assignments
- Per-client access code management

## Coach dashboard

Open `coach.html` in any browser. Default password: `SHADEY2025`. Change it in Settings on first login.
