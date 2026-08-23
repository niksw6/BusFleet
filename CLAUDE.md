# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A Expo / React Native fleet management app for bus operations. Drivers report incidents; supervisors triage and create job cards; team leaders accept/reject jobs for their maintenance team; mechanics/electricians self-accept faults, log work entries, and request parts; the SAP-backed backend (ASP.NET) issues parts, supervisors approve, mechanics mark received, and the loop closes the incident.

The full end-to-end flow is documented in `WORKFLOW.md`. SOP references in code comments refer to the Driver Complaint Incident Flow. Read `WORKFLOW.md` before touching the job-card, team, mechanic, or work-entry screens.

## Common commands

```bash
# Install once
npm install

# Dev server (then press 'a' for Android, 'i' for iOS, or scan QR with Expo Go)
npm start

# Direct platform runs
npm run android
npm run ios
npm run web

# Clear Metro cache when bundles go stale
npx expo start --clear

# Pick a different port if 8081 is in use
npx expo start --port 8082

# Align installed versions with the SDK (Expo 50)
npx expo install --fix

# Health checks
npx expo-doctor
npx expo-env-info
```

There is no test runner, linter, or formatter configured in this repo. The package.json scripts are limited to `start` / `android` / `ios` / `web`. If a new package is added, prefer `npx expo install <pkg>` so the version matches Expo SDK 50.

`COMMANDS.md` is the extended reference (adb, emulators, EAS, full reset). Use it when you need a deeper procedure than what is above.

## Architecture

Feature-sliced layout under `src/`:

```
src/
├── api/
│   ├── client.js              # fetch-based HTTP client, session cookie handling, abort/timeouts
│   ├── index.js               # re-exports services + client
│   └── services/              # one file per backend domain — see API surface below
├── features/
│   ├── auth/         screens/{LoginScreen, ProfileScreen}
│   ├── complaints/   screens/{ComplaintsScreen, CreateIncidentScreen}
│   ├── dashboard/    screens/{DashboardScreen, NotificationsScreen}
│   ├── jobCards/     screens + components — biggest feature
│   └── maintenance/  screens/{CreateFuelLogScreen, CreateScheduleScreen}
├── shared/
│   ├── components/  Loader, FAB, KPICard, DashboardCard, ModalSelector, Badge,
│   │                ConfirmationModal, OfflineBanner, SkeletonLoader, AppIcon,
│   │                SimpleLocationAutocomplete, StandardListCard
│   ├── hooks/        useConfirmation, useTheme
│   └── index.js
├── store/            Redux Toolkit (configureStore in store/index.js)
│   └── slices/       auth, theme, notification, data, complaints, jobCards,
│                     masterData, workEntry
├── navigation/       AppNavigator (stack) → DrawerNavigator (drawer, role-gated)
├── components/       Legacy top-level components still imported by some screens
├── screens/          Legacy top-level screens (ComplaintDetailScreen,
│                     WorkflowGuideScreen, DashboardScreen, WorkOrderScreen)
├── constants/        config.js (endpoints, roles, enums), theme.js (SAP Fiori palette)
├── hooks/            useConfirmation, useTheme (duplicated exports of shared/hooks)
└── utils/            storage, helpers, validations, roleAccess,
                      diagnosticLogger, logger
```

The legacy `src/screens/` and `src/components/` directories are still in use and are imported by the new feature folders. New work should land under `src/features/<feature>/` and `src/shared/`, but do not move legacy files without checking every import.

## The API layer (the most important thing to understand)

The backend lives at `http://116.202.223.120:6069/BMSSystem/` and is a single endpoint-per-method ASP.NET service. Every endpoint expects a `CompanyDB` query/body field and a `DBName` request header (auto-injected by `api/client.js` from AsyncStorage). Session is a single `ASP.NET_SessionId` cookie — captured from `set-cookie` after the first request and replayed as a `Cookie` header on every subsequent request. The cookie does not survive Android release builds via `credentials: include`, so the client reads/writes it through AsyncStorage explicitly. `Authorization: Bearer …` is no longer used; the cookie is the only auth state.

