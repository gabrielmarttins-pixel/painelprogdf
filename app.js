const STORAGE_KEY = "painel-prog-data";
const SUPABASE_ROW_ID = "current";
const REMOTE_REFRESH_INTERVAL = 5000;
let remoteConfigPromise;

const defaultCall = {
  id: "ID DA CHAMADA",
  name: "NOME DA CHAMADA",
  duration: "00:00:30",
  time: "00:00",
};

const defaults = {
  updatedAt: "",
  isCleared: false,
  carouselImages: [],
  program: {
    program: "",
    date: "",
    time: "",
    production: "",
    blocks: "",
    notes: "",
    bulletin: {
      id: "",
      name: "",
      duration: "",
      time: "",
    },
    calls: [defaultCall],
  },
};

function loadLocalData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return defaults;

    return {
      ...defaults,
      ...saved,
      program: {
        ...defaults.program,
        ...(saved.program || {}),
        bulletin: {
          ...defaults.program.bulletin,
          ...(saved.program?.bulletin || {}),
      },
      calls: saved.program?.calls?.length ? saved.program.calls : defaults.program.calls,
    },
    carouselImages: [],
    isCleared: Boolean(saved.isCleared),
  };
  } catch {
    return defaults;
  }
}

async function getSupabaseConfig() {
  if (!remoteConfigPromise) {
    remoteConfigPromise = loadRemoteConfig();
  }
  return remoteConfigPromise;
}

async function loadRemoteConfig() {
  const config = window.PAINEL_CONFIG || {};
  let mergedConfig = config;

  try {
    const response = await fetch(new URL("config.json", window.location.origin).href, { cache: "no-store" });
    if (response.ok) {
      const jsonConfig = await response.json();
      mergedConfig = { ...config, ...jsonConfig };
    }
  } catch (error) {
    console.warn(error);
  }

  if (!mergedConfig.supabaseUrl || !mergedConfig.supabaseAnonKey) return null;

  return {
    url: mergedConfig.supabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, ""),
    key: mergedConfig.supabaseAnonKey,
  };
}

function normalizeData(data) {
  return {
    ...defaults,
    ...(data || {}),
    program: {
      ...defaults.program,
      ...(data?.program || {}),
      bulletin: {
        ...defaults.program.bulletin,
        ...(data?.program?.bulletin || {}),
      },
      calls: data?.program?.calls?.length ? data.program.calls : defaults.program.calls,
    },
    carouselImages: [],
    isCleared: Boolean(data?.isCleared),
  };
}

