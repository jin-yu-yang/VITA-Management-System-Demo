# draft-13614c Specification

## Purpose
What the draft Form 13614-C, which ViTally fills from a client's intake answers for the volunteer, shows: which answers go into which fields on the form, when the spouse's lines are filled, and how a household member's name reads on the dependents rows and in Additional Comments.

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
When the draft Form 13614-C lists a question answered "Not sure" in Additional Comments, it SHALL quote the question in the wording that application's client saw. The rule is "filing with the spouse possible": married, or widowed with the spouse's death in 2025. When filing with the spouse isn't possible, the line SHALL use the wording without a spouse. When it is possible, the line SHALL use the wording with the spouse.

#### Scenario: An unmarried client unsure whether someone can claim them
- **WHEN** the draft is built for a never-married client who answered Q5.2 "Not sure"
- **THEN** the Additional Comments line quotes "Can anyone else (such as a parent or adult child) claim you as a dependent on their tax return?"

#### Scenario: A married client unsure whether someone can claim them
- **WHEN** the draft is built for a married client who answered Q5.2 "Not sure"
- **THEN** the Additional Comments line quotes "Can anyone else (such as a parent or adult child) claim you or your spouse as a dependent on their tax return?"

#### Scenario: A client whose spouse died in 2025
- **WHEN** the draft is built for a widowed client whose spouse died in 2025 and who answered Q5.2 "Not sure"
- **THEN** the Additional Comments line quotes the wording with the spouse

### Requirement: The draft's spouse lines appear only when a joint return is possible
The draft Form 13614-C SHALL fill the spouse's name, middle initial, date of birth and job title only when filing with the spouse is possible: married, or widowed with the spouse's death in 2025. For a widowed client, it SHALL tick the widowed box and fill the year of the spouse's death. For a widowed client whose spouse died in 2023 or 2024, the spouse lines SHALL stay empty, even though the intake asked for the spouse's name and date of birth.

#### Scenario: A spouse who died in 2025
- **WHEN** the draft is built for a widowed client whose spouse, Wei Lin, died in 2025
- **THEN** the widowed box is ticked, the year reads 2025, and the spouse's first name reads "Wei"

#### Scenario: A spouse who died in 2024
- **WHEN** the draft is built for a widowed client whose spouse, Wei Lin, died in 2024
- **THEN** the widowed box is ticked, the year reads 2024, and the spouse's name lines are empty
