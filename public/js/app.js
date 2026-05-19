const API = {
    getUserId() {
        const user = getCurrentUser();
        return user?.id;
    },

    getHeaders(includeJson = false) {
        const headers = {};
        const userId = this.getUserId();

        if (includeJson) {
            headers['Content-Type'] = 'application/json';
        }

        if (userId) {
            headers['x-user-id'] = userId;
        }

        return headers;
    },

    async request(url, options = {}) {
        const response = await fetch(url, options);
        const contentType = response.headers.get('content-type') || '';
        let result = null;

        if (contentType.includes('application/json')) {
            result = await response.json();
        } else {
            const text = await response.text();
            result = { message: text.trim() };
        }

        if (!result?.message) {
            result = { ...(result || {}), message: `Error HTTP ${response.status}` };
        }

        if (!response.ok) {
            throw new Error(result.message || 'Error en la petición');
        }

        return result;
    },

    get(url) {
        return this.request(url, { headers: this.getHeaders() });
    },

    post(url, data) {
        return this.request(url, {
            method: 'POST',
            headers: this.getHeaders(true),
            body: JSON.stringify(data)
        });
    },

    put(url, data) {
        return this.request(url, {
            method: 'PUT',
            headers: this.getHeaders(true),
            body: JSON.stringify(data)
        });
    },

    patch(url, data) {
        return this.request(url, {
            method: 'PATCH',
            headers: this.getHeaders(true),
            body: JSON.stringify(data)
        });
    },

    delete(url) {
        return this.request(url, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
    }
};

function getCurrentUser() {
    return JSON.parse(localStorage.getItem('user') || 'null');
}

let printTemplate = {
    companyName: 'EMPAQUES MODERNOS SAN PABLO S. DE R.L. DE C.V.',
    criticalTitle: 'REVISIÓN DE EQUIPO ELÉCTRICO CRÍTICO',
    generalTitle: 'REVISIÓN DE EQUIPO ELÉCTRICO GENERAL',
    logoSrc: 'img/print-logo.jpg',
    footer: {
        code: 'F-01-MIF-S-42',
        version: 'Versión: 0',
        edition: 'Edición: 1',
        page: 'Página 1'
    }
};

const ROLE_PERMISSIONS = {
    admin: ['users:create', 'users:read', 'motors:create', 'motors:read', 'inspections:create', 'reports:read'],
    supervisor: ['users:read', 'motors:create', 'motors:read', 'inspections:create', 'reports:read'],
    technician: ['motors:read', 'inspections:create'],
    viewer: ['motors:read', 'reports:read']
};

const PERMISSION_LABELS = {
    'users:create': 'Crear y editar usuarios',
    'users:read': 'Consultar usuarios',
    'motors:create': 'Crear y editar equipos',
    'motors:read': 'Consultar equipos',
    'inspections:create': 'Registrar revisiones',
    'reports:read': 'Consultar reportes'
};

function showAlert(message, type = 'info') {
    document.querySelector('.app-alert')?.remove();

    const alert = document.createElement('div');
    alert.className = `app-alert app-alert-${type}`;
    alert.textContent = message;
    document.body.appendChild(alert);

    setTimeout(() => alert.remove(), 3000);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function initLogin() {
    const loginForm = document.getElementById('loginForm');

    if (!loginForm) {
        return;
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
            const data = await API.post('/api/login', {
                username: document.getElementById('username').value.trim(),
                password: document.getElementById('password').value
            });

            localStorage.setItem('user', JSON.stringify(data.user));
            showAlert('Bienvenido', 'success');

            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 700);
        } catch (error) {
            showAlert(error.message || 'Usuario o contraseña incorrectos', 'error');
        }
    });
}

