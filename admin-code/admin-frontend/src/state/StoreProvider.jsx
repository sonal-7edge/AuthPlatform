import { useReducer } from 'react'
import { StoreContext, reducer, initialState } from './store.jsx'

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  )
}
