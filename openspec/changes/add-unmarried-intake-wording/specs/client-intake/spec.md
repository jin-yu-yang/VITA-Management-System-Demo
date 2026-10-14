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
