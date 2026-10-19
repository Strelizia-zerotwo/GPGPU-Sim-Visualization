"""JSON-lines bridge. Runs under WSL/Linux using only Python's standard library."""
import codecs
import hashlib
import json
import difflib
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
sys.path.insert(0, str(Path(__file__).resolve().parent))
from catalog import BENCHMARKS, PREFIX, catalog, descriptors, load_custom, save_custom, source_location
from collection_adapters import prepare_collection, collection_arguments
from operations import check_dependencies
from adapters import compatibility_fixes
from parameters import validate_parameters, validate_arguments
from profiler import build_report
from cpu import inspect_cpu, MARKER
METRICS = {"gpu_tot_sim_cycle": "cycles", "gpu_tot_sim_insn": "instructions", "gpu_tot_ipc": "ipc"}


def emit(kind, **values):
    print(json.dumps({"type": kind, **values}, ensure_ascii=False), flush=True)


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def absolute_path(value):
    p = Path(value).expanduser()
    if not p.is_absolute():
        raise ValueError("请输入 Linux 绝对路径，例如 /home/用户名/projects/gpgpu-project")
    return p.resolve()


def command_output(args, timeout=20, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, **kwargs)
    if result.returncode:
        raise ValueError((result.stderr or result.stdout).strip()[-2000:] or f"命令失败：{args[0]}")
    return result.stdout.strip()


def config_value(text, name, default=""):
    matches = re.findall(r"^\s*" + re.escape(name) + r"\s+([^#\n]+)", text, re.M)
    return matches[-1].strip() if matches else default


def replace_config(text, name, value):
    if "\n" in str(value):
        raise ValueError("配置值不能包含换行")
    pattern = r"^\s*" + re.escape(name) + r"\s+[^\n]*"
    line = f"{name} {value}"
    if re.search(pattern, text, re.M):
        return re.sub(pattern, lambda _: line, text, flags=re.M)
    return text.rstrip() + "\n" + line + "\n"


def source_environment(sim_root, cuda_root):
    setup = sim_root / "setup"
    if not setup.is_file():
        setup = sim_root / "setup_environment"
    if not setup.is_file():
        raise ValueError("模拟器目录中没有 setup 或 setup_environment，请先完成编译。")
    seed = dict(os.environ)
    seed["CUDA_INSTALL_PATH"] = str(cuda_root)
    seed["PATH"] = str(cuda_root / "bin") + ":" + seed.get("PATH", "")
    result = subprocess.run(
        ["bash", "-c", 'source "$1" >/dev/null && env -0', "gpgpu-studio", str(setup)],
        env=seed, capture_output=True, timeout=30,
    )
    if result.returncode:
        raise ValueError("加载模拟器环境失败：" + result.stderr.decode(errors="replace")[-1500:])
    env = {}
    for entry in result.stdout.split(b"\0"):
        if b"=" in entry:
            key, value = entry.split(b"=", 1)
            env[key.decode()] = value.decode(errors="replace")
    effective_cuda = Path(env.get("CUDA_INSTALL_PATH", str(cuda_root))).resolve()
    if effective_cuda != cuda_root.resolve():
        raise ValueError(f"模拟器构建使用 {effective_cuda}，与所选 CUDA {cuda_root} 不一致。请选择匹配环境，或重新编译模拟器。")
    if Path(env.get("GPGPUSIM_ROOT", "")).resolve() != sim_root:
        raise ValueError("环境脚本指向其他模拟器目录；请在当前目录重新生成构建环境。")
    libraries = []
    for folder in env.get("LD_LIBRARY_PATH", "").split(":"):
        if folder and Path(folder).is_dir():
            libraries.extend(Path(folder).glob("libcudart.so*"))
    if not any(lib.resolve().is_relative_to(sim_root) for lib in libraries):
        raise ValueError("没有找到当前模拟器的 libcudart 运行库，请检查编译、安装是否完成。")
    return env, str(setup)


def git_info(path):
    try:
        return {"commit": command_output(["git", "-C", str(path), "rev-parse", "HEAD"]),
                "modified": bool(command_output(["git", "-C", str(path), "status", "--porcelain"]))}
    except (ValueError, subprocess.TimeoutExpired):
        return {"commit": None, "modified": None}


