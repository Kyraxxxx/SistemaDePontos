// ==========================================
// CONFIG & INITIALIZATION
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
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    }
} catch (e) {
    console.error("Firebase Init Error:", e);
}

const GOAL = 17;
const DISQ = 9;

let state = {
    user: null,
    employees: {},
    prize: "Carregando...",
    activeTab: 'balance',
    winnersNotified: {},
    firstWinner: null,
    lastWinnerTime: 0
};

// ==========================================
// CORE NAVIGATION
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
    if (!target) return;

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    target.classList.add('active');
    
    try { renderAll(); } catch(e) { console.error(e); }
};

window.changeLoginStep = function(step) {
    const steps = ['home', 'employee', 'manager'];
    steps.forEach(s => {
        const el = document.getElementById(`login-step-${s}`);
        if (el) el.classList.remove('active');
    });
    const target = document.getElementById(`login-step-${step}`);
    if (target) target.classList.add('active');
};

// ==========================================
// AUTHENTICATION
// ==========================================

window.actionEmployeeAuth = function() {
    const nameInput = document.getElementById('emp-name-input');
    const passInput = document.getElementById('emp-pass-input');
    if (!nameInput || !passInput) return;

    const name = nameInput.value.trim();
    const pass = passInput.value.trim();
    if (!name || !pass) { alert("Digite Nome e Senha!"); return; }

    const btn = document.querySelector('#login-step-employee .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = "Verificando..."; }

    // 1. Verificar localmente
    const localFound = Object.entries(state.employees).find(([, e]) => e.name && e.name.toLowerCase() === name.toLowerCase() && !e.deleted);
    if (localFound) {
        const [id, emp] = localFound;
        if (emp.password === pass) {
            loginAs(id, 'employee');
            return;
        }
    }

    // 2. Verificar no Firebase
    if (!db) { alert("Sem conexão!"); if(btn) btn.disabled=false; return; }

    db.ref('employees').once('value').then(snap => {
        const all = snap.val() || {};
        const entries = Object.entries(all);
        const fbFound = entries.find(([, e]) => e.name && e.name.toLowerCase() === name.toLowerCase() && !e.deleted);

        if (fbFound) {
            const [id, emp] = fbFound;
            if (emp.password === pass) {
                state.employees[id] = emp;
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
            });
        }
    }).finally(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = "LOGAR / CADASTRAR"; }
    });
};

function loginAs(id, role) {
    state.user = { id, role };
    localStorage.setItem('mp_user', JSON.stringify(state.user));
    
    addDevLog('LOGIN', `${id} (${role})`);
    renderAll();
    window.showView(role === 'manager' ? 'mgr' : (role === 'developer' ? 'developer' : 'emp'));
}

window.actionLogout = function() {
    state.user = null;
    localStorage.removeItem('mp_user');
    location.reload();
};

window.actionMgrLoginStep = function() {
    const pass = document.getElementById('mgr-pass-input').value;
    if (pass === 'dev99') loginAs('mgr_root', 'manager');
    else if (pass === 'developer20') loginAs('dev_root', 'developer');
    else alert("Senha incorreta!");
};

// ==========================================
// RENDERERS
// ==========================================

function renderAll() {
    try {
        if (!state.user) return;
        if (state.user.role === 'employee') {
            renderEmployeeDash();
            renderTeamList();
        } else if (state.user.role === 'manager') {
            renderManagerGrid();
            renderTransparencyBar();
        } else if (state.user.role === 'developer') {
            renderDeveloperPanel();
        }
    } catch(e) { console.error("Render Error:", e); }
}

function updateHomeButtons() {
    // Função desativada: botões agora são fixos no HTML para evitar atraso visual
}

function renderEmployeeDash() {
    const emp = state.employees[state.user.id];
    if (!emp) return;

    const good = emp.goodStars || 0;
    const bad = emp.badStars || 0;
    
    const goodEl = document.getElementById('display-good-stars');
    const badEl = document.getElementById('display-bad-stars-side');
    if (goodEl) goodEl.textContent = good;
    if (badEl) badEl.textContent = bad;

    const tag = document.getElementById('display-status-tag');
    if (tag) {
        if (good >= GOAL && bad < DISQ) tag.textContent = "🏆 PRÊMIO CONQUISTADO!";
        else if (bad >= DISQ) tag.textContent = "⚠️ LIMITE ATINGIDO";
        else tag.textContent = "🚀 EM ANDAMENTO";
    }

    const fill = document.getElementById('display-prog-fill');
    const pctTxt = document.getElementById('display-prog-pct');
    let pct = Math.min(100, (good / GOAL) * 100);
    if (bad >= DISQ) pct = 0;
    if (fill) fill.style.width = pct + '%';
    if (pctTxt) pctTxt.textContent = Math.floor(pct) + '%';
}

