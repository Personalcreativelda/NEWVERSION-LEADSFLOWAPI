import axios from 'axios';
import { withOfflineCache } from '../../lib/axiosOffline';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const baseURL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

const api = withOfflineCache(axios.create({ baseURL, headers: { 'Content-Type': 'application/json' } }));

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('leadflow_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Mensagem de erro da API (já em português) em vez do "Request failed with status code 400"
api.interceptors.response.use(undefined, (error) => {
  const message = error?.response?.data?.error;
  if (message) error.message = message;
  return Promise.reject(error);
});

export interface WaChannel { id: string; name: string; status: string; phone: string | null; has_account: boolean }

export interface WaPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
  verification?: string;
  platform?: string;
  name_status?: string;
  messaging_limit?: string;
  status?: string;
  in_use: boolean;
}

export interface WaOverview {
  account: { id: string; name: string; currency?: string; review_status?: string; business_verification?: string };
  phone_numbers: WaPhoneNumber[];
}

export interface WaProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  profile_picture_url?: string;
}

export interface WaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
}

export interface WaTemplate {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | string;
  category: string;
  language: string;
  components: WaTemplateComponent[];
  rejected_reason: string | null;
  quality: string | null;
}

export interface NewTemplate {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  header?: string;
  body: string;
  examples?: string[];
  footer?: string;
  buttons?: { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone?: string }[];
}

export const whatsappBusinessApi = {
  channels: () => api.get<WaChannel[]>('/whatsapp-business/channels').then((r) => r.data),
  overview: (channelId: string) => api.get<WaOverview>(`/whatsapp-business/${channelId}/overview`).then((r) => r.data),
  profile: (channelId: string) => api.get<WaProfile>(`/whatsapp-business/${channelId}/profile`).then((r) => r.data),
  updateProfile: (channelId: string, profile: WaProfile) =>
    api.put<WaProfile>(`/whatsapp-business/${channelId}/profile`, profile).then((r) => r.data),
  requestCode: (channelId: string, phoneId: string, method: 'SMS' | 'VOICE') =>
    api.post(`/whatsapp-business/${channelId}/numbers/${phoneId}/request-code`, { method }),
  verifyCode: (channelId: string, phoneId: string, code: string) =>
    api.post(`/whatsapp-business/${channelId}/numbers/${phoneId}/verify-code`, { code }),
  register: (channelId: string, phoneId: string, pin: string) =>
    api.post(`/whatsapp-business/${channelId}/numbers/${phoneId}/register`, { pin }),
  useNumber: (channelId: string, phoneId: string) => api.put(`/whatsapp-business/${channelId}/numbers/${phoneId}/use`),
  templates: (channelId: string) => api.get<WaTemplate[]>(`/whatsapp-business/${channelId}/templates`).then((r) => r.data),
  createTemplate: (channelId: string, template: NewTemplate) =>
    api.post<WaTemplate>(`/whatsapp-business/${channelId}/templates`, template).then((r) => r.data),
  deleteTemplate: (channelId: string, name: string, id?: string) =>
    api.delete(`/whatsapp-business/${channelId}/templates/${encodeURIComponent(name)}`, { params: id ? { id } : undefined }),
};
