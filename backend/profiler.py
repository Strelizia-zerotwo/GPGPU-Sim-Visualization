"""Source-backed GPGPU-Sim reports. No dependence on host wall time or GPU names.

Cache/DRAM counters are cumulative snapshots; interval counters are differences.
PTX line exec_count counts threads (also predicated-off threads in this version),
so predicated arithmetic is deliberately not reported as a measured FLOP count.
"""
from pathlib import Path
import re

NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
CACHES = ("L1D", "L1I", "L1C", "L1T", "L2")


def config_values(text):
    return dict(re.findall(r"^\s*(-\S+)\s+([^#\n]+)", text, re.M))


def model(text):
    c = config_values(text)
    def nums(key, sep=None):
        try:
            return [float(x) for x in c[key].strip().split(sep)]
        except (KeyError, ValueError):
            return []
    def val(key):
        n = nums(key)
        return n[0] if n else None
    clocks = nums("-gpgpu_clock_domains", ":")
    pipeline = nums("-gpgpu_shader_core_pipeline", ":")
    widths = nums("-gpgpu_pipeline_widths", ",")
    fp = nums("-ptx_opcode_initiation_fp", ",")
    clusters, cores = val("-gpgpu_n_clusters"), val("-gpgpu_n_cores_per_cluster")
    sms = clusters * cores if clusters and cores else None
    sp = val("-gpgpu_num_sp_units")
    peak = None
    if sms and sp and len(pipeline) == 2 and len(fp) >= 4 and fp[3] > 0 and len(widths) >= 6 and clocks and clocks[0] > 0:
        # Ideal all-lanes FP32 FMA issue ceiling, bounded by SP initiation and
        # the ID_OC_SP / OC_EX_SP widths. It is not a calibrated hardware peak.
        rate = min(sp / fp[3], widths[0], widths[5])
        sched = val("-gpgpu_num_sched_per_core")
        issue = val("-gpgpu_max_insn_issue_per_warp")
        if sched:
            rate = min(rate, sched * (issue or 1))
        peak = sms * pipeline[1] * 2 * rate * clocks[0] / 1000
    channels, bus = val("-gpgpu_n_mem"), val("-gpgpu_dram_buswidth")
    burst, ratio = val("-gpgpu_dram_burst_length"), val("-dram_data_command_freq_ratio")
    chips = val("-gpgpu_n_mem_per_ctrlr")
    bandwidth = None
    # Multiple devices per controller need additional topology semantics.
    if channels and bus and ratio and len(clocks) == 4 and (chips is None or chips == 1):
        bandwidth = channels * bus * ratio * clocks[3] / 1000
    return {"sms": sms, "clockMHz": clocks[0] if clocks else None,
            "peakFp32Gflops": peak, "peakDramGBs": bandwidth,
            "dramBytesPerCommand": bus * burst if bus and burst else None,
            "memoryChannels": channels,
            "memcpyWarmsCache": c.get("-gpgpu_perf_sim_memcpy", "").strip() == "1",
            "computeFormula": "SM 数 × warp 宽度 × 2 × min(SP 数/FMA 启动间隔, SP 流水线宽度, 调度器发射上限) × 核心 GHz",
            "memoryFormula": "内存控制器数 × 总线字节宽度 × 数据/命令频率比 × DRAM GHz"}


def parse_snapshots(lines):
    snapshots, current, dram_id = [], None, None
    for line_no, line in enumerate(lines, 1):
        m = re.match(r"\s*kernel_name\s*=\s*(.*)", line)
        if m:
            if current:
                snapshots.append(current)
            current = {"name": m[1].strip(), "values": {}, "dram": {}, "cores": {}, "line": line_no}
            dram_id = None
            continue
        if current is None:
            continue
        if re.match(r"\s*kernel_launch_uid\s*=", line):
            current["uids"] = line.split("=", 1)[1].split()
        scalar = re.match(r"\s*([\w]+)\s*=\s*(" + NUMBER + r")", line)
        if scalar:
            current["values"][scalar[1]] = float(scalar[2])
        d = re.match(r"DRAM\[(\d+)\]:", line)
        if d:
            dram_id = d[1]
        if line.startswith("n_cmd=") and dram_id is not None:
            current["dram"][dram_id] = {k: float(v) for k, v in re.findall(r"(n_cmd|n_rd|n_write|n_req|bw_util)=(" + NUMBER + ")", line)}
            dram_id = None
        core = re.search(r"L1D_cache_core\[(\d+)\]: Access = (\d+), Miss = (\d+),.*Pending_hits = (\d+), Reservation_fails = (\d+)", line)
        if core:
            current["cores"][core[1]] = dict(zip(("accesses", "misses", "pending", "reservationFails"), map(int, core.groups()[1:])))
    if current:
        snapshots.append(current)
    # Periodic snapshots of the same execution group replace earlier snapshots.
    unique = {}
    for s in snapshots:
        if "gpu_sim_cycle" not in s["values"]:
            continue
        key = tuple(s.get("uids", [])) or (s["name"], s["values"].get("gpu_tot_sim_cycle"))
        unique[key] = s
    return list(unique.values())


