# draft-13614c Specification

## Purpose
What the draft Form 13614-C, which ViTally fills from a client's intake answers for the volunteer, shows: which answers go into which fields on the form, and how a household member's name reads on the dependents rows and in Additional Comments.

## Requirements

### Requirement: A household member's name on the draft shows first, middle and last name
On the draft Form 13614-C, each household member's name SHALL read first, middle and last name, with the full middle name, separated by single spaces and skipping any part that is empty. This SHALL hold on the dependents row (`nameFirstLast`, rows 1–4) and on the Additional Comments line for every member past row 4. The taxpayer's and spouse's middle initials at the top of the form SHALL be unchanged.

#### Scenario: A member with a middle name
- **WHEN** the draft is built for a household member with first name "Ana", middle name "Mei" and last name "Lin"
- **THEN** that member's dependents row name reads "Ana Mei Lin"

#### Scenario: A member without a middle name
- **WHEN** the draft is built for a household member with first name "Ana", last name "Lin" and no middle name
- **THEN** that member's dependents row name reads "Ana Lin"

#### Scenario: A member past row 4
- **WHEN** the draft is built for five household members and the fifth has first name "Eva", middle name "Q" and last name "Lin"
- **THEN** the Additional Comments line for that member gives the name as "Eva Q Lin"

### Requirement: The draft's not-sure lines quote the wording the client saw
When the draft Form 13614-C lists a question answered "Not sure" in Additional Comments, it SHALL quote the question in the wording that application's client saw. That is the wording without a spouse when the client isn't married, and the wording with the spouse when married.

#### Scenario: An unmarried client unsure whether someone can claim them
- **WHEN** the draft is built for a never-married client who answered Q5.2 "Not sure"
- **THEN** the Additional Comments line quotes "Can anyone else (such as a parent or adult child) claim you as a dependent on their tax return?"

#### Scenario: A married client unsure whether someone can claim them
- **WHEN** the draft is built for a married client who answered Q5.2 "Not sure"
- **THEN** the Additional Comments line quotes "Can anyone else (such as a parent or adult child) claim you or your spouse as a dependent on their tax return?"
