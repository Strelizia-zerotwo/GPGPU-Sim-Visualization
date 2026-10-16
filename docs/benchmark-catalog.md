# Benchmark 商店目录

本目录基于 [accel-sim/gpu-app-collection](https://github.com/accel-sim/gpu-app-collection) 的 CUDA 文件树整理，收录依据为提交 [`dad09cb0487845edc7524ded814c6cde9f0ef6a1`](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda)。目录不是在线搜索结果；用户下载时沿用已有仓库版本。实际实验记录当前源码版本和文件哈希。

共 **156 个条目，27 个套件 / 来源分组**。其中有单个程序、kernel 变体和整套源码入口；条目数不等于独立算法数或已验证程序数。GPGPU-Sim / Accel-Sim 生态内各上游项目保留各自的作者、许可和引用要求。

**已接入运行**表示本工具提供编译、规模设置与结果处理路径，仍须以实际编译和检查结果判断成功。PolyBench 15 项沿用已有适配，新增 Rodinia Pathfinder 与 Gaussian 已在 CUDA 12.8 + GPGPU-Sim `c3eeb6d1` + A100 配置下验证。**待运行适配**表示仅接入源码下载和来源展示，不会出现在可运行实验中。

| 套件 / 来源 | 条目数 | 已接入运行数 |
| --- | ---: | ---: |
| AccelWattch Microbench | 6 | 0 |
| CUB | 1 | 0 |
| CUTLASS | 1 | 0 |
| Custom Apps | 1 | 0 |
| DOE Proxy Apps | 1 | 0 |
| DeepBench | 1 | 0 |
| Dragon Li | 1 | 0 |
| GPU Microbenchmark | 1 | 0 |
| GPUWattch Microbench | 6 | 0 |
| Hugging Face | 1 | 0 |
| ISPASS 2009 | 11 | 0 |
| LonestarGPU | 7 | 0 |
| MLPerf | 2 | 0 |
| Microbench | 1 | 0 |
| NVIDIA CUDA 11 Samples | 20 | 0 |
| NVIDIA CUDA Samples | 1 | 0 |
| Pannotia | 6 | 0 |
| Parboil | 11 | 0 |
| PolyBench/GPU | 15 | 15 |
| PyTorch | 1 | 0 |
| Rodinia 2.0 FT | 12 | 0 |
| Rodinia 3.1 | 30 | 2 |
| SHOC | 15 | 0 |
| Tensor Core | 1 | 0 |
| UVM Smart | 1 | 0 |
| cuDNN | 1 | 0 |
| vLLM | 1 | 0 |

## AccelWattch Microbench

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| branching_benchmarks | 待运行适配 | [src/cuda/accelwattch-ubench/branching_benchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/accelwattch-ubench/branching_benchmarks) |
| functional_benchmarks | 待运行适配 | [src/cuda/accelwattch-ubench/functional_benchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/accelwattch-ubench/functional_benchmarks) |
| memories_benchmarks | 待运行适配 | [src/cuda/accelwattch-ubench/memories_benchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/accelwattch-ubench/memories_benchmarks) |
| mix_benchmarks | 待运行适配 | [src/cuda/accelwattch-ubench/mix_benchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/accelwattch-ubench/mix_benchmarks) |
| static_power_modeling | 待运行适配 | [src/cuda/accelwattch-ubench/static_power_modeling](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/accelwattch-ubench/static_power_modeling) |
| tensor_benchmarks | 待运行适配 | [src/cuda/accelwattch-ubench/tensor_benchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/accelwattch-ubench/tensor_benchmarks) |

## CUB

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| CUB | 待运行适配 | [src/cuda/cub](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/cub) |

## CUTLASS

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| CUTLASS | 待运行适配 | [src/cuda/cutlass-bench](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/cutlass-bench) |

## Custom Apps

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| Custom Apps | 待运行适配 | [src/cuda/custom-apps](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/custom-apps) |

## DOE Proxy Apps

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| DOE Proxy Apps | 待运行适配 | [src/cuda/proxy-apps-doe](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/proxy-apps-doe) |

## DeepBench

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| DeepBench | 待运行适配 | [src/cuda/DeepBench](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/DeepBench) |

## Dragon Li

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| Dragon Li | 待运行适配 | [src/cuda/dragon_li](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/dragon_li) |

## GPU Microbenchmark

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| GPU Microbenchmark | 待运行适配 | [src/cuda/GPU_Microbenchmark](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/GPU_Microbenchmark) |

## GPUWattch Microbench

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| active_cores | 待运行适配 | [src/cuda/gpuwattch-ubench/active_cores](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/gpuwattch-ubench/active_cores) |
| branching_benchmarks | 待运行适配 | [src/cuda/gpuwattch-ubench/branching_benchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/gpuwattch-ubench/branching_benchmarks) |
| dram_benchmarks | 待运行适配 | [src/cuda/gpuwattch-ubench/dram_benchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/gpuwattch-ubench/dram_benchmarks) |
| functional_benchmarks | 待运行适配 | [src/cuda/gpuwattch-ubench/functional_benchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/gpuwattch-ubench/functional_benchmarks) |
| memories_benchmarks | 待运行适配 | [src/cuda/gpuwattch-ubench/memories_benchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/gpuwattch-ubench/memories_benchmarks) |
| mix_benchmarks | 待运行适配 | [src/cuda/gpuwattch-ubench/mix_benchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/gpuwattch-ubench/mix_benchmarks) |

## Hugging Face

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| Hugging Face | 待运行适配 | [src/cuda/huggingface](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/huggingface) |

## ISPASS 2009

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| AES | 待运行适配 | [src/cuda/ispass-2009/AES](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/AES) |
| BFS | 待运行适配 | [src/cuda/ispass-2009/BFS](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/BFS) |
| CP | 待运行适配 | [src/cuda/ispass-2009/CP](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/CP) |
| DG | 待运行适配 | [src/cuda/ispass-2009/DG](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/DG) |
| LPS | 待运行适配 | [src/cuda/ispass-2009/LPS](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/LPS) |
| MUM | 待运行适配 | [src/cuda/ispass-2009/MUM](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/MUM) |
| NN | 待运行适配 | [src/cuda/ispass-2009/NN](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/NN) |
| NQU | 待运行适配 | [src/cuda/ispass-2009/NQU](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/NQU) |
| RAY | 待运行适配 | [src/cuda/ispass-2009/RAY](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/RAY) |
| STO | 待运行适配 | [src/cuda/ispass-2009/STO](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/STO) |
| WP | 待运行适配 | [src/cuda/ispass-2009/WP](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/ispass-2009/WP) |

## LonestarGPU

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| bfs | 待运行适配 | [src/cuda/lonestargpu-2.0/apps/bfs](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/lonestargpu-2.0/apps/bfs) |
| bh | 待运行适配 | [src/cuda/lonestargpu-2.0/apps/bh](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/lonestargpu-2.0/apps/bh) |
| dmr | 待运行适配 | [src/cuda/lonestargpu-2.0/apps/dmr](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/lonestargpu-2.0/apps/dmr) |
| mst | 待运行适配 | [src/cuda/lonestargpu-2.0/apps/mst](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/lonestargpu-2.0/apps/mst) |
| pta | 待运行适配 | [src/cuda/lonestargpu-2.0/apps/pta](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/lonestargpu-2.0/apps/pta) |
| sp | 待运行适配 | [src/cuda/lonestargpu-2.0/apps/sp](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/lonestargpu-2.0/apps/sp) |
| sssp | 待运行适配 | [src/cuda/lonestargpu-2.0/apps/sssp](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/lonestargpu-2.0/apps/sssp) |

## MLPerf

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| MLPerf Training | 待运行适配 | [src/cuda/mlperf](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/mlperf) |
| MLPerf Inference | 待运行适配 | [src/cuda/mlperf_inference](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/mlperf_inference) |

## Microbench

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| CUDA Microbench | 待运行适配 | [src/cuda/microbench](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/microbench) |

## NVIDIA CUDA 11 Samples

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| SobolQRNG | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/SobolQRNG](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/SobolQRNG) |
| SobolQRNG_k1 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/SobolQRNG_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/SobolQRNG_k1) |
| binomialOptions | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/binomialOptions](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/binomialOptions) |
| binomialOptions_k1 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/binomialOptions_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/binomialOptions_k1) |
| cudaTensorCoreGemm | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/cudaTensorCoreGemm](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/cudaTensorCoreGemm) |
| cudaTensorCoreGemm_k1 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/cudaTensorCoreGemm_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/cudaTensorCoreGemm_k1) |
| dct8x8 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/dct8x8](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/dct8x8) |
| dct8x8_k1 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/dct8x8_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/dct8x8_k1) |
| dct8x8_k2 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/dct8x8_k2](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/dct8x8_k2) |
| fastWalshTransform | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/fastWalshTransform](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/fastWalshTransform) |
| fastWalshTransform_k1 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/fastWalshTransform_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/fastWalshTransform_k1) |
| fastWalshTransform_k2 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/fastWalshTransform_k2](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/fastWalshTransform_k2) |
| histogram | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/histogram](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/histogram) |
| histogram_k1 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/histogram_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/histogram_k1) |
| mergeSort | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/mergeSort](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/mergeSort) |
| mergeSort_k1 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/mergeSort_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/mergeSort_k1) |
| mergeSort_k2 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/mergeSort_k2](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/mergeSort_k2) |
| quasirandomGenerator | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/quasirandomGenerator](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/quasirandomGenerator) |
| quasirandomGenerator_k1 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/quasirandomGenerator_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/quasirandomGenerator_k1) |
| quasirandomGenerator_k2 | 待运行适配 | [src/cuda/NVIDIA_CUDA-11.0_Samples/quasirandomGenerator_k2](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/NVIDIA_CUDA-11.0_Samples/quasirandomGenerator_k2) |

