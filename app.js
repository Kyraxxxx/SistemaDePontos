// --- DEBUG: CONFIRMAR CARREGAMENTO ---
alert("SISTEMA V7: Código carregado com sucesso!");

// --- KILL OLD SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        for (let reg of regs) reg.unregister();
    });
}

// ==========================================
// CONFIG & INITIALIZATION (WRAP IN TRY)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyA_IIOZ9J3YvrWr__ipeoolT6mlbGQ82kk",
    authDomain: "metal-print-a099b.firebaseapp.com",
    databaseURL: "https://metal-print-a099b-default-rtdb.firebaseio.com",
    projectId: "metal-print-a099b",
    storageBucket: "metal-print-a099b.appspot.com",
    messagingSenderId: "521510301351",
    appId: "1:521510301351:web:49016ec1da1058e35db582"
};

let db = null;
try {
    if (typeof firebase === 'undefined') {
        alert("ERRO CRÍTICO: Firebase não foi carregado pelo navegador. Verifique sua conexão ou adblock.");
    } else {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    }
} catch (e) {
    alert("ERRO FIREBASE: " + e.message);
}

const GOAL = 17;
const DISQ = 9;

let state = {
    user: null,
    employees: {},
    prize: "",
    activeTab: 'balance',
    winnersNotified: {},
    firstWinner: null,
    lastWinnerTime: 0,
    syncOnline: false
};

// ==========================================
// CORE FUNCTIONS (MANTIDAS NO TOPO PARA FAILSAFE)
// ==========================================

window.showView = function(viewName) {
    const idMap = {
        'login': 'screen-login',
        'emp': 'screen-employee', 'employee': 'screen-employee',
        'mgr': 'screen-manager', 'manager': 'screen-manager',
        'developer': 'screen-developer'
    };
    const targetId = idMap[viewName] || `screen-${viewName}`;
    const target = document.getElementById(targetId);
    if (target) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        target.classList.add('active');
        state.activeView = viewName;
        try { renderAll(); } catch(e) {}
    }
};

window.changeLoginStep = (step) => {
    const loginSteps = {
        home: document.getElementById('login-step-home'),
        employee: document.getElementById('login-step-employee'),
        manager: document.getElementById('login-step-manager')
    };
    Object.values(loginSteps).forEach(s => { if (s) s.classList.remove('active'); });
    const target = loginSteps[step];
    if (target) {
        target.classList.add('active');
        if (step === 'employee') try { renderNamelist(); } catch(e){}
    }
};