`api/client.js` also normalizes the inconsistent `Success` / `Status` boolean fields the backend returns, and normalizes every POST body to JSON.

Service files map 1:1 to backend modules:

| Service | Purpose | Live endpoints (sample) |
| --- | --- | --- |
| `authService` | company list + login | `MGetCompanyLists`, `MCheckLogin` |
| `masterService` | buses, drivers, mechanics, supervisors, routes, faults, teams | `GetActiveBusMasters`, `GetMechanics`, `GetRoutes`, `GetStopsByRoute`, `GetFaultMaster`, `GetMaintenanceTeams`, `GetTeamMembers` |
| `complaintService` | incidents (complaints + breakdowns) | `CreateIncidents`, `GetIncidents`, `CloseIncident`, `AssignBreakdownTeam`, `CloseBreakdown` |
| `jobCardService` | job cards, accept/reject, close, history | `CreateJobCard`, `UpdateJobCard`, `CloseJobCard`, `CloseIncident`, `AcceptJob`, `CompleteWork`, `CancelJobCard`, `GetJobCardHistory` |
| `teamService` | team leader workflow | `GetMechanicalDashboard`, `GetMyTeamMembers`, `GetJobCardFaults`, `AssignTeam`, `UpdateTeamStatus` (`'A'` accept, `'R'` reject) |
| `mechanicService` | mechanic / electrician queue | `GetMechanicDashboard`, `GetMyJobs`, `AcceptFault`, `StartWork`, `CreateWorkEntry`, `UpdateWorkEntry`, `CompleteWork`, `RejectWork` |
| `workEntryService` | work entries, parts, image upload | `AddWorkEntry`, `RequestParts`, `ApprovePartRequest`, `MarkPartReceived`, `GetIssuedItems`, `UploadImage`, `SaveWorkEntryImage`, `VerifyWorkEntry` |
| `storeService` | parts + special tools, two entry points | `RequestJobCardParts`, `RequestWorkEntryParts`, `GetApprovedJobCardParts`, `ReceiveJobCardParts`, `ReceiveWorkEntryParts`, `GetMechanicPartRequests`, `ApproveMechanicPartRequest`, `RequestSpecialTool`, `GetSpecialTools`, `ApproveSpecialToolRequest`, `RequestPartReturn` |
| `dashboardService` | stats, notifications, KPIs | `GetDashboardStatus`, `GetDashboardStats`, `GetNotifications`, `GetNotificationCount`, `MarkNotificationRead`, `GetInspections`, `GetWorkOrders`, `GetFleetPerformance`, `GetCostAnalysis` |
| `maintenanceService` | fuel + schedules | `CreateFuelLog`, `GetFuelLogs`, `CreateSchedule`, `GetScheduledServices`, `GetUpcomingMaintenance`, `CompleteScheduledService`, `GetFuelAnalytics` |

Adding a backend endpoint means: add it to `API_ENDPOINTS` in `src/constants/config.js`, add a method to the appropriate service file, and call it from a screen. If a new domain is needed, create a new `*.service.js` and re-export it from `src/api/services/index.js`.

The full request/response shapes for the older endpoints are in `API_DOCS.md`. `API_STATUS.md` and `EXPECTED_API_RESPONSES.md` are the historical spec — read them as background only, the code is the source of truth for the live contract.

## Roles and routing

`src/utils/roleAccess.js` is the single source of role logic. The backend sends a `Usertype` single-letter code (`M`, `E`, `S`, `TL`/`T`, `TH`, `DH`, `D`); `mapUsertypeToRole` maps it to one of the constants in `src/constants/config.js` (`USER_ROLES`). `getUserRole` falls back to the explicit `role`/`UserRole` field if the code is missing, and defaults to `Supervisor`.

Helpers: `isSupervisorUser`, `isMechanicUser`, `isElectricianUser`, `isTeamLeaderUser`, `isDriverUser`, `isFieldStaffUser` (mechanic OR electrician — both execute repairs), `hasManagementAccess` (supervisor + technical/depot head + admin), `getUserTeamCode`, `getUserDepot`.

