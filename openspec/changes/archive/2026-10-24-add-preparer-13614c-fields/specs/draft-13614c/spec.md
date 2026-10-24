## ADDED Requirements

### Requirement: The draft shows the preparer's shaded section
When the case has a saved shaded section (capability `shaded-section`), the staff draft Form 13614-C SHALL show its values in the English, Simplified Chinese and Traditional Chinese forms:
- each household cell SHALL read Yes, No or N/A, in English on every form;
- each ticked checkbox SHALL be ticked;
- counts, amounts, the VIN, the year and the reason SHALL read as saved. An amount SHALL have no dollar sign.

Text in Chinese SHALL be printed as typed. A field left blank SHALL stay empty. Household members past row 4 SHALL keep their Additional Comments lines unchanged. A case with no saved section SHALL have a draft that is unchanged by this requirement.

#### Scenario: The values in every form
- **WHEN** the staff draft is built in English, Simplified Chinese and Traditional Chinese for a case whose saved section has row 1 qualifying child Yes, W-2s ticked and 2 W-2s
- **THEN** each draft shows Yes in row 1's qualifying child cell, the W-2s box ticked and 2 as their number

#### Scenario: No saved section
- **WHEN** the staff draft is built for a case with no saved shaded section
- **THEN** the shaded section of the draft is empty

### Requirement: Long shaded notes continue in Additional Comments
Each block's shaded notes SHALL be printed in their own box, wrapped to its width at its font size, with line breaks kept. What doesn't fit SHALL continue in Additional Comments under the line "Continued from page <n>, <block> notes:", followed by the rest of the note, and from there onto continued pages as Additional Comments does. No part of a note SHALL be cut off.

#### Scenario: A note longer than its box
- **WHEN** the staff draft is built for a case whose Standard or itemized deductions notes are 400 characters long
- **THEN** the box shows the note's first lines, and Additional Comments continues it under "Continued from page 3, Standard or itemized deductions notes:", with every character of the note printed

### Requirement: The draft's stamp says whether it holds preparer entries
The draft Form 13614-C SHALL carry the stamp "DRAFT – prepared from online answers, <date>, <reference>" at the top of every page, continued pages included. When the case has any saved shaded value, the stamp SHALL instead read "DRAFT – online answers and preparer entries, <date>, <reference>". The date SHALL read MM/DD/YYYY and the reference SHALL be the case's reference.

#### Scenario: A draft with preparer entries
- **WHEN** the staff draft is built on 2026-02-14 for case VT-ABCD-EFGH, which has a saved shaded section
- **THEN** every page reads "DRAFT – online answers and preparer entries, 02/14/2026, VT-ABCD-EFGH"

#### Scenario: A draft without preparer entries
- **WHEN** the staff draft is built on 2026-02-14 for case VT-ABCD-EFGH, which has no saved shaded section
- **THEN** every page reads "DRAFT – prepared from online answers, 02/14/2026, VT-ABCD-EFGH"
