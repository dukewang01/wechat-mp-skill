/* ms_ci_upload.js —— CI 通道上传（miniprogram-ci，headless）
 *
 * ⚠️ 上传者会显示为「ci机器人N」，改不了。正式发版请用 ms_ide_upload.js。
 *
 * 用法：node ms_ci_upload.js <版本号> [备注]
 *
 * 前置：config.js 里的 appid / projectPath / privateKeyPath；且调用方 IP 在白名单内
 *       （先跑 ms_ci_whichip.js 查该填什么）。
 */
const path = require('path');
const fs = require('fs');
const L = require('./_lib');

const cfg = L.loadConfig();
const version = process.argv[2];
const desc = process.argv[3] || '';

if (!version) { console.error('用法：node ms_ci_upload.js <版本号> [备注]'); process.exit(2); }
if (!cfg.privateKeyPath || !fs.existsSync(cfg.privateKeyPath)) {
  console.error('找不到代码上传密钥：' + cfg.privateKeyPath);
  process.exit(2);
}

let ci;
try { ci = require('miniprogram-ci'); }
catch (e) { console.error('未安装 miniprogram-ci：cd scripts && npm i miniprogram-ci'); process.exit(2); }

const LAST = path.join(__dirname, 'out', 'last_upload.json');

(async () => {
  const project = new ci.Project({
    appid: cfg.appid, type: 'miniProgram',
    projectPath: cfg.projectPath, privateKeyPath: cfg.privateKeyPath,
    ignores: ['node_modules/**/*'],
  });

  console.log('通道：CI（上传者将显示为 ci机器人N）');
  console.log('版本：' + version);
  if (desc) console.log('备注：' + desc);

  const t0 = Date.now();
  try {
    const r = await ci.upload({
      project, version, desc,
      setting: { es6: false, minify: false },
      onProgressUpdate: (p) => {
        const m = typeof p === 'string' ? p : (p && p._msg);
        if (m) console.log('  ' + m);
      },
    });
    const subs = (r && r.subPackageInfo) || [];
    const full = subs.filter((s) => s.name === '__FULL__').reduce((a, s) => a + s.size, 0);

    console.log('✅ 上传成功，耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    subs.forEach((s) => console.log('  ' + s.name + '  ' + s.size + ' B'));

    /* 体积只与**上一次同通道**上传比。
     * ⚠️ 不同通道（CI vs IDE）口径不同，跨通道比较会得出错误结论。
     * ⚠️ 且同长度内容替换体积不变，别把"体积没变"当成"代码没变"。 */
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(LAST, 'utf-8')); } catch (e) { }
    if (prev && prev.total && full) {
      const d = full - prev.total;
      console.log('  体积对比（CI 通道内）：上次 ' + prev.total + ' → 本次 ' + full +
        '（' + (d >= 0 ? '+' : '') + d + ' B）');
      if (Math.abs(d / prev.total) > 0.2) {
        console.log('  ⚠ 变化超 20%，核查是否有意外文件进包');
      }
    }

    fs.mkdirSync(path.dirname(LAST), { recursive: true });
    fs.writeFileSync(LAST, JSON.stringify({
      channel: 'ci', version, desc, total: full || null, subPackageInfo: subs,
      at: new Date().toISOString(),
    }, null, 2));
    process.exit(0);
  } catch (e) {
    const msg = String(e && (e.message || e.errMsg || e));
    console.error('❌ 上传失败');
    console.error('  ' + msg);
    if (msg.indexOf('invalid ip') >= 0) {
      const m = /invalid ip:\s*([0-9.]+)/.exec(msg);
      console.error('');
      console.error('  ⛔ IP 白名单问题。到：公众平台 → 管理 → 开发管理 → 开发设置');
      console.error('     → 小程序代码上传 → IP 白名单，加入：' + (m ? m[1] : '（见报错）'));
      console.error('  ⚠ 该 IP 可能随运营商变化；变化后重跑 ms_ci_whichip.js。');
    }
    process.exit(1);
  }
})();
