# Implementation Plan — Doctor Report Dynamic Data Update & Download Fix

**System:** IV SENTRY PRO™ Clinical Infusion Telemetry Workstation  
**Hardware & Subsystem:** Web Telemetry Dashboard (`app.js`, `frontend/app.js`, `index.html`, `frontend/index.html`)  
**Goal:** Guarantee that all Doctor's Report views and downloads (Text file download, PDF print, copy summary, report modal view) dynamically refresh and export 100% accurate, up-to-date session values (Patient Demographics, Vitals, Start/End Timestamps, Elapsed Duration, Injected Volume, Residual Volume, Average Flow Rate, AI Prescriptions, and Pin D3 Audit Milestones).

---

## 1. Problem Analysis & Root Cause

1. **Static Data Freeze on `tripCompleted`**:
   - `completeInfusionSession()` previously checked `if (state.tripCompleted) return;`. Once `state.tripCompleted` was set to `true` (e.g. when level hit `< 10%`), any subsequent attempt to refresh the report (or click "View Doctor's Report" / "Download (.txt)") returned immediately without re-calculating or updating the DOM elements with updated inputs, vitals, or end times.
2. **Disconnected Report Data Pipeline**:
   - `downloadDoctorReportText()` depended on reading pre-rendered DOM elements (e.g., `#rep-time-duration`, `#rep-saline-injected`). If those DOM elements were stale or unpopulated, the downloaded `.txt` file contained default placeholders (`—`, `00:00:00`).
3. **Milestone Audit Table Synchronization**:
   - The D3 buzzer audit milestone table rows (`90%`, `75%`, `65%`, `50%`, `35%`, `25%`, `< 10%`) were not explicitly re-synced during report generation, leaving milestone trigger times unpopulated.

---

## 2. Proposed Architecture & Solution

### A. Dedicated `updateDoctorReportData()` Function
Create a unified, robust data binding function `updateDoctorReportData()` in both `frontend/app.js` and `app.js` that:
- Reads live inputs: Patient Name, MRN/ID, Age, Bed/Room, Attending Staff, Solution Type, Prescribed Volume, Vitals (HR, RR, Systolic BP, Diastolic BP), and Clinical Notes.
- Calculates precise session metrics:
  - **Start Time**: `state.sessionStart` (or formatted start timestamp).
  - **End Time**: `state.sessionEnd` (or current `new Date()`).
  - **Elapsed Duration**: `state.elapsed` (or computed difference `sessionEnd - sessionStart`).
  - **Injected & Residual Volumetrics**: `injectedVol = (pVol * (injectedPct / 100)).toFixed(1)`, `residualVol = (pVol - injectedVol).toFixed(1)`.
  - **Average Flow Rate**: `avgFlowRate = (injectedVol / durationHours).toFixed(1)`.
  - **Outcome Banner**: `RESERVOIR DEPLETED (< 10%) — HALTED SAFELY FOR BAG REPLACEMENT` if `level < 10%`, `TRIP COMPLETED` if `>= 95%`, or `PARTIAL DELIVERY`.
- Populates all DOM elements (`rep-id`, `rep-timestamp`, `rep-patient-name`, `rep-patient-id`, `rep-patient-age`, `rep-patient-bed`, `rep-patient-attender`, `rep-admission-time`, `rep-vitals-hr`, `rep-vitals-rr`, `rep-vitals-bp`, `rep-vitals-hemo`, `rep-solution-type`, `rep-target-volume`, `rep-ai-prescribed-flow`, `rep-weight-envelope`, `rep-clinical-notes`, `rep-saline-injected`, `rep-saline-mass`, `rep-saline-residual`, `rep-time-started`, `rep-time-ended`, `rep-time-duration`, `rep-time-duration-text`, `rep-actual-flow-rate`, `rep-completion-pct`, `rep-trip-outcome`).
- Re-syncs all 7 D3 milestone audit table rows (`#rep-btime-XX` and `#rep-bstat-XX`) from `state.buzzerMilestones`.