def delta(now, before, key):
    if key not in now:
        return None
    if key not in before:
        return now[key]
    value = now[key] - before[key]
    return value if value >= 0 else None


def cache_report(now, before, prefix):
    names = {"accesses": "accesses", "misses": "misses", "pending": "pending_hits", "reservationFails": "reservation_fails"}
    values = {k: delta(now, before, prefix + "_total_cache_" + v) for k, v in names.items()}
    return finish_cache(values)


def finish_cache(v):
    a, m, p = v.get("accesses"), v.get("misses"), v.get("pending")
    valid = a is not None and m is not None and 0 <= m <= a
    v["nonMissRate"] = (a - m) / a * 100 if valid and a else None
    v["hitRate"] = (a - m - p) / a * 100 if valid and a and p is not None and 0 <= p <= a - m else None
    v["pendingRate"] = p / a * 100 if valid and a and p is not None and 0 <= p <= a - m else None
    v["missRate"] = m / a * 100 if valid and a else None
    return v


def fp32_counts(work):
    """Join exact PTX source filenames/lines to cumulative thread exec counts.

    Counts are attributed to symbols, not divided among repeated launches.
    Unsupported or predicated FP32 arithmetic makes that symbol unavailable.
    """
    stats = work / "gpgpu_inst_stats.txt"
    if not stats.is_file():
        return {}, "缺少逐 PTX 行执行计数 gpgpu_inst_stats.txt"
    files, counts, invalid = {}, {}, set()
    for line in stats.read_text(errors="replace").splitlines():
        m = re.match(r"(.+?)\s+(\d+)\s*:\s*(\d+)\s", line)
        if not m:
            continue
        filename, lineno, count = m[1], int(m[2]), int(m[3])
        if not count:
            continue
        if filename not in files:
            # Resolve only within the isolated experiment; never search by a
            # similar basename and never read arbitrary logged absolute paths.
            target = (work / filename).resolve()
            if not target.is_relative_to(work.resolve()) or not target.is_file():
                return {}, "逐行计数引用的 PTX 文件缺失或不在实验目录内"
            mapping, symbol = {}, None
            for n, source in enumerate(target.read_text(errors="replace").splitlines(), 1):
                if re.search(r"\.func\b", source):
                    symbol = None
                entry = re.search(r"\.entry\s+(\S+)\s*\(", source)
                if entry:
                    symbol = entry[1]
                mapping[n] = (symbol, source.strip())
            files[filename] = mapping
        if lineno not in files[filename]:
            return {}, "PTX 行号超出源码范围"
        symbol, instruction = files[filename][lineno]
        if not symbol:
            # Executed device functions cannot be assigned to their callers
            # from these aggregate line counters.
            return {}, "逐行计数包含无法归属 kernel 的设备函数"
        opcode = re.match(r"(?:@!?\S+\s+)?([a-z][\w.]*)", instruction)
        if not opcode:
            continue
        op = opcode[1].split(".")[0]
        if "f32" not in opcode[1].split("."):
            if op in {"mma", "wmma"}:
                invalid.add(symbol)
            continue
        if op in {"ld", "st", "mov", "cvt", "setp", "set", "selp", "abs", "neg", "min", "max"}:
            continue
        if instruction.startswith("@") or op not in {"add", "sub", "mul", "fma", "mad"}:
            invalid.add(symbol)
            continue
        counts[symbol] = counts.get(symbol, 0) + count * (2 if op in {"fma", "mad"} else 1)
    for symbol in invalid:
        counts[symbol] = None
    return counts, "仅统计无谓词标量 FP32 add/sub/mul/FMA/MAD；FMA/MAD 计 2 FLOP。谓词运算、特殊函数或 Tensor 指令需要额外计数。"


