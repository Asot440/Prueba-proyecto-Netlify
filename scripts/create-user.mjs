import { createUserInState, getState, publicUser, updateState } from '../lib/monitoring-data.mjs';

function getArg(name) {
    const arg = process.argv.find((item) => item.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
}

async function main() {
    const username = getArg('username');
    const password = getArg('password');
    const role = getArg('role') || 'viewer';
    const permissionsArg = getArg('permissions');
    const permissions = permissionsArg
        ? permissionsArg.split(',').map((item) => item.trim()).filter(Boolean)
        : undefined;

    if (!username || !password) {
        console.error('Uso: npm run create-user -- --username=juan --password=Secreta123 --role=technician');
        process.exitCode = 1;
        return;
    }

    const created = await updateState(async (state) => createUserInState(state, {
        username,
        password,
        role,
        permissions
    }));

    console.log('Usuario creado:', created.result.username);
    console.log('Rol:', created.result.role);
    console.log('Permisos:', created.result.permissions.join(', '));

    const state = await getState();
    const user = state.users.find((item) => item.username === username);

    if (user) {
        console.log('Id:', publicUser(user).id);
    }
}

main().catch((error) => {
    console.error(error.message || 'No se pudo crear el usuario.');
    process.exitCode = 1;
});
