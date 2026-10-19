const $ = (id) => document.getElementById(id);
const state = {
  settings: {},
  info: null,
  jobs: [],
  selectedBenchmarks: new Set(["gemm"]),
  selectedProfiles: new Set(["SM80_A100"]),
  drafts: {},
  customGPUs: {},
  benchmarkDrafts: {},
  gpuEditor: null,
  benchmarkId: null,
  canvas: CanvasGraph.empty(),
  canvases: [],
  activeCanvasId: null,
  runPanelExpanded: false,
  canvasEditing: null,
  view: "workbench",
  configId: null,
  jobId: null,
  artifact: "sim.log",
  logs: new Map(),
  fallbackBenchmarks: [],
  storeSelection: new Set(),
  maintenance: null,
  storage: null,
};
const terminal = new Set([
  "completed",
  "failed",
  "incorrect",
  "incomplete",
  "limited",
  "timed_out",
  "cancelled",
  "interrupted",
  "unverified",
]);
const labels = {
  queued: "等待中",
  preparing: "准备中",
  compiling: "编译中",
  running: "运行中",
  cancelling: "正在停止",
  completed: "已完成",
  failed: "失败",
  incorrect: "结果不匹配",
  incomplete: "结果不完整",
  limited: "达到周期上限",
  timed_out: "超时",
  cancelled: "已取消",
  interrupted: "运行已中断",
  unverified: "完成 · 未验证",
};
const descriptions = {
  workbench: ["实验工作台", "添加程序和 GPU，连接模块，在画布上运行实验。"],
  results: [
    "运行与结果",
    "每个实验独立记录，随时查看日志、比较配置和导出结果。",
  ],
  environment: ["环境设置", "接入已有 CUDA 和模拟器，检测后即可开始实验。"],
  store: [
    "Benchmark 商店",
    "按套件浏览 GPGPU-Sim / Accel-Sim 生态程序，下载源码或加入实验。",
  ],
  tutorial: ["部署教程", "从安装 WSL，到准备 CUDA 和一键编译模拟器。"],
};
let toastTimer;
let refreshTimer;
let readGeneration = 0;

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function toast(message, error = false) {
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => ($("toast").hidden = true),
    error ? 9000 : 4000,
  );
}
function showView(view) {
  state.view = view;
  document.body.classList.toggle("canvas-view", view === "workbench");
  for (const name of Object.keys(descriptions))
    $("view-" + name).hidden = name !== view;
  document
    .querySelectorAll(".nav-item")
    .forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  [$("page-title").textContent, $("page-description").textContent] =
    descriptions[view];
  if (view === "results") renderJobs();
  if (view === "store") renderStore();
  if (view === "workbench") renderCanvas();
  window.scrollTo(0, 0);
}
function sizes() {
  const parts = $("sizes")
    .value.split(/[,，\s]+/)
    .filter(Boolean);
  if (!parts.length || parts.some((s) => !/^\d+$/.test(s))) return [];
  const numbers = [...new Set(parts.map(Number))];
  return numbers.every((n) => n >= 1 && n <= 4096) ? numbers : [];
}
function getConfig(text, key, fallback = "") {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [
    ...text.matchAll(new RegExp("^\\s*" + escaped + "\\s+([^#\\n]+)", "gm")),
  ];
  return matches.length ? matches.at(-1)[1].trim() : fallback;
}
function setConfig(text, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("^\\s*" + escaped + "\\s+[^\\n]*", "gm");
  return pattern.test(text)
    ? text.replace(pattern, () => key + " " + value)
    : text.trimEnd() + "\n" + key + " " + value + "\n";
}
function currentProfiles() {
  return allGpuModules().filter(p => p.supported && state.selectedProfiles.has(p.id));
}
function currentBenchmarks() {
  return (state.info?.benchmarks || []).filter(b => b.available && state.selectedBenchmarks.has(b.id));
}
function renderBenchmarks() { renderBenchmarkModules(); }
function renderProfiles() { renderGpuModules(); }
function renderPlan() { renderCanvas(); }

