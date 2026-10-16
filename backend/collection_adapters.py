"""Small, explicit adapters for upstream Rodinia kernels; originals stay untouched."""
import re


def replace_once(source, anchor, replacement):
    if source.count(anchor) != 1:
        raise ValueError("当前上游源码不符合 Rodinia 适配器格式，已停止运行。")
    return source.replace(anchor, replacement, 1)


def prepare_collection(source, descriptor):
    adapter = descriptor.get("adapter")
    if adapter == "rodinia-pathfinder":
        anchor = "    cudaMemcpy(result, gpuResult[final_ret], sizeof(int)*cols, cudaMemcpyDeviceToHost);"
        check = r'''
    // GPGPU Studio: independent serial dynamic-programming reference on original input.
    int *studio_ref = new int[cols], *studio_next = new int[cols];
    for (int j = 0; j < cols; ++j) studio_ref[j] = data[j];
    for (int i = 1; i < rows; ++i) {
        for (int j = 0; j < cols; ++j) {
            int best = studio_ref[j];
            if (j > 0 && studio_ref[j-1] < best) best = studio_ref[j-1];
            if (j+1 < cols && studio_ref[j+1] < best) best = studio_ref[j+1];
            studio_next[j] = best + data[i*cols+j];
        }
        int *swap = studio_ref; studio_ref = studio_next; studio_next = swap;
    }
    int studio_mismatches = 0;
    cudaError_t studio_error = cudaGetLastError();
    for (int j = 0; j < cols; ++j) if (studio_ref[j] != result[j]) ++studio_mismatches;
    if (studio_error != cudaSuccess) ++studio_mismatches;
    printf("Non-Matching CPU-GPU Outputs (exact integer reference): %d\n", studio_mismatches);
    delete [] studio_ref; delete [] studio_next;
'''
        source = replace_once(source, anchor, anchor + check)
        source = re.sub(r"^\s*#define BENCH_PRINT\s*$", "// GPGPU Studio: suppress full input/output matrix printing.", source, flags=re.M)
        return source, ["rodinia-pathfinder:serial-cpu-reference", "suppress-matrix-print"]
    if adapter == "rodinia-gaussian":
        source = replace_once(source, "    ForwardSub();", """    // GPGPU Studio: preserve the original system for an independent residual check.
    float *studio_a = (float*)malloc(Size*Size*sizeof(float));
    float *studio_b = (float*)malloc(Size*sizeof(float));
    memcpy(studio_a, a, Size*Size*sizeof(float));
    memcpy(studio_b, b, Size*sizeof(float));
    ForwardSub();""")
        check = r'''
    // GPGPU Studio: check original A*x=b; scaled absolute tolerance 1e-3.
    int studio_mismatches = 0;
    for (int i = 0; i < Size; ++i) {
        double sum = 0.0, magnitude = fabs((double)studio_b[i]);
        for (int j = 0; j < Size; ++j) {
            double term = (double)studio_a[i*Size+j] * finalVec[j];
            sum += term; magnitude += fabs(term);
        }
        if (!isfinite(sum) || fabs(sum-studio_b[i]) > 1e-3*fmax(1.0, magnitude)) ++studio_mismatches;
    }
    if (cudaGetLastError() != cudaSuccess) ++studio_mismatches;
    printf("Non-Matching CPU-GPU Outputs (original-system residual): %d\n", studio_mismatches);
    free(studio_a); free(studio_b);
'''
        source = replace_once(source, "    BackSub();", "    BackSub();" + check)
        # The original prints finalVec after BackSub, so release it at the original cleanup.
        source = replace_once(source, "    free(m);", "    free(finalVec);\n    free(m);")
        return source.replace("cudaThreadSynchronize()", "cudaDeviceSynchronize()"), ["rodinia-gaussian:original-system-residual", "cuda-sync-api"]
    raise ValueError("此条目目前只接入源码下载，尚未完成运行适配。")


def collection_arguments(descriptor, size, requested):
    expected = descriptor["args"]
    if requested and requested != expected:
        raise ValueError("内置 Rodinia 参数使用已验证的规模模板，请通过规模输入调整矩阵大小。")
    return [arg.replace("{size}", str(size)) for arg in expected]
