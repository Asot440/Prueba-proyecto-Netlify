import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import { getStore } from '@netlify/blobs';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, '..');
const dataDirectory = path.join(projectRoot, 'data');
const bootstrapPath = path.join(dataDirectory, 'bootstrap.json');
const localStatePath = path.join(dataDirectory, 'local-store.json');

const STORE_NAME = 'motor-monitoring';
const STATE_KEY = 'app-state';
const BCRYPT_ROUNDS = 12;

export const ALLOWED_AREAS = ['Central de pastas', 'MÃ¡quina no. 2', 'MÃ¡quina no. 3'];

export const ROLE_PERMISSIONS = {
    admin: [
        'users:create',
        'users:read',
        'motors:create',
        'motors:read',
        'inspections:create',
        'reports:read'
    ],
    supervisor: [
        'users:read',
        'motors:create',
        'motors:read',
        'inspections:create',
        'reports:read'
    ],
    technician: [
        'motors:read',
        'inspections:create'
    ],
    viewer: [
        'motors:read',
        'reports:read'
    ]
};

function readEnv(name) {
    return globalThis.Netlify?.env?.get?.(name) ?? process.env[name];
}

function useBlobStore() {
    return Boolean(
        globalThis.Netlify?.env
        || readEnv('NETLIFY')
        || readEnv('CONTEXT')
        || (readEnv('NETLIFY_BLOBS_SITE_ID') && readEnv('NETLIFY_BLOBS_TOKEN'))
    );
}

function getBlobStore() {
    const siteID = readEnv('NETLIFY_BLOBS_SITE_ID') || readEnv('NETLIFY_SITE_ID') || readEnv('SITE_ID');
    const token = readEnv('NETLIFY_BLOBS_TOKEN') || readEnv('NETLIFY_AUTH_TOKEN');
    const options = {
        name: STORE_NAME,
        consistency: 'strong'
    };

    if (siteID) {
        options.siteID = siteID;
    }

    if (token) {
        options.token = token;
    }

    return getStore(options);
}

function normalizeRole(role) {
    return ROLE_PERMISSIONS[role] ? role : 'viewer';
}

export function normalizeArea(area) {
    const areaMap = {
        'Maquina 2': 'MÃ¡quina no. 2',
        'MÃ¡quina 2': 'MÃ¡quina no. 2',
        'Maquina no. 2': 'MÃ¡quina no. 2',
        'Maquina 3': 'MÃ¡quina no. 3',
        'MÃ¡quina 3': 'MÃ¡quina no. 3',
        'Maquina no. 3': 'MÃ¡quina no. 3',
        'Central de pastas': 'Central de pastas'
    };

    return areaMap[area] || area;
}

function normalizePermissions(role, permissions) {
    if (Array.isArray(permissions) && permissions.length > 0) {
        return permissions;
    }

    return ROLE_PERMISSIONS[normalizeRole(role)];
}

function parsePermissions(value, role) {
    if (Array.isArray(value)) {
        return normalizePermissions(role, value);
    }

    try {
        return normalizePermissions(role, JSON.parse(value || '[]'));
    } catch {
        return ROLE_PERMISSIONS[normalizeRole(role)];
    }
}

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalizeUserRecord(user = {}) {
    const role = normalizeRole(user.role);

    return {
        id: Number(user.id) || 0,
        username: String(user.username || '').trim(),
        password_hash: String(user.password_hash || ''),
        role,
        permissions: parsePermissions(user.permissions, role)
    };
}

function normalizeMotorRecord(motor = {}) {
    return {
        id: Number(motor.id) || 0,
        equipment_key: String(motor.equipment_key || '').trim().toUpperCase(),
        name: String(motor.name || '').trim(),
        area: normalizeArea(String(motor.area || '').trim()),
        nominal_current: toNumberOrNull(motor.nominal_current),
        critical: motor.critical ? 1 : 0,
        active: motor.active === 0 ? 0 : 1
    };
}

function normalizeInspectionRecord(inspection = {}) {
    return {
        id: Number(inspection.id) || 0,
        user_id: Number(inspection.user_id) || 0,
        date: String(inspection.date || '')
    };
}

