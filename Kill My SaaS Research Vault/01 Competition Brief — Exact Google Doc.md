---
source: "https://docs.google.com/document/d/1rBHJtiNKHv4i43tdf2Rm0sDEYuIcajhmAPoBKR_Az-A"
source_title: "$10,0000 Kill My SaaS - Competition Brief"
capture_type: exact_text
captured_at: 2026-08-09
---

# High Level Brief

![[.archive/research-evidence/Attachments/Competition Brief Images/01 - High Level Brief - kix.egxvpdar96kg.png]]

Thanks for joining this last min remote hackathon organized out of real frustration!

We are looking to replace Sessionboard, which costs >$40k a year:

We do NOT expect to use everything... Which makes it easier for you to clone and makes less sense for us to pay. 

Primary features we are looking for from an open source clone that YOU make (and keep):

- Custom call-for-speakers submission forms with conditional logic and category-based routing

- Self-service speaker portal for bios, headshots, slides, and supporting documents

- Automated, templated speaker communications, including reminders and calendar invites delivered directly to each speaker's own calendar (Gmail, Outlook, iCal)

- Submission evaluation and scoring workflows, including optional AI-assisted review across multiple rounds

- Drag-and-drop schedule and agenda building, with automatic conflict detection across rooms and tracks, viewable by list, day, week, track, or room

- Real-time dashboard showing which speakers still have outstanding onboarding tasks

- Native, one-way integration with Accelevents (our existing registration platform) to eliminate manual data re-entry

- Resource and wiki pages within the speaker portal, including HTML embed support for existing reference material

- Embeddable, mobile-friendly speaker gallery and schedule itinerary we can post to our website

Cloning the exact design is not a requirement; the point is to make a good-enough open source alternative that we never have to pay for this closed source SaaS if we can help it.

## (IMPORTANT) Video Walkthrough: platform & requirements

![[.archive/research-evidence/Attachments/Competition Brief Images/02 - IMPORTANT Video Walkthrough platform & requirements - kix.388atx2cix4h.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/03 - IMPORTANT Video Walkthrough platform & requirements - kix.5c982n1skkjq.png]]

https://youtu.be/vUuK4Knl7oc 

This is a very hastily recorded walkthrough going thru the requirements in detail with visual references for your clanker (UPDATE: SEE BELOW FOR SCREENSHOTS) - we will do a more polished one on Saturday and one on Sunday morning clarifying requirements based on your feedback, after which we will FREEZE adding any requirements so that you can have some certainty/polish.

more product walkthroughs for your clanker / yourself to validate https://learn.sessionboard.com/videos/overview

primarily interested in 

- https://www.sessionboard.com/products/call-for-papers

- https://www.sessionboard.com/capabilities/speaker-management

- https://www.sessionboard.com/products/abstract-management

- https://www.sessionboard.com/capabilities/content-management

- https://www.sessionboard.com/capabilities/speaker-management

- https://www.sessionboard.com/capabilities/conference-speaker-management

- https://www.sessionboard.com/capabilities/ai-agenda (less so but cover the basics)

- https://www.sessionboard.com/capabilities/sessions-list-1

- List of Sessions

- List of Speakers

- Agenda

- Schedule Itinerary

- Speaker Gallery

participant POV https://learn.sessionboard.com/participants/overview

organizer POV https://learn.sessionboard.com/get-started/overview

extra features optional

- https://www.sessionboard.com/products/speaker-crm

## Discord

https://discord.gg/XYXaapF4q <- all updates and questions and communication here

## Competition rules

- Timeline: aim to be done in a weekend, but you may need more time esp because we are starting late, so:

- you have until Wednesday Aug 12 10PM PT to submit!

- Submission involves:

- Fill out our form we will send out

- Open source repo with your code

- so that you walk away with something regardless

- Deployed site we can test out with the walkthrough shown 

- Because so many people signed up, I can’t proactively cover tokens, but people who SUBMIT valid attempts can ask for reimbursement for up to $500 in token cost (will ask for proof, and will subjectively judge if there was a real attempt made)

- This includes people just using their codex pro/claude max subscriptions

- The winning submission will:

- Pass AIE team (not swyx) independent evaluation

- Tiebreaker will go to whoever has made subjective judgment calls for the product that we would actually use/buy

- Get $10,000 cash

- Get on a call to do a walkthrough/interview for writeup on latent.space

- Tech stack:

- Choose whatever coding agents you want

- Choose whatever language/tools/frameworks you want

- Mild bonus points for deploy to Cloudflare infra

- Bonus points for persistence/DB using Airtable

- (Because those are what we use on our team)

- Very teeny bonus points for hosting source code/site on Forge instead of GitHub

- (because this is my side project)

- Bonus points for speed/performance

- we do not want slow SaaS pls

