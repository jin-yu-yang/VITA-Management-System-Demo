import { createAppError } from "./errors.mjs";

// The one data adapter. Everything the browser knows about the database goes
// through this file: the five application RPCs, the RLS-scoped SELECT reads,
// the Realtime subscription, and the single snake_case → camelCase mapping
// that turns rows into the objects `src/contracts.mjs` documents. No DOM, no
// controller state, no auth. The Supabase client is injected (Ruling R33).
//
// Two rules this file keeps:
//
//   * **An applicant read never names a staff table.** RLS would refuse those
//     rows anyway, but asking is already a mistake: the adapter decides what to
//     fetch from the caller's own membership, so a client screen cannot request
//     findings, internal history or contact attempts by accident.
//   * **Every failure is mapped once.** `createAppError` in `src/errors.mjs` is
//     the only mapper, for `{error}` returned by supabase-js and for a thrown
//     transport failure alike, so the browser only ever sees a domain code.

// The tables each principal may watch, which are exactly the tables it may
// read. `subscribe` and the read paths share this one list.
const CLIENT_TABLES = Object.freeze([
  "cases",
  "document_requests",
  "documents",
  "client_events",
  "workspaces",
]);
const STAFF_TABLES = Object.freeze([
  ...CLIENT_TABLES,
  "people",
  "preparation_participants",
  "admin_followups",
  "contact_attempts",
  "case_events",
  "assistance_items",
  "reviews",
]);
export const SUBSCRIBED_TABLES = Object.freeze({
  applicant: CLIENT_TABLES,
  presenter: STAFF_TABLES,
});

// INSERT and UPDATE only. A deleted row is never announced: fixture reset
// removes cases wholesale, and a refresh is how the browser learns that.
const WATCHED_EVENTS = Object.freeze(["INSERT", "UPDATE"]);

const CONNECTION_STATES = Object.freeze({
  SUBSCRIBED: "online",
  TIMED_OUT: "reconnecting",
  CHANNEL_ERROR: "reconnecting",
  CLOSED: "offline",
});

const camelKey = (key) => key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());

// Whole-row camelCase, for the tables whose every column is client-safe.
export const camelRow = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [camelKey(key), value]),
  );

// The Case scalars of `contracts.mjs`. Deliberately narrower than the row:
// origin, fixture_key and the created_by columns are storage detail and are
// not part of the browser Case.
export const mapCase = (row) => ({
  id: row.id,
  reference: row.reference,
  workspaceId: row.workspace_id,
  ownerUserId: row.owner_user_id,
  fixture: row.fixture,
  stage: row.stage,
  revision: Number(row.revision),
  preparationVersion: Number(row.preparation_version),
  answers: row.answers,
  intakeVerified: row.intake_verified,
  preparerId: row.preparer_id,
  reviewerId: row.reviewer_id,
  lastRemindedAt: row.last_reminded_at,
  lastRemindedByPersonId: row.last_reminded_by_person_id,
});

export const mapPerson = (row) => ({
  id: row.id,
  name: row.name,
  capabilities: row.capabilities,
});

// Review attempts oldest first. Findings and resolutions are internal staff
// text; they live here and reach no client-readable row.
export const mapReview = (row) => ({
  id: row.id,
  preparationVersion: Number(row.preparation_version),
  reviewerId: row.reviewer_person_id,
  status: row.status,
  findings: row.findings,
  resolution: row.resolution,
  clientContactStatus: row.client_contact_status,
  clientContactOutcome: row.client_contact_outcome,
  clientContactNote: row.client_contact_note,
  createdAt: row.created_at,
  decidedAt: row.decided_at,
  clientContactedAt: row.client_contacted_at,
});

export const mapContactAttempt = (row) => ({
  id: row.id,
  outcome: row.outcome,
  note: row.note,
  actorPersonId: row.actor_person_id,
  createdAt: row.created_at,
});

