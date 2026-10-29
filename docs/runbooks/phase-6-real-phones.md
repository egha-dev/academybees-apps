# Phase 6 exit gate: real-phone checklist (PO)

Part of the Phase 6 exit gate (IMPLEMENTATION_PLAN Phase 6): the Teacher PWA takes attendance on a real **Android phone (Chrome)** and a real **iPhone (Safari, installed to the Home Screen)** with **airplane mode** on. CI already proves the same flow on Chromium (desktop and Android emulation). This checklist covers what CI can't: real service workers on iOS, real storage and a real loss of network.

Use **staging** (`https://demo-a.staging.academybees.com`) once the S8 PR has deployed (every merge to `main` deploys, C-77). It takes about 30 minutes.

## You need

- One Android phone with Chrome and one iPhone with Safari (iOS 16.4 or later).
- The staging passwords from your password manager: `hello+a-admin` (or `hello+a-owner`) and `hello+teacher`. If they were never set, run **Actions → Staging bootstrap** first (`staging-variables.md` §I).
- A laptop for the admin side.

## 1. Set up a class (laptop, as admin) — once

Staging has academies and users but no students or batches.

1. Sign in at `https://demo-a.staging.academybees.com/login` as `hello+a-admin`.
2. **Students** → add **5 students** (any names).
3. **Batches** → new batch, e.g. "Phone test". Teacher: the `hello+teacher` teacher. Enrol the 5 students.
4. Give the batch **a class later today**: a weekly pattern that includes today's weekday, or an extra class from **Timetable**. Check **Timetable → Day** shows it.

## 2. Android (Chrome)

| # | Do | Pass when |
| --- | --- | --- |
| A1 | Open `https://demo-a.staging.academybees.com/login`, sign in as `hello+teacher` | Teacher **Today** opens: "Hello, …", the class is listed, and the status line says "All changes synced" |
| A2 | Chrome menu → **Add to Home screen / Install app**. Open AcademyBee from the home screen | It opens full-screen on Today |
| A3 | Tap the class → **Mark all present** → set one student to **Absent** → **Save attendance** | "Saved on this device. It syncs automatically." then "All changes synced" |
| A4 | Laptop: **Attendance** (today) | The class shows **Taken**; 4 present, 1 absent |
| A5 | Phone: turn on **airplane mode**. In the app, go to Classes → the class | The offline banner shows: "You're offline. Attendance will sync automatically when you're back online." The roll call still shows |
| A6 | Change a second student to **Late** → Save | "Saved on this device — 1 record waiting to sync" |
| A7 | Still offline: **close the app fully** (swipe it away), then open it from the home screen and go to the class | The app opens. The Late mark is still there and still waiting |
| A8 | Laptop: refresh Attendance | Still 4 present / 1 absent (nothing arrived yet) |
| A9 | Phone: turn airplane mode **off**. Bring the app to the front | Within about a minute: "All changes synced" |
| A10 | Laptop: refresh | 3 present, 1 absent, 1 late. Exactly one row per student; nothing doubled |
| A11 | Phone: airplane mode on → mark one more change → Save → **More → Sign out** | A warning that 1 record hasn't synced; **Stay** is the default. Tap Stay, turn airplane mode off, and wait for "All changes synced" |

## 3. iPhone (Safari, installed)

| # | Do | Pass when |
| --- | --- | --- |
| I1 | Safari → `https://demo-a.staging.academybees.com/login` → sign in as `hello+teacher` | Today opens with the class; "All changes synced" |
| I2 | Share → **Add to Home Screen**. Open AcademyBee from the Home Screen | It opens without Safari's bars. **Sign in again if asked**: the installed app has its own storage on iOS |
| I3 | Wait until Today shows the class and "All changes synced". Then visit Classes, the class, and back | Every screen loads once online (this caches them for offline) |
| I4 | Turn on **airplane mode**. Open the class | The offline banner shows; the roll call opens from the phone |
| I5 | Change one student (e.g. Present → Leave) → Save | "Saved on this device — 1 record waiting to sync" |
| I6 | Still offline: swipe the app away, open it again from the Home Screen, open the class | It opens offline; the change is still there and waiting |
| I7 | Airplane mode **off**, app in front | "All changes synced" within about a minute (iOS has no background sync: the app must be open) |
| I8 | Laptop: refresh Attendance | The change is there, once |
| I9 | Phone: **More → Sync** | "Nothing waiting. All changes synced." |

## 4. Optional: two devices disagree

1. With the Android phone in airplane mode, set student X to **Absent** and save.
2. On the laptop, open the class from **Attendance → Edit**, set the same student to **Late** and save.
3. Turn the phone back online.
4. **Pass:** the phone says **"1 item needs attention"**. **More → Sync** shows both values, with Keep mine or Keep theirs. Whichever you choose ends up on the laptop. Nothing changes silently.

## Report back

For each row, ✅ or ❌. For any ❌, send the phone model, OS version, browser version and a screenshot of the screen and its status line. Mention anything that felt slow or confusing even if it passed: the teacher phone flow is the product's core (UX §12).

Known limits, not failures:
- The first visit must be online (the phone downloads the teacher's classes).
- iOS only syncs while the app is open.
- Classes older than 7 days can't be edited from the phone (C-130, C-132).
