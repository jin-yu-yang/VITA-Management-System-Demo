# client-intake Specification

## Purpose
How a tax-season application's intake form is chosen and kept, and what it asks. It covers which intake version a new application gets, whether the client starts it or the office enters it for a walk-in client. It covers that an application keeps its version for life, and which version a workspace's sample cases are seeded in. It also covers what the form asks and requires before it can be submitted, whoever fills it: a household member's name, and the Form 15080 signatures. And it covers how the form's wording and options follow the client's marital status, so that a client who isn't married is never asked about a spouse.

## Requirements

### Requirement: New applications use intake version 2
Version 2 SHALL be the only intake version a workspace or an application accepts. A workspace's default intake version SHALL be 2, and setting it to any other value SHALL be refused. Every new application SHALL be version 2, whether a client starts their own or the office starts one for a walk-in client with Add a case.

#### Scenario: A new workspace defaults to version 2
- **WHEN** a workspace is created without naming an intake version
- **THEN** its default intake version is 2

#### Scenario: An existing workspace is switched to version 2
- **WHEN** version 1 is removed from a database where a workspace is still set to version 1
- **THEN** every workspace's default intake version is 2

#### Scenario: Setting a workspace to version 1 is refused
- **WHEN** a workspace's default intake version is set to 1
- **THEN** the change is refused and the workspace stays at version 2

#### Scenario: A client's new application is version 2
- **WHEN** a client starts a new application
- **THEN** the application's intake version is 2

#### Scenario: The office's new application is version 2
- **WHEN** the office starts an assisted application for a walk-in client
- **THEN** the application's intake version is 2

### Requirement: An application's intake version never changes
An application's intake version SHALL be fixed when the application is created. It SHALL NOT change when the application is updated, and a direct change of an application's version SHALL be refused.

#### Scenario: Updating an application does not change its version
- **WHEN** a version-2 application's answers are saved
- **THEN** its intake version is still 2

#### Scenario: Changing an application's version directly is refused
- **WHEN** an application's intake version is changed directly
- **THEN** the change is refused and the version stays 2

### Requirement: Sample cases are version 2
Resetting a workspace's sample cases SHALL seed six samples, every one a version-2 application.

#### Scenario: A reset seeds version-2 samples
- **WHEN** the sample cases are reset in a workspace
- **THEN** six samples are seeded and every one is a version-2 application

### Requirement: A household member may have a middle name
A household member SHALL have an optional middle name (`hh[i].middle_name`), asked between the first and last name in both the standard and senior versions of the form. Leaving it empty SHALL NOT block the member or the application. The member's summary line, shown in the client's review summary, the office's review and the staff answers panel, SHALL read first, middle and last name, separated by single spaces, skipping any part that is empty. Document cards SHALL keep the member's first and last name, as the taxpayer's and spouse's cards do.

#### Scenario: A member is saved with a middle name
- **WHEN** a client adds a household member with first name "Ana", middle name "Mei" and last name "Lin", and saves
- **THEN** the member's answers include `middle_name` "Mei", and the member's summary line reads "Ana Mei Lin"

#### Scenario: A member without a middle name is complete
- **WHEN** a household member has every required field answered and no middle name
- **THEN** no missing answer is reported for that member, and the member's summary line reads "Ana Lin"

### Requirement: A client who consents to Form 15080 signs it
When the client answers "I consent" to Form 15080 (`gcf_consent = yes`), the primary taxpayer signature SHALL be required to submit. If the client is also married (`marital_status = married`), the spouse signature SHALL be required too. Consent itself and both signature dates SHALL stay optional. The same rule SHALL apply whoever fills the application, the client or the office. The Form 15080 sub-step SHALL NOT be marked done while a required signature is missing.

#### Scenario: Consent without the primary signature is refused
- **WHEN** an application with `gcf_consent = yes` and no primary signature is submitted
- **THEN** submission is refused with a validation error, and `gcf_tp_signature` is listed as missing

#### Scenario: A married client's consent needs the spouse signature
- **WHEN** a married client consents, signs as the primary taxpayer, and leaves the spouse signature empty
- **THEN** submission is refused, `gcf_sp_signature` is listed as missing, and the Form 15080 sub-step is not marked done

#### Scenario: An unmarried client's consent needs only the primary signature
- **WHEN** a client who is not married consents and signs as the primary taxpayer
- **THEN** no 15080 answer is missing, and the dates may stay empty

#### Scenario: Declining consent needs no signature
- **WHEN** the client answers "I do not consent", or leaves the consent unanswered
- **THEN** no 15080 signature is required

