const STORAGE_KEYS = {
  selectedHackathon: "hackathonHub.selectedHackathon",
  teams: "hackathonHub.teams",
  members: "hackathonHub.myTeams",
  activeTeam: "activeTeamId",
  legacyActiveTeam: "hackathonHub.activeTeam",
  claims: "hackathonHub.claims",
  legacyMeeting: "hackathonHub.meeting",
  legacyProjects: "hackathonHub.projects"
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

function validateTrimmedFields(form, fields) {
  for (const [name, label] of fields) {
    const input = form.elements.namedItem(name);
    input.setCustomValidity(String(input.value).trim() ? "" : `Please enter ${label}.`);
  }
  return form.reportValidity();
}

function clearCustomValidityOnInput(form, names) {
  for (const name of names) {
    form.elements.namedItem(name).addEventListener("input", (event) => {
      event.currentTarget.setCustomValidity("");
    });
  }
}

function saveActiveTeamId(teamId) {
  if (teamId) {
    writeStorage(STORAGE_KEYS.activeTeam, teamId);
    writeStorage(STORAGE_KEYS.legacyActiveTeam, teamId);
  } else {
    localStorage.removeItem(STORAGE_KEYS.activeTeam);
    localStorage.removeItem(STORAGE_KEYS.legacyActiveTeam);
  }
}

function createTeamRecord({
  name,
  hackathon,
  access = "open",
  code = "",
  roles = [],
  creatorName = "You",
  roster = [creatorName]
}) {
  return {
    id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    hackathon,
    creatorName,
    roles,
    access,
    code,
    spots: roles.length || 1,
    roster,
    meeting: null,
    tasks: []
  };
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
  const teamModal = document.querySelector("#start-team-modal");
  const teamForm = document.querySelector("#start-team-form");
  const teamNameInput = document.querySelector("#start-team-name");
  const creatorNameInput = document.querySelector("#start-team-creator");
  const teamCodeInput = document.querySelector("#start-team-code");
  const teamCodeField = document.querySelector("#start-team-code-field");
  const selectedHackathonLabel = document.querySelector("#start-team-hackathon");
  clearCustomValidityOnInput(teamForm, ["teamName", "creatorName", "joinCode"]);
  let hackathons = [];
  let selectedHackathon = null;

  function updateStartTeamCodeField() {
    const codeOnly = teamForm.querySelector('input[name="startAccess"]:checked').value === "code";
    teamCodeField.hidden = !codeOnly;
    teamCodeInput.required = codeOnly;
    if (!codeOnly) teamCodeInput.setCustomValidity("");
  }

  function closeStartTeamModal() {
    teamModal.hidden = true;
    selectedHackathon = null;
  }

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
        selectedHackathon = visible[Number(button.dataset.hackathonIndex)];
        selectedHackathonLabel.textContent = selectedHackathon.title;
        teamNameInput.value = "";
        creatorNameInput.value = "";
        teamCodeInput.value = "";
        teamForm.querySelector('input[name="startAccess"][value="open"]').checked = true;
        updateStartTeamCodeField();
        teamModal.hidden = false;
        teamNameInput.focus();
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

  teamForm.querySelectorAll('input[name="startAccess"]').forEach((radio) => {
    radio.addEventListener("change", updateStartTeamCodeField);
  });
  updateStartTeamCodeField();
  document.querySelector("#close-start-team-modal").addEventListener("click", closeStartTeamModal);
  teamModal.addEventListener("click", (event) => {
    if (event.target === teamModal) closeStartTeamModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !teamModal.hidden) closeStartTeamModal();
  });
  teamForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selectedHackathon) return;
    const formData = new FormData(teamForm);
    const access = String(formData.get("startAccess"));
    const code = String(formData.get("joinCode") || "").trim().toUpperCase();
    const fields = [["teamName", "a team name"], ["creatorName", "your name"]];
    if (access === "code") fields.push(["joinCode", "a join code"]);
    if (!validateTrimmedFields(teamForm, fields)) return;
    const teams = readStorage(STORAGE_KEYS.teams, []);
    if (access === "code" && teams.some((team) => team.access === "code" && String(team.code || "").toUpperCase() === code)) {
      teamCodeInput.setCustomValidity("That join code is already in use.");
      teamCodeInput.reportValidity();
      return;
    }
    teamCodeInput.setCustomValidity("");
    const team = createTeamRecord({
      name: String(formData.get("teamName")).trim(),
      creatorName: String(formData.get("creatorName")).trim(),
      hackathon: selectedHackathon.title,
      access,
      code: access === "code" ? code : "",
      roster: [String(formData.get("creatorName")).trim()]
    });
    const members = new Set(readStorage(STORAGE_KEYS.members, []));
    teams.unshift(team);
    members.add(team.id);
    writeStorage(STORAGE_KEYS.teams, teams);
    writeStorage(STORAGE_KEYS.members, [...members]);
    saveActiveTeamId(team.id);
    window.location.href = "teams.html";
  });
  teamCodeInput.addEventListener("input", () => teamCodeInput.setCustomValidity(""));

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
    id: "team-1",
    name: "The Data Dreamers",
    hackathon: "India AI Buildathon",
    roles: ["AIML", "Frontend"],
    access: "open",
    code: "",
    spots: 2,
    roster: ["Maya"],
    meeting: null,
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
    meeting: null,
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
    meeting: null,
    tasks: []
  }
];