def build_report(work, result=None):
    work = Path(work)
    config = (work / "gpgpusim.config").read_text(errors="replace") if (work / "gpgpusim.config").is_file() else ""
    hardware = model(config)
    log = work / "sim.log"
    if not log.is_file():
        return {"schemaVersion": 1, "model": hardware, "kernels": [], "reason": "运行日志尚未生成"}
    with log.open(errors="replace") as stream:
        snapshots = parse_snapshots(stream)
    counts, count_note = fp32_counts(work)
    repeated = {}
    for s in snapshots:
        for name in s["name"].split():
            repeated[name] = repeated.get(name, 0) + 1
    kernels, previous = [], {"values": {}, "dram": {}, "cores": {}}
    for index, s in enumerate(snapshots):
        v, old = s["values"], previous["values"]
        cycles = v.get("gpu_sim_cycle")
        time_s = cycles / (hardware["clockMHz"] * 1e6) if cycles and hardware["clockMHz"] and hardware["clockMHz"] > 0 else None
        dram_commands = []
        for channel, counters in s["dram"].items():
            prior = previous["dram"].get(channel, {})
            rd, wr = delta(counters, prior, "n_rd"), delta(counters, prior, "n_write")
            dram_commands.append(rd + wr if rd is not None and wr is not None else None)
        concurrent = len(s["name"].split()) != 1 or len(s.get("uids", [])) != 1
        channels_complete = hardware["memoryChannels"] is not None and len(dram_commands) == hardware["memoryChannels"]
        bytes_ = sum(dram_commands) * hardware["dramBytesPerCommand"] if channels_complete and None not in dram_commands and hardware["dramBytesPerCommand"] else None
        flops = counts.get(s["name"]) if repeated.get(s["name"]) == 1 and not concurrent else None
        # Shared counters cannot be assigned to an individual concurrent kernel.
        caches = {p: cache_report(v, old, p) for p in CACHES}
        cores = [{"id": int(k), **finish_cache({field: delta(data, previous["cores"].get(k, {}), field) for field in data})} for k, data in s["cores"].items()]
        bw = bytes_ / time_s / 1e9 if bytes_ is not None and time_s else None
        gflops = flops / time_s / 1e9 if flops is not None and time_s else None
        warnings = []
        if concurrent:
            warnings.append("这一统计区间包含多个 kernel，展示区间合计，不能拆分单个 kernel。")
        if flops is None:
            warnings.append("无法独立归属完整 FP32 运算量；重复 kernel、谓词运算或缺失 PTX 计数均不生成 Roofline 点。")
        if bytes_ == 0:
            warnings.append("该区间 DRAM 读写命令为 0，DRAM 计算强度无定义；输入可能已由 memcpy 写入 L2。")
        if channels_complete and bytes_ is None:
            warnings.append("累计计数出现重置或缺少总线/突发配置，DRAM 流量无法计算。")
        tlbs = {}
        # Explicit extension contract; no heuristic conversion of page faults.
        for level in ("l1", "l2", "l3"):
            fields = {x: delta(v, old, f"{level}_tlb_{x}") for x in ("lookup", "hit", "miss")}
            if any(x is not None for x in fields.values()):
                valid = None not in fields.values() and fields["lookup"] == fields["hit"] + fields["miss"]
                tlbs[level.upper()] = {**fields, "hitRate": fields["hit"] / fields["lookup"] * 100 if valid and fields["lookup"] else None}
        kernel = {"id": ":".join(s.get("uids", [])) or str(index + 1), "name": s["name"], "scope": "interval" if concurrent else "kernel",
                  "logLine": s["line"], "cycles": cycles, "instructions": v.get("gpu_sim_insn"), "ipc": v.get("gpu_ipc"),
                  "timeMs": time_s * 1000 if time_s else None, "occupancyPct": v.get("gpu_occupancy"),
                  "fp32Flops": flops, "fp32Gflops": gflops, "dramBytes": bytes_, "dramGBs": bw,
                  "intensity": flops / bytes_ if flops is not None and bytes_ and not concurrent else None,
                  "computePct": gflops / hardware["peakFp32Gflops"] * 100 if gflops is not None and hardware["peakFp32Gflops"] else None,
                  "memoryPct": bw / hardware["peakDramGBs"] * 100 if bw is not None and hardware["peakDramGBs"] else None,
                  "caches": caches, "cores": cores, "tlbs": tlbs, "warnings": warnings,
                  "cumulativeCycles": v.get("gpu_tot_sim_cycle"), "l2ReplyGBs": v.get("L2_BW"),
                  "raw": v, "dramChannels": s["dram"]}
        kernels.append(kernel)
        previous = s
    return {"schemaVersion": 1, "model": hardware, "kernels": kernels,
            "status": (result or {}).get("status", "unknown"), "flopNote": count_note,
            "counterNote": "缓存为累计快照差分；直接命中 = 访问 − 未命中 − pending，pending 单列。DRAM 字节数 = Δ(读命令+写命令) × 总线字节宽度 × burst 长度。",
            "scopeNote": "模拟配置与模拟执行结果；峰值线为配置推导的理想上限。主机运行耗时不参与吞吐或 Roofline。"}
