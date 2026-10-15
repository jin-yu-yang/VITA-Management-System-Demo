## ADDED Requirements

### Requirement: Staff tables show every language a client speaks
The Language column of the work board, the case pool and Follow-ups SHALL list every language the client speaks, as letters, the preferred language first:
- E for English, C for Cantonese, M for Mandarin and O for Other, separated by ", ";
- no language listed twice.

The cell SHALL give the full names on hover, and screen readers SHALL read the full names instead of the letters, for example "Cantonese (preferred), Mandarin, Other: Vietnamese". A cell with no language SHALL show "—".

A Follow-ups row without a case SHALL use the help request's own language text:
- English, Cantonese or Mandarin shows its letter;
- any other text shows "O", with that text in the full names.

#### Scenario: A client with two languages
- **WHEN** staff open the work board, and a case's client prefers Cantonese and also speaks Mandarin
- **THEN** that row's Language cell shows "C, M", and its full names read "Cantonese (preferred), Mandarin"

#### Scenario: Another language
- **WHEN** a client prefers English and also named Other, typing "Vietnamese"
- **THEN** the case pool row shows "E, O", and its full names read "English (preferred), Other: Vietnamese"

#### Scenario: Only the preferred language
- **WHEN** a client named only Mandarin
- **THEN** the row shows "M"

#### Scenario: A help request without a case
- **WHEN** a Follow-ups row comes from a help request whose language is "Cantonese" and which has no case
- **THEN** its Language cell shows "C"

### Requirement: Language filters match any language the client speaks
The work board's and Follow-ups' language chips and the case pool's language filter SHALL match a client when any language they speak, preferred or other, is the chosen language. The filter's options SHALL be the full names of every language that appears among the listed cases, preferred or other, sorted. A saved filter value SHALL keep working.

#### Scenario: Filtering by a second language
- **WHEN** staff choose "Mandarin" on the work board
- **THEN** the board shows both a client who prefers Mandarin and a client who prefers Cantonese and also speaks Mandarin

#### Scenario: The options include second languages
- **WHEN** the only Mandarin speaker in the case pool named Mandarin in Q0.5
- **THEN** "Mandarin" is one of the pool's language options