## NVIDIA CUDA Samples

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| NVIDIA CUDA Samples | 待运行适配 | [src/cuda/cuda-samples](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/cuda-samples) |

## Pannotia

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| bc | 待运行适配 | [src/cuda/pannotia/bc](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/pannotia/bc) |
| color | 待运行适配 | [src/cuda/pannotia/color](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/pannotia/color) |
| fw | 待运行适配 | [src/cuda/pannotia/fw](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/pannotia/fw) |
| mis | 待运行适配 | [src/cuda/pannotia/mis](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/pannotia/mis) |
| pagerank | 待运行适配 | [src/cuda/pannotia/pagerank](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/pannotia/pagerank) |
| sssp | 待运行适配 | [src/cuda/pannotia/sssp](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/pannotia/sssp) |

## Parboil

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| bfs | 待运行适配 | [src/cuda/parboil/benchmarks/bfs](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/bfs) |
| cutcp | 待运行适配 | [src/cuda/parboil/benchmarks/cutcp](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/cutcp) |
| histo | 待运行适配 | [src/cuda/parboil/benchmarks/histo](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/histo) |
| lbm | 待运行适配 | [src/cuda/parboil/benchmarks/lbm](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/lbm) |
| mri-gridding | 待运行适配 | [src/cuda/parboil/benchmarks/mri-gridding](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/mri-gridding) |
| mri-q | 待运行适配 | [src/cuda/parboil/benchmarks/mri-q](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/mri-q) |
| sad | 待运行适配 | [src/cuda/parboil/benchmarks/sad](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/sad) |
| sgemm | 待运行适配 | [src/cuda/parboil/benchmarks/sgemm](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/sgemm) |
| spmv | 待运行适配 | [src/cuda/parboil/benchmarks/spmv](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/spmv) |
| stencil | 待运行适配 | [src/cuda/parboil/benchmarks/stencil](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/stencil) |
| tpacf | 待运行适配 | [src/cuda/parboil/benchmarks/tpacf](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/parboil/benchmarks/tpacf) |

