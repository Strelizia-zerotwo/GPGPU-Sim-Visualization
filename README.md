# GPGPU Studio

GPGPU-Sim 桌面实验管理工具。选择 PolyBench CUDA 程序、规模和 GPU 配置，创建实验组合，使用多个独立进程同时运行，并查看日志、正确性检查和模拟统计。

0.4 版改为从空白开始的实验画布：顶部添加独立的程序/GPU 方块，拖动、平移、缩放，显式连接后单独运行；右键运行按钮设置重复次数，画布同步显示排队、转圈运行和完成状态。保留按架构排列的 GPU 编辑、自定义 GPU 草稿和各程序的独立参数。保留首次启动自动检测、内置 WSL 部署教程、一键下载编译 GPGPU-Sim、完整 PolyBench/GPU CUDA 商店，以及自定义 CUDA 程序。桌面窗口使用 Electron；后端是仅依赖 Python 标准库的本地进程，通过标准输入/输出通信，不需要启动 Web 服务。

## 平台与依赖

| 使用平台 | 模拟器运行位置 | 要求 |
| --- | --- | --- |
| Windows 10/11 | WSL Linux 发行版 | WSL、Ubuntu 等发行版、Python 3.10+、CUDA Toolkit、已编译的 GPGPU-Sim |
| 原生 Linux | 本机 Linux | Python 3.10+、CUDA Toolkit、已编译的 GPGPU-Sim |