function renderEnvironment() {
  const info = state.info;
  const ready = Boolean(info?.ready);
  for (const id of ["env-dot", "summary-dot"])
    $(id).classList.toggle("ready", ready);
  $("header-status").classList.toggle("ready", ready);
  $("header-status").textContent = ready
    ? `${state.settings.distro} · CUDA ${info.cudaVersion}`
    : info
      ? `${state.settings.distro} · 等待部署`
      : "环境待接入";
  $("backend-label").textContent = ready
    ? "后端环境已连接"
    : info
      ? "WSL 已连接，待部署"
      : "后端待连接";
  $("sidebar-env").textContent = ready
    ? `${state.settings.distro} / CUDA ${info.cudaVersion}`
    : "在环境设置中完成检测";
  $("summary-cuda").textContent = ready
    ? `CUDA ${info.cudaVersion}`
    : "环境待接入";
  $("summary-sim").textContent = info?.simulator?.commit
    ? `GPGPU-Sim · ${info.simulator.commit.slice(0, 8)}`
    : "GPGPU-Sim";
  $("environment-notice").hidden = ready;
  $("environment-badge").textContent = ready ? "检查通过" : "需要配置";
  $("environment-badge").className = "badge " + (ready ? "good" : "warning");
  $("cuda-options").innerHTML = (info?.cudaCandidates || [])
    .map((p) => `<option value="${escapeHTML(p)}">`)
    .join("");
  if (!info) return;
  const rows = [
    {
      name: "CUDA Toolkit",
      detail: `${info.cudaVersion} · ${info.paths.cudaRoot}`,
      available: info.cudaAvailable,
    },
    {
      name: "模拟器构建",
      detail: info.setupScript || "尚未生成环境脚本",
      available: info.simulatorReady,
    },
    {
      name: "Benchmark 源码",
      detail:
        info.benchmarks
          .filter((b) => b.available)
          .map((b) => b.name)
          .join("、") || "未检测到",
      available: info.benchmarks.some((b) => b.available),
    },
    {
      name: "兼容 GPU 配置",
      detail: `${info.profiles.filter((p) => p.supported).length} 个`,
      available: info.profiles.some((p) => p.supported),
    },
    {
      name: "运行验证",
      detail: "环境检测完成后，用小规模任务验证编译、运行及正确性。",
    },
  ];
  $("environment-report").innerHTML =
    rows
      .map(
        (r) =>
          `<div class="check-row"><span class="check-icon">${r.available ? "✓" : "·"}</span><div><strong>${r.name}</strong><small>${escapeHTML(r.detail)}</small></div></div>`,
      )
      .join("") +
    info.issues
      .map(
        (issue) =>
          `<div class="check-row issue"><span class="check-icon">!</span><div><strong>需要处理</strong><small>${escapeHTML(issue)}</small></div></div>`,
      )
      .join("");
  $("deploy-guidance").textContent = info.simulatorReady
    ? "模拟器已编译。可以直接到商店下载程序并开始实验；需要重编译时使用此按钮。"
    : !info.cudaAvailable
      ? "已连接 Linux。请按教程准备 CUDA Toolkit，再重新检测或填写 CUDA 路径。"
      : info.missingDependencies.length
        ? "缺少编译依赖：" +
          info.missingDependencies.join("、") +
          "。请先复制教程中的依赖安装命令。"
        : "CUDA 与编译依赖已就绪。点击按钮即可下载官方源码并完成编译。";
  $("deploy-simulator").textContent = info.sourceExists
    ? "编译现有源码"
    : "一键下载并编译";
  $("deploy-simulator").disabled =
    !info.cudaAvailable ||
    info.missingDependencies.length > 0 ||
    Boolean(
      state.maintenance &&
      ["preparing", "running"].includes(state.maintenance.status),
    );
  $("tutorial-detection").textContent = ready
    ? "已检测到可用环境，可以开始实验"
    : info.cudaAvailable
      ? "已检测到 CUDA，接下来部署模拟器"
      : "按照缺少的环节准备环境";
}
function fillEnvironment() {
  for (const [key, id] of [
    ["simRoot", "sim-root"],
    ["appsRoot", "apps-root"],
    ["cudaRoot", "cuda-root"],
    ["runsRoot", "runs-root"],
  ])
    $(id).value = state.settings[key] || "";
  if (state.settings.distro) $("distro").value = state.settings.distro;
}
async function inspect(settings, automatic = false) {
  $("inspect-env").disabled = true;
  $("inspect-env").textContent = "正在检测…";
  $("environment-badge").textContent = "检测中";
  $("launch").disabled = true;
  try {
    const info = await window.studio.inspect(settings);
    applyEnvironment(info);
    if (!automatic)
      toast(
        info.ready
          ? "环境检查通过，可以创建实验。"
          : "环境检测完成，请查看需要处理的项目。",
        !info.ready,
      );
  } catch (error) {
    state.info = null;
    renderEnvironment();
    renderBenchmarks();
    renderProfiles();
    renderPlan();
    $("environment-notice").hidden = false;
    $("header-status").textContent = "环境检测未通过";
    $("backend-label").textContent = "后端待连接";
    $("environment-report").innerHTML =
      `<div class="check-row issue"><span class="check-icon">!</span><div><strong>连接失败</strong><small>${escapeHTML(error.message)}</small></div></div>`;
    toast(error.message, true);
  } finally {
    $("inspect-env").disabled = false;
    $("inspect-env").textContent = "检测并保存环境";
  }
}

