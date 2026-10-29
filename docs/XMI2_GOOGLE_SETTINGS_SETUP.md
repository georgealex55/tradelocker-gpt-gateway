# Google sign-in + owner-scoped XMI settings (preview only)

Google sign-in and cloud settings are **fail-closed until configured**. No Google OAuth keys, sessions, or database write permissions are in Git. In the meantime, the existing read-only preview and local workspace/export remain usable.

## Setup (requires operator approval in the preview project)
1. Create a Google Cloud OAuth Web client for the **exact** deployed preview origin and enable Google Identity Services. Restrict origins to those explicitly authorized.
2. Configure **preview-only**, branch-scoped Vercel variables (values managed by user, never pasted in chat): `XMI_GOOGLE_SETTINGS_ENABLED=true`, `XMI_GOOGLE_CLIENT_ID`, `XMI_GOOGLE_SETTINGS_ORIGIN`, `XMI_GOOGLE_SESSION_SECRET` (random >=48 chars). The signed session uses an HttpOnly Secure SameSite=Lax cookie limited to /api/xmi, expiring after 30 minutes.
3. Also configure existing isolated XMI coach OIDC/Neon guard settings as appropriate for `configuredDatabase`: `XMI_COACH_ENABLE_CLOUD=true`, dedicated restricted Neon login `XMI_COACH_DATABASE_URL`, `XMI_COACH_EXPECTED_BRANCH_ID` matching the preview guard, and `XMI_COACH_ENVIRONMENT=preview`. **Never use TradeLocker's `DATABASE_URL`**.
4. Only in the **isolated preview branch database**, prepare a RLS table. Run through a trusted restricted operator, after reviewing existing role and guard policy:

```sql
CREATE TABLE IF NOT EXISTS public.xmi_private_preferences (
  owner_sub text PRIMARY KEY,
  preferences jsonb NOT NULL CHECK (pg_column_size(preferences) <= 360000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.xmi_private_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xmi_private_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY xmi_preferences_owner ON public.xmi_private_preferences
  FOR ALL TO xmi_coach_app
  USING (owner_sub = current_setting('xmi.coach_owner_sub', true))
  WITH CHECK (owner_sub = current_setting('xmi.coach_owner_sub', true));
GRANT SELECT, INSERT, UPDATE ON public.xmi_private_preferences TO xmi_coach_app;
```

Verify that `xmi_coach_app` has **no login or BYPASSRLS** and the guarded login is restricted. The server verifies Google ID token audience, issuer, signed nonce, expiry, and email verification; session cookie requires an independent HMAC secret. All reads/writes re-check the isolated Neon environment guard within the role-scoped transaction.

The login wall guards **cloud saving and restoring**, not guest read-only charting. This keeps the previously approved preview accessible while identity-provider setup is pending. No settings automatically upload, no trade execution/DB migration, and no live-feed permissions are granted.
