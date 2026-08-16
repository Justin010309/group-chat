import axios from 'axios'

export const request = axios.create({ baseURL: '/api/v1', timeout: 10000 })

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('gc_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

request.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gc_token')
      window.location.hash = '#/login'
    }
    return Promise.reject(err.response?.data?.error || err)
  }
)