function renderTeamList() {
    const grid = document.getElementById('team-list-grid');
    if (!grid) return;
    grid.innerHTML = '';
    Object.entries(state.employees).forEach(([id, emp]) => {
        if (id === state.user.id || emp.deleted) return;
        const div = document.createElement('div');
        div.className = 'team-row';
        div.innerHTML = `<span>${emp.name}</span><span>** ⭐</span>`;
        grid.appendChild(div);
    });
}

function renderManagerGrid() {
    const grid = document.getElementById('mgr-grid-employees');
    if (!grid) return;
    grid.innerHTML = '';
    Object.entries(state.employees).filter(([, e]) => !e.deleted).forEach(([id, emp]) => {
        const card = document.createElement('div');
        card.className = 'm-card';
        card.innerHTML = `
            <div class="m-head"><h4>${emp.name}</h4><i class="fa-solid fa-trash-can m-del" onclick="window.handleEmpDelete('${id}')"></i></div>
            <div class="m-scores">
                <div class="m-box"><span class="m-val green">${emp.goodStars || 0}</span><span class="m-lbl">Boas</span></div>
                <div class="m-box"><span class="m-val red">${emp.badStars || 0}</span><span class="m-lbl">Ruins</span></div>
            </div>
            <div class="m-acts">
                <button class="bt-sc pos" onclick="window.handlePoint('${id}','good',1)">+ VERDE</button>
                <button class="bt-sc neg" onclick="window.handlePoint('${id}','bad',1)">+ RUIM</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderTransparencyBar() {
    const bar = document.getElementById('mgr-transparency-bar');
    if (!bar) return;
    if (state.firstWinner) {
        bar.style.display = 'flex';
        bar.innerHTML = `<div class="trans-card gold">🥇 ${state.firstWinner.name} atingiu a meta!</div>`;
    } else {
        bar.style.display = 'none';
    }
}

// ==========================================
// ACTIONS (MANAGER)
// ==========================================

window.handlePoint = function(id, type, val) {
    if (!db) return;
    const prop = type === 'good' ? 'goodStars' : 'badStars';
    const current = (state.employees[id] || {})[prop] || 0;
    db.ref(`employees/${id}/${prop}`).set(current + val);
};

window.handleEmpDelete = function(id) {
    if (confirm("Excluir funcionário?")) db.ref(`employees/${id}/deleted`).set(true);
};

window.actionConfirmPrizeReset = function() {
    const p = document.getElementById('input-global-prize-mgr').value;
    if (p && confirm("Zer tudo e mudar prêmio?")) {
        db.ref('currentPrize').set(p);
        db.ref('cycleReset').set({ prize: p, timestamp: Date.now() });
        db.ref('firstWinner').remove();
        Object.keys(state.employees).forEach(id => {
            db.ref(`employees/${id}/goodStars`).set(0);
            db.ref(`employees/${id}/badStars`).set(0);
        });
    }
};

// ==========================================
// HELPERS & LISTENERS
// ==========================================

function startFirebaseListeners() {
    if (!db) return;
    db.ref('employees').on('value', snap => {
        state.employees = snap.val() || {};
        renderAll();
        updateHomeButtons();
    });
    db.ref('currentPrize').on('value', snap => {
        state.prize = snap.val() || "";
        const el = document.getElementById('header-prize-text');
        if (el) el.textContent = `Prêmio: ${state.prize}`;
    });
    db.ref('firstWinner').on('value', snap => {
        state.firstWinner = snap.val();
        renderTransparencyBar();
    });
}

window.switchTab = function(tab) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
};

function addDevLog(action, details) {
    if (db) db.ref('dev_logs').push({ action, details, timestamp: Date.now() });
}

function renderDeveloperPanel() {
    db.ref('dev_logs').limitToLast(20).on('value', snap => {
        const list = document.getElementById('dev-logs-list');
        if (list) {
            list.innerHTML = Object.values(snap.val() || {}).reverse().map(l => `<div>${l.action}: ${l.details}</div>`).join('');
        }
    });
}

window.onload = () => {
    console.log("Iniciando SISTEMA V10 - Recuperação de UI");
    startFirebaseListeners();
    const saved = localStorage.getItem('mp_user');
    if (saved) {
        state.user = JSON.parse(saved);
        window.showView(state.user.role === 'manager' ? 'mgr' : (state.user.role === 'developer' ? 'developer' : 'emp'));
    } else {
        window.showView('login');
    }
};
