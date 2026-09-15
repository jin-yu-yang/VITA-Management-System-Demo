import { esc, icon, button, input, select, radio, badge } from "./ui.mjs";
import { screening } from "./domain.mjs";
const steps = [
  "Your visit",
  "Your situation",
  "Your details",
  "Check your answers",
];
export function header(u) {
  return `<a class="skip" href="#main">Skip to content</a><header class="site-header"><button class="brand" data-action="home" aria-label="PCDC home"><span class="brand-mark">${icon("home")}</span><span><strong>PCDC<span class="brand-dot">.</span></strong><small>COMMUNITY TAX ASSISTANCE</small></span></button><nav aria-label="Main navigation"><span class="season">2025 TAX SEASON</span>${button(`${icon("help")} Need help?`, "help", "text")}<span class="header-divider"></span>${button(u.route === "volunteer" ? `${icon("user")} Alex · Volunteer` : "Volunteer sign in", "staff-login", "text")}</nav></header>`;
}
export function toolbar(c, u) {
  return `<aside class="demo-bar" aria-label="Prototype controls"><div class="demo-label"><span class="live-dot"></span><strong>Prototype controls</strong><span class="demo-fiction">Fictional data only</span></div><div class="demo-actions">${button(`${icon("spark")} Fill sample details`, "sample", "demo")}${u.route === "access" && u.codeSent ? button("Use demo code", "demo-code", "demo") : ""}${button(`${icon(u.route === "volunteer" ? "user" : "folder")} ${u.route === "volunteer" ? "Client view" : "Volunteer view"}`, "switch", "demo")}${button("Load exception example", "exception", "demo subtle")}${button(`${icon("refresh")} Reset demo`, "reset", "demo subtle")}</div></aside>`;
}
export function home() {
  return `<main id="main" class="landing" tabindex="-1"><section class="hero"><div class="eyebrow"><span></span>HERE FOR OUR COMMUNITY</div><h1>A little support.<br>A <em>clearer path.</em></h1><p class="hero-copy">Free tax help from people who care. <br>Start your application today. We’ll help<br class="desktop-only"> you take it from here.</p><div class="trust-line">${icon("shield")} <span>No cost. No account to create.</span></div><div class="community-note"><div class="avatar-stack"><span>陈</span><span>李</span><span>林</span></div><p>Your neighbors. Your community.<br><strong>Your tax assistance team.</strong></p></div></section><section class="welcome-panel"><div class="welcome-art" aria-hidden="true"><svg viewBox="0 0 500 190" fill="none"><circle cx="265" cy="100" r="78" fill="#ddeae4"/><circle cx="185" cy="63" r="28" fill="#f6e5be"/><path d="M140 134h234M169 110V70l55-37 54 37v68M186 60v-20h17M251 132V75h52l38 30v27" stroke="#68877f" stroke-width="2"/><path d="M212 134V96h22v38M266 88h15v15h-15M294 88h15v15h-15M178 79h16v16h-16" stroke="#68877f" stroke-width="2"/><rect x="280" y="35" width="84" height="109" rx="8" fill="#fff" stroke="#a9bfb4"/><path d="M297 60h41M297 72h29M297 99h41M297 111h23" stroke="#b2c7bc" stroke-width="4" stroke-linecap="round"/><circle cx="350" cy="126" r="24" fill="#244e4c"/><path d="m340 125 7 7 13-15" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M120 132c-15-34-7-61 8-67 2 13 12 23 6 43M132 134c2-25 18-34 31-30-5 12-16 19-31 30" fill="#a8bba0"/><path d="M115 132h30l-5 17h-20Z" fill="#d7b990"/></svg></div><div class="welcome-card"><span class="overline">LET’S GET STARTED</span><h2>How can we help?</h2><button class="entry-card start-card" data-action="start" aria-label="Start an application"><span class="entry-icon">${icon("file")}</span><span><strong>Start an application</strong><small>New here? Begin with a few questions.</small></span>${icon("arrow")}</button><button class="entry-card" data-action="return" aria-label="Return to my application"><span class="entry-icon">${icon("folder")}</span><span><strong>Return to my application</strong><small>Continue a form or check your progress.</small></span>${icon("arrow")}</button><div class="welcome-help">${icon("phone")} <span>Prefer a little help? <button class="inline" data-action="help">Contact our office</button></span></div></div></section><div class="landing-bottom"><span>Philadelphia Chinatown Development Corporation</span><span>Serving our community, together.</span></div></main>`;
}
export function access(c, u) {
  const returning = u.accessMode === "return";
  return `<main id="main" class="narrow" tabindex="-1">${button(`${icon("back")} Back to welcome`, "home", "text back-link")}<div class="center-icon">${icon(u.codeSent ? "lock" : "shield")}</div><div class="page-intro centered"><span class="overline">${returning ? "WELCOME BACK" : "A SIMPLE WAY TO RETURN"}</span><h1>${u.codeSent ? "Check your code" : returning ? "Return to your application" : "Keep your application within reach"}</h1><p>${u.codeSent ? `Enter the code for ${esc(u.destination)}.<br>For this prototype, use <strong>246810</strong>. No message was sent.` : returning ? "Use your Application ID to continue your form or see your progress." : "Choose a phone or email you can access. You’ll use a one-time code to return—no password needed."}</p></div><form id="access-form" class="panel access-panel">${u.codeSent ? `${input("Verification code", "code", u.code, "text", 'required inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit code"')}<p class="field-note">This confirms access to your application. A volunteer will verify taxpayer identity separately.</p><div class="resend-row">Didn’t get a code? ${button("Resend code", "resend", "inline")}</div><button class="btn primary full" type="submit">Verify and continue ${icon("arrow")}</button>` : returning ? `${input("Application ID", "applicationId", u.applicationId, "text", 'required placeholder="e.g. DEMO-7K4P-92" autocomplete="off"')}<p class="field-note">We’ll use the contact method you verified when you started.</p><button class="btn primary full" type="submit">Send verification code ${icon("arrow")}</button>` : `<div class="segmented" aria-label="Contact method">${button(`${icon("phone")} Phone`, "method-phone", u.method === "phone" ? "selected" : "")}${button(`${icon("mail")} Email`, "method-email", u.method === "email" ? "selected" : "")}</div>${input(u.method === "phone" ? "Phone number" : "Email address", "contact", u.contact, u.method === "phone" ? "tel" : "email", u.method === "phone" ? 'required inputmode="tel" placeholder="Use a number that can receive texts"' : 'required placeholder="you@example.com"')}<p class="field-note">${u.method === "phone" ? "No email address? A phone that receives texts is enough." : "No email address? Select Phone above."}</p><button class="btn primary full" type="submit">Send verification code ${icon("arrow")}</button>`}${u.error ? `<p class="error" role="alert">${esc(u.error)}</p>` : ""}</form><div class="support-note">${icon("help")}<div><strong>Can’t access your phone or email?</strong><p>Our volunteers can help by phone or in person.</p><button class="inline" data-action="help">Get help from the office ${icon("arrow")}</button></div></div></main>`;
}
export function idCard(c) {
  return `<main id="main" class="narrow" tabindex="-1"><div class="center-icon success">${icon("check")}</div><div class="page-intro centered"><span class="overline">YOU’RE READY TO BEGIN</span><h1>A small card.<br>One less thing to remember.</h1><p>Keep your Application ID somewhere handy.<br>You’ll use it whenever you come back.</p></div><div class="reference-card"><span>PCDC <small>COMMUNITY TAX ASSISTANCE</small></span><p>YOUR APPLICATION ID</p><strong>${esc(c.id)}</strong><div class="reference-bottom">2025 tax year <span>Save this ID · Keep it private</span></div></div><div class="card-tools">${button(`${icon("copy")} Copy ID`, "copy", "secondary")}${button(`${icon("print")} Print reference card`, "print", "secondary")}</div>${button(`Continue to application ${icon("arrow")}`, "continue-intake", "primary full")}<p class="footnote">A verification code is still needed to reopen your application.<br>Your ID card does not contain your tax information.</p></main>`;
}
const row = (label, value) =>
  `<div class="detail-row"><span>${label}</span><strong>${esc(value || "—")}</strong></div>`;