function initDashboard() {
    if (!document.querySelector('.dashboard-page')) {
        return;
    }

    const user = getCurrentUser();

    if (!user) {
        window.location.href = '/';
        return;
    }

    const userName = document.querySelector('.user-name');
    const userAvatar = document.querySelector('.user-avatar');

    if (userName) {
        userName.textContent = `${user.username} (${user.role})`;
    }

    if (userAvatar) {
        userAvatar.textContent = user.username.slice(0, 2).toUpperCase();
    }

    document.getElementById('userMenuBtn')?.addEventListener('click', () => {
        document.getElementById('userDropdown')?.classList.toggle('active');
    });

    document.getElementById('logoutBtn')?.addEventListener('click', (event) => {
        event.preventDefault();
        localStorage.removeItem('user');
        window.location.href = '/';
    });

    document.querySelectorAll('.nav-item[data-page], .card-clickable[data-action]').forEach((item) => {
        item.addEventListener('click', () => showPage(item.dataset.page || item.dataset.action));
    });

    document.getElementById('reportAreaSelect')?.addEventListener('change', loadFollowUpReports);
    ['reportsAreaFilter', 'reportsDateFilter', 'reportsFindingFilter'].forEach((filterId) => {
        document.getElementById(filterId)?.addEventListener('change', loadReports);
    });
    document.getElementById('reportsClearFilters')?.addEventListener('click', () => {
        document.getElementById('reportsAreaFilter').value = '';
        document.getElementById('reportsDateFilter').value = '';
        document.getElementById('reportsFindingFilter').value = '';
        loadReports();
    });
    document.getElementById('criticalQueryBtn')?.addEventListener('click', () => loadReviewQuery(true));
    document.getElementById('generalQueryBtn')?.addEventListener('click', () => loadReviewQuery(false));
    document.getElementById('criticalQueryDate')?.addEventListener('change', () => loadReviewQuery(true));
    document.getElementById('generalQueryDate')?.addEventListener('change', () => loadReviewQuery(false));
    document.getElementById('criticalQueryArea')?.addEventListener('change', () => loadReviewQuery(true));
    document.getElementById('generalQueryArea')?.addEventListener('change', () => loadReviewQuery(false));
    document.getElementById('criticalPrintBtn')?.addEventListener('click', () => printReviewQuery(true));
    document.getElementById('generalPrintBtn')?.addEventListener('click', () => printReviewQuery(false));

    initEquipmentDatabase(user);
    initUserManagement(user);
    loadFollowUpReports();
    loadReports();
    initReviewQueryDates();
    loadPrintTemplate();
}

function showPage(page) {
    document.querySelectorAll('.page').forEach((section) => {
        section.classList.remove('active');
    });

    document.getElementById(`${page}-page`)?.classList.add('active');

    document.querySelectorAll('.nav-item').forEach((navItem) => {
        navItem.classList.toggle('active', navItem.dataset.page === page);
    });

    if (page === 'reports') {
        loadReports();
    }

    if (page === 'users') {
        loadUsers();
    }

    if (page === 'critical-query') {
        loadReviewQuery(true);
    }

    if (page === 'general-query') {
        loadReviewQuery(false);
    }
}

async function loadEquipment() {
    const result = await API.get('/api/equipment?includeInactive=1');

    if (Array.isArray(result)) {
        return result;
    }

    if (Array.isArray(result?.equipment)) {
        return result.equipment;
    }

    throw new Error(result?.message || 'La API de equipos no devolvio un arreglo valido');
}

let equipmentCache = [];

function renderEquipmentOptions(selectId, equipment, critical, area = '') {
    const select = document.getElementById(selectId);

    if (!select) {
        return;
    }

    const available = equipment.filter((item) => (
        item.active
        && Boolean(item.critical) === critical
        && (!area || item.area === area)
    ));

    select.innerHTML = available.length
        ? available.map((item) => `
            <option value="${item.id}">${escapeHtml(item.equipment_key)} - ${escapeHtml(item.name)}</option>
        `).join('')
        : '<option value="">Sin equipos para esta área</option>';
}

function refreshReviewEquipmentOptions() {
    renderEquipmentOptions(
        'readingEquipment',
        equipmentCache,
        false,
        document.getElementById('readingArea')?.value || ''
    );
    renderEquipmentOptions(
        'criticalReadingEquipment',
        equipmentCache,
        true,
        document.getElementById('criticalReadingArea')?.value || ''
    );
    renderEquipmentOptions(
        'currentReadingEquipment',
        equipmentCache,
        false,
        document.getElementById('currentReadingArea')?.value || ''
    );
    renderEquipmentOptions(
        'criticalCurrentEquipment',
        equipmentCache,
        true,
        document.getElementById('criticalCurrentArea')?.value || ''
    );
}