function normalizeInspectionDetailRecord(detail = {}) {
    return {
        id: Number(detail.id) || 0,
        inspection_id: Number(detail.inspection_id) || 0,
        motor_id: Number(detail.motor_id) || 0,
        temperature: toNumberOrNull(detail.temperature),
        current: toNumberOrNull(detail.current),
        dirty: detail.dirty ? 1 : 0,
        noise: detail.noise ? 1 : 0,
        vibration: detail.vibration ? 1 : 0,
        comments: String(detail.comments || ''),
        cleaning_required: detail.cleaning_required ? 1 : 0,
        equipment_stopped: detail.equipment_stopped ? 1 : 0,
        action_taken: String(detail.action_taken || ''),
        finding_closed: detail.finding_closed ? 1 : 0,
        closed_at: detail.closed_at ? String(detail.closed_at) : null,
        closed_by: detail.closed_by ? Number(detail.closed_by) : null,
        current_user_id: detail.current_user_id ? Number(detail.current_user_id) : null,
        current_recorded_at: detail.current_recorded_at ? String(detail.current_recorded_at) : null,
        physical_user_id: detail.physical_user_id ? Number(detail.physical_user_id) : null,
        physical_recorded_at: detail.physical_recorded_at ? String(detail.physical_recorded_at) : null
    };
}

function getNextId(items) {
    return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

async function readJsonFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }

        throw error;
    }
}

async function writeJsonFile(filePath, payload) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function buildBootstrapState() {
    const bootstrap = await readJsonFile(bootstrapPath);
    return normalizeState(bootstrap || {});
}

async function ensureBaselineState(state) {
    const normalized = normalizeState(state || {});
    const adminPermissions = ROLE_PERMISSIONS.admin;
    const admin = normalized.users.find((user) => user.username === 'admin');

    if (!admin) {
        normalized.users.push({
            id: normalized.meta.nextUserId++,
            username: 'admin',
            password_hash: await bcrypt.hash('1234', BCRYPT_ROUNDS),
            role: 'admin',
            permissions: adminPermissions
        });
    } else {
        admin.role = 'admin';
        admin.permissions = adminPermissions;

        if (!admin.password_hash) {
            admin.password_hash = await bcrypt.hash('1234', BCRYPT_ROUNDS);
        }
    }

    if (normalized.motors.length === 0) {
        const defaults = [
            { equipment_key: 'MP2-010', name: 'M.B. Vacio no. 1', area: 'MÃ¡quina no. 2', critical: 1, active: 1 },
            { equipment_key: 'MP2-011', name: 'M.B. Vacio no. 2', area: 'MÃ¡quina no. 2', critical: 1, active: 1 },
            { equipment_key: 'CP-001', name: 'Bomba central de pastas', area: 'Central de pastas', critical: 0, active: 1 }
        ];

        defaults.forEach((motor) => {
            normalized.motors.push(normalizeMotorRecord({
                ...motor,
                id: normalized.meta.nextMotorId++
            }));
        });
    }

    normalized.meta.nextUserId = getNextId(normalized.users);
    normalized.meta.nextMotorId = getNextId(normalized.motors);
    normalized.meta.nextInspectionId = getNextId(normalized.inspections);
    normalized.meta.nextInspectionDetailId = getNextId(normalized.inspectionDetails);
    normalized.meta.updatedAt = new Date().toISOString();

    return normalized;
}

function normalizeState(raw = {}) {
    const state = {
        users: Array.isArray(raw.users) ? raw.users.map(normalizeUserRecord).filter((user) => user.username) : [],
        motors: Array.isArray(raw.motors) ? raw.motors.map(normalizeMotorRecord).filter((motor) => motor.equipment_key && motor.name) : [],
        inspections: Array.isArray(raw.inspections) ? raw.inspections.map(normalizeInspectionRecord).filter((inspection) => inspection.id) : [],
        inspectionDetails: Array.isArray(raw.inspectionDetails) ? raw.inspectionDetails.map(normalizeInspectionDetailRecord).filter((detail) => detail.id) : []
    };

    state.meta = {
        nextUserId: getNextId(state.users),
        nextMotorId: getNextId(state.motors),
        nextInspectionId: getNextId(state.inspections),
        nextInspectionDetailId: getNextId(state.inspectionDetails),
        updatedAt: raw.meta?.updatedAt || null
    };

    return state;
}