function applyEnvironment(info) {
  if (
    state.settings.simRoot &&
    state.settings.simRoot !== info.settings.simRoot
  )
    state.drafts = {};
  state.info = info;
  state.settings = info.settings;
  renderCpuSettings();
  if (info.distros)
    $("distro").innerHTML = info.distros
      .map(
        (d) =>
          `<option value="${escapeHTML(d.name)}">${escapeHTML(d.name)}</option>`,
      )
      .join("");
  if (!currentBenchmarks().length) {
    const first = info.benchmarks.find((b) => b.available);
    if (first) state.selectedBenchmarks = new Set([first.id]);
  }
  if (!currentProfiles().length) {
    const first = info.profiles.find((p) => p.supported);
    if (first) state.selectedProfiles = new Set([first.id]);
  }
  fillEnvironment();
  renderEnvironment();
  renderBenchmarks();
  renderProfiles();
  renderPlan();
  renderStore();
}

async function detectAutomatically(quiet = false) {
  $("auto-detect").disabled = true;
  $("tutorial-detect").disabled = true;
  $("header-status").textContent = "正在自动检测…";
  try {
    const info = await window.studio.autoDetect();
    applyEnvironment(info);
    if (!info.ready) showView("environment");
    if (!quiet)
      toast(
        info.ready
          ? "已自动连接已有环境。"
          : "自动检测完成，缺少的组件可在环境设置中部署。",
      );
  } catch (error) {
    state.info = null;
    renderEnvironment();
    renderBenchmarks();
    renderProfiles();
    renderPlan();
    renderStore();
    $("environment-report").innerHTML =
      `<div class="check-row issue"><span class="check-icon">!</span><div><strong>运行环境需要准备</strong><small>${escapeHTML(error.message)}</small></div></div>`;
    $("tutorial-detection").textContent = error.message.split("\n")[0];
    $("deploy-simulator").disabled = true;
    showView("tutorial");
    if (!quiet) toast(error.message, true);
  } finally {
    $("auto-detect").disabled = false;
    $("tutorial-detect").disabled = false;
  }
}

