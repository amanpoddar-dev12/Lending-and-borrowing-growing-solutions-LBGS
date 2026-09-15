# LBGS rebrand

Rename all customer-visible “Kredix” branding to **Lending and Borrowing Growing Solutions**, using **LBGS** where space is limited. Remove the in-app “Built with Lovable” credit and replace the generic README with LBGS project documentation.

## What will change

- **Primary identity:** homepage title and first marketing mention use “Lending and Borrowing Growing Solutions”; navigation, dashboard labels, sign-in copy, page titles, and compact surfaces use “LBGS”.
- **App chrome:** replace the “K” mark and “Kredix” sidebar/header labels with “LBGS”, while retaining the existing design system.
- **Metadata:** update every route title, description, Open Graph title/description, Twitter metadata, author, and related app-level naming. Preserve each route’s existing visibility and behavior.
- **Documents:** change the payslip company name and visible contact branding to LBGS. Rewrite README boilerplate without Lovable branding.
- **Localization:** update English and Hindi welcome text consistently.
- **Configuration:** rename the generic package display identifier to `lbgs`; update any editable app-name fields found during implementation.
- **Favicon:** replace the current Kredix-style “K” favicon with a compact LBGS mark; favicons do not support alt text, so no nonexistent alt attribute will be added.
- **Verification:** run a final case-insensitive search, type check, and browser checks for the homepage, sign-in page, and authenticated shell at desktop and mobile sizes.

## Compatibility boundaries

Some source matches are required technical infrastructure, not visible branding. They will remain because renaming/removing them would break authentication, builds, error capture, AI requests, or managed configuration:

- `@lovable.dev/*` package names/imports and lockfile registry URLs
- generated integration files and `lovable` authentication/error-reporting API identifiers
- `LOVABLE_API_KEY`, `LOVABLE_DB_MIGRATION_URL`, and the AI gateway hostname
- internal legacy keys/domains such as `kredix.lang`, `kredix.theme`, dismissed-task keys, and `phone.kredix.local`, retained so existing users keep preferences and authentication continuity
- platform management files/comments that must remain for project synchronization

No removable platform-injected badge or control was found in the editable source. If one appears in the hosted preview after source branding is removed, it is outside this codebase and will be listed rather than altered.

## Files in scope

All route metadata files containing Kredix, plus `src/routes/index.tsx`, `src/routes/__root.tsx`, `src/components/app-sidebar.tsx`, `src/components/payslip-document.tsx`, English/Hindi locale files, `README.md`, `package.json`, and the favicon asset. No business logic, routes, permissions, or data workflows will change.
