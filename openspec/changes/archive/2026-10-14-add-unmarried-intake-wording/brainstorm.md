# Brainstorm: add-unmarried-intake-wording

A raw capture of the design agreed in the conversation on 2026-10-13 and 2026-10-14, during CLAUDE.md lifecycle step 2 (`/opsx:explore` and the brainstorm).

## Background

- **The user's review** of the intake screen raised four fixes, ordered as separate OpenSpec changes:
  1. `require-15080-signatures-and-household-middle-name`: merged as #65 (fc80386), migration 024.
  2. **This change:** an unmarried client still reads "you and your spouse". For example:
     - "How many jobs did you and your spouse have in 2025?" (Q9.1a);
     - the income lead "Did you or your spouse receive any of these in 2025?".

     The user asked to drop the spouse from these for a client who isn't married.
  3. `gate-review-and-redesign-summary`, raised during this explore. It comes next, as its own change.
  4. `allow-multiple-service-languages`.
- **Inventory**, taken from the generated catalogue (every place an unmarried client sees "spouse"). The user reviewed it: "It covered all the questions that needs to drop 'spouse' if the answered never married."
  - Q5.2 `claimed_by_other`, Q9.1a `inc_wages_job_count`, Q12.4 `opt_veteran`.
  - Sub-step leads, defined by three builder constants (`tools/build-intake-catalogue.mjs:73-75`):
    - `RECEIVED`: `income.wages`, `.retirement`, `.investments`, `.rental`, `.business`, `.other`;
    - `PAID`: `expenses.deductible`, `.other`;
    - `HAPPENED`: `expenses.events`.
  - Section 6's intro: "(except your spouse)", and in the senior form "(not your spouse)".
  - **No change needed:**
    - Section 4, Q3.3, `opt_race_sp` and the spouse signature and date questions: they already show only when married;
    - section 0's page text: it comes before marital status is asked;
    - "former spouse" in the alimony questions: correct for anyone;
    - `spouse_death_year`: it shows only for widowed clients.
- **How wording is shown today:**
  - `wording(question, { variant, lang })` (`src/intake-catalogue.mjs:45`) takes no answers. It's called in about 15 places: the client's form, the review alerts and summary, the compare table, the office's form, the staff answers panel, and the draft 13614-C's "not sure" lines.
  - Leads render in `intake-views.mjs:228` and `office-views.mjs:421`. Section intros render in `intake-views.mjs:233`.
- **Precedent:** document cards already switch "For you" and "For you and your spouse" on marital status (`document-cards.mjs:521`). The builder already supports a conditional tip, `> Tip (show if …):`.
- **Supporting machinery:**
  - The 繁體 sources collect every `{en, zh}` pair in the catalogue (`tools/hant-sources.mjs`, `walkPairs`), so new text joins `build:hant` with no extra work.
  - A change of marital status already redraws the form, because `spouseShowIf` drives a redraw (`intake-form.mjs:632`).
  - Wording isn't stored in the database, but any catalogue change still writes a new catalogue migration (025), because the hash covers the whole catalogue.

## Decision chain

**Q1. How the text switches.**
- Options:
  - (A) conditional wording in the catalogue: an unmarried text, picked when the application's answers say the client isn't married;
  - (B) one neutral wording for everyone;
  - (C) placeholders in the text, which break down in Chinese.
- **Decided (user): A.** The wages-lead text the user first gave was a typo for "Did you receive any of these in 2025?".

**Q2. What counts as "married".**
- Options:
  - (A) reuse `who.spouseShowIf` exactly: married gets the spouse wording, and everything else, unanswered included, gets the unmarried wording;
  - (B) married or unanswered gets the spouse wording;
  - (C) widowed with a death year of 2025 also gets the spouse wording.
- **Decided (user): A.**
- **Widowed, out of scope:** a later fix will ask a widowed client "has your spouse been deceased for more than two years?". If not, the intake still needs the spouse's name and info. That fix covers the "My spouse" option as well as the wording.

**Q3. Which screens switch.**
- Options:
  - (A) every screen that shows one application uses that application's answers: the client's form, review, the compare table, the office's form, the staff panel, and the draft's "not sure" lines;
  - (B) the client's and office's forms only;
  - (C) the client's form only.