def discover_roots(home):
    """Bounded search of normal home/project locations, never the whole disk."""
    common = [home / "projects/gpgpu-project", home / "projects/gpgpu-studio", home / "gpgpu-project", home]
    found = [p / "gpgpu-sim_distribution" for p in common if (p / "gpgpu-sim_distribution").is_dir()]
    ignored = {".git", ".cache", "node_modules", ".local", ".vscode-server", "go", "downloads"}
    visited = 0
    for base in [home / "projects", home / "Documents", home / "work", home / "repos"]:
        if not base.is_dir():
            continue
        for parent, folders, files in os.walk(base):
            visited += 1
            folders[:] = [f for f in folders if f not in ignored and not f.startswith(".")]
            relative_depth = len(Path(parent).relative_to(base).parts)
            if relative_depth >= 3 or visited >= 600:
                folders[:] = []
            if "setup_environment" in files and "configs" in folders and (Path(parent) / "libcuda").is_dir():
                found.append(Path(parent))
                folders[:] = []
            if visited >= 600:
                break
    return list(dict.fromkeys(found))


def inspect_memory_capacity(sim):
    """Report literal CUDA API values from source, never infer enforced VRAM capacity."""
    relative = "libcuda/cuda_runtime_api.cc"
    result = {"source": relative, "runtimeVerified": False, "devicePropertiesBytes": None, "memGetInfoTotalBytes": None}
    try:
        text = (sim / relative).read_text(errors="replace")
    except OSError:
        return result
    text = re.sub(r"/\*[\s\S]*?\*/|//[^\n]*", "", text)

    def literal_assignment(pattern, source):
        values = re.findall(pattern + r"\s*=\s*(0[xX][0-9a-fA-F]+|[0-9]+)[uUlL]*\s*;", source)
        return int(values[0], 0 if values[0].lower().startswith("0x") else 10) if len(values) == 1 else None

    result["devicePropertiesBytes"] = literal_assignment(r"\bprop->totalGlobalMem", text)
    function = re.search(r"\bcudaMemGetInfo\s*\([^)]*\)\s*\{([\s\S]*?)\n\}", text)
    if function:
        result["memGetInfoTotalBytes"] = literal_assignment(r"\*total", function[1])
    return result


