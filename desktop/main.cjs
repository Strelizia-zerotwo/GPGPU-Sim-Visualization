const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  clipboard,
} = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { JobManager } = require("./runner.cjs");
const execute = promisify(execFile);

if (process.env.GPGPU_STUDIO_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.GPGPU_STUDIO_DATA_DIR));
let window;
let manager;
let state;
let environmentInfo;
let closing = false;
let persistTimer;
let maintenance = null;
let maintenanceWorker = null;
const backendPaths = new Map();

const defaultSettings = {
  distro: "",
  simRoot: "",
  appsRoot: "",
  cudaRoot: "",
  runsRoot: "",
};
function statePath() {
  return path.join(app.getPath("userData"), "state.json");
}
function persist() {
  const folder = app.getPath("userData");
  fs.mkdirSync(folder, { recursive: true });
  const temporary = statePath() + ".tmp";
  fs.writeFileSync(
    temporary,
    JSON.stringify(
      { settings: state.settings, jobs: manager.snapshot() },
      null,
      2,
    ),
  );
  fs.renameSync(temporary, statePath());
}
function delayedPersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 300);
}
function send(channel, payload) {
  if (window && !window.isDestroyed())
    window.webContents.send(channel, payload);
}
function cleanWSL(text) {
  return String(text)
    .replace(/\u0000/g, "")
    .replace(/^\uFEFF/, "")
    .trim();
}

async function distributions() {
  if (process.platform === "linux")
    return [{ name: "本机 Linux", native: true }];
  if (process.platform !== "win32")
    throw new Error("当前版本支持 Windows + WSL，以及原生 Linux。");
  try {
    const result = await execute("wsl.exe", ["--list", "--quiet"], {
      windowsHide: true,
      encoding: "utf16le",
      timeout: 20000,
    });
    return cleanWSL(result.stdout)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name, native: false }));
  } catch {
    throw new Error(
      "没有检测到可用的 WSL。请安装 WSL 和 Ubuntu，然后在这里重新检测。",
    );
  }
}

async function launchCommand(settings) {
  const backend = app.isPackaged
    ? path.join(process.resourcesPath, "backend/bridge.py")
    : path.join(__dirname, "../backend/bridge.py");
  if (process.platform === "linux")
    return { command: "python3", args: [backend] };
  if (process.platform !== "win32" || !settings.distro)
    throw new Error("请先选择 WSL 发行版。");
  let linuxPath = backendPaths.get(settings.distro);
  if (!linuxPath) {
    const result = await execute(
      "wsl.exe",
      ["-d", settings.distro, "--exec", "wslpath", "-u", backend],
      { windowsHide: true, encoding: "utf8", timeout: 20000 },
    );
    linuxPath = cleanWSL(result.stdout);
    if (!linuxPath.startsWith("/"))
      throw new Error("无法把后端路径转换为 WSL 路径。");
    backendPaths.set(settings.distro, linuxPath);
  }
  return {
    command: "wsl.exe",
    args: ["-d", settings.distro, "--exec", "python3", linuxPath],
  };
}

async function bridge(request, settings, onEvent, keepStdin = false) {
  const command = await launchCommand(settings);
  const process = spawn(command.command, command.args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  process.stdout.setEncoding("utf8");
  process.stderr.setEncoding("utf8");
  let pending = "";
  let errors = "";
  let delivered = false;
  process.stdout.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (["done", "error", "response"].includes(event.type))
          delivered = true;
        onEvent(event);
      } catch {
        errors = (errors + line + "\n").slice(-6000);
      }
    }
  });
  process.stderr.on("data", (chunk) => {
    errors = (errors + chunk).slice(-6000);
  });
  process.on("error", (error) => {
    if (!delivered) {
      delivered = true;
      onEvent({ type: "error", message: error.message });
    }
  });
  process.on("close", (code) => {
    if (!delivered)
      onEvent({
        type: "error",
        message:
          errors ||
          `后端提前退出（${code}）。请检查 WSL、Python 3 和环境路径。`,
      });
  });
  process.stdin.on("error", () => {});
  process.stdin.write(JSON.stringify(request) + "\n");
  if (!keepStdin) process.stdin.end();
  return {
    cancel: () => {
      if (process.stdin.writable) process.stdin.write('{"op":"cancel"}\n');
    },
  };
}