Both `AppNavigator` (stack) and `DrawerNavigator` (drawer) gate screens by role. When you add a screen, add it to both:

- `AppNavigator.js` — modal/stack screens opened from many places (CreateIncident, CreateJobCard, TeamApprovals, MechanicDashboard, FaultWork, PartsApproval, ComplaintDetail, etc.)
- `DrawerNavigator.js` — the side menu items, which are role-filtered in the `baseMenuItems.filter` block.

## Core user flow (the SOP at runtime)

1. **Driver** logs in → lands on dashboard → `CreateIncidentScreen` posts to `CreateIncidents` (unified complaint/breakdown, distinguished by `ComplaintType`).
2. **Supervisor** sees the incident in `ComplaintsScreen` (a.k.a. Incidents / My Incidents), opens it, and creates a Job Card in `CreateJobCardScreen`. `CreateJobCard` supports per-fault `Mechanics` and `Parts` arrays.
3. **Team Leader** opens `TeamApprovalsScreen` (drawer item gated to TL) → `GetMechanicalDashboard` → Accept (`Status: 'A'`) or Reject (`Status: 'R'` with `Remarks`) via `teamService.updateTeamStatus`. Rejection triggers supervisor reassignment.
4. **Mechanic / Electrician** sees accepted faults on `MechanicDashboardScreen` (drawer item, field-staff only) → `GetMechanicDashboard` / `GetMyJobs` → self-accepts each fault with `AcceptFault` → `StartWork` → opens `FaultWorkScreen` → logs work via `CreateWorkEntry` / `UpdateWorkEntry` (each entry has a `Details` array of `{WorkCode, WorkDone, OtherDescription, Remarks}`) → requests parts via `storeService.requestWorkEntryParts` → marks received → `CompleteWork` (also accessible via `workEntryService.completeWork` on a work entry, or `mechanicService.completeWork` on a work entry payload).
5. **Supervisor** reviews each work entry in `ReviewWorkEntriesScreen` → `workEntryService.verifyWorkEntry` (`'SV'` verified, `'RW'` rework). Once all work entries are verified, supervisor calls `CloseJobCard` or `CompleteJobCard` which also calls `CloseIncident(FormType='J')`.
6. **Parts** in parallel: supervisor may pre-request parts at job-card time (`storeService.requestJobCardParts`) or mechanic raises the request mid-work (`requestWorkEntryParts`). Both end up in `GetMechanicPartRequests` for supervisor approval via `ApproveMechanicPartRequest`, then mechanic confirms via `ReceiveJobCardParts` / `ReceiveWorkEntryParts`. Special-tool requests use `RequestSpecialTool` / `GetSpecialTools` / `ApproveSpecialToolRequest`.
7. **Notification badge** is recomputed on every navigation state change in `AppNavigator.refreshNotificationCount`. It is not just `GetNotificationCount` — supervisors also get pending mechanic part-request entries counted, and field staff get assigned-but-incomplete work + approved-but-unreceived parts.

The role of `MCheckLogin`'s `Data.TeamCode` is foundational: a Team Leader's team code is what scopes which job cards appear in their Mechanical Dashboard (SOP §1.3).

## Conventions and gotchas