def inspect_environment(settings):
    home = Path.home()
    roots = discover_roots(home) if not settings.get("simRoot") else []
    sim_default = next((p for p in roots if (p / "setup").is_file()), roots[0] if roots else home / "projects/gpgpu-studio/gpgpu-sim_distribution")
    sim = absolute_path(settings.get("simRoot") or str(sim_default))
    apps = absolute_path(settings.get("appsRoot") or str(sim.parent / "gpu-app-collection"))
    runs = absolute_path(settings.get("runsRoot") or str(sim.parent / "runs/studio"))
    cuda_candidates = {str(p.resolve()) for p in Path("/usr/local").glob("cuda*") if (p / "bin/nvcc").is_file()}
    if shutil.which("nvcc"):
        cuda_candidates.add(str(Path(shutil.which("nvcc")).resolve().parent.parent))
    cuda_candidates = sorted(cuda_candidates)
    built_cuda = None
    if (sim / "setup").is_file():
        match = re.search(r"^export CUDA_INSTALL_PATH=(.+)$", (sim / "setup").read_text(), re.M)
        if match:
            built_cuda = match[1].strip().strip("\"'")
    cuda = absolute_path(settings.get("cudaRoot") or built_cuda or (cuda_candidates[-1] if cuda_candidates else "/usr/local/cuda"))
    paths = {"simRoot": str(sim), "appsRoot": str(apps), "runsRoot": str(runs), "cudaRoot": str(cuda)}
    issues = []
    if re.search(r"\s", str(runs)):
        issues.append("当前 GPGPU-Sim 不支持含空格的实验目录，请选择例如 /mnt/e/GPGPU-Studio-Runs。")
    env = None
    version = "未检测到"
    supported = []
    setup_path = None
    try:
        version_output = command_output([str(cuda / "bin/nvcc"), "--version"])
        match = re.search(r"release\s+([\d.]+)", version_output)
        version = match[1] if match else version_output
        supported = [int(x) for x in re.findall(r"compute_(\d+)\b", command_output([str(cuda / "bin/nvcc"), "--list-gpu-arch"]))]
    except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
        issues.append("CUDA Toolkit 未就绪：" + str(exc))
    try:
        env, setup_path = source_environment(sim, cuda)
    except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
        issues.append(str(exc))
    simulator_ready = env is not None
    benchmarks = catalog(apps)
    profiles = []
    for file in sorted((sim / "configs/tested-cfgs").glob("*/gpgpusim.config")):
        text = file.read_text()
        capability = int(config_value(text, "-gpgpu_ptx_force_max_capability", "0"))
        clusters = int(config_value(text, "-gpgpu_n_clusters", "0"))
        cores = int(config_value(text, "-gpgpu_n_cores_per_cluster", "1"))
        profiles.append({"id": file.parent.name, "name": file.parent.name.split("_", 1)[-1].replace("_", " "),
                         "capability": capability, "sms": clusters * cores, "clusters": clusters,
                         "scheduler": config_value(text, "-gpgpu_scheduler", "gto"),
                         "clockMHz": float(config_value(text, "-gpgpu_clock_domains", "0").split(":")[0]),
                         "supported": capability in supported, "text": text})
    if simulator_ready and not profiles:
        issues.append("没有找到 configs/tested-cfgs 中的 GPU 配置。")
    return {"ready": not issues, "paths": paths, "cudaVersion": version, "cudaCandidates": cuda_candidates,
            "setupScript": setup_path, "issues": issues, "profiles": profiles, "benchmarks": benchmarks,
            "simulator": git_info(sim), "memoryCapacity": inspect_memory_capacity(sim),
            "applications": git_info(apps), "supportedCapabilities": supported,
            "cpuCount": os.cpu_count(), "cpu": inspect_cpu(), "runtimeVerified": False, "simulatorReady": simulator_ready,
            "sourceExists": (sim / "CMakeLists.txt").is_file() or (sim / "setup_environment").is_file(),
            "cudaAvailable": (cuda / "bin/nvcc").is_file(), "missingDependencies": check_dependencies(),
            "discoveredSimulators": [str(p) for p in roots]}


def prepare_source(source, benchmark, size, descriptor=None, parameters=None):
    descriptor = descriptor or BENCHMARKS.get(benchmark)
    if not descriptor or type(size) is not int or not descriptor.get("minSize", 1) <= size <= 4096:
        raise ValueError("不支持的 benchmark 或规模；规模须为 1–4096 的整数。")
    parameters = validate_parameters(descriptor, source, parameters or {})
    for macro, value in {**{m: size for m in descriptor["macros"]}, **parameters}.items():
        source, count = re.subn(r"(^\s*#\s*define\s+" + re.escape(macro) + r"\s+)\d+\b", lambda m: m[1] + str(value), source, flags=re.M)
        if count != 1:
            raise ValueError(f"源码中的 {macro} 不符合当前适配器格式，已停止运行。")
    if descriptor.get("kind", "builtin") == "builtin":
        source = source.replace("../../common/polybenchUtilFuncts.h", "polybenchUtilFuncts.h")
        source, _ = compatibility_fixes(source, benchmark)
        if benchmark == "gemm" and parameters.get("NI", size) != parameters.get("NJ", size) and "dim3 grid((NJ + block.x - 1) / block.x, (NI + block.y - 1) / block.y);" not in source:
            raise ValueError("当前 GEMM 源码的网格不符合非方阵适配格式，已停止运行。")
    return source.replace("cudaThreadSynchronize()", "cudaDeviceSynchronize()")


