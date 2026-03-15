// --- KILL OLD SERVICE WORKER (FORÇA ATUALIZAÇÃO) ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        for (let reg of regs) reg.unregister();
    });
}

const firebaseConfig = {
    apiKey: "AIzaSyA_IIOZ9J3YvrWr__ipeoolT6mlbGQ82kk",
    authDomain: "metal-print-a099b.firebaseapp.com",
    databaseURL: "https://metal-print-a099b-default-rtdb.firebaseio.com",
    projectId: "metal-print-a099b",
    storageBucket: "metal-print-a099b.appspot.com",
    messagingSenderId: "521510301351",
    appId: "1:521510301351:web:49016ec1da1058e35db582"
};

// ==========================================
// PROTEÇÃO EXTREMA ANTI-F12 (V27)
// ==========================================
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || 
        (e.ctrlKey && e.key === 'U')) {
        e.preventDefault();
        return false;
    }
});
// Armadilha contínua de debugger
setInterval(() => {
    const before = new Date().getTime();
    debugger;
    const after = new Date().getTime();
    if (after - before > 100) {
        document.body.innerHTML = "<h1 style='color:red; text-align:center; margin-top:20%; font-family:sans-serif;'>ACESSO BLOQUEADO POR SEGURANÇA</h1>";
        window.location.replace("about:blank");
    }
}, 1000);

// FIREBASE INIT
let db;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.database();
} catch (e) {
    console.error("Erro Firebase Detalhado:", e);
}

const GOAL = 17;
const DISQ = 9;

// STATE
let state = {
    user: null, // {id, role}
    employees: {},
    prize: "",
    activeTab: 'balance',
    winnersNotified: {},
    firstWinner: null // V21
};

// DOM CACHE
const screens = {
    login: document.getElementById('screen-login'),
    emp: document.getElementById('screen-employee'),
    mgr: document.getElementById('screen-manager')
};

const loginSteps = {
    home: document.getElementById('login-step-home'),
    employee: document.getElementById('login-step-employee'),
    manager: document.getElementById('login-step-manager')
};

// --- HELPER DE PERSISTÊNCIA LOCAL ---
function saveLocal() {
    localStorage.setItem('metal_print_data', JSON.stringify({
        employees: state.employees,
        prize: state.prize
    }));
}

function loadLocal() {
    const data = localStorage.getItem('metal_print_data');
    if (data) {
        const parsed = JSON.parse(data);
        state.employees = parsed.employees || {};
        state.prize = parsed.prize || "";
    }
}

// ==========================================
// CORE BOOT (PERSISTÊNCIA)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Carregar cache local IMEDIATAMENTE
    loadLocal();
    
    // 2. Recuperar sessão
    const savedUser = localStorage.getItem('metal_print_user');
    if (savedUser) {
        state.user = JSON.parse(savedUser);
    }

    // 3. Recuperar credenciais salvas do dispositivo
    const savedName = localStorage.getItem('metal_print_last_name');
    const savedPass = localStorage.getItem('metal_print_last_pass');
    if (savedName && savedPass) {
        const nInp = document.getElementById('emp-name-input');
        const pInp = document.getElementById('emp-pass-input');
        if (nInp) nInp.value = savedName;
        if (pInp) pInp.value = savedPass;
    }

    // 4. Renderizar com o que temos no cache
    renderAll();
    updateHomeButtons();
    updatePrizeDisplay();
    showView('login');

    // 4. Iniciar conexão Firebase (Sincronização Silenciosa)
    if (db) {
        db.ref('currentPrize').on('value', snap => {
            const val = snap.val();
            if (val !== null && val !== state.prize) {
                state.prize = val;
                saveLocal();
                updatePrizeDisplay();
            }
        });

        db.ref('employees').on('value', snap => {
            const val = snap.val();
            state.employees = val || {}; // Trata banco vazio ou resetado
            saveLocal();
            renderAll();
            updateHomeButtons();
            checkWinCondition(); 
        });

        // NOTIFICAÇÃO GLOBAL (V16)
        db.ref('globalWinner').on('value', snap => {
            const winner = snap.val();
            if (winner && state.user && winner.timestamp > (state.lastWinnerTime || 0)) {
                showGlobalCelebration(winner);
                state.lastWinnerTime = winner.timestamp;
            }
        });

        // NOTIFICAÇÃO DE RESET (V17)
        db.ref('cycleReset').on('value', snap => {
            const resetData = snap.val();
            if (resetData && state.user && resetData.timestamp > (localStorage.getItem('last_reset') || 0)) {
                showResetNotification(resetData);
                localStorage.setItem('last_reset', resetData.timestamp);
            }
        });

        // V21: MONITORAMENTO DE PRIMEIRO VENCEDOR
        db.ref('firstWinner').on('value', snap => {
            state.firstWinner = snap.val();
            renderTransparencyBar();
        });
    }
});

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
    
    if (state.user && state.user.role === 'employee') {
        const empName = state.employees[state.user.id]?.name || "Funcionário";
        btnEmp.innerHTML = `<i class="fa-solid fa-user-check"></i> Entrar como ${empName}`;
        btnEmp.onclick = () => window.showView('emp'); // Use o escopo global
    } else {
        btnEmp.innerHTML = `<i class="fa-solid fa-user-check"></i> Sou Funcionário`;
        btnEmp.onclick = () => changeLoginStep('employee');
    }

    if (state.user && state.user.role === 'manager') {
        btnMgr.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Painel (Logado)`;
        btnMgr.onclick = () => window.showView('mgr');
    } else {
        btnMgr.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Painel Gerencial`;
        btnMgr.onclick = () => changeLoginStep('manager');
    }
}