function renderStore() {
  const benchmarks = state.info?.benchmarks || state.fallbackBenchmarks;
  const query = $("store-search").value.trim().toLowerCase();
  const suite = $("store-suite").value, readiness = $("store-readiness").value;
  const suites = [...new Set(benchmarks.map(b => b.suite || "自定义程序"))].sort();
  $("store-suite").innerHTML = '<option value="">全部套件</option>' + suites.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)} (${benchmarks.filter(b => b.suite === name).length})</option>`).join("");
  $("store-suite").value = suites.includes(suite) ? suite : "";
  const visible = benchmarks.filter(b => (!suite || b.suite === suite) && (!readiness || (readiness === "runnable" ? b.runnable !== false : readiness === "available" ? b.available : b.runnable === false)) &&
    `${b.name} ${b.description} ${b.suite} ${b.sourceDir || ""}`.toLowerCase().includes(query));
  $("store-count").textContent = `${visible.length} / ${benchmarks.length} 项 · ${suites.length} 个套件 / 来源 · ${benchmarks.filter(b => b.available).length} 项可加入实验`;
  $("store-grid").innerHTML = visible.map(b => {
    const downloadable = b.kind !== "custom" && !b.downloaded;
    const status = b.available ? "可加入实验" : b.downloaded ? "源码已下载 · 待运行适配" : b.runnable === false ? "未下载 · 待运行适配" : "未下载";
    return `<article class="store-card ${b.available ? "installed" : ""}" data-store-id="${escapeHTML(b.id)}"><div class="store-card-heading"><span class="benchmark-symbol">${b.kind === "custom" ? "＋" : "▦"}</span><div><small class="suite-label">${escapeHTML(b.suite || "自定义程序")}</small><h3>${escapeHTML(b.name)}</h3><span class="badge ${b.available ? "good" : "neutral"}">${status}</span></div>${downloadable ? `<input type="checkbox" aria-label="下载 ${escapeHTML(b.name)}" data-store-select="${escapeHTML(b.id)}" ${state.storeSelection.has(b.id) ? "checked" : ""}>` : ""}</div><p>${escapeHTML(b.description)}</p>${b.runnable !== false ? `<small>规模：${escapeHTML(b.sizeLabel || (b.macros || []).join(" = ") || "运行参数 {size}")}</small>` : ""}<small class="store-adaptation">${escapeHTML(b.adaptationNote || b.requirements || "自定义源码按所填规模方式编译")}</small><details class="store-source-details"><summary>源码与适配信息</summary><small>${escapeHTML(b.sourceURL || "https://github.com/accel-sim/gpu-app-collection")}</small>${b.sourceDir ? `<small>${escapeHTML(b.sourceDir)}</small>` : ""}${b.catalogCommit ? `<small>目录版本 ${escapeHTML(b.catalogCommit.slice(0, 12))}</small>` : ""}<small>${b.runnable === false ? "已收录上游源码下载。添加到画布前，需要完成编译、输入数据、规模参数和校验适配。可使用「添加自己的程序」注册单入口 CUDA 程序。" : "已接入规模设置和独立实验流程。实际编译和数值正确性以运行结果为准。"}</small></details><div class="store-card-actions">${b.available ? `<button class="secondary" data-use-benchmark="${escapeHTML(b.id)}">加入实验</button>` : downloadable ? `<button class="primary" data-download="${escapeHTML(b.id)}" ${state.info ? "" : "disabled"}>${b.runnable === false ? "下载源码" : "下载程序"}</button>` : `<span class="subtle">${b.kind === "custom" ? "检查源码路径或重新添加" : "源码已保留，等待适配"}</span>`}${b.downloaded && b.source ? `<button class="text-button" data-copy-source="${escapeHTML(b.id)}">复制源码路径</button>` : ""}${b.kind === "custom" ? `<button class="text-button" data-remove-custom="${escapeHTML(b.id)}">移出列表</button>` : ""}</div></article>`;
  }).join("") || '<p class="helper">没有匹配的程序，试试其他套件或搜索词。</p>';
  for (const b of benchmarks)
    if (b.downloaded || b.available) state.storeSelection.delete(b.id);
  $("download-selected").textContent =
    `下载所选程序（${state.storeSelection.size}）`;
  $("download-selected").disabled =
    !state.info ||
    !state.storeSelection.size ||
    Boolean(
      state.maintenance &&
      ["preparing", "running"].includes(state.maintenance.status),
    );
  $("add-custom").disabled = !state.info;
}

function renderMaintenance(value) {
  state.maintenance = value;
  $("maintenance-panel").hidden = !value;
  if (!value) return;
  const active = ["preparing", "running"].includes(value.status);
  const titles = {
    deploy: "GPGPU-Sim 部署",
    "install-benchmarks": "Benchmark 下载",
    "add-custom": "添加自定义程序",
  };
  const stages = {
    preparing: "准备中",
    clone: "下载模拟器源码",
    configure: "配置编译环境",
    build: "编译模拟器",
    install: "安装运行库",
    download: "下载程序",
  };
  $("maintenance-title").textContent = titles[value.op] || "部署 / 下载";
  $("maintenance-status").textContent = active
    ? stages[value.stage] || "执行中"
    : labels[value.status] || value.status;
  $("maintenance-status").className =
    "badge " +
    (active ? "active" : value.status === "completed" ? "good" : "bad");
  $("maintenance-log").textContent = value.text || "正在准备…";
  $("maintenance-log").scrollTop = $("maintenance-log").scrollHeight;
  $("maintenance-error").textContent =
    value.error ||
    (value.status === "completed"
      ? "操作完成。日志保存于 " + (value.workDir || "")
      : "");
  $("cancel-maintenance").disabled = !active;
  renderStore();
  if (value.environment) {
    applyEnvironment(value.environment);
    if (value.result?.added)
      state.selectedBenchmarks = new Set([value.result.added]);
    renderBenchmarks();
    renderPlan();
  }
}

async function startOperation(request) {
  try {
    const result = await window.studio.maintenance(request);
    renderMaintenance(result);
  } catch (error) {
    toast(error.message, true);
  }
}

function badge(status) {
  const kind =
    status === "completed"
      ? "good"
      : ["queued", "cancelled", "interrupted"].includes(status)
        ? "neutral"
        : ["preparing", "compiling", "running", "cancelling"].includes(status)
          ? "active"
          : ["limited", "timed_out", "incomplete", "unverified"].includes(
                status,
              )
            ? "warning"
            : "bad";
  return `<span class="badge ${kind}">${labels[status] || escapeHTML(status)}</span>`;
}
function number(value) {
  return value === undefined || value === null
    ? "—"
    : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function renderJobs() {
  const jobs = state.jobs;
  $("nav-count").textContent = jobs.length;
  $("stat-total").textContent = jobs.length;
  $("stat-running").textContent = jobs.filter(
    (j) => !terminal.has(j.status) && j.status !== "queued",
  ).length;
  $("stat-completed").textContent = jobs.filter(
    (j) => j.status === "completed",
  ).length;
  $("stat-attention").textContent = jobs.filter((j) =>
    [
      "failed",
      "incorrect",
      "incomplete",
      "limited",
      "timed_out",
      "interrupted",
      "unverified",
    ].includes(j.status),
  ).length;
  $("jobs-empty").hidden = Boolean(jobs.length);
  $("job-table").innerHTML = [...jobs]
    .reverse()
    .map(
      (job) =>
        `<tr data-job-row="${job.id}"><td><button class="job-name" data-job="${job.id}">${escapeHTML(job.benchmarkName || job.benchmark.toUpperCase())}<small>${escapeHTML(job.workloadLabel || `规模 ${job.size}`)}${job.repeatCount > 1 ? ` · 第 ${job.repeatIndex}/${job.repeatCount} 次` : ""} · ${job.id.slice(0, 8)}</small>${job.canvasName ? `<small>画布：${escapeHTML(job.canvasName)}</small>` : ""}</button></td><td>${escapeHTML(job.profileName)}</td><td>${badge(job.status)}</td><td class="${job.correctness === "passed" ? "correct-pass" : job.correctness === "failed" ? "correct-fail" : ""}">${job.correctness === "passed" ? "✓ 通过" : job.correctness === "failed" ? `${job.mismatches} 项不匹配` : job.status === "unverified" ? "未提供比对" : "待验证"}</td><td>${number(job.metrics?.cycles)}</td><td>${number(job.metrics?.ipc)}</td><td>${terminal.has(job.status) ? `<button class="text-button" data-job="${job.id}">详情 →</button>` : `<button class="cancel-button" data-cancel="${job.id}">取消</button>`}</td></tr>`,
    )
    .join("");
  renderComparison();
  if ($("job-dialog").open) renderJobDetail();
}
function comparisonKey(job) {
  const parameters = Object.entries(job.parameters || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([job.benchmark, job.size, parameters, job.runtimeArgs || []]);
}
function renderComparison() {
  const complete = state.jobs.filter(j => j.status === "completed" && j.metrics?.modeledTimeMs);
  const groups = [...new Set(complete.map(comparisonKey))];
  const previous = $("compare-group").value;
  $("compare-group").innerHTML = groups.length ? groups.map(group => {
    const job = complete.find(j => comparisonKey(j) === group);
    return `<option value="${escapeHTML(group)}">${escapeHTML(job.benchmarkName)} · ${escapeHTML(job.workloadLabel || job.size)}</option>`;
  }).join("") : '<option value="">暂无可比较结果</option>';
  if (groups.includes(previous)) $("compare-group").value = previous;
  drawComparison();
}
function drawComparison() {
  const jobs = state.jobs.filter(j => comparisonKey(j) === $("compare-group").value && j.status === "completed" && j.metrics?.modeledTimeMs);
  const max = Math.max(...jobs.map(j => j.metrics.modeledTimeMs), 1e-12);
  $("comparison-chart").innerHTML = jobs.length ? jobs.map(j => `<div class="bar-row"><span>${escapeHTML(j.profileName)}<small> · ${j.id.slice(0, 4)}</small></span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, j.metrics.modeledTimeMs / max * 100)}%"></div></div><span class="bar-value">${j.metrics.modeledTimeMs.toFixed(4)} ms</span></div>`).join("") : '<p class="helper">相同程序、规模和参数通过检查后，可比较 GPU 模块。</p>';
}

