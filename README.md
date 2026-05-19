# Proyecto listo para Netlify

Este proyecto ahora usa:

- `public/` para los archivos estaticos
- `netlify/functions/api.mjs` para la API en `/api/*`
- `@netlify/blobs` para persistencia en produccion
- `data/bootstrap.json` como semilla inicial migrada desde tu SQLite
- `data/local-store.json` como almacenamiento local de desarrollo

## Comandos

```bash
npm install
npm run create-user -- --username=juan --password=Secreta123 --role=technician
```

Para desarrollo local con experiencia similar a Netlify, usa `netlify dev`.

## Despliegue en Netlify

1. Sube este repositorio a GitHub, GitLab o Bitbucket.
2. Crea un nuevo sitio en Netlify conectando el repositorio.
3. Netlify detectara `netlify.toml` y publicara `public/` junto con la funcion `netlify/functions/api.mjs`.
4. La primera ejecucion copiara `data/bootstrap.json` hacia el store de Netlify Blobs si el store esta vacio.

## Variables utiles para scripts fuera de Netlify

Si quieres que scripts locales escriban directamente en Netlify Blobs, define:

- `NETLIFY_BLOBS_SITE_ID`
- `NETLIFY_BLOBS_TOKEN`

Si no existen, los scripts trabajaran sobre `data/local-store.json`.
