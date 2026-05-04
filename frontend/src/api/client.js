import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export default http

// --- Properties ---
export const getProperties = () => http.get('/properties').then((r) => r.data)
export const getProperty = (id) => http.get(`/properties/${id}`).then((r) => r.data)
export const createProperty = (data) => http.post('/properties', data).then((r) => r.data)
export const updateProperty = (id, data) => http.put(`/properties/${id}`, data).then((r) => r.data)
export const deleteProperty = (id) => http.delete(`/properties/${id}`)

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
  http.get('/connection_points', { params: { circuit_id: circuitId } }).then((r) => r.data)

// --- Equipment ---
export const getEquipment = (circuitId) =>
  http.get('/equipment', { params: { circuit_id: circuitId } }).then((r) => r.data)

// --- Changelog ---
export const getChangelog = (params) =>
  http.get('/changelog', { params }).then((r) => r.data)
export const createChangelogEntry = (data) =>
  http.post('/changelog', data).then((r) => r.data)

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