function renderEquipment(equipment) {
    if (!Array.isArray(equipment)) {
        throw new Error('La lista de equipos no tiene el formato esperado');
    }

    equipmentCache = equipment;
    const tableBody = document.getElementById('equipmentTableBody');
    const areaFilter = document.getElementById('equipmentAreaFilter');
    const typeFilter = document.getElementById('equipmentTypeFilter');
    const selectedArea = areaFilter?.value || '';
    const selectedType = typeFilter?.value || '';
    const visibleEquipment = equipment.filter((item) => (
        (!selectedArea || item.area === selectedArea)
        && (
            !selectedType
            || (selectedType === 'critical' && item.critical)
            || (selectedType === 'general' && !item.critical)
        )
    ));

    if (tableBody) {
        tableBody.innerHTML = visibleEquipment.length
            ? visibleEquipment.map((item) => `
                <tr>
                    <td>${escapeHtml(item.equipment_key)}</td>
                    <td>${escapeHtml(item.name)}</td>
                    <td>${escapeHtml(item.area || '-')}</td>
                    <td>${item.nominal_current ?? '-'} A</td>
                    <td>${item.critical ? 'Crítico' : 'General'}</td>
                    <td>${item.active ? 'Activo' : 'Inactivo'}</td>
                    <td>
                        <button class="btn-table-action" type="button" data-edit-equipment="${item.id}">
                            Editar
                        </button>
                        <button class="btn-table-action btn-table-danger" type="button" data-delete-equipment="${item.id}">
                            Eliminar
                        </button>
                    </td>
                </tr>
            `).join('')
            : '<tr><td class="empty-row" colspan="7">Sin equipos registrados</td></tr>';
    }

    refreshReviewEquipmentOptions();

    if (areaFilter) {
        const areas = [...new Set(equipment.map((item) => item.area).filter(Boolean))].sort();
        areaFilter.innerHTML = `
            <option value="">Todas las áreas</option>
            ${areas.map((area) => `
                <option value="${escapeHtml(area)}"${area === selectedArea ? ' selected' : ''}>${escapeHtml(area)}</option>
            `).join('')}
        `;
    }

    document.querySelectorAll('[data-edit-equipment]').forEach((button) => {
        button.addEventListener('click', () => {
            const equipmentId = Number(button.dataset.editEquipment);
            const item = equipment.find((candidate) => candidate.id === equipmentId);

            if (item) {
                setEquipmentFormMode(item);
            }
        });
    });

    document.querySelectorAll('[data-delete-equipment]').forEach((button) => {
        button.addEventListener('click', async () => {
            const equipmentId = Number(button.dataset.deleteEquipment);
            const item = equipment.find((candidate) => candidate.id === equipmentId);

            if (!item) {
                return;
            }

            const confirmed = window.confirm(`¿Eliminar el equipo ${item.equipment_key} - ${item.name}?`);

            if (!confirmed) {
                return;
            }

            try {
                await API.delete(`/api/equipment/${equipmentId}`);
                await refreshEquipmentDatabase();
                showAlert('Equipo eliminado', 'success');
            } catch (error) {
                showAlert(error.message || 'Error al eliminar equipo', 'error');
            }
        });
    });
}

function renderReadingsTable(tableBody, readings, emptyMessage) {
    tableBody.innerHTML = readings.length
        ? readings.map((item) => {
            const findings = [
                item.current === null || item.current === undefined ? 'Pendiente subestación' : '',
                !item.equipment_stopped && (item.temperature === null || item.temperature === undefined) ? 'Pendiente revisión física' : '',
                item.equipment_stopped ? 'Equipo parado' : '',
                item.overloaded ? 'Sobrecargado' : '',
                item.vibration ? 'Vibración' : '',
                item.noise ? 'Ruido' : '',
                item.cleaning_required ? 'Limpieza' : ''
            ].filter(Boolean).join(', ') || '-';
            const temperature = item.equipment_stopped
                ? '-'
                : item.temperature === null || item.temperature === undefined
                    ? 'Pendiente'
                    : `${escapeHtml(item.temperature)} °C`;
            const current = item.current === null || item.current === undefined
                ? 'Pendiente'
                : `${escapeHtml(item.current)} A`;

            return `
                <tr>
                    <td>${escapeHtml(formatRecordDate(item.date))}</td>
                    <td>${escapeHtml(item.equipment_key)}</td>
                    <td>${escapeHtml(item.equipment_name)}</td>
                    <td>${temperature}</td>
                    <td>${current}</td>
                    <td>${escapeHtml(findings)}</td>
                    <td>${escapeHtml(item.comments || '-')}</td>
                </tr>
            `;
        }).join('')
        : `<tr><td class="empty-row" colspan="7">${emptyMessage}</td></tr>`;
}

async function loadReadings(critical) {
    const tableBody = document.getElementById(
        critical ? 'criticalReadingsTableBody' : 'dailyReadingsTableBody'
    );

    if (!tableBody) {
        return;
    }

    try {
        const readings = await API.get(`/api/daily-readings?critical=${critical ? '1' : '0'}`);
        renderReadingsTable(
            tableBody,
            readings,
            critical ? 'Sin registros críticos' : 'Sin registros generales'
        );
    } catch (error) {
        tableBody.innerHTML = '<tr><td class="empty-row" colspan="7">No tienes permiso para ver registros</td></tr>';
    }
}

async function loadDailyReadings() {
    await Promise.all([
        loadReadings(false),
        loadReadings(true)
    ]);
}

