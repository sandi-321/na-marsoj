// ==UserScript==
// @name         Na MarsOJ
// @namespace    http://tampermonkey.net/
// @version      2.9.50
// @author       Sandi_123
// @match        *://marsoj.cn/*
// @description  这是一个非常强大的MarsOJ优化脚本。
// @icon         https://marsoj.cn/favicon-96x96.png?
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      marsoj.cn
// @connect      cdn.jsdelivr.net
// @connect      fastly.jsdelivr.net
// @connect      raw.githubusercontent.com
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    /* ========== 版本与更新 ========== */
    const CUR_VER = '2.9.50';
    const UPDATE_SOURCES = [
        'https://fastly.jsdelivr.net/gh/sandi-321/na-marsoj@main/dist/na-marsoj.user.js',
        'https://cdn.jsdelivr.net/gh/sandi-321/na-marsoj@main/dist/na-marsoj.user.js',
        'https://raw.githubusercontent.com/sandi-321/na-marsoj/main/dist/na-marsoj.user.js'
    ];

    function addCacheBuster(url) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}_na=${Date.now()}`;
    }

    const cmpVer = (a, b) => {
        const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const x = pa[i] || 0, y = pb[i] || 0;
            if (x > y) return 1; if (x < y) return -1;
        }
        return 0;
    };

    function fetchRemoteVersion() {
        return new Promise((resolve) => {
            let i = 0;
            const tryNext = () => {
                if (i >= UPDATE_SOURCES.length) return resolve(null);
                const url = UPDATE_SOURCES[i++];
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: addCacheBuster(url),
                    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                    anonymous: true,
                    timeout: 8000,
                    onload: res => {
                        if (res.status === 200 && /==UserScript==/.test(res.responseText || '')) {
                            const m = res.responseText.match(/\/\/\s*@version\s+([0-9.]+)/);
                            resolve({ url, version: m ? m[1] : null });
                        } else tryNext();
                    },
                    onerror: tryNext,
                    ontimeout: tryNext
                });
            };
            tryNext();
        });
    }

    /* ========== 工具函数 ========== */
    if (typeof GM_addStyle === 'undefined') {
        window.GM_addStyle = function (css) {
            const s = document.createElement('style');
            s.textContent = css;
            (document.head || document.documentElement).appendChild(s);
            return s;
        };
    }
    if (typeof GM_xmlhttpRequest === 'undefined') {
        window.GM_xmlhttpRequest = function (opts) {
            const headers = { ...(opts.headers || {}), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' };
            fetch(opts.url, {
                method: opts.method || 'GET',
                credentials: 'same-origin',
                headers: headers,
                cache: 'no-store'
            }).then(async r => {
                const text = await r.text();
                if (opts.onload) opts.onload({ status: r.status, responseText: text });
            }).catch(() => { if (opts.onerror) opts.onerror(); });
        };
    }

    const el = (tag, props = {}, ...children) => {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
            else e[k] = v;
        }
        e.append(...children.flat().filter(c => c));
        return e;
    };

    /* ========== 配置存储 ========== */
    const STORE = {
        get(k, d = null) { try { return JSON.parse(localStorage.getItem('na_' + k)) ?? d; } catch { return d; } },
        set(k, v) { localStorage.setItem('na_' + k, JSON.stringify(v)); }
    };

    /* ========== 登录态判定 ========== */
    function isLoggedIn() {
        return !!document.querySelector('.user-avatar, .user-name, [class*="avatar"]') ||
            document.cookie.includes('session') ||
            document.cookie.includes('token');
    }

    /* ========== 路由监听 ========== */
    let lastUrl = location.href;
    function watchRoute(cb) {
        const obs = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                cb(location.href);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        // 同时用 popstate 兜底
        window.addEventListener('popstate', () => cb(location.href));
        return obs;
    }

    /* ========== 设置面板 ========== */
    function settings() {
        if (document.getElementById('na-settings')) return;

        GM_addStyle(`
            #na-settings { position:fixed; top:60px; right:20px; width:340px; max-height:70vh; overflow-y:auto;
                background:#fff; border:1px solid #ddd; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,.15);
                z-index:99999; font:14px/1.5 sans-serif; padding:12px; }
            .na-cat-section { margin-bottom:10px; }
            .na-rw { display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid #eee; }
            .na-wb { padding:4px 10px; border:1px solid #ccc; border-radius:4px; background:#f5f5f5; cursor:pointer; }
            .na-wb:hover { background:#e8e8e8; }
            .na-wp { background:#4caf50; color:#fff; border-color:#4caf50; }
            .na-wp:hover { background:#43a047; }
            .na-cat-nav { display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap; }
            .na-cat-btn { padding:4px 8px; border:1px solid #ddd; border-radius:4px; cursor:pointer; background:#fafafa; }
            .na-cat-btn.active { background:#2196f3; color:#fff; border-color:#2196f3; }
            .na-close { float:right; cursor:pointer; color:#999; font-size:16px; }
        `);

        const secBasic = el('div', { className: 'na-cat-section' },
            el('div', { className: 'na-rw' },
                el('label', { textContent: '启用脚本' }),
                el('input', { type: 'checkbox', checked: STORE.get('enabled', true), onchange: e => STORE.set('enabled', e.target.checked) })
            )
        );

        const secStatus = el('div', { className: 'na-cat-section' },
            el('div', { className: 'na-rw' },
                el('label', { textContent: '登录状态' }),
                el('span', { textContent: isLoggedIn() ? '✅ 已登录' : '❌ 未登录', style: { color: isLoggedIn() ? '#4caf50' : '#f44336' } })
            )
        );

        const secData = el('div', { className: 'na-cat-section' },
            el('div', { className: 'na-rw' },
                el('label', { textContent: '导出配置' }),
                el('button', { className: 'na-wb', textContent: '导出', onclick: () => {
                    const data = {};
                    Object.keys(localStorage).filter(k => k.startsWith('na_')).forEach(k => data[k] = localStorage[k]);
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
                    a.download = 'na-marsoj-config.json'; a.click();
                } })
            ),
            el('div', { className: 'na-rw' },
                el('label', { textContent: '导入配置' }),
                el('input', { type: 'file', accept: '.json', onchange: e => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        try { Object.assign(localStorage, JSON.parse(reader.result)); location.reload(); }
                        catch { alert('导入失败'); }
                    };
                    reader.readAsText(e.target.files[0]);
                } })
            )
        );

        /* 更新分类 */
        const lblCurVer = el('label', { textContent: `当前版本：v${CUR_VER}`, style: { color: '#666', fontSize: '12px' } });
        const btnCheck = el('button', { className: 'na-wb', textContent: '检查更新' });
        const updTip = el('span', { textContent: '', style: { fontSize: '12px', color: '#888' } });
        btnCheck.onclick = () => {
            btnCheck.disabled = true; updTip.textContent = '正在探测可用线路…';
            fetchRemoteVersion().then(r => {
                btnCheck.disabled = false;
                if (!r) { updTip.textContent = '所有线路均不可达'; return; }
                const c = cmpVer(r.version, CUR_VER);
                if (c <= 0) { updTip.textContent = `已是最新 v${CUR_VER}`; return; }
                updTip.textContent = `发现新版 v${r.version}`;
                const btnDo = el('button', { className: 'na-wb na-wp', textContent: `更新到 v${r.version}`, onclick: () => GM_openInTab(r.url, { active: true }) });
                updTip.after(btnDo);
            });
        };
        const rowUpdate = el('div', { className: 'na-rw' });
        rowUpdate.append(
            el('label', { textContent: '脚本更新', style: { color: '#999', fontSize: '12px' } }),
            el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, lblCurVer, btnCheck, updTip)
        );
        const secUpdate = el('div', { className: 'na-cat-section' }); secUpdate.append(rowUpdate);

        const sectionMap = { basic: secBasic, status: secStatus, data: secData, update: secUpdate };
        const contentArea = el('div', { className: 'na-content' }, secBasic, secStatus, secData, secUpdate);
        const catDefs = [{ id: 'basic', name: '基本' }, { id: 'status', name: '状态' }, { id: 'data', name: '数据' }, { id: 'update', name: '更新' }];

        const nav = el('div', { className: 'na-cat-nav' },
            catDefs.map(d => el('button', { className: 'na-cat-btn' + (d.id === 'basic' ? ' active' : ''), textContent: d.name,
                onclick: e => {
                    Object.values(sectionMap).forEach(s => s.style.display = 'none');
                    sectionMap[d.id].style.display = '';
                    nav.querySelectorAll('.na-cat-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                }
            }))
        );

        const panel = el('div', { id: 'na-settings' },
            el('span', { className: 'na-close', textContent: '✕', onclick: () => panel.remove() }),
            el('h3', { textContent: 'Na MarsOJ 设置', style: { margin: '0 0 10px' } }),
            nav, contentArea
        );
        document.body.appendChild(panel);
    }

    /* ========== 主入口 ========== */
    function main() {
        if (!STORE.get('enabled', true)) return;

        // 添加设置按钮
        const btn = el('button', { textContent: 'Na设置', className: 'na-wb',
            style: { position: 'fixed', bottom: '20px', right: '20px', zIndex: 99998 },
            onclick: settings
        });
        document.body.appendChild(btn);

        // 路由变化处理
        watchRoute(url => {
            console.log('[Na] route changed:', url);
        });

        // 初始化完成提示
        console.log(`%c[Na MarsOJ] v${CUR_VER} loaded`, 'color:#4caf50;font-weight:bold');
    }

    /* ========== 启动（延迟执行避免卡顿） ========== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(main, 500));
    } else {
        setTimeout(main, 500);
    }

})();