- **Status codes are short letters, not words.** `STATUS` constants in `config.js`: `O` open, `I` in progress, `CM` completed, `D` declined. `PART_REQUEST_STATUS`: `RQ` requested, `AP` approved, `PS` partially issued, `IS` fully issued, `RC` fully received, `PR` partial received, `RJ` rejected (plus legacy aliases `P`/`I`/`R`). `JOB_ACCEPT_STATUS`: `P` pending, `A` accepted, `R` rejected. `TEAM_STATUS_CODE`: `A` accept, `R` reject. Always read the constants rather than hard-coding the letters.
- **Backend returns `Success` or `Status` interchangeably.** The `normalizeApiResult` helper in `api/client.js` adds whichever is missing so consumers can read either. When writing a new service, prefer `response.data.Success`.
- **Login is a triple-fallback on response shape.** `LoginScreen` handles `response.Status === true` / `response.success` / `response.Success === true` and reads the user from `response.Data` / `response.data` / `response.user` / `response.User`. Mirror that tolerance if you add another login-like endpoint.
- **`User` is the canonical key for the username on the wire** — but the app also reads `user.User`, `user.username`, `user.Code`, `user.code`, `user.id`. When constructing a user object from a backend payload, set all of these keys (`LoginScreen.handleLogin` is the reference).
- **Date formats:** most endpoints accept `YYYY-MM-DD` and `HH:mm`. The `RegTime` / `ComplaintTime` / `BrkTime` fields on `CreateIncidents` expect `HHMM` as an integer (e.g. `1430`); the older `AddWorkEntry` and similar take `HH:mm`. The helper `BrkTime` formatting in `CreateIncidentScreen` is the reference.
- **All API calls pass through `api/client.js` and inherit DBName + Cookie headers automatically.** Do not build URLs by hand. If you need a different base URL temporarily, `API_BASE_URL` is the only knob (`src/constants/config.js`).
- **Redux slices feature most caching**, but real-time data (work queues, parts requests) is re-fetched on screen focus rather than mirrored to Redux. Follow the existing pattern in the screen you are touching.
- **`serializableCheck` is disabled** in the store. Do not put functions or class instances in state without good reason.
- **Dark mode** is driven by `state.theme.isDarkMode`; use `COLORS` / `DARK_COLORS` from `constants/theme.js` and pick the right one with `useTheme()` or by reading the redux state. The whole app theme is built in `App.js` from `MD3LightTheme` / `MD3DarkTheme`.
- **Vector icons:** the app uses `react-native-vector-icons/MaterialCommunityIcons` (via `react-native-paper` icons) and a local `AppIcon` wrapper that re-exports a single icon component. When a screen needs a glyph, import from `../../shared/components/AppIcon.js` and use the MaterialCommunityIcons name string.
- **Forms use Formik + Yup.** Validation schemas live in `src/utils/validations.js`. `loginValidationSchema` is the only one currently defined; add new schemas there when you build new forms.
- **No tests are configured.** The repo relies on manual QA on a Pixel 5 / Android 13 emulator (see `README.md` for setup). Do not introduce a test framework without confirming with the user — adding Jest to an Expo 50 project is a non-trivial setup change.

## Where to add what

- **New screen for an existing feature** → `src/features/<feature>/screens/<Name>Screen.js`, export from that feature's `index.js`, register in `AppNavigator.js` (and `DrawerNavigator.js` if it should appear in the side menu).
- **New reusable widget** → `src/shared/components/<Name>.js`, export from `src/shared/components/index.js`. Feature-local components go in `src/features/<feature>/components/`.
- **New API call** → method on the appropriate `src/api/services/<domain>.service.js`, then call it from a screen via `import { service } from '../../../api/services'`. If the endpoint name isn't in `API_ENDPOINTS`, add it to `src/constants/config.js`.
- **New role** → add to `USER_ROLES` in `config.js`, map it in `mapUsertypeToRole` and `normalizeExplicitRole` in `src/utils/roleAccess.js`, then add helpers (`isFooUser`) and gate the new screens in both navigators.
- **New redux state** → add a slice under `src/store/slices/`, register in `src/store/index.js`, and only persist it if the user asks (no redux-persist is currently wired up).

## Project context files worth reading once

- `WORKFLOW.md` — end-to-end SOP and the data flow that justifies why the screens and endpoints are shaped the way they are.
- `ARCHITECTURE.md` — historical rationale for the feature-sliced layout.
- `API_DOCS.md` / `EXPECTED_API_RESPONSES.md` — older but useful payload examples.
- `INSTALL.md` / `QUICKSTART.md` / `DEPLOYMENT.md` / `SETUP.md` — environment and EAS-build procedures.
- `PROJECT_SUMMARY.md` / `MODERNIZATION_SUMMARY.md` / `RESTRUCTURING_COMPLETE.md` / `HVI_IMPLEMENTATION.md` / `FORM_SIMPLIFICATION.md` — historical context; treat as background, not as the current spec.
