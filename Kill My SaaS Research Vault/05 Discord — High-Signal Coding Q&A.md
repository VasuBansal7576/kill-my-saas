---
source: "Kill My SaaS Discord"
capture_type: curated_exact_quotes_with_classification
captured_at: 2026-08-09
raw_archive: "[[06 Discord — Raw Archive Index]]"
---

# 05 Discord — High-Signal Coding Q&A

This note separates coding-relevant signal from conversation noise. The quoted question/answer text is preserved exactly. Classification and implementation consequences are editorial. Nothing was removed from the raw archive.

## Confirmed Organizer Clarifications

### Open Source Is Desired, But Not A Hard Requirement

Question — heathweaver, 2026-08-08:

> @swyx.io is the open source aspect a hard req?

Answer — swyx.io:

> no it is not but we'd like to use your code if you win

Source: [Discord thread](https://discord.com/channels/1535542355728408629/1535553792043646976) · Exact archive: [[06B Discord — Raw Thread Archive]]

Implementation consequence: deliver accessible code because the organizer wants to use the winning implementation, but the Discord clarification explicitly says open source is not a hard gate. This is newer/more specific than the brief's submission wording.

### Airtable Is Bonus-Level, Not Required

Question — bodhi, 2026-08-08:

> @swyx.io the persistence db being airtable is dicey coz it could hit performance of the apis. how do you folks interface with airtable. do you like use your service UI and then again go to airtable to interact directly?

Answer — swyx.io:

> yes correct - to be clear this is a nice to have if u dont use it its not a minus

Follow-up — swyx.io:

> but the team does love being able to augment data in airtable and in the past when i had a private developer only database they were frustrated

Source: [Discord thread](https://discord.com/channels/1535542355728408629/1535654670129700955) · Exact archive: [[06B Discord — Raw Thread Archive]]

Implementation consequence: do not sacrifice correctness or performance merely to make Airtable the primary database. A reliable export/sync/integration path can serve the team's desire to inspect and augment data.

### Standards-Compliant ICS Is Enough

Question — sneg55, 2026-08-08:

> Hi, Nick here. Calendar invites: is a standards-compliant .ics email invite sufficient for Gmail/Outlook/iCal, or is deeper calendar-API integration expected?

Answer — swyx.io:

> ics good enough

Source: [Discord thread](https://discord.com/channels/1535542355728408629/1535580247951540234) · Exact archive: [[06B Discord — Raw Thread Archive]]

Implementation consequence: prioritize valid `.ics` generation and delivery/download over separate Google Calendar and Outlook API integrations.

### Cloudflare Is Optional

Question — bodhi, 2026-08-09:

> While using cloudfare the project will get a little tied with its specific services. is that an ok assumption to make that it could be open source but still be locked to run on cloudfare. (there is way to run it locally which I am doing for my testing).

Answer — swyx.io:

> its fine as far as i'm concerned, but again, if u dont like cloudflare you're free to propose other services, i dont care, it is just a nice to have since our other internal tools are on cloudflare

Source: [Discord thread](https://discord.com/channels/1535542355728408629/1535809362176778271) · Exact archive: [[06B Discord — Raw Thread Archive]]

Implementation consequence: Cloudflare alignment may earn mild bonus value, but platform choice should not block the core product.

### Use Product Sense To Fill Gaps

Organizer statements:

> think theres also a lot of “pls use your common sense and product sense to fill in any blanks we didnt cover”

> (remember: if in doubt; use your product sense/common sense/go to their website)

Exact archive: [[06B Discord — Raw Thread Archive]]

Implementation consequence: unresolved details should be handled with coherent event-management conventions, then verified against the eval specs and Sessionboard references.

### Usability Matters More Than Screenshot Copying

Organizer statements:

> for those who dont want to parse thru the video i have now uploaded dozens of screenshots for you to feed into clanker. note that these are just samples of the app to explain functionality... use your judgment (or clanker judgement) to understand how these screens should fit together in a useful way for users to actually use in their work. just blindly copying the screens/forms but they dont work will not be in the spirit of the competition

> impressive! but make sure its actually usable! ha

Exact archives: [[06A Discord — Raw Channel Archive]] · [[06B Discord — Raw Thread Archive]]

Implementation consequence: implement complete, navigable round trips and persisted state before visual mimicry.

## Evaluation And Delivery Signal

- The organizer announced an LLM-as-judge evaluator for self-evaluation and Wednesday submissions. The complete evaluator is preserved in [[03 Evals — Complete Repository]].
- The evaluator is implementation-agnostic and tests cross-role workflows, persistence, rule enforcement, public surfaces, and manual side effects.
- The brief asks for a deployed site that evaluators can operate end to end. Broken authentication or empty demo state can prevent coverage even when code exists.

## Useful Questions Without A Captured Organizer Answer

These are useful design questions, but they must not be treated as confirmed requirements merely because someone asked them:

- Is an admin UI mandatory, or can an agentic event-management interface replace it?
- Can speakers edit a submission until the CFP closes? What changes after acceptance?
- Does every co-speaker receive a separate portal account?
- Are rich-text descriptions, bios, and welcome messages needed?
- Are Accept Queue and Decline Queue merely unsent-decision staging states?
- Are reviewer scores blind from other reviewers?
- Do unfinished drafts count toward submission limits?
- Do file requests need a central download-all view?
- How should media uploads be handled?
- What exact Accelevents behavior is expected without API access?

Resolve these in this order: exact eval spec → feature documentation in the eval repo → Sessionboard reference library → reasonable product decision. Record deliberate choices in the implementation repository.

## Noise Preservation

The complete 430-message corpus remains available through [[06 Discord — Raw Archive Index]], including greetings, coworking logistics, participant tech-stack discussions, jokes, product opinions, unanswered questions, and all 17 downloaded attachments.

Related: [[03 Evals — Complete Repository]] · [[04 Sessionboard — Product Reference Library]] · [[08 Build Requirements Crosswalk]] · [[00 Start Here — Kill My SaaS]]
