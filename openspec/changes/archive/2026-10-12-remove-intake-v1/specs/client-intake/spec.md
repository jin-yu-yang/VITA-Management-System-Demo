## MODIFIED Requirements

### Requirement: New applications use intake version 2
Version 2 SHALL be the only intake version a workspace or an application accepts. A workspace's default intake version SHALL be 2, and setting it to any other value SHALL be refused. Every new application SHALL be version 2, whether a client starts their own or the office starts one for a walk-in client with Add a case.

#### Scenario: A new workspace defaults to version 2
- **WHEN** a workspace is created without naming an intake version
- **THEN** its default intake version is 2

#### Scenario: An existing workspace is switched to version 2
- **WHEN** version 1 is removed from a database where a workspace is still set to version 1
- **THEN** every workspace's default intake version is 2

#### Scenario: Setting a workspace to version 1 is refused
- **WHEN** a workspace's default intake version is set to 1
- **THEN** the change is refused and the workspace stays at version 2

#### Scenario: A client's new application is version 2
- **WHEN** a client starts a new application
- **THEN** the application's intake version is 2

#### Scenario: The office's new application is version 2
- **WHEN** the office starts an assisted application for a walk-in client
- **THEN** the application's intake version is 2

## REMOVED Requirements

### Requirement: An application keeps the version it was created with

**Reason**: Its scenarios describe version-1 applications surviving a version change, and version-1 applications no longer exist or can be created. What still holds, that an application's version is fixed for life, is restated on version 2 as "An application's intake version never changes".

**Migration**: Nothing calls it. 011's update trigger still refuses a version change, and the new requirement covers it.

### Requirement: A workspace's version decides its sample cases

**Reason**: Its rollback ("a workspace set back to 1 seeds version-1 samples") is gone, because a workspace can no longer be set to 1. Samples are always version 2, restated as "Sample cases are version 2".

**Migration**: To undo the switch-over, restore from a backup taken before migration 023. Setting a workspace back to 1 is refused (see "New applications use intake version 2").

## ADDED Requirements

### Requirement: An application's intake version never changes
An application's intake version SHALL be fixed when the application is created. It SHALL NOT change when the application is updated, and a direct change of an application's version SHALL be refused.

#### Scenario: Updating an application does not change its version
- **WHEN** a version-2 application's answers are saved
- **THEN** its intake version is still 2

#### Scenario: Changing an application's version directly is refused
- **WHEN** an application's intake version is changed directly
- **THEN** the change is refused and the version stays 2

### Requirement: Sample cases are version 2
Resetting a workspace's sample cases SHALL seed six samples, every one a version-2 application.

#### Scenario: A reset seeds version-2 samples
- **WHEN** the sample cases are reset in a workspace
- **THEN** six samples are seeded and every one is a version-2 application
