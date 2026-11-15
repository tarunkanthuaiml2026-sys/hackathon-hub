const STORAGE_KEYS = {
  selectedHackathon: "hackathonHub.selectedHackathon",
  teams: "hackathonHub.teams",
  members: "hackathonHub.myTeams",
  activeTeam: "hackathonHub.activeTeam",
  claims: "hackathonHub.claims",
  legacyMeeting: "hackathonHub.meeting"
};

function readStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch (error) {
    console.error(`Unable to read ${key} from localStorage.`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Unable to save ${key} to localStorage.`, error);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function romanFirstYearEligible(value) {
  return /(?:^|[^A-Z])I(?:$|[^A-Z])/i.test(String(value || ""));
}

function parsePrize(value) {
  const amounts = [...String(value || "").matchAll(/[\d,.]+/g)]
    .map(([number]) => Number(number.replace(/,/g, "")))
    .filter(Number.isFinite);
  if (!amounts.length) return 0;
  const normalized = String(value).toLowerCase();
  const multiplier = normalized.includes("crore") ? 10000000
    : normalized.includes("lakh") ? 100000 : 1;
  return amounts[0] * multiplier;
}

function parseDeadline(value) {
  const text = String(value || "").trim();
  const numeric = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) return new Date(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1])).getTime();
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function normalizeHackathon(item) {
  const mode = String(item.mode || item.event_mode || "").trim();
  const location = String(item.location || "").trim();
  const teamSize = item.team_size ?? item.teamSize ?? "";
  const deadline = item.deadline ?? item.registration_deadline ?? "";
  const prize = item.prize ?? item.prize_amount ?? "";
  return {
    title: String(item.title || item.name || "").trim(),
    organizer: String(item.organizer || "").trim(),
    prize: String(prize).trim(),
    teamSize: String(teamSize).trim(),
    mode,
    location,
    eligible: String(item.eligible || item.eligibility || "").trim(),
    deadline: String(deadline).trim(),
    url: String(item.url || item.registration_url || "").trim()
  };
}

async function loadHackathons() {
  const response = await fetch("hackathons.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load hackathons.json (${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("hackathons.json must contain a JSON array");
  return data.map(normalizeHackathon).filter((event) => (
    event.title && event.organizer && romanFirstYearEligible(event.eligible)
  ));
}

function initializeDashboard() {
  const list = document.querySelector("#hackathon-list");
  if (!list) return;

  const filters = { location: "All", teamSize: "All", sort: "deadline" };
  const count = document.querySelector("#result-count");
  let hackathons = [];

  function renderHackathons() {
    let visible = hackathons.filter((item) => {
      const locationMatches = filters.location === "All"
        || (filters.location === "Online"
          ? /online/i.test(item.mode)
          : filters.location === "Offline"
            ? /offline/i.test(item.mode)
            : item.location.toLowerCase() === filters.location.toLowerCase());
      const size = Number.parseInt(item.teamSize, 10);
      const sizeMatches = filters.teamSize === "All"
        || (filters.teamSize === "Individual" ? /individual|solo/i.test(item.teamSize)
          : filters.teamSize === "1-3" ? size >= 1 && size <= 3
            : size >= 4);
      return locationMatches && sizeMatches;
    });

    visible = [...visible].sort((a, b) => filters.sort === "deadline"
      ? parseDeadline(a.deadline) - parseDeadline(b.deadline)
      : parsePrize(b.prize) - parsePrize(a.prize));
    count.textContent = `${visible.length} ${visible.length === 1 ? "event" : "events"}`;

    if (!visible.length) {
      list.innerHTML = '<div class="empty-state">No first-year-eligible hackathons match these filters.</div>';
      return;
    }

    list.innerHTML = visible.map((item, index) => {
      const locationText = item.location ? ` · ${escapeHtml(item.location)}` : "";
      const size = Number.parseInt(item.teamSize, 10);
      const sizeText = /individual|solo/i.test(item.teamSize)
        ? "Individual"
        : size ? `${escapeHtml(item.teamSize)} people` : escapeHtml(item.teamSize || "Not specified");
      const eligibleTags = item.eligible.split(/[,;|]/).map((year) => year.trim()).filter(Boolean)
        .map((year) => `<span class="eligible-badge">${escapeHtml(year)}</span>`).join("");
      const registerButton = /^https?:\/\//i.test(item.url)
        ? `<a class="register-button" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Register <span>↗</span></a>`
        : "";
      return `
        <article class="hackathon-card">
          <div class="hackathon-title">
            <span class="event-mark" aria-hidden="true">✳</span>
            <div>
              <div class="event-name">${escapeHtml(item.title)}</div>
              <div class="event-organizer">${escapeHtml(item.organizer)}</div>
              <div class="eligible-badges">${eligibleTags}</div>
            </div>
          </div>
          <div class="data-cell mode-cell"><span class="cell-label">MODE</span><span class="mode-pin" aria-hidden="true"></span>${escapeHtml(item.mode || "Not specified")}${locationText}</div>
          <div class="data-cell size-cell"><span class="cell-label">TEAM</span>${sizeText}</div>
          <div class="data-cell prize-cell"><span class="cell-label">PRIZE</span>${escapeHtml(item.prize || "Not specified")}</div>
          <div class="data-cell eligible-cell"><span class="cell-label">ELIGIBLE</span>${eligibleTags}</div>
          <div class="data-cell deadline-cell"><span class="cell-label">DEADLINE</span>${escapeHtml(item.deadline || "Not specified")}</div>
          <div class="hackathon-actions">
            ${registerButton}
            <button class="start-team-button" type="button" data-hackathon-index="${index}">Start Team <span>→</span></button>
          </div>
        </article>`;
    }).join("");

    list.querySelectorAll(".start-team-button").forEach((button) => {
      button.addEventListener("click", () => {
        writeStorage(STORAGE_KEYS.selectedHackathon, visible[Number(button.dataset.hackathonIndex)].title);
        window.location.href = "teams.html";
      });
    });
  }

  document.querySelectorAll(".filter-group").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest(".filter-chip");
      if (!button) return;
      group.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("selected", chip === button));
      filters[group.dataset.filter] = button.dataset.value;
      renderHackathons();
    });
  });

  loadHackathons().then((items) => {
    hackathons = items;
    renderHackathons();
  }).catch((error) => {
    console.error("Unable to load first-year hackathons.", error);
    list.innerHTML = '<div class="empty-state">Hackathons could not be loaded. Please reload the page and try again.</div>';
    count.textContent = "";
  });
}

const DEFAULT_TEAMS = [
  {
    id: "workspace-ssetc",
    name: "SSETC Hackathon 2026",
    hackathon: "SSETC Healthcare 2026",
    roles: [],
    access: "open",
    code: "",
    spots: 0,
    roster: ["Rahul", "Sanjay", "Aditi"],
    meeting: { time: "Tomorrow, 7:00 PM", link: "https://meet.google.com/" },
    tasks: [
      { title: "Chatbot", person: "Rahul", deadline: "Nov 20", done: false },
      { title: "Frontend", person: "Sanjay", deadline: "Nov 22", done: false }
    ]
  },
  {
    id: "team-1",
    name: "The Data Dreamers",
    hackathon: "India AI Buildathon",
    roles: ["AIML", "Frontend"],
    access: "open",
    code: "",
    spots: 2,
    roster: ["Maya"],
    meeting: { time: "Not scheduled", link: "https://meet.google.com/" },
    tasks: []
  },
  {
    id: "team-2",
    name: "Green Machine",
    hackathon: "Green Future Hackfest",
    roles: ["UI/UX", "Backend"],
    access: "open",
    code: "",
    spots: 1,
    roster: ["Dev", "Priya"],
    meeting: { time: "Not scheduled", link: "https://meet.google.com/" },
    tasks: []
  },
  {
    id: "team-3",
    name: "Civic Spark",
    hackathon: "Smart City Hack",
    roles: ["Frontend", "Data"],
    access: "open",
    code: "",
    spots: 2,
    roster: ["Arjun"],
    meeting: { time: "Not scheduled", link: "https://meet.google.com/" },
    tasks: []
  }
];

function normalizeTeam(team) {
  return {
    ...team,
    access: team.access === "code" || team.access === "code-only" ? "code" : "open",
    code: String(team.code || ""),
    roles: Array.isArray(team.roles) ? team.roles : [],
    spots: Number.isFinite(Number(team.spots)) ? Number(team.spots) : 1,
    roster: Array.isArray(team.roster) ? team.roster : [],
    meeting: team.meeting && typeof team.meeting === "object"
      ? { time: team.meeting.time || "Not scheduled", link: team.meeting.link || "https://meet.google.com/" }
      : { time: "Not scheduled", link: "https://meet.google.com/" },
    tasks: Array.isArray(team.tasks) ? team.tasks : []
  };
}

function initializeTeams() {
  const teamList = document.querySelector("#open-team-list");
  if (!teamList) return;

  const legacyTeams = readStorage(STORAGE_KEYS.teams, []);
  const claims = readStorage(STORAGE_KEYS.claims, {});
  const savedMemberships = readStorage(STORAGE_KEYS.members, null);
  const memberships = new Set(Array.isArray(savedMemberships)
    ? savedMemberships
    : ["workspace-ssetc", ...legacyTeams.map((team) => team.id)]);
  const savedTeams = new Map(legacyTeams.map((team) => [team.id, normalizeTeam(team)]));
  DEFAULT_TEAMS.forEach((seed) => {
    if (!savedTeams.has(seed.id)) savedTeams.set(seed.id, normalizeTeam(seed));
  });

  for (const team of savedTeams.values()) {
    if (claims[team.id]) memberships.add(team.id);
    if (team.id === "workspace-ssetc") {
      const oldMeeting = readStorage(STORAGE_KEYS.legacyMeeting, null);
      if (oldMeeting) team.meeting = { ...team.meeting, ...oldMeeting };
    }
  }

  let teams = [...savedTeams.values()];
  let activeTeamId = readStorage(STORAGE_KEYS.activeTeam, "workspace-ssetc");
  let selectedHackathon = readStorage(STORAGE_KEYS.selectedHackathon, "");
  let activeTeam = null;
  const switcher = document.querySelector("#my-team-switcher");
  const workspace = document.querySelector("#team-workspace");
  const modal = document.querySelector("#team-modal");
  const createForm = document.querySelector("#create-team-form");
  const hackathonInput = document.querySelector("#hackathon-name");
  const codeInput = document.querySelector("#team-join-code");
  const codeField = document.querySelector("#join-code-field");
  const accessRadios = document.querySelectorAll('input[name="access"]');
  const taskForm = document.querySelector("#add-team-task-form");
  const codeForm = document.querySelector("#join-code-form");
  const joinCodeInput = codeForm.elements.joinCode;

  function persistTeams() {
    writeStorage(STORAGE_KEYS.teams, teams);
    writeStorage(STORAGE_KEYS.members, [...memberships]);
  }

  function renderSwitcher() {
    const myTeams = teams.filter((team) => memberships.has(team.id));
    if (!myTeams.length) {
      switcher.innerHTML = '<span class="my-teams-empty">Create a team or join an open team to get started.</span>';
      workspace.hidden = true;
      return;
    }
    if (!myTeams.some((team) => team.id === activeTeamId)) activeTeamId = myTeams[0].id;
    switcher.innerHTML = myTeams.map((team) => `
      <button class="my-team-tab${team.id === activeTeamId ? " active" : ""}" type="button"
        role="tab" aria-selected="${team.id === activeTeamId}" data-team-tab="${escapeHtml(team.id)}">
        <span>${escapeHtml(team.name)}</span><small>${escapeHtml(team.hackathon)}</small>
      </button>`).join("");
    switcher.querySelectorAll("[data-team-tab]").forEach((button) => {
      button.addEventListener("click", () => activateTeam(button.dataset.teamTab));
    });
  }

  function renderOpenTeams() {
    const openTeams = teams.filter((team) => team.access === "open" && team.id !== "workspace-ssetc");
    if (!openTeams.length) {
      teamList.innerHTML = '<div class="empty-state">No open teams yet. Create one or join with a code.</div>';
      return;
    }
    teamList.innerHTML = openTeams.map((team) => {
      const joined = memberships.has(team.id);
      const roles = team.roles.map((role) => `<span class="role-tag">Need: ${escapeHtml(role)}</span>`).join("");
      const full = !joined && team.spots <= 0;
      return `
        <article class="open-team-card">
          <div class="open-team-top">
            <span class="team-card-mark" aria-hidden="true">${escapeHtml(team.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase())}</span>
            <span class="team-access">Open</span>
          </div>
          <h3>${escapeHtml(team.name)}</h3>
          <div class="team-hackathon">${escapeHtml(team.hackathon)}</div>
          <div class="team-role-tags">${roles || '<span class="role-tag">Open roles</span>'}</div>
          <div class="open-team-bottom">
            <span class="spots-left"><strong>${team.spots} spots</strong> left</span>
            <button class="claim-button${joined ? " claimed" : ""}" type="button" data-join-team="${escapeHtml(team.id)}"
              ${joined || full ? "disabled" : ""}>${joined ? "✓ Joined" : full ? "Team full" : "Join"}</button>
          </div>
        </article>`;
    }).join("");
    teamList.querySelectorAll("[data-join-team]").forEach((button) => {
      button.addEventListener("click", () => joinTeam(button.dataset.joinTeam));
    });
  }

  function renderWorkspace() {
    if (!activeTeam) return;
    document.querySelector("#workspace-title").textContent = activeTeam.name;
    document.querySelector("#workspace-overline").textContent = activeTeam.hackathon || "HACKATHON TEAM";
    document.querySelector("#workspace-monogram").textContent = activeTeam.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
    document.querySelector("#team-visibility-badge").textContent = activeTeam.access === "code" ? "Code Only" : "Open";
    document.querySelector("#team-visibility-badge").classList.toggle("code", activeTeam.access === "code");
    const codeDisplay = document.querySelector("#workspace-team-code");
    codeDisplay.hidden = activeTeam.access !== "code";
    codeDisplay.textContent = activeTeam.access === "code" ? `JOIN CODE · ${activeTeam.code}` : "";
    document.querySelector("#meet-time").textContent = activeTeam.meeting.time;
    const joinMeet = document.querySelector("#join-meet");
    joinMeet.href = activeTeam.meeting.link;
    joinMeet.removeAttribute("aria-disabled");

    const roster = document.querySelector("#squad-roster");
    roster.innerHTML = activeTeam.roster.map((person, index) => `
      <span class="roster-person"><i>${escapeHtml(String(person).trim().charAt(0).toUpperCase() || "?")}</i>${escapeHtml(person)}${index === 0 && person === "You" ? '<small>YOU</small>' : ""}</span>
    `).join("") || '<span class="roster-empty">No members yet.</span>';
    document.querySelector("#roster-count").textContent = `${activeTeam.roster.length} ${activeTeam.roster.length === 1 ? "member" : "members"}`;

    const doneCount = activeTeam.tasks.filter((task) => task.done).length;
    document.querySelector("#task-progress").textContent = `${doneCount}/${activeTeam.tasks.length} done`;
    const taskList = document.querySelector("#team-task-list");
    taskList.innerHTML = activeTeam.tasks.map((task, index) => `
      <label class="task-row${task.done ? " done" : ""}">
        <span class="task-title">${escapeHtml(task.title)}</span>
        <span class="task-owner">${escapeHtml(task.person)}</span>
        <span class="task-deadline">${escapeHtml(task.deadline)}</span>
        <input class="task-checkbox" type="checkbox" aria-label="Mark ${escapeHtml(task.title)} done" data-task-index="${index}" ${task.done ? "checked" : ""}>
      </label>`).join("") || '<div class="task-empty">No tasks yet. Add the first one below.</div>';
    taskList.querySelectorAll(".task-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        activeTeam.tasks[Number(checkbox.dataset.taskIndex)].done = checkbox.checked;
        persistTeams();
        renderWorkspace();
      });
    });
  }

  function activateTeam(teamId) {
    if (!memberships.has(teamId)) return;
    activeTeamId = teamId;
    activeTeam = teams.find((team) => team.id === teamId) || null;
    writeStorage(STORAGE_KEYS.activeTeam, teamId);
    renderSwitcher();
    renderWorkspace();
  }

  function joinTeam(teamId) {
    const team = teams.find((item) => item.id === teamId);
    if (!team || memberships.has(team.id) || team.spots <= 0) return;
    memberships.add(team.id);
    team.spots = Math.max(0, team.spots - 1);
    team.roster.push("You");
    persistTeams();
    renderOpenTeams();
    activateTeam(team.id);
  }

  renderSwitcher();
  if (memberships.has(activeTeamId)) {
    activeTeam = teams.find((team) => team.id === activeTeamId) || null;
  }
  if (!activeTeam) {
    activeTeamId = teams.find((team) => memberships.has(team.id))?.id || "";
    activeTeam = teams.find((team) => team.id === activeTeamId) || null;
  }
  renderWorkspace();
  renderOpenTeams();
  persistTeams();

  const openButton = document.querySelector("#open-team-form");
  function closeModal() {
    modal.hidden = true;
    openButton.focus();
  }
  openButton.addEventListener("click", () => {
    modal.hidden = false;
    document.querySelector("#team-name").focus();
  });
  document.querySelector("#close-team-form").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  function updateJoinCodeField() {
    const codeOnly = createForm.querySelector('input[name="access"]:checked').value === "code";
    codeField.hidden = !codeOnly;
    codeInput.required = codeOnly;
  }
  accessRadios.forEach((radio) => radio.addEventListener("change", updateJoinCodeField));
  updateJoinCodeField();

  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(createForm);
    const access = String(formData.get("access"));
    const code = String(formData.get("joinCode") || "").trim().toUpperCase();
    if (access === "code" && teams.some((team) => team.access === "code" && team.code.toUpperCase() === code)) {
      codeInput.setCustomValidity("That join code is already in use.");
      codeInput.reportValidity();
      return;
    }
    codeInput.setCustomValidity("");
    const roles = String(formData.get("roles")).split(",").map((role) => role.trim()).filter(Boolean);
    const newTeam = normalizeTeam({
      id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(formData.get("teamName")).trim(),
      hackathon: String(formData.get("hackathonName")).trim(),
      roles,
      access,
      code: access === "code" ? code : "",
      spots: roles.length || 1,
      roster: ["You"],
      meeting: { time: "Not scheduled", link: "https://meet.google.com/" },
      tasks: []
    });
    teams.unshift(newTeam);
    memberships.add(newTeam.id);
    persistTeams();
    createForm.reset();
    if (selectedHackathon) hackathonInput.value = selectedHackathon;
    updateJoinCodeField();
    closeModal();
    renderOpenTeams();
    activateTeam(newTeam.id);
  });

  codeInput.addEventListener("input", () => codeInput.setCustomValidity(""));
  joinCodeInput.addEventListener("input", () => joinCodeInput.setCustomValidity(""));
  codeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = joinCodeInput;
    const code = input.value.trim().toUpperCase();
    const match = teams.find((team) => team.access === "code" && team.code.toUpperCase() === code);
    if (!match) {
      input.setCustomValidity("No team found for that join code.");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    codeForm.reset();
    if (!memberships.has(match.id)) {
      memberships.add(match.id);
      match.roster.push("You");
      persistTeams();
    }
    activateTeam(match.id);
  });

  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!activeTeam) return;
    const formData = new FormData(taskForm);
    const title = String(formData.get("task")).trim();
    const person = String(formData.get("person")).trim();
    const deadline = String(formData.get("deadline")).trim();
    if (!title || !person || !deadline) return;
    activeTeam.tasks.push({ title, person, deadline, done: false });
    persistTeams();
    taskForm.reset();
    renderWorkspace();
  });

  document.querySelector("#edit-meet").addEventListener("click", () => {
    if (!activeTeam) return;
    const time = window.prompt("When is the next team meet?", activeTeam.meeting.time);
    if (time === null) return;
    const link = window.prompt("Paste the meeting link", activeTeam.meeting.link);
    if (link === null) return;
    if (!/^https:\/\//i.test(link.trim())) {
      window.alert("Please enter a valid meeting link starting with https://.");
      return;
    }
    activeTeam.meeting = { time: time.trim() || activeTeam.meeting.time, link: link.trim() };
    persistTeams();
    renderWorkspace();
  });

  if (selectedHackathon) {
    hackathonInput.value = selectedHackathon;
    writeStorage(STORAGE_KEYS.selectedHackathon, "");
    selectedHackathon = "";
  }
}

if (document.body.dataset.page === "dashboard") initializeDashboard();
if (document.body.dataset.page === "teams") initializeTeams();
