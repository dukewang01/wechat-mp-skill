#!/usr/bin/env node
/**
 * ms_doctor.js —— 配置自检
 *
 *   node scripts/ms_doctor.js
 *
 * 区别：`msci.js status` 只**打印**配置；本脚本**校验**配置能不能真跑起来：
 * 密钥文件在不在、工程路径对不对、app.json 有没有、版本号能不能对上、代理会不会坑人。
 * 上传/发版之前先跑一遍，能省掉大半「跑到一半才发现」的失败。
 *
 * 退出码：0 = 全部通过；1 = 有阻断项；2 = 配置文件本身缺失
 */
const fs = require('fs');
const path = require('path');
const { loadConfig, CONFIG_PATH, ROOT } = require('./_lib.js');

const ok = [], warn = [], bad = [];
const P = (s) => console.log(s);

if (!fs.existsSync(CONFIG_PATH)) {
  P('❌ 找不到 config.js');
  P('   先执行：cp scripts/config.example.js scripts/config.js');
  process.exit(2);
}

let cfg;
try { cfg = loadConfig(); }
catch (e) { P('❌ config.js 读取失败：' + e.message); process.exit(2); }

// 1. appid
if (/^wx[0-9a-f]{16}$/i.test(cfg.appid || '')) ok.push('appid 格式正确：' + cfg.appid);
else bad.push('appid 不是合法格式（应为 wx + 16 位十六进制）：' + cfg.appid);

// 2. 工程路径 + app.json
if (!cfg.projectPath) bad.push('projectPath 未填');
else if (!fs.existsSync(cfg.projectPath)) bad.push('projectPath 不存在：' + cfg.projectPath);
else {
  const appJson = path.join(cfg.projectPath, 'app.json');
  if (fs.existsSync(appJson)) ok.push('工程路径有效，app.json 存在');
  else bad.push('工程路径下没有 app.json —— 多半填到了外层目录：' + cfg.projectPath);
}

// 3. 代码上传密钥
if (!cfg.privateKeyPath) bad.push('privateKeyPath 未填（CI 通道无法上传）');
else if (!fs.existsSync(cfg.privateKeyPath)) bad.push('密钥文件不存在：' + cfg.privateKeyPath);
else {
  ok.push('代码上传密钥存在');
  const bn = path.basename(cfg.privateKeyPath);
  if (!/^private\.wx[0-9a-f]{16}\.key$/i.test(bn)) warn.push('密钥文件名不常见（通常形如 private.<appid>.key）：' + bn);
  if (cfg.projectPath && path.resolve(cfg.privateKeyPath).startsWith(path.resolve(cfg.projectPath))) {
    warn.push('密钥在工程目录内 —— 有被提交进版本库的风险，建议移到工程外');
  }
}

// 4. 云开发
if (!cfg.cloudEnv) warn.push('cloudEnv 为空 → 云函数相关命令（fn/call）不可用');
else ok.push('云开发环境已配置：' + cfg.cloudEnv);

// 5. 开发者工具（IDE 通道）
if (!cfg.devtoolsDir) warn.push('devtoolsDir 未填 → IDE 通道（正式发版用）不可用');
else if (!fs.existsSync(cfg.devtoolsDir)) warn.push('devtoolsDir 路径不存在（Windows 中文路径常见坑）：' + cfg.devtoolsDir);
else ok.push('开发者工具目录存在 → IDE 通道可用（正式发版走这条，上传者显示你的账号）');

// 6. 代理（反直觉项）
if (cfg.proxy) {
  warn.push('配置了代理 —— 注意：普通探针查到的出口 IP 不是微信看到的 IP；');
  warn.push('          IP 白名单要填的，是真实 CI 调用报错 invalid ip: x.x.x.x 里的那个');
} else ok.push('未使用代理');

// 7. 版本号一致性（尽力而为：在工程内找版本常量）
try {
  const hits = [];
  const walk = (d, depth) => {
    if (depth > 3 || hits.length > 8) return;
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', '.git', 'miniprogram_npm', 'dist'].includes(f.name)) continue;
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p, depth + 1);
      else if (/\.(js|json|ts)$/.test(f.name) && !/app\.json$/.test(f.name)) {
        const m = fs.readFileSync(p, 'utf8').match(/(?:version|VERSION)\s*[:=]\s*['"]([0-9]+\.[0-9]+\.[0-9]+)['"]/);
        if (m) hits.push(path.relative(cfg.projectPath, p) + '  →  ' + m[1]);
      }
    }
  };
  if (cfg.projectPath && fs.existsSync(cfg.projectPath)) {
    walk(cfg.projectPath, 0);
    const uniq = [...new Set(hits.map(h => h.split('→')[1].trim()))];
    if (hits.length === 0) warn.push('工程内未找到版本号常量 —— 上传时请确认命令行版本号与代码实际一致');
    else if (uniq.length > 1) bad.push('工程内版本号不唯一，有两处以上不一致：\n     ' + hits.join('\n     '));
    else { ok.push('版本号单一出处：' + uniq[0]); P('\n   （上传时应传这个版本号）\n     ' + hits.join('\n     ')); }
  }
} catch (e) { warn.push('版本号扫描跳过：' + e.message); }

// 输出
P('\n── 自检结果 ──');
ok.forEach(x => P('✅ ' + x));
warn.forEach(x => P('⚠️  ' + x));
bad.forEach(x => P('❌ ' + x));
P(`\n通过 ${ok.length} ｜ 提示 ${warn.length} ｜ 阻断 ${bad.length}`);
if (bad.length) { P('\n先解决 ❌ 项，再执行上传/发版。'); process.exit(1); }
P('\n可以继续：node scripts/msci.js status 查看配置，或 node scripts/msci.js upide <版本> [备注] 走 IDE 通道发版。');
process.exit(0);
