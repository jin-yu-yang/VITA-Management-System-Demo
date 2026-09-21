export const INTAKE_ANSWER_KEYS = Object.freeze([
  "service",
  "year",
  "language",
  "residenceCity",
  "residenceState",
  "city",
  "state",
  "rideshare",
  "other",
  "stocks",
  "firstName",
  "lastName",
  "address",
  "zip",
  "household",
  "helper",
  "documents",
]);

export const sampleAnswers = Object.freeze({
  service: "Drop-off",
  year: "2025",
  language: "English",
  residenceCity: "Philadelphia",
  residenceState: "PA",
  city: "Philadelphia",
  state: "PA",
  rideshare: "yes",
  other: "no",
  stocks: "no",
  firstName: "Mei",
  lastName: "Chen",
  address: "Sample address withheld",
  zip: "19107",
  household: "1",
  helper: "self",
  documents: "ready",
});
const statusValues = [
  "draft",
  "received",
  "queued",
  "preparing",
  "held",
  "responded",
];
export function newCase() {
  return {
    version: 1,
    id: null,
    contact: null,
    status: "draft",
    answers: {},
    intakeVerified: false,
    owner: null,
    request: null,
    documents: [],
    history: [],
  };
}
export function screening(a) {
  if (a.other === "yes" || a.stocks === "yes") return "unsupported";
  if ([a.rideshare, a.other, a.stocks].includes("unsure")) return "assistance";
  if (![a.rideshare, a.other, a.stocks].every((x) => ["yes", "no"].includes(x)))
    return "incomplete";
  return "continue";
}
function requireThat(ok, message) {
  if (!ok) throw new Error(message);
}
function log(c, title, detail, actor) {
  c.history.push({ title, detail, actor, time: new Date().toISOString() });
}
export function updateCase(state, event) {
  const c = structuredClone(state);
  switch (event.type) {
    case "CREATE":
      requireThat(
        !c.id,
        "An application is already saved. Return to it or reset the demo.",
      );
      requireThat(
        event.contact &&
          ["phone", "email"].includes(event.contact.method) &&
          event.contact.value?.trim(),
        "Choose a contact method.",
      );
      c.id = "DEMO-7K4P-92";
      c.contact = { ...event.contact };
      log(
        c,
        "Application started",
        "Contact access confirmed in this simulation.",
        "Client",
      );
      break;
    case "ANSWERS":
      requireThat(
        c.status === "draft",
        "Submitted answers need a volunteer-assisted correction.",
      );
      c.answers = { ...c.answers, ...event.answers };
      break;
    case "SUBMIT":
      if (c.status !== "draft") return c;
      requireThat(
        c.id && screening(c.answers) === "continue",
        "Please complete screening or contact the office.",
      );
      requireThat(
        [
          "service",
          "year",
          "language",
          "residenceCity",
          "residenceState",
          "firstName",
          "lastName",
          "address",
          "city",
          "state",
          "zip",
          "household",
          "helper",
          "documents",
        ].every((k) => c.answers[k]?.trim()),
        "Please complete your details.",
      );
      requireThat(c.answers.year === "2025", "This demo covers tax year 2025.");
      requireThat(
        c.answers.residenceState !== "Other",
        "Contact the office about your state of residence.",
      );
      requireThat(
        c.answers.helper === "self",
        "Please contact the office for assisted applications.",
      );
      c.status = "received";
      log(
        c,
        "Application received",
        "Waiting for a volunteer to check information and documents.",
        `${c.answers.firstName} ${c.answers.lastName}`,
      );
      break;
    case "VERIFY_INTAKE":
      requireThat(
        c.status === "received",
        "Intake checks follow application receipt.",
      );
      c.status = "queued";
      c.intakeVerified = true;
      c.documents = [
        {
          name: "demo-rideshare-summary-2025.pdf",
          verified: true,
          source: "Simulated intake",
        },
      ];
      log(
        c,
        "Intake checks completed",
        "Demo time jump: interview, document, identity and applicable external consent checks recorded.",
        "Intake volunteer (simulated)",
      );
      break;
    case "CLAIM":
      requireThat(
        c.status === "queued" && c.intakeVerified && !c.owner,
        "This case is not available to claim.",
      );
      c.owner = "Alex";
      c.status = "preparing";
      log(c, "Preparation started", "Alex claimed the case.", "Alex");
      break;
    case "REQUEST":
      requireThat(
        c.status === "preparing" && c.owner,
        "Claim a preparation case before requesting documents.",
      );
      requireThat(
        event.title?.trim() && event.message?.trim(),
        "Please add a document name and a message.",
      );
      c.request = {
        title: event.title.trim(),
        message: event.message.trim(),
        status: "open",
      };
      c.status = "held";
      log(c, "Document requested", c.request.message, "Alex");
      break;
    case "RESPOND":
      if (c.status === "responded") return c;
      requireThat(
        c.status === "held" && c.request?.status === "open",
        "There is no open document request.",
      );
      requireThat(
        event.filename === "demo-mileage-record-2025.pdf",
        "Choose the sample document.",
      );
      c.documents.push({
        name: event.filename,
        verified: false,
        source: "Client sample response",
      });
      c.request.status = "awaiting_verification";
      c.status = "responded";
      log(
        c,
        "Document received",
        "Mileage record received; awaiting volunteer verification.",
        `${c.answers.firstName} ${c.answers.lastName}`,
      );
      break;
    default:
      throw new Error("Unknown case action.");
  }
  return c;
}
// Plain-language status copy for every server stage in STAGES, so the browser
// can name what it is showing without deciding anything. This is presentation
// only: no transition, authority or eligibility rule lives here, and no
// message mentions findings, amounts, signing, filing or acceptance as done.
const STAGE_DESCRIPTIONS = Object.freeze({
  draft: {
    label: "Draft",
    clientMessage:
      "Your application is saved and has not been sent to the office yet.",
  },
  received: {
    label: "Received",
    clientMessage:
      "Your application is with the office. A volunteer will check your information and documents.",
  },
  preparation_ready: {
    label: "Waiting for preparation",
    clientMessage:
      "Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.",
  },
  preparing: {
    label: "In preparation",
    clientMessage: "A volunteer is preparing your return.",
  },
  review_ready: {
    label: "Waiting for review",
    clientMessage:
      "Preparation is complete in the tax software. Your return is waiting for an independent reviewer.",
  },
  reviewing: {
    label: "In review",
    clientMessage: "An independent reviewer is checking your return.",
  },
  corrections_required: {
    label: "Corrections in progress",
    clientMessage:
      "The reviewer asked your preparer to make corrections. No action is needed from you right now.",
  },
  review_approved: {
    label: "Review complete",
    clientMessage:
      "Independent review is complete. A volunteer will contact you about next steps. Signing and filing are later milestones and are not done yet.",
  },
  closed: {
    label: "Closed",
    clientMessage:
      "This application was closed by the office. This does not change any return filed elsewhere.",
  },
});
const UNKNOWN_STAGE = Object.freeze({
  label: "Application",
  clientMessage:
    "This application is with the office. Contact PCDC if you have questions.",
});
// A fresh copy, so a caller that edits what it renders cannot change the table.
// An unrecognised stage — including an inherited property name — falls back to
// neutral copy rather than showing nothing or guessing a milestone.
export function describeStage(stage) {
  return {
    ...(Object.hasOwn(STAGE_DESCRIPTIONS, stage ?? "")
      ? STAGE_DESCRIPTIONS[stage]
      : UNKNOWN_STAGE),
  };
}

export function restoreCase(serialized) {
  try {
    const c = JSON.parse(serialized);
    if (
      c?.version !== 1 ||
      !statusValues.includes(c.status) ||
      !c.answers ||
      !Array.isArray(c.history) ||
      !Array.isArray(c.documents)
    )
      return newCase();
    return c;
  } catch {
    return newCase();
  }
}