async function readState() {
    if (useBlobStore()) {
        const store = getBlobStore();
        const stored = await store.get(STATE_KEY, { type: 'json', consistency: 'strong' });

        if (stored) {
            return ensureBaselineState(stored);
        }

        const seeded = await buildBootstrapState();
        const ensured = await ensureBaselineState(seeded);
        await store.setJSON(STATE_KEY, ensured);
        return ensured;
    }

    const local = await readJsonFile(localStatePath);

    if (local) {
        return ensureBaselineState(local);
    }

    const seeded = await buildBootstrapState();
    const ensured = await ensureBaselineState(seeded);
    await writeJsonFile(localStatePath, ensured);
    return ensured;
}

async function saveState(state) {
    const ensured = await ensureBaselineState(state);

    if (useBlobStore()) {
        const store = getBlobStore();
        await store.setJSON(STATE_KEY, ensured);
        return ensured;
    }

    await writeJsonFile(localStatePath, ensured);
    return ensured;
}

export async function updateState(mutator) {
    const state = await readState();
    const result = await mutator(state);
    const savedState = await saveState(state);
    return { state: savedState, result };
}

export async function getState() {
    return readState();
}

export function publicUser(user) {
    const role = normalizeRole(user.role);

    return {
        id: user.id,
        username: user.username,
        role,
        permissions: parsePermissions(user.permissions, role)
    };
}

export function getLocalDateTime() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 19).replace('T', ' ');
}

export async function createUserInState(state, payload) {
    const username = String(payload.username || '').trim();
    const password = String(payload.password || '');
    const role = normalizeRole(payload.role || 'viewer');

    if (!username || !password) {
        const error = new Error('Usuario y contraseÃ±a son obligatorios');
        error.statusCode = 400;
        throw error;
    }

    if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
        const error = new Error('Ese usuario ya existe');
        error.statusCode = 409;
        throw error;
    }

    const user = {
        id: state.meta.nextUserId++,
        username,
        password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        role,
        permissions: normalizePermissions(role, payload.permissions)
    };

    state.users.push(user);
    return publicUser(user);
}

export async function updateUserInState(state, userId, payload) {
    const username = String(payload.username || '').trim();

    if (!username) {
        const error = new Error('Usuario obligatorio');
        error.statusCode = 400;
        throw error;
    }

    const user = state.users.find((item) => item.id === Number(userId));

    if (!user) {
        const error = new Error('Usuario no encontrado');
        error.statusCode = 404;
        throw error;
    }

    if (state.users.some((item) => item.id !== user.id && item.username.toLowerCase() === username.toLowerCase())) {
        const error = new Error('Ese usuario ya existe');
        error.statusCode = 409;
        throw error;
    }

    const role = normalizeRole(payload.role || 'viewer');
    user.username = username;
    user.role = role;
    user.permissions = normalizePermissions(role, payload.permissions);

    if (payload.password) {
        user.password_hash = await bcrypt.hash(String(payload.password), BCRYPT_ROUNDS);
    }

    return publicUser(user);
}

export function listEquipmentFromState(state, includeInactive = false) {
    return state.motors
        .filter((motor) => includeInactive || motor.active === 1)
        .sort((left, right) => left.equipment_key.localeCompare(right.equipment_key));
}

export function createEquipmentInState(state, payload) {
    const equipmentKey = String(payload.equipment_key || '').trim().toUpperCase();
    const name = String(payload.name || '').trim();
    const area = normalizeArea(String(payload.area || '').trim());

    if (!equipmentKey || !name) {
        const error = new Error('Clave y nombre del equipo son obligatorios');
        error.statusCode = 400;
        throw error;
    }

    if (!ALLOWED_AREAS.includes(area)) {
        const error = new Error('Ãrea no vÃ¡lida');
        error.statusCode = 400;
        throw error;
    }

    if (state.motors.some((item) => item.equipment_key === equipmentKey)) {
        const error = new Error('Ya existe un equipo con esa clave');
        error.statusCode = 409;
        throw error;
    }

    const motor = normalizeMotorRecord({
        id: state.meta.nextMotorId++,
        equipment_key: equipmentKey,
        name,
        area,
        nominal_current: payload.nominal_current,
        critical: payload.critical ? 1 : 0,
        active: 1
    });

    state.motors.push(motor);
    return motor;
}

