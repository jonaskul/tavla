import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getModuleTypes } from '../api/client'

const ModuleTypesContext = createContext(null)

export function ModuleTypesProvider({ children }) {
  const { data: types = [] } = useQuery({
    queryKey: ['module_types'],
    queryFn: getModuleTypes,
    staleTime: 60_000,
  })

  const byKey = Object.fromEntries(types.map((t) => [t.key, t]))

  return (
    <ModuleTypesContext.Provider value={{ types, byKey }}>
      {children}
    </ModuleTypesContext.Provider>
  )
}

export function useModuleTypes() {
  return useContext(ModuleTypesContext) ?? { types: [], byKey: {} }
}