#### Scenario: An office-filled application meets the same rule
- **WHEN** office staff submit an application they filled, with `gcf_consent = yes` and no primary signature
- **THEN** submission is refused the same way as for a client

### Requirement: An unmarried client isn't asked about a spouse
A client whose marital status is anything other than married, including not yet answered, SHALL see wording that names no spouse in:
- the questions Q5.2 (`claimed_by_other`), Q9.1a (`inc_wages_job_count`) and Q12.4 (`opt_veteran`);
- the leads of the income, expense and event sub-steps;
- section 6's household intro;
- the direct-deposit document card's hint, and its office version.

Married clients SHALL see the wording that names the spouse. The rule SHALL be the same one that decides whether the "My spouse" option is offered. Every screen that shows one application SHALL use that application's answers to choose: the client's form, review, the office's form and the staff answers panel. The senior version's married leads SHALL name the spouse as 您爱人 in Chinese.

#### Scenario: A never-married client
- **WHEN** a client whose marital status is never married, and who answered yes to wages, opens the wages sub-step
- **THEN** its lead reads "Did you receive any of these in 2025?" and Q9.1a reads "How many jobs did you have in 2025?"

#### Scenario: A married client
- **WHEN** a married client who answered yes to wages opens the wages sub-step
- **THEN** its lead reads "Did you or your spouse receive any of these in 2025?" and Q9.1a reads "How many jobs did you and your spouse have in 2025?"

#### Scenario: Marital status not answered yet
- **WHEN** a client who hasn't answered marital status opens Q5.2
- **THEN** it reads "Can anyone else (such as a parent or adult child) claim you as a dependent on their tax return?"

#### Scenario: The direct-deposit card for an unmarried client
- **WHEN** a never-married client chooses direct deposit for their refund
- **THEN** the bank card's hint reads "The account must be in your name." (账户必须是您名下的账户。), and the office's version reads "The account must be in the client's name."

#### Scenario: The direct-deposit card for a married client
- **WHEN** a married client chooses direct deposit for their refund
- **THEN** the bank card's hint reads "The account must be in your name (or your spouse's).", and the office's version reads "The account must be in the client's or spouse's name."

#### Scenario: Staff see the wording the client saw
- **WHEN** staff open the answers panel of a divorced client's application
- **THEN** Q12.4's row reads "Are you a veteran of the U.S. Armed Forces?"

#### Scenario: The senior married lead in Chinese
- **WHEN** a married client using the senior version reads the wages lead in Simplified Chinese
- **THEN** it reads "2025 年，您或您爱人是否有以下收入？"

### Requirement: An unmarried client answers the "who" questions with Yes or No
For a client who isn't married, by the same rule:
- Q5.3–Q5.9 (`us_citizen`, `on_visa`, `fulltime_student`, `legally_blind`, `disabled`, `ippin`, `digital_assets`) SHALL ask about the client directly, for example "Are you a U.S. citizen?" / 您是美国公民吗？
- Every "who" question (Q5.3–Q5.9, Q8.1 `irs_language_pref`, Q8.3 `pecf`) SHALL offer **Yes** and **No** as radio buttons, using the yes/no labels.

Yes SHALL save the answer the client's own option saves (`["me"]`), and No SHALL save the "No one" answer (`["none"]`). So the saved answers, the document cards and the draft 13614-C SHALL be unchanged.

A married client SHALL keep today's questions, with Me, My spouse and No one as check boxes.

Every screen that shows one application's answers SHALL label an unmarried client's "who" answers Yes or No: the review summary, the office's form, the staff answers panel, and the document cards' "Asked by:" lines.

#### Scenario: An unmarried client's citizenship question
- **WHEN** a never-married client opens Q5.3
- **THEN** it reads "Are you a U.S. citizen?", with radio buttons Yes and No, and choosing Yes saves `["me"]`

#### Scenario: In Chinese
- **WHEN** a never-married client reads Q5.3 in Simplified Chinese on the standard form
- **THEN** it reads "您是美国公民吗？", with the options 是 and 否

#### Scenario: A married client keeps the "who" question
- **WHEN** a married client opens Q5.3
- **THEN** it reads "Who is a U.S. citizen?", with check boxes Me, My spouse and No one

#### Scenario: Section 8's "who" questions
- **WHEN** a never-married client opens Q8.3
- **THEN** its options are radio buttons Yes and No

#### Scenario: Staff and the office see Yes or No
- **WHEN** staff open the answers panel of a never-married client who answered Q5.4 with No
- **THEN** the row reads "Were you in the U.S. on a visa in 2025?" with the answer "No"
