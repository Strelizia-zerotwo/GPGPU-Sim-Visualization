"""CUDA ecosystem source catalog, executable adapters, and custom registrations."""
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlparse
from parameters import editable_parameters

APPS_URL = "https://github.com/accel-sim/gpu-app-collection.git"
PREFIX = "src/cuda/polybench-gpu-1.0"


BENCHMARKS = json.loads((Path(__file__).parent / "polybench.json").read_text(encoding="utf-8"))
COLLECTIONS = json.loads((Path(__file__).parent / "collections.json").read_text(encoding="utf-8"))
BUILTINS = {**BENCHMARKS, **COLLECTIONS}


def source_location(apps_root, descriptor):
    apps = Path(apps_root)
    if descriptor["kind"] == "builtin":
        return apps / PREFIX / "CUDA" / descriptor["folder"] / descriptor["file"]
    if descriptor["kind"] == "collection":
        return apps / descriptor["sourceDir"] / (descriptor.get("file") or descriptor["markerFile"])
    return Path(descriptor["sourceRoot"]) / descriptor["file"]


def download_paths(identifiers):
    if not identifiers or any(i not in BUILTINS for i in identifiers):
        raise ValueError("请选择 Benchmark 商店中的程序或套件。")
    folders = set()
    for identifier in identifiers:
        descriptor = BUILTINS[identifier]
        if descriptor["kind"] == "builtin":
            folders.update([PREFIX + "/common", PREFIX + "/CUDA/" + descriptor["folder"]])
        else:
            folders.add(descriptor["sourceDir"])
            # Keep shared source/build support beside per-program downloads.
            for prefix, dependencies in {
                "src/cuda/rodinia/3.1/": ["src/cuda/rodinia/3.1/common"],
                "src/cuda/parboil/": ["src/cuda/parboil/common", "src/cuda/parboil/driver"],
                "src/cuda/lonestargpu-2.0/": ["src/cuda/lonestargpu-2.0/include"],
                "src/cuda/pannotia/": ["src/cuda/pannotia/common", "src/cuda/pannotia/graph_parser"],
                "src/cuda/shoc-master/": ["src/cuda/shoc-master/src/common"],
                "src/cuda/ispass-2009/": ["src/cuda/ispass-2009/LIB"],
                "src/cuda/NVIDIA_CUDA-11.0_Samples/": ["src/cuda/NVIDIA_CUDA-11.0_Samples/common"],
            }.items():
                if descriptor["sourceDir"].startswith(prefix):
                    folders.update(dependencies)
    return sorted(folders)


def registry_path(apps_root):
    apps = Path(apps_root).expanduser().resolve()
    key = hashlib.sha256(str(apps).encode()).hexdigest()[:12]
    return apps.parent / ".gpgpu-studio" / f"catalog-{key}.json"