### B. Binding `updateDoctorReportData()` to All View & Download Triggers
1. **`openDoctorReportModal()`**:
   - Executes `updateDoctorReportData()`.
   - Calls `acknowledgeAlarm()` (mutes sound and hides `#alarm-overlay`).
   - Removes `.hidden` from `#report-modal` (`z-index: 3000 !important`).
2. **`downloadDoctorReportText()`**:
   - Executes `updateDoctorReportData()`.
   - Builds complete, structured text file payload with reference ID, demographics, vitals, volumetric metrics, notes, and verification stamps.
   - Triggers browser Blob `.txt` download automatically (`Doctor_Report_[Name]_[ID]_[Time].txt`).
3. **`printDoctorReport()`**:
   - Executes `updateDoctorReportData()`.
   - Sets `document.title` to `Clinical_Infusion_Report_[Name]_[ID]`.
   - Calls `window.print()` for clean A4 PDF generation.
4. **Warning Popup Action Buttons** (`#alarm-overlay`):
   - "View Doctor's Report" -> `openDoctorReportModal()`
   - "Download (.txt)" -> `downloadDoctorReportText(); acknowledgeAlarm();`
   - "Mute Alarm" -> `acknowledgeAlarm()`

---

## 3. Detailed Proposed Changes

### Component 1: `frontend/app.js` & `app.js`
- **[MODIFY] `frontend/app.js`**:
  - Implement `updateDoctorReportData()`.
  - Refactor `completeInfusionSession(fromUser = true)` to use `updateDoctorReportData()`.
  - Refactor `openDoctorReportModal()`, `downloadDoctorReportText()`, and `printDoctorReport()` to always run `updateDoctorReportData()` first.
  - Export `updateDoctorReportData` and `downloadDoctorReportText` to `window`.
- **[MODIFY] `app.js`**:
  - Apply exact identical changes to maintain dual-root deployment synchronization.

### Component 2: Markup Updates (`frontend/index.html` & `index.html`)
- **[MODIFY] `frontend/index.html` & `index.html`**:
  - Verify action buttons on `#alarm-overlay` and `#report-modal` invoke the updated functions cleanly.

### C. 2-Column Milestone Audit Log & Single-Page A4 Sheet Fit
- **Section 5 Table Simplification**: Removed `Hardware Pin`, `Acoustic Signal`, and `Delivery Status` columns. Retained ONLY `Milestone Threshold` and `Trigger Time` columns across all 7 volume thresholds (`90%`, `75%`, `65%`, `50%`, `35%`, `25%`, `< 10%`).
- **Single-Page A4 Sheet Print Engine**:
  - Updated `@media print` in `style.css` and `frontend/style.css` (`@page { size: A4 portrait; margin: 6mm 8mm; }`).
  - Adjusted font scale (`9.5pt`), line-heights (`1.35`), section margins (`8px`), and table padding so that all 6 sections plus formal physician sign-off fit on **1 SINGLE A4 PAGE**.
- **Offline Report Generation**: Ensured dynamic report hydration works fully in offline simulation mode without needing an active hardware serial connection.

---

## 4. Verification Plan & Status

### Completed & Verified Actions
1. **Simplified 2-Column Table**: Confirmed Section 5 displays only `Milestone Threshold` and `Trigger Time`.
2. **Single-Page A4 Fit**: Confirmed `@media print` renders the full Doctor's Report on a single A4 page with crisp borders and no page overflow.
3. **Offline Telemetry Hydration**: Confirmed report populates live demographics, vitals, durations, and milestone trigger times in web simulation mode.
4. **Git Deployment**: Committed and pushed changes to `origin/main` (`88e0d94`), triggering auto-deploy on Render.
5. **Resolution Logging**: Created timestamped log entry at `log/2026-09-08_00-42_2column_milestone_audit_table_and_1page_a4_fit.md`.



