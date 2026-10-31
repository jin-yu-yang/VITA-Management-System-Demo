## ADDED Requirements

### Requirement: A staff account with admin and volunteer work can switch workspaces
A `staff` account whose person has `admin` and at least one of `prepare` or `review` SHALL have an **Office / Cases** switch in the staff sidebar, above "Signed in as". In **Office** the account SHALL get the office workspace: Follow-ups, All cases, Add a case and the office case page. In **Cases** it SHALL get the volunteer workspace: the Work board and the volunteer case page, where what it may claim or do is decided by its capabilities, as for any volunteer. The current mode SHALL be shown as pressed. The switch SHALL be a view choice: it SHALL NOT grant anything, and the database SHALL keep checking every action against the person's capabilities.

A window SHALL open in Office unless this window saved Cases for this user. Switching SHALL keep the window where it is when that place exists in the other workspace:
- On the home screen, switching SHALL show Follow-ups in Office and the Work board in Cases.
- On a case page, switching SHALL show the same case in the other workspace's case page, on its Overview tab.
- On All cases, switching to Cases SHALL show the Work board.
- On Add a case, switching SHALL ask first when typed answers would be lost, as leaving Add a case does by any other way.

#### Scenario: A dual account signs in
- **WHEN** a staff member with `admin` and `review` signs in
- **THEN** Follow-ups opens, the sidebar shows Follow-ups and All cases, and the switch shows Office pressed

#### Scenario: Switching to Cases and claiming
- **WHEN** that staff member presses Cases, and a case is waiting for an independent reviewer that they did not prepare
- **THEN** the Work board opens, and they can claim the case's review, and the claim is recorded under their own person

#### Scenario: Switching back to Office
- **WHEN** that staff member presses Office
- **THEN** Follow-ups opens, and the sidebar shows Follow-ups and All cases again

#### Scenario: Switching on a case page
- **WHEN** the staff member has a case page open in Office and presses Cases
- **THEN** the same case's volunteer page opens, on its Overview tab

#### Scenario: Switching from Add a case with typed answers
- **WHEN** the staff member has typed answers in Add a case and presses Cases
- **THEN** the window asks before leaving, as leaving Add a case does, and stays on Add a case if they keep editing

### Requirement: The window remembers a dual account's workspace
A staff window SHALL save the dual account's workspace mode with its other window choices for that user, and SHALL restore it on a reload. A stored mode that is neither Office nor Cases SHALL be ignored, and the window SHALL open in Office. A stored mode SHALL be honoured only while the account has the switch: for any other account, the workspace SHALL be chosen as it is without the switch.

#### Scenario: A reload in Cases
- **WHEN** a dual account switches to Cases and reloads the window
- **THEN** the window opens in Cases, with the switch showing Cases pressed

#### Scenario: An unreadable stored mode
- **WHEN** the window's storage holds a workspace mode that is neither Office nor Cases
- **THEN** the window opens in Office

#### Scenario: A stored mode without the switch
- **WHEN** a staff account with `admin` alone signs in to a window whose storage says Cases
- **THEN** the office workspace opens, with no switch

### Requirement: Accounts without both kinds of work see no switch
A `staff` account with `admin` and neither `prepare` nor `review`, a `staff` account without `admin`, and every presenter SHALL see no workspace switch. Their workspace SHALL be chosen by whether the acting person has `admin`, exactly as before this change: the office workspace with `admin`, the volunteer workspace without it. A presenter SHALL keep moving between the workspaces by choosing a persona.

#### Scenario: An admin-only staff account
- **WHEN** a staff member with `admin` alone signs in
- **THEN** Follow-ups opens with no switch, as before

#### Scenario: A preparer and reviewer without admin
- **WHEN** a staff member with `prepare` and `review` and no `admin` signs in
- **THEN** the Work board opens with no switch, as before

#### Scenario: A presenter acting as an admin who also reviews
- **WHEN** a presenter chooses a persona with `admin` and `review`
- **THEN** the office workspace opens with no switch, and choosing a volunteer persona still opens the Work board

### Requirement: The office case page points a dual account to a case it can claim
On a case page in Office mode, when the dual account's person may claim the case for preparation or for review by the same rules the volunteer case page uses, the page's Overview SHALL show one line in its action area: "You can claim this case — switch to Cases" when preparation can be claimed, or "You can review this case — switch to Cases" when the review can be claimed, with a **Switch to Cases** button. Pressing it SHALL switch to Cases and show the same case's volunteer page. The line SHALL NOT appear when the person may not claim the case, and SHALL NOT appear for an account without the switch.

#### Scenario: A case waiting for a reviewer
- **WHEN** a dual account with `review` opens, in Office, a case waiting for an independent reviewer that it did not prepare
- **THEN** the Overview shows "You can review this case — switch to Cases", and pressing Switch to Cases opens the case's volunteer page with Claim review

#### Scenario: A case waiting for a preparer
- **WHEN** a dual account with `prepare` opens, in Office, a case waiting to be claimed for preparation
- **THEN** the Overview shows "You can claim this case — switch to Cases"

#### Scenario: A case the person prepared
- **WHEN** a dual account with `prepare` and `review` opens, in Office, a case waiting for review that it prepared
- **THEN** no hint is shown

#### Scenario: An admin-only account
- **WHEN** a staff member with `admin` alone opens a case waiting for a reviewer
- **THEN** no hint is shown