function renderReviewQueryTable(tableBody, readings, emptyMessage) {
    tableBody.innerHTML = readings.length
        ? readings.map((item) => {
            const findings = [
                item.current === null || item.current === undefined ? 'Pendiente subestación' : '',
                !item.equipment_stopped && (item.temperature === null || item.temperature === undefined) ? 'Pendiente revisión física' : '',
                item.equipment_stopped ? 'Equipo parado' : '',
                item.overloaded ? 'Sobrecargado' : '',
                item.vibration ? 'Vibración' : '',
                item.noise ? 'Ruido' : '',
                item.cleaning_required ? 'Limpieza' : ''
            ].filter(Boolean).join(', ') || '-';
            const temperature = item.equipment_stopped
                ? '-'
                : item.temperature === null || item.temperature === undefined
                    ? 'Pendiente'
                    : `${escapeHtml(item.temperature)} \u00b0C`;
            const current = item.current === null || item.current === undefined
                ? 'Pendiente'
                : `${escapeHtml(item.current)} A`;

            return `
                <tr>
                    <td>${escapeHtml(formatRecordDate(item.date))}</td>
                    <td>${escapeHtml(item.area || '-')}</td>
                    <td>${escapeHtml(item.equipment_key)}</td>
                    <td>${escapeHtml(item.equipment_name)}</td>
                    <td>${temperature}</td>
                    <td>${current}</td>
                    <td>${escapeHtml(findings)}</td>
                    <td>${escapeHtml(item.comments || '-')}</td>
                    <td>${escapeHtml(item.username || '-')}</td>
                </tr>
            `;
        }).join('')
        : `<tr><td class="empty-row" colspan="9">${emptyMessage}</td></tr>`;
}

async function loadReviewQuery(critical) {
    const dateInput = document.getElementById(critical ? 'criticalQueryDate' : 'generalQueryDate');
    const areaInput = document.getElementById(critical ? 'criticalQueryArea' : 'generalQueryArea');
    const tableBody = document.getElementById(critical ? 'criticalQueryTableBody' : 'generalQueryTableBody');

    if (!dateInput || !areaInput || !tableBody) {
        return;
    }

    if (!dateInput.value) {
        dateInput.value = formatInputDate();
    }
    renderPrintTemplate();

    try {
        const params = new URLSearchParams({
            critical: critical ? '1' : '0',
            date: dateInput.value
        });

        if (areaInput.value) {
            params.set('area', areaInput.value);
        }

        const readings = await API.get(
            `/api/daily-readings?${params.toString()}`
        );
        renderReviewQueryTable(
            tableBody,
            readings,
            critical ? 'Sin revisión crítica para este día' : 'Sin revisión general para este día'
        );
    } catch (error) {
        tableBody.innerHTML = '<tr><td class="empty-row" colspan="9">No se pudo cargar la revisión</td></tr>';
    }
}

async function printReviewQuery(critical) {
    await loadReviewQuery(critical);
    renderPrintTemplate();
    document.body.classList.toggle('print-critical-query', critical);
    document.body.classList.toggle('print-general-query', !critical);
    window.print();
    setTimeout(() => {
        document.body.classList.remove('print-critical-query', 'print-general-query');
    }, 500);
}

function formatRelativeDate(dateValue) {
    const date = new Date(dateValue);
    const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    if (diffDays <= 0) {
        return 'Hoy';
    }

    if (diffDays === 1) {
        return 'Ayer';
    }

    return `Hace ${diffDays} días`;
}

function formatRecordDate(dateValue) {
    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleDateString();
}

