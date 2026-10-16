"""Linux CPU discovery and an exec wrapper; no external taskset dependency."""
import json
import os
from pathlib import Path
import sys

MARKER = "GPGPU_STUDIO_AFFINITY="


def inspect_cpu():
    supported = hasattr(os, "sched_getaffinity") and hasattr(os, "sched_setaffinity")
    try:
        cpus = sorted(os.sched_getaffinity(0)) if supported else list(range(os.cpu_count() or 1))
    except OSError:
        supported = False
        cpus = list(range(os.cpu_count() or 1))
    groups = {}
    topology_known = True
    for cpu in cpus:
        try:
            root = Path(f"/sys/devices/system/cpu/cpu{cpu}/topology")
            key = (int((root / "physical_package_id").read_text()), int((root / "core_id").read_text()))
            if min(key) < 0:
                raise ValueError("unknown topology")
        except (OSError, ValueError):
            topology_known = False
            key = ("unknown", cpu)
        groups.setdefault(key, []).append(cpu)
    # Use one logical CPU from each visible core before using SMT siblings.
    ordered = [group[level] for level in range(max(map(len, groups.values()), default=0))
               for group in groups.values() if level < len(group)]
    cores = len(groups) if topology_known else None
    budget = max(1, cores - 1) if cores is not None else max(1, len(cpus) // 2)
    try:
        is_wsl = "microsoft" in Path("/proc/sys/kernel/osrelease").read_text().lower()
    except OSError:
        is_wsl = False
    return {"availableCpuIds": cpus, "allocationOrder": ordered, "logicalCount": len(cpus),
            "visibleCoreCount": cores, "bindingSupported": supported, "isWSL": is_wsl,
            "recommendedConcurrency": min(32, budget),
            "recommendationBasis": "visible-cores" if cores is not None else "logical-fallback"}


def exec_bound(cpu, command):
    if cpu not in os.sched_getaffinity(0):
        raise ValueError(f"逻辑 CPU {cpu} 已不可用，请重新检测环境。")
    os.sched_setaffinity(0, {cpu})
    actual = sorted(os.sched_getaffinity(0))
    if actual != [cpu]:
        raise RuntimeError("CPU 绑定核验失败")
    # exec preserves affinity; subsequently created simulator threads inherit it.
    print(MARKER + json.dumps({"enabled": True, "cpuId": cpu, "actualCpuIds": actual, "processId": os.getpid(),
                               "verified": True}), flush=True)
    os.execvpe(command[0], command, os.environ)


if __name__ == "__main__":
    try:
        if len(sys.argv) < 4 or sys.argv[1] != "--exec":
            raise ValueError("Expected --exec CPU COMMAND [ARGS]")
        exec_bound(int(sys.argv[2]), sys.argv[3:])
    except Exception as exc:
        print("CPU 绑定启动失败：" + str(exc), file=sys.stderr, flush=True)
        sys.exit(1)
