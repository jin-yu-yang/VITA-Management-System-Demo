## ADDED Requirements

### Requirement: An empty list says what is empty, in one of two shapes
Once a list has loaded and has nothing to show, it SHALL show its empty state, built by one of two shared helpers:
- **a panel list** (the work board, Follow-ups, the case pool, the client's applications) SHALL show an empty panel: an icon, an optional heading, one sentence, and the actions that apply;
- **a section inside a case or a drawer** (documents requested, review attempts, office follow-up, history, requests waiting, calls so far, open follow-ups in Log a call, and the client's history) SHALL show one muted line.

The sentence SHALL say what is empty, and where it helps, what fills the list. A list narrowed by a filter or a search SHALL say that nothing matches, never that the list itself is empty, and SHALL offer the action that undoes the narrowing: in the empty state, or beside it when the list already shows that action. The empty state SHALL NOT appear while the list is loading or after its first load failed. Moving a list onto the shared helpers SHALL NOT change its words, its actions or their `data-*` values, except where a requirement here says so.

#### Scenario: An empty tab on the work board
- **WHEN** a volunteer opens the Available tab and no case is available
- **THEN** the board shows the empty panel with "Nothing to claim right now. New work appears here once the office has checked its intake." and no Clear filters

#### Scenario: A filtered queue offers the undo
- **WHEN** the office narrows Follow-ups to one kind of task and nothing of that kind is waiting
- **THEN** Follow-ups shows "Nothing here matches these filters." with "Show every task", which shows every task again

#### Scenario: A section with nothing in it
- **WHEN** a volunteer opens a case on which no document has been requested
- **THEN** the documents section shows the one muted line "No documents have been requested on this case."

#### Scenario: Loading is not empty
- **WHEN** the work board's first load is still running
- **THEN** it shows "Loading cases…" and not its empty sentence

### Requirement: The case pool says whether nothing exists or nothing matches
The case pool's empty state SHALL show the folder icon and say "No cases yet this season." when no filter is set, and "No case matches these filters." when a filter is set. When a filter is set, Clear filters SHALL stay in the line above the list, and the empty state SHALL NOT repeat it.

#### Scenario: An empty season
- **WHEN** an admin opens the case pool, no filter is set, and the workspace has no cases
- **THEN** the pool says "No cases yet this season." with the folder icon

#### Scenario: Nothing matches
- **WHEN** an admin filters the case pool by a language no case speaks
- **THEN** the pool says "No case matches these filters." with the folder icon, and Clear filters shows once, in the line above