## PolyBench/GPU

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| GEMM | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/GEMM](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/GEMM) |
| MVT | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/MVT](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/MVT) |
| 2MM | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/2MM](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/2MM) |
| 3MM | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/3MM](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/3MM) |
| 2DCONV | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/2DCONV](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/2DCONV) |
| 3DCONV | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/3DCONV](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/3DCONV) |
| ATAX | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/ATAX](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/ATAX) |
| BICG | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/BICG](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/BICG) |
| CORR | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/CORR](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/CORR) |
| COVAR | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/COVAR](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/COVAR) |
| FDTD-2D | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/FDTD-2D](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/FDTD-2D) |
| GESUMMV | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/GESUMMV](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/GESUMMV) |
| GRAMSCHM | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/GRAMSCHM](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/GRAMSCHM) |
| SYR2K | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/SYR2K](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/SYR2K) |
| SYRK | 已接入运行 | [src/cuda/polybench-gpu-1.0/CUDA/SYRK](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/polybench-gpu-1.0/CUDA/SYRK) |

## PyTorch

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| PyTorch | 待运行适配 | [src/cuda/pytorch_examples](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/pytorch_examples) |

## Rodinia 2.0 FT

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| backprop | 待运行适配 | [src/cuda/rodinia/2.0-ft/backprop](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/backprop) |
| bfs | 待运行适配 | [src/cuda/rodinia/2.0-ft/bfs](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/bfs) |
| heartwall | 待运行适配 | [src/cuda/rodinia/2.0-ft/heartwall](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/heartwall) |
| hotspot | 待运行适配 | [src/cuda/rodinia/2.0-ft/hotspot](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/hotspot) |
| kmeans | 待运行适配 | [src/cuda/rodinia/2.0-ft/kmeans](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/kmeans) |
| lud | 待运行适配 | [src/cuda/rodinia/2.0-ft/lud](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/lud) |
| nn | 待运行适配 | [src/cuda/rodinia/2.0-ft/nn](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/nn) |
| no-ft-impl | 待运行适配 | [src/cuda/rodinia/2.0-ft/no-ft-impl](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/no-ft-impl) |
| nw | 待运行适配 | [src/cuda/rodinia/2.0-ft/nw](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/nw) |
| pathfinder | 待运行适配 | [src/cuda/rodinia/2.0-ft/pathfinder](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/pathfinder) |
| srad | 待运行适配 | [src/cuda/rodinia/2.0-ft/srad](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/srad) |
| streamcluster | 待运行适配 | [src/cuda/rodinia/2.0-ft/streamcluster](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/2.0-ft/streamcluster) |

