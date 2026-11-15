const STORAGE_KEYS = {
  selectedHackathon: "hackathonHub.selectedHackathon",
  teams: "hackathonHub.teams",
  claims: "hackathonHub.claims",
  projects: "hackathonHub.projects",
  meeting: "hackathonHub.meeting"
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

const hackathons = [
  { name: "SSETC Healthcare 2026", organizer: "SSETC · Social impact", mode: "Offline", location: "Chennai", teamSize: "1-3", prize: 250000, prizeLabel: "₹2,50,000", fee: "Free", deadline: "2026-11-28", deadlineLabel: "Nov 28, 2026", mark: "✳" },
  { name: "Smart City Hack", organizer: "Civic Labs · Urban tech", mode: "Offline", location: "Bengaluru", teamSize: "4+", prize: 100000, prizeLabel: "₹1,00,000", fee: "Free", deadline: "2026-12-05", deadlineLabel: "Dec 05, 2026", mark: "⌂" },
  { name: "India AI Buildathon", organizer: "Future Foundry · AI / ML", mode: "Online", location: "Online", teamSize: "1-3", prize: 500000, prizeLabel: "₹5,00,000", fee: "Paid", deadline: "2026-12-12", deadlineLabel: "Dec 12, 2026", mark: "◎" },
  { name: "Green Future Hackfest", organizer: "EarthWorks · Climate tech", mode: "Online", location: "Online", teamSize: "4+", prize: 150000, prizeLabel: "₹1,50,000", fee: "Free", deadline: "2026-11-22", deadlineLabel: "Nov 22, 2026", mark: "✿" },
  { name: "Fintech Founders Jam", organizer: "PayForward · Fintech", mode: "Offline", location: "Chennai", teamSize: "Individual", prize: 200000, prizeLabel: "₹2,00,000", fee: "Paid", deadline: "2026-12-18", deadlineLabel: "Dec 18, 2026", mark: "↗" },
  { name: "Campus Code Sprint", organizer: "Dev Collective · Open track", mode: "Offline", location: "Hyderabad", teamSize: "1-3", prize: 75000, prizeLabel: "₹75,000", fee: "Free", deadline: "2026-11-30", deadlineLabel: "Nov 30, 2026", mark: "⌘" }
];

function initializeDashboard() {
  const list = document.querySelector("#hackathon-list");
  if (!list) return;

  const filters = { location: "All", teamSize: "All", sort: "deadline" };
  const count = document.querySelector("#result-count");

  function renderHackathons() {
    let visible = hackathons.filter((item) => {
      const locationMatches = filters.location === "All"
        || (filters.location === "Online" ? item.mode === "Online" : filters.location === "Offline" ? item.mode === "Offline" : item.location === filters.location);
      const sizeMatches = filters.teamSize === "All" || item.teamSize === filters.teamSize;
      return locationMatches && sizeMatches;
    });
    visible = [...visible].sort((a, b) => filters.sort === "deadline" ? a.deadline.localeCompare(b.deadline) : b.prize - a.prize);
    count.textContent = `${visible.length} ${visible.length === 1 ? "event" : "events"}`;

    if (visible.length === 0) {
      list.innerHTML = '<div class="empty-state">No hackathons match these filters. Try another combination.</div>';
      return;
    }

    list.innerHTML = visible.map((item) => {
      const index = hackathons.indexOf(item);
      return `
        <article class="hackathon-card">
          <div class="hackathon-title">
            <span class="event-mark" aria-hidden="true">${item.mark}</span>
            <div><div class="event-name">${item.name}</div><div class="event-organizer">${item.organizer}</div></div>
          </div>
          <div class="data-cell mode-cell"><span class="cell-label">MODE</span><span class="mode-pin" aria-hidden="true"></span>${item.mode}<span class="subtle-location">· ${item.location}</span></div>
          <div class="data-cell size-cell"><span class="cell-label">TEAM</span>${item.teamSize === "Individual" ? "Individual" : `${item.teamSize} people`}</div>
          <div class="data-cell prize-cell"><span class="cell-label">PRIZE</span>${item.prizeLabel}</div>
          <div class="data-cell fee-cell"><span class="cell-label">ENTRY</span><span class="fee-badge${item.fee === "Paid" ? " paid" : ""}">${item.fee}</span></div>
          <div class="data-cell deadline-cell"><span class="cell-label">DEADLINE</span>${item.deadlineLabel}</div>
          <button class="start-team-button" type="button" data-hackathon-index="${index}">Start Team <span>→</span></button>
        </article>`;
    }).join("");

    list.querySelectorAll(".start-team-button").forEach((button) => {
      button.addEventListener("click", () => {
        writeStorage(STORAGE_KEYS.selectedHackathon, hackathons[Number(button.dataset.hackathonIndex)].name);
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

  renderHackathons();
}

const defaultOpenTeams = [
  { id: "team-1", name: "The Data Dreamers", hackathon: "India AI Buildathon", roles: ["AIML", "Frontend"], access: "open", spots: 2 },
  { id: "team-2", name: "Green Machine", hackathon: "Green Future Hackfest", roles: ["UI/UX", "Backend"], access: "open", spots: 1 },
  { id: "team-3", name: "Civic Spark", hackathon: "Smart City Hack", roles: ["Frontend", "Data"], access: "code", code: "#CITY28", spots: 2 }
];

const defaultProjects = {
  healthcare: [
    { title: "Interview healthcare professionals", person: "Aditi", deadline: "Nov 18", done: true },
    { title: "Map patient journey", person: "Rahul", deadline: "Nov 19", done: true },
    { title: "Build symptom checker flow", person: "Sanjay", deadline: "Nov 21", done: false },
    { title: "Connect prototype data", person: "Aditi", deadline: "Nov 23", done: false },
    { title: "Prepare demo pitch", person: "Everyone", deadline: "Nov 27", done: false }
  ],
  website: [
    { title: "Chatbot", person: "Rahul", deadline: "Nov 20", done: false },
    { title: "Frontend", person: "Sanjay", deadline: "Nov 22", done: false }
  ]
};

function initializeTeams() {
  const teamList = document.querySelector("#open-team-list");
  if (!teamList) return;

  const selectedHackathon = readStorage(STORAGE_KEYS.selectedHackathon, "");
  const teams = readStorage(STORAGE_KEYS.teams, []);
  const claims = readStorage(STORAGE_KEYS.claims, {});
  const openTeams = [...teams, ...defaultOpenTeams];

  function renderTeams() {
    teamList.innerHTML = openTeams.map((team) => {
      const claimed = Boolean(claims[team.id]);
      const roles = team.roles.map((role) => `<span class="role-tag">Need: ${escapeHtml(role)}</span>`).join("");
      const accessLabel = team.access === "code" ? (team.code || "Code only") : "Open to anyone";
      return `
        <article class="open-team-card">
          <div class="open-team-top">
            <span class="team-card-mark" aria-hidden="true">${escapeHtml(team.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase())}</span>
            <span class="team-access${team.access === "code" ? " code" : ""}">${escapeHtml(accessLabel)}</span>
          </div>
          <h3>${escapeHtml(team.name)}</h3>
          <div class="team-hackathon">${escapeHtml(team.hackathon)}</div>
          <div class="team-role-tags">${roles || '<span class="role-tag">Open roles</span>'}</div>
          <div class="open-team-bottom">
            <span class="spots-left"><strong>${claimed ? Math.max(0, team.spots - 1) : team.spots} spots</strong> left</span>
            <button class="claim-button${claimed ? " claimed" : ""}" type="button" data-claim="${escapeHtml(team.id)}" ${claimed ? "disabled" : ""}>${claimed ? "✓ Spot Claimed" : "Claim Spot"}</button>
          </div>
        </article>`;
    }).join("");

    teamList.querySelectorAll("[data-claim]").forEach((button) => {
      button.addEventListener("click", () => {
        claims[button.dataset.claim] = true;
        writeStorage(STORAGE_KEYS.claims, claims);
        renderTeams();
      });
    });
  }

  function renderProjects() {
    const projects = readStorage(STORAGE_KEYS.projects, null) || structuredClone(defaultProjects);
    writeStorage(STORAGE_KEYS.projects, projects);
    Object.entries(projects).forEach(([projectId, tasks]) => {
      const taskList = document.querySelector(`[data-task-list="${projectId}"]`);
      if (!taskList) return;
      const doneCount = tasks.filter((task) => task.done).length;
      const progressLabel = document.querySelector(`[data-progress="${projectId}"]`);
      const progressBar = document.querySelector(`[data-progress-bar="${projectId}"]`);
      progressLabel.textContent = `${doneCount}/${tasks.length} Tasks Done`;
      progressBar.style.width = `${tasks.length ? doneCount / tasks.length * 100 : 0}%`;
      taskList.innerHTML = tasks.map((task, index) => `
        <label class="task-row${task.done ? " done" : ""}">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <span class="task-owner">${escapeHtml(task.person)}</span>
          <span class="task-deadline">${escapeHtml(task.deadline)}</span>
          <input class="task-checkbox" type="checkbox" aria-label="Mark ${escapeHtml(task.title)} done" data-project="${projectId}" data-task-index="${index}" ${task.done ? "checked" : ""}>
        </label>`).join("");

      taskList.querySelectorAll(".task-checkbox").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          tasks[Number(checkbox.dataset.taskIndex)].done = checkbox.checked;
          writeStorage(STORAGE_KEYS.projects, projects);
          renderProjects();
        });
      });
    });
  }

  document.querySelectorAll(".project-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const card = toggle.closest(".project-card");
      const content = card.querySelector(".project-content");
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      card.classList.toggle("expanded", !expanded);
      content.hidden = expanded;
    });
  });

  document.querySelectorAll(".add-task-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const task = String(formData.get("task")).trim();
      const person = String(formData.get("person")).trim();
      const deadline = String(formData.get("deadline")).trim();
      if (!task || !person || !deadline) return;
      const projects = readStorage(STORAGE_KEYS.projects, null) || structuredClone(defaultProjects);
      projects[form.dataset.addTask].push({ title: task, person, deadline, done: false });
      writeStorage(STORAGE_KEYS.projects, projects);
      form.reset();
      renderProjects();
    });
  });

  const modal = document.querySelector("#team-modal");
  const createForm = document.querySelector("#create-team-form");
  const hackathonInput = document.querySelector("#hackathon-name");
  if (selectedHackathon) hackathonInput.value = selectedHackathon;

  function closeModal() {
    modal.hidden = true;
    document.querySelector("#open-team-form").focus();
  }

  document.querySelector("#open-team-form").addEventListener("click", () => {
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

  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(createForm);
    const roles = String(formData.get("roles")).split(",").map((role) => role.trim()).filter(Boolean);
    const access = String(formData.get("access"));
    const newTeam = {
      id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(formData.get("teamName")).trim(),
      hackathon: String(formData.get("hackathonName")).trim(),
      roles,
      access,
      ...(access === "code" ? { code: `#TEAM${Math.floor(10 + Math.random() * 90)}` } : {}),
      spots: roles.length || 1
    };
    const savedTeams = readStorage(STORAGE_KEYS.teams, []);
    savedTeams.unshift(newTeam);
    writeStorage(STORAGE_KEYS.teams, savedTeams);
    openTeams.unshift(newTeam);
    renderTeams();
    createForm.reset();
    hackathonInput.value = selectedHackathon;
    closeModal();
  });

  const meeting = readStorage(STORAGE_KEYS.meeting, { time: "Tomorrow, 7:00 PM", link: "https://meet.google.com/" });
  const meetingTime = document.querySelector("#meet-time");
  const joinMeet = document.querySelector("#join-meet");
  meetingTime.textContent = meeting.time;
  joinMeet.href = meeting.link;
  document.querySelector("#edit-meet").addEventListener("click", () => {
    const time = window.prompt("When is the next team meet?", meeting.time);
    if (time === null) return;
    const link = window.prompt("Paste the meeting link", meeting.link);
    if (link === null) return;
    const validLink = /^(https?:\/\/|mailto:)/i.test(link.trim());
    if (!validLink) {
      window.alert("Please enter a valid link starting with https://.");
      return;
    }
    meeting.time = time.trim() || meeting.time;
    meeting.link = link.trim();
    writeStorage(STORAGE_KEYS.meeting, meeting);
    meetingTime.textContent = meeting.time;
    joinMeet.href = meeting.link;
  });

  renderTeams();
  renderProjects();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

if (document.body.dataset.page === "dashboard") initializeDashboard();
if (document.body.dataset.page === "teams") initializeTeams();
