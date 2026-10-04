// The value-check contract table (docs/superpowers/specs/2026-09-30-intake-screens-design.md §6).
// One list read by both sides: tests/intake-catalogue.test.mjs checks the
// browser's checkValue against `js`, and tests/database-intake.mjs checks the
// server's vitally_private.check_intake_value against `sql`. `true` = valid.
//
// Exactly two rows differ, both emails with a space inside (marked below): the
// browser rejects them and the server (4a, unchanged) accepts them. The
// direction is safe: the client withholds an invalid value, so the server
// never receives it (spec §2.5).

// A complete, valid household member: the 4a mirror list's `member()`, the
// first option of every choice and the lowest number.
// 32 lowercase hex characters, distinct for each n (a fictional member id).
const memberId = (n = 1) => n.toString(16).padStart(32, "0");

const member = (overrides = {}) => ({
  member_id: memberId(1),
  first_name: "Sample",
  last_name: "Sample",
  dob: "1980-01-02",
  relationship: "son_daughter",
  months_lived: "0",
  married: "married",
  us_citizen: "no",
  resident_na: "no",
  fulltime_student: "no",
  disabled: "no",
  ippin: "no",
  ...overrides,
});

const both = (field, value, ok) => ({ field, value, js: ok, sql: ok });

export const INTAKE_VALUE_CASES = [
  // text, signature, longtext
  both("tp_first_name", "Mei", true),
  both("tp_first_name", "x".repeat(200), true),
  both("tp_first_name", "x".repeat(201), false),
  both("tp_first_name", "  ", true),
  both("tp_first_name", 7, false),
  // JavaScript counts a character outside the BMP as two.
  both("tp_first_name", "\u{1F600}".repeat(100), true),
  both("tp_first_name", "\u{1F600}".repeat(101), false),
  both("tp_first_name", "中".repeat(200), true),
  both("tp_first_name", null, true),
  both("tp_first_name", "", true),
  both("additional_notes", "Please call after 5 PM.", true),
  both("additional_notes", "x".repeat(5000), true),
  both("additional_notes", "x".repeat(5001), false),
  both("gcf_tp_signature", "Mei Lin", true),
  both("gcf_tp_signature", "x".repeat(201), false),

  // email
  both("email", "mei.lin@example.com", true),
  both("email", "a@b", true),
  // Marked difference (spec §2.5): an email with a space inside.
  { field: "email", value: "mei lin@example.com", js: false, sql: true },
  // Marked difference (spec §2.5): the 4a list's email with a space.
  { field: "email", value: "a b@c", js: false, sql: true },
  both("email", "a@", false),
  both("email", "@", false),
  both("email", "@b", false),
  both("email", "not-an-email", false),
  both("email", "a@b@c", false),
  both("email", `${"a".repeat(250)}@b.cd`, false),

  // phone
  both("tp_phone", "(215) 555-0100", true),
  both("tp_phone", "215-555-01000", false),
  both("tp_phone", "555-0100", false),

  // zip: checkValue sees the raw value; trimming is sendable's job.
  both("addr_zip", "12345", true),
  both("addr_zip", "19107", true),
  both("addr_zip", " 12345 ", false),
  both("addr_zip", "1234", false),
  both("addr_zip", "19107-1234", false),

  // date
  both("tp_dob", "1961-04-12", true),
  both("tp_dob", "2024-02-29", true),
  both("tp_dob", "2025-02-30", false),
  both("tp_dob", "2025-02-29", false),
  both("tp_dob", "2025-04-31", false),
  both("tp_dob", "2025-13-01", false),
  both("tp_dob", "2025-00-10", false),
  both("tp_dob", "2025-01-00", false),
  both("tp_dob", "0050-01-01", false),
  both("tp_dob", "1980-1-2", false),

  // year
  both("spouse_death_year", "2020", true),
  both("spouse_death_year", "20201", false),

  // number without a range
  both("inc_wages_job_count", "3", true),
  both("inc_wages_job_count", "123456", true),
  both("inc_wages_job_count", "1234567", false),
  both("inc_wages_job_count", "1.5", false),
  both("inc_wages_job_count", "-1", false),

  // choice
  both("service", "drop_off", true),
  both("marital_status", "never_married", true),
  both("marital_status", "single", false),
  both("marital_status", "Single", false),

  // yesno
  both("inc_wages", "not_sure", true),
  both("multi_state", "not_sure", true),
  both("claimed_by_other", "maybe", false),

  // multi
  both("best_contact_time", ["weekend", "any_time"], true),
  both("best_contact_time", ["weekend", "weekend"], false),

  // who
  both("us_citizen", ["me"], true),
  both("us_citizen", ["me", "spouse"], true),
  both("us_citizen", ["none"], true),
  both("us_citizen", ["none", "me"], false),
  both("us_citizen", ["me", "me"], false),
  both("us_citizen", ["someone"], false),
  both("us_citizen", "me", false),
  both("us_citizen", [1], false),
  both("us_citizen", [], true),

  // id: the hidden member id, 32 lowercase hex characters.
  both("hh", [member({ member_id: "0123456789abcdef0123456789abcdef" })], true),
  both("hh", [member({ member_id: "0123456789ABCDEF0123456789ABCDEF" })], false),
  both("hh", [member({ member_id: "0123456789abcdef0123456789abcde" })], false),
  both("hh", [member({ member_id: "0123456789abcdef0123456789abcdef0" })], false),
  both("hh", [member({ member_id: 5 })], false),

  // group; the catalogue's only ranged number is the member's months_lived.
  // Every member needs a well-formed id, and no two members share one.
  both("hh", [{ member_id: memberId(1), first_name: "Ming" }], true),
  both("hh", [{ member_id: memberId(1), first_name: "Ming", months_lived: "12" }], true),
  both("hh", [{ member_id: memberId(1), first_name: "Ming", months_lived: "13" }], false),
  both("hh", [{ first_name: "Ming" }], false),
  both("hh", [{ member_id: "", first_name: "Ming" }], false),
  both("hh", [{ member_id: null, first_name: "Ming" }], false),
  both("hh", [{ member_id: "XYZ", first_name: "Ming" }], false),
  both("hh", [{ member_id: memberId(1) }, { member_id: memberId(1) }], false),
  both("hh", [{ member_id: memberId(1) }, { member_id: memberId(2) }], true),
  both("hh", [member()], true),
  both("hh", [member({ months_lived: "12" })], true),
  both("hh", [member({ months_lived: "13" })], false),
  both("hh", [member({ months_lived: "0" })], true),
  both("hh", [member({ dob: null, first_name: "" })], true),
  both("hh", [{ member_id: memberId(1) }], true),
  both("hh", [{}], false),
  both("hh", [null], false),
  both("hh", [[]], false),
  both("hh", [member({ extra: "x" })], false),
  both("hh", Array.from({ length: 10 }, (_, i) => ({ member_id: memberId(i + 1) })), true),
  both("hh", Array.from({ length: 11 }, (_, i) => ({ member_id: memberId(i + 1) })), false),
  both("hh", "Bo", false),
];