class LogParser:
    def __init__(self):
        self.metrics = {}
        self.mismatches = None
        self.exit_detected = False
        self.fatal = False
        self.limit_reached = False

    def feed(self, line):
        for key, output_key in METRICS.items():
            match = re.match(r"\s*" + key + r"\s*=\s*([\d.eE+-]+)", line)
            if match:
                value = float(match[1])
                self.metrics[output_key] = int(value) if output_key != "ipc" else value
        match = re.search(r"Non-Matching CPU-GPU Outputs.*:\s*(\d+)", line)
        if match:
            self.mismatches = int(match[1])
        self.exit_detected |= "*** exit detected ***" in line
        self.fatal |= bool(re.search(r"SIGABRT|SIGSEGV|Assertion .*failed|^Error:|^ERROR:", line))
        self.limit_reached |= bool(re.search(r"maximum (cycle|instruction)|simulation limit|simulation hit a break|limit reached", line, re.I))

    def result(self, return_code, max_cycles=0, allow_unverified=False):
        correctness = "passed" if self.mismatches == 0 else ("failed" if self.mismatches is not None else "unknown")
        limit = self.limit_reached or (max_cycles > 0 and self.metrics.get("cycles", 0) >= max_cycles)
        if limit:
            state = "limited"
        elif return_code != 0 or self.fatal:
            state = "failed"
        elif correctness == "failed":
            state = "incorrect"
        elif self.exit_detected and correctness == "passed" and self.metrics.get("cycles", 0) > 0:
            state = "completed"
        elif allow_unverified and self.exit_detected and self.metrics.get("cycles", 0) > 0:
            state = "unverified"
        else:
            state = "incomplete"
        return {"status": state, "correctness": correctness, "mismatches": self.mismatches, "metrics": self.metrics}


class Stopped(Exception):
    def __init__(self, status):
        self.status = status


