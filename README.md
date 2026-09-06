# SENTINEL-ID Officer Console

SENTINEL-ID is a secure, explainable identity-document screening console for authorized officers. It is designed for rapid passport and Aadhaar review in low-connectivity or air-gapped operational environments.

## Problems this application can solve

- **Slow manual document screening** — centralizes upload, screening, verdict, and evidence review in one officer workspace.
- **Identity-document fraud** — detects suspicious document signals such as inconsistent fields, tampering indicators, invalid MRZ/VIZ relationships, and altered visual regions.
- **Opaque AI decisions** — presents a confidence score, verdict, evidence trail, and signal-by-signal explanation instead of an unexplained pass/fail result.
- **Counterfeit and altered passports** — supports passport image/PDF intake and creates a structured screening record for document-forensics workflows.
- **Aadhaar verification bottlenecks** — provides a scalable place to add Aadhaar-specific OCR, QR, layout, and authenticity checks without changing the officer workflow.
- **Driving-licence fraud** — supports licence-number, expiry-date, portrait, issuer, and security-pattern checks.
- **Voter-ID fraud** — supports EPIC-number, issuer/state, portrait, and card-layout checks.
- **PAN-card tampering** — supports PAN-format, name/date alignment, portrait, and print-artifact checks.
- **Residence-permit and national-ID review** — provides a configurable workflow for identity number, issuer, validity, portrait, and machine-readable-field checks.
- **Inconsistent officer decisions** — standardizes screening states such as cleared, review, and high-risk with repeatable evidence categories.
- **Disconnected or unreliable networks** — supports an offline-first operational model where local screening can continue and later synchronize with a central system.
- **Sensitive document exposure** — uses authenticated officer access, secure session handling, upload validation, size limits, MIME allowlisting, file-signature checks, and security headers as a foundation for protected document processing.
- **Weak auditability** — provides an extensible foundation for case history, officer actions, review notes, exports, and immutable audit events.
- **Slow escalation of high-risk cases** — creates a future-ready queue for watchlists, case assignment, analyst review, and escalation workflows.
- **Fragmented screening tools** — brings intake, analysis, case review, analytics, and system status into one command-center experience.
- **Lack of operational insight** — leaves room for aggregate dashboards covering throughput, false-positive rates, latency, model drift, and review outcomes.
- **Difficult deployment in controlled environments** — is structured for local inference, controlled storage, role-based access, and later synchronization with a central API.
- **Limited integration readiness** — is prepared for OCR, MRZ parsing, face matching, document databases, queues, object storage, and model services as independent modules.

## Current capabilities

- Officer sign-in and account creation with email/password and Google OAuth.
- Protected dashboard backed by Better Auth and Neon Postgres.
- Multi-document image and PDF upload workflow with a document-type selector for passport, Aadhaar, driving licence, voter ID, PAN card, national ID, residence permit, and other government IDs.
- Document-aware helper copy, screening metadata, and signal checklist.
- Client-side file type, file signature, filename, and size validation.
- OCR + AI-assisted confidence scoring and verdict presentation with conservative manual-review gating.
- Explicit percentage semantics: 0% means no usable automated evidence, not a claim that the document is fake.
- Responsive officer navigation with quick access to screening, queue, history, analytics, and settings surfaces.
- Dark/light appearance modes with persistent preference.
- Security headers, origin checks, request-size protection, authentication rate limiting, and secure preview cookie configuration.
- Scalable seams for server-side inference, persistent document jobs, object storage, review queues, and audit logging.

## Architecture direction

- **Frontend:** Next.js App Router, React, TypeScript, responsive CSS, Lucide icons.
- **Authentication:** Better Auth with email/password and Google OAuth.
- **Database:** Neon Postgres with a shared `pg` connection and Drizzle-compatible application structure.
- **Security:** Server-protected routes, scoped user data, secure cookies, request guards, upload allowlists, magic-byte validation, and defense-in-depth response headers.
- **Future processing:** Replace the demo scoring adapter with authenticated server-side OCR, document forensics, MRZ/VIZ validation, face matching, local inference, or a queue-backed analysis service.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Required server variables include:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Never commit credentials, document samples containing personal data, or generated secrets. Configure OAuth callback URLs and deployment secrets in the environment where the application runs.

## Processing node and air-gapped mode

A **node** is the controlled runtime where document files are received, validated, OCR-processed, and analyzed. **Air-gapped** means the processing environment has no direct outbound internet route; in production, egress controls, firewall policy, network segmentation, and allowlisted service access prevent documents from being sent to unknown destinations. This reduces exfiltration risk, but it is not a guarantee by itself: authentication, least privilege, encryption, audit logging, patching, and authoritative issuer verification remain necessary.

The confidence percentage is an evidence score, not proof of authenticity. SENTINEL-ID returns `MANUAL_REVIEW` when OCR is unavailable, required fields are missing or inconsistent, issuer/security evidence is absent, or deterministic checks fail. A genuine-looking image must never be treated as authentic without authoritative verification.

## Security and scope

SENTINEL-ID is a screening aid, not a legal identity determination. Production deployments should add server-side file scanning, encrypted object storage, strict retention and deletion policies, role-based authorization, rate limiting at the edge, structured audit logging, model governance, privacy review, and independent security testing before processing real identity documents.

This repository is linked to a [v0](https://v0.app) project. Continue development from the [v0 project](https://v0.app/chat/projects/prj_4WfqplxqrDgQUtjmczYv1wbYWZQ4).

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Neon Documentation](https://neon.tech/docs)
- [v0 Documentation](https://v0.app/docs)

## License

Add the project license before public distribution. Until a license is added, the repository remains “all rights reserved” by default.