def load_custom(apps_root):
    file = registry_path(apps_root)
    if not file.is_file():
        return []
    try:
        return json.loads(file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        raise ValueError(f"自定义程序列表读取失败：{error}")


def save_custom(apps_root, entries):
    file = registry_path(apps_root)
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_suffix(".tmp")
    temporary.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(file)


def descriptors(apps_root):
    entries = dict(BUILTINS)
    for custom in load_custom(apps_root):
        entries[custom["id"]] = custom
    return entries


def catalog(apps_root):
    apps = Path(apps_root)
    result = []
    for identifier, descriptor in descriptors(apps).items():
        source = source_location(apps, descriptor)
        downloaded = source.is_file()
        if descriptor.get("submodule"):
            root = apps / descriptor["sourceDir"]
            downloaded = root.is_dir() and any(p.name != ".git" for p in root.iterdir())
        runnable = descriptor.get("runnable", True)
        available = downloaded and runnable
        if descriptor["kind"] == "builtin":
            available &= (apps / PREFIX / "common/polybenchUtilFuncts.h").is_file()
            downloaded = available
        result.append({**descriptor, "id": identifier, "suite": descriptor.get("suite", "PolyBench/GPU" if descriptor["kind"] == "builtin" else "自定义程序"),
                       "source": str(source), "available": available, "downloaded": downloaded, "runnable": runnable,
                       "parameters": editable_parameters(descriptor, source.read_text()) if available else [],
                       "adaptationNote": descriptor.get("requirements") or ("包含初始化 / 网格修复，具体修改见任务的源码差异" if identifier in {"2mm","3mm","atax","gesummv","corr","covar"} else "规模设置与 CUDA 同步 API 适配"),
                       "sourceURL": descriptor.get("repoURL", APPS_URL if descriptor["kind"] in {"builtin", "collection"} else "本地源码"),
                       "sizeLabel": " = ".join(descriptor.get("macros", [])) if descriptor["mode"] == "macros" else "运行参数中的 {size}"})
    return result


def validate_github_url(value):
    parsed = urlparse(value.strip())
    if parsed.scheme != "https" or parsed.hostname != "github.com" or parsed.query or parsed.fragment or parsed.username or parsed.password or parsed.port:
        raise ValueError("请输入公开 GitHub 仓库的 HTTPS 地址，例如 https://github.com/组织/仓库.git")
    if not re.fullmatch(r"/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?/?", parsed.path):
        raise ValueError("请填写仓库首页地址，不要填写文件或目录的网页地址。")
    return "https://github.com" + parsed.path.rstrip("/")


def validate_ref(value):
    if value and (not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_./-]{0,199}", value) or ".." in value):
        raise ValueError("分支、标签或提交版本格式不正确。")
    return value


def validate_registration(spec, root):
    name = str(spec.get("name", "")).strip()
    if not name or len(name) > 80:
        raise ValueError("程序名称须为 1–80 个字符。")
    root = Path(root).expanduser().resolve()
    if not root.is_dir():
        raise ValueError("源码目录不存在。")
    if root == Path(root.anchor) or root == Path.home():
        raise ValueError("请选择单个程序的源码目录，不能使用根目录或整个用户目录。")
    file = str(spec.get("file", "")).strip()
    relative = Path(file)
    if relative.is_absolute() or ".." in relative.parts or relative.suffix != ".cu":
        raise ValueError("入口应为源码目录内的 .cu 相对路径，例如 CUDA/GEMM/gemm.cu。")
    source = (root / relative).resolve()
    if not source.is_relative_to(root) or not source.is_file():
        raise ValueError("没有找到源码目录内的 CUDA 入口文件。")
    mode = spec.get("mode", "macros")
    if mode not in {"macros", "arguments"}:
        raise ValueError("请选择编译宏或运行参数方式。")
    macros = spec.get("macros", [])
    if mode == "macros":
        if not macros or len(macros) > 20 or not all(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", m) for m in macros):
            raise ValueError("请输入合法的规模宏名称，例如 NI,NJ,NK。")
        text = source.read_text()
        for macro in macros:
            if len(re.findall(r"^\s*#\s*define\s+" + re.escape(macro) + r"\s+\d+\b", text, re.M)) != 1:
                raise ValueError(f"入口文件没有唯一的整数规模宏 {macro}。")
    arguments = spec.get("args", [])
    if not isinstance(arguments, list) or len(arguments) > 30 or not all(isinstance(a, str) and len(a) < 500 for a in arguments):
        raise ValueError("运行参数格式无效。")
    if mode == "arguments" and not any("{size}" in a for a in arguments):
        raise ValueError("运行参数中应包含 {size}，例如 --size {size}。")
    return {"name": name, "description": str(spec.get("description", "自定义 CUDA 程序"))[:200], "kind": "custom",
            "sourceRoot": str(root), "file": relative.as_posix(), "macros": macros if mode == "macros" else [],
            "mode": mode, "args": arguments, "minSize": 1}
