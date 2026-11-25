// ==UserScript==
// @name         Na MarsOJ
// @namespace    http://tampermonkey.net/
// @version      2.9.52
// @author       sandi_123
// @match        *://marsoj.cn/*
// @description  这是一个非常强大的MarsOJ优化脚本。
// @icon         https://marsoj.cn/favicon-96x96.png?
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      ://googleapis.com
// @connect      marsoj.cn
// @connect      cdn.jsdelivr.net
// @connect      fastly.jsdelivr.net
// @connect      raw.githubusercontent.com
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';
    function addCacheBuster(url) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}_na=${Date.now()}`;
    }
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

    /* ========== 版本与更新 ========== */
    const CUR_VER = '2.9.52';
    const UPDATE_SOURCES = [
        'https://fastly.jsdelivr.net/gh/sandi-321/na-marsoj@main/dist/na-marsoj.user.js',
        'https://cdn.jsdelivr.net/gh/sandi-321/na-marsoj@main/dist/na-marsoj.user.js',
        'https://raw.githubusercontent.com/sandi-321/na-marsoj/main/dist/na-marsoj.user.js'
    ];
    const cmpVer = (a, b) => {
        const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const x = pa[i] || 0, y = pb[i] || 0;
            if (x > y) return 1; if (x < y) return -1;
        }
        return 0;
    };

    // 单个源探测，返回 {url, version} 或 null
    function fetchVersionFromSource(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: addCacheBuster(url),
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                anonymous: true,
                timeout: 8000,
                onload: res => {
                    if (res.status === 200 && /==UserScript==/.test(res.responseText || '')) {
                        const m = res.responseText.match(/\/\/\s*@version\s+([0-9.]+)/);
                        resolve(m ? { url, version: m[1] } : null);
                    } else {
                        resolve(null);
                    }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }

    // 并行检查所有源，取版本最新的
    function fetchRemoteVersion() {
        return Promise.all(UPDATE_SOURCES.map(url => fetchVersionFromSource(url))).then(results => {
            let best = null;
            results.forEach(r => {
                if (r && r.version) {
                    if (!best || cmpVer(r.version, best.version) > 0) best = r;
                }
            });
            return best; // null 表示全部失败
        });
    }

    const KT = 'na_t', KH = 'na_h', KR = 'na_rc', KREDIRECT = 'na_redirect_enable';
    const KP_EN = 'na_partial_enable', KF_EN = 'na_fail_enable', KLHE = 'na_latest_hw_enable', KHC = 'na_my_class_cid';
    const U1 = 'https://marsoj.cn/homework', U2 = U1 + '?tab=classes';
    const OPTS = [
        { v: U1, t: '默认 (/homework)' },
        { v: U2, t: '班级列表 (/homework?tab=classes)' },
        { v: 'na_first_class', t: '我的首个班级' }
    ];
    const getT = () => localStorage.getItem(KT) !== null ? +localStorage.getItem(KT) : 3000;
    const getH = () => { const v = localStorage.getItem(KH); return ([U1, U2, 'na_first_class'].includes(v)) ? v : U1; };
    const getRC = () => { try { return JSON.parse(localStorage.getItem(KR) || '{}'); } catch { return {}; } };
    const getRedirectEnable = () => localStorage.getItem(KREDIRECT) !== 'false';
    const getPartialEnable = () => localStorage.getItem(KP_EN) !== 'false';
    const getFailEnable = () => localStorage.getItem(KF_EN) !== 'false';
    const getLatestHwEnable = () => localStorage.getItem(KLHE) !== 'false';
    const el = (t, p = {}, ...c) => { const n = Object.assign(document.createElement(t), p); n.append(...c); return n; };
    function formatDeadline(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr.replace(/-/g, '/'));
        if (isNaN(d.getTime())) return dateStr;
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} 截止`;
    }
    function getHomeworkDeadlineFromDetail(id) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: addCacheBuster(`https://marsoj.cn/homework/${id}`),
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                anonymous: false,
                onload: res => {
                    try {
                        const text = res.responseText || '';
                        if (/<input[^>]*type=["']?password/i.test(text)) return resolve({ deadline: '', submitted: '', accepted: '', total: '' });
                        const doc = new DOMParser().parseFromString(text, 'text/html');
                        let deadline = '';
                        const times = doc.querySelectorAll('.hw-times .time:not(.relative)');
                        if (times.length >= 2) deadline = times[1].textContent.trim();
                        else {
                            const personal = doc.querySelector('.hw-personal-times .time:not(.relative)');
                            if (personal) deadline = personal.textContent.trim();
                            else {
                                const scripts = [...doc.querySelectorAll('script:not([src])')].map(s => s.textContent).join('\n');
                                const m = scripts.match(/"penaltySince"\s*:\s*"([^"]+)"/);
                                if (m) {
                                    const d = new Date(m[1]);
                                    if (!isNaN(d)) {
                                        const p = n => String(n).padStart(2, '0');
                                        deadline = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
                                    }
                                }
                            }
                        }
                        let submitted = '', accepted = '', total = '';
                        const progressDivs = doc.querySelectorAll('.au-progress > div');
                        if (progressDivs.length >= 1) { const s = progressDivs[0].querySelector('strong'); if (s) submitted = s.textContent.trim(); }
                        if (progressDivs.length >= 2) { const s = progressDivs[1].querySelector('strong'); if (s) accepted = s.textContent.trim(); }
                        for (let i = 0; i < progressDivs.length; i++) {
                            const txt = progressDivs[i].textContent;
                            const m = txt.match(/\/\s*(\d+)/);
                            if (m) { total = m[1]; break; }
                        }
                        if (!total) {
                            const hp = doc.querySelector('.hp-progress');
                            if (hp) total = hp.getAttribute('aria-valuemax') || '';
                        }
                        resolve({ deadline, submitted, accepted, total });
                    } catch { resolve({ deadline: '', submitted: '', accepted: '', total: '' }); }
                },
                onerror: () => resolve({ deadline: '', submitted: '', accepted: '', total: '' })
            });
        });
    }
    let _myClassCache = null;
    function getMyClassCid() {
        if (_myClassCache) return Promise.resolve(_myClassCache);
        const cached = localStorage.getItem(KHC);
        if (cached) { _myClassCache = cached; return Promise.resolve(cached); }
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: addCacheBuster('https://marsoj.cn/homework?tab=classes'),
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                anonymous: false,
                onload: res => {
                    try {
                        const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
                        if (/<input[^>]*type=["']?password/i.test(res.responseText)) return resolve(null);
                        const links = [...doc.querySelectorAll('a[href*="cid="]')];
                        for (const a of links) { const m = a.getAttribute('href').match(/[?&]cid=([0-9a-f]{24})/); if (m) { _myClassCache = m[1]; localStorage.setItem(KHC, m[1]); return resolve(m[1]); } }
                        resolve(null);
                    } catch { resolve(null); }
                },
                onerror: () => resolve(null)
            });
        });
    }
    let _latestHomeworkCache = null;
    function getLatestHomeworkInfo() {
        if (_latestHomeworkCache) return Promise.resolve(_latestHomeworkCache);
        return getMyClassCid().then(cid => {
            if (!cid) return null;
            const url = `https://marsoj.cn/homework?tab=class&mode=personal&cid=${cid}&time=all&progress=all&sort=recent&scope=linked&page=1&pageSize=20`;
            return new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: addCacheBuster(url),
                    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                    anonymous: false,
                    onload: async res => {
                        const text = res.responseText || '';
                        if (/<input[^>]*type=["']?password/i.test(text)) return resolve(null);
                        try {
                            const doc = new DOMParser().parseFromString(text, 'text/html');
                            const links = [...doc.querySelectorAll('a[href^="/homework/"]')]
                                .filter(a => /\/homework\/[0-9a-f]{24}/.test(a.getAttribute('href'))
                                    && !a.classList.contains('nav__item') && !a.closest('nav, header'));
                            if (links.length === 0) return resolve(null);
                            const m = links[0].getAttribute('href').match(/\/homework\/([0-9a-f]{24})/);
                            if (!m) return resolve(null);
                            const id = m[1];
                            const title = links[0].textContent.trim().slice(0, 40) || '最新作业';
                            const detail = await getHomeworkDeadlineFromDetail(id);
                            const deadline = formatDeadline(detail.deadline);
                            const progress = { submitted: detail.submitted, accepted: detail.accepted, total: detail.total };
                            const info = { id, title, deadline, progress };
                            _latestHomeworkCache = info;
                            resolve(info);
                        } catch { resolve(null); }
                    },
                    onerror: () => resolve(null)
                });
            });
        });
    }
    let _firstClassCache = null;
    function getFirstClassId() {
        if (_firstClassCache) return Promise.resolve(_firstClassCache);
        const pick = (doc) => {
            const links = doc.querySelectorAll('a[href*="cid="]');
            for (const a of links) { const m = a.href.match(/[?&]cid=([0-9a-f]{24})/); if (m) return m[1]; }
            return null;
        };
        const now = pick(document);
        if (now) { _firstClassCache = now; return Promise.resolve(now); }
        return new Promise(resolve => {
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: addCacheBuster('https://marsoj.cn/homework?tab=classes'),
                    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                    anonymous: false,
                    onload: res => { try { const doc = new DOMParser().parseFromString(res.responseText, 'text/html'); if (/登录|login/i.test(doc.title || '')) return resolve(null); const r = pick(doc); if (r) _firstClassCache = r; resolve(r); } catch { resolve(null); } },
                    onerror: () => resolve(null)
                });
            } catch { resolve(null); }
        });
    }
    GM_addStyle(`
        #na-tc{position:fixed;right:24px;bottom:24px;z-index:1000001;display:flex;flex-direction:column;gap:10px;pointer-events:none}
        .na-ts{pointer-events:auto;min-width:220px;background:#121214f5;color:#f5f5f5;border:1px solid #4a4a4a;border-radius:2px;padding:12px 16px;box-shadow:0 4px 12px #0004;display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:14px;opacity:0;transform:translate3d(40px,0,0);transition:.25s}
        .na-ts.show{opacity:1;transform:none}.na-ts:hover{border-color:#6e6e6e}
        .na-cl{background:none;border:none;color:#888;font-size:18px;line-height:1;cursor:pointer}.na-cl:hover{color:#fff}
        #na-md{position:fixed;inset:0;z-index:1000000;background:#0007;display:flex;align-items:center;justify-content:center}
        .na-bx{width:460px;max-height:calc(100vh - 48px);box-sizing:border-box;background:#fff;color:#222;border:1px solid #d9d9d9;border-radius:2px;padding:18px 20px;font-size:14px;display:flex;flex-direction:column;overflow:hidden;overscroll-behavior:contain}
        .na-hd{display:flex;justify-content:space-between;padding-bottom:12px;margin-bottom:16px;border-bottom:1px solid #eee;font-weight:700}
        .na-bx .na-cl:hover{color:#111}
        .na-layout{display:flex;gap:16px;height:300px;box-sizing:border-box}
        .na-cats{width:90px;flex:0 0 90px;display:flex;flex-direction:column;gap:6px;border-right:1px solid #eee;padding-right:12px;overflow-y:auto;overscroll-behavior:contain}
        .na-cat-btn{padding:6px 8px;background:#f5f5f5;border:1px solid #d9d9d9;border-radius:2px;cursor:pointer;font-size:12px;text-align:center;transition:.15s;user-select:none}
        .na-cat-btn:hover{background:#e8e8e8}.na-cat-btn.active{background:#222;color:#fff;border-color:#222}
        .na-content{flex:1;min-width:0;overflow-y:auto;overscroll-behavior:contain}
        .na-cat-section{display:none}.na-cat-section.active{display:block}
        .na-rw{margin-bottom:16px}.na-rw label{display:block;margin-bottom:8px;color:#555;font-size:13px}
        .na-ig{display:flex;align-items:center;gap:8px}.na-in{flex:1;height:34px;border:1px solid #ccc;border-radius:2px;padding:4px 10px}
        .na-dd{position:relative;user-select:none}
        .na-dt{display:flex;justify-content:space-between;align-items:center;height:34px;border:1px solid #ccc;border-radius:2px;padding:0 10px;font-size:13px;cursor:pointer}
        .na-dm{display:none;position:fixed;z-index:1000002;background:#fff;border:1px solid #d9d9d9;border-radius:2px;box-shadow:0 4px 12px #0002;padding:4px 0;min-width:200px;max-height:300px;overflow-y:auto;overscroll-behavior:contain}
        .na-di{padding:8px 12px;font-size:13px;cursor:pointer}.na-di:hover{background:#f5f5f5}.na-di.active{background:#f0f5ff;color:#1677ff;font-weight:600}
        .na-ac{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;padding-top:12px;border-top:1px solid #eee}
        .na-wb{padding:6px 12px;background:#f5f5f5;border:1px solid #d9d9d9;border-radius:2px;cursor:pointer;font-size:13px;transition:.15s}
        .na-wb:hover{background:#e8e8e8}.na-wp{background:#222;color:#fff;border-color:#222}.na-wp:hover{background:#333}
        a.au-state { text-decoration: none; cursor: pointer; }
        a.au-state:hover { opacity: .85; text-decoration: underline; }
        .na-cats::-webkit-scrollbar,.na-content::-webkit-scrollbar,.na-dm::-webkit-scrollbar{width:6px}
        .na-cats::-webkit-scrollbar-thumb,.na-content::-webkit-scrollbar-thumb,.na-dm::-webkit-scrollbar-thumb{background:#ccc;border-radius:3px}
        .na-cats::-webkit-scrollbar-thumb:hover,.na-content::-webkit-scrollbar-thumb:hover,.na-dm::-webkit-scrollbar-thumb:hover{background:#aaa}
    `);
    function applyColorStyle() {
        let style = document.getElementById('na-color-style');
        let css = '';
        if (getPartialEnable()) css += `.au-state[data-partial="1"] { color: #d46b08 !important; background: #fff7e6 !important; }\n`;
        if (getFailEnable()) css += `.au-state[data-fail="1"] { color: #cf1322 !important; background: #fff1f0 !important; }\n`;
        if (css) {
            if (!style) { style = document.createElement('style'); style.id = 'na-color-style'; document.head.appendChild(style); }
            style.textContent = css;
        } else { if (style) style.remove(); }
    }
    // toast 返回 end 函数，可手动关闭
    function toast(msg, ms = getT()) {
        const tc = document.getElementById('na-tc') || document.body.appendChild(el('div', { id: 'na-tc' }));
        const b = el('button', { className: 'na-cl', textContent: '×' });
        const t = el('div', { className: 'na-ts' }, el('span', { textContent: msg }), b);
        tc.append(t); void t.offsetHeight; requestAnimationFrame(() => t.classList.add('show'));
        let tm, cl = false, end = () => { if (!cl) { cl = true; clearTimeout(tm); t.classList.remove('show'); setTimeout(() => t.remove(), 250); } };
        const run = () => { if (ms > 0 && !cl) { clearTimeout(tm); tm = setTimeout(end, ms); } };
        b.onclick = end; t.onmouseenter = () => clearTimeout(tm); t.onmouseleave = run; run();
        return end;
    }
    let latestHwApplied = false;
    function applyLatestHomework() {
        if (latestHwApplied) return;
        if (!getLatestHwEnable()) return;
        getLatestHomeworkInfo().then(info => {
            if (!info) return;
            const focusRow = document.querySelector('.hp-focus-row');
            if (focusRow) {
                let changed = false;
                const links = focusRow.querySelectorAll('a[href^="/homework/"]');
                links.forEach(a => { if (!a.getAttribute('href').includes('/homework/' + info.id)) { a.setAttribute('href', '/homework/' + info.id); changed = true; } });
                const titleLink = focusRow.querySelector('h2 a');
                if (titleLink && titleLink.textContent !== info.title) { titleLink.textContent = info.title; changed = true; }
                const deadlineSpan = focusRow.querySelector('.hp-deadline');
                if (deadlineSpan && info.deadline && deadlineSpan.textContent !== info.deadline) {
                    deadlineSpan.textContent = info.deadline;
                    changed = true;
                }
                if (info.progress) {
                    const metaSpans = focusRow.querySelectorAll('.hp-meta span');
                    if (metaSpans.length >= 2) {
                        if (info.progress.submitted && !metaSpans[0].textContent.includes(info.progress.submitted)) {
                            metaSpans[0].textContent = `已提交 ${info.progress.submitted} 题`;
                            changed = true;
                        }
                        if (info.progress.accepted && !metaSpans[1].textContent.includes(info.progress.accepted)) {
                            metaSpans[1].textContent = `已通过 ${info.progress.accepted} 题`;
                            changed = true;
                        }
                    }
                    if (info.progress.accepted && info.progress.total) {
                        const progressBar = focusRow.querySelector('.hp-progress');
                        if (progressBar) {
                            const total = parseInt(info.progress.total) || 0;
                            const accepted = parseInt(info.progress.accepted) || 0;
                            progressBar.setAttribute('aria-valuenow', accepted);
                            progressBar.setAttribute('aria-valuemax', total);
                            const percentage = total > 0 ? Math.floor(accepted / total * 100) : 0;
                            const span = progressBar.querySelector('span');
                            if (span) {
                                span.style.width = percentage + '%';
                                changed = true;
                            }
                        }
                    }
                }
                if (changed) latestHwApplied = true;
            }
            latestHwApplied = true;
        }).catch(() => {});
    }
    function settings() {
        if (document.getElementById('na-md')) return;
        let sel = getH();
        const cb = el('button', { className: 'na-cl', textContent: '×' });
        const inp = el('input', { className: 'na-in', type: 'number', min: '0', step: '0.5', value: getT() / 1000 });
        const tt = el('span', { textContent: (OPTS.find(o => o.v === sel) || OPTS.at(0)).t });
        const dt = el('div', { className: 'na-dt' }, tt, el('span', { textContent: '▾' }));
        const dm = el('div', { className: 'na-dm' });
        OPTS.forEach(o => {
            const item = el('div', { className: 'na-di' + (o.v === sel ? ' active' : '') });
            item.textContent = o.t; item.setAttribute('data-val', o.v);
            item.onclick = (e) => { e.stopPropagation(); sel = o.v; tt.textContent = o.t; dm.querySelectorAll('.na-di').forEach(x => x.classList.remove('active')); item.classList.add('active'); dm.style.display = 'none'; dd.classList.remove('open'); };
            dm.append(item);
        });
        const dd = el('div', { className: 'na-dd' }, dt);
        dt.onclick = (e) => { e.stopPropagation(); const rect = dt.getBoundingClientRect(); dm.style.top = rect.bottom + 'px'; dm.style.left = rect.left + 'px'; dm.style.display = dm.style.display === 'block' ? 'none' : 'block'; dd.classList.toggle('open', dm.style.display === 'block'); };
        document.body.appendChild(dm);
        dm.addEventListener('wheel', (e) => { e.stopPropagation(); if (dm.scrollHeight <= dm.clientHeight) e.preventDefault(); }, { passive: false });
        const closeDmOnClick = (e) => { if (!dm.contains(e.target) && e.target !== dt) { dm.style.display = 'none'; dd.classList.remove('open'); } };
        document.addEventListener('click', closeDmOnClick);
        const pMs = () => { const s = parseFloat(inp.value); return isNaN(s) || s < 0 ? 3000 : Math.round(s * 1000); };

        const chkRedirect = el('input', { type: 'checkbox', checked: getRedirectEnable() });
        const chkPartial = el('input', { type: 'checkbox', checked: getPartialEnable() });
        const chkFail = el('input', { type: 'checkbox', checked: getFailEnable() });
        const chkLatestHw = el('input', { type: 'checkbox', checked: getLatestHwEnable() });

        const rowTime = el('div', { className: 'na-rw' });
        rowTime.append(el('label', { textContent: '提示框自动关闭时间 (0 为不自动关闭)' }), el('div', { className: 'na-ig' }, inp, el('span', { textContent: '秒' })));
        const rowAddr = el('div', { className: 'na-rw' });
        rowAddr.append(el('label', { textContent: '“学习”按钮定向地址' }), dd);
        const lblLatestHw = el('label', { style: 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#555;margin-top:8px' });
        lblLatestHw.append(chkLatestHw, el('span', { textContent: '首页待完成作业优化' }));
        const rowLatestHw = el('div', { className: 'na-rw' }); rowLatestHw.append(lblLatestHw);
        const secBasic = el('div', { className: 'na-cat-section active' }); secBasic.append(rowTime, rowAddr, rowLatestHw);

        const lblRedirect = el('label', { style: 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#555' });
        lblRedirect.append(chkRedirect, el('span', { textContent: '启用作业状态重定向（点击跳转到提交记录）' }));
        const rowRedirect = el('div', { className: 'na-rw' }); rowRedirect.append(lblRedirect);
        const lblPartial = el('label', { style: 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#555' });
        lblPartial.append(chkPartial, el('span', { textContent: '启用部分得分颜色优化' }));
        const rowPartial = el('div', { className: 'na-rw' }); rowPartial.append(lblPartial);
        const lblFail = el('label', { style: 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#555' });
        lblFail.append(chkFail, el('span', { textContent: '启用未通过颜色优化' }));
        const rowFail = el('div', { className: 'na-rw' }); rowFail.append(lblFail);
        const secStatus = el('div', { className: 'na-cat-section' }); secStatus.append(rowRedirect, rowPartial, rowFail);

        const btnClear = el('button', { className: 'na-wb', textContent: '清空缓存' });
        btnClear.onclick = () => { localStorage.removeItem(KR); localStorage.removeItem(KHC); _myClassCache = null; _latestHomeworkCache = null; toast('缓存已清空'); };
        const btnDefault = el('button', { className: 'na-wb', textContent: '设为默认值' });
        btnDefault.onclick = () => {
            inp.value = 3; sel = U1; tt.textContent = OPTS[0].t; dm.querySelectorAll('.na-di').forEach(x => x.classList.remove('active')); dm.querySelector('.na-di').classList.add('active');
            chkRedirect.checked = true; chkPartial.checked = true; chkFail.checked = true; chkLatestHw.checked = true;
            localStorage.setItem(KT, 3000); localStorage.setItem(KH, U1); localStorage.setItem(KREDIRECT, 'true'); localStorage.setItem(KP_EN, 'true'); localStorage.setItem(KF_EN, 'true'); localStorage.setItem(KLHE, 'true'); localStorage.removeItem(KHC);
            applyColorStyle(); latestHwApplied = false; init(); toast('已恢复默认值');
        };
        const rowData = el('div', { className: 'na-rw' }); rowData.append(el('label', { textContent: '缓存与重置', style: 'color:#999;font-size:12px' }), el('div', { style: 'display:flex;gap:8px' }, btnClear, btnDefault));
        const secData = el('div', { className: 'na-cat-section' }); secData.append(rowData);

        /* ===== 更新分类 ===== */
        const lblCurVer = el('label', { textContent: `当前版本：v${CUR_VER}`, style: { color: '#666', fontSize: '12px' } });
        const btnCheck = el('button', { className: 'na-wb', textContent: '检查更新' });
        btnCheck.onclick = () => {
            btnCheck.disabled = true;
            const closeProbe = toast('正在探测可用线路…', 0); // 不自动关闭，拿到结果后手动关
            fetchRemoteVersion().then(r => {
                closeProbe();
                btnCheck.disabled = false;
                if (!r) { toast('所有线路均不可达，请检查网络'); return; }
                const c = cmpVer(r.version, CUR_VER);
                if (c <= 0) { toast(`已是最新 v${CUR_VER}`); return; }
                toast(`发现新版 v${r.version}`);
                const btnDo = el('button', { className: 'na-wb na-wp', textContent: `更新到 v${r.version}`, onclick: () => GM_openInTab(r.url, { active: true }) });
                btnCheck.after(btnDo);
            });
        };
        const rowUpdate = el('div', { className: 'na-rw' });
        rowUpdate.append(
            el('label', { textContent: '脚本更新', style: { color: '#999', fontSize: '12px' } }),
            el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, lblCurVer, btnCheck)
        );
        const secUpdate = el('div', { className: 'na-cat-section' }); secUpdate.append(rowUpdate);

        const sectionMap = { basic: secBasic, status: secStatus, data: secData, update: secUpdate };
        const contentArea = el('div', { className: 'na-content' }, secBasic, secStatus, secData, secUpdate);
        const catsArea = el('div', { className: 'na-cats' });
        const catDefs = [{ id: 'basic', name: '基本' }, { id: 'status', name: '状态' }, { id: 'data', name: '数据' }, { id: 'update', name: '更新' }];
        catDefs.forEach(cd => {
            const btn = el('div', { className: 'na-cat-btn' + (cd.id === 'basic' ? ' active' : ''), textContent: cd.name });
            btn.onclick = () => { catsArea.querySelectorAll('.na-cat-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); Object.values(sectionMap).forEach(s => s.classList.remove('active')); sectionMap[cd.id].classList.add('active'); };
            catsArea.append(btn);
        });

        const btnCancel = el('button', { className: 'na-wb', textContent: '取消' });
        const btnSave = el('button', { className: 'na-wb na-wp', textContent: '保存' });
        const md = el('div', { id: 'na-md' }, el('div', { className: 'na-bx' }, el('div', { className: 'na-hd' }, el('span', { textContent: 'Na MarsOJ 设置' }), cb), el('div', { className: 'na-layout' }, catsArea, contentArea), el('div', { className: 'na-ac' }, btnCancel, btnSave)));
        md.querySelector('.na-bx').onclick = () => { dm.style.display = 'none'; dd.classList.remove('open'); };
        const closeSettings = () => { dm.remove(); document.removeEventListener('click', closeDmOnClick); md.remove(); };
        cb.onclick = closeSettings; btnCancel.onclick = closeSettings;
        btnSave.onclick = () => {
            localStorage.setItem(KT, pMs()); localStorage.setItem(KH, sel); localStorage.setItem(KREDIRECT, chkRedirect.checked ? 'true' : 'false'); localStorage.setItem(KP_EN, chkPartial.checked ? 'true' : 'false'); localStorage.setItem(KF_EN, chkFail.checked ? 'true' : 'false'); localStorage.setItem(KLHE, chkLatestHw.checked ? 'true' : 'false');
            applyColorStyle(); latestHwApplied = false; init(); closeSettings(); toast('已保存');
        };
        document.body.append(md);
        getFirstClassId().then(cid => { const display = cid ? `我的首个班级 (/homework?tab=class&cid=XXX)` : '我的首个班级 (无班级)'; const opt = OPTS.find(o => o.v === 'na_first_class'); if (opt) opt.t = display; const item = dm.querySelector('.na-di[data-val="na_first_class"]'); if (item) item.textContent = display; if (sel === 'na_first_class') tt.textContent = display; }).catch(() => {});
    }
    const q = []; let busy = false;
    const markStatus = (el) => { if (el.classList.contains('au-accepted')) return; const txt = el.textContent.trim(); if (/部分/.test(txt) || (/[1-9]/.test(txt) && !/未通过\s*0/.test(txt))) el.dataset.partial = '1'; else el.dataset.fail = '1'; };
    const toA = (sp, id) => { const a = el('a', { className: sp.className, title: sp.title, href: '/record/' + id, textContent: sp.textContent }); a.dataset.na = '1'; if (sp.dataset.partial) a.dataset.partial = '1'; if (sp.dataset.fail) a.dataset.fail = '1'; sp.replaceWith(a); };
    const toSpan = (a) => { const sp = el('span', { className: a.className, title: a.title, textContent: a.textContent }); sp.dataset.na = '1'; if (a.dataset.partial) sp.dataset.partial = '1'; if (a.dataset.fail) sp.dataset.fail = '1'; a.replaceWith(sp); };
    async function runQ() {
        if (busy || !q.length) return; busy = true;
        const { sp, pid, tid, uid, key, ok } = q.shift();
        try {
            const qry = async p => (await (await fetch('/record?' + new URLSearchParams(p), {
                headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
                cache: 'no-store'
            })).json()).rdocs || [];
            let list = tid ? await qry({ pid, uidOrName: uid, tid }) : [];
            if (!list.length) list = await qry({ pid, uidOrName: uid });
            const best = list.sort((a, b) => (b.score || 0) - (a.score || 0)).at(0);
            if (best?._id) { const c = getRC(); c[key] = { id: best._id, ok: ok || best.status === 1, ts: Date.now() }; localStorage.setItem(KR, JSON.stringify(c)); if (sp.isConnected) toA(sp, best._id); }
        } catch { }
        setTimeout(() => { busy = false; runQ(); }, 150);
    }
    function init() {
        if (!document.querySelector('#menu-nav-user a[href^="/user/"]')) return;
        const hw = document.querySelector('a.nav__item[href*="/homework"]');
        if (hw) {
            const target = getH();
            if (target === 'na_first_class') {
                getFirstClassId().then(cid => { hw.setAttribute('href', cid ? `/homework?tab=class&cid=${cid}` : U1); });
            } else {
                hw.setAttribute('href', target);
            }
        }
        applyLatestHomework();
        const dm = document.querySelector('li.nav__list-item[data-dropdown-target="#menu-nav-domain"]');
        if (dm && !document.getElementById('na-st')) dm.replaceWith(el('li', { id: 'na-st', className: 'nav__list-item' }, el('a', { href: 'javascript:;', className: 'nav__item', textContent: 'Na MarsOJ 设置', onclick: e => { e.preventDefault(); settings(); } })));
        document.querySelectorAll('.au-state:not([data-na])').forEach(el => { el.dataset.na = '1'; if (/未提交|未开始/.test(el.textContent)) return; markStatus(el); });
        if (getRedirectEnable()) {
            const uid = document.querySelector('#menu-nav-user a[href^="/user/"],a.nav__item[href^="/user/"]')?.getAttribute('href').split('/').pop();
            if (uid) { const c = getRC(); document.querySelectorAll('span.au-state[data-na]').forEach(sp => { if (/未提交|未开始/.test(sp.textContent)) return; const lk = sp.closest('tr')?.querySelector('.au-problem-title a'); if (!lk) return; const u = new URL(lk.href, location.origin), pid = u.pathname.split('/').pop(), tid = u.searchParams.get('tid') || '', key = `${uid}_${tid}_${pid}`, ok = sp.classList.contains('au-accepted'), h = c[key]; if (h?.id && (h.ok || (!ok && Date.now() - h.ts < 6e5))) toA(sp, h.id); else q.push({ sp, pid, tid, uid, key, ok }); }); runQ(); }
        } else { document.querySelectorAll('a.au-state[data-na]').forEach(a => toSpan(a)); }
    }
    applyColorStyle();
    setTimeout(() => toast('Na MarsOJ加载成功'), 150); init();
    let obsTimer;
    new MutationObserver(() => { clearTimeout(obsTimer); obsTimer = setTimeout(() => { latestHwApplied = false; init(); }, 200); }).observe(document.body, { childList: true, subtree: true });
})();