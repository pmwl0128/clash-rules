// Clash Verge Rev — Script 扩展
// 作用：保留订阅节点与机场自建服务规则，其余分流规则全部由本脚本重建。
// 依赖：mihomo (Clash.Meta) 内核的 GEOSITE 规则与本地 geosite.dat。
// 仓库：https://github.com/pmwl0128/clash-rules

function main(config, profileName) {
  // ============ 配置区：改这里即可，下面的逻辑不用动 ============
  var GH = 'https://raw.githubusercontent.com/pmwl0128/clash-rules/main/providers/';

  var MAIN = '🚀 主力节点';    // 主力组（手选节点，改这里可自定义名称）
  var AUTO = '♻️ GTM 兜底';     // 自动兜底组
  var LEAK = '🐟 漏网之鱼';      // 总兜底
  var ADS  = '🛑 广告拦截';
  var AGY  = '🚀 Antigravity';

  // 保留订阅原始规则的组（机场自建服务，规则内容只有机场自己知道）
  // 脚本只按组名提取，不硬编码任何机场域名，因此可安全公开
  var KEEP_GROUPS = ['📺 Emby影院'];

  var CHECK_URL = 'http://cp.cloudflare.com/generate_204';
  var INTERVAL = 120;
  var LINE = 'GTM';
  // GTM 兜底优先级：SG 满倍率 > JP > US > SG 低倍率 > TW > HK
  var TIERS = [
    { flag: '🇸🇬', fullRateOnly: true }, { flag: '🇯🇵' }, { flag: '🇺🇸' },
    { flag: '🇸🇬' }, { flag: '🇨🇳' }, { flag: '🇭🇰' }
  ];

  // geosite 分类 -> 策略组。顺序即匹配优先级，越靠前越优先。
  var GEO_MAP = [
    // AI 服务（必须在 category-dev / geolocation-!cn 之前）
    ['anthropic',        '💬 Claude'],
    ['openai',           '💬 OpenAi'],
    ['google-gemini',    '💬 Gemini'],
    ['cursor',           '💬 Cursor'],
    ['github-copilot',   '🛩 Copilot'],
    ['perplexity',       '💬 Perplexity'],
    // 开发资源（放在 AI 兜底之前，npm/pypi 才不会被 AI 分类吃掉）
    ['category-dev',     '💻 开发资源'],
    ['github',           '💻 开发资源'],
    ['category-ai-!cn',  '🤖 AI 其他'],     // 其余 AI 服务兜底
    // 流媒体
    ['netflix',          '📺 Netflix'],
    ['disney',           '📺 Disney'],
    ['youtube',          '📺 YouTube'],
    ['hbo',              '📺 HBOMAX'],
    ['twitch',           '🐭 Twitch'],
    ['bilibili',         '📺 Bilibili'],
    ['bahamut',          '🌏 巴哈姆特'],
    // 社交
    ['telegram',         '📲 Telegram'],
    ['twitter',          '🌏 Twitter'],
    ['discord',          '🌏 Discord'],
    ['tiktok',           '🌏 Tiktok'],
    // 厂商
    ['apple',            '🍎 Apple'],
    ['microsoft',        'Ⓜ️ 微软'],
    ['bing',             '✈️ Bing'],
    ['dropbox',          '🌏 Dropbox'],
    // 游戏与其它
    ['steam',            '🌏 Steam'],
    ['xbox',             '🌏 Xbox'],
    ['category-pt',      '🌏 PrivateTracker']
  ];

  // 需要建的策略组（顺序即面板显示顺序）
  var GROUPS = [
    '🚀 Antigravity', '💬 Claude', '💬 OpenAi', '💬 Gemini', '💬 Cursor',
    '🛩 Copilot', '💬 Perplexity', '🤖 AI 其他', '💻 开发资源',
    '📺 Netflix', '📺 Disney', '📺 YouTube', '📺 HBOMAX', '🐭 Twitch',
    '📺 Emby影院', '📺 Bilibili', '🌏 巴哈姆特',
    '📲 Telegram', '🌏 Twitter', '🌏 Discord', '🌏 Tiktok', '🌏 Dropbox',
    '🍎 Apple', '🍎 Apple TV', 'Ⓜ️ 微软', '✈️ Bing',
    '🌏 Steam', '🌏 Xbox', '🌏 PrivateTracker', '🌏 GFWlist'
  ];
  // ============ 配置区结束 ============

  var proxies = config.proxies || [];
  if (!proxies.length) return config;          // 保护：拿不到节点就原样返回
  var names = [];
  proxies.forEach(function (p) { if (p && typeof p.name === 'string') names.push(p.name); });
  if (!names.length) return config;

  // ---- 1. GTM 兜底池 ----
  function rate(n) { var m = n.match(/(\d+(?:\.\d+)?)x/); return m ? parseFloat(m[1]) : 1; }
  var pool = [], seen = {};
  TIERS.forEach(function (t) {
    names.forEach(function (n) {
      if (seen[n] || n.indexOf(t.flag) !== 0 || n.indexOf(LINE) < 0) return;
      if (t.fullRateOnly && rate(n) < 1) return;
      seen[n] = true; pool.push(n);
    });
  });

  // ---- 2. 保留机场自建服务规则 ----
  // 机场官网一类域名不必单独保留：它们会落到 geosite:geolocation-!cn，同样走代理
  var keep = [];
  (config.rules || []).forEach(function (r) {
    var s = String(r);
    for (var i = 0; i < KEEP_GROUPS.length; i++) {
      if (s.indexOf(KEEP_GROUPS[i]) >= 0) { keep.push(s); return; }
    }
  });

  // ---- 3. rule-provider ----
  function prov(name) {
    return {
      type: 'http', behavior: 'domain', format: 'yaml',
      url: GH + name + '.yaml', path: './rules/' + name + '.yaml',
      interval: 86400, proxy: MAIN
    };
  }
  config['rule-providers'] = {
    'my-antigravity': prov('antigravity'),
    'my-direct':      prov('direct'),
    'my-proxy':       prov('proxy'),
    'my-reject':      prov('reject')
  };

  // ---- 4. 策略组 ----
  var groups = [];
  groups.push({ name: MAIN, type: 'select', proxies: names });
  if (pool.length) {
    groups.push({ name: AUTO, type: 'fallback', proxies: pool,
                  url: CHECK_URL, interval: INTERVAL, lazy: false });
  }
  var head = [MAIN];
  if (pool.length) head.push(AUTO);
  head.push('DIRECT');

  GROUPS.forEach(function (g) {
    var list;
    if (g === AGY) {
      // agy 需要与其它环境不同的出口，美国节点优先
      var us = [], rest = [];
      names.forEach(function (n) {
        if (n.indexOf('🇺🇸') === 0 && n.indexOf(LINE) >= 0) us.push(n); else rest.push(n);
      });
      list = us.concat([MAIN]).concat(rest);
    } else {
      list = head.concat(names);
    }
    groups.push({ name: g, type: 'select', proxies: list });
  });
  groups.push({ name: ADS, type: 'select', proxies: ['REJECT', 'DIRECT'] });
  groups.push({ name: LEAK, type: 'fallback',
                proxies: (pool.length ? [MAIN, AUTO, 'DIRECT'] : [MAIN, 'DIRECT']),
                url: CHECK_URL, interval: INTERVAL, lazy: false });
  config['proxy-groups'] = groups;

  // 已建组名集合，用于过滤无效引用
  var built = {};
  groups.forEach(function (g) { built[g.name] = true; });

  // ---- 5. 规则 ----
  var rules = [];

  // 5.1 本机与局域网
  ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10']
    .forEach(function (c) { rules.push('IP-CIDR,' + c + ',DIRECT,no-resolve'); });
  rules.push('IP-CIDR6,fe80::/10,DIRECT,no-resolve');

  // 5.2 agy —— 进程规则最优先，域名规则兜底
  rules.push('PROCESS-NAME,agy.exe,' + AGY);
  rules.push('RULE-SET,my-antigravity,' + AGY);

  // 5.3 机场自建服务
  keep.forEach(function (r) { rules.push(r); });

  // 5.4 个人覆盖层，优先于所有 geosite 分类
  rules.push('RULE-SET,my-reject,' + ADS);
  rules.push('RULE-SET,my-direct,DIRECT');
  rules.push('RULE-SET,my-proxy,' + MAIN);

  // 5.5 广告拦截
  rules.push('GEOSITE,category-ads-all,' + ADS);

  // 5.6 Apple TV：geosite 无此分类，显式补充（须在 GEOSITE,apple 之前）
  if (built['🍎 Apple TV']) {
    rules.push('DOMAIN-SUFFIX,tv.apple.com,🍎 Apple TV');
    rules.push('DOMAIN-SUFFIX,appletv.com,🍎 Apple TV');
  }

  // 5.7 分类规则
  GEO_MAP.forEach(function (m) {
    if (built[m[1]]) rules.push('GEOSITE,' + m[0] + ',' + m[1]);
  });

  // 5.8 IP 段补充（域名规则漏掉的连接）
  if (built['📲 Telegram']) rules.push('GEOIP,telegram,📲 Telegram,no-resolve');

  // 5.9 兜底顺序：国内直连 -> 境外走主力 -> 其余进兜底组
  rules.push('GEOSITE,cn,DIRECT');
  rules.push('GEOIP,CN,DIRECT,no-resolve');
  if (built['🌏 GFWlist']) rules.push('GEOSITE,geolocation-!cn,🌏 GFWlist');
  rules.push('MATCH,' + LEAK);

  config.rules = rules;

  // 进程规则需要，订阅原值为 off
  config['find-process-mode'] = 'strict';

  return config;
}
