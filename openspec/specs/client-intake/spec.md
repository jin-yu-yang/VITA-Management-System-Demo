# client-intake Specification

## Purpose
How a tax-season application's intake form is chosen and kept: which intake version a new application gets, whether the client starts it or the office enters it for a walk-in client; that an application keeps its version for life; and which version a workspace's sample cases are seeded in.

## Requirements

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