function formatInputDate(date = new Date()) {
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function initReviewQueryDates() {
    const today = formatInputDate();

    ['criticalQueryDate', 'generalQueryDate'].forEach((inputId) => {
        const input = document.getElementById(inputId);

        if (input && !input.value) {
            input.value = today;
        }
    });
}

async function loadPrintTemplate() {
    try {
        const response = await fetch('/print-template.json');

        if (response.ok) {
            printTemplate = { ...printTemplate, ...(await response.json()) };
        }
    } catch (error) {
        // Keep built-in defaults if the editable template cannot be loaded.
    }

    renderPrintTemplate();
}

function getPrintReviewDate(type) {
    const input = document.getElementById(type === 'critical' ? 'criticalQueryDate' : 'generalQueryDate');
    return input?.value || formatInputDate();
}

function renderPrintTemplate() {
    ['critical', 'general'].forEach((type) => {
        const title = type === 'critical' ? printTemplate.criticalTitle : printTemplate.generalTitle;
        const header = document.querySelector(`[data-print-header="${type}"]`);
        const footer = document.querySelector(`[data-print-footer="${type}"]`);

        if (header) {
            header.innerHTML = `
                <div class="print-logo-cell">
                    <img src="${escapeHtml(printTemplate.logoSrc)}" alt="Logo">
                </div>
                <div class="print-company-cell">
                    ${escapeHtml(printTemplate.companyName)}
                </div>
                <div class="print-title-cell">
                    ${escapeHtml(title || printTemplate.defaultTitle || '')}
                </div>
                <div class="print-meta-cell">
                    <span>FECHA:</span>
                    <strong class="print-review-date">${escapeHtml(getPrintReviewDate(type))}</strong>
                </div>
            `;
        }

        if (footer) {
            footer.innerHTML = `
                <span>${escapeHtml(printTemplate.footer?.page || '')}</span>
                <span>${escapeHtml(printTemplate.footer?.version || '')}</span>
                <span>${escapeHtml(printTemplate.footer?.edition || '')}</span>
                <strong>${escapeHtml(printTemplate.footer?.code || '')}</strong>
            `;
        }
    });
}

function getReportFindings(item, includeStopped = false) {
    return [
        includeStopped && item.equipment_stopped ? { label: 'Equipo parado', className: 'report-flag-stopped' } : null,
        item.vibration ? { label: 'Vibración', className: 'report-flag-vibration' } : null,
        item.noise ? { label: 'Ruido', className: 'report-flag-noise' } : null,
        item.overloaded ? { label: 'Sobrecargado', className: 'report-flag-overload' } : null,
        item.cleaning_required ? { label: 'Limpieza', className: 'report-flag-dirt' } : null,
        (item.comments || '').trim() ? { label: 'Comentario', className: 'report-flag-comment' } : null
    ].filter(Boolean);
}

function hasClosableFinding(item) {
    return !item.finding_closed && getReportFindings(item, false).length > 0;
}

async function saveReportAction(reportId, currentAction = '') {
    const actionTaken = window.prompt(
        'Describe la acción realizada para atender el hallazgo:',
        currentAction
    );

    if (actionTaken === null) {
        return;
    }

    if (!actionTaken.trim()) {
        showAlert('La acción realizada es obligatoria', 'error');
        return;
    }

    try {
        await API.patch(`/api/reports/${reportId}/close`, {
            action_taken: actionTaken.trim()
        });
        await loadFollowUpReports();
        await loadReports();
        showAlert('Acción guardada', 'success');
    } catch (error) {
        showAlert(error.message || 'No se pudo guardar la acción', 'error');
    }
}

function getReportFilterQuery() {
    const params = new URLSearchParams();
    const area = document.getElementById('reportsAreaFilter')?.value || '';
    const date = document.getElementById('reportsDateFilter')?.value || '';
    const finding = document.getElementById('reportsFindingFilter')?.value || '';

    if (area) {
        params.set('area', area);
    }

    if (date) {
        params.set('date', date);
    }

    if (finding) {
        params.set('finding', finding);
    }

    const query = params.toString();
    return query ? `?${query}` : '';
}

function renderReportsTable(reports) {
    const tableBody = document.getElementById('reportsTableBody');

    if (!tableBody) {
        return;
    }

    if (!reports.length) {
        tableBody.innerHTML = '<tr><td class="empty-row" colspan="11">Sin reportes con los filtros seleccionados</td></tr>';
        return;
    }

    tableBody.innerHTML = reports.map((item) => {
        const findings = getReportFindings(item, true);
        const findingsHtml = findings.length
            ? findings.map((finding) => `<span class="report-flag ${finding.className}">${escapeHtml(finding.label)}</span>`).join('')
            : '';
        const temperature = item.equipment_stopped ? '-' : `${escapeHtml(item.temperature)} \u00b0C`;
        const current = item.equipment_stopped ? '-' : `${escapeHtml(item.current)} A`;
        const actionHtml = item.finding_closed
            ? `
                <div class="action-note">
                    <strong>Cerrado</strong>
                    <span>${escapeHtml(item.action_taken || '-')}</span>
                    ${item.closed_by_username ? `<small>Por ${escapeHtml(item.closed_by_username)}</small>` : ''}
                    <button class="btn-table-action action-edit-btn" type="button" data-edit-closed-report="${item.id}">
                        Editar
                    </button>
                </div>
            `
            : hasClosableFinding(item)
                ? `<button class="btn-table-action" type="button" data-close-report="${item.id}">Atender</button>`
                : '<span class="muted-text">Sin acción pendiente</span>';

        return `
            <tr>
                <td>${escapeHtml(formatRecordDate(item.date))}</td>
                <td>${item.critical ? 'Cr\u00edtica' : 'General'}</td>
                <td>${escapeHtml(item.area || '-')}</td>
                <td>${escapeHtml(item.equipment_key)}</td>
                <td>${escapeHtml(item.equipment_name)}</td>
                <td>${temperature}</td>
                <td>${current}</td>
                <td><div class="report-flags report-flags-table">${findingsHtml}</div></td>
                <td>${escapeHtml(item.comments || '-')}</td>
                <td>${actionHtml}</td>
                <td>${escapeHtml(item.username || '-')}</td>
            </tr>
        `;
    }).join('');

    document.querySelectorAll('[data-close-report]').forEach((button) => {
        button.addEventListener('click', () => saveReportAction(button.dataset.closeReport));
    });

    document.querySelectorAll('[data-edit-closed-report]').forEach((button) => {
        button.addEventListener('click', () => {
            const report = reports.find((item) => String(item.id) === String(button.dataset.editClosedReport));
            saveReportAction(button.dataset.editClosedReport, report?.action_taken || '');
        });
    });
}

async function loadReports() {
    const tableBody = document.getElementById('reportsTableBody');

    if (!tableBody) {
        return;
    }

    try {
        renderReportsTable(await API.get(`/api/reports${getReportFilterQuery()}`));
    } catch (error) {
        tableBody.innerHTML = '<tr><td class="empty-row" colspan="11">No se pudieron cargar los reportes</td></tr>';
    }
}

function renderFollowUpReports(reports) {
    const reportList = document.getElementById('followUpReportList');

    if (!reportList) {
        return;
    }

    if (!reports.length) {
        reportList.innerHTML = `
            <article class="report-card">
                <p class="report-desc">No hay equipos con hallazgos pendientes de seguimiento.</p>
            </article>
        `;
        return;
    }

    reportList.innerHTML = reports.map((item) => {
        const comments = (item.comments || '').trim();

        return `
            <article class="report-card">
                <div class="report-card-top">
                    <div>
                        <span class="report-title">${escapeHtml(item.equipment_key)} - ${escapeHtml(item.equipment_name)}</span>
                        <span class="report-area-label">Área: ${escapeHtml(item.area || '-')}</span>
                    </div>
                    <span class="report-days">${escapeHtml(formatRelativeDate(item.date))}</span>
                </div>
                <p class="report-desc">
                    ${item.equipment_stopped
                        ? 'Equipo parado, sin valores registrados'
                        : `Temperatura: ${escapeHtml(item.temperature)} °C · Corriente: ${escapeHtml(item.current)} A${item.nominal_current ? ` · Nominal: ${escapeHtml(item.nominal_current)} A` : ''}`}
                    ${comments ? `<br>Comentarios: ${escapeHtml(comments)}` : ''}
                </p>
                <div class="report-flags">
                    ${getReportFindings(item).map((finding) => `
                        <span class="report-flag ${finding.className}">${escapeHtml(finding.label)}</span>
                    `).join('')}
                </div>
                <button class="btn-table-action report-action-btn" type="button" data-close-report="${item.id}">
                    Atender
                </button>
            </article>
        `;
    }).join('');

    reportList.querySelectorAll('[data-close-report]').forEach((button) => {
        button.addEventListener('click', () => saveReportAction(button.dataset.closeReport));
    });
}

async function loadFollowUpReports() {
    const reportList = document.getElementById('followUpReportList');

    if (!reportList) {
        return;
    }

    try {
        const area = document.getElementById('reportAreaSelect')?.value || '';
        const query = area ? `?area=${encodeURIComponent(area)}` : '';
        renderFollowUpReports(await API.get(`/api/follow-up-reports${query}`));
    } catch (error) {
        reportList.innerHTML = `
            <article class="report-card">
                <p class="report-desc">No se pudieron cargar los reportes de seguimiento.</p>
            </article>
        `;
    }
}

async function refreshEquipmentDatabase() {
    const equipment = await loadEquipment();
    renderEquipment(equipment);
    await loadDailyReadings();
    await loadFollowUpReports();
    await loadReports();
    await loadReviewQuery(true);
    await loadReviewQuery(false);
}

function getSelectedUserPermissions() {
    return [...document.querySelectorAll('[data-user-permission]:checked')]
        .map((input) => input.value);
}

function setSelectedUserPermissions(permissions) {
    document.querySelectorAll('[data-user-permission]').forEach((input) => {
        input.checked = permissions.includes(input.value);
    });
}

function renderUserPermissionInputs() {
    const container = document.getElementById('userPermissions');

    if (!container) {
        return;
    }

    container.innerHTML = Object.entries(PERMISSION_LABELS).map(([permission, label]) => `
        <label class="inline-check permission-check">
            <input type="checkbox" value="${escapeHtml(permission)}" data-user-permission>
            <span>${escapeHtml(label)}</span>
        </label>
    `).join('');
}

function resetUserForm() {
    const form = document.getElementById('userForm');

    if (!form) {
        return;
    }

    form.reset();
    document.getElementById('userId').value = '';
    document.getElementById('userRole').value = 'viewer';
    document.getElementById('userPassword').required = true;
    document.getElementById('userPassword').placeholder = 'Contraseña';
    document.getElementById('userSubmitBtn').textContent = 'Guardar usuario';
    document.getElementById('userCancelBtn').style.display = 'none';
    setSelectedUserPermissions(ROLE_PERMISSIONS.viewer);
}

function setUserFormMode(user) {
    document.getElementById('userId').value = user.id;
    document.getElementById('userUsername').value = user.username || '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').required = false;
    document.getElementById('userPassword').placeholder = 'Nueva contraseña (opcional)';
    document.getElementById('userRole').value = user.role || 'viewer';
    document.getElementById('userSubmitBtn').textContent = 'Actualizar usuario';
    document.getElementById('userCancelBtn').style.display = 'inline-block';
    setSelectedUserPermissions(user.permissions || ROLE_PERMISSIONS[user.role] || []);
}