async function fetchWithTimeout(url, options = {}, timeout = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function loadApiData() {
  try {
    const response = await fetchWithTimeout(`/api/state?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;

    const payload = await response.json();
    return payload.data ? normalizeData(payload.data) : normalizeData(null);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

async function saveApiData(data) {
  const response = await fetchWithTimeout("/api/state", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`API save failed: ${response.status}`);
  }
}

async function loadData() {
  const apiData = await loadApiData();
  if (apiData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(apiData));
    return apiData;
  }

  const config = await getSupabaseConfig();
  if (!config) return loadLocalData();

  try {
    const response = await fetch(
      `${config.url}/rest/v1/panel_state?id=eq.${SUPABASE_ROW_ID}&select=data,updated_at`,
      {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
      },
    );

    if (!response.ok) throw new Error(`Supabase read failed: ${response.status}`);
    const rows = await response.json();
    const remoteData = rows[0]?.data;
    if (!remoteData) return loadLocalData();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteData));
    return normalizeData(remoteData);
  } catch (error) {
    console.warn(error);
    return loadLocalData();
  }
}

function hasSavedData() {
  return Boolean(localStorage.getItem(STORAGE_KEY));
}

async function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  try {
    await saveApiData(data);
    return;
  } catch (error) {
    console.warn(error);
  }

  const config = await getSupabaseConfig();
  if (!config) return;

  const payload = JSON.stringify({
    id: SUPABASE_ROW_ID,
    data,
    updated_at: new Date().toISOString(),
  });

  const updateResponse = await fetch(
    `${config.url}/rest/v1/panel_state?id=eq.${SUPABASE_ROW_ID}`,
    {
      method: "PATCH",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: payload,
    },
  );

  if (updateResponse.ok) return;

  const createResponse = await fetch(
    `${config.url}/rest/v1/panel_state?on_conflict=id`,
    {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: payload,
    },
  );

  if (!createResponse.ok) {
    throw new Error(`Supabase save failed: ${updateResponse.status}/${createResponse.status}`);
  }
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getTimeFromDateTime(value) {
  if (!value) return "--:--";
  return value.split(",").pop().trim();
}

function normalizeTimeWithSeconds(value) {
  if (!value) return "";
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  return value;
}

function formatDurationMinutesSeconds(value) {
  if (!value) return "";
  const parts = value.split(":");
  const minutes = parts.length === 3 ? Number(parts[1]) : Number(parts[0]);
  const seconds = parts.length === 3 ? parts[2] : parts[1];
  if (Number.isNaN(minutes) || !seconds) return value;
  if (minutes === 0) return `${seconds}"`;
  return `${minutes}'${seconds}"`;
}

function getCountdown(dateValue, timeValue) {
  if (!dateValue || !timeValue) return "00:00:00";

  const diff = getCountdownDiff(dateValue, timeValue);
  if (diff <= 0) return "NO AR";

  const totalSeconds = Math.floor(diff / 1000);
  const displayHours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const displayMinutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const displaySeconds = String(totalSeconds % 60).padStart(2, "0");

  return `${displayHours}:${displayMinutes}:${displaySeconds}`;
}

function getCountdownDiff(dateValue, timeValue) {
  if (!dateValue || !timeValue) return 0;

  const [hours = "0", minutes = "0", seconds = "0"] = normalizeTimeWithSeconds(timeValue).split(":");
  const target = new Date(`${dateValue}T00:00:00`);
  target.setHours(Number(hours), Number(minutes), Number(seconds), 0);

  return target.getTime() - Date.now();
}

function getCountdownState(dateValue, timeValue) {
  const diff = getCountdownDiff(dateValue, timeValue);
  if (diff <= 0) return "on-air";
  if (diff <= 5 * 60 * 1000) return "danger";
  if (diff <= 10 * 60 * 1000) return "warning";
  return "normal";
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

const logoAssetVersion = "20260520d";

const programLogos = {
  "BOM DIA DF": `assets/BOM DIA DF.png?v=${logoAssetVersion}`,
  DF1: `assets/DF1.png?v=${logoAssetVersion}`,
  "GLOBO ESPORTE": `assets/GLOBO ESPORTE.png?v=${logoAssetVersion}`,
  DF2: `assets/DF2.png?v=${logoAssetVersion}`,
  "GLOBO COMUNIDADE": `assets/GLOBO COMUNIDADE.png?v=${logoAssetVersion}`,
};

const programBackgrounds = {
  "BOM DIA DF": "manha",
  DF1: "manha",
  "GLOBO COMUNIDADE": "manha",
  DF2: "noite",
  "GLOBO ESPORTE": "globo-esporte",
};

function renderProgramLogo(programName) {
  const logo = programLogos[programName];
  if (!logo) return `<h1>${escapeHtml(programName || "PROGRAMA")}</h1>`;

  return `<img class="program-logo" src="${encodeURI(logo)}" alt="${escapeHtml(programName)}" />`;
}

function initCoordination() {
  const form = document.getElementById("coordination-form");
  if (!form) return;

  loadData().then((data) => {
    populateCoordinationForm(form, data);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const program = Object.keys(defaults.program).reduce((entry, field) => {
      if (field === "calls" || field === "bulletin") return entry;
      entry[field] = form.elements[field].value.trim();
      return entry;
    }, {});
    program.time = normalizeTimeWithSeconds(program.time);
    program.bulletin = readBulletinInput();
    program.calls = readCallInputs();

    const updated = {
      updatedAt: formatDateTime(new Date()),
      isCleared: false,
      carouselImages: [],
      program,
    };

    try {
      await saveData(updated);
      setText("last-update", updated.updatedAt);
    } catch (error) {
      console.error(error);
      setText("last-update", "Salvo localmente. Erro ao enviar para a nuvem.");
    }
  });

  document.getElementById("clear-panel").addEventListener("click", () => {
    clearPanelToCarousel();
  });

  document.getElementById("add-call").addEventListener("click", () => {
    addCallInput();
  });

}

function populateCoordinationForm(form, data) {
  Object.entries(data.program).forEach(([field, value]) => {
    if (field !== "calls" && field !== "bulletin" && form.elements[field]) {
      form.elements[field].value = field === "time" ? normalizeTimeWithSeconds(value) : value || "";
    }
  });
  setText("last-update", data.updatedAt || "Ainda não salvo");
  renderBulletinInput(data.program.bulletin);
  renderCallInputs(data.program.calls);
}

async function clearPanelToCarousel() {
  const data = await loadData();
  const updated = {
    ...data,
    updatedAt: formatDateTime(new Date()),
    isCleared: true,
    carouselImages: [],
  };

  try {
    await saveData(updated);
    setText("last-update", updated.updatedAt);
  } catch (error) {
    console.error(error);
    setText("last-update", "Painel limpo localmente. Erro ao enviar para a nuvem.");
  }
}

function renderBulletinInput(bulletin) {
  document.querySelectorAll("[data-bulletin-field]").forEach((field) => {
    field.value = bulletin?.[field.dataset.bulletinField] || "";
  });
}

function readBulletinInput() {
  const bulletin = {};
  document.querySelectorAll("[data-bulletin-field]").forEach((field) => {
    bulletin[field.dataset.bulletinField] = field.value.trim();
  });
  return bulletin;
}

function renderCallInputs(calls) {
  const list = document.getElementById("calls-list");
  if (!list) return;
  list.innerHTML = "";
  (calls?.length ? calls : defaults.program.calls).forEach((call) => addCallInput(call));
}

function addCallInput(call = {}) {
  const list = document.getElementById("calls-list");
  const template = document.getElementById("call-template");
  if (!list || !template) return;

  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector(".call-row");
  const callData = {
    ...defaultCall,
    ...call,
  };

  row.querySelectorAll("[data-call-field]").forEach((field) => {
    field.value = callData[field.dataset.callField] || "";
  });
  row.querySelector("[data-remove-call]").addEventListener("click", () => {
    if (list.querySelectorAll(".call-row").length === 1) {
      row.querySelectorAll("[data-call-field]").forEach((field) => {
        field.value = "";
      });
      return;
    }
    row.remove();
  });
  list.appendChild(fragment);
}

function readCallInputs() {
  return [...document.querySelectorAll(".call-row")].map((row) => {
    const call = {};
    row.querySelectorAll("[data-call-field]").forEach((field) => {
      call[field.dataset.callField] = field.value.trim();
    });
    return call;
  });
}

function initDisplay() {
  const grid = document.getElementById("display-grid");
  if (!grid) return;
  let latestData = loadLocalData();
  let isRendering = false;

  const render = async () => {
    if (isRendering) return;
    isRendering = true;
    
    try {
      const data = await loadData();
      latestData = data;
      const program = data.program;
      document.body.dataset.background = programBackgrounds[program.program] || "";
      setText("display-updated-at", `Última atualização: ${getTimeFromDateTime(data.updatedAt)}`);

      if (!hasSavedData()) {
        grid.innerHTML = `
          <div class="empty-state">
            <div>
              <div class="loader"></div>
              <p>Carregando...</p>
            </div>
          </div>
        `;
        return;
      }

      if (data.isCleared) {
        document.body.dataset.background = "";
        if (!grid.querySelector(".cleared-panel-image")) {
          grid.innerHTML = renderClearedPanel();
        }
        return;
      }

      grid.innerHTML = "";

      const card = document.createElement("article");
      card.className = "display-card program-display-card";
      card.innerHTML = `
        <section class="program-hero" aria-label="Informações do programa">
          <div class="program-summary">
            <span>PRODUÇÃO: ${escapeHtml(program.production || "Não informado")}</span>
            <span aria-hidden="true">|</span>
            <span>BLOCOS: ${escapeHtml(program.blocks || "Não informado")}</span>
          </div>
          ${renderProgramLogo(program.program)}
        </section>
        <section class="countdown-panel" aria-label="Contagem regressiva">
          <span class="card-meta">${escapeHtml(normalizeTimeWithSeconds(program.time) || "--:--:--")}</span>
          <strong id="program-countdown" data-state="${escapeHtml(getCountdownState(program.date, program.time))}">${escapeHtml(getCountdown(program.date, program.time))}</strong>
        </section>
        <div class="display-bottom">
          <div class="calls-stack">
            ${renderBulletin(program.bulletin)}
            <section class="display-section calls-display-section" aria-label="Chamadas">
              <h2>CHAMADAS</h2>
              ${renderCalls(program.calls)}
            </section>
          </div>
          <section class="display-section observations-section" aria-label="Observações">
            <h2>OBSERVAÇÕES</h2>
            <strong>${escapeHtml(program.notes || "Sem observações.")}</strong>
          </section>
        </div>
      `;
      grid.appendChild(card);
    } finally {
      isRendering = false;
    }
  };

  const tick = () => {
    const now = new Date();
    setText("display-date", new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(now));

    const countdown = document.getElementById("program-countdown");
    if (countdown) {
      countdown.textContent = getCountdown(latestData.program.date, latestData.program.time);
      countdown.dataset.state = getCountdownState(latestData.program.date, latestData.program.time);
    }
  };

  render();
  tick();
  setInterval(render, REMOTE_REFRESH_INTERVAL);
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) render();
  });
}

function renderBulletin(bulletin) {
  const hasBulletin = bulletin && bulletin.id;
  if (!hasBulletin) return "";

  return `
    <section class="display-section bulletin-display-section" aria-label="Boletim">
      <h2>BOLETIM</h2>
      <div class="display-call-row bulletin-display-row">
        <span>${escapeHtml(bulletin.id || "-")}</span>
        <strong>${escapeHtml(bulletin.name || "Boletim")}</strong>
        <span>${escapeHtml(formatDurationMinutesSeconds(bulletin.duration) || "--:--")}</span>
        <span>${escapeHtml(bulletin.time || "--:--")}</span>
      </div>
    </section>
  `;
}

function renderClearedPanel() {
  return `
    <section class="cleared-panel-image" aria-label="Painel limpo">
      <img src="assets/painel-limpo.jpg?v=20260521" alt="TV Globo DF" />
    </section>
  `;
}

function renderCalls(calls) {
  const filledCalls = (calls || []).filter((call) => call.id || call.name || call.duration || call.time);
  if (!filledCalls.length) {
    return `<p class="highlight">Nenhuma chamada informada.</p>`;
  }

  return `
    <div class="display-calls">
      ${filledCalls
        .map(
          (call) => `
            <div class="display-call-row">
              <span>${escapeHtml(call.id || "-")}</span>
              <strong>${escapeHtml(call.name || "Chamada")}</strong>
              <span>${escapeHtml(formatDurationMinutesSeconds(call.duration) || "--:--")}</span>
              <span>${escapeHtml(call.time || "--:--")}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

initCoordination();
initDisplay();
