// Idempotent seed for the in-app documentation module: the OceanLuxe Sales
// Playbook. Runs once per team (when no docs exist). All content is original,
// written against this CRM's actual features (skip trace, dispo board, deal
// ledger, contract wizard) so the docs teach the tool, not generic theory.
import { storage } from "./storage.js";

type SeedPage = {
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  body: string;
};

type SeedCategory = {
  name: string;
  slug: string;
  description: string;
  pages: SeedPage[];
};

export const DOCS_SEED_VERSION = "2026-09-13.1";

export const DOCS_SEED: SeedCategory[] = [
  {
    name: "Acquisition Playbook",
    slug: "acquisition",
    description: "Finding, calling, and signing motivated sellers.",
    pages: [
      {
        title: "Motivated-Seller Cold Call Script",
        slug: "cold-call-script",
        summary: "The full opener-to-close structure with branching for every seller mood.",
        tags: ["cold calling", "scripts", "acquisition"],
        body: `# Motivated-Seller Cold Call Script

Work this script from the **Dialer** or **Phone** pages. Log every call — the dispositions feed the dialer analytics.

## 1. The opener (first 8 seconds)

> "Hi, is this **{owner first name}**? My name's **{your name}** — I'm a local home buyer here in {city}. The reason for the call: I buy houses in this neighborhood and I wanted to see if you'd consider an offer on **{property address}** — no obligation, either way."

If they say **"I'm not interested"** → *Objection 1 below*. If they hesitate → keep going.

## 2. Qualify the situation (motivation)

Ask these in order. Stop digging when you hit a real driver:

1. "What made you think about selling *now*?"
2. "How long have you owned the property?"
3. "Is the house in the shape you want it in, or does it need some work?"
4. "Anyone else on the deed or in the decision?"
5. "If the numbers worked, what would you need to see happen to feel good about moving forward?"

**Listen for:** divorce, probate/inherited, job relocation, tax liens, code violations, tired landlord, double payments. Log the driver in the opportunity **Notes**.

## 3. Property snapshot (60 seconds)

- Beds / baths / year built
- Overall condition (1–5) and the two biggest repairs
- "What do you think it would sell for fixed up?" — *their* number is your anchor for ARV
- "What would you need to walk away happy?"

## 4. Setting the appointment (or the offer)

If remote: "Here's what I'll do — I'll run my numbers tonight and call you tomorrow at **{time}** with two options: a quick cash close, or I can list it for you if that nets you more. Fair enough?"

If they want a number now, walk through the offer math in **Calculator** and give a range, not a point: "Depending on repairs, I'm somewhere between $A and $B — I can be at the top of that range with a 30-day close."

## Objection handling quick reference

| Objection | Response pattern |
|---|---|
| "Not interested" | "Totally fair — before I let you go, if I could pay cash and let you pick the closing date, what would have to be true for that to be interesting?" |
| "I have an agent" | "Great — how's that going? If the listing doesn't move in 60 days, keep my number. I can also buy it *around* the listing." |
| "You're a wholesaler / lowballer" | "I'm transparent: I buy at a discount because I take the repair and resale risk. If retail nets you more, I'll tell you — I also list homes." |
| "Call me later" | "Happy to — what's a good day? I'll put it in my calendar right now." |
| Price too low | "What number would work for you? Let me see if I can get there by adjusting the closing date or taking it as-is." |

## After the call

1. Log the disposition in the dialer (works in every status).
2. Create or update the **Opportunity** and move the stage — the pipeline automations build your follow-up checklist for you.
3. If they asked for follow-up, set the task due date *during* the call, not after.`,
      },
      {
        title: "Objection Handling Matrix",
        slug: "objection-handling",
        summary: "Every common seller objection with the reframe that keeps the conversation alive.",
        tags: ["objections", "scripts"],
        body: `# Objection Handling Matrix

Rules of engagement: **acknowledge, reframe, advance**. Never argue the objection; move around it.

## Price objections

- **"That's too low."** → "I hear you — retail is higher. What you're trading for that discount is certainty: no repairs, no showings, no financing falling through. If I stretch to **{n}**, can we close in 21 days?"
- **"I got a letter saying my house is worth more."** → "Those mailers estimate *retail* — with an agent, repairs, and 60+ days of holding. My number is cash, as-is, on your timeline. Certainty has a price."
- **"Another investor offered more."** → "That's fair — did they put earnest money down? Do they have proof of funds? I close what I contract — I can show you three closed deals from this quarter."

## Trust objections

- **"How do I know you'll close?"** → Offer proof of funds, references, and the option to close at a title company they choose.
- **"Is this a scam?"** → "You never pay anything. I pay all closing costs, and everything goes through a licensed title company — you get a real settlement statement."

## Situation objections

- **"I need to think about it."** → "Of course — big decision. What's the one thing you'd need to feel sure about? ... If I solved that, would you be ready to sign this week?"
- **"I want to wait for spring."** → "You can — what happens to your {driver} between now and then?" (tie back to their motivation)
- **"The house needs too much work for anyone to buy."** → "That's exactly who I am — I buy the houses nobody else wants. Repairs are my problem, not yours."

## When to walk away

If the seller's number is >85% of retail *and* they won't negotiate, mark the lead **Dead** with notes — the pipeline keeps it searchable if circumstances change. Dead with good notes is better than a zombie follow-up list.`,
      },
      {
        title: "Offer Math: MAO and the 70% Rule",
        slug: "offer-math",
        summary: "How to compute your maximum allowable offer, with the calculator shortcuts.",
        tags: ["mao", "underwriting", "calculator"],
        body: `# Offer Math: MAO and the 70% Rule

## The formula

**MAO = (ARV × 0.70) − Repairs − Your Assignment Fee**

- **ARV** — after-repair value. Pull comps in **Playground** (address search → comps) and sanity-check against the seller's own estimate.
- **0.70** — the wholesale margin factor. Tight markets: 0.75–0.80. Heavy-repair or slow markets: 0.65.
- **Repairs** — your two-biggest-repairs estimate × a fudge factor for the surprises you can't see yet.
- **Assignment fee** — your target: **$10,000 minimum**, aim for 3–6% of ARV.

## Worked example

- ARV $300,000 × 0.70 = $210,000
- Repairs $35,000 → $175,000
- Target fee $15,000 → **MAO $160,000**
- If the seller needs $165k: negotiate repairs ("if the roof turns out worse, we adjust") or close-date credits before touching price.

## Where to do this in the app

1. **Calculator** — full deal calculator: MAO, offer ranges, ROI, agent commission modes.
2. **Opportunity → Financial Analysis** — save the numbers on the deal itself so the whole team sees the same math.
3. **Offer form** — the offer range auto-suggests from the saved analysis.

> Discipline beats heroics: a no-deal is cheaper than a bad deal. If it doesn't work at your MAO, mark it **Dead** and move to the next call.`,
      },
      {
        title: "Skip Trace Workflow",
        slug: "skip-trace-workflow",
        summary: "Turning a stale lead into phone numbers and emails with the built-in free skip tracer.",
        tags: ["skip trace", "leads"],
        body: `# Skip Trace Workflow

When a lead has no working phone number, use the built-in skip tracer — it runs on free sources and needs no paid API.

## Steps

1. Open the **Lead** (or an opportunity with a dead number).
2. Click **Skip Trace**. The orchestrator queries free web sources, extracts phones/emails, and scores the results.
3. Review the evidence panel: each phone/email shows where it came from and a confidence score. Green = dial it.
4. Add the best number to the lead, then send it to the **Dialer**.

## When to skip trace

- New lead with address but no number
- "Call me later" numbers that ring dead twice
- Probate/inherited leads where the owner moved

## Compliance notes

- Only trace leads you have a legitimate business interest in.
- Scrub against your do-not-call list before dialing (the dialer does this automatically).
- Cellular numbers dialed manually are fine; automated voice drops to cell numbers need consent — use **manual dial** for cells.`,
      },
    ],
  },
  {
    name: "Disposition Playbook",
    slug: "disposition",
    description: "From contract to cash: buyers, assignments, and closing.",
    pages: [
      {
        title: "Daily Dispo Checklist",
        slug: "daily-dispo-checklist",
        summary: "The 30-minute routine that keeps every deal moving toward the wire.",
        tags: ["dispo", "checklist", "routine"],
        body: `# Daily Dispo Checklist

Run this every morning against the **Opportunities board (Pipeline tab)**.

## 1. Under Contract (5 min)
- Every deal under contract: confirm EMD received and the due-diligence tasks the stage automation created. Anything past due — handle it first.

## 2. In Disposition (10 min)
- New deal here? The stage created your listing + buyer-outreach tasks. Do the outreach before 10am.
- Blast the deal to your cash-buyer list (Buyers page → filter by buying area/price range).

## 3. Reserved (10 min)
- Buyer committed: confirm EMD *from the buyer*, sign the assignment (Contract Wizard → assignment template), and check title is ordered.
- The reserved-stage automation created the closing-coordination checklist — nothing past due should be left there.

## 4. Sold / closing this week (5 min)
- Verify the closing checklist in **Document Management → Closing**: buyer payment, title docs, funds wired, documents recorded.
- When all four are checked, hit **Close Deal & Record Revenue** — that writes the payout to the deal ledger and moves the deal to Sold. Don't leave revenue unrecorded overnight.

## 5. Numbers (2 min)
- Dashboard: pipeline count, revenue from closed deals, conversion rate. If conversions dip, the problem is upstream (offers) or downstream (buyer list) — the two sections above tell you which.`,
      },
      {
        title: "Building Your Cash Buyer List",
        slug: "buyer-list-building",
        summary: "Where buyers come from and how to qualify them before you need them.",
        tags: ["buyers", "dispo", "outreach"],
        body: `# Building Your Cash Buyer List

The best time to build a buyer list is *before* you have a contract. Target: 20+ qualified cash buyers per price band you operate in.

## Sources

1. **Your closed deals** — every title company closing is a buyer with proof of funds. Get them into **Buyers** immediately.
2. **Other wholesalers' buyers** — their dispo emails/lists are a map of who's actually buying. Join every list.
3. **Public records** — recent cash purchases (no lender on the deed) in your zip codes. Skip trace the owner, call, introduce yourself as a fellow investor.
4. **Facebook groups / REIAs** — real buyers post real numbers in deal threads. Note who closes, not who talks.

## Qualify every buyer

Record in the Buyers page: buying areas (zip-level), price bands, property types, proof of funds (y/n), closing history (deals closed with you), and preferred title company. **Non-qualifying rule:** a buyer who has never closed and won't show funds gets no deal until they do.

## When you go under contract

1. Filter Buyers by the deal's area + price band.
2. Blast first to your proven closers (3+ deals), then the rest.
3. Log every inquiry on the opportunity — the buyer pipeline there tracks offers by buyer.`,
      },
      {
        title: "Assignment vs. Double Close",
        slug: "assignment-vs-double-close",
        summary: "The decision matrix for how to get paid on each deal.",
        tags: ["assignment", "double close", "strategy"],
        body: `# Assignment vs. Double Close

Both paths net you your fee. The difference is what appears on the settlement statement — and who knows your number.

## Assign (default)

You contract the property with the seller, then assign the *contract* to your buyer for a fee.

- **Use when:** the seller is fine with the assignment disclosing your fee, the buyer is a known closer, and the deal is clean.
- **Pros:** one transaction, minimal cash needed, fastest.
- **Watch:** some sellers dislike seeing your fee; some title companies handle assignments clumsily — confirm with title early.

## Double close (back-to-back)

You buy the property (A→B), then sell it the same day to your buyer (B→C).

- **Use when:** the seller or buyer must not see your fee, or the lender/title situation makes assignment messy.
- **Pros:** fee privacy; cleaner with REO/lender-mediated deals.
- **Watch:** needs transactional funding for a few hours; two sets of closing costs; order title twice.

## Decision shortcuts

| Situation | Path |
|---|---|
| Seller sees fee, gets upset | Double close |
| Buyer demands fee transparency | Assign |
| Deal margin is thin (<$8k fee) | Assign (costs eat doubles) |
| Institutional seller (REO, HUD) | Double close (assignment bans are common) |

## Recording it

Whichever path: the **Contract Wizard** creates the PSA (or assignment addendum), and the Closing tab tracks the actual payout. The deal ledger (deal assignments) is the single source of truth for what you actually collected — projected fees live in Financial Analysis, collected fees live in the ledger.`,
      },
      {
        title: "Closing Coordination Runbook",
        slug: "closing-coordination",
        summary: "The four checkboxes, the title company, and the wire — from contract to recorded.",
        tags: ["closing", "title", "payout"],
        body: `# Closing Coordination Runbook

Everything here happens in **Document Management → Closing** and on the opportunity's **Parties** section.

## The moment you're Reserved

1. Add the **title company** as a Party (role: Title) with the closer's direct contact.
2. Email the executed contract + buyer info to the closer: *ordering title*.
3. Confirm the closing checklist exists (reserved-stage automation creates the tasks).

## The four checkboxes (and what unblocks each)

| Checkbox | What it needs |
|---|---|
| Buyer payment submitted | Buyer's EMD or funds at title — chase the buyer, not title |
| Title docs received | Commitment + clear-to-close from the title company — weekly nudge |
| Funds wired to escrow/title | Buyer's wire; confirm with title the same day |
| Documents recorded | County recording — title confirms; recording = money is real |

## Close Deal & Record Revenue

When all four are checked, press **Close Deal & Record Revenue**. That:

- writes the **deal ledger row** (fee, costs, payout date),
- moves the opportunity to **Sold**,
- logs the close in team activity.

Revenue you don't record doesn't exist — the dashboard and the buyer of your future reports read from that ledger.

## If closing slips

- Past the target close date: add a task with the new date and note *why* in the deal notes — the pattern of slip reasons is how you fix your process.`,
      },
    ],
  },
  {
    name: "Paperwork & Compliance",
    slug: "paperwork",
    description: "Contracts, disclosures, and e-signature flows.",
    pages: [
      {
        title: "Purchase & Sale Agreement Walkthrough",
        slug: "psa-walkthrough",
        summary: "Clause by clause: what the PSA must say for wholesaling to work.",
        tags: ["psa", "contracts", "compliance"],
        body: `# Purchase & Sale Agreement Walkthrough

Generate PSAs from the **Contract Wizard** (Contracts → New Contract) using the PSA template. Every field matters — here's the skeleton:

## The clauses that protect you

1. **Purchase price & deposit** — keep EMD small ($500–$1,500) and refundable.
2. **Inspection/due-diligence period** — your escape hatch. 10–14 days minimum; the wizard's Inspection Deadline field anchors your reminder tasks.
3. **"and/or assigns"** — the magic words. If the template's assignment language is stripped, the deal is no longer assignable. Always verify it survived edits.
4. **Closing date** — realistic (30 days) with room: "on or before" language beats "on".
5. **Equitable title / assignment rights** — makes your interest assignable regardless of local contract quirks.
6. **Default & remedies** — you want your deposit to be the *sole* remedy for your default, not specific performance.

## Disclosures (state-specific — verify locally)

Many states require a wholesaler to disclose the intent to assign and that they are not a licensed agent. When in doubt: disclose. A scared seller can unwind a deal; a disclosed fee is just a fee.

## Filling it in the wizard

The wizard's Review step merges your form fields (price, EMD, dates, parties) into the template — no raw placeholders. Read the merged preview once end-to-end before sending; template edits are how stale clauses sneak in.`,
      },
      {
        title: "E-Signature Flow & What Happens After",
        slug: "esign-flow",
        summary: "From send to signed to executed — and how the CRM keeps up.",
        tags: ["e-sign", "workflow"],
        body: `# E-Signature Flow & What Happens After

## Sending

1. **Contracts → New Contract** (wizard): pick template → records → review → signers → send.
2. The signer gets a link (email + copyable URL in the send dialog).
3. Sending for signature moves the opportunity to **Under Contract** automatically.

## Lifecycle

**Draft → Sent → Viewed → Signed → Executed → Closed.** The card's "Mark as…" button advances it when the counterpart happens offline; e-sign events advance it automatically.

## After execution

- Executed contract + opportunity moves to **In Disposition** — your dispo clock starts here.
- Close the deal in **Closing** when the money lands (see the Closing Coordination runbook).

## If a signer declines or goes cold

- Declined: the contract stays Sent — void it and re-send corrected. Log why in the contract notes.
- No activity for 48h: call the signer. Email follow-up alone converts poorly on contracts.`,
      },
      {
        title: "Deal File Hygiene",
        slug: "deal-file-hygiene",
        summary: "What must be attached to every deal before you call it closed.",
        tags: ["documents", "compliance", "records"],
        body: `# Deal File Hygiene

A closed deal without a complete file is a future problem (tax time, disputes, audits). Before **Close Deal & Record Revenue**, confirm the deal has:

- [ ] Executed PSA (signed copy attached to the contract record)
- [ ] Assignment agreement (if assigned)
- [ ] Buyer's EMD receipt
- [ ] Title commitment (and any exceptions you accepted)
- [ ] Settlement statement from closing
- [ ] Recorded deed confirmation (for double closes)

Attach documents in **Documents** and link them to the opportunity. The ledger records the money; this file records the *story* — you need both.`,
      },
    ],
  },
  {
    name: "CRM Operations",
    slug: "crm-operations",
    description: "Running the machine: stages, tasks, teams, and the contract wizard.",
    pages: [
      {
        title: "Stage Discipline: the Pipeline Lifecycle",
        slug: "stage-discipline",
        summary: "What each of the 10 stages means, when to move a deal, and what automations fire.",
        tags: ["pipeline", "stages", "workflow"],
        body: `# Stage Discipline: the Pipeline Lifecycle

One canonical stage list drives the Move Stage dialog, the pipeline board, and the filter. Move deals honestly — every stage change fires automations, notifications, and audit entries.

## The stages

| Stage | Meaning | Move when | Automations |
|---|---|---|---|
| **Lead** | Fresh, uncontacted | Created | — |
| **Contacted** | First conversation happened | Any real contact | — |
| **Negotiating** | Numbers on the table | Offer/counter in play | — |
| **Under Contract** | PSA signed | Contract executed | Due-diligence checklist (EMD, inspection, title, financing) |
| **In Disposition** | Marketing to buyers | Contract executed & dispo starts | Listing-required check + buyer outreach task |
| **Reserved** | Buyer committed | Buyer EMD/assignment | Closing-coordination checklist |
| **Sold** | Money recorded | **Close Deal & Record Revenue** | — |
| **Closed** | Wrap-up complete | Post-close admin done | — |
| **Dead** | Won't happen | Seller gone/numbers impossible | Requires notes |
| **Voided** | Contract cancelled | Contract voided | Requires notes |

## Rules

1. **Sold is set by the money, not by optimism** — closing the deal moves it; don't pre-move it.
2. **Dead/Voided need notes** — the reason is required and it's how patterns surface later.
3. Terminal stages (Closed/Dead/Voided) don't transition back — duplicate the opportunity if it resurrects.`,
      },
      {
        title: "Contract Wizard: Step by Step",
        slug: "contract-wizard-guide",
        summary: "The five steps from template to signed contract, with the shortcuts.",
        tags: ["contracts", "wizard", "e-sign"],
        body: `# Contract Wizard: Step by Step

Open it from **Contracts → New Contract**, or from an opportunity's **Generate Contract** button (that prefills the deal).

## Step 1 — Template

Pick the template (PSA, assignment, addendum, NDA, JV…). The right-aligned record preview shows what you're starting from.

## Step 2 — Records

Link the **property/opportunity**, the buyer, and the seller contact. Everything you link here auto-fills the merge fields — prices, names, addresses — so you don't retype (and can't typo) them.

## Step 3 — Review

The merged document preview. Check the four numbers: price, EMD, closing date, inspection deadline. Edit inline if something merged wrong.

## Step 4 — Signers

Add every signer with name, email, role, and signing order. Sellers and buyers both; order matters when one party must sign first.

## Step 5 — Send

Send for signature. What happens automatically:

- Signers get their link (email + copyable URL).
- The opportunity moves to **Under Contract**.
- Contract events (viewed/signed/declined) fire notifications if you've enabled them in Settings.

## When to use the Advanced Generator instead

**Document Management** (contract-generator) is the power tool: template library management, LOIs, closing tab, and per-contract PDFs. For a standard contract on a live deal, the wizard is faster.`,
      },
      {
        title: "Follow-Up Cadence That Closes",
        slug: "follow-up-cadence",
        summary: "The touch schedule for every lead state, and how tasks + campaigns do the remembering.",
        tags: ["follow-up", "tasks", "campaigns"],
        body: `# Follow-Up Cadence That Closes

Deals are lost in the gaps between touches. The cadence:

## New lead
- **Day 0:** call + text. **Day 2:** call. **Day 5:** text. **Day 10:** call. **Day 21:** "still buying in your area" text. Then monthly.

## Active negotiation
- Touch every 3 days until signed. If they go quiet 7 days, send the "changing circumstances?" text — motivation changes, and the cheapest deal is the one already negotiated.

## Dead leads
- Monthly auto-text via **Campaigns** ("Has anything changed with the property?"). The best acquisition months of the year are leads that died 6 months ago.

## How the CRM remembers (so you don't)

1. **Stage automations** create the checklists (due diligence, closing) — do the tasks, don't recreate them.
2. **Tasks** with due dates show in **Today** and nag on the dashboard.
3. **Campaigns** handle the long-cycle touches automatically.
4. **Notifications** settings control what pings you — contract events and stage changes are the two to leave on.`,
      },
      {
        title: "Team Roles & Access",
        slug: "team-roles",
        summary: "Who can do what: owner, admin, member, viewer — and feature flags.",
        tags: ["teams", "permissions", "admin"],
        body: `# Team Roles & Access

## Roles

| Role | Can |
|---|---|
| **Owner** | Everything + team management, billing, delete team |
| **Admin** | All features + team settings; docs authoring; automations |
| **Member** | Daily work: leads, opportunities, contracts, dialer, tasks |
| **Viewer** | Read-only dashboards and lists |

## Feature flags

Admins toggle modules per deployment in **Settings → Features**. If a menu item is missing for you, it's a flag or a role — ask your admin.

## Documentation

This playbook is editable: admins and the owner can edit any page (Edit button in the reader). Keep the docs current — when the process changes, change the doc in the same sitting.`,
      },
    ],
  },
];