export function updateEquipmentInState(state, equipmentId, payload) {
    const motor = state.motors.find((item) => item.id === Number(equipmentId));

    if (!motor) {
        const error = new Error('Equipo no encontrado');
        error.statusCode = 404;
        throw error;
    }

    const equipmentKey = String(payload.equipment_key || '').trim().toUpperCase();
    const name = String(payload.name || '').trim();
    const area = normalizeArea(String(payload.area || '').trim());

    if (!equipmentKey || !name) {
        const error = new Error('Clave y nombre del equipo son obligatorios');
        error.statusCode = 400;
        throw error;
    }

    if (!ALLOWED_AREAS.includes(area)) {
        const error = new Error('Ãrea no vÃ¡lida');
        error.statusCode = 400;
        throw error;
    }

    if (state.motors.some((item) => item.id !== motor.id && item.equipment_key === equipmentKey)) {
        const error = new Error('Ya existe un equipo con esa clave');
        error.statusCode = 409;
        throw error;
    }

    motor.equipment_key = equipmentKey;
    motor.name = name;
    motor.area = area;
    motor.nominal_current = toNumberOrNull(payload.nominal_current);
    motor.critical = payload.critical ? 1 : 0;
    motor.active = payload.active === 0 || payload.active === false ? 0 : 1;

    return motor;
}

export function deleteEquipmentInState(state, equipmentId) {
    const motorId = Number(equipmentId);
    const motorIndex = state.motors.findIndex((item) => item.id === motorId);

    if (motorIndex === -1) {
        const error = new Error('Equipo no encontrado');
        error.statusCode = 404;
        throw error;
    }

    state.motors.splice(motorIndex, 1);
    state.inspectionDetails = state.inspectionDetails.filter((detail) => detail.motor_id !== motorId);

    const inspectionIdsWithDetails = new Set(state.inspectionDetails.map((detail) => detail.inspection_id));
    state.inspections = state.inspections.filter((inspection) => inspectionIdsWithDetails.has(inspection.id));
}

function buildReadingRows(state) {
    const inspectionsById = new Map(state.inspections.map((inspection) => [inspection.id, inspection]));
    const motorsById = new Map(state.motors.map((motor) => [motor.id, motor]));
    const usersById = new Map(state.users.map((user) => [user.id, user]));

    return state.inspectionDetails.map((detail) => {
        const inspection = inspectionsById.get(detail.inspection_id);
        const motor = motorsById.get(detail.motor_id);

        if (!inspection || !motor) {
            return null;
        }

        const currentUser = detail.current_user_id ? usersById.get(detail.current_user_id) : null;
        const physicalUser = detail.physical_user_id ? usersById.get(detail.physical_user_id) : null;
        const closer = detail.closed_by ? usersById.get(detail.closed_by) : null;
        const recorder = usersById.get(inspection.user_id);
        const overloaded = (
            !detail.equipment_stopped
            && motor.nominal_current !== null
            && detail.current !== null
            && detail.current > motor.nominal_current
        ) ? 1 : 0;

        return {
            id: detail.id,
            date: inspection.date,
            username: recorder?.username || null,
            equipment_key: motor.equipment_key,
            equipment_name: motor.name,
            area: motor.area,
            critical: motor.critical,
            nominal_current: motor.nominal_current,
            temperature: detail.temperature,
            current: detail.current,
            overloaded,
            equipment_stopped: detail.equipment_stopped,
            vibration: detail.vibration,
            noise: detail.noise,
            cleaning_required: detail.cleaning_required || detail.dirty ? 1 : 0,
            comments: detail.comments,
            action_taken: detail.action_taken,
            finding_closed: detail.finding_closed ? 1 : 0,
            closed_at: detail.closed_at,
            closed_by_username: closer?.username || null,
            current_username: currentUser?.username || null,
            physical_username: physicalUser?.username || null
        };
    }).filter(Boolean);
}

function sortByDateDesc(left, right) {
    if (left.date === right.date) {
        return right.id - left.id;
    }

    return right.date.localeCompare(left.date);
}