- **Decided (user): A.**

**Q4. The wording** (the user said "The wording looks right"):

| Item | Version | Unmarried English | Unmarried 简体 |
|---|---|---|---|
| Q5.2 | standard | Can anyone else (such as a parent or adult child) claim you as a dependent on their tax return? | 是否有其他人（如父母或成年子女）可以在其报税表上将您列为受抚养人？ |
| Q5.2 | senior | Can someone else (like a parent or grown child) list you as a dependent on their tax return? | 有没有别人（比如您的父母或成年子女）报税时，会把您写进他们的税表里，算作由他们养活的人？ |
| Q9.1a | standard | How many jobs did you have in 2025? | 2025 年您共有几份工作？ |
| Q9.1a | senior | How many jobs did you have in 2025? | 2025 年，您一共做了几份工作？ |
| Q12.4 | standard | Are you a veteran of the U.S. Armed Forces? | 您是否为美国退伍军人？ |
| Q12.4 | senior | Are you a U.S. military veteran? | 您是美国退伍军人吗？ |
| Income leads (6) | both | Did you receive any of these in 2025? | 2025 年，您是否有以下收入？ |
| Expense leads (2) | both | Did you pay for any of these in 2025? | 2025 年，您是否支付过以下费用？ |
| Events lead (1) | both | Did any of these happen to you in 2025? | 2025 年，您是否发生过以下事项？ |
| Section 6 intro | standard | List **everyone who lived with you in 2025**, and **anyone you financially supported** who did not live with you. | 请列出 2025 年与您同住的所有人，以及未与您同住但由您提供经济支持的人。 |
| Section 6 intro | senior | Tell us about **everyone who lived with you in 2025**. (Lines 2–3 unchanged.) | 请告诉我们 2025 年和您住在一起的所有人，以及虽然不住在一起、但您出钱养的人。（second line unchanged） |

The group's wording review can still adjust the Chinese.

**Q5. The senior married leads' Chinese.**
- Today the three leads share one text across both versions, so the senior leads say 配偶, while senior wording says 您爱人 everywhere else.
- **Decided (user): yes, switch them to 您爱人.** That gives:
  - 2025 年，您或您爱人是否有以下收入？
  - 2025 年，您或您爱人是否支付过以下费用？
  - 2025 年，您或您爱人是否发生过以下事项？

  Their English doesn't change.

**Q6. Order.** The user raised the Step 9 review gate and summary redesign during this explore. **Decided (user): it's its own change, after this one.**

**Q7. The direct-deposit card (user, at the planning review, 2026-10-14).**
- The bank card (`document-cards.mjs:472–474`) shows every client "The account must be in your name (or your spouse's)." / 账户必须是您（或配偶）名下的账户。
- **Decided (user):** fix it in this change, with one more task and a test.
  - Not married: "The account must be in your name." / 账户必须是您名下的账户。
  - The office's version: "The account must be in the client's name."
  - Married: today's text stays.

**Q8. The "who" questions (final review, then the user, 2026-10-14).**
- **The finding:** the final whole-branch review found that the senior Chinese of Q5.3–Q5.9 says 您和您爱人 to an unmarried client. The inventory had scanned the English only.
- **First proposal:** drop "您和您爱人，". The user rejected it. A third-person "who" question ("谁是美国公民？") reads oddly when only one person can answer.
- **Decided (user):** for a client who isn't married (the same rule), each of these questions is asked directly, with Yes/No options. The married version stays as it is. The user confirmed four points:
  1. **Radio buttons** for Yes and No. A married client keeps the Me / My spouse / No one check boxes.
  2. **Every screen** that shows the answer labels it Yes/No for an unmarried client: the review summary, the office's form and the staff panel.
  3. **Section 8's two "who" questions** (Q8.1 IRS letters in another language, Q8.3 the $3 fund) get Yes/No too. Their wording is already direct, so only their options change.
  4. **The wording:**

