// The states the golden confirmation test renders. Shared by the one-time
// capture (plan Task 1) and tests/confirm-dialogs.test.mjs, so both render
// exactly the same inputs. Fictional references only.
import { STAGES } from "../src/contracts.mjs";

const six = Array.from({ length: 6 }, (_, i) => ({
  id: `sample-${i}`,
  reference: `VT-SAMP-000${i}`,
  stage: STAGES[0],
  fixture: true,
}));

export const STATES = Object.freeze({
  closeIdle: ["closeCaseDialogBody", { savedCase: { reference: "VT-TEST-0001" } }],
  closeBusy: ["closeCaseDialogBody", { savedCase: { reference: "VT-TEST-0001" }, busy: true }],
  readyToEfile: [
    "markReadyToEfileDialogBody",
    {
      savedCase: {
        reference: "VT-TEST-0002",
        answers: { tp_first_name: "Mei", tp_last_name: "Chen" },
      },
    },
  ],
  efiledNameless: ["markEfiledDialogBody", { savedCase: { reference: "VT-TEST-0003", answers: {} } }],
  corrections: ["correctionsDialogBody", {}],
  correctionsRetry: [
    "correctionsDialogBody",
    { error: { code: "CONFLICT", message: "This case changed." }, retryable: true },
  ],
  correctionsRefused: [
    "correctionsDialogBody",
    { error: { code: "FORBIDDEN", message: "Not allowed." }, retryable: false },
  ],
  reset: ["resetDialogBody", { cases: six }],
  checkpoint: ["checkpointDialogBody", { cases: six }],
  checkpointEmpty: ["checkpointDialogBody", {}],
  regenerateEn: ["dialog", { dialog: "regenerate" }],
  regenerateZh: ["dialog", { dialog: "regenerate", lang: "zh-Hans" }],
  leaveAddCase: ["dialog", { dialog: "leave-add-case", dialogContext: { to: "open-board" } }],
});
