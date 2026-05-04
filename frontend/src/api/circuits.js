import client from './client'

export const getCircuits = (panelId) =>
  client.get('/circuits/', { params: { panel_id: panelId } }).then((r) => r.data)

export const getCircuit = (id) =>
  client.get(`/circuits/${id}`).then((r) => r.data)

export const createCircuit = (data) =>
  client.post('/circuits/', data).then((r) => r.data)

export const updateCircuit = (id, data) =>
  client.put(`/circuits/${id}`, data).then((r) => r.data)

export const deleteCircuit = (id) =>
  client.delete(`/circuits/${id}`)
