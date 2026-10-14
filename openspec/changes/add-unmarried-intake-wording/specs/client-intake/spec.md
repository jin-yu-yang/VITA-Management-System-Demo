## ADDED Requirements

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