function openConfig(id) { openGpuEditor(id); }
function renderJobDetail() {
  const job = state.jobs.find((j) => j.id === state.jobId);
  if (!job) return;
  $("job-title").textContent =
    `${job.benchmarkName || job.benchmark.toUpperCase()} / ${job.workloadLabel || job.size} / ${job.profileName}`;
  const seconds =
    job.elapsedSeconds ||
    (job.startedAt
      ? Math.max(0, (Date.now() - new Date(job.startedAt)) / 1000)
      : 0);
  $("job-detail-summary").innerHTML =
    `${badge(job.status)}<span>模拟周期 ${number(job.metrics?.cycles)}</span><span>IPC ${number(job.metrics?.ipc)}</span><span>主机耗时 ${seconds.toFixed(1)} s</span><span>${escapeHTML(cpuJobLabel(job))}</span>${job.error ? `<span class="correct-fail">${escapeHTML(job.error)}</span>` : ""}`;
  $("job-workdir").textContent = job.workDir || "正在准备独立工作目录";
  $("open-job-folder").disabled = !job.workDir;
  ProfileUI.update(job);
}
async function loadArtifact() {
  const generation = ++readGeneration;
  const jobId = state.jobId;
  const artifact = state.artifact;
  if (!jobId) return;
  const cache = state.logs.get(
    jobId + ":" + (artifact === "compile.log" ? "compiling" : "running"),
  );
  if (["sim.log", "compile.log"].includes(artifact) && cache)
    $("job-log").textContent = cache;
  else $("job-log").textContent = "读取文件中…";
  try {
    const result = await window.studio.read(jobId, artifact);
    if (generation === readGeneration) $("job-log").textContent = result.text;
  } catch (error) {
    if (generation === readGeneration) $("job-log").textContent = error.message;
  }
  scrollLog();
}
function scrollLog() {
  $("job-log").scrollTop = $("job-log").scrollHeight;
}
function openJob(id) {
  state.jobId = id;
  state.artifact = "sim.log";
  document
    .querySelectorAll("[data-artifact]")
    .forEach((el) =>
      el.classList.toggle("active", el.dataset.artifact === state.artifact),
    );
  renderJobDetail();
  ProfileUI.open(id, state.jobs.find(j => j.id === id));
  $("job-dialog").showModal();
  loadArtifact();
}

