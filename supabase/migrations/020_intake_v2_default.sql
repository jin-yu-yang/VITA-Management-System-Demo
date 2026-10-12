-- The version-2 switch-over (OpenSpec change make-intake-v2-default, spec
-- client-intake). Version 2 of the client intake becomes the default: the
-- column default for new workspaces, and the setting of every workspace that
-- exists now. New applications, a client's own and the office's Add a case,
-- take the workspace's version through 011's insert trigger, and sample resets
-- follow it through 019, so nothing else changes here. Existing applications
-- keep their version: 011 fixes it on insert and refuses to change it on
-- update.
--
-- This file redefines no function and loads no catalogue. It therefore gives
-- the same result whether it runs before 021 and 022 (a new database) or after
-- them (a database that already has them). Both statements can be applied
-- again. To roll back, a later migration sets the workspaces (and, if wanted,
-- the column default) back to 1; a workspace's next reset then seeds version-1
-- samples.

alter table public.workspaces alter column default_intake_version set default 2;
update public.workspaces set default_intake_version = 2;