function renderUsers(users) {
    const tableBody = document.getElementById('usersTableBody');

    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = users.length
        ? users.map((user) => `
            <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.role)}</td>
                <td>
                    <div class="permission-tags">
                        ${(user.permissions || []).map((permission) => `
                            <span>${escapeHtml(PERMISSION_LABELS[permission] || permission)}</span>
                        `).join('')}
                    </div>
                </td>
                <td>
                    <button class="btn-table-action" type="button" data-edit-user="${user.id}">
                        Editar
                    </button>
                </td>
            </tr>
        `).join('')
        : '<tr><td class="empty-row" colspan="4">Sin usuarios registrados</td></tr>';

    document.querySelectorAll('[data-edit-user]').forEach((button) => {
        button.addEventListener('click', () => {
            const user = users.find((item) => String(item.id) === String(button.dataset.editUser));

            if (user) {
                setUserFormMode(user);
            }
        });
    });
}

async function loadUsers() {
    const tableBody = document.getElementById('usersTableBody');

    if (!tableBody) {
        return;
    }

    try {
        renderUsers(await API.get('/api/users'));
    } catch (error) {
        tableBody.innerHTML = '<tr><td class="empty-row" colspan="4">No se pudieron cargar los usuarios</td></tr>';
    }
}

function initUserManagement(user) {
    const form = document.getElementById('userForm');
    const usersNavItem = document.querySelector('.nav-item[data-page="users"]');

    if (!form) {
        return;
    }

    renderUserPermissionInputs();
    resetUserForm();

    if (!user.permissions?.includes('users:read')) {
        usersNavItem?.remove();
        return;
    }

    if (!user.permissions?.includes('users:create')) {
        form.style.display = 'none';
    }

    document.getElementById('userRole')?.addEventListener('change', (event) => {
        setSelectedUserPermissions(ROLE_PERMISSIONS[event.target.value] || ROLE_PERMISSIONS.viewer);
    });

    document.getElementById('applyRolePermissions')?.addEventListener('click', () => {
        const role = document.getElementById('userRole').value;
        setSelectedUserPermissions(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer);
    });

    document.getElementById('userCancelBtn')?.addEventListener('click', resetUserForm);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const userId = document.getElementById('userId').value;
        const password = document.getElementById('userPassword').value;
        const payload = {
            username: document.getElementById('userUsername').value.trim(),
            role: document.getElementById('userRole').value,
            permissions: getSelectedUserPermissions()
        };

        if (password) {
            payload.password = password;
        }

        try {
            if (userId) {
                await API.put(`/api/users/${userId}`, payload);
                showAlert('Usuario actualizado', 'success');
            } else {
                await API.post('/api/users', payload);
                showAlert('Usuario creado', 'success');
            }

            resetUserForm();
            await loadUsers();
        } catch (error) {
            showAlert(error.message || 'No se pudo guardar el usuario', 'error');
        }
    });

    loadUsers();
}