Windows 用户需要安装 WSL 和一个 Linux 发行版；不需要安装完整的 Linux 桌面。首次启动自动检测，缺少 WSL / 发行版时打开内置部署教程，包含可复制的命令、重启和 Ubuntu 用户初始化说明。官方步骤见 [安装 WSL](https://learn.microsoft.com/zh-cn/windows/wsl/install)。

安装 WSL 的常见入口是在管理员 PowerShell 中运行 `wsl --install -d Ubuntu`，按提示重启并完成 Linux 用户初始化。然后按教程在 Ubuntu 中安装 Python、编译依赖和 CUDA Toolkit。WSL、系统依赖和 Toolkit 的安装由用户在相应终端完成；模拟器的源码下载、编译与运行库安装可以在软件中一键执行。CUDA 按路径选择，不修改全局 CUDA 配置。

运行 CUDA 的 PTX 模拟主要使用 CPU 和主机内存；本工具不采集真实 GPU 指令 trace。

## 开发启动

需要 Node.js 22.12+ 和 npm。在本仓库目录执行：

```powershell
npm install
npm start
```

如果 PowerShell 限制 `.ps1` 脚本，使用 `npm.cmd install` 和 `npm.cmd start`。

## 第一次使用

1. 启动软件后自动检测 WSL、CUDA 和常用项目目录；优先使用已保存的环境，失效时尝试重新发现。任意其他位置可以在“环境设置”中填写 Linux 绝对路径。
2. 缺少 WSL / Python 时，按“部署教程”准备环境，点击“我已完成，重新检测”。
3. 检测到 CUDA 但缺少模拟器时，确认源码目标目录，点击“一键下载并编译”。新部署使用已核验的官方提交 `c3eeb6d19016960ab66789efdd8a3200cc30222a`。已有源码会编译当前版本；不会重置工作树。
4. 一键部署使用 `build-studio` 目录，依次执行 CMake 配置、编译、安装，并在界面输出真实日志。默认同时下载 GEMM，可取消这个选项。
5. 到“PolyBench 商店”选择需要的程序下载。也可添加本地源码目录或公开 GitHub 仓库。
6. 工作台首次打开为空白。在顶部添加测试程序与 GPU，点击方块编辑，再连接程序右侧与 GPU 左侧圆点。点击连线旁的“开始实验”运行，右键设置 1–100 次。默认程序规模为 `16`、每条连接重复 `1` 次、全局并发为 `1`。
7. 总任务数 = 各条连接对应程序的规模个数 × 该连接重复次数，再对所有连接求和。只有显式连接的组合会运行。最大并发数在“执行设置”中控制所有连接共用的执行槽位。
8. 在“运行与结果”查看状态、正确性、模拟周期和 IPC。点击任务查看日志、实际配置、源码差异和实验记录。

需要的源码来自 [gpu-app-collection](https://github.com/accel-sim/gpu-app-collection)：

```bash
# 已使用 sparse checkout 的仓库，可以只补齐第一版所需的目录。
cd /你的路径/gpu-app-collection
git sparse-checkout add \
  src/cuda/polybench-gpu-1.0/CUDA/GEMM \
  src/cuda/polybench-gpu-1.0/CUDA/MVT \
  src/cuda/polybench-gpu-1.0/common
```

完整 checkout 的仓库已经包含这些文件，无需运行 sparse-checkout 命令。

## PolyBench 商店

完整收录 PolyBench/GPU 1.0 CUDA 套件的 15 个程序：GEMM、MVT、2MM、3MM、2DCONV、3DCONV、ATAX、BICG、CORR、COVAR、FDTD-2D、GESUMMV、GRAMSCHM、SYR2K、SYRK。来源为 GitHub 的 `accel-sim/gpu-app-collection`，支持搜索、单独下载、批量选择下载和加入实验。

程序以 Git sparse checkout 按需取出；已有完整仓库直接使用，已有 sparse checkout 只补充所选目录。不会把完整 checkout 强制改成 sparse checkout。卡片显示源码是否可用，下载状态与运行正确性分开。

统一规模会调整卡片列出的维度宏。GEMM 也支持独立 NI/NJ/NK 和线程块 X/Y 参数；FDTD-2D 同时调整 `NX/NY/tmax`；2D/3D 卷积至少需要规模 3，保证有内部计算区域。

旧 CUDA 套件存在小规模初始化和网格计算问题。实验副本会对 2MM、3MM、ATAX、GESUMMV 的累加器做与 CPU 参考一致的初始化，为 GESUMMV 的 B 矩阵提供确定的输入，修正 CORR/COVAR 的网格向上取整，以及 GEMM 非方阵的网格 X/Y 方向。这些修复可能改变指令数与模拟周期；比较实验时必须使用一致的适配版本。下载的原始源码保留，`source.diff` 与 `manifest.json` 的 `adapterPatches` 记录实际修改。

## 添加自己的程序

- 本地：填写 Linux 源码目录，以及目录内的 CUDA 入口相对路径。
- GitHub：填写公开仓库的 HTTPS 地址，可指定分支、标签或提交。源码下载到工具管理的目录，之后按所填 CUDA 入口编译。
- 规模方式：整数编译宏（如 `N` 或 `NI,NJ,NK`），或每行一个运行参数，用 `{size}` 替代规模。
- 自定义源码连同必要头文件复制到任务目录后编译；当前以单个 `.cu` 入口为编译单元，不自动运行仓库里的任意构建脚本。
- 通过“移出列表”移除注册项，原始源码保留。
- 未输出标准 PolyBench 比对信息的自定义程序，正常结束且产生模拟统计时标记为“完成 · 未验证”，不会伪造正确性通过。

示例见 `examples/vector-add/main.cu`，同时支持编译宏 `N` 和运行参数 `{size}`，并输出可解析的数值比较结果。

## 实验画布

顶部的“添加测试程序”和“添加 GPU”打开可搜索的模块库，添加后才会出现方块。相同程序或 GPU 可以添加多次，每个方块独立保存设置。例如一个 GEMM 为方阵 8，另一个为 NI=7、NJ=13、NK=5；两个 A100 方块分别设置 54 SM 和 108 SM，修改一方不会影响另一方。

点击方块打开参数编辑器；拖动方块改变位置；拖动画布空白区域平移；滚轮或左下角按钮缩放。“适应画布”显示所有方块。连接可拖动端口完成，也可以依次点击两端圆点，或点击工具栏“连线”后依次选择两个方块。一个程序可以连接多个 GPU，一个 GPU 可以连接多个程序；每条连接仅代表其两个端点，不自动生成其他组合。

每条连接旁有自己的运行按钮。右键按钮（或点击旁边的 ⋮）设置重复次数，支持自填 1–100；该连接的规模与重复次数合计最多 100 个任务。还可停止本次运行、查看结果、删除闲置连接。右侧列出全部连接，可点击名称定位到两个端点，并启动全部就绪连接。多个连接共用全局并发限制。

运行后留在画布，方块与连线同步显示转圈、完成计数和结果。全部任务通过数值比对才显示绿色“已完成”；失败、取消、周期截断、超时、未提供比对分别保留其结果状态。再次运行产生新的实验记录，前一次记录仍可在“运行与结果”查看。提交时保存参数快照，运行中编辑节点会作用于下次提交。

画布位置、缩放、独立参数、连接、重复次数和最新任务关联自动保存。重新打开会从历史恢复连接状态，不会自动重跑；异常退出后的任务显示中断。0.3 的 GPU/程序草稿保留为可用默认设置，首次进入新画布仍为空白。

GPU 编辑器左侧是架构示意，右侧是点击模块后的参数表。图形块数为示意，不是芯片的真实 floorplan。SM 总数与每个 Cluster 的 SM 数共同决定 cluster 数；L1/L2 容量从组数、行大小和相联度计算，修改几何时保留模板的缓存策略和 MSHR 参数。A100 的 L1 基础几何是 32 KiB、统一 L1/Shared 容量是 192 KiB，实际自适应容量随 kernel 的共享内存用量变化；L2 总容量 = 单个子分区容量 × 内存通道数 × 每通道子分区数，A100 模板为 40 MiB。

自定义 GPU 仍需要一个真实模拟器模板来提供指令时序、流水线、内存地址映射和配套文件等详细设置。界面会显示其来源；选择模板本身不会把空白模块填满，需点击“从模板填入模块”或逐项输入。校验覆盖可视化字段、缓存几何与部分容量关系，不能保证任意高级架构组合都满足上游模拟器的全部内部约束。模板的 DRAM 时序仍可在完整配置中编辑。

GEMM 的独立维度模式表示一组固定 NI/NJ/NK；统一维度模式可以扫多个规模。其他内置程序的维度联动保持原有适配规则，线程块参数从源码发现。自定义程序还可编辑运行参数，每行一项、以 {size} 引用当前规模。所有这些参数均进入源码生成、任务记录、比较分组和 CSV 导出。

## 实验功能

- 全部 15 个 CUDA 程序，以及用户添加的程序。生成任务专用源码并编译，检查规模宏替换确实生效。
- 加载模拟器 `configs/tested-cfgs` 中的 GPU 配置。对当前 CUDA 不支持的编译目标显示不可选。
- 点击 GPU 卡片，按 SM、L1、Shared Memory、片上互连、L2、显存控制器的数据流布局编辑 32 项常用参数；每个实验使用配置副本。
- 自定义 GPU 从空白模块开始，明确选择详细参数模板，可手工填写或从模板填入。未完整填写的草稿可以保存，不能启动实验。也可把现成 GPU 另存为独立变体。
- 每个程序模块独立设置规模；GEMM 与自定义宏程序支持独立维度，其余内置程序保留统一维度适配。检测源码中真实存在的整数线程块宏，提供启动参数编辑。
- 画布方块、位置、连接、缩放、程序参数和 GPU 修改在本机自动保存；重开恢复最新执行状态。
- 1–32 个并发任务；设置 1 时顺序运行，空闲槽位自动接续等待任务。
- 每个程序 / 规模 / GPU 组合可以重复 1–100 次，单个批次最多 100 个独立任务。
- 单独取消运行中/等待中的实验。退出应用时停止本工具拥有的模拟进程，保留日志与结果。
- 分开判断进程退出、结果正确性、周期截断与运行超时。
- 提取最后一组累计周期、累计指令数和 IPC；避免把多个 kernel 的累计统计重复相加。
- 按相同程序、规模、宏参数和运行参数比较模拟执行时间；完整实验结果可导出 CSV。
- 保存实验历史；重新打开时，未正常结束的任务标记为“运行已中断”，不会自动重复运行。

## 环境与结果边界

- CUDA 由绝对路径选择，环境变量只作用于后端及其子进程；匹配模拟器构建所用 CUDA。
- CMake 构建优先使用生成的 `setup`；Make 构建使用 `setup_environment`。用户应只接入可信的本地模拟器项目，环境脚本会被加载执行。
- GPU 配置描述的是模拟模型。显示的“模拟执行时间”由周期与配置核心频率计算，是模型结果，不是物理 GPU 实测。
- 主机耗时包括 benchmark 编译和模拟执行，与模拟执行时间分开显示。
- 周期上限会写入任务配置；达到上限的结果标记为不完整的截断实验。
- 任意高级配置可能依赖额外文件或相互关联的参数；运行失败时保留日志供诊断。当前不提供完整的参数语义校验。
- 系统组件与 CUDA 按教程安装；源码下载、模拟器编译安装和 benchmark 下载由软件执行。当前连接本机 WSL / Linux，不支持远程服务器。Linux 执行路径已实现，实际验证平台为 Windows + WSL。
- 每次按规模和目标编译独立 benchmark，尚未加入跨任务编译缓存。

## 实验目录

每个任务使用独立 UUID 子目录，保存：

```text
实验根目录/
└── 任务 UUID/
    ├── gemm.cu 或 mvt.cu
    ├── polybenchUtilFuncts.h
    ├── benchmark
    ├── gpgpusim.config
    ├── compile.log
    ├── sim.log
    ├── manifest.json
    ├── source.diff
    └── result.json
```

`manifest.json` 记录 CUDA 版本、源码提交、工作树修改状态、编译命令、实际规模、适配记录、重复编号、运行参数以及源码/配置 SHA-256。应用在本机用户数据目录保存环境设置和任务历史。自定义程序列表、下载源码和维护日志保存在 benchmark 仓库同级的 `.gpgpu-studio/` 目录中。用户实验不会提交到 Git。

## 测试

```powershell
npm test
```

单元测试检查并发限制、补位、取消、环境快照、源码规模替换、累计日志解析、正确性和截断状态。

```powershell
npm run test:desktop
```

桌面集成入口与下方 `test:canvas` 相同，会实际启动 Electron，连接已部署的 WSL 后端并验证画布、配置、重复次数、数值结果和截断状态。需要已有环境；截图和验证报告生成到忽略的 `artifacts/`，每次使用独立桌面数据目录。

```powershell
npm run test:enhancements
```

增强功能集成测试会在全新的 Linux 临时目录中真实下载编译模拟器、下载套件并运行全部 15 个程序，再检查自定义运行参数、重复次数和 WSL 缺失时的教程界面。测试系统必须已有 CUDA 和编译依赖；教程中的 WSL 安装、重启和 apt 命令不在测试中执行。调试时可设置 `GPGPU_STUDIO_REUSE_ENV` 复用之前的测试环境，避免重复部署。

0.4 画布功能可运行：

```powershell
npm run test:canvas
```

该测试实际启动 Electron 与 WSL，检查空白画布、独立节点、拖动连线、右键次数、平移缩放、完成状态和保存恢复。运行方阵/矩形 GEMM，共 4 个任务通过数值比对；另跑一个受周期限制的 MVT，确认不会显示为完成。也检查自定义 GPU 节点和 1100×760 窗口布局。

```powershell
npm run test:canvas -- --packaged
```

使用 `release/canvas/win-unpacked/GPGPU Studio.exe` 检查实际发布目录。实验输出、截图与验证报告写入忽略的 `artifacts/`，每次使用独立桌面数据目录。

## 打包

```powershell
npm run pack
npm run dist:win
```

`release/` 中生成 Windows 桌面程序。发布包包含桌面界面、Python 后端和套件目录；模拟器及 benchmark 可在首次使用时下载。Windows portable 包可直接打开，仍然需要按教程准备 WSL、Python、CUDA 和编译依赖。

## 目录结构

```text
desktop/main.cjs       Electron 主进程、WSL 桥接、历史和导出
desktop/preload.cjs    受限桌面 API
desktop/runner.cjs     并发实验调度
desktop/ui/            中文界面、GPU 编辑、画布与共享图模型
backend/bridge.py      Linux 环境检测、源码生成、编译、模拟与结果解析
backend/catalog.py     套件目录与自定义注册
backend/polybench.json 15 个 CUDA 程序的共享目录
backend/operations.py  下载、部署、编译维护任务
backend/adapters.py    记录明确的旧源码修复
backend/parameters.py  源码参数发现与校验
tests/                 单元和实际桌面集成测试
```

## 许可与上游

本项目代码使用 MIT 许可。CUDA、GPGPU-Sim 和 PolyBench 使用各自的上游许可；本项目不重新授权这些组件。用于研究时，请按上游要求引用模拟器和 benchmark，并记录版本。

- [GPGPU-Sim](https://github.com/gpgpu-sim/gpgpu-sim_distribution)
- [gpu-app-collection / PolyBench CUDA](https://github.com/accel-sim/gpu-app-collection)
