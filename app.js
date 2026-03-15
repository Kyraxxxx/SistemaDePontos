// --- KILL OLD SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        for (let reg of regs) reg.unregister();
    });
}

// ==========================================
// CONFIG FIREBASE
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
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();
} catch (e) {
    console.error("Firebase init error:", e);
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
// LOCAL STORAGE
// ==========================================
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

// ==========================================
// SYNC STATUS INDICATOR
// ==========================================
function setSyncStatus(online) {
    state.syncOnline = online;
    const dot = document.getElementById('sync-dot');
    const txt = document.getElementById('sync-txt');
    if (!dot || !txt) return;
    if (online) {
        dot.style.background = '#22c55e';
        txt.textContent = 'Sincronizado';
        txt.style.color = '#22c55e';
    } else {
        dot.style.background = '#ef4444';
        txt.textContent = 'Sem Conexão';
        txt.style.color = '#ef4444';
    }
}

// ==========================================
// FIREBASE REALTIME LISTENERS
// ==========================================
function startFirebaseListeners() {
    if (!db) {
        setSyncStatus(false);
        return;
    }

    // Monitor connection state
    db.ref('.info/connected').on('value', snap => {
        const online = snap.val() === true;
        setSyncStatus(online);
    });

    // Employees (Tempo Real)
    db.ref('employees').on('value', snap => {
        state.employees = snap.val() || {};
        saveLocal();
        renderAll();
        updateHomeButtons();
        if (state.user && state.user.role === 'employee') {
            renderEmployeeDash();
            checkWinCondition();
        }
    }, err => {
        console.error("employees listener error:", err);
        setSyncStatus(false);
    });

    // Prize (Tempo Real)
    db.ref('currentPrize').on('value', snap => {
        const val = snap.val();
        if (val !== null) {
            state.prize = val;
            saveLocal();
            updatePrizeDisplay();
        }
    });

    // Global winner
    db.ref('globalWinner').on('value', snap => {
        const winner = snap.val();
        if (winner && state.user && winner.timestamp > state.lastWinnerTime) {
            showGlobalCelebration(winner);
            state.lastWinnerTime = winner.timestamp;
        }
    });

    // Cycle reset
    db.ref('cycleReset').on('value', snap => {
        const resetData = snap.val();
        const lastReset = parseInt(localStorage.getItem('last_reset') || '0');
        if (resetData && state.user && resetData.timestamp > lastReset) {
            showResetNotification(resetData);
            localStorage.setItem('last_reset', resetData.timestamp);
        }
    });

    // First winner
    db.ref('firstWinner').on('value', snap => {
        state.firstWinner = snap.val();
        renderTransparencyBar();
    });
}

// ==========================================
// BOOT
// ==========================================
window.onload = () => {
    loadLocal();
    const savedUser = localStorage.getItem('mp_user');
    if (savedUser) {
        try { state.user = JSON.parse(savedUser); } catch(e) { state.user = null; }
    }

    renderAll();
    updateHomeButtons();
    updatePrizeDisplay();

    if (state.user) {
        showView(roleToView(state.user.role));
    } else {
        showView('login');
    }

    startFirebaseListeners();
};

// ==========================================
// HELPERS
// ==========================================
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
    if (typeof renderTransparencyBar === 'function') renderTransparencyBar();
}

function updateHomeButtons() {
    const btnEmp = document.querySelector('#login-step-home .btn-primary');
    const btnMgr = document.querySelector('#login-step-home .btn-outline');
    if (!btnEmp || !btnMgr) return;

    if (state.user && state.user.role === 'employee') {
        const empName = state.employees[state.user.id]?.name || "Funcionário";
        btnEmp.innerHTML = `<i class="fa-solid fa-user-check"></i> Entrar como ${empName}`;
        btnEmp.onclick = () => showView('emp');
    } else {
        btnEmp.innerHTML = `<i class="fa-solid fa-user-check"></i> Sou Funcionário`;
        btnEmp.onclick = () => changeLoginStep('employee');
    }

    if (state.user && state.user.role === 'manager') {
        btnMgr.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Painel (Logado)`;
        btnMgr.onclick = () => showView('mgr');
    } else {
        btnMgr.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Painel Gerencial`;
        btnMgr.onclick = () => changeLoginStep('manager');
    }
}

