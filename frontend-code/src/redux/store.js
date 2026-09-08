import { configureStore } from '@reduxjs/toolkit'
import authReducer from '../pages/Auth/AuthSlice'

export const store = configureStore({
  reducer: {
    authStore: authReducer,
  },
})
