"""User-requested source download and simulator build operations."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from uuid import uuid4
from catalog import (APPS_URL, PREFIX, BENCHMARKS, registry_path, load_custom,
                     save_custom, validate_registration, validate_github_url, validate_ref)

SIM_URL = "https://github.com/gpgpu-sim/gpgpu-sim_distribution.git"
SIM_REF = "c3eeb6d19016960ab66789efdd8a3200cc30222a"
DEPENDENCIES = ["git", "cmake", "g++", "bison", "flex", "make"]
DEPENDENCY_COMMAND = "sudo apt-get update && sudo apt-get install -y python3 git build-essential cmake bison flex zlib1g-dev libgl1-mesa-dev"


def check_dependencies():
    missing = [tool for tool in DEPENDENCIES if not shutil.which(tool)]
    header_roots = [Path("/usr/include"), Path("/usr/include/x86_64-linux-gnu"), Path("/usr/include/aarch64-linux-gnu")]
    for header, package in [("zlib.h", "zlib1g-dev"), ("GL/gl.h", "libgl1-mesa-dev")]:
        if not any((root / header).is_file() for root in header_roots):
            missing.append(package)
    return missing


def execute(request, cancel, emit, run_command, absolute_path, inspect_environment):
    settings = request.get("environment", {})
    operation = request["op"]
    apps = absolute_path(settings["appsRoot"])
    log_root = registry_path(apps).parent / "operations" / str(uuid4())
    log_root.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["PYTHONUNBUFFERED"] = "1"
    deadline = time.monotonic() + (3600 if operation == "deploy" else 600)
    sequence = 0
    emit("prepared", workDir=str(log_root))

    def command(args, cwd, stage):
        nonlocal sequence
        sequence += 1
        code = run_command(args, cwd, env, log_root / f"{sequence:02d}-{stage}.log", stage, cancel, deadline)
        if code:
            raise ValueError(f"{stage} 失败（退出码 {code}），请查看部署/下载日志。")

    def install(identifiers):
        if not identifiers or any(i not in BENCHMARKS for i in identifiers):
            raise ValueError("请选择 PolyBench CUDA 套件中的程序。")
        if not shutil.which("git"):
            raise ValueError("Linux 中未安装 git。请先安装编译依赖。")
        if not apps.exists():
            apps.parent.mkdir(parents=True, exist_ok=True)
            command(["git", "clone", "--progress", "--depth", "1", "--filter=blob:none", "--sparse", APPS_URL, str(apps)], apps.parent, "download")
        elif not (apps / ".git").exists():
            raise ValueError("目标目录已存在且不是 Git 仓库。请使用新的下载目录，或添加为自定义本地程序。")
        sparse = subprocess.run(["git", "-C", str(apps), "config", "--bool", "core.sparseCheckout"], capture_output=True, text=True)
        if sparse.stdout.strip() == "true":
            folders = [PREFIX + "/common"] + [PREFIX + "/CUDA/" + BENCHMARKS[i]["folder"] for i in identifiers]
            command(["git", "-C", str(apps), "sparse-checkout", "add", *folders], apps, "download")
        for identifier in identifiers:
            descriptor = BENCHMARKS[identifier]
            if not (apps / PREFIX / "CUDA" / descriptor["folder"] / descriptor["file"]).is_file():
                raise ValueError(f"当前仓库中没有 {descriptor['name']}。请检查下载日志或选择标准 gpu-app-collection 仓库。")
        emit("log", channel="download", text="已下载：" + ", ".join(identifiers) + "\n")

    if operation == "install-benchmarks":
        install(request.get("ids", []))
        return {"status": "completed", "installed": request["ids"], "workDir": str(log_root)}
    if operation == "add-custom":
        spec = request["spec"]
        repo_url = spec.get("repoURL", "").strip()
        if repo_url:
            repo_url = validate_github_url(repo_url)
            ref = validate_ref(spec.get("ref", "").strip())
            root = registry_path(apps).parent / "sources" / str(uuid4())
            root.parent.mkdir(parents=True, exist_ok=True)
            command(["git", "clone", "--progress", "--depth", "1", repo_url, str(root)], root.parent, "download")
            if ref:
                command(["git", "-C", str(root), "fetch", "--depth", "1", "origin", ref], root, "download")
                command(["git", "-C", str(root), "checkout", "--detach", "FETCH_HEAD"], root, "download")
        else:
            root = absolute_path(spec.get("sourceRoot", ""))
        try:
            descriptor = validate_registration(spec, root)
        except ValueError as error:
            files = [p.relative_to(root).as_posix() for p in root.rglob("*.cu")][:15]
            raise ValueError(str(error) + "\n源码位置：" + str(root) + ("\nCUDA 入口示例：" + ", ".join(files) if files else "")) from error
        descriptor.update({"id": "custom-" + str(uuid4()), "repoURL": repo_url, "ref": spec.get("ref", "")})
        entries = load_custom(apps)
        entries.append(descriptor)
        save_custom(apps, entries)
        return {"status": "completed", "added": descriptor["id"], "workDir": str(log_root)}
    if operation != "deploy":
        raise ValueError("不支持的维护操作")
    sim = absolute_path(settings["simRoot"])
    cuda = absolute_path(settings["cudaRoot"])
    if not (cuda / "bin/nvcc").is_file():
        raise ValueError("请先安装 CUDA Toolkit 或选择已有 CUDA 路径。部署会使用所选版本。")
    missing = check_dependencies()
    if missing:
        raise ValueError("缺少编译依赖：" + ", ".join(missing) + "。在教程中复制“安装编译依赖”命令后重新检测。")
    env["CUDA_INSTALL_PATH"] = str(cuda)
    env["PATH"] = str(cuda / "bin") + ":" + env.get("PATH", "")
    if not sim.exists():
        sim.parent.mkdir(parents=True, exist_ok=True)
        sim.mkdir()
        (sim / ".studio-deploy.json").write_text(json.dumps({"url": SIM_URL, "ref": SIM_REF}), encoding="utf-8")
        command(["git", "init", str(sim)], sim.parent, "clone")
        with (sim / ".git/info/exclude").open("a", encoding="utf-8") as file:
            file.write("\n/.studio-deploy.json\n/build-studio/\n")
        command(["git", "-C", str(sim), "remote", "add", "origin", SIM_URL], sim, "clone")
        command(["git", "-C", str(sim), "fetch", "--depth", "1", "origin", SIM_REF], sim, "clone")
        command(["git", "-C", str(sim), "checkout", "--detach", "FETCH_HEAD"], sim, "clone")
    elif not (sim / "CMakeLists.txt").is_file():
        # Resume a clone interrupted after git init/fetch, only for our official remote.
        remote = subprocess.run(["git", "-C", str(sim), "remote", "get-url", "origin"], capture_output=True, text=True)
        if remote.stdout.strip() != SIM_URL or not (sim / ".studio-deploy.json").is_file():
            raise ValueError("源码目标目录已存在。请选择新的空目录，避免覆盖已有文件。")
        command(["git", "-C", str(sim), "fetch", "--depth", "1", "origin", SIM_REF], sim, "clone")
        command(["git", "-C", str(sim), "checkout", "--detach", "FETCH_HEAD"], sim, "clone")
    # Use a separate build directory; source and pre-existing builds are preserved.
    build = sim / "build-studio"
    jobs = int(request.get("buildJobs", 2))
    if not 1 <= jobs <= 16:
        raise ValueError("编译并行数须为 1–16。")
    command(["cmake", "-S", str(sim), "-B", str(build), "-DCMAKE_BUILD_TYPE=Release", "-DCUDAToolkit_ROOT=" + str(cuda)], sim, "configure")
    command(["cmake", "--build", str(build), "--parallel", str(jobs)], sim, "build")
    command(["cmake", "--install", str(build)], sim, "install")
    if request.get("installGemm", True):
        install(["gemm"])
    info = inspect_environment(settings)
    if not info.get("simulatorReady"):
        raise ValueError("编译结束，但模拟器环境验证未通过：" + "；".join(info["issues"]))
    return {"status": "completed", "environment": info, "workDir": str(log_root)}