// ==========================================
// NAVIGATION
// ==========================================
function showView(viewName) {
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
        renderAll();
    }
}
window.showView = showView;

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
        if (step === 'employee') renderNamelist();
    }
};

// ==========================================
// LOGIN & REGISTER
// ==========================================
window.actionEmployeeAuth = () => {
    const nameInput = document.getElementById('emp-name-input');
    const passInput = document.getElementById('emp-pass-input');
    if (!nameInput || !passInput) return;

    const name = nameInput.value.trim();
    const pass = passInput.value.trim();

    if (!name || !pass) { alert("Digite Nome e Senha!"); return; }

    // Verificar conta deletada
    const deleted = Object.entries(state.employees || {}).find(
        ([, emp]) => emp.name.toLowerCase() === name.toLowerCase() && emp.deleted
    );
    if (deleted) { alert("🔒 Esta conta foi desativada pelo Gerente."); return; }

    // Tentar login local primeiro (dados já carregados)
    const found = Object.entries(state.employees || {}).find(
        ([, emp]) => emp.name.toLowerCase() === name.toLowerCase() && !emp.deleted
    );

    if (found) {
        const [id, emp] = found;
        if (emp.password === pass) {
            loginAs(id, 'employee');
        } else {
            alert("Senha incorreta!");
        }
        return;
    }

    // Não achou local — buscar DIRETO no Firebase antes de cadastrar
    const btn = document.querySelector('#login-step-employee .btn-primary');
    const origText = btn ? btn.innerHTML : 'LOGAR / CADASTRAR';
    if (btn) { btn.innerHTML = "Verificando..."; btn.disabled = true; }

    const resetBtn = () => { if (btn) { btn.innerHTML = origText; btn.disabled = false; } };

    if (!db) { 
        alert("Erro: Banco de dados não inicializado! Verifique se os arquivos foram subidos corretamente."); 
        resetBtn(); 
        return; 
    }

    // DEBUG: Verificando se snap retorna
    const timeout = setTimeout(() => {
        alert("A conexão com o banco está demorando muito. Verifique se o DatabaseURL e as regras estão corretas!");
        resetBtn();
    }, 8000);

    db.ref('employees').once('value').then(snap => {
        clearTimeout(timeout);
        const all = snap.val() || {};
        const entries = Object.entries(all);

        // Verificar se apagado no banco
        const fbDeleted = entries.find(([, e]) => e.name?.toLowerCase() === name.toLowerCase() && e.deleted);
        if (fbDeleted) { alert("🔒 Esta conta foi desativada pelo Gerente."); resetBtn(); return; }

        // Verificar se existe no banco
        const fbFound = entries.find(([, e]) => e.name?.toLowerCase() === name.toLowerCase() && !e.deleted);
        if (fbFound) {
            const [id, emp] = fbFound;
            if (emp.password === pass) {
                state.employees[id] = emp;
                loginAs(id, 'employee');
            } else {
                alert("Senha incorreta!");
                resetBtn();
            }
            return;
        }

        // Não existe: Novo cadastro
        if (btn) { btn.innerHTML = "Cadastrando..."; }
        const data = { name, password: pass, goodStars: 0, badStars: 0, deleted: false };
        db.ref('employees').push(data)
            .then(ref => {
                state.employees[ref.key] = data;
                loginAs(ref.key, 'employee');
                alert("Cadastro realizado com sucesso!");
            })
            .catch(err => { 
                console.error(err);
                alert("Erro ao cadastrar: " + err.message); 
                resetBtn(); 
            });

    }).catch(err => {
        clearTimeout(timeout);
        alert("Erro ao acessar banco: " + err.message);
        resetBtn();
    });
};

