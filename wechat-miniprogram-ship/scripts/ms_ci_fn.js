/* ms_ci_fn.js —— 部署云函数（CI 通道，不需要开发者工具开着）
 *
 * 为什么用 CI 通道部署：
 *   IDE 通道的部署需要人工在工具里点确认（返回 taskId: pending），
 *   首次部署还可能因函数处于 Creating 状态而失败；CI 通道一次完成。
 *
 * 用法：node ms_ci_fn.js <函数名>
 * 前置：config.js 里的 appid / projectPath / privateKeyPath / cloudEnv
 *       函数目录约定：<projectPath>/cloudfunctions/<函数名>
 */
const path = require('path');
const fs = require('fs');
const L = require('./_lib');

const cfg = L.loadConfig();
const name = process.argv[2];
if (!name) { console.error('用法：node ms_ci_fn.js <函数名>'); process.exit(2); }
if (!cfg.cloudEnv) { console.error('config.js 里未填 cloudEnv'); process.exit(2); }
if (!cfg.privateKeyPath || !fs.existsSync(cfg.privateKeyPath)) {
  console.error('找不到代码上传密钥：' + cfg.privateKeyPath);
  process.exit(2);
}

/* 允许通过 --dir 覆盖默认目录约定 */
const di = process.argv.indexOf('--dir');
const fnPath = (di > 0 && process.argv[di + 1])
  ? process.argv[di + 1]
  : path.join(cfg.projectPath, 'cloudfunctions', name);

if (!fs.existsSync(fnPath)) { console.error('函数目录不存在：' + fnPath); process.exit(2); }

let ci;
try { ci = require('miniprogram-ci'); }
catch (e) { console.error('未安装 miniprogram-ci：cd scripts && npm i miniprogram-ci'); process.exit(2); }

/* 透明化将上传的文件，避免误传 node_modules */
const files = [];
(function walk(d) {
  fs.readdirSync(d).forEach((f) => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else files.push(path.relative(fnPath, p).replace(/\\/g, '/'));
  });
})(fnPath);

(async () => {
  const project = new ci.Project({
    appid: cfg.appid, type: 'miniProgram',
    projectPath: cfg.projectPath, privateKeyPath: cfg.privateKeyPath,
    ignores: ['node_modules/**/*'],
  });

  console.log('云函数：' + name);
  console.log('环境：' + cfg.cloudEnv);
  console.log('目录：' + fnPath);
  console.log('将上传 ' + files.length + ' 个文件：' +
    files.slice(0, 12).join(', ') + (files.length > 12 ? ' …' : ''));

  const t0 = Date.now();
  try {
    const r = await ci.cloud.uploadFunction({
      project, env: cfg.cloudEnv, name, path: fnPath,
      remoteNpmInstall: true,     // 云端装依赖，不上传本地 node_modules
    });
    console.log('✅ 部署成功，耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    console.log('  返回：' + JSON.stringify(r).slice(0, 400));
    console.log('');
    console.log('⚠️ 部署成功 ≠ 能跑通。请用 ms_ci_call.js 真实调用一次验证。');
    process.exit(0);
  } catch (e) {
    const msg = String(e && (e.message || e.errMsg || e));
    console.error('❌ 部署失败');
    console.error('  ' + msg.slice(0, 500));
    if (msg.indexOf('invalid ip') >= 0) {
      console.error('  → IP 白名单问题，跑 ms_ci_whichip.js 查该填什么');
    }
    process.exit(1);
  }
})();