function normalizeTeam(team) {
  return {
    ...team,
    id: String(team.id || ""),
    name: String(team.name || ""),
    hackathon: String(team.hackathon || ""),
    access: team.access === "code" || team.access === "code-only" ? "code" : "open",
    code: String(team.code || ""),
    roles: Array.isArray(team.roles) ? team.roles : [],
    spots: Number.isFinite(Number(team.spots)) ? Number(team.spots) : 1,
    roster: Array.isArray(team.roster) ? [...new Set(team.roster.map(String))] : [],
    meeting: team.meeting && typeof team.meeting === "object"
      ? {
        topic: String(team.meeting.topic || ""),
        dateTime: String(team.meeting.dateTime || ""),
        legacyTime: String(team.meeting.time || ""),
        link: String(team.meeting.link || "")
      }
      : null,
    tasks: Array.isArray(team.tasks) ? team.tasks : []
  };
}

function initializeTeams() {
  const teamList = document.querySelector("#open-team-list");
  if (!teamList) return;

  const legacyTeams = readStorage(STORAGE_KEYS.teams, []);
  const claims = readStorage(STORAGE_KEYS.claims, {});
  const savedMemberships = readStorage(STORAGE_KEYS.members, null);
  const memberships = new Set(Array.isArray(savedMemberships) ? savedMemberships : []);
  const defaultTeamIds = new Set(DEFAULT_TEAMS.map((team) => team.id));
  const savedTeams = new Map(
    (Array.isArray(legacyTeams) ? legacyTeams : [])
      .filter((team) => team.id !== "workspace-ssetc")
      .map((team) => [team.id, normalizeTeam(team)])
  );
  DEFAULT_TEAMS.forEach((seed) => {
    if (!savedTeams.has(seed.id)) savedTeams.set(seed.id, normalizeTeam(seed));
  });
  if (!Array.isArray(savedMemberships)) {
    for (const team of savedTeams.values()) {
      if (!defaultTeamIds.has(team.id)) memberships.add(team.id);
    }
  }

  for (const teamId of Object.keys(claims)) {
    if (claims[teamId] && savedTeams.has(teamId)) memberships.add(teamId);
  }
  memberships.delete("workspace-ssetc");

  let teams = [...savedTeams.values()];
  const switcher = document.querySelector("#my-team-switcher");
  const workspace = document.querySelector("#team-workspace");
  const visibilityBadge = document.querySelector("#team-visibility-badge");
  const modal = document.querySelector("#team-modal");
  const createForm = document.querySelector("#create-team-form");
  const hackathonInput = document.querySelector("#hackathon-name");
  const codeInput = document.querySelector("#team-join-code");
  const codeField = document.querySelector("#join-code-field");
  const accessRadios = document.querySelectorAll('input[name="access"]');
  const codeForm = document.querySelector("#join-code-form");
  const joinCodeInput = codeForm.elements.joinCode;
  const template = document.querySelector("#team-workspace-template");
  const selectedHackathon = readStorage(STORAGE_KEYS.selectedHackathon, "");
  clearCustomValidityOnInput(createForm, ["teamName", "hackathonName", "creatorName", "roles", "joinCode"]);

  function persistTeams() {
    teams = [...new Map(teams.map((team) => [team.id, normalizeTeam(team)])).values()];
    writeStorage(STORAGE_KEYS.teams, teams);
    writeStorage(STORAGE_KEYS.members, [...memberships]);
  }

  function getActiveTeamId() {
    return readStorage(
      STORAGE_KEYS.activeTeam,
      readStorage(STORAGE_KEYS.legacyActiveTeam, "")
    );
  }

  function getActiveTeam() {
    const activeTeamId = getActiveTeamId();
    return readStorage(STORAGE_KEYS.teams, [])
      .map(normalizeTeam)
      .find((team) => team.id === activeTeamId && memberships.has(team.id)) || null;
  }

  function saveTeam(teamId, update) {
    if (!teamId || teamId !== getActiveTeamId()) return null;
    const storedTeams = readStorage(STORAGE_KEYS.teams, []);
    const index = storedTeams.findIndex((team) => team.id === teamId);
    if (index === -1) return null;
    storedTeams[index] = normalizeTeam(update(normalizeTeam(storedTeams[index])));
    writeStorage(STORAGE_KEYS.teams, storedTeams);
    teams = storedTeams.map(normalizeTeam);
    return storedTeams[index];
  }

  function renderSwitcher() {
    const myTeams = teams.filter((team) => memberships.has(team.id));
    if (!myTeams.length) {
      switcher.innerHTML = '<span class="my-teams-empty">No teams yet — create or join one above!</span>';
      saveActiveTeamId("");
      renderWorkspace();
      return;
    }
    if (!myTeams.some((team) => team.id === getActiveTeamId())) {
      saveActiveTeamId(myTeams[0].id);
    }
    const activeTeamId = getActiveTeamId();
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
    const openTeams = teams.filter((team) => team.access === "open");
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
    const activeTeamId = getActiveTeamId();
    const activeTeam = getActiveTeam();
    visibilityBadge.replaceChildren();
    visibilityBadge.classList.remove("code");
    if (!activeTeam || !memberships.has(activeTeamId)) {
      workspace.innerHTML = '<p class="workspace-empty">No teams yet — create or join one above!</p>';
      return;
    }

    workspace.replaceChildren(template.content.cloneNode(true));
    visibilityBadge.textContent = activeTeam.access === "code" ? "Code Only" : "Open";
    visibilityBadge.classList.toggle("code", activeTeam.access === "code");
    workspace.querySelector('[data-workspace="name"]').textContent = activeTeam.name;
    workspace.querySelector('[data-workspace="hackathon"]').textContent = activeTeam.hackathon;
    workspace.querySelector('[data-workspace="monogram"]').textContent = activeTeam.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
    const codeDisplay = workspace.querySelector('[data-workspace="code"]');
    codeDisplay.hidden = activeTeam.access !== "code";
    codeDisplay.textContent = activeTeam.access === "code" ? `JOIN CODE · ${activeTeam.code}` : "";
    const meeting = activeTeam.meeting;
    const meetingDate = meeting?.dateTime ? new Date(meeting.dateTime) : null;
    const meetingTime = meetingDate && !Number.isNaN(meetingDate.getTime())
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(meetingDate)
      : meeting?.legacyTime || "No meeting scheduled";
    workspace.querySelector('[data-workspace="meet-time"]').textContent = meetingTime;
    workspace.querySelector('[data-workspace="meet-topic"]').textContent = meeting?.topic || "";
    const joinMeet = workspace.querySelector('[data-workspace="meet-link"]');
    const validMeetLink = /^https:\/\//i.test(meeting?.link || "");
    joinMeet.hidden = !validMeetLink;
    if (validMeetLink) {
      joinMeet.href = meeting.link;
      joinMeet.removeAttribute("aria-disabled");
    } else {
      joinMeet.removeAttribute("href");
      joinMeet.setAttribute("aria-disabled", "true");
    }
    const meetForm = workspace.querySelector('[data-action="save-meet"]');
    clearCustomValidityOnInput(meetForm, ["topic", "link"]);
    meetForm.elements.topic.value = meeting?.topic || "";
    meetForm.elements.dateTime.value = meeting?.dateTime || "";
    meetForm.elements.link.value = meeting?.link || "";
    meetForm.querySelector('[data-action="clear-meet"]').hidden = !meeting;

    const roster = workspace.querySelector('[data-workspace="roster"]');
    roster.innerHTML = activeTeam.roster.map((person) => `
      <span class="roster-person"><i>${escapeHtml(String(person).trim().charAt(0).toUpperCase() || "?")}</i>${escapeHtml(person)}</span>
    `).join("") || '<span class="roster-empty">No members yet.</span>';
    workspace.querySelector('[data-workspace="roster-count"]').textContent = `${activeTeam.roster.length} ${activeTeam.roster.length === 1 ? "member" : "members"}`;

    const doneCount = activeTeam.tasks.filter((task) => task.done).length;
    workspace.querySelector('[data-workspace="task-progress"]').textContent = `${doneCount}/${activeTeam.tasks.length} done`;
    const taskList = workspace.querySelector('[data-workspace="tasks"]');
    taskList.innerHTML = activeTeam.tasks.map((task, index) => `
      <div class="task-row${task.done ? " done" : ""}">
        <span class="task-title">${escapeHtml(task.title)}</span>
        <span class="task-owner">${escapeHtml(task.person)}</span>
        <span class="task-deadline">${escapeHtml(task.deadline)}</span>
        <input class="task-checkbox" type="checkbox" aria-label="Mark ${escapeHtml(task.title)} done" data-task-index="${index}" data-team-id="${escapeHtml(activeTeam.id)}" ${task.done ? "checked" : ""}>
        <button class="task-delete-button" type="button" aria-label="Delete ${escapeHtml(task.title)}" data-delete-task="${index}" data-team-id="${escapeHtml(activeTeam.id)}">×</button>
      </div>`).join("") || '<div class="task-empty">No tasks yet. Add the first one below.</div>';
    taskList.querySelectorAll(".task-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        if (checkbox.dataset.teamId !== getActiveTeamId()) return;
        const teamId = checkbox.dataset.teamId;
        saveTeam(teamId, (team) => {
          const task = team.tasks[Number(checkbox.dataset.taskIndex)];
          if (task) task.done = checkbox.checked;
          return team;
        });
        renderWorkspace();
      });
    });

    workspace.querySelector('[data-action="add-task"]').addEventListener("submit", (event) => {
      event.preventDefault();
      const teamId = activeTeam.id;
      if (teamId !== getActiveTeamId()) return;
      const formData = new FormData(event.currentTarget);
      const title = String(formData.get("task")).trim();
      const person = String(formData.get("person")).trim();
      const deadline = String(formData.get("deadline")).trim();
      if (!validateTrimmedFields(event.currentTarget, [
        ["task", "a task"], ["person", "a task owner"], ["deadline", "a task deadline"]
      ])) return;
      saveTeam(teamId, (team) => {
        team.tasks.push({ title, person, deadline, done: false });
        return team;
      });
      clearCustomValidityOnInput(workspace.querySelector('[data-action="add-task"]'), ["task", "person", "deadline"]);
      renderWorkspace();
    });

    meetForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const teamId = activeTeam.id;
      if (teamId !== getActiveTeamId()) return;
      const formData = new FormData(meetForm);
      const topic = String(formData.get("topic")).trim();
      const dateTime = String(formData.get("dateTime"));
      const link = String(formData.get("link")).trim();
      if (!validateTrimmedFields(meetForm, [["topic", "a meeting topic"]])) return;
      if (!/^https:\/\//i.test(link)) {
        meetForm.elements.link.setCustomValidity("Enter a valid meeting link starting with https://.");
        meetForm.elements.link.reportValidity();
        return;
      }
      meetForm.elements.link.setCustomValidity("");
      saveTeam(teamId, (team) => {
        team.meeting = { topic, dateTime, link };
        return team;
      });
      renderWorkspace();
    });

    meetForm.querySelector('[data-action="clear-meet"]').addEventListener("click", () => {
      const teamId = activeTeam.id;
      if (teamId !== getActiveTeamId()) return;
      saveTeam(teamId, (team) => {
        team.meeting = null;
        return team;
      });
      renderWorkspace();
    });

    const addMemberForm = workspace.querySelector('[data-action="add-member"]');
    clearCustomValidityOnInput(addMemberForm, ["member"]);
    addMemberForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const teamId = activeTeam.id;
      if (teamId !== getActiveTeamId()) return;
      const name = String(new FormData(event.currentTarget).get("member")).trim();
      if (!validateTrimmedFields(event.currentTarget, [["member", "a teammate name"]])) return;
      saveTeam(teamId, (team) => {
        if (!team.roster.some((person) => person.toLowerCase() === name.toLowerCase())) {
          team.roster.push(name);
        }
        return team;
      });
      renderWorkspace();
    });

    taskList.querySelectorAll("[data-delete-task]").forEach((button) => {
      button.addEventListener("click", () => {
        const teamId = button.dataset.teamId;
        if (teamId !== getActiveTeamId()) return;
        const taskIndex = Number(button.dataset.deleteTask);
        saveTeam(teamId, (team) => {
          team.tasks.splice(taskIndex, 1);
          return team;
        });
        renderWorkspace();
      });
    });
  }

  function activateTeam(teamId) {
    if (!memberships.has(teamId) || !teams.some((team) => team.id === teamId)) return;
    saveActiveTeamId(teamId);
    renderSwitcher();
    renderWorkspace();
  }

  function joinTeam(teamId) {
    const team = teams.find((item) => item.id === teamId);
    if (!team || memberships.has(team.id) || team.spots <= 0) return;
    memberships.add(team.id);
    saveActiveTeamId(team.id);
    saveTeam(team.id, (storedTeam) => {
      storedTeam.spots = Math.max(0, storedTeam.spots - 1);
      if (!storedTeam.roster.includes("You")) storedTeam.roster.push("You");
      return storedTeam;
    });
    persistTeams();
    renderOpenTeams();
    activateTeam(team.id);
  }

  persistTeams();
  const storedActiveTeamId = readStorage(
    STORAGE_KEYS.activeTeam,
    readStorage(STORAGE_KEYS.legacyActiveTeam, "")
  );
  const firstMemberTeam = teams.find((team) => memberships.has(team.id));
  saveActiveTeamId(memberships.has(storedActiveTeamId) ? storedActiveTeamId : firstMemberTeam?.id || "");
  renderSwitcher();
  renderWorkspace();
  renderOpenTeams();

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
    if (!codeOnly) codeInput.setCustomValidity("");
  }
  accessRadios.forEach((radio) => radio.addEventListener("change", updateJoinCodeField));
  updateJoinCodeField();

  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(createForm);
    const access = String(formData.get("access"));
    const code = String(formData.get("joinCode") || "").trim().toUpperCase();
    const fields = [
      ["teamName", "a team name"],
      ["hackathonName", "a hackathon name"],
      ["creatorName", "your name"],
      ["roles", "at least one role"]
    ];
    if (access === "code") fields.push(["joinCode", "a join code"]);
    if (!validateTrimmedFields(createForm, fields)) return;
    if (access === "code" && teams.some((team) => team.access === "code" && String(team.code || "").toUpperCase() === code)) {
      codeInput.setCustomValidity("That join code is already in use.");
      codeInput.reportValidity();
      return;
    }
    codeInput.setCustomValidity("");
    const roles = String(formData.get("roles")).split(",").map((role) => role.trim()).filter(Boolean);
    const newTeam = normalizeTeam(createTeamRecord({
      name: String(formData.get("teamName")).trim(),
      hackathon: String(formData.get("hackathonName")).trim(),
      roles,
      access,
      code: access === "code" ? code : "",
      creatorName: String(formData.get("creatorName")).trim(),
      roster: [String(formData.get("creatorName")).trim()]
    }));
    teams.unshift(newTeam);
    memberships.add(newTeam.id);
    persistTeams();
    saveActiveTeamId(newTeam.id);
    createForm.reset();
    createForm.querySelectorAll("input").forEach((input) => input.setCustomValidity(""));
    codeInput.setCustomValidity("");
    hackathonInput.value = "";
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
    const match = teams.find((team) => team.access === "code" && String(team.code || "").toUpperCase() === code);
    if (!match) {
      input.setCustomValidity("No team found for that join code.");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    codeForm.reset();
    if (!memberships.has(match.id)) {
      memberships.add(match.id);
      saveActiveTeamId(match.id);
      saveTeam(match.id, (team) => {
        if (!team.roster.includes("You")) team.roster.push("You");
        return team;
      });
      persistTeams();
    }
    activateTeam(match.id);
  });

  if (selectedHackathon) {
    hackathonInput.value = selectedHackathon;
    writeStorage(STORAGE_KEYS.selectedHackathon, "");
  }
}

if (document.body.dataset.page === "dashboard") initializeDashboard();
if (document.body.dataset.page === "teams") initializeTeams();