export function intake(c, u) {
  const a = c.answers;
  const result = screening(a);
  let body = "";
  if (u.step === 0)
    body = `<div class="service-options">${[
      ["Same-day", "Meet with our volunteers at the site.", "home"],
      ["Drop-off", "Leave your documents. We’ll follow up.", "folder"],
      ["Online", "Work with us remotely.", "user"],
    ]
      .map(
        ([val, desc, ico]) =>
          `<label class="service-card ${a.service === val ? "selected" : ""}"><input type="radio" name="service" value="${val}" ${a.service === val ? "checked" : ""} required><span class="service-icon">${icon(ico)}</span><span><strong>${val}</strong><small>${desc}</small></span><i></i></label>`,
      )
      .join(
        "",
      )}</div><div class="form-grid">${select("Tax year", "year", a.year, ["2025"], "required")}${select("Preferred service language", "language", a.language, ["English", "Cantonese", "Mandarin"], "required")}</div><div class="info-note">${icon("help")}<p>This prototype covers selected intake questions for tax year 2025. A volunteer will complete the intake process with you.</p></div>`;
  if (u.step === 1)
    body = `<div class="form-grid">${input("City of residence", "residenceCity", a.residenceCity, "text", "required")}${select("State of residence", "residenceState", a.residenceState, ["PA", "NJ", "DE", "Other"], "required")}</div>${radio("Did you earn income from driving for Uber or Lyft in 2025?", "rideshare", a.rideshare)}${radio("Apart from Uber/Lyft driving, did you earn income from another business, freelance work, or self-employment in 2025?", "other", a.other)}<p class="field-note">Wages earned as an employee are not self-employment income.</p>${radio("Did you have more than 10 stock transactions in 2025?", "stocks", a.stocks)}${result === "unsupported" ? `<div class="notice amber" role="status">${icon("help")}<div><h3>Outside PCDC’s current service scope</h3><p>${a.other === "yes" ? "PCDC cannot prepare returns with other business or self-employment income under its current service policy. This also applies if you have Uber/Lyft income." : "More than 10 stock transactions exceeds PCDC’s current service limit."}</p><p>This is a PCDC service limitation. Contact our office for guidance; your draft is saved.</p>${button("Contact the office", "help", "secondary")}</div></div>` : result === "assistance" || a.residenceState === "Other" ? `<div class="notice amber"><div><h3>Let’s check with a volunteer</h3><p>Our office can help clarify your situation before you continue. Your answers will stay saved.</p>${button("Contact the office", "help", "secondary")}</div></div>` : ""}`;
  if (u.step === 2)
    body = `<div class="form-grid">${input("First name", "firstName", a.firstName, "text", 'required autocomplete="given-name"')}${input("Last name", "lastName", a.lastName, "text", 'required autocomplete="family-name"')}</div>${input("Mailing address", "address", a.address, "text", 'required autocomplete="street-address"')}<div class="form-grid triple">${input("City", "city", a.city, "text", "required")}${select("State", "state", a.state, ["PA", "NJ", "DE"], "required")}${input("ZIP code", "zip", a.zip, "text", 'required inputmode="numeric" pattern="[0-9]{5}(-[0-9]{4})?"')}</div><div class="form-grid">${input("People in your household", "household", a.household, "number", 'required min="1" max="30"')}${select(
      "Who is completing this form?",
      "helper",
      a.helper,
      [
        ["self", "I am the taxpayer"],
        ["helper", "Someone is helping me"],
      ],
      "required",
    )}</div>${a.helper === "helper" ? `<div class="info-note">${icon("help")}<p>Contact the office for assisted applications. Helping enter answers does not grant access or signing authority.</p></div>` : ""}${select(
      "Are your income documents ready?",
      "documents",
      a.documents,
      [
        ["ready", "Yes, I have them ready"],
        ["some", "Some are still missing"],
        ["unsure", "I need help checking"],
      ],
      "required",
    )}<p class="field-note">This records what you have ready. A volunteer will check which documents are needed and verify them.</p>`;
  if (u.step === 3)
    body = `<div class="review-block"><div class="section-head"><h3>Your visit</h3>${button("Edit visit", "edit-0", "inline")}</div>${row("Service", a.service)}${row("Tax year", a.year)}${row("Preferred language", a.language)}</div><div class="review-block"><div class="section-head"><h3>Your situation</h3>${button("Edit screening", "edit-1", "inline")}</div>${row("Residence", `${a.residenceCity || ""}, ${a.residenceState || ""}`)}${row("Uber / Lyft income", a.rideshare === "yes" ? "Yes" : "No")}${row("Other self-employment", a.other === "yes" ? "Yes" : "No")}${row("More than 10 stock transactions", a.stocks === "yes" ? "Yes" : "No")}</div><div class="review-block"><div class="section-head"><h3>Your details</h3>${button("Edit details", "edit-2", "inline")}</div>${row("Name", `${a.firstName || ""} ${a.lastName || ""}`)}${row("Mailing address", `${a.address || ""}, ${a.city || ""}, ${a.state || ""} ${a.zip || ""}`)}${row("Household size", a.household)}${row("Documents", a.documents === "ready" ? "Reported ready" : a.documents === "some" ? "Some missing" : "Needs help checking")}</div><label class="checkbox-row"><input type="checkbox" name="confirmed" required ${u.confirmed ? "checked" : ""}><span>I have checked my answers</span></label><p class="field-note">This is an answer confirmation, not a signature on a tax or consent form. A volunteer will follow up about required forms.</p>`;
  const blocked =
    (u.step === 1 &&
      (result === "unsupported" ||
        result === "assistance" ||
        a.residenceState === "Other")) ||
    (u.step === 2 && a.helper === "helper");
  return `<main id="main" class="workspace" tabindex="-1"><aside class="intake-sidebar"><div class="sidebar-top"><span class="overline">YOUR APPLICATION</span><h2>A few steps.<br>We’re here to help.</h2><ol class="step-list">${steps.map((s, i) => `<li class="${i === u.step ? "active" : i < u.step ? "complete" : ""}"><span>${i < u.step ? icon("check") : String(i + 1).padStart(2, "0")}</span><div>${s}${i === u.step ? "<small>YOU ARE HERE</small>" : ""}</div></li>`).join("")}</ol></div><div class="sidebar-help">${icon("phone")}<h3>Prefer to talk it through?</h3><p>Our volunteers can help you by phone or in person.</p>${button("Contact the office", "help", "inline")}</div></aside><section class="form-workspace"><div class="application-meta"><span>${esc(c.id)}</span><span class="save-status">${icon("check")} ${u.storageError ? "Saved in this session only" : "Saved on this device"}</span></div><div class="page-intro"><span class="overline">STEP ${u.step + 1} OF 4</span><h1>${steps[u.step]}</h1><p>${["How would you like to work with our volunteers?", "A few questions help us understand how we can help.", "Tell us a little about yourself and what you have ready.", "Take a moment to make sure everything looks right."][u.step]}</p></div><form id="intake-form">${body}${u.error ? `<p class="error" role="alert">${esc(u.error)}</p>` : ""}<div class="form-actions"><div>${u.step ? button(`${icon("back")} Back`, "back-step", "text") : ""}${button("Save and exit", "save-exit", "text")}</div><button type="submit" class="btn primary" ${blocked ? "disabled" : ""}>${u.step === 3 ? "Submit application" : "Continue"} ${icon("arrow")}</button></div></form></section></main>`;
}
export function history(c, staff = false) {
  return `<div class="timeline">${[...c.history]
    .reverse()
    .map(
      (h) =>
        `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${esc(h.title)}</strong><p>${esc(h.detail)}</p><small>${esc(staff ? h.actor : "PCDC application")} · ${new Date(h.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small></div></div>`,
    )
    .join("")}</div>`;
}
export function progress(c) {
  const held = c.status === "held",
    responded = c.status === "responded";
  return `<main id="main" class="dashboard" tabindex="-1"><div class="page-intro dashboard-intro"><div><span class="overline">YOUR APPLICATION</span><h1>Hello, ${esc(c.answers.firstName)}.</h1><p>A little clarity on where things stand.</p></div><div class="id-pill">${icon("folder")}<div><small>APPLICATION ID</small><strong>${esc(c.id)}</strong></div></div></div><div class="progress-grid"><section><div class="panel status-panel"><div class="section-head"><h2>Your progress</h2>${badge(c.status)}</div><div class="progress-steps">${["Intake", "Preparation", "Review", "Signing"].map((x, i) => `<div class="${i === 0 && c.intakeVerified ? "done" : (i === 0 && !c.intakeVerified) || (i === 1 && c.intakeVerified) ? "current" : ""}"><span>${i === 0 && c.intakeVerified ? icon("check") : i + 1}</span><small>${x}</small></div>`).join("")}</div><p class="status-explanation">${c.status === "received" ? "A volunteer will check your information and documents. We’ll show your next step here." : c.status === "queued" ? "Your intake checks are complete. Your case is waiting for a preparer." : c.status === "preparing" ? "A volunteer is working on your application. No action is needed from you right now." : held ? "Your preparer needs a little more information before continuing." : "Your response is with the team. A volunteer needs to check it before preparation can continue."}</p></div>${held ? `<div class="action-card"><div class="action-label">${icon("clock")} ACTION NEEDED</div><h2>${esc(c.request.title)}</h2><p>${esc(c.request.message)}</p>${button(`Add document ${icon("upload")}`, "upload", "primary")}<small>Only a sample document is used in this prototype.</small></div>` : responded ? `<div class="received-card"><span class="success-icon">${icon("check")}</span><div><span class="overline">THANK YOU</span><h2>Document received</h2><p>Document received — waiting for a volunteer to check it.</p><span class="file-chip">${icon("file")} demo-mileage-record-2025.pdf</span></div></div>` : `<div class="next-card">${icon("shield")}<div><h3>You’re all set for now.</h3><p>Your next action will appear here if our team needs anything else.</p></div></div>`}<section class="panel history-panel"><div class="section-head"><h2>Application history</h2><span class="muted small">The latest, all in one place</span></div>${history(c)}</section></section><aside class="right-column"><div class="panel summary-panel"><span class="overline">AT A GLANCE</span><h3>Your service details</h3>${row("Tax year", "2025")}${row("Service", c.answers.service)}${row("Language", c.answers.language)}<div class="gentle-note">${icon("lock")} Your application is private to you and the site team.</div></div><div class="help-card"><span class="help-card-icon">${icon("phone")}</span><h3>We’re here for you.</h3><p>Questions about your application? Our volunteers can help.</p>${button("Contact the office", "help", "secondary")}</div></aside></div></main>`;
}
export function volunteer(c, u) {
  return `<main id="main" class="volunteer-layout" tabindex="-1"><aside class="volunteer-sidebar"><div><span class="overline">VOLUNTEER WORKSPACE</span><h2>A good day<br>to help.</h2><div class="volunteer-nav active">${icon("folder")} Case worklist <span>${c.id && c.status !== "draft" ? 1 : 0}</span></div><div class="volunteer-person"><span class="avatar">AL</span><div><strong>Alex</strong><small>Preparer · Demo profile</small></div></div></div><div class="sidebar-help"><span class="badge teal">2025 SEASON</span><p>Eligibility is preconfigured for this fictional volunteer.</p></div></aside><section class="volunteer-main"><div class="page-intro"><span class="overline">ONE CASE. ONE SHARED HISTORY.</span><h1>Your worklist</h1><p>Pick up where the team left off.</p></div>${
    !c.id || c.status === "draft"
      ? `<div class="panel empty-state">${icon("folder")}<h2>No submitted applications yet</h2><p>Complete the client application first. It will appear here when submitted.</p>${button("Go to client application", "switch", "primary")}</div>`
      : `<div class="worklist-summary"><div><small>ACTIVE CASES</small><strong>01</strong></div><div><small>ASSIGNED TO YOU</small><strong>${c.owner ? "01" : "00"}</strong></div><div><small>NEEDS ATTENTION</small><strong>${["received", "responded"].includes(c.status) ? "01" : "00"}</strong></div></div><div class="case-row"><span class="avatar soft">${esc(c.answers.firstName?.[0])}${esc(c.answers.lastName?.[0])}</span><div><strong>${esc(c.answers.firstName)} ${esc(c.answers.lastName)}</strong><small>${esc(c.id)} · ${esc(c.answers.service)} · 2025</small></div>${badge(c.status)}<span class="case-age">Today</span>${icon("chevron")}</div><div class="case-detail panel"><div class="section-head"><div><span class="overline">CASE WORKSPACE</span><h2>${esc(c.answers.firstName)}’s application</h2></div>${c.status === "queued" ? button(`Claim case ${icon("arrow")}`, "claim", "primary") : c.status === "preparing" ? button(`${icon("upload")} Request a document`, "request", "primary") : c.owner ? `<div class="owner-tag">${icon("user")} Assigned to Alex</div>` : ""}</div>${c.status === "received" ? `<div class="info-note"><div><strong>Intake checks are still pending</strong><p>Move past the off-screen staff work with the prototype control below.</p>${button(`${icon("play")} Simulate intake checks`, "intake-check", "secondary")}<small class="block">Demo time jump: records fictional interview, identity, document and applicable external consent checks.</small></div></div>` : ""}<div class="case-tabs" role="tablist">${[
          ["overview", "Overview"],
          ["documents", "Documents"],
          ["history", "History"],
        ]
          .map(
            ([v, t]) =>
              `<button role="tab" aria-selected="${u.tab === v}" class="${u.tab === v ? "active" : ""}" data-action="tab-${v}">${t}${v === "documents" ? ` <span>${c.documents.length}</span>` : ""}</button>`,
          )
          .join(
            "",
          )}</div><div class="case-tab-content" role="tabpanel">${u.tab === "history" ? history(c, true) : u.tab === "documents" ? documents(c) : `<div class="case-overview-grid"><div><h3>Intake at a glance</h3>${row("Uber / Lyft income", c.answers.rideshare === "yes" ? "Yes" : "No")}${row("Other self-employment", c.answers.other === "yes" ? "Yes" : "No")}${row("Intake checks", c.intakeVerified ? "Completed (simulated)" : "Pending")}${row("Preferred language", c.answers.language)}</div><div><h3>Documents & next action</h3>${documents(c)}</div></div>`}</div></div>`
  }</section></main>`;
}
function documents(c) {
  return `${c.documents.map((d) => `<div class="document-row">${icon("file")}<div><strong>${esc(d.name)}</strong><small>${d.verified ? "Verified during simulated intake" : "Awaiting verification"}</small></div><span class="document-check ${d.verified ? "" : "pending"}">${icon(d.verified ? "check" : "clock")}</span></div>`).join("") || '<p class="muted">Documents will appear after intake checks.</p>'}${c.request ? `<div class="request-summary"><span class="overline">${c.request.status === "open" ? "WAITING FOR CLIENT" : "RESPONSE RECEIVED"}</span><strong>${esc(c.request.title)}</strong><p>${esc(c.request.message)}</p><small>${c.request.status === "open" ? "Preparation is on hold." : "Preparation remains on hold until a volunteer verifies the response."}</small></div>` : ""}`;
}
export function modal(c, u) {
  if (!u.modal) return "";
  let title = "",
    body = "";
  if (u.modal === "help") {
    title = "A real person can help.";
    body = `<p>Contact PCDC’s office if you need help with your application, have lost your ID, or cannot access your phone or email.</p><div class="contact-option">${icon("phone")}<div><strong>Call the PCDC office</strong><small>Contact details shown in the live service.</small></div></div><div class="contact-option">${icon("home")}<div><strong>Visit the PCDC office</strong><small>Address and opening hours shown in the live service.</small></div></div><div class="info-note">${icon("shield")}<p>Volunteers will follow the site’s identity-check process before restoring access or changing contact details.</p></div>`;
  }
  if (u.modal === "staff") {
    title = "Volunteer workspace";
    body = `<p>Staff use an approved account in the live service. For this fictional walkthrough, you can enter Alex’s workspace.</p><div class="info-note">${icon("user")}<p>Prototype role switching does not represent client access permissions.</p></div>${button("Enter demo volunteer workspace", "enter-staff", "primary full")}`;
  }
  if (u.modal === "reset") {
    title = "Start a fresh walkthrough?";
    body = `<p>This clears the fictional case saved on this device, including answers, requests and sample responses.</p>${button("Reset everything", "confirm-reset", "primary full")}`;
  }
  if (u.modal === "exception") {
    title = "Explore a service limitation";
    body = `<p>This opens a separate sample draft with both Uber/Lyft income and other self-employment. Your main walkthrough will be preserved.</p>${button("Open exception draft", "confirm-exception", "primary full")}`;
  }
  if (u.modal === "print") {
    title = "Your application reference card";
    body = `<div class="print-card"><strong>PCDC · Community Tax Assistance</strong><span>APPLICATION ID</span><b>${esc(c.id)}</b><p>2025 tax year · A verification code is required to return.</p></div><p class="field-note">This card contains no tax answers or verification code.</p>${button(`${icon("print")} Print this card`, "print-now", "primary full")}`;
  }
  if (u.modal === "request") {
    title = "Make the next step clear.";
    body = `<p>Tell ${esc(c.answers.firstName)} what you need. This request will appear in the client’s application.</p><form id="request-form">${input("Document name", "requestTitle", u.requestTitle, "text", 'required maxlength="100"')}<label class="field"><span>Message to the client</span><textarea name="requestMessage" required rows="4" maxlength="600">${esc(u.requestMessage)}</textarea></label><div class="info-note">${icon("clock")}<p>The case will be put on hold, waiting for the client. No text or email is sent in this demo.</p></div><button type="submit" class="btn primary full">Send request ${icon("arrow")}</button></form>`;
  }
  if (u.modal === "upload") {
    title = "Add your mileage record";
    body = `<p>${esc(c.request?.message)}</p><div class="upload-zone ${u.sampleFile ? "has-file" : ""}">${icon(u.sampleFile ? "file" : "upload")}<strong>${u.sampleFile ? "demo-mileage-record-2025.pdf" : "Use a sample document"}</strong><span>${u.sampleFile ? "Fictional sample · no real upload" : "No real documents are selected or stored."}</span>${button(u.sampleFile ? "Remove sample" : "Use sample document", u.sampleFile ? "remove-sample" : "choose-sample", "secondary")}</div><label class="checkbox-row small"><input type="checkbox" id="upload-failure" ${u.failUpload ? "checked" : ""}><span>Simulate an upload failure</span></label>${u.error ? `<p class="error" role="alert">${esc(u.error)}</p>` : ""}${button(`Submit document ${icon("arrow")}`, "submit-document", "primary full", u.sampleFile ? "" : "disabled")}<p class="field-note">A volunteer will check the document before work resumes.</p>`;
  }
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="close-btn" data-action="close-modal" aria-label="Close dialog">${icon("close")}</button><span class="overline">PCDC · HERE TO HELP</span><h2 id="modal-title">${title}</h2>${body}</section></div>`;
}
