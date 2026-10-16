## MODIFIED Requirements

### Requirement: An unmarried client isn't asked about a spouse
A client for whom filing with a spouse isn't possible SHALL see wording that names no spouse. That is a client whose marital status is anything other than married, including not yet answered, except a widowed client whose spouse died in 2025. The wording without a spouse applies in:
- the questions Q5.2 (`claimed_by_other`), Q9.1a (`inc_wages_job_count`) and Q12.4 (`opt_veteran`);
- the leads of the income, expense and event sub-steps;
- section 6's household intro;
- the direct-deposit document card's hint, and its office version.

Married clients, and widowed clients whose spouse died in 2025, SHALL see the wording that names the spouse. The rule SHALL be "filing with the spouse possible": married, or widowed with `spouse_death_year` 2025. It SHALL be the same rule that decides whether the "My spouse" option is offered. Every screen that shows one application SHALL use that application's answers to choose: the client's form, review, the office's form and the staff answers panel. The senior version's married leads SHALL name the spouse as 您爱人 in Chinese.

For a widowed client whose spouse died in 2025, the direct-deposit hint SHALL instead read "The account must be in the name of one of the taxpayers on this return: your own account, or a joint account with your late spouse." (账户必须在该税单任一纳税人名下：您本人的账户，或您与已故配偶的联名账户。). Its office version SHALL read "The account must be in the name of one of the taxpayers on this return: the client's own account, or a joint account with their late spouse."

#### Scenario: A never-married client
- **WHEN** a client whose marital status is never married, and who answered yes to wages, opens the wages sub-step
- **THEN** its lead reads "Did you receive any of these in 2025?" and Q9.1a reads "How many jobs did you have in 2025?"

#### Scenario: A married client
- **WHEN** a married client who answered yes to wages opens the wages sub-step
- **THEN** its lead reads "Did you or your spouse receive any of these in 2025?" and Q9.1a reads "How many jobs did you and your spouse have in 2025?"

#### Scenario: A client whose spouse died in 2025
- **WHEN** a widowed client whose spouse died in 2025, and who answered yes to wages, opens the wages sub-step
- **THEN** its lead reads "Did you or your spouse receive any of these in 2025?"

#### Scenario: A client whose spouse died in 2023
- **WHEN** a widowed client whose spouse died in 2023, and who answered yes to wages, opens the wages sub-step
- **THEN** its lead reads "Did you receive any of these in 2025?"

#### Scenario: Marital status not answered yet
- **WHEN** a client who hasn't answered marital status opens Q5.2
- **THEN** it reads "Can anyone else (such as a parent or adult child) claim you as a dependent on their tax return?"

#### Scenario: The direct-deposit card for an unmarried client
- **WHEN** a never-married client chooses direct deposit for their refund
- **THEN** the bank card's hint reads "The account must be in your name." (账户必须是您名下的账户。), and the office's version reads "The account must be in the client's name."

#### Scenario: The direct-deposit card for a married client
- **WHEN** a married client chooses direct deposit for their refund
- **THEN** the bank card's hint reads "The account must be in your name (or your spouse's).", and the office's version reads "The account must be in the client's or spouse's name."

#### Scenario: The direct-deposit card after a spouse died in 2025
- **WHEN** a widowed client whose spouse died in 2025 chooses direct deposit for their refund
- **THEN** the bank card's hint reads "The account must be in the name of one of the taxpayers on this return: your own account, or a joint account with your late spouse."

#### Scenario: Staff see the wording the client saw
- **WHEN** staff open the answers panel of a divorced client's application
- **THEN** Q12.4's row reads "Are you a veteran of the U.S. Armed Forces?"

#### Scenario: The senior married lead in Chinese
- **WHEN** a married client using the senior version reads the wages lead in Simplified Chinese
- **THEN** it reads "2025 年，您或您爱人是否有以下收入？"

### Requirement: An unmarried client answers the "who" questions with Yes or No
For a client for whom filing with a spouse isn't possible, by the same rule ("filing with the spouse possible"):
- Q5.3–Q5.9 (`us_citizen`, `on_visa`, `fulltime_student`, `legally_blind`, `disabled`, `ippin`, `digital_assets`) SHALL ask about the client directly, for example "Are you a U.S. citizen?" / 您是美国公民吗？
- Every "who" question (Q5.3–Q5.9, Q8.1 `irs_language_pref`, Q8.3 `pecf`) SHALL offer **Yes** and **No** as radio buttons, using the yes/no labels.

Yes SHALL save the answer the client's own option saves (`["me"]`), and No SHALL save the "No one" answer (`["none"]`). So the saved answers, the document cards and the draft 13614-C SHALL be unchanged.

A married client, and a widowed client whose spouse died in 2025, SHALL keep today's questions, with Me, My spouse and No one as check boxes. When filing with the spouse stops being possible, the "who" answers SHALL drop the spouse. That happens when marital status changes, or when a complete, valid year of the spouse's death is entered. A partly typed or cleared year SHALL NOT drop the spouse.

Every screen that shows one application's answers SHALL label such a client's "who" answers Yes or No: the review summary, the office's form, the staff answers panel, and the document cards' "Asked by:" lines.

