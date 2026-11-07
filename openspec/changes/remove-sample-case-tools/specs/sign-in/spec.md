## REMOVED Requirements

### Requirement: Sample cases and checkpoints stay presenter-only
**Reason**: `vitally_reset_fixtures` and `vitally_load_checkpoint` are dropped by migration 040, so nobody can call them.
**Migration**: Rehearsal cases come from `npm run seed:local` (capability `local-seed-data`).
