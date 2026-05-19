import {
    authenticateUser,
    closeReportInState,
    createEquipmentInState,
    createOrUpdateDailyReadingInState,
    createUserInState,
    deleteEquipmentInState,
    getDailyReadings,
    getFollowUpReports,
    getReports,
    getState,
    listEquipmentFromState,
    publicUser,
    requirePermission,
    updateEquipmentInState,
    updateState,
    updateUserInState
} from '../../lib/monitoring-data.mjs';

function json(data, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            'Cache-Control': 'no-store'
        }
    });
}

async function parseBody(request) {
    if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
        return {};
    }

    try {
        return await request.json();
    } catch {
        return {};
    }
}

function getRoute(pathname) {
    const route = pathname.startsWith('/api') ? pathname.slice(4) : pathname;
    return route || '/';
}

function getUserId(request, body) {
    return request.headers.get('x-user-id') || body.user_id || null;
}

function errorResponse(error) {
    const status = error.statusCode || 500;
    const message = status === 500 ? 'Error interno del servidor' : error.message;
    return json({ message }, status);
}

export default async (request) => {
    const url = new URL(request.url);
    const route = getRoute(url.pathname);
    const body = await parseBody(request);

    try {
        if (request.method === 'GET' && route === '/health') {
            return json({ status: 'ok', message: 'Servidor funcionando correctamente' });
        }

        if (request.method === 'POST' && route === '/login') {
            const state = await getState();
            const user = await authenticateUser(state, body.username, body.password);
            return json({ success: true, user });
        }

        if (request.method === 'GET' && route === '/users') {
            const state = await getState();
            requirePermission(state, getUserId(request, body), 'users:read');
            return json(state.users.map(publicUser).sort((left, right) => left.username.localeCompare(right.username)));
        }

        if (request.method === 'GET' && route === '/debug/state-summary') {
            const state = await getState();
            requirePermission(state, getUserId(request, body), 'users:read');
            return json({
                users: state.users.length,
                motors: state.motors.length,
                inspections: state.inspections.length,
                inspectionDetails: state.inspectionDetails.length
            });
        }

        if (request.method === 'POST' && route === '/users') {
            const result = await updateState(async (state) => {
                requirePermission(state, getUserId(request, body), 'users:create');
                return createUserInState(state, body);
            });

            return json({ success: true, user: result.result }, 201);
        }

        const userMatch = route.match(/^\/users\/(\d+)$/);

        if (request.method === 'PUT' && userMatch) {
            const result = await updateState(async (state) => {
                requirePermission(state, getUserId(request, body), 'users:create');
                return updateUserInState(state, userMatch[1], body);
            });

            return json({ success: true, user: result.result });
        }

        if (request.method === 'GET' && (route === '/equipment' || route === '/motors')) {
            const state = await getState();
            requirePermission(state, getUserId(request, body), 'motors:read');
            const includeInactive = url.searchParams.get('includeInactive') === '1';
            return json(listEquipmentFromState(state, includeInactive));
        }

        if (request.method === 'POST' && route === '/equipment') {
            const result = await updateState(async (state) => {
                requirePermission(state, getUserId(request, body), 'motors:create');
                return createEquipmentInState(state, body);
            });

            return json({ success: true, equipment: result.result }, 201);
        }

        const equipmentMatch = route.match(/^\/equipment\/(\d+)$/);

        if (request.method === 'PUT' && equipmentMatch) {
            const result = await updateState(async (state) => {
                requirePermission(state, getUserId(request, body), 'motors:create');
                return updateEquipmentInState(state, equipmentMatch[1], body);
            });

            return json({ success: true, equipment: result.result });
        }

        if (request.method === 'DELETE' && equipmentMatch) {
            await updateState(async (state) => {
                requirePermission(state, getUserId(request, body), 'motors:create');
                deleteEquipmentInState(state, equipmentMatch[1]);
                return null;
            });

            return json({ success: true });
        }

        if (request.method === 'GET' && route === '/daily-readings') {
            const state = await getState();
            requirePermission(state, getUserId(request, body), 'reports:read');
            return json(getDailyReadings(state, Object.fromEntries(url.searchParams.entries())));
        }

        if (request.method === 'GET' && route === '/follow-up-reports') {
            const state = await getState();
            requirePermission(state, getUserId(request, body), 'reports:read');
            return json(getFollowUpReports(state, Object.fromEntries(url.searchParams.entries())));
        }

        if (request.method === 'GET' && route === '/reports') {
            const state = await getState();
            requirePermission(state, getUserId(request, body), 'reports:read');
            return json(getReports(state, Object.fromEntries(url.searchParams.entries())));
        }

        const reportCloseMatch = route.match(/^\/reports\/(\d+)\/close$/);

        if (request.method === 'PATCH' && reportCloseMatch) {
            await updateState(async (state) => {
                const requester = requirePermission(state, getUserId(request, body), 'inspections:create');
                closeReportInState(state, reportCloseMatch[1], body.action_taken, requester.id);
                return null;
            });

            return json({ success: true });
        }

        if (request.method === 'POST' && (route === '/daily-readings' || route === '/inspection')) {
            const result = await updateState(async (state) => {
                const requester = requirePermission(state, getUserId(request, body), 'inspections:create');
                return createOrUpdateDailyReadingInState(state, body, requester);
            });

            return json(result.result);
        }

        return json({ message: 'Ruta no encontrada' }, 404);
    } catch (error) {
        return errorResponse(error);
    }
};

export const config = {
    path: '/api/*',
    preferStatic: true
};
