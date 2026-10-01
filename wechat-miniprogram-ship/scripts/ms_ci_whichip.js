/* ms_ci_whichip.js —— 查「平台看到的调用方 IP」，用于填 IP 白名单
 *
 * ⚠️ 为什么需要专用工具：
 *   如果本机走代理，普通探针查到的出口 IP **不是**平台看到的 IP。
 *     · 普通探针（ipify 等）→ 代理出口 IP（稳定，但平台不认）
 *     · 平台侧看到的        → 真实客户端 IP（会变，要填的是这个）
 *   两个数不一样，容易填错。
 *
 * 做法：跑一次真实的 CI 预览，从 `invalid ip: x.x.x.x` 报错里取出该填的 IP。
 *       若已放行，则报告"无需修改"。
 *
 * 用法：node ms_ci_whichip.js
 * 退出码：0=已放行；3=需要更新白名单；1=其他失败
 */
const path = require('path');
const fs = require('fs');
const L = require('./_lib');

const cfg = L.loadConfig();
if (!cfg.privateKeyPath || !fs.existsSync(cfg.privateKeyPath)) {
  console.error('找不到代码上传密钥：' + cfg.privateKeyPath);
  process.exit(2);
}

let ci;
try { ci = require('miniprogram-ci'); }
catch (e) { console.error('未安装 miniprogram-ci：cd scripts && npm i miniprogram-ci'); process.exit(2); }

const out = path.join(__dirname, 'out', 'whichip.jpg');
fs.mkdirSync(path.dirname(out), { recursive: true });

(async () => {
  const project = new ci.Project({
    appid: cfg.appid, type: 'miniProgram',
    projectPath: cfg.projectPath, privateKeyPath: cfg.privateKeyPath,
    ignores: ['node_modules/**/*'],
  });

  console.log('探测中（会编译一次，约 10–30s）…');
  try {
    await ci.preview({
      project, desc: 'whichip',
      setting: { es6: false, minify: false },
      qrcodeFormat: 'image', qrcodeOutputDest: out,
    });
    console.log('');
    console.log('★ 白名单已放行 —— 当前调用方 IP 在白名单内，无需修改。');
    process.exit(0);
  } catch (e) {
    const msg = String(e && (e.message || e.errMsg || e));
    const m = /invalid ip:\s*([0-9.]+)/.exec(msg);
    console.log('');
    if (m) {
      console.log('★ 平台看到的调用方 IP = ' + m[1]);
      console.log('  → 填到：公众平台 → 管理 → 开发管理 → 开发设置');
      console.log('         → 小程序代码上传 → IP 白名单');
      console.log('  ⚠ 该 IP 可能随运营商变化；变化后重跑本脚本再更新。');
      process.exit(3);
    }
    console.error('未识别的失败：' + msg);
    process.exit(1);
  }
})();
