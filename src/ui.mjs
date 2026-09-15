export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  arrow: "m9 5 7 7-7 7M4 12h12",
  back: "m14 5-7 7 7 7M7 12h13",
  check: "m5 12 4 4L19 6",
  file: "M14 3H5v18h14V8l-5-5Zm0 0v6h5M8 13h8M8 17h5",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
  phone: "M7 3H4c-1 8 9 18 17 17v-4l-5-2-2 2-6-6 2-2-3-5Z",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  help: "M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  copy: "M8 8h12v13H8ZM4 16H2V2h13v3",
  upload: "M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6",
  user: "M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0M3 22v-3c0-7 18-7 18 0v3",
  home: "m2 11 10-9 10 9M5 9v13h14V9M10 22v-8h4v8",
  mail: "M2 4h20v16H2ZM2 5l10 8L22 5",
  close: "m5 5 14 14M5 19 19 5",
  refresh: "M3 10a9 9 0 1 1 1 8M3 3v7h7",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  lock: "M5 10h14v12H5ZM8 10V6a4 4 0 0 1 8 0v4M12 15v3",
  play: "m7 3 14 9-14 9V3Z",
  chevron: "m9 5 7 7-7 7",
  folder: "M2 6h8l2 3h10v12H2V6Zm0 0V3h8l2 3h8v3",
  print: "M6 8V2h12v6M6 17H2V8h20v9h-4M6 13h12v9H6Z",
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
export const button = (text, action, kind = "primary", extra = "") =>
  `<button type="button" class="btn ${kind}" data-action="${action}" ${extra}>${text}</button>`;
export const input = (label, name, value = "", type = "text", extra = "") =>
  `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
export const select = (label, name, value, options, extra = "") =>
  `<label class="field"><span>${label}</span><select name="${name}" ${extra}><option value="">Select an option</option>${options
    .map((o) => {
      const [val, txt] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(val)}" ${value === val ? "selected" : ""}>${esc(txt)}</option>`;
    })
    .join("")}</select></label>`;
export const radio = (
  label,
  name,
  value,
  options = [
    ["yes", "Yes"],
    ["no", "No"],
    ["unsure", "Not sure"],
  ],
) =>
  `<fieldset class="question"><legend>${label}</legend><div class="radio-row">${options.map(([val, text]) => `<label class="radio-card ${value === val ? "selected" : ""}"><input type="radio" name="${name}" value="${val}" ${value === val ? "checked" : ""} required><span>${text}</span></label>`).join("")}</div></fieldset>`;
export const statuses = {
  draft: ["Draft", "neutral"],
  received: ["Application received", "blue"],
  queued: ["Waiting for preparation", "blue"],
  preparing: ["In preparation", "blue"],
  held: ["Waiting for client", "amber"],
  responded: ["Awaiting verification", "teal"],
};
export const badge = (status) =>
  `<span class="badge ${statuses[status]?.[1] || "neutral"}"><i></i>${esc(statuses[status]?.[0] || status)}</span>`;