document
  .querySelectorAll("[data-view]")
  .forEach((el) =>
    el.addEventListener("click", () => showView(el.dataset.view)),
  );
$("go-environment").onclick = () => showView("environment");
$("new-experiment").onclick = () => showView("workbench");
$("benchmark-list").addEventListener("change", (event) => {
  const id = event.target.dataset.benchmark;
  if (!id) return;
  event.target.checked
    ? state.selectedBenchmarks.add(id)
    : state.selectedBenchmarks.delete(id);
  renderBenchmarks();
  renderPlan();
  persistWorkbench();
});
$("profile-list").addEventListener("change", (event) => {
  const id = event.target.dataset.profile;
  if (!id) return;
  event.target.checked
    ? state.selectedProfiles.add(id)
    : state.selectedProfiles.delete(id);
  renderProfiles();
  renderPlan();
  persistWorkbench();
});
$("profile-list").addEventListener("click", (event) => {
  const id = event.target.closest("[data-edit]")?.dataset.edit;
  if (id) openConfig(id);
});
for (const id of ["sizes", "concurrency", "repeats"])
  $(id).addEventListener("input", () => { renderBenchmarks(); renderPlan(); persistWorkbench(); });
document.querySelectorAll("[data-sizes]").forEach(
  (el) =>
    (el.onclick = () => {
      $("sizes").value = el.dataset.sizes;
      renderBenchmarks();
      renderPlan();
      persistWorkbench();
    }),
);
$("environment-form").onsubmit = (event) => {
  event.preventDefault();
  inspect({
    distro: $("distro").value,
    simRoot: $("sim-root").value,
    appsRoot: $("apps-root").value,
    cudaRoot: $("cuda-root").value,
    runsRoot: $("runs-root").value,
  });
};
function renderStorage(info) {
  state.storage = info;
  $("storage-current").textContent = info.dataDir;
  $("storage-temp").textContent = info.tempDir;
  $("storage-runtime").textContent = info.runtimeDir;
  $("storage-config").textContent = info.configFile;
  $("storage-status").textContent = info.error || '';
  $("storage-runtime-hint").textContent = info.selfExtracting
    ? '当前为单文件自解压版，启动器仍会展开临时运行文件。建议使用新版 ZIP 目录版，解压到所选磁盘后直接运行。'
    : '程序文件保存在软件所在位置。ZIP 目录版解压一次即可使用，移动整个软件文件夹即可更换程序位置。';
}
$("choose-storage").onclick = async () => {
  try { const folder = await window.studio.chooseStorage(); if (folder) $("storage-target").value = folder; }
  catch (error) { toast(error.message, true); }
};
$("open-storage").onclick = async () => {
  try { const error = await window.studio.openStorage(); if (error) toast(error, true); }
  catch (error) { toast(error.message, true); }
};
$("move-storage").onclick = async () => {
  const directory = $("storage-target").value.trim();
  if (!directory) return toast('请先选择新的空数据文件夹。', true);
  $("move-storage").disabled = true; $("storage-status").textContent = '准备迁移，软件会在保存数据后重启…';
  try { persistWorkbench(); await window.studio.relocateStorage(directory); }
  catch (error) {
    const message = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
    $("move-storage").disabled = false; $("storage-status").textContent = message; toast(message, true);
  }
};
document.querySelectorAll('[data-browse-environment]').forEach(button => button.onclick = async () => {
  try {
    const folder = await window.studio.chooseEnvironmentFolder({ kind: button.dataset.browseEnvironment, distro: $("distro").value });
    if (folder) $({ simRoot: 'sim-root', appsRoot: 'apps-root', runsRoot: 'runs-root' }[button.dataset.browseEnvironment]).value = folder;
  } catch (error) { toast(error.message, true); }
});
$("install-help").onclick = () => showView("tutorial");
$("launch").onclick = runAllCanvasEdges;
$("job-table").onclick = (event) => {
  const job = event.target.closest("[data-job]")?.dataset.job;
  const cancel = event.target.closest("[data-cancel]")?.dataset.cancel;
  if (job) openJob(job);
  if (cancel) window.studio.cancel(cancel);
};
$("export-csv").onclick = async () => {
  try {
    const file = await window.studio.exportCSV();
    if (file) toast("结果已导出：" + file);
  } catch (error) {
    toast(error.message, true);
  }
};
$("compare-group").onchange = drawComparison;
$("close-config").onclick = () => { $("config-dialog").close(); state.canvasEditing = null; };
$("reset-config").onclick = resetGpuEditor;
$("save-config").onclick = saveGpuEditor;
$("close-job").onclick = () => $("job-dialog").close();
$("refresh-log").onclick = loadArtifact;
document.querySelectorAll("[data-artifact]").forEach(
  (el) =>
    (el.onclick = () => {
      state.artifact = el.dataset.artifact;
      document
        .querySelectorAll("[data-artifact]")
        .forEach((b) => b.classList.toggle("active", b === el));
      loadArtifact();
    }),
);
$("open-job-folder").onclick = async () => {
  try {
    await window.studio.openFolder(state.jobId);
  } catch (error) {
    toast(error.message, true);
  }
};
window.studio.onJobs((jobs) => {
  state.jobs = jobs;
  renderJobs();
  refreshCanvasJobs();
});
window.studio.onLog((event) => {
  const key = event.jobId + ":" + event.channel;
  state.logs.set(
    key,
    ((state.logs.get(key) || "") + event.text).slice(-200000),
  );
  if (
    $("job-dialog").open &&
    state.jobId === event.jobId &&
    state.artifact ===
      (event.channel === "compiling" ? "compile.log" : "sim.log")
  ) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      $("job-log").textContent = state.logs.get(key);
      scrollLog();
    }, 120);
  }
});
window.studio.onMaintenance(renderMaintenance);
$("go-store").onclick = () => showView("store");
$("auto-detect").onclick = () => detectAutomatically();
$("tutorial-detect").onclick = () => detectAutomatically();
$("tutorial-to-env").onclick = () => showView("environment");
$("deploy-tutorial").onclick = () => showView("tutorial");
$("official-wsl").onclick = () => window.studio.help();
$("official-cuda").onclick = () => window.studio.help("cuda");
document.querySelectorAll("[data-copy]").forEach(
  (button) =>
    (button.onclick = async () => {
      await window.studio.copyText(button.dataset.copy);
      toast("命令已复制。");
    }),
);
$("deploy-simulator").onclick = () =>
  startOperation({
    op: "deploy",
    environment: {
      distro: $("distro").value,
      simRoot: $("sim-root").value,
      appsRoot: $("apps-root").value,
      cudaRoot: $("cuda-root").value,
      runsRoot: $("runs-root").value,
    },
    buildJobs: Number($("build-jobs").value),
    installGemm: $("install-gemm").checked,
  });
