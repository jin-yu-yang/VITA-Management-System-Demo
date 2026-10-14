## ADDED Requirements

### Requirement: A household member may have a middle name
A household member SHALL have an optional middle name (`hh[i].middle_name`), asked between the first and last name in both the standard and senior versions of the form. Leaving it empty SHALL NOT block the member or the application. Where the form shows a member's full name, it SHALL read first, middle and last name, separated by single spaces, skipping any part that is empty.

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