function loginAs(id, role) {
    state.user = { id, role };
    localStorage.setItem('mp_user', JSON.stringify(state.user));

    if (role === 'employee') {
        const name = document.getElementById('emp-name-input')?.value;
        const pass = document.getElementById('emp-pass-input')?.value;
        if (name) localStorage.setItem('mp_last_name', name);
        if (pass) localStorage.setItem('mp_last_pass', pass);
    }

    updatePresence();
    addDevLog('LOGIN', `${id} como ${role}`);
    renderAll();
    updateHomeButtons();
    showView(roleToView(role));
}

window.actionMgrLoginStep = () => {
    const pass = document.getElementById('mgr-pass-input').value;
    if (pass === 'dev99') {
        loginAs('mgr_root', 'manager');
        document.getElementById('mgr-pass-input').value = '';
    } else if (pass === 'developer20') {
        loginAs('dev_root', 'developer');
        document.getElementById('mgr-pass-input').value = '';
    } else {
        alert("Senha incorreta.");
    }
};

window.actionLogout = () => {
    if (db && state.user) db.ref(`presence/${state.user.id}`).remove();
    state.user = null;
    localStorage.removeItem('mp_user');
    renderAll();
    updateHomeButtons();
    changeLoginStep('home');
    showView('login');
};

// ==========================================
// RENDERERS
// ==========================================
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

// --- EMPLOYEE DASH ---
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
        if (isWinner) {
            tag.textContent = "🏆 PRÊMIO CONQUISTADO!";
            tag.style.background = "#fefce8"; tag.style.color = "#854d0e";
        } else if (isDisq) {
            tag.textContent = "⚠️ LIMITE DE ERROS ATINGIDO";
            tag.style.background = "#fef2f2"; tag.style.color = "#991b1b";
        } else {
            tag.textContent = "🚀 STATUS: EM ANDAMENTO";
            tag.style.background = "#f1f5f9"; tag.style.color = "#64748b";
        }
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

function checkWinCondition() {
    if (!state.user || state.user.role !== 'employee') return;
    const emp = state.employees[state.user.id];
    if (!emp) return;
    const good = emp.goodStars || 0;
    const bad = emp.badStars || 0;
    const isWinner = (good >= GOAL && bad < DISQ);
    if (isWinner && !state.winnersNotified[state.user.id]) {
        state.winnersNotified[state.user.id] = true;
        if (db) {
            db.ref('globalWinner').set({
                id: state.user.id, name: emp.name, prize: state.prize, timestamp: Date.now()
            });
            if (!state.firstWinner) {
                db.ref('firstWinner').set({ id: state.user.id, name: emp.name, timestamp: Date.now() });
            }
        }
    }
}

function showGlobalCelebration(winner) {
    if (!state.user) return;
    const isMe = (state.user.id === winner.id);
    const titleEl = document.getElementById('celeb-title');
    const msgEl = document.getElementById('celeb-msg');
    const instrEl = document.getElementById('celeb-instructions');
    if (isMe) {
        titleEl.textContent = "VOCÊ VENCEU!";
        msgEl.innerHTML = `Parabéns <b>${winner.name}</b>!<br>Você ganhou: <b>${winner.prize}</b>`;
        instrEl.style.display = 'block';
    } else {
        titleEl.textContent = "TEMOS UM GANHADOR!";
        msgEl.innerHTML = `O funcionário <b>${winner.name}</b><br>acaba de ganhar: <b>${winner.prize}</b>`;
        instrEl.style.display = 'none';
    }
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
        row.className = 'team-row animate-slide';
        row.innerHTML = `<span class="t-name">${escapeHTML(emp.name)}</span><span class="t-mask">** ⭐</span>`;
        grid.appendChild(row);
    });
}

