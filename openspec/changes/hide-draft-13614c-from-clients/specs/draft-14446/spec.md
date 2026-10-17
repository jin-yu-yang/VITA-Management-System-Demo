## MODIFIED Requirements

### Requirement: The draft comes in English and 繁體
The draft Form 14446 SHALL be offered in English and in Traditional Chinese, as "View Draft Form 14446" and "繁體中文版". This SHALL be on the client's summary page, next to the Print button, and on the staff answers panel. No Simplified Chinese 14446 SHALL be offered. On a Simplified Chinese screen, the Traditional Chinese form SHALL be the Chinese option. Building either language SHALL write no message to the browser console.

#### Scenario: The summary page in Simplified Chinese
- **WHEN** a client using Simplified Chinese opens 9.2
- **THEN** the 14446 buttons offer English and 繁體中文版, and no 简体中文版

#### Scenario: The Traditional Chinese draft
- **WHEN** staff choose 繁體中文版 for a case
- **THEN** the draft opens PCDC's Traditional Chinese 14446, with page 3 filled and its typed signatures readable

#### Scenario: A quiet console
- **WHEN** a client opens either draft
- **THEN** no message appears in the browser console

## ADDED Requirements

### Requirement: The draft 14446's tab names its form
While a draft Form 14446 is being made, and if it can't be made, its tab SHALL be titled "Draft Form 14446" (14446 表草稿), in the screen's language. A draft Form 13614-C's tab SHALL keep the title "Draft 13614-C" (13614-C 草稿).

#### Scenario: A client's 14446 that can't be made
- **WHEN** a client presses View Draft Form 14446 in English and the draft can't be built
- **THEN** the tab says "The draft could not be made. Close this tab and try again." and is titled "Draft Form 14446"

#### Scenario: In Simplified Chinese
- **WHEN** a client using Simplified Chinese presses View Draft Form 14446
- **THEN** the tab is titled "14446 表草稿" while the draft is made
