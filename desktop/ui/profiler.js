/* Nsight-style reports backed by the Python simulator-statistics parser. */
const ProfileUI = (() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const finite = n => typeof n === "number" && Number.isFinite(n);
  const fmt = (n, digits = 2) => finite(n) ? n.toLocaleString("zh-CN", { maximumFractionDigits: digits }) : "未提供";
  const pct = n => finite(n) ? `${fmt(n)}%` : "未提供";
  const bytes = n => !finite(n) ? "未提供" : n >= 1e6 ? `${fmt(n / 1e6)} MB` : n >= 1e3 ? `${fmt(n / 1e3)} KB` : `${fmt(n)} B`;
  const short = name => name.replace(/^_Z\d+/, "").split(/(?:Pf|Pd|Pi|PK)/)[0] || name;
  const reports = new Map(), overrides = new Map(), selections = new Map();
  let jobId, job, report, generation = 0;
  function mode(profile) {
    $("profile-view").hidden = !profile;
    $("artifact-view").hidden = profile;
    for (const [id, selected] of [["show-profile", profile], ["show-artifacts", !profile]]) {
      $(id).classList.toggle("active", selected);
      $(id).setAttribute("aria-selected", String(selected));
    }
  }
  function metric(label, value, note) {
    return `<div class="profile-stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
  }
  function meter(label, value, note, kind = "") {
    const width = finite(value) ? Math.min(100, Math.max(0, value)) : 0;
    return `<div class="profile-meter ${kind}"><div><span>${label}</span><strong>${pct(value)}</strong></div><div class="profile-meter-track"><div style="width:${width}%"></div></div><small>${note}${finite(value) && value > 100 ? " · 超出配置上限，需检查配置或计数口径" : ""}</small></div>`;
  }
  function cacheNode(name, c) {
    c ||= {};
    const known = finite(c.accesses);
    const a = c.accesses || 0;
    const hit = finite(c.hitRate) ? c.hitRate : 0, pending = finite(c.pendingRate) ? c.pendingRate : 0, miss = finite(c.missRate) ? c.missRate : 0;
    return `<div class="profile-component"><span class="profile-component-type">CACHE</span><h4>${name}</h4><strong>${pct(c.hitRate)}</strong><span>直接命中率</span><div class="cache-stack" role="img" aria-label="${escape(name)}：直接命中 ${pct(c.hitRate)}，pending ${pct(c.pendingRate)}，未命中 ${pct(c.missRate)}"><i style="width:${hit}%"></i><i style="width:${pending}%"></i><i style="width:${miss}%"></i></div><dl><div><dt>访问</dt><dd>${fmt(c.accesses, 0)}</dd></div><div><dt>直接命中</dt><dd>${known && finite(c.misses) && finite(c.pending) ? fmt(a - c.misses - c.pending, 0) : "未提供"}</dd></div><div><dt>Pending</dt><dd>${fmt(c.pending, 0)}</dd></div><div><dt>未命中</dt><dd>${fmt(c.misses, 0)}</dd></div><div><dt>预留失败</dt><dd>${fmt(c.reservationFails, 0)}</dd></div></dl>${known && a === 0 ? '<small>没有访问，命中率无定义</small>' : ""}</div>`;
  }
  function roofline(k, h) {
    const override = overrides.get(jobId) || {};
    const peak = override.peak ?? h.peakFp32Gflops, bandwidth = override.bandwidth ?? h.peakDramGBs;
    const valid = peak > 0 && bandwidth > 0;
    const hasPoint = k.intensity > 0 && k.fp32Gflops > 0;
    let chart = '<p class="profile-empty">配置不足以推导峰值线。可输入有依据的计算与 DRAM 带宽上限。</p>';
    if (valid) {
      const ridge = peak / bandwidth;
      const xValues = [ridge, ...(hasPoint ? [k.intensity] : [])];
      const xmin = Math.min(-2, Math.floor(Math.log10(Math.min(...xValues))) - 1);
      const xmax = Math.max(3, Math.ceil(Math.log10(Math.max(...xValues))) + 1);
      const ymax = Math.ceil(Math.log10(Math.max(peak, hasPoint ? k.fp32Gflops : 0)));
      const ymin = Math.min(ymax - 4, hasPoint ? Math.floor(Math.log10(k.fp32Gflops)) - 1 : ymax - 4);
      const px = x => 88 + (Math.log10(x) - xmin) / (xmax - xmin) * 654;
      const py = y => 290 - (Math.log10(y) - ymin) / (ymax - ymin) * 240;
      let grid = "";
      const ticks = (min, max) => Array.from({ length: 6 }, (_, i) => min + (max - min) * i / 5);
      for (const x of ticks(xmin, xmax)) {
        const p = px(10 ** x);
        grid += `<path class="roof-grid" d="M${p},50V290"/><text x="${p}" y="312" text-anchor="middle">${fmt(10 ** x, x < 0 ? Math.ceil(-x) + 1 : 1)}</text>`;
      }
      for (const y of ticks(ymin, ymax)) {
        const p = py(10 ** y);
        grid += `<path class="roof-grid" d="M88,${p}H742"/><text x="76" y="${p + 4}" text-anchor="end">${fmt(10 ** y, y < 0 ? Math.ceil(-y) + 1 : 1)}</text>`;
      }
      const points = Array.from({ length: 100 }, (_, i) => {
        const x = 10 ** (xmin + (xmax - xmin) * i / 99), y = Math.min(peak, bandwidth * x);
        return `${px(x)},${py(y)}`;
      }).join(" ");
      chart = `<svg class="roof-chart" viewBox="0 0 800 355" role="img" aria-label="FP32 DRAM Roofline，计算上限 ${fmt(peak)} GFLOP/s，带宽上限 ${fmt(bandwidth)} GB/s${hasPoint ? `，当前计算强度 ${fmt(k.intensity)} FLOP/B，性能 ${fmt(k.fp32Gflops)} GFLOP/s` : '，没有有效执行点'}"><defs><clipPath id="roof-clip"><rect x="88" y="50" width="654" height="240"/></clipPath></defs>${grid}<text x="18" y="24">性能 · GFLOP/s</text><path class="roof-axis" d="M88,50V290H742"/><g clip-path="url(#roof-clip)"><polyline class="roof-ceiling" points="${points}"/>${hasPoint ? `<circle class="roof-point" cx="${px(k.intensity)}" cy="${py(k.fp32Gflops)}" r="6"><title>${escape(k.name)}：${fmt(k.intensity)} FLOP/B · ${fmt(k.fp32Gflops)} GFLOP/s</title></circle>` : ''}</g><text x="415" y="345" text-anchor="middle">DRAM 计算强度 · FLOP/B（对数坐标）</text></svg>`;
    }
    return `<section class="profile-section"><div class="profile-section-title"><div><h3>FP32 Roofline</h3><p>运算量 / DRAM 实际流量 · 性能使用模拟时间</p></div><span class="profile-tag">${override.peak || override.bandwidth ? "手动上限" : "配置理想上限"}</span></div><div class="roof-layout"><div>${chart}<div class="roof-legend"><span><i class="roof-line-key"></i>计算 / 带宽上限</span><span><i class="roof-dot-key"></i>模拟执行点</span></div></div><dl class="roof-values"><div><dt>FP32 运算量</dt><dd>${fmt(k.fp32Flops, 0)} FLOP</dd></div><div><dt>DRAM 实际流量</dt><dd>${bytes(k.dramBytes)}</dd></div><div><dt>计算强度</dt><dd>${fmt(k.intensity, 4)} FLOP/B</dd></div><div><dt>模拟计算性能</dt><dd>${fmt(k.fp32Gflops, 4)} GFLOP/s</dd></div><div><dt>计算上限</dt><dd>${fmt(peak)} GFLOP/s</dd></div><div><dt>DRAM 带宽上限</dt><dd>${fmt(bandwidth)} GB/s</dd></div></dl></div>${!hasPoint ? `<p class="profile-notice">${k.dramBytes === 0 ? 'DRAM 流量为 0，不能生成有限的 DRAM 计算强度。峰值线仍可查看；没有用矩阵大小替代流量。' : '缺少可归属的完整 FP32 运算量或 DRAM 流量，暂不绘制执行点。'}</p>` : ''}<details class="profile-method"><summary>上限设置与计算依据</summary><div class="roof-controls"><label>计算上限 / GFLOP/s<input id="roof-peak" type="number" min="0.000001" step="any" value="${finite(peak) ? peak : ''}" placeholder="配置未提供"></label><label>DRAM 带宽上限 / GB/s<input id="roof-bandwidth" type="number" min="0.000001" step="any" value="${finite(bandwidth) ? bandwidth : ''}" placeholder="配置未提供"></label><button id="apply-roof" class="secondary" type="button">应用上限</button><button id="reset-roof" class="secondary" type="button">恢复配置</button></div><p id="roof-error" role="alert"></p><p>${escape(h.computeFormula)}<br>${escape(h.memoryFormula)}<br>配置峰值是理想发射上限，尚未经过峰值微基准校准。</p><p>${escape(report.flopNote)}</p></details></section>`;
  }
  function render() {
    const kernels = report?.kernels || [];
    if (!kernels.length) {
      $("profile-content").innerHTML = `<p class="profile-empty">${escape(report?.reason || "日志尚未包含性能统计快照。")}</p>`;
      return;
    }
    const k = kernels.find(x => x.id === $("profile-kernel").value) || kernels[0], h = report.model || {};
    selections.set(jobId, k.id);
    const tlbs = Object.entries(k.tlbs || {});
    const raw = Object.entries(k.raw || {}).filter(([, v]) => finite(v));
    $("profile-content").innerHTML = `<p class="profile-context">模拟结果 · ${fmt(h.sms, 0)} SM · 核心 ${fmt(h.clockMHz)} MHz · ${k.scope === 'interval' ? '多 kernel 统计区间' : 'Kernel UID ' + escape(k.id)} · <code>${escape(k.name)}</code></p>
      ${job?.status !== 'completed' ? `<p class="profile-notice">${job?.status === 'unverified' ? '执行已结束，程序正确性未验证。' : '当前实验尚未通过完整性与正确性检查，以下为已输出的统计快照。'}</p>` : ''}
      <div class="profile-stats">${metric("模拟执行时间", `${fmt(k.timeMs, 6)} <em>ms</em>`, `${fmt(k.cycles, 0)} 核心周期`)}${metric("指令吞吐", `${fmt(k.ipc, 4)} <em>IPC</em>`, `${fmt(k.instructions, 0)} 模拟指令`)}${metric("FP32 计算性能", `${fmt(k.fp32Gflops, 4)} <em>GFLOP/s</em>`, '逐 PTX 行线程执行计数')}${metric("DRAM 吞吐", `${fmt(k.dramGBs, 4)} <em>GB/s</em>`, `${bytes(k.dramBytes)} 实际模拟流量`)}</div>
      <section class="profile-section"><div class="profile-section-title"><div><h3>Kernel 总体表现</h3><p>计算与 DRAM 吞吐相对配置上限</p></div></div><div class="profile-utilization">${meter('FP32 计算 / 理想上限', k.computePct, '基本浮点运算量 ÷ 模拟时间 ÷ 配置 FP32 上限')}${meter('DRAM 带宽 / 理想上限', k.memoryPct, '实际模拟 DRAM 字节数 ÷ 模拟时间 ÷ 配置带宽', 'memory')}${meter('Warp occupancy', k.occupancyPct, '原始 gpu_occupancy；独立于计算吞吐', 'occupancy')}</div></section>
      <section class="profile-section"><div class="profile-section-title"><div><h3>内存与地址转换组件</h3><p>直接命中、pending 与未命中分开统计</p></div><div class="cache-legend"><span><i></i>直接命中</span><span><i></i>Pending</span><span><i></i>未命中</span></div></div><div class="profile-flow"><div class="flow-label">Kernel</div><span>→</span><div class="flow-label">L1 / Shared</div><span>→</span><div class="flow-label">L2</div><span>→</span><div class="flow-label">DRAM</div></div><div class="profile-components">${cacheNode('L1 Data', k.caches.L1D)}${cacheNode('L2 Cache', k.caches.L2)}<div class="profile-component"><span class="profile-component-type">DEVICE MEMORY</span><h4>DRAM</h4><strong>${fmt(k.dramGBs, 4)}</strong><span>GB/s</span><dl><div><dt>实际流量</dt><dd>${bytes(k.dramBytes)}</dd></div><div><dt>带宽利用</dt><dd>${pct(k.memoryPct)}</dd></div><div><dt>内存控制器</dt><dd>${fmt(h.memoryChannels, 0)}</dd></div></dl></div><div class="profile-component"><span class="profile-component-type">ON-CHIP MEMORY</span><h4>Shared Memory</h4><strong>${fmt(k.raw.gpgpu_n_shmem_insn, 0)}</strong><span>指令数（累计）</span><dl><div><dt>Bank conflicts</dt><dd>${fmt(k.raw.gpgpu_n_shmem_bkconflict, 0)}</dd></div><div><dt>L2→核心回复带宽</dt><dd>${fmt(k.l2ReplyGBs, 4)} GB/s</dd></div></dl></div><div class="profile-component"><span class="profile-component-type">ADDRESS TRANSLATION</span><h4>TLB</h4><strong>${tlbs.length ? pct(tlbs[0][1].hitRate) : '未提供'}</strong><span>${tlbs.length ? escape(tlbs[0][0]) + ' 命中率' : '日志没有 TLB 查询计数'}</span><p>需模拟器实现地址转换并输出查询、命中和未命中数。</p>${tlbs.map(([level, t]) => `<dl><div><dt>${escape(level)} hit</dt><dd>${pct(t.hitRate)}</dd></div><div><dt>查询 / 命中 / 未命中</dt><dd>${fmt(t.lookup, 0)} / ${fmt(t.hit, 0)} / ${fmt(t.miss, 0)}</dd></div></dl>`).join('')}</div></div><details class="profile-method"><summary>其他缓存与每个 SM 的 L1 指标</summary><div class="profile-secondary-caches">${cacheNode('L1 Instruction', k.caches.L1I)}${cacheNode('L1 Constant', k.caches.L1C)}${cacheNode('L1 Texture', k.caches.L1T)}</div><div class="profile-core-grid">${k.cores.map(c => `<div class="profile-core ${c.accesses > 0 ? 'used' : ''}" title="访问 ${fmt(c.accesses, 0)} · 直接命中 ${pct(c.hitRate)} · 未命中 ${fmt(c.misses, 0)}"><span>SM ${c.id}</span><strong>${c.accesses > 0 ? pct(c.hitRate) : '无访问'}</strong></div>`).join('')}</div></details></section>
      ${roofline(k, h)}
      ${k.warnings.length ? `<ul class="profile-warnings">${k.warnings.map(x => `<li>${escape(x)}</li>`).join('')}</ul>` : ''}
      <details class="profile-method"><summary>计数口径与原始指标 · sim.log 第 ${k.logLine} 行</summary><p>${escape(report.counterNote)}</p><p>${escape(report.scopeNote)}</p><p>组件统计是相邻完整日志快照的差分；多 kernel 区间不能拆分。Shared 与原始指标保持累计口径。缓存命中率不等同于 TLB 命中率。</p><div class="profile-raw-wrap"><table class="profile-raw"><thead><tr><th>日志字段</th><th>原始值</th></tr></thead><tbody>${raw.map(([name, value]) => `<tr><td><code>${escape(name)}</code></td><td>${fmt(value, 6)}</td></tr>`).join('')}</tbody></table></div></details>`;
    $("apply-roof").addEventListener('click', () => {
      const peak = Number($("roof-peak").value), bandwidth = Number($("roof-bandwidth").value);
      if (!finite(peak) || !finite(bandwidth) || peak <= 0 || bandwidth <= 0) {
        $("roof-error").textContent = '两个上限都须为有限的正数。'; return;
      }
      overrides.set(jobId, { peak, bandwidth }); render();
    });
    $("reset-roof").addEventListener('click', () => { overrides.delete(jobId); render(); });
  }
  function setReport(value) {
    report = value;
    const kernels = report?.kernels || [];
    $("profile-kernel").innerHTML = kernels.map(k => `<option value="${escape(k.id)}">#${escape(k.id)} · ${escape(short(k.name))} · ${fmt(k.timeMs, 5)} ms${k.scope === 'interval' ? ' · 区间合计' : ''}</option>`).join('');
    const selected = selections.get(jobId);
    if (kernels.some(k => k.id === selected)) $("profile-kernel").value = selected;
    $("profile-kernel").disabled = !kernels.length;
    $("profile-status").textContent = kernels.length ? `${kernels.length} 个 kernel / 统计区间 · 由完整日志解析` : '';
    render();
  }
  async function load() {
    const current = jobId, request = ++generation;
    $("profile-status").textContent = '正在解析完整日志、配置与 PTX 执行计数…';
    $("refresh-profile").disabled = true;
    try {
      const value = await window.studio.profile(current);
      if (request !== generation || current !== jobId) return;
      reports.set(current, value); setReport(value);
    } catch (error) {
      if (request === generation) $("profile-status").textContent = `性能报告读取失败：${error.message}`;
    } finally {
      if (request === generation) $("refresh-profile").disabled = false;
    }
  }
  function open(id, data) {
    generation++; jobId = id; job = data; mode(true);
    $("refresh-profile").disabled = false;
    const cached = data?.profile || reports.get(id);
    setReport(cached || { kernels: [], reason: '正在加载性能报告…' });
    if (!data?.profile) load();
  }
  function update(data) {
    if (data?.id !== jobId) return;
    job = data;
    if (data.profile && data.profile !== report) setReport(data.profile);
  }
  $("show-profile").addEventListener('click', () => mode(true));
  $("show-artifacts").addEventListener('click', () => mode(false));
  $("profile-kernel").addEventListener('change', render);
  $("refresh-profile").addEventListener('click', load);
  return { open, update };
})();
