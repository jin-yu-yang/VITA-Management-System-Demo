import test from "node:test";
import assert from "node:assert/strict";
import { describeStage, phaseTab, BOARD_TABS } from "../src/domain.mjs";
import { historyLine } from "../src/client-text.mjs";
import {
  CASE_ACTIONS,
  ERROR_CODES,
  REFERENCE_ALPHABET,
  REFERENCE_PATTERN,
  SQLSTATE_ERROR_CODES,
  STAGES,
} from "../src/contracts.mjs";

// The in-browser case machine of the local prototype is gone: stages,
// authority, revisions and history are the database's, and every transition it
// used to simulate is covered authoritatively by the live suites in
// `tests/database-*.mjs` (see the Task 6 report for the assertion-by-assertion
// map). What remains here is what the browser still decides for itself: what it
// may show, what it may send, and what it may say about a stage.

test("every server stage has plain status copy and no workflow decision", () => {
  const described = STAGES.map((stage) => describeStage(stage));
  for (const [index, stage] of STAGES.entries()) {
    const { label, clientMessage } = described[index];
    assert.equal(typeof label, "string", stage);
    assert.equal(typeof clientMessage, "string", stage);
    assert.ok(label.length > 0 && label.length <= 40, stage);
    assert.ok(clientMessage.length > 0, stage);
    // Status copy is client-facing: no internal words, no money, and no claim
    // of a milestone the case has not reached. The efiled message names
    // e-filing because the case is there.
    for (const word of [
      "findings",
      "refund",
      "bank",
      "routing",
      "deposit",
      "$",
    ])
      assert.ok(
        !clientMessage.toLowerCase().includes(word),
        `${stage} must not mention ${word}`,
      );
  }
  // Every stage is described distinctly, and the table is stage-keyed only.
  assert.equal(
    new Set(described.map((entry) => entry.label)).size,
    STAGES.length,
  );
  assert.deepEqual(Object.keys(describeStage("reviewing")).sort(), [
    "clientLabel",
    "clientMessage",
    "label",
  ]);
  assert.equal(describeStage("reviewing").label, "Review in progress");
  assert.match(
    describeStage("corrections_required").clientMessage,
    /No action is needed from you right now/,
  );
  // Approval says Form 8879 comes next; it does not claim it was signed.
  assert.match(
    describeStage("review_approved").clientMessage,
    /PCDC will contact you to sign Form 8879, which is needed before your return can be filed\./,
  );
  // Pure: the same input answers the same way, and an edited result never
  // changes the next answer.
  const first = describeStage("preparing");
  first.label = "Changed";
  assert.equal(describeStage("preparing").label, "Filing in progress (preparing)");
  assert.deepEqual(describeStage("preparing"), describeStage("preparing"));
  // Anything the server never sends falls back to neutral copy.
  for (const unknown of [
    "signed",
    "filed",
    "accepted",
    "",
    undefined,
    null,
    "toString",
  ])
    assert.deepEqual(describeStage(unknown), {
      label: "Application",
      clientLabel: "Application",
      clientMessage:
        "This application is with the office. Contact PCDC if you have questions.",
    });
});