#### Scenario: An unmarried client's citizenship question
- **WHEN** a never-married client opens Q5.3
- **THEN** it reads "Are you a U.S. citizen?", with radio buttons Yes and No, and choosing Yes saves `["me"]`

#### Scenario: In Chinese
- **WHEN** a never-married client reads Q5.3 in Simplified Chinese on the standard form
- **THEN** it reads "您是美国公民吗？", with the options 是 and 否

#### Scenario: A married client keeps the "who" question
- **WHEN** a married client opens Q5.3
- **THEN** it reads "Who is a U.S. citizen?", with check boxes Me, My spouse and No one

#### Scenario: A spouse who died in 2025
- **WHEN** a widowed client whose spouse died in 2025 opens Q5.3
- **THEN** it reads "Who is a U.S. citizen?", with check boxes Me, My spouse and No one

#### Scenario: The year changes to an earlier death
- **WHEN** a widowed client who ticked My spouse in Q5.3, with the death year 2025, changes the death year to 2020
- **THEN** Q5.3 asks "Are you a U.S. citizen?" with Yes and No, and the saved answer no longer includes the spouse

#### Scenario: Retyping the year keeps the spouse
- **WHEN** a widowed client who ticked My spouse in Q5.3, with the death year 2025, deletes the year and types 2025 again
- **THEN** the saved answer to Q5.3 still includes the spouse

#### Scenario: Section 8's "who" questions
- **WHEN** a never-married client opens Q8.3
- **THEN** its options are radio buttons Yes and No

#### Scenario: Staff and the office see Yes or No
- **WHEN** staff open the answers panel of a never-married client who answered Q5.4 with No
- **THEN** the row reads "Were you in the U.S. on a visa in 2025?" with the answer "No"

## ADDED Requirements

### Requirement: A recently widowed client gives their late spouse's details
A widowed client whose spouse died in 2023 or later SHALL be asked about the spouse, under two rules defined once in the catalogue:
- **"Spouse on the return"** (married, or widowed with `spouse_death_year` from 2023 to 2025) SHALL ask the spouse's first, middle and last name and date of birth.
- **"Filing with the spouse possible"** (married, or widowed with `spouse_death_year` 2025) SHALL also ask the spouse's job title and the spouse's optional race question. It SHALL also give the spouse's Photo ID and Social Security card or ITIN letter document cards, and name the spouse in the who-question owners and the "For you and your spouse" owner line.

These SHALL stay married only:
- the spouse's phone;
- the Form 15080 spouse signature and its date;
- `married_last_day`;
- `lived_apart_last_6mo`.

The custody document card (Form 8332) SHALL be offered on its usual condition to any client who isn't married, widowed clients of any year included. For a widowed client, the spouse sub-step's title SHALL read "Your late spouse" (已故配偶). The browser and the server SHALL evaluate both rules identically, for both visibility and the answers missing before submission.

#### Scenario: A spouse who died in 2024
- **WHEN** a widowed client enters 2024 as the year of the spouse's death
- **THEN** the "Your late spouse" sub-step asks the spouse's name and date of birth, but not the job title or phone, and no spouse document card is listed

#### Scenario: A spouse who died in 2025
- **WHEN** a widowed client enters 2025 as the year of the spouse's death
- **THEN** the "Your late spouse" sub-step asks the spouse's name, date of birth and job title, but not the phone, and the spouse's Photo ID and Social Security card are listed

#### Scenario: The rail follows the year
- **WHEN** a widowed client on the marital status sub-step enters 2025 as the year of the spouse's death and leaves the field
- **THEN** the rail lists "Your late spouse" at once, without a move to another sub-step

#### Scenario: A spouse who died in 2015
- **WHEN** a widowed client enters 2015 as the year of the spouse's death
- **THEN** no spouse sub-step is shown

#### Scenario: No spouse signature after a 2025 death
- **WHEN** a widowed client whose spouse died in 2025 answers "I consent" to Form 15080 and signs as the primary taxpayer
- **THEN** no spouse signature is asked or required, and the application can be submitted

#### Scenario: The server agrees
- **WHEN** a widowed client whose spouse died in 2025 submits without the spouse's last name
- **THEN** the server refuses the submission, naming the spouse's last name as missing

#### Scenario: The custody card for a widowed client
- **WHEN** a widowed client whose spouse died in 2025 lists a child who lived with them less than 6 months
- **THEN** the custody card (Form 8332) is offered as maybe needed

### Requirement: The year of a spouse's death is checked
`spouse_death_year` SHALL accept a four-digit year from 1900 to 2025, in the browser and on the server. Any other value SHALL be shown as "Enter a year from 1900 to 2025." (请输入 1900 至 2025 之间的年份。), SHALL NOT be saved, and SHALL switch neither spouse rule on, even while it is still in the form.

#### Scenario: A year after the tax year
- **WHEN** a widowed client enters 2205 as the year of the spouse's death
- **THEN** the field shows "Enter a year from 1900 to 2025.", and no spouse sub-step appears

#### Scenario: The boundary years
- **WHEN** a widowed client enters 1900, and then 2025
- **THEN** both are accepted