// Each follow-up carries its own contact attempts (Ruling R20).
export const mapFollowup = (row, attemptRows) => ({
  id: row.id,
  requestId: row.request_id,
  assigneeId: row.assignee_person_id,
  status: row.status,
  reason: row.reason,
  resolutionOutcome: row.resolution_outcome,
  resolutionNote: row.resolution_note,
  createdByPersonId: row.created_by_person_id,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
  attempts: attemptRows
    .filter((attempt) => attempt.followup_id === row.id)
    .map(mapContactAttempt),
});

export const mapAssistance = (row) => ({
  id: row.id,
  caseId: row.case_id,
  title: row.title,
  status: row.status,
  revision: Number(row.revision),
  assigneeId: row.assignee_person_id,
  resolutionNote: row.resolution_note,
  language: row.language,
  contactPreference: row.contact_preference,
  fixture: row.fixture,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// The Case an applicant sees: their own case plus the three client-readable
// related tables, and nothing else.
export const mapClientCase = ({ row, requests, documents, history }) => ({
  ...mapCase(row),
  requests: requests.map(camelRow),
  documents: documents.map(camelRow),
  history: history.map(camelRow),
});

// The staff Case: the client sections plus participation, follow-ups with
// their attempts, review attempts and the internal history.
export const mapStaffCase = ({
  row,
  participants,
  requests,
  documents,
  followups,
  attempts,
  reviews,
  history,
  internalHistory,
}) => ({
  ...mapClientCase({ row, requests, documents, history }),
  participants: participants.map((participant) => participant.person_id),
  reviews: reviews.map(mapReview),
  followups: followups.map((followup) => mapFollowup(followup, attempts)),
  internalHistory: internalHistory.map(camelRow),
});

export function createStore(client) {
  // supabase-js reports API failures as `{error}` and transport failures by
  // throwing. Both go through the one shared mapper, so a caller only ever
  // handles a domain code.
  const settled = async (call) => {
    let result;
    try {
      result = await call;
    } catch (cause) {
      throw createAppError(cause);
    }
    if (result?.error) throw createAppError(result.error);
    return result?.data;
  };

  const read = async (query) => (await settled(query)) ?? [];

  const call = (name, args) => settled(client.rpc(name, args));

  // Rows of one case-scoped table, in the order the history and lists are
  // shown: oldest first, with a stable tiebreak.
  const relatedRows = (table, caseId, tiebreak = "id") =>
    read(
      client
        .from(table)
        .select("*")
        .eq("case_id", caseId)
        .order("created_at")
        .order(tiebreak),
    );

  // The caller's own membership row. RLS returns exactly the caller's active
  // row, so reading it is both the access check and the workspace lookup.
  const membership = async () => {
    const rows = await read(client.from("memberships").select("*"));
    if (!rows.length) throw createAppError({ code: "VT001" });
    return rows[0];
  };

  const access = async () => (await membership()).access;

  const requirePresenter = async () => {
    if ((await access()) !== "presenter") throw createAppError({ code: "VT001" });
  };

  // The action id is the server's replay key. The caller normally supplies it;
  // when it does not, one is minted and kept **on the caller's action object**,
  // so retrying a timed-out request re-sends the identical envelope and the
  // server answers with the stored receipt instead of acting twice.
  const actionId = (request) => {
    if (!request.actionId) request.actionId = crypto.randomUUID();
    return request.actionId;
  };

  return {
    async getPrincipal() {
      let identity;
      try {
        identity = await client.auth.getUser();
      } catch (cause) {
        throw createAppError(cause);
      }
      const user = identity?.data?.user ?? null;
      // No session and no active membership are the same answer: this account
      // has no access, and nothing about the workspace is revealed.
      if (!user) throw createAppError({ code: "VT001" });
      const row = await membership();
      return {
        userId: user.id,
        workspaceId: row.workspace_id,
        access: row.access,
        email: user.email ?? null,
      };
    },

    async listPeople() {
      await requirePresenter();
      return (
        await read(client.from("people").select("*").order("person_key"))
      ).map(mapPerson);
    },

    async listCases() {
      return (await read(client.from("cases").select("*").order("reference"))).map(
        mapCase,
      );
    },

    async getCase(id) {
      const staff = (await access()) === "presenter";
      const rows = await read(client.from("cases").select("*").eq("id", id));
      const row = rows[0];
      // Absent, another workspace's and another applicant's case are one
      // answer, with no reference, name or revision behind it.
      if (!row) throw createAppError({ code: "VT002" });
      const client_ = {
        row,
        requests: await relatedRows("document_requests", id),
        documents: await relatedRows("documents", id),
        history: await relatedRows("client_events", id),
      };
      if (!staff) return mapClientCase(client_);
      return mapStaffCase({
        ...client_,
        participants: await relatedRows(
          "preparation_participants",
          id,
          "person_id",
        ),
        followups: await relatedRows("admin_followups", id),
        attempts: await relatedRows("contact_attempts", id),
        reviews: await relatedRows("reviews", id),
        internalHistory: await relatedRows("case_events", id),
      });
    },

    async createCase(request) {
      return await call("vitally_create_case", {
        p_action_id: actionId(request),
        p_mode: request.mode,
        p_person_id: request.personId ?? null,
        p_answers: request.answers,
      });
    },

    async act(action) {
      return await call("vitally_apply_action", {
        p_action_id: actionId(action),
        p_case_id: action.caseId,
        p_expected_revision: action.expectedRevision,
        p_person_id: action.personId ?? null,
        p_type: action.type,
        p_payload: action.payload,
      });
    },

    async listAssistance() {
      await requirePresenter();
      return (
        await read(
          client
            .from("assistance_items")
            .select("*")
            .order("created_at")
            .order("id"),
        )
      ).map(mapAssistance);
    },

    async actAssistance(request) {
      await call("vitally_assistance_action", {
        p_action_id: actionId(request),
        p_item_id: request.itemId,
        p_expected_revision: request.expectedRevision,
        p_person_id: request.personId ?? null,
        p_type: request.type,
        p_note: request.note ?? null,
      });
    },

    async resetFixtures(request) {
      await call("vitally_reset_fixtures", { p_action_id: actionId(request) });
    },

    async loadCheckpoint(request) {
      await call("vitally_load_checkpoint", {
        p_action_id: actionId(request),
        p_case_id: request.caseId,
        p_expected_revision: request.expectedRevision,
        p_checkpoint: request.checkpoint,
      });
    },

    // One channel per subscription, over the tables this principal may read.
    // A change carries identifiers only — never a row's contents — because the
    // browser reacts by refetching through the same RLS-scoped reads.
    subscribe({ onChange, onConnection } = {}) {
      let channel = null;
      let stopped = false;
      const connection = (status) => {
        const state = CONNECTION_STATES[status];
        if (state) onConnection?.(state);
      };
      const announce = (table, payload) => {
        const row = payload?.new ?? payload?.old ?? {};
        const id = row.id ?? null;
        onChange?.({
          table,
          eventType: payload?.eventType ?? null,
          id,
          caseId: table === "cases" ? id : (row.case_id ?? null),
        });
      };
      const open = async () => {
        const tables = SUBSCRIBED_TABLES[await access()] ?? CLIENT_TABLES;
        if (stopped) return;
        const live = client.channel(`vitally:${crypto.randomUUID()}`);
        for (const table of tables)
          for (const event of WATCHED_EVENTS)
            live.on("postgres_changes", { event, schema: "public", table }, (payload) =>
              announce(table, payload),
            );
        channel = live;
        live.subscribe(connection);
      };
      // The channel cannot open before the membership read answers; a failure
      // there is reported as a lost connection rather than thrown at a caller
      // that has already been handed its unsubscribe function.
      open().catch(() => connection("CLOSED"));
      return () => {
        if (stopped) return;
        stopped = true;
        const live = channel;
        channel = null;
        if (live) client.removeChannel(live);
      };
    },
  };
}