## Rodinia 3.1

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| b+tree | 待运行适配 | [src/cuda/rodinia/3.1/cuda/b+tree](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/b%2Btree) |
| b+tree_k1 | 待运行适配 | [src/cuda/rodinia/3.1/cuda/b+tree_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/b%2Btree_k1) |
| b+tree_k2 | 待运行适配 | [src/cuda/rodinia/3.1/cuda/b+tree_k2](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/b%2Btree_k2) |
| backprop | 待运行适配 | [src/cuda/rodinia/3.1/cuda/backprop](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/backprop) |
| backprop_k1 | 待运行适配 | [src/cuda/rodinia/3.1/cuda/backprop_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/backprop_k1) |
| backprop_k2 | 待运行适配 | [src/cuda/rodinia/3.1/cuda/backprop_k2](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/backprop_k2) |
| bfs | 待运行适配 | [src/cuda/rodinia/3.1/cuda/bfs](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/bfs) |
| cfd | 待运行适配 | [src/cuda/rodinia/3.1/cuda/cfd](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/cfd) |
| dwt2d | 待运行适配 | [src/cuda/rodinia/3.1/cuda/dwt2d](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/dwt2d) |
| gaussian | 已接入运行 | [src/cuda/rodinia/3.1/cuda/gaussian](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/gaussian) |
| heartwall | 待运行适配 | [src/cuda/rodinia/3.1/cuda/heartwall](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/heartwall) |
| hotspot | 待运行适配 | [src/cuda/rodinia/3.1/cuda/hotspot](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/hotspot) |
| hotspot3D | 待运行适配 | [src/cuda/rodinia/3.1/cuda/hotspot3D](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/hotspot3D) |
| hotspot_k1 | 待运行适配 | [src/cuda/rodinia/3.1/cuda/hotspot_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/hotspot_k1) |
| huffman | 待运行适配 | [src/cuda/rodinia/3.1/cuda/huffman](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/huffman) |
| hybridsort | 待运行适配 | [src/cuda/rodinia/3.1/cuda/hybridsort](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/hybridsort) |
| kmeans | 待运行适配 | [src/cuda/rodinia/3.1/cuda/kmeans](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/kmeans) |
| kmeans_k1 | 待运行适配 | [src/cuda/rodinia/3.1/cuda/kmeans_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/kmeans_k1) |
| lavaMD | 待运行适配 | [src/cuda/rodinia/3.1/cuda/lavaMD](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/lavaMD) |
| leukocyte | 待运行适配 | [src/cuda/rodinia/3.1/cuda/leukocyte](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/leukocyte) |
| lud | 待运行适配 | [src/cuda/rodinia/3.1/cuda/lud](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/lud) |
| mummergpu | 待运行适配 | [src/cuda/rodinia/3.1/cuda/mummergpu](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/mummergpu) |
| myocyte | 待运行适配 | [src/cuda/rodinia/3.1/cuda/myocyte](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/myocyte) |
| nn | 待运行适配 | [src/cuda/rodinia/3.1/cuda/nn](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/nn) |
| nw | 待运行适配 | [src/cuda/rodinia/3.1/cuda/nw](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/nw) |
| particlefilter | 待运行适配 | [src/cuda/rodinia/3.1/cuda/particlefilter](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/particlefilter) |
| pathfinder | 已接入运行 | [src/cuda/rodinia/3.1/cuda/pathfinder](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/pathfinder) |
| pathfinder_k1 | 待运行适配 | [src/cuda/rodinia/3.1/cuda/pathfinder_k1](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/pathfinder_k1) |
| srad | 待运行适配 | [src/cuda/rodinia/3.1/cuda/srad](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/srad) |
| streamcluster | 待运行适配 | [src/cuda/rodinia/3.1/cuda/streamcluster](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/rodinia/3.1/cuda/streamcluster) |