function initEquipmentDatabase(user) {
    const equipmentForm = document.getElementById('equipmentForm');

    if (equipmentForm && !user.permissions?.includes('motors:create')) {
        equipmentForm.style.display = 'none';
    }

    document.getElementById('equipmentAreaFilter')?.addEventListener('change', async () => {
        renderEquipment(await loadEquipment());
    });
    document.getElementById('equipmentTypeFilter')?.addEventListener('change', async () => {
        renderEquipment(await loadEquipment());
    });

    document.getElementById('equipmentCancelBtn')?.addEventListener('click', resetEquipmentForm);
    document.getElementById('readingArea')?.addEventListener('change', refreshReviewEquipmentOptions);
    document.getElementById('criticalReadingArea')?.addEventListener('change', refreshReviewEquipmentOptions);
    document.getElementById('currentReadingArea')?.addEventListener('change', refreshReviewEquipmentOptions);
    document.getElementById('criticalCurrentArea')?.addEventListener('change', refreshReviewEquipmentOptions);

    refreshEquipmentDatabase().catch((error) => {
        showAlert(error.message || 'Error al cargar equipos', 'error');
    });

    equipmentForm?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const equipmentId = document.getElementById('equipmentId').value;
        const payload = {
            equipment_key: document.getElementById('equipmentKey').value,
            name: document.getElementById('equipmentName').value,
            area: document.getElementById('equipmentArea').value,
            nominal_current: document.getElementById('equipmentNominalCurrent').value,
            critical: document.getElementById('equipmentCritical').checked,
            active: document.getElementById('equipmentActive').checked
        };

        try {
            if (equipmentId) {
                await API.put(`/api/equipment/${equipmentId}`, payload);
            } else {
                await API.post('/api/equipment', payload);
            }

            resetEquipmentForm();
            await refreshEquipmentDatabase();
            showPage('equipment');
            showAlert(equipmentId ? 'Equipo actualizado' : 'Equipo guardado', 'success');
        } catch (error) {
            showAlert(error.message || 'Error al guardar equipo', 'error');
        }
    });

    setupReadingForm({
        formId: 'dailyReadingForm',
        areaId: 'readingArea',
        equipmentId: 'readingEquipment',
        stoppedId: 'readingStopped',
        temperatureId: 'readingTemperature',
        vibrationId: 'readingVibration',
        noiseId: 'readingNoise',
        cleaningId: 'readingCleaning',
        commentsId: 'readingComments',
        page: 'general'
    });

    setupCurrentForm({
        formId: 'currentReadingForm',
        areaId: 'currentReadingArea',
        equipmentId: 'currentReadingEquipment',
        currentId: 'currentReadingValue',
        page: 'general'
    });

    setupReadingForm({
        formId: 'criticalReadingForm',
        areaId: 'criticalReadingArea',
        equipmentId: 'criticalReadingEquipment',
        stoppedId: 'criticalReadingStopped',
        temperatureId: 'criticalReadingTemperature',
        vibrationId: 'criticalReadingVibration',
        noiseId: 'criticalReadingNoise',
        cleaningId: 'criticalReadingCleaning',
        commentsId: 'criticalReadingComments',
        page: 'critical'
    });

    setupCurrentForm({
        formId: 'criticalCurrentForm',
        areaId: 'criticalCurrentArea',
        equipmentId: 'criticalCurrentEquipment',
        currentId: 'criticalCurrentValue',
        page: 'critical'
    });
}