export function getDailyReadings(state, query = {}) {
    const criticalFilter = query.critical === '1' || query.critical === '0'
        ? Number(query.critical)
        : null;

    return buildReadingRows(state)
        .filter((row) => criticalFilter === null || row.critical === criticalFilter)
        .filter((row) => !query.date || row.date.slice(0, 10) === query.date)
        .filter((row) => !query.area || row.area === query.area)
        .sort(sortByDateDesc)
        .slice(0, 100);
}

function hasFinding(row) {
    return Boolean(
        row.vibration
        || row.noise
        || row.cleaning_required
        || row.overloaded
        || String(row.comments || '').trim()
    );
}

export function getFollowUpReports(state, query = {}) {
    return buildReadingRows(state)
        .filter((row) => hasFinding(row))
        .filter((row) => !row.finding_closed)
        .filter((row) => !query.area || row.area === query.area)
        .sort(sortByDateDesc)
        .slice(0, 50);
}

export function getReports(state, query = {}) {
    return buildReadingRows(state)
        .filter((row) => !row.finding_closed)
        .filter((row) => hasFinding(row))
        .filter((row) => !query.area || row.area === query.area)
        .filter((row) => !query.date || row.date.slice(0, 10) === query.date)
        .filter((row) => {
            switch (query.finding) {
                case 'vibration':
                    return Boolean(row.vibration);
                case 'noise':
                    return Boolean(row.noise);
                case 'cleaning':
                    return Boolean(row.cleaning_required);
                case 'comments':
                    return Boolean(String(row.comments || '').trim());
                case 'overloaded':
                    return Boolean(row.overloaded);
                default:
                    return true;
            }
        })
        .sort(sortByDateDesc);
}

export function closeReportInState(state, reportId, actionTaken, requesterId) {
    const detail = state.inspectionDetails.find((item) => item.id === Number(reportId));

    if (!String(actionTaken || '').trim()) {
        const error = new Error('Describe la acciÃ³n realizada');
        error.statusCode = 400;
        throw error;
    }

    if (!detail) {
        const error = new Error('Reporte no encontrado');
        error.statusCode = 404;
        throw error;
    }

    detail.action_taken = String(actionTaken).trim();
    detail.finding_closed = 1;
    detail.closed_at = getLocalDateTime();
    detail.closed_by = requesterId;
}

export function findActiveEquipment(state, { motor_id, equipment_key }) {
    if (motor_id) {
        return state.motors.find((motor) => motor.id === Number(motor_id) && motor.active === 1) || null;
    }

    if (!equipment_key) {
        return null;
    }

    const normalizedKey = String(equipment_key).trim().toUpperCase();
    return state.motors.find((motor) => motor.equipment_key === normalizedKey && motor.active === 1) || null;
}