## SHOC

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| bfs | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/bfs](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/bfs) |
| fft | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/fft](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/fft) |
| gemm | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/gemm](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/gemm) |
| md | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/md](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/md) |
| md5hash | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/md5hash](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/md5hash) |
| neuralnet | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/neuralnet](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/neuralnet) |
| reduction | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/reduction](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/reduction) |
| scan | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/scan](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/scan) |
| sort | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/sort](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/sort) |
| spmv | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/spmv](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/spmv) |
| stencil2d | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/stencil2d](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/stencil2d) |
| triad | 待运行适配 | [src/cuda/shoc-master/src/cuda/level1/triad](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level1/triad) |
| qtclustering | 待运行适配 | [src/cuda/shoc-master/src/cuda/level2/qtclustering](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level2/qtclustering) |
| s3d | 待运行适配 | [src/cuda/shoc-master/src/cuda/level2/s3d](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level2/s3d) |
| Level 0 | 待运行适配 | [src/cuda/shoc-master/src/cuda/level0](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/shoc-master/src/cuda/level0) |

## Tensor Core

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| Tensor Core Microbench | 待运行适配 | [src/cuda/tensorcore-microbenchmarks](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/tensorcore-microbenchmarks) |

## UVM Smart

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| UVM Smart | 待运行适配 | [src/cuda/UVMSmart_test](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/UVMSmart_test) |

## cuDNN

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| cuDNN | 待运行适配 | [src/cuda/cudnn](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/cudnn) |

## vLLM

| 程序 / 入口 | 接入状态 | 上游源码 |
| --- | --- | --- |
| vLLM | 待运行适配 | [src/cuda/vllm](https://github.com/accel-sim/gpu-app-collection/tree/dad09cb0487845edc7524ded814c6cde9f0ef6a1/src/cuda/vllm) |

## 新增运行适配边界

- Pathfinder：使用原始 `dynproc_kernel`，输入由上游种子生成；规模设为 `N N 1`。在实验副本中添加独立串行 CPU 动态规划比较，整数结果必须逐项相等。
- Gaussian：使用上游 `Fan1` / `Fan2`，参数为 `-s N -q`，内部生成原始矩阵。保留原始 `A` 与 `b`，计算 GPU 消元 / CPU 回代得到的 `x`，逐行检查 `abs(Ax-b) <= 1e-3 * max(1, abs(b)+sum(abs(Aij*xj)))`，同时拒绝非有限数。
- 上述检查在模拟结束、有非零统计、正常退出时才允许标记成功；时间 / 周期截断不标记成功。
- 外部数据集、模型权重、框架、库链接、历史 CUDA API 和图形依赖没有通过下载源码自动解决。SHOC、Parboil 等共享源码会随对应程序补入；数据依赖仍按上游要求配置。
- 子模块按所用仓库的固定引用执行 `git submodule update --init --depth 1`，不自动递归下载所有依赖。