- Bonus points for API

- https://sessionboard.mintlify.app/introduction 

Questions welcome in Discord! https://discord.gg/XYXaapF4q 

## SCREENSHOTS

### Basic event config

![[.archive/research-evidence/Attachments/Competition Brief Images/04 - Basic event config - kix.3fpmc9cx468w.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/05 - Basic event config - kix.lgzhzcd1iazg.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/06 - Basic event config - kix.mvx569ipbkgv.png]]

### Program > Submission Forms > Create

![[.archive/research-evidence/Attachments/Competition Brief Images/07 - Program - Submission Forms - Create - kix.ttynv51aw4zf.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/08 - Program - Submission Forms - Create - kix.9rcqai50eqx9.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/09 - Program - Submission Forms - Create - kix.b2n8628t9ju.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/10 - Program - Submission Forms - Create - kix.sra9yn13r1uh.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/11 - Program - Submission Forms - Create - kix.zeohpuume5an.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/12 - Program - Submission Forms - Create - kix.8opbpb4omcm1.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/13 - Program - Submission Forms - Create - kix.zerdl3rrxt61.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/14 - Program - Submission Forms - Create - kix.1wxej0ip6fow.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/15 - Program - Submission Forms - Create - kix.kr7h3qo5krkf.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/16 - Program - Submission Forms - Create - kix.lwsz0wqfqmks.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/17 - Program - Submission Forms - Create - kix.284tq07o7gsf.png]]

### Public CFP Page looks like this

https://appv2.sessionboard.com/submit/ai-engineer-sandbox-event/b7d4d7cd-3012-45c2-9c08-a8ee9185182f 

![[.archive/research-evidence/Attachments/Competition Brief Images/18 - Public CFP Page looks like this - kix.imcsg4zhkvmt.png]]

### Speaker portal after submission

![[.archive/research-evidence/Attachments/Competition Brief Images/19 - Speaker portal after submission - kix.vzvxr1u82f2k.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/20 - Speaker portal after submission - kix.vm50yki4sm75.png]]

### Program > Abstracts

![[.archive/research-evidence/Attachments/Competition Brief Images/21 - Program - Abstracts - kix.cq3ikt8oqbkh.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/22 - Program - Abstracts - kix.jph2vppcbh0s.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/23 - Program - Abstracts - kix.lop8eb3avyyy.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/24 - Program - Abstracts - kix.slx87r6n7nc5.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/25 - Program - Abstracts - kix.fg438sd3babq.png]]

### Program > Agenda

![[.archive/research-evidence/Attachments/Competition Brief Images/26 - Program - Agenda - kix.5rjjlkb46gz2.png]]

### Portal > Tasks 

For speakers to complete after admisssion

![[.archive/research-evidence/Attachments/Competition Brief Images/27 - Portal - Tasks - kix.5wexk4d15da.png]]

### Portal > Forms

For speakers to fill out a form in a Task

![[.archive/research-evidence/Attachments/Competition Brief Images/28 - Portal - Forms - kix.lr5yve6n5xsr.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/29 - Portal - Forms - kix.5vi0r4xkz9qi.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/30 - Portal - Forms - kix.h2njpd6s4sd7.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/31 - Portal - Forms - kix.sw06tnm8pkr5.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/32 - Portal - Forms - kix.r75uf357p9eg.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/33 - Portal - Forms - kix.s9me1uzbk8do.png]]

### CMS > Embeds (OPTIONAL)

![[.archive/research-evidence/Attachments/Competition Brief Images/34 - CMS - Embeds OPTIONAL - kix.emqxa7abjpq5.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/35 - CMS - Embeds OPTIONAL - kix.o2vvtzt6bw18.png]]

### Dashboard (optional but nice to have, best efforts)

![[.archive/research-evidence/Attachments/Competition Brief Images/36 - Dashboard optional but nice to have, best efforts - kix.21ela83fxcfo.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/37 - Dashboard optional but nice to have, best efforts - kix.ngxsrlbf2op5.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/38 - Dashboard optional but nice to have, best efforts - kix.2p9d5sov9fre.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/39 - Dashboard optional but nice to have, best efforts - kix.npgjsnhumxar.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/40 - Dashboard optional but nice to have, best efforts - kix.b6apky9eiz91.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/41 - Dashboard optional but nice to have, best efforts - kix.mk0kvie1d0gc.png]]

![[.archive/research-evidence/Attachments/Competition Brief Images/42 - Dashboard optional but nice to have, best efforts - kix.3pxoojt9st3k.png]]

Image-only companion index: [[01A Competition Brief — Image Index]]

Related: [[00 Start Here — Kill My SaaS]] · [[02 Official Walkthrough — Exact Transcript]] · [[03 Evals — Complete Repository]]
