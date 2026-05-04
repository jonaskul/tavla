import client from './client'

export const getPanels = (propertyId) =>
  client.get('/panels/', { params: { property_id: propertyId } }).then((r) => r.data)

export const getPanel = (id) =>
  client.get(`/panels/${id}`).then((r) => r.data)

export const createPanel = (data) =>
  client.post('/panels/', data).then((r) => r.data)

export const updatePanel = (id, data) =>
  client.put(`/panels/${id}`, data).then((r) => r.data)

export const deletePanel = (id) =>
  client.delete(`/panels/${id}`)
