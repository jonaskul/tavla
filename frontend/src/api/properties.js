import client from './client'

export const getProperties = () =>
  client.get('/properties/').then((r) => r.data)

export const getProperty = (id) =>
  client.get(`/properties/${id}`).then((r) => r.data)

export const createProperty = (data) =>
  client.post('/properties/', data).then((r) => r.data)

export const updateProperty = (id, data) =>
  client.put(`/properties/${id}`, data).then((r) => r.data)

export const deleteProperty = (id) =>
  client.delete(`/properties/${id}`)