function setupReadingForm(config) {
    const form = document.getElementById(config.formId);

    if (!form) {
        return;
    }

    const stoppedInput = document.getElementById(config.stoppedId);
    const temperatureInput = document.getElementById(config.temperatureId);

    stoppedInput?.addEventListener('change', () => {
        const stopped = stoppedInput.checked;
        temperatureInput.required = !stopped;
        temperatureInput.disabled = stopped;

        if (stopped) {
            temperatureInput.value = '';
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
            const stopped = document.getElementById(config.stoppedId).checked;
            const equipmentId = document.getElementById(config.equipmentId).value;

            if (!equipmentId) {
                showAlert('Selecciona un equipo del área indicada', 'error');
                return;
            }

            await API.post('/api/daily-readings', {
                motor_id: equipmentId,
                reading_section: 'physical',
                equipment_stopped: stopped,
                temperature: stopped ? null : Number(document.getElementById(config.temperatureId).value),
                vibration: document.getElementById(config.vibrationId).checked,
                noise: document.getElementById(config.noiseId).checked,
                cleaning_required: document.getElementById(config.cleaningId).checked,
                comments: document.getElementById(config.commentsId).value
            });

            form.reset();
            document.getElementById(config.areaId).value = '';
            refreshReviewEquipmentOptions();
            temperatureInput.required = true;
            temperatureInput.disabled = false;
            await loadDailyReadings();
            await loadFollowUpReports();
            await loadReports();
            await loadReviewQuery(true);
            await loadReviewQuery(false);
            showPage(config.page);
            showAlert('Revisión física guardada', 'success');
        } catch (error) {
            showAlert(error.message || 'Error al guardar revisión física', 'error');
        }
    });
}

function setupCurrentForm(config) {
    const form = document.getElementById(config.formId);

    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const equipmentId = document.getElementById(config.equipmentId).value;

        if (!equipmentId) {
            showAlert('Selecciona un equipo del área indicada', 'error');
            return;
        }

        try {
            await API.post('/api/daily-readings', {
                motor_id: equipmentId,
                reading_section: 'current',
                current: Number(document.getElementById(config.currentId).value)
            });

            form.reset();
            document.getElementById(config.areaId).value = '';
            refreshReviewEquipmentOptions();
            await loadDailyReadings();
            await loadFollowUpReports();
            await loadReports();
            await loadReviewQuery(true);
            await loadReviewQuery(false);
            showPage(config.page);
            showAlert('Corriente guardada', 'success');
        } catch (error) {
            showAlert(error.message || 'Error al guardar corriente', 'error');
        }
    });
}

function setEquipmentFormMode(item) {
    document.getElementById('equipmentId').value = item.id;
    document.getElementById('equipmentKey').value = item.equipment_key || '';
    document.getElementById('equipmentName').value = item.name || '';
    document.getElementById('equipmentArea').value = item.area || '';
    document.getElementById('equipmentNominalCurrent').value = item.nominal_current ?? '';
    document.getElementById('equipmentCritical').checked = Boolean(item.critical);
    document.getElementById('equipmentActive').checked = Boolean(item.active);
    document.getElementById('equipmentSubmitBtn').textContent = 'Actualizar equipo';
    document.getElementById('equipmentCancelBtn').style.display = 'inline-block';
    showPage('equipment');
}

function resetEquipmentForm() {
    const equipmentForm = document.getElementById('equipmentForm');

    if (!equipmentForm) {
        return;
    }

    equipmentForm.reset();
    document.getElementById('equipmentId').value = '';
    document.getElementById('equipmentActive').checked = true;
    document.getElementById('equipmentSubmitBtn').textContent = 'Guardar equipo';
    document.getElementById('equipmentCancelBtn').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    initDashboard();
});