function requestBridge(request, settings) {
  return new Promise((resolve, reject) => {
    bridge(request, settings, (event) => {
      if (event.type === "response") resolve(event.result);
      else if (event.type === "error") reject(new Error(event.message));
    }).catch(reject);
  });
}

function startWorker(job, onEvent) {
  let child;
  let cancelRequested = false;
  bridge(
    { op: "run", environment: job.environment, job },
    job.environment,
    onEvent,
    true,
  )
    .then((worker) => {
      child = worker;
      if (cancelRequested) child.cancel();
    })
    .catch((error) => onEvent({ type: "error", message: error.message }));
  return {
    cancel: () => {
      cancelRequested = true;
      child?.cancel();
    },
  };
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function cleanSettings(settings) {
  return Object.fromEntries(
    Object.keys(defaultSettings).map((key) => [
      key,
      typeof settings[key] === "string" ? settings[key].trim() : "",
    ]),
  );
}

async function inspectSelected(settings) {
  const selected = cleanSettings(settings);
  const distros = await distributions();
  if (!distros.some((d) => d.name === selected.distro))
    throw new Error("所选发行版不存在，请点击自动检测，或查看 WSL 部署教程。");
  const info = await requestBridge(
    { op: "inspect", environment: selected },
    selected,
  );
  state.settings = { ...selected, ...info.paths };
  environmentInfo = info;
  persist();
  return { ...info, settings: state.settings, distros };
}

async function autoDetect() {
  environmentInfo = null;
  const distros = await distributions();
  if (!distros.length)
    throw new Error(
      "尚未安装 Linux 发行版。请按软件内的 WSL 部署教程安装 Ubuntu。",
    );
  let best;
  let lastError;
  const candidates = [...distros].sort(
    (a, b) =>
      Number(b.name === state.settings.distro) -
      Number(a.name === state.settings.distro),
  );
  for (const distro of candidates) {
    try {
      const selected = { ...defaultSettings, distro: distro.name };
      if (distro.name === state.settings.distro)
        Object.assign(selected, state.settings);
      let info = await requestBridge(
        { op: "inspect", environment: selected },
        selected,
      );
      if (!info.sourceExists && selected.simRoot) {
        const fresh = { ...defaultSettings, distro: distro.name };
        const discovered = await requestBridge(
          { op: "inspect", environment: fresh },
          fresh,
        );
        if (discovered.sourceExists || discovered.cudaAvailable) {
          info = discovered;
          Object.assign(selected, fresh);
        }
      }
      const score =
        (info.ready ? 1000 : 0) +
        (info.sourceExists ? 100 : 0) +
        (info.cudaAvailable ? 10 : 0);
      if (!best || score > best.score) best = { info, selected, score };
      if (info.ready) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!best)
    throw new Error(
      `已检测到 WSL，但 Linux 后端尚未就绪。请按教程安装 Python 3 和编译依赖。${lastError ? "\n" + lastError.message : ""}`,
    );
  environmentInfo = best.info;
  state.settings = { ...best.selected, ...best.info.paths };
  persist();
  return { ...best.info, settings: state.settings, distros };
}

async function startMaintenance(request) {
  if (maintenanceWorker)
    throw new Error("已有下载或部署任务正在执行，请等待完成或取消。");
  if (!["deploy", "install-benchmarks", "add-custom"].includes(request.op))
    throw new Error("无效的操作");
  if (request.op === "deploy" && manager.active.size)
    throw new Error("请先结束正在运行的实验，再部署模拟器。");
  const settings = cleanSettings(request.environment || state.settings);
  if (!settings.appsRoot || !settings.simRoot || !settings.cudaRoot)
    throw new Error("请先自动检测环境，确认部署和下载位置。");
  maintenance = {
    op: request.op,
    status: "preparing",
    stage: "preparing",
    text: "",
    startedAt: new Date().toISOString(),
  };
  let requestedCancel = false;
  const slot = {
    cancel: () => {
      requestedCancel = true;
    },
  };
  maintenanceWorker = slot;
  send("studio:maintenance", maintenance);
  const eventHandler = async (event) => {
    if (event.type === "stage") maintenance.stage = event.stage;
    else if (event.type === "log")
      maintenance.text = (maintenance.text + event.text).slice(-200000);
    else if (event.type === "prepared") maintenance.workDir = event.workDir;
    else if (["done", "error"].includes(event.type)) {
      maintenance.status =
        event.type === "error" ? "failed" : event.result.status;
      maintenance.error = event.message || event.result?.error;
      maintenance.result = event.result;
      if (maintenance.status === "completed") {
        try {
          maintenance.environment = await inspectSelected(settings);
        } catch (error) {
          maintenance.error = "操作完成，环境重新检测失败：" + error.message;
        }
      }
      maintenanceWorker = null;
    }
    send("studio:maintenance", maintenance);
  };
  bridge({ ...request, environment: settings }, settings, eventHandler, true)
    .then((worker) => {
      slot.cancel = worker.cancel;
      if (requestedCancel) worker.cancel();
    })
    .catch((error) => eventHandler({ type: "error", message: error.message }));
  return maintenance;
}

app.whenReady().then(() => {
  try {
    state = JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    state = { settings: { ...defaultSettings }, jobs: [] };
  }
  state.settings = { ...defaultSettings, ...state.settings };
  manager = new JobManager(startWorker, state.jobs);
  manager.on("change", (jobs) => {
    delayedPersist();
    send("studio:jobs", jobs);
  });
  manager.on("log", (event) => send("studio:log", event));

  ipcMain.handle("studio:bootstrap", async () => {
    let distros = [];
    let distroError = "";
    try {
      distros = await distributions();
    } catch (error) {
      distroError = error.message;
    }
    if (!state.settings.distro && distros.length)
      state.settings.distro = distros[0].name;
    if (!distros.length && !distroError)
      distroError = "尚未安装 Linux 发行版，请按 WSL 部署教程安装 Ubuntu。";
    return {
      settings: state.settings,
      jobs: manager.snapshot(),
      distros,
      distroError,
      platform: process.platform,
      version: app.getVersion(),
      maintenance,
      benchmarksFallback: Object.entries(
        JSON.parse(
          fs.readFileSync(
            app.isPackaged
              ? path.join(process.resourcesPath, "backend/polybench.json")
              : path.join(__dirname, "../backend/polybench.json"),
            "utf8",
          ),
        ),
      ).map(([id, descriptor]) => ({ ...descriptor, id, available: false })),
    };
  });
  ipcMain.handle("studio:inspect", async (_, settings) => {
    environmentInfo = null;
    return inspectSelected(settings);
  });
  ipcMain.handle("studio:auto-detect", () => autoDetect());
  ipcMain.handle("studio:maintenance", (_, request) =>
    startMaintenance(request),
  );
  ipcMain.handle("studio:cancel-maintenance", () =>
    maintenanceWorker?.cancel(),
  );
  ipcMain.handle("studio:remove-custom", async (_, id) => {
    if (maintenanceWorker) throw new Error("请等待下载/部署任务结束。");
    await requestBridge(
      { op: "remove-custom", id, environment: state.settings },
      state.settings,
    );
    return inspectSelected(state.settings);
  });
  ipcMain.handle("studio:copy", (_, text) => {
    if (typeof text === "string" && text.length < 20000)
      clipboard.writeText(text);
  });
  ipcMain.handle("studio:submit", (_, spec) => {
    if (maintenanceWorker && maintenance.op === "deploy")
      throw new Error("请等待模拟器部署完成。");
    if (!environmentInfo?.ready) throw new Error("请先在环境页面完成检测。");
    return manager.submit(spec, state.settings, environmentInfo);
  });
  ipcMain.handle("studio:cancel", (_, id) => manager.cancel(id));
  ipcMain.handle("studio:read", (_, { id, name }) => {
    const job = manager.jobs.find((j) => j.id === id);
    if (!job?.workDir) return { text: "任务尚未生成工作目录。" };
    return requestBridge(
      {
        op: "read",
        workDir: job.workDir,
        runsRoot: job.environment.runsRoot,
        name,
      },
      job.environment,
    );
  });
  ipcMain.handle("studio:open-folder", async (_, id) => {
    const job = manager.jobs.find((j) => j.id === id);
    if (!job?.workDir) return;
    const target =
      process.platform === "win32"
        ? `\\\\wsl.localhost\\${job.environment.distro}${job.workDir.replaceAll("/", "\\")}`
        : job.workDir;
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
  });
  ipcMain.handle("studio:export", async () => {
    const selection = await dialog.showSaveDialog(window, {
      title: "导出实验结果",
      defaultPath: "gpgpu-experiments.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (selection.canceled) return null;
    const columns = [
      "id",
      "benchmark",
      "size",
      "parameters",
      "runtime_arguments",
      "base_gpu_template",
      "gpu_config",
      "status",
      "correctness",
      "cycles",
      "instructions",
      "ipc",
      "modeled_time_ms",
      "host_elapsed_seconds",
      "cuda_version",
      "simulator_commit",
      "work_dir",
    ];
    const rows = manager.jobs.map((job) => [
      job.id,
      job.benchmarkName || job.benchmark,
      job.size,
      JSON.stringify(job.parameters || {}),
      JSON.stringify(job.runtimeArgs || []),
      job.baseProfileId || job.profileId,
      job.profileName,
      job.status,
      job.correctness,
      job.metrics?.cycles,
      job.metrics?.instructions,
      job.metrics?.ipc,
      job.metrics?.modeledTimeMs,
      job.elapsedSeconds,
      job.manifest?.cudaVersion,
      job.manifest?.simulator?.commit,
      job.workDir,
    ]);
    fs.writeFileSync(
      selection.filePath,
      "\uFEFF" +
        [columns, ...rows]
          .map((row) => row.map(csvCell).join(","))
          .join("\r\n"),
      "utf8",
    );
    return selection.filePath;
  });
  ipcMain.handle("studio:help", (_, topic) =>
    shell.openExternal(
      topic === "cuda"
        ? "https://docs.nvidia.com/cuda/wsl-user-guide/index.html"
        : "https://learn.microsoft.com/zh-cn/windows/wsl/install",
    ),
  );

  window = new BrowserWindow({
    width: 1450,
    height: 940,
    minWidth: 1100,
    minHeight: 760,
    title: "GPGPU Studio",
    backgroundColor: "#f5f7fa",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#ffffff", symbolColor: "#536174", height: 42 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) event.preventDefault();
  });
  window.loadFile(path.join(__dirname, "ui/index.html"));
  window.on("close", async (event) => {
    if (closing) return;
    if (
      manager.active.size ||
      maintenanceWorker ||
      manager.jobs.some((j) => j.status === "queued")
    ) {
      event.preventDefault();
      const result = await dialog.showMessageBox(window, {
        type: "question",
        buttons: ["继续运行", "停止任务并退出"],
        defaultId: 0,
        cancelId: 0,
        message: "仍有实验正在运行或等待。",
        detail: "退出会停止本软件启动的实验进程；日志和已有结果会保留。",
      });
      if (result.response !== 1) return;
      closing = true;
      manager.stopAll();
      maintenanceWorker?.cancel();
      const began = Date.now();
      while (
        (manager.active.size || maintenanceWorker) &&
        Date.now() - began < 8000
      )
        await new Promise((resolve) => setTimeout(resolve, 100));
      persist();
      app.quit();
    } else {
      persist();
    }
  });
});
app.on("window-all-closed", () => app.quit());