$("cancel-maintenance").onclick = () => window.studio.cancelMaintenance();
$("store-search").oninput = renderStore;
$("store-suite").onchange = $("store-readiness").onchange = renderStore;
$("store-grid").onchange = (event) => {
  const id = event.target.dataset.storeSelect;
  if (!id) return;
  event.target.checked
    ? state.storeSelection.add(id)
    : state.storeSelection.delete(id);
  renderStore();
};
$("select-store-all").onclick = () => {
  const all = (state.info?.benchmarks || state.fallbackBenchmarks).filter(
    (b) => b.kind !== "custom" && !b.downloaded && (!$("store-suite").value || b.suite === $("store-suite").value) && (!$("store-readiness").value || ($("store-readiness").value === "runnable" ? b.runnable !== false : $("store-readiness").value === "available" ? b.available : b.runnable === false)) && `${b.name} ${b.description} ${b.suite}`.toLowerCase().includes($("store-search").value.trim().toLowerCase()),
  );
  const alreadyAll = all.every((b) => state.storeSelection.has(b.id));
  state.storeSelection = alreadyAll ? new Set() : new Set(all.map((b) => b.id));
  renderStore();
};
$("download-selected").onclick = () =>
  startOperation({ op: "install-benchmarks", ids: [...state.storeSelection] });