export function createOrUpdateDailyReadingInState(state, payload, requester) {
    const equipment = findActiveEquipment(state, payload);

    if (!equipment) {
        const error = new Error('Equipo requerido');
        error.statusCode = 400;
        throw error;
    }

    const stopped = payload.equipment_stopped ? 1 : 0;
    const section = ['current', 'physical', 'full'].includes(payload.reading_section)
        ? payload.reading_section
        : 'full';
    const isCurrentSection = section === 'current';
    const isPhysicalSection = section === 'physical';
    const localDateTime = getLocalDateTime();
    const localDate = localDateTime.slice(0, 10);
    const currentValue = toNumberOrNull(payload.current);
    const temperatureValue = toNumberOrNull(payload.temperature);

    if (isCurrentSection && currentValue === null) {
        const error = new Error('Corriente obligatoria');
        error.statusCode = 400;
        throw error;
    }

    if (isPhysicalSection && !stopped && temperatureValue === null) {
        const error = new Error('Temperatura obligatoria');
        error.statusCode = 400;
        throw error;
    }

    if (!isCurrentSection && !isPhysicalSection && !stopped && (temperatureValue === null || currentValue === null)) {
        const error = new Error('Temperatura y corriente son obligatorias');
        error.statusCode = 400;
        throw error;
    }

    const inspectionById = new Map(state.inspections.map((inspection) => [inspection.id, inspection]));
    const existingDetail = state.inspectionDetails
        .filter((detail) => detail.motor_id === equipment.id)
        .filter((detail) => inspectionById.get(detail.inspection_id)?.date?.slice(0, 10) === localDate)
        .sort((left, right) => right.id - left.id)[0];

    const needsCleaning = payload.cleaning_required !== undefined ? payload.cleaning_required : payload.dirty;

    if (existingDetail) {
        if (isCurrentSection) {
            existingDetail.current = currentValue;
            existingDetail.current_user_id = requester.id;
            existingDetail.current_recorded_at = localDateTime;
        } else if (isPhysicalSection) {
            existingDetail.temperature = stopped ? null : temperatureValue;
            existingDetail.equipment_stopped = stopped;
            existingDetail.dirty = needsCleaning ? 1 : 0;
            existingDetail.cleaning_required = needsCleaning ? 1 : 0;
            existingDetail.noise = payload.noise ? 1 : 0;
            existingDetail.vibration = payload.vibration ? 1 : 0;
            existingDetail.comments = String(payload.comments || '');
            existingDetail.physical_user_id = requester.id;
            existingDetail.physical_recorded_at = localDateTime;
        } else {
            existingDetail.temperature = stopped ? null : temperatureValue;
            existingDetail.current = stopped ? null : currentValue;
            existingDetail.equipment_stopped = stopped;
            existingDetail.dirty = needsCleaning ? 1 : 0;
            existingDetail.cleaning_required = needsCleaning ? 1 : 0;
            existingDetail.noise = payload.noise ? 1 : 0;
            existingDetail.vibration = payload.vibration ? 1 : 0;
            existingDetail.comments = String(payload.comments || '');
            existingDetail.current_user_id = requester.id;
            existingDetail.current_recorded_at = localDateTime;
            existingDetail.physical_user_id = requester.id;
            existingDetail.physical_recorded_at = localDateTime;
        }

        return { success: true, updated: true };
    }

    const inspection = {
        id: state.meta.nextInspectionId++,
        user_id: requester.id,
        date: localDateTime
    };

    state.inspections.push(inspection);

    state.inspectionDetails.push(normalizeInspectionDetailRecord({
        id: state.meta.nextInspectionDetailId++,
        inspection_id: inspection.id,
        motor_id: equipment.id,
        temperature: isCurrentSection ? null : (stopped ? null : temperatureValue),
        current: isPhysicalSection ? null : (stopped ? null : currentValue),
        equipment_stopped: stopped,
        dirty: isCurrentSection ? 0 : (needsCleaning ? 1 : 0),
        cleaning_required: isCurrentSection ? 0 : (needsCleaning ? 1 : 0),
        noise: isCurrentSection ? 0 : (payload.noise ? 1 : 0),
        vibration: isCurrentSection ? 0 : (payload.vibration ? 1 : 0),
        comments: isCurrentSection ? '' : String(payload.comments || ''),
        current_user_id: isPhysicalSection ? null : requester.id,
        current_recorded_at: isPhysicalSection ? null : localDateTime,
        physical_user_id: isCurrentSection ? null : requester.id,
        physical_recorded_at: isCurrentSection ? null : localDateTime
    }));

    return { success: true };
}

export async function authenticateUser(state, username, password) {
    const normalizedUsername = String(username || '').trim();
    const rawPassword = String(password || '');

    if (!normalizedUsername || !rawPassword) {
        const error = new Error('Usuario y contraseÃ±a son obligatorios');
        error.statusCode = 400;
        throw error;
    }

    const user = state.users.find((item) => item.username === normalizedUsername);

    if (!user || !user.password_hash) {
        const error = new Error('Usuario o contraseÃ±a incorrectos');
        error.statusCode = 401;
        throw error;
    }

    const passwordIsValid = await bcrypt.compare(rawPassword, user.password_hash);

    if (!passwordIsValid) {
        const error = new Error('Usuario o contraseÃ±a incorrectos');
        error.statusCode = 401;
        throw error;
    }

    return publicUser(user);
}

export function requirePermission(state, userId, permission) {
    if (!userId) {
        const error = new Error('Usuario requerido');
        error.statusCode = 401;
        throw error;
    }

    const user = state.users.find((item) => item.id === Number(userId));

    if (!user) {
        const error = new Error('Usuario no valido');
        error.statusCode = 401;
        throw error;
    }

    const permissions = parsePermissions(user.permissions, user.role);

    if (!permissions.includes(permission)) {
        const error = new Error('No tienes permiso para esta accion');
        error.statusCode = 403;
        throw error;
    }

    return publicUser(user);
}
