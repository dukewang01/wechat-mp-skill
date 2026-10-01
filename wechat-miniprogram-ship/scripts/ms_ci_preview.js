/* ms_ci_preview.js —— CI 通道生成预览二维码（headless）
 *
 * 用法：node ms_ci_preview.js [输出路径] [描述]
 *
 * 与上传同通道，同样受 IP 白名单约束。
 */
const path = require('path');
const fs = require('fs');
const L = require('./_lib');

const cfg = L.loadConfig();
const out = process.argv[2] || path.join(__dirname, 'out', 'preview.jpg');
const desc = process.argv[3] || 'preview';

if (!cfg.privateKeyPath || !fs.existsSync(cfg.privateKeyPath)) {
  console.error('找不到代码上传密钥：' + cfg.privateKeyPath);
  process.exit(2);
}

let ci;
try { ci = require('miniprogram-ci'); }
catch (e) { console.error('未安装 miniprogram-ci：cd scripts && npm i miniprogram-ci'); process.exit(2); }

fs.mkdirSync(path.dirname(out), { recursive: true });

(async () => {
  const project = new ci.Project({
    appid: cfg.appid, type: 'miniProgram',
    projectPath: cfg.projectPath, privateKeyPath: cfg.privateKeyPath,
    ignores: ['node_modules/**/*'],
  });

  console.log('输出：' + out);
  if (cfg.proxy) { ci.proxy(cfg.proxy); console.log('代理：' + cfg.proxy); }

  try {
    await ci.preview({
      project, desc,
      setting: { es6: false, minify: false },
      qrcodeFormat: 'image', qrcodeOutputDest: out,
      onProgressUpdate: (p) => {
        const m = typeof p === 'string' ? p : (p && p._msg);
        if (m) console.log('  ' + m);
      },
    });
    console.log('✅ 预览成功：' + out);
    process.exit(0);
  } catch (e) {
    const msg = String(e && (e.message || e.errMsg || e));
    console.error('❌ 预览失败：' + msg);
    if (msg.indexOf('invalid ip') >= 0) {
      console.error('  → IP 白名单问题，跑 ms_ci_whichip.js 查该填什么');
    }
    process.exit(1);
  }
})();
