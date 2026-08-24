# Telnyx Portal Setup Guide

This document provides step-by-step instructions for configuring each Telnyx communication channel in the OceanLuxe CRM.

---

## Voice (Click-to-Call / Dialer)

### Prerequisites
- Telnyx account with outbound calling enabled
- At least one voice-capable DID number assigned to your account

### Steps

1. **Log into the Telnyx Portal** → https://portal.telnyx.com

2. **Navigate to Call Control** → Connections → Create New Connection

3. **Create a Call Control Application**:
   - Name: `OceanLuxe CRM`
   - Webhook URL: `https://your-domain.com/api/v1/telecom/webhooks/telnyx`
   - Failover Webhook URL (optional): your backup webhook URL
   - Set the connection type to **Call Control Application** (NOT SIP Credential)

4. **Assign a voice-capable DID**:
   - Go to Numbers → Select your DID → Assign to the Call Control Application you just created

5. **Copy the Connection ID**:
   - The Connection ID is a **numeric** ID (e.g., `1826749520394856307`)
   - If your ID looks like a UUID (e.g., `a1b2c3d4-e5f6-...`), it's a SIP Credential — you need a Call Control Application instead

6. **Set environment variables**:
   ```
   TELNYX_CONNECTION_ID=1826749520394856307
   TELNYX_API_KEY=your-api-key
   TELNYX_DEFAULT_FROM_NUMBER=+1XXXXXXXXXX
   TELNYX_WEBHOOK_URL=https://your-domain.com/api/v1/telecom/webhooks/telnyx
   TELNYX_PUBLIC_KEY=your-public-key
   ```

7. **Verify in CRM**: Go to Settings → System → Voice card should show "Ready"

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "Connection not found" | Wrong connection ID | Use Call Control Application ID (numeric), not SIP Credential |
| "Invalid API key" | Wrong TELNYX_API_KEY | Generate a new API key in Telnyx Portal → API Keys |
| Call hangs up immediately | No outbound capability | Confirm DID has outbound voice enabled |
| "Connection inactive" | App not deployed | The Call Control Application must be in "active" state |

---

## SMS Messaging

### Prerequisites
- Telnyx account with messaging capability
- A DID number with SMS capability

### Steps

1. **Navigate to Messaging** → Profiles → Create New Profile

2. **Create a Messaging Profile**:
   - Name: `OceanLuxe CRM`
   - Add your SMS-capable DID to this profile

3. **Copy the Messaging Profile ID**:
   - Go to the profile details and copy the Profile ID

4. **Set environment variables**:
   ```
   TELNYX_MESSAGING_PROFILE_ID=your-messaging-profile-id
   ```

5. **Verify in CRM**: Settings → System → SMS card should show "Ready"

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "TELNYX_MESSAGING_PROFILE_ID is missing" | Env var not set | Set the profile ID |
| Messages not delivered | DID not in profile | Add DID to the messaging profile |
| 10DLC registration required | US long-code messaging | Register your brand and campaign with The Campaign Registry |

---

## Video Meetings

### Prerequisites
- Telnyx account with Video API access (may require beta enablement)

### Steps

1. **Confirm Video API access**:
   - Check Telnyx Portal → Video or contact support to enable

2. **Set environment variables**:
   ```
   TELNYX_VIDEO_ENABLED=true
   TELNYX_API_KEY=your-api-key
   ```

3. **Verify in CRM**: Settings → System → Video card should show "Ready"

### How Video Works in the CRM

1. A user clicks "Video Room" or "Create Meeting"
2. The CRM creates a room server-side via Telnyx API
3. A join token is generated for each participant (short-lived, secure)
4. Participants join using the token — no permanent secrets exposed to browser

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "Telnyx Video is not enabled" | TELNYX_VIDEO_ENABLED not set | Set to `true` |
| Room creation fails | No Video API access | Enable Video API in Telnyx portal |
| Token generation fails | Expired room or wrong ID | Verify room_id is correct and room is active |

---

## Email (Transactional)

### Option A: Resend (Recommended)

1. **Create a Resend account** → https://resend.com
2. **Generate an API key**
3. **Verify your sending domain** (add DNS records)
4. **Set environment variables**:
   ```
   RESEND_API_KEY=re_xxxxxxxxxx
   RESEND_FROM=noreply@yourdomain.com
   ```

### Option B: Telnyx Email API (Beta)

1. **Confirm Email API beta access** in Telnyx Portal
2. **Verify sending domain** or use shared domain
3. **Publish DNS records**: SPF, DKIM, MX, DMARC as required
4. **Set environment variables**:
   ```
   TELNYX_EMAIL_ENABLED=true
   EMAIL_FROM_ADDRESS=notifications@yourdomain.com
   EMAIL_FROM_NAME=OceanLuxe CRM
   ```

### Email in the CRM

- Contract signing emails use the configured email provider
- Listing shares, reminders, and notifications also use this provider
- The CRM will use Resend if available, Telnyx Email if configured and Resend is not

---

## Document Storage

### Steps

1. **Create an S3-compatible bucket** (AWS S3, Cloudflare R2, etc.)

2. **Set environment variables**:
   ```
   DOCUMENTS_BUCKET=your-bucket-name
   DOCUMENTS_REGION=us-east-1
   DOCUMENTS_ACCESS_KEY_ID=your-key-id (optional for IAM roles)
   DOCUMENTS_SECRET_ACCESS_KEY=your-secret (optional for IAM roles)
   ```

3. **Verify in CRM**: Settings → System → Document Storage card should show "Ready"

---

## Feature Flags

Set these environment variables to `true` to enable optional features:

| Variable | Feature |
|----------|---------|
| `FEATURE_ESIGN` | Electronic signatures for contracts |
| `FEATURE_VIDEO_MEETINGS` | Video meeting creation |
| `FEATURE_PUBLIC_LISTINGS` | Public listing pages |
| `FEATURE_RVM` | Ringless voicemail campaigns |
| `FEATURE_SKIP_TRACE` | Lead skip tracing |
| `FEATURE_CAMPAIGNS` | Campaign management |
| `FEATURE_FIELD_MODE` | Field agent mode |
| `FEATURE_COMPS` | Property comparisons |
| `FEATURE_BUYER_MATCH` | Automated buyer matching |
| `FEATURE_VOICE_PLAYGROUND` | Voice research playground |

---

## Verification Checklist

After configuring all channels, verify in Settings → System:

- [ ] Voice: "Ready" (green badge)
- [ ] SMS: "Ready" (green badge)
- [ ] Video: "Ready" or "Not enabled" (depending on access)
- [ ] Email: "Active (resend)" or "Active (telnyx)"
- [ ] Document Storage: "Ready" or "Not configured"
- [ ] Webhook: "Configured"
- [ ] Feature Flags: All flags showing correct state

### Manual QA

1. **One test call**: Phone page → Dial a number → See ringing → Hangup → Verify call log
2. **One test SMS**: Leads page → Send SMS → Verify activity log
3. **One meeting**: Calendar → Video Room → Create → Verify room appears → Join
4. **One email**: Contract detail → Send → Verify email delivered
5. **System Health**: Settings → System → All cards render correctly
