/**
 * Clawkeeper Path Guard (Windows Optimized)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RULES_PATH = path.join(__dirname, '..', 'config', 'core-rules.json');

let cachedRules = null;
const DEFAULT_FAILURE_POLICY = 'fail-closed';
const IS_WINDOWS = os.platform() === 'win32';

/**
 * 辅助函数：统一路径格式
 * 1. 将所有反斜杠 \ 转为正斜杠 /
 * 2. 在 Windows 下转为全小写，防止大小写绕过
 */
function unifyPath(p) {
  if (!p) return '';
  let normalized = p.replace(/\\/g, '/');
  return IS_WINDOWS ? normalized.toLowerCase() : normalized;
}

/**
 * Load (and cache) protected paths + config from core-rules.json.
 */
export function loadProtectedPaths(rulesPath = DEFAULT_RULES_PATH) {
  if (cachedRules && cachedRules._source === rulesPath) return cachedRules;
  const raw = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
  
  const rules = (raw.protectedPaths || []).map((r) => {
    const expanded = expandHome(r.pattern);
    return {
      ...r,
      regex: globToRegex(expanded),
      expanded: expanded,
      unified: unifyPath(expanded), // 存储统一化后的路径
    };
  });
  
  const config = raw.pathGuard || { enabled: true, failurePolicy: 'fail-closed', bashLikeTools: [] };
  cachedRules = { rules, config, _source: rulesPath };
  return cachedRules;
}

export function resetPathGuardCache() { cachedRules = null; }

export function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * 转换 Glob 为 Regex，支持 Windows/Unix 双斜杠
 */
export function globToRegex(glob) {
  let p = glob.replace(/\\/g, '/'); // 内部统一处理
  let re = '^';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') { re += '.*'; i++; }
      else { re += '[^/\\\\]*'; } // 同时匹配正反斜杠
    } else if (c === '?') {
      re += '[^/\\\\]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  re += '$';
  // Windows 下必须不区分大小写
  return new RegExp(re, IS_WINDOWS ? 'i' : '');
}

/**
 * 规范化路径：处理相对路径、符号链接并统一斜杠
 */
export function normalizePath(input, cwd = process.cwd()) {
  if (typeof input !== 'string' || !input) return null;
  let p = expandHome(input.trim());
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1);
  }
  if (!path.isAbsolute(p)) p = path.resolve(cwd, p);
  
  try {
    // 尽量获取真实路径（处理快捷方式或软链接）
    return fs.realpathSync(p);
  } catch {
    // 如果文件不存在，至少返回绝对路径
    return path.resolve(p);
  }
}

/**
 * 核心匹配逻辑：使用统一化路径进行比对
 */
export function matchProtected(absPath, rules) {
  if (!absPath) return null;
  
  const target = unifyPath(absPath); // 统一化输入的绝对路径

  for (const rule of rules) {
    // 1. 正则匹配
    if (rule.regex.test(absPath)) return rule;

    // 2. 目录前缀匹配 (针对 /** 结尾的规则)
    if (rule.pattern.endsWith('/**')) {
      // 获取去掉 /** 后的统一化前缀，例如 "c:/users/lenovo/desktop"
      const prefix = unifyPath(rule.expanded.slice(0, -3));
      
      if (
        target === prefix || 
        target.startsWith(prefix + '/') || 
        target.startsWith(prefix + '\\') // 额外兼容 Windows 系统可能出现的边缘情况
      ) {
        return rule;
      }
    }
  }
  return null;
}

const PATH_TOKEN_RE = /(?:^|[\s'"`=:;(){}\[\],])(~\/[^\s'"`;|&()<>]+|[A-Za-z]:[\\\/][^\s'"`;|&()<>]+|\/[^\s'"`;|&()<>]+|\.{1,2}\/[^\s'"`;|&()<>]+)/g;

export function extractPathsFromCommand(command) {
  if (typeof command !== 'string' || !command) return [];
  const out = new Set();
  let m;
  PATH_TOKEN_RE.lastIndex = 0;
  while ((m = PATH_TOKEN_RE.exec(command)) !== null) {
    const token = m[1];
    if (token.length >= 2) out.add(token);
  }
  return [...out];
}

function collectStringValues(obj, out = []) {
  if (obj == null) return out;
  if (typeof obj === 'string') { out.push(obj); return out; }
  if (Array.isArray(obj)) { for (const v of obj) collectStringValues(v, out); return out; }
  if (typeof obj === 'object') { for (const v of Object.values(obj)) collectStringValues(v, out); return out; }
  return out;
}

export function extractPathsFromParams(toolName, params, opts = {}) {
  const bashLike = new Set((opts.bashLikeTools || []).map((s) => s.toLowerCase()));
  const tName = String(toolName || '').toLowerCase();
  const looksLikeBash = bashLike.has(tName) || /bash|shell|exec|command|terminal/.test(tName);
  const candidates = new Set();

  if (looksLikeBash) {
    const p = params || {};
    const cmd = [p.command, p.cmd, p.script, p.input, p.code, p.bash, p.shell]
      .filter((v) => typeof v === 'string').join('\n');
    const commandText = cmd || collectStringValues(params).join('\n');
    for (const t of extractPathsFromCommand(commandText)) candidates.add(t);
  }

  for (const v of collectStringValues(params)) {
    const s = v.trim();
    if (!s) continue;
    // 增加对 Windows 盘符路径 (C:\...) 的识别
    if (s.startsWith('~/') || s.startsWith('~\\') || path.isAbsolute(s) || /^[A-Za-z]:\\/.test(s)) {
      candidates.add(s);
    }
    else if (s.startsWith('./') || s.startsWith('../')) candidates.add(s);
    else if (/^(id_rsa|id_ed25519|\.env|credentials|shadow|sudoers)$/i.test(s)) candidates.add(s);
  }
  return [...candidates];
}

export function guardBeforeToolCall(event) {
  let loaded;
  try {
    loaded = loadProtectedPaths();
  } catch (err) {
    const policy = cachedRules?.config?.failurePolicy || DEFAULT_FAILURE_POLICY;
    if (policy === 'fail-closed') {
      return { block: true, error: err.message, reason: 'path-guard rule load failed (fail-closed policy)' };
    }
    return { block: false, error: err.message };
  }
  const { rules, config } = loaded;
  if (!config.enabled) return { block: false };

  const candidates = extractPathsFromParams(event.toolName, event.params, {
    bashLikeTools: config.bashLikeTools,
  });

  for (const candidate of candidates) {
    const resolved = normalizePath(candidate);
    // 检查解析后的绝对路径，同时也检查原始输入（处理 ~ 情况）
    const hit = matchProtected(resolved, rules) || matchProtected(normalizePath(expandHome(candidate)), rules);
    if (hit) {
      return {
        block: true,
        matched: hit.pattern,
        candidate,
        resolved,
        severity: hit.severity,
        reason: hit.reason,
      };
    }
  }
  return { block: false };
}