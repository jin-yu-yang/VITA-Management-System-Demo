## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: The draft's spouse lines appear only when a joint return is possible
The draft Form 13614-C SHALL fill the spouse's name, middle initial, date of birth and job title only when filing with the spouse is possible: married, or widowed with the spouse's death in 2025. For a widowed client, it SHALL tick the widowed box and fill the year of the spouse's death. For a widowed client whose spouse died in 2023 or 2024, the spouse lines SHALL stay empty, even though the intake asked for the spouse's name and date of birth.

#### Scenario: A spouse who died in 2025
- **WHEN** the draft is built for a widowed client whose spouse, Wei Lin, died in 2025
- **THEN** the widowed box is ticked, the year reads 2025, and the spouse's first name reads "Wei"

#### Scenario: A spouse who died in 2024
- **WHEN** the draft is built for a widowed client whose spouse, Wei Lin, died in 2024
- **THEN** the widowed box is ticked, the year reads 2024, and the spouse's name lines are empty
