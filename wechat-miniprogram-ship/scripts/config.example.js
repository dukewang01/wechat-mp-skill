/* 配置模板 —— 复制成 config.js 后填写
 *
 *   cp config.example.js config.js
 *
 * config.js 已被 .gitignore 忽略，**不要提交到仓库**。
 */
module.exports = {
  /* 小程序 AppID（公众平台 → 设置 → 基本设置） */
  appid: 'wx0000000000000000',

  /* 小程序工程根目录（含 app.json 的目录） */
  projectPath: '/absolute/path/to/your-miniprogram',

  /* 代码上传密钥的绝对路径
   * 获取：公众平台 → 管理 → 开发管理 → 开发设置 → 小程序代码上传 → 生成密钥
   * 下载到的文件名形如 private.<appid>.key
   * ⚠️ 放在工程目录之外，且不要提交到版本库 */
  privateKeyPath: '/absolute/path/to/private.wx0000000000000000.key',

  /* 云开发环境 ID（不用云开发就留空）
   * 获取：开发者工具 → 云开发 → 环境设置 → 环境 ID */
  cloudEnv: '',

  /* 微信开发者工具安装目录
   * Windows 常见：
   *   C:\Program Files (x86)\Tencent\微信web开发者工具
   * macOS 常见：
   *   /Applications/wechatwebdevtools.app/Contents/MacOS */
  devtoolsDir: 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具',

  /* 上传时注释的默认作者名（仅用于日志/台账，不影响平台显示的上传者） */
  author: 'your-name',

  /* 是否使用本地代理（查 IP 白名单时可能用到；留 null 表示不用） */
  proxy: null,          // 例：'http://127.0.0.1:7897'
};