| Q | Standard (not married) | Senior (not married) |
|---|---|---|
| 5.3 `us_citizen` | Are you a U.S. citizen? / 您是美国公民吗？ | Are you a U.S. citizen? / 您是美国公民吗？ |
| 5.4 `on_visa` | Were you in the U.S. on a visa in 2025? / 2025 年，您是否持签证在美国？ | Were you in the U.S. on a visa in 2025? / 2025 年，您是拿签证待在美国的吗？ |
| 5.5 `fulltime_student` | Were you a full-time student in 2025? / 2025 年，您是否为全日制学生？ | Were you a full-time student in 2025? / 2025 年，您有没有至少 5 个月是学校认定的全日制学生？ |
| 5.6 `legally_blind` | Are you legally blind? / 您是否属于法定失明？ | Are you legally blind? / 您有医生证明是法定失明吗？ |
| 5.7 `disabled` | Are you totally and permanently disabled? / 您是否属于完全且永久性残疾？ | Are you totally and permanently disabled? / 您是完全并且永久残疾吗？ |
| 5.8 `ippin` | Were you issued an Identity Protection PIN (IP PIN)? / 您是否持有国税局（IRS）发放的身份保护码（IP PIN）？ | Did you get an Identity Protection PIN (IP PIN) from the IRS? / 您收到过国税局（IRS）寄来的 6 位数字号码，叫"身份保护码"（IP PIN）吗？ |
| 5.9 `digital_assets` | Did you own or hold any digital assets (such as Bitcoin, Ethereum, or other cryptocurrency) in 2025? / 2025 年，您是否拥有或持有数字资产（如比特币、以太坊等加密货币）？ | Did you own or hold any digital money (like Bitcoin or other crypto) in 2025? / 2025 年，您拥有过数字货币（比如比特币、以太坊、狗狗币）吗？ |

- **The saved answer stays `["me"]` (Yes) or `["none"]` (No),** so the database rules, the document cards and the draft 13614-C don't change.
- **Migration (user's choice A1):** reset 025's row in `vitally-task2`'s migration ledger and regenerate 025 in place. It was never on `main`.
- **The "Asked by:" lines on the office and staff document cards** use the client's wording too. The visa, IP PIN and digital-asset cards ask these questions.

## Design (agreed)

- **Drafts** (both; the senior structure must equal the standard one):
  - **Questions:** a `> Not married: <English> / <中文>` line under Q5.2, Q9.1a and Q12.4.
  - **Section 6:** a `**Intro text (not married):**` block after the existing intro.
  - **Leads:** the builder's lead constants gain unmarried versions. The senior married Chinese becomes 您爱人, so the leads stop sharing one Chinese text across versions.
- **Catalogue keys,** in the existing `{ general: {en, zh}, senior: {en, zh} }` shape:
  - `wordingUnmarried` on the three questions;
  - `leadUnmarried` on the nine sub-steps;
  - `introUnmarried` on section 6.

  The build refuses a "Not married" text on a question whose wording doesn't mention a spouse, or one present in only one draft.
- **Code:**
  - `spouseShown(answers)` reuses `who.spouseShowIf`, with unanswered meaning not married.
  - `wording(question, { variant, lang, answers })` picks the unmarried text when it's given answers, the client isn't married, and the question has unmarried text. Leads and intros work the same way.
  - Without answers you get today's text.
  - Every screen that shows one application passes its answers.
- **Database:** generated migration 025, text only. It needs the user's OK to apply. No hand-written SQL.
- **Specs:**
  - `client-intake`: ADDED, "An unmarried client isn't asked about a spouse";
  - `draft-13614c`: ADDED, the draft's "Not sure" lines quote the wording the client saw.
- **Acceptance:**
  - unit: build, `wording()`, leads and intros, the staff panel, the draft line;
  - `build:hant -- --check`;
  - `db:migrate:test` and `test:database`, after the user's OK;
  - `test:browser`: the story's never-married client sees the unmarried wording, and the married client sees the spouse wording;
  - CI.
- **Out of scope:**
  - widowed less than two years;
  - the review gate and summary redesign;
  - multi-select languages;
  - section 0's page text.
- **The "who" questions (Q8):** for an unmarried client, Q5.3–Q5.9 are asked directly, Q5.3–Q5.9 and Q8.1/Q8.3 offer Yes/No radio buttons, and the answer is still saved as `["me"]`/`["none"]`. 025 is regenerated in place.
- **Direct-deposit card (Q7):** its hint follows the same married rule. It uses the cards' existing `isMarried`, which means the same as `spouseShown`.
