// Clash Verge Rev — Script 扩展（薄覆盖层）
//
// 机场订阅自 2026-11 起自带完整的服务分组（47 个策略组、约 1.9 万条规则），
// 本脚本不再重建分流，只在其上补几层个人规则：
//
//   1. 个人覆盖层：广告拦截 / 强制直连 / 强制代理 / Antigravity / Oracle
//   2. Google Play 签名下载 CDN 直连（机场把它归进 Google 组，会被送代理）
//   3. 修正机场规则里的已知问题：google.com.xx 被误写成 ccTLD 级后缀、重复规则、
//      以及因 find-process-mode: off 而永远不生效的进程规则
//   4. 补齐本机、私网、IPv6 直连（机场只给了 10/8、172.16/12、192.168/16）
//
// 机场原生规则原样保留、顺序不动；本脚本的规则插在最前面。
// 仓库：https://github.com/pmwl0128/clash-rules

function main(config, profileName) {
  delete config['global-client-fingerprint'];

  // ============ 配置区：改这里即可 ============
  var GH = 'https://raw.githubusercontent.com/pmwl0128/clash-rules/main/providers/';

  // 机场的节点容器组：所有节点都挂在它下面，规则里当作「主力节点」用。
  // 换机场后组名变了只改这一行；找不到时脚本会自动挑一个成员全是节点的组，再不行退化为 DIRECT。
  var NODE = 'Premium';

  var ADS = '🛑 广告拦截';
  var AGY = '🚀 Antigravity';
  var ORC = '☁️ Oracle';
  var PDL = '📥 Play 下载';
  // ============ 配置区结束 ============

  var names = [];
  (config.proxies || []).forEach(function (p) {
    if (p && typeof p.name === 'string') names.push(p.name);
  });
  if (!names.length) return config; // 拿不到节点就原样返回，避免生成空组

  var airportGroups = config['proxy-groups'] || [];

  // ---- 1. 找「主力节点」 ----
  function isNodeGroup(g) {
    if (g.type !== 'select') return false;
    var m = g.proxies || [];
    if (m.length !== names.length) return false;
    for (var k = 0; k < names.length; k++) {
      if (m.indexOf(names[k]) < 0) return false;
    }
    return true;
  }
  var upstream = 'DIRECT';
  for (var i = 0; i < airportGroups.length; i++) {
    if (airportGroups[i].name === NODE) { upstream = NODE; break; }
  }
  if (upstream === 'DIRECT') {
    for (var j = 0; j < airportGroups.length; j++) {
      if (isNodeGroup(airportGroups[j])) { upstream = airportGroups[j].name; break; }
    }
  }

  function uniq(arr) {
    var out = [], seen = {};
    arr.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  // ---- 2. 策略组 ----
  var us = [], rest = [];
  names.forEach(function (n) {
    if (n.indexOf('🇺🇸') === 0) us.push(n); else rest.push(n);
  });
  // Antigravity 需要与其它环境不同的出口，美国节点优先，默认第一个美国节点
  var agyMembers = uniq(us.concat([upstream, 'DIRECT'], rest));

  var ourGroups = [
    { name: AGY, type: 'select', proxies: agyMembers },
    { name: PDL, type: 'select', proxies: uniq(['DIRECT'].concat([upstream], names)) },
    // 机场没有任何 OCI 规则，默认与机场兜底一致走主节点，需要直连时在面板切 DIRECT
    { name: ORC, type: 'select', proxies: uniq([upstream].concat(names, ['DIRECT'])) },
    { name: ADS, type: 'select', proxies: ['REJECT', 'DIRECT'] }
  ];
  // 面板顺序：节点容器组（Premium）置顶——其它组的成员列表都引用它，是真正的
  // 顶层选择；其次是本脚本的四个组；机场原有的服务组顺序不变，跟在后面。
  var top = [], other = [];
  airportGroups.forEach(function (g) {
    if (g.name === upstream) top.push(g); else other.push(g);
  });
  config['proxy-groups'] = top.concat(ourGroups, other);

  // ---- 3. rule-provider（个人层，跟仓库走；订阅自带的合并保留） ----
  function prov(name, behavior) {
    return {
      type: 'http', behavior: behavior || 'domain', format: 'yaml',
      url: GH + name + '.yaml', path: './rules/' + name + '.yaml',
      interval: 86400, proxy: upstream
    };
  }
  var providers = config['rule-providers'] || {};
  providers['my-reject'] = prov('reject');
  providers['my-direct'] = prov('direct');
  providers['my-proxy'] = prov('proxy');
  providers['my-antigravity'] = prov('antigravity');
  providers['my-oracle'] = prov('oracle');
  providers['my-oracle-ip'] = prov('oracle-ip', 'ipcidr');
  config['rule-providers'] = providers;

  // ---- 4. 前置规则 ----
  var rules = [];

  // 4.1 本机与私网（机场缺的几条）
  ['127.0.0.0/8', '100.64.0.0/10'].forEach(function (c) {
    rules.push('IP-CIDR,' + c + ',DIRECT,no-resolve');
  });
  rules.push('IP-CIDR6,fe80::/10,DIRECT,no-resolve');
  rules.push('IP-CIDR6,fc00::/7,DIRECT,no-resolve');
  rules.push('IP-CIDR6,::1/128,DIRECT,no-resolve');

  // 4.2 广告拦截
  rules.push('RULE-SET,my-reject,' + ADS);
  rules.push('GEOSITE,category-ads-all,' + ADS);

  // 4.3 个人覆盖层
  rules.push('RULE-SET,my-direct,DIRECT');
  rules.push('RULE-SET,my-proxy,' + upstream);

  // 4.4 Google Play 签名下载 CDN
  // 商店点更新后 Play 会跳到 rrN---sn-xxxx.xn--ngstr-lra8j.com（gvt1 的 punycode），
  // 这类主机解析到国内 GGC 边缘，被送代理后 TLS 握手会被重置，表现为所有应用卡 0%。
  // 机场把它收进了 Google 组（默认代理），所以这里单独放行签名主机。
  rules.push('DOMAIN-REGEX,^rr[0-9]+---sn-[a-z0-9-]+\\.xn--ngstr-lra8j\\.com,' + PDL);

  // 4.5 Antigravity：进程规则兜底（域名清单之外的请求），再按域名匹配
  rules.push('PROCESS-NAME,agy.exe,' + AGY);
  rules.push('PROCESS-NAME,agy,' + AGY);
  rules.push('RULE-SET,my-antigravity,' + AGY);

  // 4.6 Oracle / OCI：域名 + 公开 IP 段（IP 段带 no-resolve，不干扰域名规则）
  rules.push('RULE-SET,my-oracle,' + ORC);
  rules.push('RULE-SET,my-oracle-ip,' + ORC + ',no-resolve');

  // ---- 5. 清理机场规则 ----
  // 5.1 google.com.xx 被生成器截成了 ccTLD 级后缀：DOMAIN-SUFFIX,hk,Google 会吃掉所有 .hk 域名。
  //     这些后缀本来就被 DOMAIN-SUFFIX,google.com 覆盖，删掉不损失任何归属。
  var bogus = {};
  ['ar', 'au', 'bo', 'br', 'co', 'cu', 'do', 'ec', 'eg', 'gt', 'hk', 'ly', 'mx', 'my',
   'ni', 'pa', 'pe', 'ph', 'pk', 'pr', 'py', 'sg', 'sv', 'tr', 'tw', 'ua', 'uy', 'vn']
    .forEach(function (cc) { bogus['DOMAIN-SUFFIX,' + cc + ',Google'] = true; });

  // 5.2 顺带去重（GEOIP,CN 两条、微信 6 条各重复了一次）
  var kept = [], seenRule = {};
  (config.rules || []).forEach(function (rule) {
    var s = String(rule);
    if (bogus[s] || seenRule[s]) return;
    seenRule[s] = 1;
    kept.push(s);
  });

  config.rules = rules.concat(kept);

  // ---- 6. 进程规则需要进程匹配；机场写的 66 条 PROCESS-NAME 在 off 下从不生效 ----
  config['find-process-mode'] = 'strict';

  return config;
}
