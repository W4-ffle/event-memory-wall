# Event Memory Wall (CW2)

## Structure
- `/frontend` React + Vite + TS (Azure Static Web Apps)
- `/api` Azure Functions Node + TS (REST API)

## Local run
### API
```bash
cd api
cp local.settings.json.example local.settings.json
# fill in values
npm install
npm run start