$("store-grid").onclick = async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.copySource) {
    const b = state.info?.benchmarks.find(b => b.id === button.dataset.copySource);
    if (b) { await window.studio.copyText(b.source); toast("源码路径已复制。"); }
  }
  if (button.dataset.download)
    startOperation({
      op: "install-benchmarks",
      ids: [button.dataset.download],
    });
  if (button.dataset.useBenchmark) {
    state.selectedBenchmarks = new Set([button.dataset.useBenchmark]);
    showView("workbench");
    addCanvasBenchmark(button.dataset.useBenchmark);
    renderBenchmarks();
    renderPlan();
  }
  if (button.dataset.removeCustom) {
    try {
      const info = await window.studio.removeCustom(
        button.dataset.removeCustom,
      );
      state.selectedBenchmarks.delete(button.dataset.removeCustom);
      applyEnvironment(info);
      toast("已移出列表，源码保留在原位置。");
    } catch (error) {
      toast(error.message, true);
    }
  }
};
$("add-custom").onclick = () => $("custom-dialog").showModal();
$("close-custom").onclick = () => $("custom-dialog").close();
$("custom-origin").onchange = () => {
  $("custom-local-row").hidden = $("custom-origin").value !== "local";
  $("custom-github-row").hidden = $("custom-origin").value !== "github";
};
$("custom-mode").onchange = () => {
  $("custom-macros-row").hidden = $("custom-mode").value !== "macros";
  $("custom-args-row").hidden = $("custom-mode").value !== "arguments";
};
$("custom-form").onsubmit = async (event) => {
  event.preventDefault();
  const spec = {
    name: $("custom-name").value,
    sourceRoot:
      $("custom-origin").value === "local" ? $("custom-root").value : "",
    repoURL:
      $("custom-origin").value === "github" ? $("custom-repo").value : "",
    ref: $("custom-ref").value,
    file: $("custom-file").value,
    mode: $("custom-mode").value,
    macros: $("custom-macros")
      .value.split(/[,，\s]+/)
      .filter(Boolean),
    args:
      $("custom-mode").value === "arguments"
        ? $("custom-args").value.split("\n").filter(Boolean)
        : [],
  };
  try {
    const result = await window.studio.maintenance({ op: "add-custom", spec });
    $("custom-dialog").close();
    renderMaintenance(result);
  } catch (error) {
    toast(error.message, true);
  }
};
setupModuleEditors();
setupCanvas();
restoreWorkbench();
renderBenchmarks();
renderProfiles();
renderPlan();
(async () => {
  try {
    const initial = await window.studio.bootstrap();
    state.settings = initial.settings;
    renderStorage(initial.storage);
    state.jobs = initial.jobs;
    restoreCanvasJobLinks();
    state.fallbackBenchmarks = initial.benchmarksFallback || [];
    $("version").textContent = initial.version;
    $("distro").innerHTML = initial.distros.length
      ? initial.distros
          .map(
            (d) =>
              `<option value="${escapeHTML(d.name)}">${escapeHTML(d.name)}</option>`,
          )
          .join("")
      : '<option value="">尚未安装 WSL / Linux 发行版</option>';
    fillEnvironment();
    renderJobs();
    renderStore();
    if (initial.distroError) {
      $("header-status").textContent = "需要安装 WSL";
      $("environment-notice").hidden = false;
      $("environment-report").innerHTML =
        `<div class="check-row issue"><span class="check-icon">!</span><div><strong>运行环境未就绪</strong><small>${escapeHTML(initial.distroError)}</small></div></div>`;
      $("tutorial-detection").textContent = initial.distroError;
      $("deploy-simulator").disabled = true;
      showView("tutorial");
    } else await detectAutomatically(true);
  } catch (error) {
    toast(error.message, true);
  }
})();