function slugify(v: string): string {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

/**
 * Seeds the playbook exactly once per team: only when the team has zero docs
 * categories AND zero pages. Never overwrites user edits; the version constant
 * is informational (log line) rather than a re-seed trigger on purpose.
 */
export async function seedDocsForTeam(teamId: number): Promise<{ categories: number; pages: number }> {
  try {
    const [cats, pages] = await Promise.all([storage.listDocsCategories(teamId), storage.listDocsPages(teamId, { includeUnpublished: true })]);
    if (cats.length > 0 || pages.length > 0) return { categories: 0, pages: 0 };

    let catCount = 0;
    let pageCount = 0;
    let catOrder = 0;
    for (const c of DOCS_SEED) {
      let category = await storage.createDocsCategory({
        teamId,
        name: c.name,
        slug: c.slug,
        description: c.description,
        sortOrder: catOrder++,
      });
      if (!category?.id) {
        const existing = (await storage.listDocsCategories(teamId)).find((x: any) => x.slug === c.slug);
        if (!existing) continue;
        category = existing;
      }
      catCount += 1;
      let pageOrder = 0;
      for (const p of c.pages) {
        await storage.createDocsPage({
          teamId,
          categoryId: category.id,
          title: p.title,
          slug: p.slug,
          summary: p.summary,
          body: p.body,
          tags: p.tags,
          sortOrder: pageOrder++,
          isPublished: true,
        });
        pageCount += 1;
      }
    }
    console.log(`[docs-seed] seeded team ${teamId}: ${catCount} categories, ${pageCount} pages (v${DOCS_SEED_VERSION})`);
    return { categories: catCount, pages: pageCount };
  } catch (e: any) {
    console.error("[docs-seed] failed:", e?.message);
    return { categories: 0, pages: 0 };
  }
}

export { slugify as docsSlugify };
