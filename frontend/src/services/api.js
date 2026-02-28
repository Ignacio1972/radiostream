import axios from 'axios';

const api = axios.create({
  baseURL: window.location.origin,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('Authentication error');
    }
    return Promise.reject(error);
  }
);

export default api;
