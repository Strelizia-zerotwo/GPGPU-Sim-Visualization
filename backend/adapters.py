"""Documented fixes applied to experiment copies of legacy PolyBench/GPU CUDA."""
import re

ACCUMULATORS = {
    "2mm": [("mm2_kernel1", ["C[i * NJ + j]"]), ("mm2_kernel2", ["E[i * NL + j]"])],
    "3mm": [("mm3_kernel1", ["E[i * NJ + j]"]), ("mm3_kernel2", ["F[i * NL + j]"]), ("mm3_kernel3", ["G[i * NL + j]"])],
    "atax": [("atax_kernel1", ["tmp[i]"]), ("atax_kernel2", ["y[j]"])],
    "gesummv": [("gesummv_kernel", ["tmp[i]", "y[i]"])],
}


def initialize_kernel(source, name, targets):
    match = re.search(r"__global__\s+void\s+" + re.escape(name) + r"\s*\([^{}]*\)\s*\{", source)
    if not match:
        raise ValueError(f"无法定位 {name}；当前源码版本不符合适配器格式。")
    begin = match.end()
    depth, end = 1, begin
    while depth and end < len(source):
        if source[end] == "{": depth += 1
        elif source[end] == "}": depth -= 1
        end += 1
    body = source[begin:end - 1]
    declaration = re.search(r"\bint\s+\w+\s*;", body)
    if not declaration:
        raise ValueError(f"无法定位 {name} 的累加循环。")
    missing = [target for target in targets if not re.search(re.escape(target).replace(r"\ ", r"\s*") + r"\s*=\s*0(?:\.0)?[fF]?\s*;", body[:declaration.start()])]
    if not missing:
        return source, False
    insertion = "// GPGPU Studio: initialize accumulators as in the CPU reference.\n\t\t" + "\n\t\t".join(target + " = 0.0f;" for target in missing) + "\n\t\t"
    body = body[:declaration.start()] + insertion + body[declaration.start():]
    return source[:begin] + body + source[end - 1:], True


def compatibility_fixes(source, benchmark):
    patches = []
    if benchmark == "gemm":
        # j uses the X axis (NJ), i uses Y (NI). The upstream grid swaps them.
        grid = r"dim3\s+grid\(\(size_t\)\(ceil\(\s*\(\(float\)NI\)/\s*\(\(float\)block\.x\)\s*\)\),\s*\(size_t\)\(ceil\(\s*\(\(float\)NJ\)/\s*\(\(float\)block\.y\)\s*\)\)\);"
        source, count = re.subn(grid, "dim3 grid((NJ + block.x - 1) / block.x, (NI + block.y - 1) / block.y);", source)
        if count:
            patches.append("fix-grid-axes:gemm")
    for kernel, targets in ACCUMULATORS.get(benchmark, []):
        source, changed = initialize_kernel(source, kernel, targets)
        if changed: patches.append("initialize-accumulators:" + kernel)
    if benchmark == "gesummv":
        # Upstream initializes A/x, but leaves the input matrix B uninitialized.
        marker = "\tGPU_argv_init();"
        if source.count(marker) != 1:
            raise ValueError("GESUMMV 初始化位置不符合适配器格式。")
        source = source.replace(marker, "\t// GPGPU Studio: use the same deterministic input pattern for B as A.\n\tfor (int studio_i = 0; studio_i < N * N; ++studio_i) B[studio_i] = A[studio_i];\n" + marker)
        patches.append("initialize-input-matrix:B")
    if benchmark in {"corr", "covar"}:
        # Legacy code rounds M first, then divides/truncates, giving grid=0 below a block.
        pattern = r"ceil\(\(float\)\(?(M|N)\)?\)\s*/\s*\(\(float\)(DIM_THREAD_BLOCK_KERNEL_\d+_[XY])\)"
        def rounded(match):
            dimension, block = match.groups()
            if benchmark == "covar" and dimension == "N" and block == "DIM_THREAD_BLOCK_KERNEL_2_X":
                block = "DIM_THREAD_BLOCK_KERNEL_2_Y"
                patches.append("fix-grid-y-axis:covariance")
            return f"(({dimension} + {block} - 1) / {block})"
        source, count = re.subn(pattern, rounded, source)
        if count: patches.append("round-grid-up:" + str(count))
    return source, patches
