## ADDED Requirements

### Requirement: The draft's not-sure lines quote the wording the client saw
When the draft Form 13614-C lists a question answered "Not sure" in Additional Comments, it SHALL quote the question in the wording that application's client saw. That is the wording without a spouse when the client isn't married, and the wording with the spouse when married.

#### Scenario: An unmarried client unsure whether someone can claim them
- **WHEN** the draft is built for a never-married client who answered Q5.2 "Not sure"
- **THEN** the Additional Comments line quotes "Can anyone else (such as a parent or adult child) claim you as a dependent on their tax return?"

#### Scenario: A married client unsure whether someone can claim them
- **WHEN** the draft is built for a married client who answered Q5.2 "Not sure"
- **THEN** the Additional Comments line quotes "Can anyone else (such as a parent or adult child) claim you or your spouse as a dependent on their tax return?"