def terminate_group(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
    except ProcessLookupError:
        pass


def run_command(args, cwd, env, log_path, channel, cancel, deadline, parser=None, affinity=None):
    if affinity and affinity.get("enabled"):
        cpu_id = affinity.get("cpuId")
        info = inspect_cpu()
        if not info["bindingSupported"] or type(cpu_id) is not int or cpu_id not in info["availableCpuIds"]:
            raise ValueError("分配的 CPU 已不可用，请重新检测环境后提交。")
        args = [sys.executable, str(Path(__file__).with_name("cpu.py")), "--exec", str(cpu_id), *args]
    emit("stage", stage=channel)
    with log_path.open("w", encoding="utf-8") as logfile:
        logfile.write("Command: " + json.dumps(args, ensure_ascii=False) + "\n\n")
        process = subprocess.Popen(args, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        decoder = codecs.getincrementaldecoder("utf-8")("replace")
        pending = ""
        try:
            while selector.get_map():
                if cancel.is_set():
                    raise Stopped("cancelled")
                if time.monotonic() >= deadline:
                    raise Stopped("timed_out")
                for key, _ in selector.select(timeout=0.15):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        pending += decoder.decode(b"", final=True)
                    else:
                        pending += decoder.decode(chunk)
                    lines = pending.replace("\r", "\n").split("\n")
                    pending = lines.pop()
                    if lines:
                        for line in lines:
                            if affinity is not None and line.startswith(MARKER):
                                verified = json.loads(line[len(MARKER):])
                                if verified.get("cpuId") != affinity.get("cpuId") or verified.get("actualCpuIds") != [affinity.get("cpuId")]:
                                    raise ValueError("CPU 绑定核验结果不匹配")
                                affinity.update(verified)
                                emit("cpu-affinity", cpuAffinity=affinity)
                        text = "\n".join(lines) + "\n"
                        logfile.write(text)
                        logfile.flush()
                        emit("log", channel=channel, text=text)
                        if parser:
                            for line in lines:
                                parser.feed(line)
                if not selector.get_map() and pending:
                    logfile.write(pending)
                    emit("log", channel=channel, text=pending)
                    if parser:
                        parser.feed(pending)
            code = process.wait()
            if affinity and affinity.get("enabled") and not affinity.get("verified"):
                raise ValueError("未收到 CPU 绑定核验信息，请查看模拟日志。")
            return code
        finally:
            if process.poll() is None:
                terminate_group(process)
            selector.close()
            process.stdout.close()


def hash_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def run_job(request, cancel):
    job = request["job"]
    affinity = {"enabled": job.get("bindCpu") is True, "cpuId": job.get("cpuId"), "verified": False}
    identifier = job["id"]
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", identifier):
        raise ValueError("无效的任务标识")
    environment = inspect_environment(request["environment"])
    if not environment["ready"]:
        raise ValueError("；".join(environment["issues"]))
    if cancel.is_set():
        raise Stopped("cancelled")
    paths = environment["paths"]
    sim, apps, runs, cuda = (absolute_path(paths[k]) for k in ["simRoot", "appsRoot", "runsRoot", "cudaRoot"])
    env, setup = source_environment(sim, cuda)
    profile_id = job["profileId"]
    base_profile_id = job.get("baseProfileId") or profile_id
    available = {p["id"] for p in environment["profiles"]}
    if base_profile_id not in available:
        raise ValueError("没有找到所选 GPU 配置")
    benchmark, size = job["benchmark"], job["size"]
    all_benchmarks = descriptors(apps)
    if benchmark not in all_benchmarks:
        raise ValueError("不支持的 benchmark")
    descriptor = all_benchmarks[benchmark]
    profile_folder = sim / "configs/tested-cfgs" / base_profile_id
    text = job.get("configText") or (profile_folder / "gpgpusim.config").read_text()
    if len(text) > 200000:
        raise ValueError("配置文件过大")
    capability = int(config_value(text, "-gpgpu_ptx_force_max_capability", "0"))
    if capability not in environment["supportedCapabilities"]:
        raise ValueError(f"当前 CUDA 不支持生成 compute_{capability} PTX，请调整 GPU 配置或选择兼容环境。")
    if config_value(text, "-gpgpu_ptx_sim_mode", "0") != "0":
        raise ValueError("当前结果管理要求性能模拟模式：-gpgpu_ptx_sim_mode 0。")
    max_cycles = int(job.get("maxCycles", 0))
    if max_cycles < 0:
        raise ValueError("最大模拟周期不能为负数")
    text = replace_config(text, "-gpgpu_max_cycle", max_cycles)
    clock_mhz = float(config_value(text, "-gpgpu_clock_domains", "0").split(":")[0])
    builtin = descriptor["kind"] == "builtin"
    collection = descriptor["kind"] == "collection"
    if not descriptor.get("runnable", True):
        raise ValueError("此条目目前只接入源码下载，尚未完成运行适配。")
    source_path = source_location(apps, descriptor)
    original_source = source_path.read_text()
    parameters = job.get("parameters", {})
    prepared = prepare_source(original_source, benchmark, size, descriptor, parameters)
    _, adapter_patches = compatibility_fixes(original_source, benchmark) if builtin else (original_source, [])
    if collection:
        prepared, adapter_patches = prepare_collection(prepared, descriptor)
    work = runs / identifier
    work.mkdir(parents=True, exist_ok=False)
    temporary = work / "tmp"
    temporary.mkdir()
    env.update({"TMPDIR": str(temporary), "TMP": str(temporary), "TEMP": str(temporary)})
    # Each process gets a private complete copy of its profile and generated source.
    for entry in profile_folder.iterdir():
        if entry.is_file():
            shutil.copy2(entry, work / entry.name)
    (work / "gpgpusim.config").write_text(text, encoding="utf-8")
    (work / "source.diff").write_text("".join(difflib.unified_diff(original_source.splitlines(True), prepared.splitlines(True), fromfile="original/"+descriptor["file"], tofile="experiment/"+descriptor["file"])), encoding="utf-8")
    if builtin or collection:
        entry_file = descriptor["file"]
        (work / entry_file).write_text(prepared, encoding="utf-8")
        if builtin:
            shutil.copy2(apps / PREFIX / "common/polybenchUtilFuncts.h", work)
        omitted_links = []
    else:
        root = Path(descriptor["sourceRoot"]).resolve()
        if not source_path.resolve().is_relative_to(root):
            raise ValueError("自定义入口已移出源码目录。")
        if work.is_relative_to(root):
            raise ValueError("实验保存目录位于自定义源码目录内，请选择独立的源码目录或实验目录。")
        omitted_links = []
        def ignore_source_files(folder, names):
            ignored = {name for name in names if name in {".git", "node_modules", "build", "__pycache__"}}
            for name in names:
                file = Path(folder) / name
                if file.is_symlink() and not file.resolve().is_relative_to(root):
                    ignored.add(name)
                    omitted_links.append(file.relative_to(root).as_posix())
            return ignored
        shutil.copytree(root, work / "src", symlinks=True, ignore=ignore_source_files)
        for copied in (work / "src").rglob("*"):
            if copied.is_symlink() and os.path.isabs(os.readlink(copied)):
                target = copied.resolve().relative_to(root)
                destination = work / "src" / target
                copied.unlink()
                copied.symlink_to(os.path.relpath(destination, copied.parent))
        entry_file = "src/" + descriptor["file"]
        (work / entry_file).write_text(prepared, encoding="utf-8")
    args = [str(cuda / "bin/nvcc"), "-O3", "--cudart", "shared", "-gencode", f"arch=compute_{capability},code=compute_{capability}", entry_file, "-o", "benchmark"]
    arguments = validate_arguments(job.get("runtimeArgs", descriptor.get("args", [])))
    if builtin and arguments:
        raise ValueError("内置套件不支持自定义运行参数。")
    run_args = [arg.replace("{size}", str(size)) for arg in arguments]
    if collection:
        run_args = collection_arguments(descriptor, size, arguments)
    manifest = {"id": identifier, "createdAt": utc_now(), "benchmark": benchmark, "size": size, "profileId": profile_id,
                "cudaVersion": environment["cudaVersion"], "paths": paths, "simulator": environment["simulator"],
                "applications": environment["applications"], "setupScript": setup, "compileCommand": args,
                "temporaryDirectory": str(temporary),
                "sourceSHA256": hash_file(source_path), "preparedSourceSHA256": hash_file(work / entry_file),
                "configSHA256": hash_file(work / "gpgpusim.config"), "adapterVersion": 3, "clockMHz": clock_mhz,
                "parameters": parameters, "effectiveDimensions": {m: parameters.get(m, size) for m in descriptor["macros"]},
                "baseProfileId": base_profile_id, "profileName": job.get("profileName", profile_id),
                "canvasId": job.get("canvasId"), "canvasName": job.get("canvasName"), "canvasEdgeId": job.get("canvasEdgeId"), "benchmarkNodeId": job.get("benchmarkNodeId"), "gpuNodeId": job.get("gpuNodeId"),
                "benchmarkName": descriptor["name"], "scaleMacros": descriptor["macros"],
                "adapterPatches": adapter_patches, "cpuAffinity": affinity, "cpuTopology": environment["cpu"],
                "omittedExternalSourceLinks": omitted_links,
                "benchmarkSuite": descriptor.get("suite", "PolyBench/GPU" if builtin else "自定义程序"),
                "upstreamSource": {"url": descriptor.get("repoURL", "https://github.com/accel-sim/gpu-app-collection.git"), "path": descriptor.get("sourceDir"), "catalogCommit": descriptor.get("catalogCommit")},
                "customSource": None if builtin or collection else {"root": descriptor["sourceRoot"], "repository": git_info(Path(descriptor["sourceRoot"])), "url": descriptor.get("repoURL", ""), "ref": descriptor.get("ref", "")},
                "runArguments": run_args, "repeatIndex": job.get("repeatIndex", 1), "repeatCount": job.get("repeatCount", 1)}
    save_json(work / "manifest.json", manifest)
    emit("prepared", workDir=str(work), manifest=manifest)
    minutes = float(job.get("wallMinutes", 30))
    if not 0.01 <= minutes <= 10080:
        raise ValueError("运行时间上限须在 0.01–10080 分钟之间")
    deadline = time.monotonic() + minutes * 60
    started = time.monotonic()
    try:
        compiled = run_command(args, work, env, work / "compile.log", "compiling", cancel, deadline)
        if compiled:
            result = {"status": "failed", "correctness": "unknown", "metrics": {}, "error": "benchmark 编译失败，请查看编译日志。", "exitCode": compiled}
        else:
            links = command_output(["ldd", str(work / "benchmark")], env=env)
            cudart = next((line for line in links.splitlines() if "libcudart.so" in line), "")
            if str(sim) not in cudart or "not found" in cudart:
                raise ValueError("benchmark 没有链接到当前模拟器运行库，已停止运行。")
            parser = LogParser()
            code = run_command([str(work / "benchmark"), *run_args], work, env, work / "sim.log", "running", cancel, deadline, parser, affinity=affinity)
            result = parser.result(code, max_cycles, allow_unverified=not (builtin or collection))
            result["exitCode"] = code
            if result["status"] == "completed" and clock_mhz > 0:
                result["metrics"]["modeledTimeMs"] = result["metrics"]["cycles"] / (clock_mhz * 1000)
    except Stopped as exc:
        result = {"status": exc.status, "correctness": "unknown", "metrics": {}}
    except Exception as exc:
        result = {"status": "failed", "correctness": "unknown", "metrics": {}, "error": str(exc)}
    result.update({"elapsedSeconds": round(time.monotonic() - started, 3), "workDir": str(work), "finishedAt": utc_now(), "cpuAffinity": affinity})
    save_json(work / "manifest.json", manifest)
    try:
        result["profile"] = build_report(work, result)
        save_json(work / "profile.json", result["profile"])
    except (OSError, ValueError) as exc:
        result["profile"] = {"schemaVersion": 1, "kernels": [], "reason": "性能报告读取失败：" + str(exc)}
    save_json(work / "result.json", result)
    emit("done", result=result)


def read_artifact(request):
    root = absolute_path(request["runsRoot"])
    work = absolute_path(request["workDir"])
    if not work.is_relative_to(root):
        raise ValueError("任务目录不在当前实验根目录内")
    name = request.get("name", "sim.log")
    if name not in {"sim.log", "compile.log", "manifest.json", "gpgpusim.config", "result.json", "profile.json", "source.diff"}:
        raise ValueError("不支持的文件")
    path = work / name
    if not path.resolve().is_relative_to(root):
        raise ValueError("文件不在实验目录内")
    if not path.is_file():
        return {"text": "文件尚未生成。"}
    with path.open("rb") as file:
        length = file.seek(0, 2)
        file.seek(max(0, length - 200000))
        text = file.read().decode("utf-8", errors="replace")
    return {"text": ("[仅显示文件末尾 200 KB]\n" if length > 200000 else "") + text}


def read_profile(request):
    root = absolute_path(request["runsRoot"])
    work = absolute_path(request["workDir"])
    if not work.is_relative_to(root):
        raise ValueError("任务目录不在当前实验根目录内")
    # Unlike the log viewer, parse the entire log, not its last 200 KB.
    for name in ("sim.log", "gpgpusim.config", "result.json", "gpgpu_inst_stats.txt"):
        if not (work / name).resolve().is_relative_to(work):
            raise ValueError("报告文件不在实验目录内")
    result_path = work / "result.json"
    result = json.loads(result_path.read_text()) if result_path.is_file() else {}
    return build_report(work, result)


def main():
    request = json.loads(sys.stdin.readline())
    operation = request.get("op")
    if operation == "inspect":
        emit("response", result=inspect_environment(request.get("environment", {})))
    elif operation == "read":
        emit("response", result=read_artifact(request))
    elif operation == "profile":
        emit("response", result=read_profile(request))
    elif operation == "remove-custom":
        apps = absolute_path(request["environment"]["appsRoot"])
        entries = load_custom(apps)
        identifier = request["id"]
        save_custom(apps, [e for e in entries if e["id"] != identifier])
        emit("response", result={"removed": identifier})
    elif operation in {"run", "deploy", "install-benchmarks", "add-custom"}:
        cancel = threading.Event()

        def listen():
            for line in sys.stdin:
                try:
                    if json.loads(line).get("op") == "cancel":
                        cancel.set()
                except json.JSONDecodeError:
                    continue
            # A desktop exit/crash closes stdin; terminate owned simulator processes.
            cancel.set()

        threading.Thread(target=listen, daemon=True).start()
        try:
            if operation == "run":
                run_job(request, cancel)
            else:
                from operations import execute
                result = execute(request, cancel, emit, run_command, absolute_path, inspect_environment)
                save_json(Path(result["workDir"]) / "result.json", result)
                emit("done", result=result)
        except Stopped as exc:
            emit("done", result={"status": exc.status, "metrics": {}, "correctness": "unknown"})
    else:
        raise ValueError("不支持的操作")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit("error", message=str(error))
        sys.exit(1)
