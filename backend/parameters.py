"""Explicit, source-backed benchmark knobs for modular experiments."""
import re


def editable_parameters(descriptor, source):
    result = []
    if descriptor.get("kind") == "custom" or descriptor.get("folder") == "GEMM":
        result.extend({"key": m, "label": {"NI": "输出行数 / M", "NJ": "输出列数 / N", "NK": "归约维度 / K"}.get(m, m),
                       "group": "dimensions", "min": descriptor.get("minSize", 1), "max": 4096}
                      for m in descriptor.get("macros", []))
    for key, value in re.findall(r"^\s*#\s*define\s+(DIM_THREAD_BLOCK\w*)\s+(\d+)\b", source, re.M):
        result.append({"key": key, "label": key.replace("DIM_THREAD_BLOCK", "线程块").replace("_KERNEL_", " Kernel ").replace("_", " "),
                       "group": "launch", "min": 1, "max": 1024, "default": int(value)})
    return result


def validate_parameters(descriptor, source, parameters):
    if not isinstance(parameters, dict):
        raise ValueError("程序参数应为名称与整数值的映射。")
    schema = {p["key"]: p for p in editable_parameters(descriptor, source)}
    for key, value in parameters.items():
        field = schema.get(key)
        if not field or type(value) is not int or not field["min"] <= value <= field["max"]:
            raise ValueError(f"程序参数 {key} 无效或当前适配器不支持。")
    blocks = {}
    for key, field in schema.items():
        if field["group"] != "launch":
            continue
        prefix = re.sub(r"_[XYZ]$", "", key)
        blocks[prefix] = blocks.get(prefix, 1) * parameters.get(key, field["default"])
    if any(value > 1024 for value in blocks.values()):
        raise ValueError("每个线程块的线程总数不能超过 1024。")
    return parameters


def validate_arguments(arguments):
    if not isinstance(arguments, list) or len(arguments) > 30 or not all(isinstance(a, str) and len(a) < 500 and "\x00" not in a for a in arguments):
        raise ValueError("运行参数无效；每行一个参数，最多 30 项。")
    return arguments