// --- NAVEGAÇÃO / VIEWS ---
// --- NAVEGAÇÃO / VIEWS ---
function showView(viewName) {
    const idMap = {
        'login': 'screen-login', 'emp': 'screen-employee', 'mgr': 'screen-manager',
        'employee': 'screen-employee', 'manager': 'screen-manager'
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

// ==========================================
// LOGIN & REGISTER
// ==========================================

window.changeLoginStep = (step) => {
    // Esconde todos
    Object.values(loginSteps).forEach(s => {
        if (s) s.classList.remove('active');
    });

    // Mostra o alvo
    const target = loginSteps[step];
    if (target) {
        target.classList.add('active');
        if (step === 'employee') {
            renderNamelist();
        }
    }
};

window.actionEmployeeAuth = () => {
    const nameInput = document.getElementById('emp-name-input');
    const passInput = document.getElementById('emp-pass-input');
    if (!nameInput || !passInput) return;

    const name = nameInput.value.trim();
    const pass = passInput.value.trim();

    if (!name || !pass) {
        alert("Digite Nome e Senha para continuar!");
        return;
    }

    // Proteção V27: Impede recadastro de banco apagado (soft-delete)
    const deletedEntry = Object.entries(state.employees || {}).find(([id, emp]) => emp.name.toLowerCase() === name.toLowerCase() && emp.deleted);
    if (deletedEntry) {
        alert("🔒 Esta conta foi desativada permanentemente pelo Gerente.");
        return;
    }

    // Tenta encontrar nos dados LOCAIS (Instantâneo) - ignorando apagados
    const empEntry = Object.entries(state.employees || {}).find(([id, emp]) => emp.name.toLowerCase() === name.toLowerCase() && !emp.deleted);

    if (empEntry) {
        // LOGIN INSTANTÂNEO
        const [id, emp] = empEntry;
        if (emp.password === pass) {
            loginAs(id, 'employee');
        } else {
            alert("Senha incorreta para este nome!");
        }
    } else {
        // NOVO CADASTRO (Cria local e tenta salvar em background)
        const tempId = 'temp_' + Date.now();
        const data = { name, password: pass, goodStars: 0, badStars: 0 };
        
        // Adiciona ao estado local na hora
        state.employees[tempId] = data;
        saveLocal();
        
        // Loga imediatamente
        loginAs(tempId, 'employee');

        // Sincroniza com Firebase em background
        if (db) {
            const newRef = db.ref('employees').push();
            newRef.set(data).then(() => {
                // BUGFIX: Copia o dado para a chave real antes de apagar o temporário
                const realId = newRef.key;
                state.employees[realId] = data;

                if (state.user && state.user.id === tempId) {
                    state.user.id = realId;
                    localStorage.setItem('metal_print_user', JSON.stringify(state.user));
                }
                
                delete state.employees[tempId]; // Agora é seguro apagar
                saveLocal();
                renderAll();
            }).catch(e => {
                console.error("Erro sync:", e);
                alert("Erro ao sincronizar com o banco! Verifique sua internet.");
            });
        }
    }
};

function loginAs(id, role) {
    state.user = { id, role };
    localStorage.setItem('metal_print_user', JSON.stringify(state.user));
    
    // PERSISTÊNCIA DE SENHA (V15)
    if (role === 'employee') {
        const name = document.getElementById('emp-name-input').value;
        const pass = document.getElementById('emp-pass-input').value;
        if (name && pass) {
            localStorage.setItem('metal_print_last_name', name);
            localStorage.setItem('metal_print_last_pass', pass);
        }
    }

    renderAll();
    updateHomeButtons();
    showView(role === 'manager' ? 'mgr' : 'emp');
}

window.actionMgrLoginStep = () => {
    const pass = document.getElementById('mgr-pass-input').value;
    if (pass === 'dev99') {
        loginAs('mgr_root', 'manager');
        document.getElementById('mgr-pass-input').value = '';
    } else {
        alert("Senha incorreta.");
    }
};

window.actionLogout = () => {
    state.user = null;
    localStorage.removeItem('metal_print_user');
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
    
    const entries = Object.entries(state.employees || {}).filter(([id, emp]) => !emp.deleted).sort((a,b) => a[1].name.localeCompare(b[1].name));
    
    if (entries.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; color: #64748b; font-weight: 600;">Nenhum funcionário cadastrado ainda.</div>';
        return;
    }

    container.innerHTML = '';
    entries.forEach(([id, emp]) => {
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
    } else {
        renderManagerGrid();
    }
}

// --- VISÃO FUNCIONÁRIO ---

function renderEmployeeDash() {
    if (!state.user || state.user.role !== 'employee') return;
    const emp = state.employees[state.user.id];
    if (!emp) return;

    const good = emp.goodStars || 0;
    const bad = emp.badStars || 0;
    const isWinner = (good >= GOAL && bad < DISQ);
    const isDisq = (bad >= DISQ);

    // Balance (SIDE BY SIDE)
    const goodEl = document.getElementById('display-good-stars');
    const badEl = document.getElementById('display-bad-stars-side');
    if (goodEl) goodEl.textContent = good;
    if (badEl) badEl.textContent = bad;
    
    const tag = document.getElementById('display-status-tag');
    if (tag) {
        if (isWinner) {
            tag.textContent = "🏆 PRÊMIO CONQUISTADO!";
            tag.style.background = "#fefce8";
            tag.style.color = "#854d0e";
        } else if (isDisq) {
            tag.textContent = "⚠️ LIMITE DE ERROS ATINGIDO";
            tag.style.background = "#fef2f2";
            tag.style.color = "#991b1b";
        } else {
            tag.textContent = "🚀 STATUS: EM ANDAMENTO";
            tag.style.background = "#f1f5f9";
            tag.style.color = "#64748b";
        }
    }

    // Detail Items
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
        
        // Notifica o Firebase para avisar TODO MUNDO
        if (db) {
            db.ref('globalWinner').set({
                id: state.user.id,
                name: emp.name,
                prize: state.prize,
                timestamp: Date.now()
            });

            // V21: REGISTRA PRIMEIRO VENCEDOR SE VAZIO
            if (!state.firstWinner) {
                db.ref('firstWinner').set({
                    id: state.user.id,
                    name: emp.name,
                    timestamp: Date.now()
                });
            }
        }
    }
}

function showGlobalCelebration(winner) {
    if (!state.user) return; // Não mostra na tela de login
    
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

window.closeCeleb = () => {
    document.getElementById('celeb-overlay').classList.remove('active');
};

function renderTeamList() {
    const grid = document.getElementById('team-list-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    Object.entries(state.employees || {}).forEach(([id, emp]) => {
        if(id === state.user.id || emp.deleted) return;
        
        const row = document.createElement('div');
        row.className = 'team-row animate-slide';
        row.innerHTML = `
            <span class="t-name">${escapeHTML(emp.name)}</span>
            <span class="t-mask">** ⭐</span>
        `;
        grid.appendChild(row);
    });
}

// --- VISÃO GERENTE ---

function renderManagerGrid() {
    const grid = document.getElementById('mgr-grid-employees');
    if(!grid) return;
    grid.innerHTML = '';

    Object.entries(state.employees || {}).filter(([_,emp]) => !emp.deleted).forEach(([id, emp]) => {
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
                <div class="m-box">
                    <span class="m-val green">${good}</span>
                    <span class="m-lbl">Boas</span>
                </div>
                <div class="m-box">
                    <span class="m-val red">${bad}</span>
                    <span class="m-lbl">Ruins</span>
                </div>
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

    // Só mostra se for gerente
    if (!state.user || state.user.role !== 'manager') {
        bar.style.display = 'none';
        return;
    }

    const attentionList = Object.values(state.employees || {}).filter(e => !e.deleted && (e.badStars || 0) >= DISQ);
    
    if (!state.firstWinner && attentionList.length === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    bar.innerHTML = '';

    // Card Primeiro Ganhador
    if (state.firstWinner) {
        const card = document.createElement('div');
        card.className = 'trans-card gold';
        card.innerHTML = `
            <div class="trans-icon">🥇</div>
            <div class="trans-info">
                <span class="trans-label">Primeiro a bater 17</span>
                <span class="trans-user">${escapeHTML(state.firstWinner.name)}</span>
            </div>
        `;
        bar.appendChild(card);
    }

    // Cards de Atenção
    attentionList.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'trans-card red';
        card.innerHTML = `
            <div class="trans-icon">⚠️</div>
            <div class="trans-info">
                <span class="trans-label">Atenção: Limite Excedido</span>
                <span class="trans-user">${escapeHTML(emp.name)}</span>
            </div>
        `;
        bar.appendChild(card);
    });
}

// ==========================================
// AÇÕES (GERENCIAL)
// ==========================================

window.handlePoint = (id, type, val) => {
    const emp = state.employees[id];
    if (!emp) return;
    const prop = type === 'good' ? 'goodStars' : 'badStars';
    const old = emp[prop] || 0;
    
    let newValue = old + val;
    if (newValue < 0) newValue = 0;

    // Atualiza local IMEDIATAMENTE (UI Fluida)
    emp[prop] = newValue;
    saveLocal();
    renderActiveView();

    // Sincroniza em background
    if (db) {
        db.ref(`employees/${id}/${prop}`).set(newValue);
    }
};

window.handleEmpDelete = (id) => {
    if (confirm("Desativar funcionário permanentemente? Ele não poderá fazer login novamente.")) {
        state.employees[id].deleted = true;
        saveLocal();
        renderActiveView();
        
        if (db) {
            db.ref(`employees/${id}/deleted`).set(true);
        }
    }
};

function showResetNotification(data) {
    if (!state.user) return;
    document.getElementById('celeb-title').textContent = "NOVO CICLO!";
    document.getElementById('celeb-msg').innerHTML = `O Gerente definiu um novo prêmio: <b>${data.prize}</b>.<br>As estrelas de todos foram reiniciadas!`;
    document.getElementById('celeb-instructions').style.display = 'none';
    document.getElementById('celeb-overlay').classList.add('active');
}

// ==========================================
// CONFIGURADOR DE PRÊMIO & RESET (V17)
// ==========================================
window.actionConfirmPrizeReset = () => {
    const newPrize = document.getElementById('input-global-prize-mgr').value.trim();
    if (!newPrize) {
        alert("Digite um prêmio válido!");
        return;
    }
    document.getElementById('modal-confirm-reset').classList.add('active');
};

window.closeResetModal = () => {
    document.getElementById('modal-confirm-reset').classList.remove('active');
};

window.actionExecuteReset = () => {
    const newPrize = document.getElementById('input-global-prize-mgr').value.trim();
    
    // 1. Atualizar prêmio no local e no db
    state.prize = newPrize;
    if (db) db.ref('currentPrize').set(newPrize);

    // 2. Zerar todos os funcionários localmente para feedback instantâneo
    const updates = {};
    Object.keys(state.employees || {}).forEach(id => {
        state.employees[id].goodStars = 0;
        state.employees[id].badStars = 0;
        updates[`employees/${id}/goodStars`] = 0;
        updates[`employees/${id}/badStars`] = 0;
    });
    
    // 3. Salvar local e renderizar
    saveLocal();
    renderAll();
    
    db.ref().update(updates).then(() => {
        // 4. Notificar reset global
        db.ref('cycleReset').set({
            prize: newPrize,
            timestamp: Date.now()
        });
        // 5. V21: Resetar Primeiro Vencedor
        db.ref('firstWinner').remove();
        
        closeResetModal();
    });
};

// ==========================================
// UI HELPERS (TABS / MODAIS)
// ==========================================

window.switchTab = (tabId) => {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById(`nav-btn-${tabId}`).classList.add('active');
};

window.openMgrModalAdd = () => document.getElementById('modal-mgr-add').classList.add('active');
window.closeMgrModalAdd = () => document.getElementById('modal-mgr-add').classList.remove('active');

window.actionMgrAddSave = () => {
    const name = document.getElementById('modal-new-emp-name').value.trim();
    if(name) {
        db.ref('employees').push({ name, goodStars: 0, badStars: 0 });
        document.getElementById('modal-new-emp-name').value = '';
        closeMgrModalAdd();
    }
};

// Final do arquivo
// Final do arquivo
function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// Register Service Worker REMOVED - NOW A STANDARD WEBSITE