window.actionEmployeeAuth = function() {
    try {
        const nameInput = document.getElementById('emp-name-input');
        const passInput = document.getElementById('emp-pass-input');
        if (!nameInput || !passInput) { alert("ERRO: Campos de nome/senha não encontrados no HTML!"); return; }

        const name = nameInput.value.trim();
        const pass = passInput.value.trim();

        if (!name || !pass) { alert("Digite Nome e Senha!"); return; }

        // 1. Tentar login rápido com dados já carregados na memória
        const entries = Object.entries(state.employees || {});
        const found = entries.find(([, emp]) => emp.name && emp.name.toLowerCase() === name.toLowerCase() && !emp.deleted);

        if (found) {
            const [id, emp] = found;
            if (emp.password === pass) {
                loginAs(id, 'employee');
                return;
            } else {
                alert("Senha incorreta!");
                return;
            }
        }

        // 2. Se não achou localmente, buscar no servidor Firebase
        const btn = document.querySelector('#login-step-employee .btn-primary');
        if (btn) { btn.disabled = true; btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> VERIFICANDO..."; }

        if (!db) { 
            alert("CONEXÃO FALHOU: O banco de dados não respondeu. Tente recarregar a página."); 
            if(btn) { btn.disabled = false; btn.innerHTML = "LOGAR / CADASTRAR"; }
            return; 
        }

        db.ref('employees').once('value', (snap) => {
            const all = snap.val() || {};
            const fbEntries = Object.entries(all);
            const fbRecord = fbEntries.find(([, e]) => e.name && e.name.toLowerCase() === name.toLowerCase() && !e.deleted);

            if (fbRecord) {
                const [id, emp] = fbRecord;
                if (emp.password === pass) {
                    state.employees[id] = emp; // Sincroniza localmente
                    loginAs(id, 'employee');
                } else {
                    alert("Senha incorreta!");
                }
            } else {
                // Novo cadastro
                const data = { name, password: pass, goodStars: 0, badStars: 0, deleted: false };
                db.ref('employees').push(data).then(ref => {
                    state.employees[ref.key] = data;
                    loginAs(ref.key, 'employee');
                    alert("Conta criada com sucesso!");
                }).catch(err => alert("ERRO AO CRIAR CONTA: " + err.message));
            }

            if (btn) { btn.disabled = false; btn.innerHTML = "LOGAR / CADASTRAR"; }
        }, (err) => {
            alert("ERRO DE REDE: " + err.message);
            if (btn) { btn.disabled = false; btn.innerHTML = "LOGAR / CADASTRAR"; }
        });

    } catch (err) {
        alert("ERRO NO BOTÃO: " + err.message);
    }
};

// ==========================================
// REST OF SYSTEM
// ==========================================

function loginAs(id, role) {
    state.user = { id, role };
    localStorage.setItem('mp_user', JSON.stringify(state.user));
    if (role === 'employee') {
        localStorage.setItem('mp_last_name', document.getElementById('emp-name-input')?.value || "");
    }
    updatePresence();
    addDevLog('LOGIN', `${id} como ${role}`);
    renderAll();
    updateHomeButtons();
    window.showView(roleToView(role));
}

function saveLocal() {
    localStorage.setItem('mp_data', JSON.stringify({ employees: state.employees, prize: state.prize }));
}
function loadLocal() {
    try {
        const d = JSON.parse(localStorage.getItem('mp_data') || '{}');
        state.employees = d.employees || {};
        state.prize = d.prize || "";
    } catch(e) { state.employees = {}; state.prize = ""; }
}

function startFirebaseListeners() {
    if (!db) return;

    db.ref('.info/connected').on('value', snap => {
        state.syncOnline = snap.val() === true;
    });

    db.ref('employees').on('value', snap => {
        state.employees = snap.val() || {};
        saveLocal();
        renderAll();
        updateHomeButtons();
        if (state.user && state.user.role === 'employee') renderEmployeeDash();
    });

    db.ref('currentPrize').on('value', snap => {
        const val = snap.val();
        if (val !== null) {
            state.prize = val;
            saveLocal();
            updatePrizeDisplay();
        }
    });

    db.ref('globalWinner').on('value', snap => {
        const winner = snap.val();
        if (winner && state.user && winner.timestamp > state.lastWinnerTime) {
            showGlobalCelebration(winner);
            state.lastWinnerTime = winner.timestamp;
        }
    });

    db.ref('cycleReset').on('value', snap => {
        const resetData = snap.val();
        const lastReset = parseInt(localStorage.getItem('last_reset') || '0');
        if (resetData && state.user && resetData.timestamp > lastReset) {
            showResetNotification(resetData);
            localStorage.setItem('last_reset', resetData.timestamp);
        }
    });

    db.ref('firstWinner').on('value', snap => {
        state.firstWinner = snap.val();
        renderTransparencyBar();
    });
}

function roleToView(role) {
    if (role === 'manager') return 'mgr';
    if (role === 'developer') return 'developer';
    return 'emp';
}

function updatePrizeDisplay() {
    const el = document.getElementById('header-prize-text');
    if (el) el.textContent = `Prêmio: ${state.prize}`;
    const mgrInput = document.getElementById('input-global-prize-mgr');
    if (mgrInput) mgrInput.value = state.prize;
}

function renderAll() {
    renderNamelist();
    renderActiveView();
    renderTransparencyBar();
}

function updateHomeButtons() {
    const btnEmp = document.querySelector('#login-step-home .btn-primary');
    const btnMgr = document.querySelector('#login-step-home .btn-outline');
    if (!btnEmp || !btnMgr) return;

    if (state.user && state.user.role === 'employee') {
        const empName = state.employees[state.user.id]?.name || "Funcionário";
        btnEmp.innerHTML = `<i class="fa-solid fa-user-check"></i> Entrar como ${empName}`;
        btnEmp.onclick = () => window.showView('emp');
    } else {
        btnEmp.innerHTML = `<i class="fa-solid fa-user-check"></i> Sou Funcionário`;
        btnEmp.onclick = () => window.changeLoginStep('employee');
    }

    if (state.user && state.user.role === 'manager') {
        btnMgr.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Painel (Logado)`;
        btnMgr.onclick = () => window.showView('mgr');
    } else {
        btnMgr.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Painel Gerencial`;
        btnMgr.onclick = () => window.changeLoginStep('manager');
    }
}

function renderNamelist() {
    const container = document.getElementById('login-names-grid');
    if (!container) return;
    const entries = Object.entries(state.employees || {})
        .filter(([, emp]) => !emp.deleted)
        .sort((a, b) => a[1].name.localeCompare(b[1].name));
    if (entries.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; padding:20px; color:#64748b; font-weight:600;">Nenhum funcionário cadastrado.</div>';
        return;
    }
    container.innerHTML = '';
    entries.forEach(([, emp]) => {
        const item = document.createElement('div');
        item.className = 'name-item';
        item.textContent = emp.name;
        item.onclick = () => {
            const nInp = document.getElementById('emp-name-input');
            const pInp = document.getElementById('emp-pass-input');
            if (nInp) nInp.value = emp.name;
            if (pInp) pInp.focus();
        };
        container.appendChild(item);
    });
}

function renderActiveView() {
    if (!state.user) return;
    if (state.user.role === 'employee') {
        renderEmployeeDash();
        renderTeamList();
    } else if (state.user.role === 'developer') {
        renderDeveloperPanel();
    } else {
        renderManagerGrid();
    }
}

function renderEmployeeDash() {
    if (!state.user || state.user.role !== 'employee') return;
    const emp = state.employees[state.user.id];
    if (!emp) return;
    const good = emp.goodStars || 0;
    const bad = emp.badStars || 0;
    const isWinner = (good >= GOAL && bad < DISQ);
    const isDisq = (bad >= DISQ);
    const goodEl = document.getElementById('display-good-stars');
    const badEl = document.getElementById('display-bad-stars-side');
    if (goodEl) goodEl.textContent = good;
    if (badEl) badEl.textContent = bad;
    const tag = document.getElementById('display-status-tag');
    if (tag) {
        if (isWinner) tag.textContent = "🏆 PRÊMIO CONQUISTADO!";
        else if (isDisq) tag.textContent = "⚠️ LIMITE DE ERROS ATINGIDO";
        else tag.textContent = "🚀 STATUS: EM ANDAMENTO";
    }
    const badDetail = document.getElementById('display-bad-stars');
    if (badDetail) badDetail.textContent = bad;
    let pct = (good / GOAL) * 100;
    if (pct > 100) pct = 100;
    if (isDisq) pct = 0;
    const fill = document.getElementById('display-prog-fill');
    const pctTxt = document.getElementById('display-prog-pct');
    if (fill) fill.style.width = pct + '%';
    if (pctTxt) pctTxt.textContent = Math.floor(pct) + '%';
}

function showGlobalCelebration(winner) {
    if (!state.user) return;
    const titleEl = document.getElementById('celeb-title');
    const msgEl = document.getElementById('celeb-msg');
    const isMe = (state.user.id === winner.id);
    titleEl.textContent = isMe ? "VOCÊ VENCEU!" : "TEMOS UM GANHADOR!";
    msgEl.innerHTML = isMe ? `Parabéns <b>${winner.name}</b>!<br>Você ganhou: <b>${winner.prize}</b>` : `O funcionário <b>${winner.name}</b><br>ganhou: <b>${winner.prize}</b>`;
    document.getElementById('celeb-overlay').classList.add('active');
}
window.closeCeleb = () => { document.getElementById('celeb-overlay').classList.remove('active'); };

function renderTeamList() {
    const grid = document.getElementById('team-list-grid');
    if (!grid) return;
    grid.innerHTML = '';
    Object.entries(state.employees || {}).forEach(([id, emp]) => {
        if (id === state.user.id || emp.deleted) return;
        const row = document.createElement('div');
        row.className = 'team-row';
        row.innerHTML = `<span class="t-name">${escapeHTML(emp.name)}</span><span class="t-mask">** ⭐</span>`;
        grid.appendChild(row);
    });
}

function renderManagerGrid() {
    const grid = document.getElementById('mgr-grid-employees');
    if (!grid) return;
    grid.innerHTML = '';
    Object.entries(state.employees || {}).filter(([, emp]) => !emp.deleted).forEach(([id, emp]) => {
        const card = document.createElement('div');
        card.className = 'm-card';
        card.innerHTML = `
            <div class="m-head"><h4>${escapeHTML(emp.name)}</h4><i class="fa-solid fa-trash-can m-del" onclick="handleEmpDelete('${id}')"></i></div>
            <div class="m-scores"><div class="m-box"><span class="m-val green">${emp.goodStars || 0}</span></div><div class="m-box"><span class="m-val red">${emp.badStars || 0}</span></div></div>
            <div class="m-acts"><button class="bt-sc pos" onclick="handlePoint('${id}', 'good', 1)">+V</button><button class="bt-sc neg" onclick="handlePoint('${id}', 'bad', 1)">+R</button></div>
        `;
        grid.appendChild(card);
    });
}

function renderTransparencyBar() {
    const bar = document.getElementById('mgr-transparency-bar');
    if (!bar) return;
    if (!state.user || state.user.role !== 'manager' || (!state.firstWinner)) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = `<div class="trans-card gold">🥇 ${escapeHTML(state.firstWinner.name)}</div>`;
}

window.handlePoint = (id, type, val) => {
    const emp = state.employees[id];
    if (!emp || !db) return;
    const prop = type === 'good' ? 'goodStars' : 'badStars';
    const old = emp[prop] || 0;
    const newVal = Math.max(0, old + val);
    db.ref(`employees/${id}/${prop}`).set(newVal);
    addDevLog('PONTO', `${emp.name}: ${prop} -> ${newVal}`);
};

window.handleEmpDelete = (id) => {
    if (confirm("Desativar?")) db.ref(`employees/${id}/deleted`).set(true);
};

window.actionConfirmPrizeReset = () => {
    const p = document.getElementById('input-global-prize-mgr').value;
    if (p && confirm("Zer tudo?")) {
        db.ref('currentPrize').set(p);
        db.ref('cycleReset').set({ prize: p, timestamp: Date.now() });
        db.ref('firstWinner').remove();
        Object.keys(state.employees).forEach(id => {
            db.ref(`employees/${id}/goodStars`).set(0);
            db.ref(`employees/${id}/badStars`).set(0);
        });
    }
};

window.actionMgrLoginStep = () => {
    const p = document.getElementById('mgr-pass-input').value;
    if (p === 'dev99') loginAs('mgr_root', 'manager');
    else if (p === 'developer20') loginAs('dev_root', 'developer');
    else alert("Senha errada");
};

window.actionLogout = () => {
    state.user = null;
    localStorage.removeItem('mp_user');
    location.reload();
};

window.switchTab = (tabId) => {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabId}`)?.classList.add('active');
};

function addDevLog(action, details) {
    if (!db) return;
    db.ref('dev_logs').push({ action, details, user: state.user?.id || 'Sistema', timestamp: Date.now() });
}

function updatePresence() {
    if (!db || !state.user) return;
    const ref = db.ref(`presence/${state.user.id}`);
    ref.set({ name: state.user.id, role: state.user.role, lastActive: Date.now() });
    ref.onDisconnect().remove();
}

function renderDeveloperPanel() {
    if (!state.user || state.user.role !== 'developer') return;
    db.ref('presence').on('value', snap => {
        const list = document.getElementById('dev-presence-list');
        if (list) list.innerHTML = Object.values(snap.val() || {}).map(p => `<div>${p.name} (${p.role})</div>`).join('');
    });
}
function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

window.onload = () => {
    loadLocal();
    renderAll();
    updateHomeButtons();
    updatePrizeDisplay();
    const saved = localStorage.getItem('mp_user');
    if (saved) {
        state.user = JSON.parse(saved);
        window.showView(roleToView(state.user.role));
    } else {
        window.showView('login');
    }
    startFirebaseListeners();
};