test("shared case contracts expose readable references and frozen vocabularies", () => {
  assert.equal(REFERENCE_ALPHABET, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
  assert.equal(REFERENCE_PATTERN.test("VT-A2BC-DE9F"), true);
  assert.equal(REFERENCE_PATTERN.test("VT-A1BC-DE0F"), false);
  assert.deepEqual(STAGES, [
    "draft",
    "received",
    "screening",
    "preparation_ready",
    "preparing",
    "review_ready",
    "reviewing",
    "corrections_required",
    "review_approved",
    "ready_to_efile",
    "efiled",
    "closed",
  ]);
  assert.deepEqual(CASE_ACTIONS, [
    "SAVE_ANSWERS",
    "SUBMIT",
    "START_SCREENING",
    "VERIFY_INTAKE",
    "CLAIM_PREPARATION",
    "REQUEST_DOCUMENT",
    "RESPOND_DOCUMENT",
    "RECORD_DOCUMENT_RESPONSE",
    "VERIFY_DOCUMENT",
    "ESCALATE_CONTACT",
    "RESOLVE_FOLLOWUP",
    "SUBMIT_REVIEW",
    "CLAIM_REVIEW",
    "REQUEST_CORRECTIONS",
    "RESUBMIT_REVIEW",
    "APPROVE_REVIEW",
    "RECORD_REVIEW_CONTACT",
    "MARK_READY_TO_EFILE",
    "MARK_EFILED",
    "REMIND",
    "CLOSE_CASE",
    "UPDATE_CONTACT",
    "RECORD_MATERIALS",
    "SET_DOCUMENT_CARD",
    "SET_DOCUMENT_GROUP",
  ]);
  assert.deepEqual(ERROR_CODES, [
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INVALID_TRANSITION",
    "SELF_REVIEW",
    "INELIGIBLE",
    "VALIDATION",
    "OFFLINE",
    "SERVER_ERROR",
  ]);
  assert.deepEqual(SQLSTATE_ERROR_CODES, {
    VT001: "FORBIDDEN",
    VT002: "NOT_FOUND",
    VT003: "CONFLICT",
    VT004: "INVALID_TRANSITION",
    VT005: "SELF_REVIEW",
    VT006: "INELIGIBLE",
    VT007: "VALIDATION",
  });
  assert.equal(Object.isFrozen(STAGES), true);
  assert.equal(Object.isFrozen(CASE_ACTIONS), true);
  assert.equal(Object.isFrozen(ERROR_CODES), true);
  assert.equal(Object.isFrozen(SQLSTATE_ERROR_CODES), true);
});

test("each of today's stages belongs to exactly one board tab, or none", () => {
  assert.deepEqual(
    BOARD_TABS.map(([value]) => value),
    ["available", "preparation", "review"],
  );
  const cases = [
    [{ stage: "preparation_ready", preparerId: null }, "available"],
    [{ stage: "preparation_ready", preparerId: "alex" }, "preparation"],
    [{ stage: "preparing", preparerId: "alex" }, "preparation"],
    [{ stage: "corrections_required", preparerId: "alex" }, "preparation"],
    [{ stage: "review_ready", reviewerId: null }, "review"],
    [{ stage: "reviewing", reviewerId: "morgan" }, "review"],
    [{ stage: "draft" }, null],
    [{ stage: "received" }, null],
    [{ stage: "review_approved" }, null],
    [{ stage: "closed" }, null],
    [{ stage: "nonsense" }, null],
    [null, null],
  ];
  for (const [record, tab] of cases)
    assert.equal(phaseTab(record), tab, JSON.stringify(record));
});

// Part 4d: stage text in the client's language; English unchanged by default.
test("describeStage takes a language; English is the default and unchanged", async () => {
  const { setHantMap } = await import("../src/hant.mjs");
  const { default: MAP } = await import("../src/zh-hant.mjs");
  const english = describeStage("reviewing");
  assert.deepEqual(describeStage("reviewing", "en"), english);
  assert.equal(english.clientMessage, "An independent reviewer is checking your return.");
  const zh = describeStage("reviewing", "zh-Hans");
  assert.match(zh.clientMessage, /\p{Script=Han}/u);
  assert.match(zh.clientLabel, /\p{Script=Han}/u);
  assert.equal(zh.label, "Review in progress", "staff names stay English");
  assert.deepEqual(Object.keys(zh).sort(), ["clientLabel", "clientMessage", "label"]);
  for (const stage of [...STAGES, "nonsense", null]) {
    const text = describeStage(stage, "zh-Hans");
    assert.match(text.clientLabel, /\p{Script=Han}/u, String(stage));
    assert.match(text.clientMessage, /\p{Script=Han}/u, String(stage));
    assert.deepEqual(describeStage(stage, "fr"), describeStage(stage), "an unknown language is English");
  }
  assert.equal(new Set(STAGES.map((stage) => describeStage(stage, "zh-Hans").clientLabel)).size, STAGES.length);
  setHantMap(MAP);
  try {
    assert.equal(describeStage("reviewing", "zh-Hant").clientMessage, MAP[zh.clientMessage]);
  } finally {
    setHantMap(null);
  }
});

test("the text table's English stage entries match STAGE_DESCRIPTIONS", async () => {
  const { t } = await import("../src/client-text.mjs");
  for (const stage of [...STAGES, "unknown"]) {
    const english = describeStage(stage === "unknown" ? "nonsense" : stage);
    assert.equal(t(`stage.${stage}.label`), english.clientLabel, stage);
    assert.equal(t(`stage.${stage}.client`), english.clientMessage, stage);
  }
});

test("each stage has a staff name, a client label and a client message", () => {
  const STAFF = { draft: "Draft", received: "Request sent", screening: "Screening in progress", preparation_ready: "Pending intake / filing", preparing: "Filing in progress (preparing)", corrections_required: "Corrections in progress", review_ready: "Pending review", reviewing: "Review in progress", review_approved: "Ready to exit", ready_to_efile: "Ready to e-file", efiled: "E-filed", closed: "Closed" };
  const CLIENT_EN = { draft: "Draft", received: "Sent to PCDC", screening: "Being reviewed", preparation_ready: "Waiting for a volunteer", preparing: "Being prepared", corrections_required: "Being corrected", review_ready: "Waiting for review", reviewing: "Being checked", review_approved: "Ready to sign", ready_to_efile: "Signed", efiled: "E-filed", closed: "Closed" };
  const CLIENT_ZH = { draft: "草稿", received: "已发送给 PCDC", screening: "审核中", preparation_ready: "等待志愿者", preparing: "准备中", corrections_required: "正在更正", review_ready: "等待检查", reviewing: "检查中", review_approved: "等待签名", ready_to_efile: "已签名", efiled: "已电子递交", closed: "已关闭" };
  const MESSAGES = {
    received: ["Your application is with PCDC. The office will review it soon and may call you.", "PCDC 已收到您的申请。办公室会尽快查看，并可能致电您。"],
    screening: ["PCDC is reviewing your application. We may call you to confirm your information and documents.", "PCDC 正在审核您的申请。我们可能会致电您，核对您的信息和文件。"],
    preparation_ready: ["Your application has been checked. It is waiting for a volunteer to start preparing your return.", "您的申请已核对完毕，正在等待志愿者开始准备您的报税表。"],
    review_ready: ["Your return is prepared and is waiting for an independent reviewer.", "您的报税表已准备好，正在等待审核志愿者检查。"],
    review_approved: ["Your return has been checked. PCDC will contact you to sign Form 8879, which is needed before your return can be filed.", "您的报税表已检查完毕。PCDC 会联系您签署 8879 表，签署后才能递交报税表。"],
    ready_to_efile: ["You signed Form 8879. PCDC will e-file your return next.", "您已签署 8879 表。PCDC 接下来会以电子方式递交您的报税表。"],
    efiled: ["Your return was e-filed. The IRS will confirm whether it is accepted.", "您的报税表已电子递交。国税局会确认是否接受。"],
  };
  for (const stage of STAGES) {
    assert.equal(describeStage(stage).label, STAFF[stage], stage);
    assert.equal(describeStage(stage, "zh-Hans").label, STAFF[stage], `${stage}: staff names stay English`);
    assert.equal(describeStage(stage).clientLabel, CLIENT_EN[stage], stage);
    assert.equal(describeStage(stage, "zh-Hans").clientLabel, CLIENT_ZH[stage], stage);
    assert.ok(describeStage(stage).clientMessage && describeStage(stage, "zh-Hans").clientMessage, stage);
  }
  for (const [stage, [en, zh]] of Object.entries(MESSAGES)) {
    assert.equal(describeStage(stage).clientMessage, en, stage);
    assert.equal(describeStage(stage, "zh-Hans").clientMessage, zh, stage);
  }
});

const PHONE = /\d{3}\D{0,2}\d{3}\D{0,2}\d{4}/;
const NEW_HISTORY = [
  ["PCDC started reviewing your application. We may call you.", "PCDC 已开始审核您的申请。我们可能会致电您。"],
  ["PCDC recorded that you signed Form 8879. Your return is ready to e-file.", "PCDC 已记录您签署了 8879 表。您的报税表可以电子递交了。"],
  ["PCDC e-filed your return.", "PCDC 已电子递交您的报税表。"],
];

test("no stage message or new history line names a phone number", () => {
  for (const stage of STAGES)
    for (const lang of ["en", "zh-Hans"]) {
      assert.doesNotMatch(describeStage(stage, lang).clientMessage, PHONE, `${stage} ${lang}`);
      assert.doesNotMatch(describeStage(stage, lang).clientLabel, PHONE, `${stage} ${lang}`);
    }
  for (const [line] of NEW_HISTORY)
    for (const lang of ["en", "zh-Hans"]) assert.doesNotMatch(historyLine(line, lang), PHONE, `${line} ${lang}`);
});
