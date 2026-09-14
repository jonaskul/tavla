import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  // The session lives in an HttpOnly cookie. Same-origin in development via
  // the Vite proxy and in production behind nginx, but the SaaS deployment
  // serves the frontend and the API from different origins, where the cookie
  // only travels if this is set.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// Registered by RequireAuth. Any 401 from anywhere means the session is no
// longer usable — signed out, expired, or revoked from another device — and
// the gate needs to ask again rather than keep rendering a signed-in app.
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) onUnauthorized()
    return Promise.reject(error)
  },
)

export default http

// --- Properties ---
export const getProperties = () => http.get('/properties').then((r) => r.data)
export const getProperty = (id) => http.get(`/properties/${id}`).then((r) => r.data)
export const createProperty = (data) => http.post('/properties', data).then((r) => r.data)
export const updateProperty = (id, data) => http.put(`/properties/${id}`, data).then((r) => r.data)
export const deleteProperty = (id) => http.delete(`/properties/${id}`)
export const exportProperty = (id) => http.get(`/export/${id}`).then((r) => r.data)

// --- Panels ---
export const getPanels = (propertyId) =>
  http.get(`/properties/${propertyId}/panels`).then((r) => r.data)
export const getPanel = (id) => http.get(`/panels/${id}`).then((r) => r.data)
export const createPanel = (propertyId, data) =>
  http.post(`/properties/${propertyId}/panels`, data).then((r) => r.data)
export const updatePanel = (id, data) => http.put(`/panels/${id}`, data).then((r) => r.data)
export const deletePanel = (id) => http.delete(`/panels/${id}`)

// --- Circuits ---
export const getCircuits = (panelId) =>
  http.get(`/panels/${panelId}/circuits`).then((r) => r.data)
export const getCircuit = (id) => http.get(`/circuits/${id}`).then((r) => r.data)
export const createCircuit = (panelId, data) =>
  http.post(`/panels/${panelId}/circuits`, data).then((r) => r.data)
export const updateCircuit = (id, data) => http.put(`/circuits/${id}`, data).then((r) => r.data)
export const deleteCircuit = (id) => http.delete(`/circuits/${id}`)

// --- ConnectionPoints ---
export const getConnectionPoints = (circuitId) =>
  http.get(`/circuits/${circuitId}/connection_points`).then((r) => r.data)
export const createConnectionPoint = (circuitId, data) =>
  http.post(`/circuits/${circuitId}/connection_points`, data).then((r) => r.data)
export const updateConnectionPoint = (id, data) =>
  http.put(`/connection_points/${id}`, data).then((r) => r.data)
export const deleteConnectionPoint = (id) =>
  http.delete(`/connection_points/${id}`).then((r) => r.data)

// --- Files ---
export const getConnectionPointFiles = (cpId) =>
  http.get(`/connection_points/${cpId}/files`).then((r) => r.data)
export const uploadFile = (cpId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return http.post(`/connection_points/${cpId}/files`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}
export const deleteFile = (id) => http.delete(`/files/${id}`).then((r) => r.data)
export const getFileContentUrl = (id) => `/api/files/${id}/content`

// --- Equipment ---
export const getEquipment = (circuitId) =>
  http.get(`/circuits/${circuitId}/equipment`).then((r) => r.data)
export const createEquipment = (circuitId, data) =>
  http.post(`/circuits/${circuitId}/equipment`, data).then((r) => r.data)
export const updateEquipment = (id, data) =>
  http.put(`/equipment/${id}`, data).then((r) => r.data)
export const deleteEquipment = (id) =>
  http.delete(`/equipment/${id}`).then((r) => r.data)
export const getEquipmentFiles = (equipmentId) =>
  http.get(`/equipment/${equipmentId}/files`).then((r) => r.data)
export const uploadEquipmentFile = (equipmentId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return http.post(`/equipment/${equipmentId}/files`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

// --- Channels ---
export const getChannels = (equipmentId) =>
  http.get(`/equipment/${equipmentId}/channels`).then((r) => r.data)
export const createChannel = (equipmentId, data) =>
  http.post(`/equipment/${equipmentId}/channels`, data).then((r) => r.data)
export const updateChannel = (id, data) =>
  http.put(`/channels/${id}`, data).then((r) => r.data)
export const deleteChannel = (id) =>
  http.delete(`/channels/${id}`).then((r) => r.data)

// --- Changelog ---
export const getChangelog = (params) =>
  http.get('/changelog', { params }).then((r) => r.data)
export const createChangelogEntry = (data) =>
  http.post('/changelog', data).then((r) => r.data)

// --- Module Types ---
export const getModuleTypes = () => http.get('/module_types').then((r) => r.data)
export const createModuleType = (data) => http.post('/module_types', data).then((r) => r.data)
export const updateModuleType = (id, data) => http.put(`/module_types/${id}`, data).then((r) => r.data)
export const deleteModuleType = (id) => http.delete(`/module_types/${id}`).then((r) => r.data)
export const getModuleTypeUsage = (key) => http.get(`/module_types/${key}/usage`).then((r) => r.data)

// --- Modules ---
export const getPanelModules = (panelId) =>
  http.get(`/panels/${panelId}/modules`).then((r) => r.data)
export const getModules = getPanelModules
export const createModule = (panelId, data) =>
  http.post(`/panels/${panelId}/modules`, data).then((r) => r.data)
export const updateModule = (id, data) =>
  http.put(`/modules/${id}`, data).then((r) => r.data)
export const deleteModule = (id) =>
  http.delete(`/modules/${id}`).then((r) => r.data)

// --- Authentication ---
// The session is an HttpOnly cookie, so nothing here handles a token.
export const requestLoginCode = (email) =>
  http.post('/auth/request-code', { email }).then((r) => r.data)
export const verifyLoginCode = (email, code) =>
  http.post('/auth/verify', { email, code }).then((r) => r.data)
export const signOut = () => http.post('/auth/logout').then((r) => r.data)
export const getMe = () => http.get('/auth/me').then((r) => r.data)