// --- MANAGER DASH ---
function renderManagerGrid() {
    const grid = document.getElementById('mgr-grid-employees');
    if (!grid) return;
    grid.innerHTML = '';
    Object.entries(state.employees || {}).filter(([, emp]) => !emp.deleted).forEach(([id, emp]) => {
        const card = document.createElement('div');
        card.className = 'm-card animate-fade';
        const good = emp.goodStars || 0;
        const bad = emp.badStars || 0;
        const isDisq = (bad >= DISQ);
        card.innerHTML = `
            <div class="m-head">
                <h4>${escapeHTML(emp.name)}</h4>
                <i class="fa-solid fa-trash-can m-del" onclick="handleEmpDelete('${id}')"></i>
            </div>
            <div class="m-scores">
                <div class="m-box"><span class="m-val green">${good}</span><span class="m-lbl">Boas</span></div>
                <div class="m-box"><span class="m-val red">${bad}</span><span class="m-lbl">Ruins</span></div>
            </div>
            <div class="m-acts">
                <button class="bt-sc pos" onclick="handlePoint('${id}', 'good', 1)" ${isDisq ? 'disabled style="opacity:0.3"' : ''}>+ VERDE</button>
                <button class="bt-sc pos" onclick="handlePoint('${id}', 'good', -1)" style="background:#f1f5f9; color:var(--text-dim)">- VERDE</button>
                <button class="bt-sc neg" onclick="handlePoint('${id}', 'bad', 1)">+ RUIM</button>
                <button class="bt-sc neg" onclick="handlePoint('${id}', 'bad', -1)" style="background:#f1f5f9; color:var(--text-dim)">- RUIM</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderTransparencyBar() {
    const bar = document.getElementById('mgr-transparency-bar');
    if (!bar) return;
    if (!state.user || state.user.role !== 'manager') { bar.style.display = 'none'; return; }
    const attentionList = Object.values(state.employees || {}).filter(e => !e.deleted && (e.badStars || 0) >= DISQ);
    if (!state.firstWinner && attentionList.length === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = '';
    if (state.firstWinner) {
        const card = document.createElement('div');
        card.className = 'trans-card gold';
        card.innerHTML = `<div class="trans-icon">🥇</div><div class="trans-info"><span class="trans-label">Primeiro a bater 17</span><span class="trans-user">${escapeHTML(state.firstWinner.name)}</span></div>`;
        bar.appendChild(card);
    }
    attentionList.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'trans-card red';
        card.innerHTML = `<div class="trans-icon">⚠️</div><div class="trans-info"><span class="trans-label">Atenção: Limite Excedido</span><span class="trans-user">${escapeHTML(emp.name)}</span></div>`;
        bar.appendChild(card);
    });
}

// ==========================================
// MANAGER ACTIONS
// ==========================================
window.handlePoint = (id, type, val) => {
    const emp = state.employees[id];
    if (!emp) return;
    const prop = type === 'good' ? 'goodStars' : 'badStars';
    const old = emp[prop] || 0;
    let newValue = old + val;
    if (newValue < 0) newValue = 0;
    emp[prop] = newValue;
    saveLocal();
    renderActiveView();
    if (db) {
        db.ref(`employees/${id}/${prop}`).set(newValue);
        addDevLog('PONTO', `${emp.name}: ${prop} ${old} -> ${newValue}`);
    }
};

window.handleEmpDelete = (id) => {
    if (confirm("Desativar funcionário permanentemente?")) {
        state.employees[id].deleted = true;
        saveLocal();
        renderActiveView();
        if (db) {
            db.ref(`employees/${id}/deleted`).set(true);
            addDevLog('DELETE', `Funcionário: ${state.employees[id].name}`);
        }
    }
};

function showResetNotification(data) {
    if (!state.user) return;
    document.getElementById('celeb-title').textContent = "NOVO CICLO!";
    document.getElementById('celeb-msg').innerHTML = `Novo prêmio: <b>${data.prize}</b>.<br>As estrelas de todos foram reiniciadas!`;
    document.getElementById('celeb-instructions').style.display = 'none';
    document.getElementById('celeb-overlay').classList.add('active');
}

window.actionConfirmPrizeReset = () => {
    const newPrize = document.getElementById('input-global-prize-mgr').value.trim();
    if (!newPrize) { alert("Digite um prêmio válido!"); return; }
    document.getElementById('modal-confirm-reset').classList.add('active');
};
window.closeResetModal = () => { document.getElementById('modal-confirm-reset').classList.remove('active'); };

window.actionExecuteReset = () => {
    if (!db) { alert("Sem conexão!"); return; }
    const newPrize = document.getElementById('input-global-prize-mgr').value.trim();
    state.prize = newPrize;
    const updates = { 'currentPrize': newPrize };
    Object.keys(state.employees || {}).forEach(id => {
        state.employees[id].goodStars = 0;
        state.employees[id].badStars = 0;
        updates[`employees/${id}/goodStars`] = 0;
        updates[`employees/${id}/badStars`] = 0;
    });
    saveLocal();
    renderAll();
    db.ref().update(updates).then(() => {
        db.ref('cycleReset').set({ prize: newPrize, timestamp: Date.now() });
        db.ref('firstWinner').remove();
        addDevLog('RESET', `Novo prêmio: ${newPrize}`);
        closeResetModal();
    });
};

// ==========================================
// UI HELPERS
// ==========================================
window.switchTab = (tabId) => {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabId}`)?.classList.add('active');
    document.getElementById(`nav-btn-${tabId}`)?.classList.add('active');
};

window.openMgrModalAdd = () => document.getElementById('modal-mgr-add')?.classList.add('active');
window.closeMgrModalAdd = () => document.getElementById('modal-mgr-add')?.classList.remove('active');
window.actionMgrAddSave = () => {
    const name = document.getElementById('modal-new-emp-name')?.value.trim();
    if (name && db) {
        db.ref('employees').push({ name, goodStars: 0, badStars: 0, deleted: false });
        document.getElementById('modal-new-emp-name').value = '';
        closeMgrModalAdd();
    }
};

// ==========================================
// DEVELOPER LOGS & PRESENCE
// ==========================================
function addDevLog(action, details) {
    if (!db) return;
    const name = (state.user && state.employees[state.user.id]?.name) || state.user?.id || 'Sistema';
    db.ref('dev_logs').push({ action, details, user: name, timestamp: Date.now() });
}

function updatePresence() {
    if (!db || !state.user) return;
    const ref = db.ref(`presence/${state.user.id}`);
    ref.set({
        name: state.employees[state.user.id]?.name || (state.user.role === 'manager' ? 'Supervisor' : (state.user.role === 'developer' ? 'Dev' : 'Ativo')),
        role: state.user.role,
        lastActive: Date.now(),
        ua: navigator.userAgent.substring(0, 80)
    });
    ref.onDisconnect().remove();
}
setInterval(() => { if (state.user) updatePresence(); }, 30000);

function renderDeveloperPanel() {
    if (!state.user || state.user.role !== 'developer') return;
    db.ref('presence').on('value', snap => {
        const list = document.getElementById('dev-presence-list');
        if (!list) return;
        const online = snap.val() || {};
        list.innerHTML = Object.values(online).map(p => `
            <div class="dev-log-item">
                <span class="log-time" style="color:#22c55e;">● ONLINE</span>
                <span class="log-action"><b>${p.name}</b> (${p.role})</span>
                <span class="log-details">${p.ua || 'Desconhecido'}</span>
            </div>
        `).join('') || '<div class="dev-log-item" style="color:#64748b;">Nenhum dispositivo ativo.</div>';
    });
    db.ref('dev_logs').limitToLast(50).on('value', snap => {
        const list = document.getElementById('dev-logs-list');
        if (!list) return;
        const logs = snap.val() || {};
        list.innerHTML = Object.values(logs).reverse().map(l => `
            <div class="dev-log-item">
                <span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
                <span class="log-action"><b>[${l.user}]</b> ${l.action}</span>
                <span class="log-details">${l.details}</span>
            </div>
        `).join('') || '<div class="dev-log-item" style="color:#64748b;">Sem logs.</div>';
    });
}

function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}
