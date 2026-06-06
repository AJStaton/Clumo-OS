# Release Smoke Test — Clumo OS

A ~10-minute manual checklist a human runs on a freshly-built installer **before every release**. Automated tests cover units, components, recorded HTTP responses, and the Electron boot path, but no automation can verify the full path from "downloaded the .exe / .dmg" → "live Teams call produces a real suggestion" → "exported session is on disk." This checklist closes that gap.

> **Owner:** the release manager for the build. Sign at the bottom with date + commit SHA before shipping. If any step fails, the release does not go out — file a finding and rebuild.

---

## 0. Pre-flight (30 s)

- [ ] You have a clean macOS or Windows machine (or a fresh user profile) — **no prior Clumo install**, no `clumo.key` / `data/` directory lingering from a dev session
- [ ] You have a Teams (or Zoom/Meet) meeting URL ready, joined from a **second device** so you can speak into it and hear yourself back
- [ ] On macOS, BlackHole (or another virtual audio driver) is installed so system audio can be captured
- [ ] You have a valid **BYOK** Azure OpenAI or OpenAI API key handy (managed mode is fine too once that pathway is live)

---

## 1. Fresh install (1 min)

- [ ] Double-click the installer produced by `electron/dist/` (`Clumo Setup *.exe` or `Clumo-*.dmg`)
- [ ] App launches without an OS smartscreen / Gatekeeper block beyond the expected first-run prompt
- [ ] Main window opens at the Setup wizard, **not** at a blank/white screen
- [ ] No red error banner, no "server failed to start" message
- [ ] Open DevTools (View → Toggle Developer Tools or `Ctrl+Shift+I`). **Console must be free of red errors.** Yellow warnings are acceptable.

---

## 2. Setup wizard (2 min)

- [ ] Step 1 shows the **Managed / BYOK** toggle at the top
- [ ] Select **BYOK** → Azure (or OpenAI) form appears
- [ ] Paste endpoint + key + deployment names → click **Test connection** → green "Connected" state appears within ~5 s
- [ ] Click **Save & continue** → moves to Step 2 (Knowledge Base onboarding)
- [ ] Step 2: click the prominent **Choose Files** button → file picker opens → pick 1–2 small PDFs or `.md` files → upload succeeds
- [ ] KB generation progress streams (you see SSE log lines / a progress bar) → finishes with a non-zero count of items
- [ ] Wizard completes → lands on `/session` (Session page) with the nav showing **Session · History · Knowledge Base · Settings**

---

## 3. Live call with real Teams audio (4 min)

- [ ] Join your pre-staged Teams meeting from the second device. Make sure that device's audio is **playing through your machine's speakers** so the desktopCapturer can pick it up (on macOS this means routing through BlackHole; on Windows the loopback is automatic).
- [ ] In Clumo, on the Session page, the AudioSourcePicker shows **Microsoft Teams** as a detected meeting card (or "Entire Screen" as the fallback)
- [ ] Click **Start Call** → status changes to "Listening" / equivalent
- [ ] On the second device, speak (or play back) for ~30–60 s — say something that maps to a KB item you uploaded (e.g. mention a competitor, a price objection, a feature on your product-truth list)
- [ ] **Within 60 s, at least one suggestion card appears** in the Session view. It must:
  - [ ] Have a non-empty title and body
  - [ ] Show a countdown timer that decrements
  - [ ] Be categorized (objection / product truth / case study / etc.)
- [ ] Transcript pane shows live text appearing as you speak (not blank, not stuck on one chunk)
- [ ] MEDDPICC scorecard populates at least one field
- [ ] Click **End Call** → call finishes cleanly → post-call analysis kicks off (loading state visible) → completes with CRM Update, Next Meeting, and Follow-up Email sections rendered

---

## 4. Export the session (1 min)

- [ ] Navigate to **History**
- [ ] The just-finished session appears at the top of the list with an **Analyzed** badge
- [ ] Click into it → Session detail page renders Session Notes, transcript, MEDDPICC table, follow-up email
- [ ] Click **Export** (or equivalent download button)
- [ ] A file lands in your Downloads folder. Open it. Verify:
  - [ ] **Transcript section is not empty** (regression guard for finding F-13)
  - [ ] MEDDPICC scores are present
  - [ ] Follow-up email body is present
  - [ ] No `[object Object]`, no `undefined`, no `null` placeholders

---

## 5. Restart resilience (1 min)

- [ ] Close Clumo entirely (Cmd/Ctrl+Q, not just window close)
- [ ] Reopen the app
- [ ] Lands directly on Session page (setup is not re-prompted)
- [ ] History still shows the session you just ran
- [ ] Settings → AI Models shows your provider configured, **but the API key field is empty / masked** (regression guard for the BYOK-encryption invariant — keys must never be readable back)

---

## 6. Sign-off

```
Tester:              ____________________
Date:                ____________________
Commit SHA tested:   ____________________
Installer build:     ____________________ (e.g. Clumo Setup 1.4.2.exe)
OS / version:        ____________________
Result:              ☐ PASS    ☐ FAIL (file a finding, do not ship)
Notes:
```

---

## If something fails

1. **Do not ship.** Cut a finding in `QA-REPORT.md` using the existing severity scale (`CRIT` / `HIGH` / `MED` / `LOW` / `COSM`) and assign an `F-NN` ID.
2. Capture DevTools console output and the contents of `<userData>/clumo-electron/logs/` if relevant.
3. If the failure happened in the **realtime/transcript** path, also run `npm run test:realtime --workspace=server` against the same Azure deployment — that test catches API-shape regressions and will tell you whether the break is in the provider integration or in Clumo's UI/state layer.
4. Re-run this entire checklist after the fix lands. Partial re-runs hide cascading regressions.

---

**Last revised:** 2026-05 release cycle. Owner of this document: the on-call release manager.
