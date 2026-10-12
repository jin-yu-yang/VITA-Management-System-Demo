## ADDED Requirements

### Requirement: New applications use intake version 2
A workspace's default intake version SHALL be 2: the column default for new workspaces, and the setting of every workspace that existed before this change. Every application created in a version-2 workspace SHALL be version 2. This covers both a client starting their own application and the office starting one for a walk-in client with Add a case.

#### Scenario: A new workspace defaults to version 2
- **WHEN** a workspace is created without naming an intake version
- **THEN** its default intake version is 2

#### Scenario: An existing workspace is switched to version 2
- **WHEN** the switch-over is applied to a database whose workspaces were set to version 1
- **THEN** every workspace's default intake version is 2

#### Scenario: A client's new application is version 2
- **WHEN** a client starts a new application in a version-2 workspace
- **THEN** the application's intake version is 2

#### Scenario: The office's new application is version 2
- **WHEN** the office starts an assisted application for a walk-in client in a version-2 workspace
- **THEN** the application's intake version is 2

### Requirement: An application keeps the version it was created with
An application's intake version SHALL be fixed when the application is created. It SHALL NOT change when the application is updated, or when its workspace's default intake version changes later.

#### Scenario: A version-1 application survives the switch-over
- **WHEN** a version-1 application exists and its workspace is switched to version 2
- **THEN** the application's intake version is still 1

#### Scenario: Updating an application does not change its version
- **WHEN** a version-1 application in a version-2 workspace is updated
- **THEN** its intake version is still 1

### Requirement: A workspace's version decides its sample cases
Resetting a workspace's sample cases SHALL seed samples of the workspace's default intake version at the moment of the reset. Setting a workspace back to version 1 SHALL make its next reset seed version-1 samples. That is the rollback for the switch-over.

#### Scenario: A version-2 workspace seeds version-2 samples
- **WHEN** the sample cases are reset in a version-2 workspace
- **THEN** every seeded sample is a version-2 application

#### Scenario: A workspace set back to version 1 seeds version-1 samples
- **WHEN** a workspace's default intake version is set back to 1 and its sample cases are then reset
- **THEN** every seeded sample is a version-1 application
